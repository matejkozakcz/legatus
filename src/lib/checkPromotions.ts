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

interface ExistingPromotionRequest {
  id: string;
  user_id: string;
  requested_role: PromotionRole;
  status: string;
}

type PromotionRole = "garant" | "budouci_vedouci" | "vedouci";

const PUSH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PROMOTION_NOTIFICATION_TYPE = "promotion_eligible";
const PENDING_STATUS = "pending";
const NOT_ELIGIBLE_STATUS = "not_eligible";
const PROMOTION_ROLES: PromotionRole[] = ["garant", "budouci_vedouci", "vedouci"];

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
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("recipient_id", vedouciId)
    .eq("type", PROMOTION_NOTIFICATION_TYPE)
    .eq("title", title)
    .eq("read", false)
    .limit(1);

  if (existing && existing.length > 0) {
    return;
  }

  const { data: notifData } = await supabase
    .from("notifications")
    .insert({
      sender_id: vedouciId,
      recipient_id: vedouciId,
      type: PROMOTION_NOTIFICATION_TYPE,
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

export async function logPromotionHistory(
  userId: string,
  requestedRole: string,
  event: string,
  cumulativeBj?: number,
  directZiskatels?: number,
  note?: string
): Promise<void> {
  await supabase.from("promotion_history").insert({
    user_id: userId,
    requested_role: requestedRole,
    event,
    cumulative_bj: cumulativeBj ?? null,
    direct_ziskatels: directZiskatels ?? null,
    note: note || null,
  });
}

async function logHistory(
  userId: string,
  requestedRole: PromotionRole,
  event: string,
  cumulativeBj: number,
  directZiskatels: number,
  note?: string
): Promise<void> {
  await logPromotionHistory(userId, requestedRole, event, cumulativeBj, directZiskatels, note);
}

function getRequestKey(userId: string, requestedRole: PromotionRole): string {
  return `${userId}:${requestedRole}`;
}

async function syncPromotionRequest(
  profileId: string,
  requestByKey: Map<string, ExistingPromotionRequest>,
  userId: string,
  requestedRole: PromotionRole,
  eligible: boolean,
  title: string,
  body: string,
  cumulativeBj: number,
  directZiskatels: number
): Promise<void> {
  const key = getRequestKey(userId, requestedRole);
  const existingRequest = requestByKey.get(key);

  if (!eligible) {
    if (existingRequest?.status === PENDING_STATUS) {
      await supabase
        .from("promotion_requests")
        .update({
          status: NOT_ELIGIBLE_STATUS,
          cumulative_bj: cumulativeBj,
          direct_ziskatels: directZiskatels,
        })
        .eq("id", existingRequest.id);

      requestByKey.set(key, {
        ...existingRequest,
        status: NOT_ELIGIBLE_STATUS,
      });

      await logHistory(userId, requestedRole, "not_eligible", cumulativeBj, directZiskatels, "Podmínky přestaly být splněny");

      await supabase
        .from("notifications")
        .delete()
        .eq("recipient_id", profileId)
        .eq("type", PROMOTION_NOTIFICATION_TYPE)
        .eq("title", title)
        .eq("read", false);
    }
    return;
  }

  if (!existingRequest) {
    const { data: inserted } = await supabase
      .from("promotion_requests")
      .insert({
        user_id: userId,
        requested_role: requestedRole,
        status: PENDING_STATUS,
        cumulative_bj: cumulativeBj,
        direct_ziskatels: directZiskatels,
      })
      .select("id, user_id, requested_role, status")
      .single();

    if (inserted) {
      requestByKey.set(key, inserted as ExistingPromotionRequest);
    }

    await logHistory(userId, requestedRole, "eligible", cumulativeBj, directZiskatels, "Podmínky poprvé splněny");
    await ensureNotification(profileId, title, body);
    return;
  }

  if (existingRequest.status === NOT_ELIGIBLE_STATUS) {
    await supabase
      .from("promotion_requests")
      .update({
        status: PENDING_STATUS,
        requested_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        cumulative_bj: cumulativeBj,
        direct_ziskatels: directZiskatels,
      })
      .eq("id", existingRequest.id);

    requestByKey.set(key, {
      ...existingRequest,
      status: PENDING_STATUS,
    });

    await logHistory(userId, requestedRole, "eligible", cumulativeBj, directZiskatels, "Podmínky opět splněny");
    await ensureNotification(profileId, title, body);
    return;
  }

  // Zamítnutá žádost — smaž ji a vytvoř novou (nový pokus o povýšení)
  if (existingRequest.status === "rejected") {
    await supabase
      .from("promotion_requests")
      .delete()
      .eq("id", existingRequest.id);

    const { data: inserted } = await supabase
      .from("promotion_requests")
      .insert({
        user_id: userId,
        requested_role: requestedRole,
        status: PENDING_STATUS,
        cumulative_bj: cumulativeBj,
        direct_ziskatels: directZiskatels,
      })
      .select("id, user_id, requested_role, status")
      .single();

    if (inserted) {
      requestByKey.set(key, inserted as ExistingPromotionRequest);
    }

    await logHistory(userId, requestedRole, "eligible", cumulativeBj, directZiskatels, "Podmínky znovu splněny po zamítnutí");
    await ensureNotification(profileId, title, body);
    return;
  }

  if (existingRequest.status === PENDING_STATUS) {
    await supabase
      .from("promotion_requests")
      .update({
        cumulative_bj: cumulativeBj,
        direct_ziskatels: directZiskatels,
      })
      .eq("id", existingRequest.id);
  }
}

/**
 * Zkontroluje podmínky povýšení pro všechny členy týmu a vytvoří
 * promotion_request + notifikaci Vedoucímu jen při novém nebo znovu obnoveném nároku.
 *
 * Lze volat z libovolné stránky — stačí předat profile vedoucího a seznam členů.
 */
export async function checkPromotions(
  profile: CheckProfile,
  members: CheckMember[]
): Promise<void> {
  if (profile.role !== "vedouci" || members.length === 0) return;

  // Load promotion rules from app_config (with hardcoded fallbacks)
  let rules = {
    ziskatel_to_garant: { min_bj: 1000, min_structure: 2 },
    garant_to_bv: { min_structure: 5, min_direct: 3 },
    bv_to_vedouci: { min_structure: 10, min_direct: 6 },
  };

  try {
    const { data: configRow } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "promotion_rules")
      .single();
    if (configRow?.value) {
      rules = { ...rules, ...(configRow.value as unknown as typeof rules) };
    }
  } catch {
    // fallback to defaults
  }

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

  const { data: existingRequests } = await supabase
    .from("promotion_requests")
    .select("id, user_id, requested_role, status")
    .in("user_id", members.map((m) => m.id))
    .in("requested_role", PROMOTION_ROLES);

  const requestByKey = new Map<string, ExistingPromotionRequest>(
    (existingRequests || []).map((request) => [
      getRequestKey(request.user_id, request.requested_role as PromotionRole),
      request as ExistingPromotionRequest,
    ])
  );

  // ── Získatel → Garant ──
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
      await syncPromotionRequest(
        profile.id,
        requestByKey,
        c.id,
        "garant",
        bj >= rules.ziskatel_to_garant.min_bj && struct >= rules.ziskatel_to_garant.min_structure,
        `${c.full_name} splňuje podmínky pro povýšení na Garanta`,
        `Kumulativní BJ: ${bj} · ${struct} lidí ve struktuře`,
        bj,
        struct
      );
    }
  }

  // ── Garant → Budoucí vedoucí ──
  for (const c of members.filter((m) => m.role === "garant")) {
    const direct = countDirect(c.id);
    const struct = countStructure(c.id);
    await syncPromotionRequest(
      profile.id,
      requestByKey,
      c.id,
      "budouci_vedouci",
      struct >= rules.garant_to_bv.min_structure && direct >= rules.garant_to_bv.min_direct,
      `${c.full_name} splňuje podmínky pro povýšení na Budoucího vedoucího`,
      `${struct} lidí ve struktuře · ${direct} přímých`,
      struct,
      direct
    );
  }

  // ── Budoucí vedoucí → Vedoucí ──
  for (const c of members.filter((m) => m.role === "budouci_vedouci")) {
    const direct = countDirect(c.id);
    const struct = countStructure(c.id);
    await syncPromotionRequest(
      profile.id,
      requestByKey,
      c.id,
      "vedouci",
      struct >= rules.bv_to_vedouci.min_structure && direct >= rules.bv_to_vedouci.min_direct,
      `${c.full_name} splňuje podmínky pro povýšení na Vedoucího`,
      `${struct} lidí ve struktuře · ${direct} přímých`,
      struct,
      direct
    );
  }
}
