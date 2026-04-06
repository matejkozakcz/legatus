import { supabase } from "@/integrations/supabase/client";

interface CheckProfile {
  id: string;
  role: string;
  full_name: string;
}

interface CheckMember {
  id: string;
  role: string;
  full_name: string;
  ziskatel_id: string | null;
}

const PUSH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function sendPush(notificationId: string): Promise<void> {
  try {
    await fetch(PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ notification_id: notificationId }),
    });
  } catch {
    // push delivery je best-effort, chyba sítě neblokuje zbytek
  }
}

async function ensureNotification(
  vedouciId: string,
  title: string,
  body: string
): Promise<void> {
  // Dedup: pokud oznamení se stejným názvem a příjemcem existuje,
  // nevytváříme duplikát, ale push znovu odešleme (retry pro případ neúspěšného doručení)
  const { data: existing } = await supabase
    .from("notifications")
    .select("id, read")
    .eq("recipient_id", vedouciId)
    .eq("type", "promotion_eligible")
    .eq("title", title)
    .limit(1);

  if (existing && existing.length > 0) {
    if (!existing[0].read) {
      // Nepřečtená — pošli push znovu (retry)
      await sendPush(existing[0].id);
      return;
    }
    // Přečtená — smaž starou a vytvoř novou, aby se push odeslal znovu
    await supabase.from("notifications").delete().eq("id", existing[0].id);
  }

  const { data: notifData } = await supabase
    .from("notifications")
    .insert({
      sender_id: vedouciId,
      recipient_id: vedouciId,
      type: "promotion_eligible",
      title,
      body,
      deadline: new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();

  if (notifData?.id) {
    await sendPush(notifData.id);
  }
}

/**
 * Zkontroluje podmínky povýšení pro všechny členy týmu a vytvoří
 * promotion_request + notifikaci Vedoucímu, pokud nejsou dosud vytvořeny.
 *
 * Lze volat z libovolné stránky — stačí předat profile vedoucího a seznam členů.
 */
export async function checkPromotions(
  profile: CheckProfile,
  members: CheckMember[]
): Promise<void> {
  if (profile.role !== "vedouci" || members.length === 0) return;

  // Sestavení mapy potomků dle ziskatel_id
  const childMap = new Map<string, string[]>();
  members.forEach((m) => {
    if (m.ziskatel_id) {
      if (!childMap.has(m.ziskatel_id)) childMap.set(m.ziskatel_id, []);
      childMap.get(m.ziskatel_id)!.push(m.id);
    }
  });

  const countStructure = (rootId: string): number => {
    let total = 0;
    const queue = [...(childMap.get(rootId) || [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      total++;
      queue.push(...(childMap.get(id) || []));
    }
    return total;
  };

  const countDirect = (id: string): number => (childMap.get(id) || []).length;

  // ── Získatel → Garant: 1000 BJ + 2 lidé ve struktuře ──
  const ziskatels = members.filter((m) => m.role === "ziskatel");
  if (ziskatels.length > 0) {
    const ids = ziskatels.map((m) => m.id);

    const { data: meetingBj } = await supabase
      .from("client_meetings")
      .select("user_id, podepsane_bj")
      .in("user_id", ids)
      .eq("cancelled", false);

    const { data: historicalBj } = await supabase
      .from("activity_records")
      .select("user_id, bj")
      .in("user_id", ids)
      .eq("week_start", "2025-12-01");

    const bjByUser = new Map<string, number>();
    (meetingBj || []).forEach((r: any) => {
      bjByUser.set(r.user_id, (bjByUser.get(r.user_id) || 0) + (Number(r.podepsane_bj) || 0));
    });
    (historicalBj || []).forEach((r: any) => {
      bjByUser.set(r.user_id, (bjByUser.get(r.user_id) || 0) + (Number(r.bj) || 0));
    });

    for (const c of ziskatels) {
      const bj = bjByUser.get(c.id) || 0;
      const struct = countStructure(c.id);
      if (bj >= 1000 && struct >= 2) {
        await supabase.from("promotion_requests").upsert(
          { user_id: c.id, requested_role: "garant", status: "pending", cumulative_bj: bj, direct_ziskatels: struct },
          { onConflict: "user_id,requested_role", ignoreDuplicates: true }
        );
        await ensureNotification(
          profile.id,
          `${c.full_name} splňuje podmínky pro povýšení na Garanta`,
          `Kumulativní BJ: ${bj} · ${struct} lidí ve struktuře`
        );
      }
    }
  }

  // ── Garant → Budoucí vedoucí: 5 lidí + 3 přímí ──
  for (const c of members.filter((m) => m.role === "garant")) {
    const direct = countDirect(c.id);
    const struct = countStructure(c.id);
    if (struct >= 5 && direct >= 3) {
      await supabase.from("promotion_requests").upsert(
        { user_id: c.id, requested_role: "budouci_vedouci", status: "pending", direct_ziskatels: direct, cumulative_bj: struct },
        { onConflict: "user_id,requested_role", ignoreDuplicates: true }
      );
      await ensureNotification(
        profile.id,
        `${c.full_name} splňuje podmínky pro povýšení na Budoucího vedoucího`,
        `${struct} lidí ve struktuře · ${direct} přímých`
      );
    }
  }

  // ── Budoucí vedoucí → Vedoucí: 10 lidí + 6 přímích ──
  for (const c of members.filter((m) => m.role === "budouci_vedouci")) {
    const direct = countDirect(c.id);
    const struct = countStructure(c.id);
    if (struct >= 10 && direct >= 6) {
      await supabase.from("promotion_requests").upsert(
        { user_id: c.id, requested_role: "vedouci", status: "pending", direct_ziskatels: direct, cumulative_bj: struct },
        { onConflict: "user_id,requested_role", ignoreDuplicates: true }
      );
      await ensureNotification(
        profile.id,
        `${c.full_name} splňuje podmínky pro povýšení na Vedoucího`,
        `${struct} lidí ve struktuře · ${direct} přímých`
      );
    }
  }
}
