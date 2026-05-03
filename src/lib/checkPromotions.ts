import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notifications";

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

const PENDING_STATUS = "pending";
const NOT_ELIGIBLE_STATUS = "not_eligible";
const PROMOTION_ROLES: PromotionRole[] = ["garant", "budouci_vedouci", "vedouci"];

// Fires the 'promotion_eligible' trigger — rules in Admin decide who actually gets notified.
async function ensureNotification(
  _vedouciId: string,
  _title: string,
  _body: string,
  subjectUserId: string,
  requestedRole?: string,
): Promise<void> {
  await sendNotification("promotion_eligible", {
    subjectUserId,
    variables: { new_role: requestedRole ?? "" },
  });
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
    await ensureNotification(profileId, title, body, userId, requestedRole);
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
    await ensureNotification(profileId, title, body, userId, requestedRole);
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
    await ensureNotification(profileId, title, body, userId, requestedRole);
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

// In-flight mutex per vedouci to prevent duplicate concurrent runs from
// Dashboard + SpravaTeam / multiple tabs. Key: vedouci_id.
const inFlightChecks = new Map<string, Promise<void>>();
// Short cross-tab cooldown via localStorage to prevent tight race between tabs.
const CHECK_COOLDOWN_MS = 5000;

function isCoolingDown(vedouciId: string): boolean {
  try {
    const ts = Number(localStorage.getItem(`__promo_check_ts_${vedouciId}`) || 0);
    return Date.now() - ts < CHECK_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markCheckRan(vedouciId: string): void {
  try {
    localStorage.setItem(`__promo_check_ts_${vedouciId}`, String(Date.now()));
  } catch { /* ignore */ }
}

/**
 * Zkontroluje podmínky povýšení pro všechny členy týmu a vytvoří
 * promotion_request + notifikaci Vedoucímu jen při novém nebo znovu obnoveném nároku.
 *
 * Lze volat z libovolné stránky — stačí předat profile vedoucího a seznam členů.
 *
 * Ochrana proti závodům:
 *  1) in-memory mutex (inFlightChecks) – dvě volání ze stejné záložky ve stejný
 *     čas sdílí jeden běžící Promise.
 *  2) cross-tab cooldown (localStorage) – mezi záložkami platí 5s okno, které
 *     zabrání souběhu mezi Dashboardem a SpravaTeam ve dvou tabech.
 */
export async function checkPromotions(
  profile: CheckProfile,
  members: CheckMember[]
): Promise<void> {
  // Vedoucí i Budoucí vedoucí spouštějí check pro svůj podstrom.
  if (!["vedouci", "budouci_vedouci"].includes(profile.role) || members.length === 0) return;

  // In-flight guard: pokud už běží check pro tento profile, počkej na výsledek.
  const existing = inFlightChecks.get(profile.id);
  if (existing) return existing;

  // Cross-tab cooldown: druhý tab nespustí duplicitně hned po prvním.
  if (isCoolingDown(profile.id)) return;

  const run = (async () => {
    try {
      await checkPromotionsInner(profile, members);
    } finally {
      markCheckRan(profile.id);
      inFlightChecks.delete(profile.id);
    }
  })();
  inFlightChecks.set(profile.id, run);
  return run;
}

async function checkPromotionsInner(
  profile: CheckProfile,
  members: CheckMember[]
): Promise<void> {

  // Notification system removed — eligibility events are tracked only via promotion_requests.

  // Load promotion rules from workspace (org_unit) with global fallback via DB function
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("org_unit_id")
    .eq("id", profile.id)
    .single();

  const orgUnitId = (profileRow as any)?.org_unit_id ?? null;

  const { data: rulesRows } = await supabase
    .rpc("get_effective_promotion_rules", { _org_unit_id: orgUnitId });

  const rulesArr = (rulesRows ?? []) as Array<{
    transition: string;
    min_bj: number | null;
    min_structure: number | null;
    min_direct: number | null;
  }>;
  const findRule = (transition: string) => rulesArr.find((r) => r.transition === transition);

  const rules = {
    ziskatel_to_garant: {
      min_bj: findRule("ziskatel_to_garant")?.min_bj ?? 1000,
      min_structure: findRule("ziskatel_to_garant")?.min_structure ?? 2,
    },
    garant_to_bv: {
      min_structure: findRule("garant_to_bv")?.min_structure ?? 5,
      min_direct: findRule("garant_to_bv")?.min_direct ?? 3,
    },
    bv_to_vedouci: {
      min_structure: findRule("bv_to_vedouci")?.min_structure ?? 10,
      min_direct: findRule("bv_to_vedouci")?.min_direct ?? 6,
    },
  };

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
    const visited = new Set<string>();
    const queue = [...(childMap.get(rootId) || [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
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

  const roleLabels: Record<string, string> = {
    garant: "Garanta",
    budouci_vedouci: "Budoucího vedoucího",
    vedouci: "Vedoucího",
  };

  const buildTitleBody = (member: CheckMember, role: PromotionRole, bj: number, struct: number, direct?: number) => {
    return {
      title: `${member.full_name} splňuje podmínky pro povýšení na ${roleLabels[role]}`,
      body: direct != null ? `${struct} lidí ve struktuře · ${direct} přímých` : `Kumulativní BJ: ${bj} · ${struct} lidí ve struktuře`,
    };
  };

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
      const { title, body } = buildTitleBody(c, "garant", bj, struct);
      await syncPromotionRequest(
        profile.id, requestByKey, c.id, "garant",
        bj >= rules.ziskatel_to_garant.min_bj && struct >= rules.ziskatel_to_garant.min_structure,
        title, body, bj, struct
      );
    }
  }

  // ── Garant → Budoucí vedoucí ──
  for (const c of members.filter((m) => m.role === "garant")) {
    const direct = countDirect(c.id);
    const struct = countStructure(c.id);
    const { title, body } = buildTitleBody(c, "budouci_vedouci", struct, struct, direct);
    await syncPromotionRequest(
      profile.id, requestByKey, c.id, "budouci_vedouci",
      struct >= rules.garant_to_bv.min_structure && direct >= rules.garant_to_bv.min_direct,
      title, body, struct, direct
    );
  }

  // ── Budoucí vedoucí → Vedoucí ──
  for (const c of members.filter((m) => m.role === "budouci_vedouci")) {
    const direct = countDirect(c.id);
    const struct = countStructure(c.id);
    const { title, body } = buildTitleBody(c, "vedouci", struct, struct, direct);
    await syncPromotionRequest(
      profile.id, requestByKey, c.id, "vedouci",
      struct >= rules.bv_to_vedouci.min_structure && direct >= rules.bv_to_vedouci.min_direct,
      title, body, struct, direct
    );
  }
}
