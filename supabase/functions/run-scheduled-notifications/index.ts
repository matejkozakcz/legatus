// Scheduled notifications runner.
// Triggered every 15 min by pg_cron. Iterates over notification_rules with schedule_cron,
// checks whether the cron expression matches "now" in Europe/Prague (15-min granularity),
// then runs the appropriate trigger handler that resolves recipients + variables and inserts notifications.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Rule {
  id: string;
  name: string;
  trigger_event: string;
  title_template: string;
  body_template: string;
  icon: string | null;
  accent_color: string | null;
  link_url: string | null;
  recipient_roles: string[];
  recipient_filters: { only_active?: boolean; role_in?: string[] };
  conditions: Record<string, unknown>;
  schedule_cron: string | null;
  schedule_timezone: string;
  last_run_at: string | null;
}

interface Profile {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean | null;
  vedouci_id: string | null;
  garant_id: string | null;
  ziskatel_id: string | null;
}

// ─── Cron parser (5-field, supports * / */N N N-N N,N,N) ──────────────────────

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const [, range, stepStr] = stepMatch;
      const step = parseInt(stepStr, 10);
      let lo = min, hi = max;
      if (range !== "*") {
        const r = range.split("-");
        lo = parseInt(r[0], 10);
        hi = r[1] ? parseInt(r[1], 10) : max;
      }
      for (let v = lo; v <= hi; v += step) if (v === value) return true;
      continue;
    }
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((x) => parseInt(x, 10));
      if (value >= a && value <= b) return true;
      continue;
    }
    if (parseInt(part, 10) === value) return true;
  }
  return false;
}

function cronMatchesNow(cron: string, tz: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minF, hourF, domF, monF, dowF] = parts;

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    minute: "2-digit",
    hour: "2-digit",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());

  const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "0";
  const minute = parseInt(get("minute"), 10);
  const hour = parseInt(get("hour"), 10);
  const day = parseInt(get("day"), 10);
  const month = parseInt(get("month"), 10);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[get("weekday")] ?? 0;

  // Match within current 15-min window (cron may say "0" but we run at :00, :15, :30, :45)
  const minMatch = matchField(minF, minute, 0, 59) ||
    (minute % 15 === 0 && [minute - 1, minute - 2, minute + 1, minute + 2].some((m) => m >= 0 && m <= 59 && matchField(minF, m, 0, 59)));

  return minMatch &&
    matchField(hourF, hour, 0, 23) &&
    matchField(domF, day, 1, 31) &&
    matchField(monF, month, 1, 12) &&
    matchField(dowF, dow, 0, 6);
}

// ─── Template ────────────────────────────────────────────────────────────────

function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
}

// ─── Recipient resolution (server-side, similar to client lib/notifications.ts) ─

async function resolveRecipients(
  sb: ReturnType<typeof createClient>,
  rule: Rule,
  subject: Profile,
): Promise<string[]> {
  const ids = new Set<string>();
  for (const r of rule.recipient_roles ?? []) {
    switch (r) {
      case "self":
        ids.add(subject.id);
        break;
      case "ziskatel":
        if (subject.ziskatel_id) ids.add(subject.ziskatel_id);
        break;
      case "garant":
        if (subject.garant_id) ids.add(subject.garant_id);
        break;
      case "vedouci":
        if (subject.vedouci_id) ids.add(subject.vedouci_id);
        break;
      case "all_vedouci": {
        const { data } = await sb.from("profiles").select("id").eq("role", "vedouci").eq("is_active", true);
        (data || []).forEach((p: { id: string }) => ids.add(p.id));
        break;
      }
      case "all_active": {
        const { data } = await sb.from("profiles").select("id").eq("is_active", true);
        (data || []).forEach((p: { id: string }) => ids.add(p.id));
        break;
      }
    }
  }
  if (ids.size === 0) return [];
  const filters = rule.recipient_filters ?? {};
  const onlyActive = filters.only_active !== false;
  const roleIn = filters.role_in ?? [];
  if (onlyActive || roleIn.length > 0) {
    let q = sb.from("profiles").select("id").in("id", Array.from(ids));
    if (onlyActive) q = q.eq("is_active", true);
    if (roleIn.length > 0) q = q.in("role", roleIn);
    const { data } = await q;
    return (data || []).map((p: { id: string }) => p.id);
  }
  return Array.from(ids);
}

async function insertNotifications(
  sb: ReturnType<typeof createClient>,
  rule: Rule,
  subject: Profile,
  vars: Record<string, unknown>,
) {
  const recipients = await resolveRecipients(sb, rule, subject);
  if (recipients.length === 0) return 0;
  const baseVars = { member_name: subject.full_name, member_role: subject.role, ...vars };
  const title = renderTemplate(rule.title_template, baseVars);
  const body = renderTemplate(rule.body_template, baseVars);

  // Dedup: skip if same (rule_id, recipient, subject) already sent in last 12h
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data: existing } = await sb
    .from("notifications")
    .select("recipient_id, payload")
    .eq("rule_id", rule.id)
    .gte("created_at", since);
  const sent = new Set(
    (existing || [])
      .filter((n: { payload: Record<string, unknown> }) => (n.payload as { subject_id?: string })?.subject_id === subject.id)
      .map((n: { recipient_id: string }) => n.recipient_id),
  );

  const rows = recipients
    .filter((rid) => !sent.has(rid))
    .map((rid) => ({
      recipient_id: rid,
      sender_id: null,
      rule_id: rule.id,
      trigger_event: rule.trigger_event,
      title,
      body,
      icon: rule.icon,
      accent_color: rule.accent_color,
      link_url: rule.link_url,
      payload: { variables: baseVars, subject_id: subject.id, scheduled: true },
    }));
  if (rows.length === 0) return 0;
  const { error } = await sb.from("notifications").insert(rows);
  if (error) {
    console.error("[scheduled] insert failed:", error.message);
    return 0;
  }
  return rows.length;
}

// ─── Trigger handlers ────────────────────────────────────────────────────────

/** scheduled.unrecorded_meetings — meetings older than N days with outcome_recorded=false. */
async function handleUnrecordedMeetings(
  sb: ReturnType<typeof createClient>,
  rule: Rule,
): Promise<number> {
  const days = Number((rule.conditions as { older_than_days?: number })?.older_than_days ?? 1);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data: meetings } = await sb
    .from("client_meetings")
    .select("id, user_id, date, meeting_type, case_name")
    .eq("outcome_recorded", false)
    .eq("cancelled", false)
    .lte("date", cutoffStr);

  if (!meetings || meetings.length === 0) return 0;

  // Group by user
  const byUser = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const arr = byUser.get(m.user_id) ?? [];
    arr.push(m);
    byUser.set(m.user_id, arr);
  }

  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, role, is_active, vedouci_id, garant_id, ziskatel_id")
    .in("id", userIds)
    .eq("is_active", true);

  let total = 0;
  for (const p of (profiles ?? []) as Profile[]) {
    const list = byUser.get(p.id) ?? [];
    total += await insertNotifications(sb, rule, p, {
      count: list.length,
      oldest_date: list.map((m) => m.date).sort()[0],
    });
  }
  return total;
}

/** scheduled.weekly_report — Monday morning summary of last week. */
async function handleWeeklyReport(
  sb: ReturnType<typeof createClient>,
  rule: Rule,
): Promise<number> {
  // Last week range (Mon..Sun in Prague tz, approximated via UTC)
  const today = new Date();
  const day = today.getDay() || 7; // Mon=1..Sun=7
  const lastMon = new Date(today);
  lastMon.setDate(today.getDate() - day - 6);
  const lastSun = new Date(today);
  lastSun.setDate(today.getDate() - day);
  const start = lastMon.toISOString().slice(0, 10);
  const end = lastSun.toISOString().slice(0, 10);

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, role, is_active, vedouci_id, garant_id, ziskatel_id")
    .eq("is_active", true);

  if (!profiles) return 0;

  let total = 0;
  for (const p of profiles as Profile[]) {
    const { data: meetings } = await sb
      .from("client_meetings")
      .select("podepsane_bj, meeting_type, cancelled")
      .eq("user_id", p.id)
      .gte("date", start)
      .lte("date", end);
    const list = (meetings ?? []).filter((m: { cancelled: boolean }) => !m.cancelled);
    const meetingCount = list.length;
    const totalBj = list.reduce(
      (s: number, m: { podepsane_bj: number | null }) => s + Number(m.podepsane_bj ?? 0),
      0,
    );
    if (meetingCount === 0 && totalBj === 0) continue; // skip silent users

    total += await insertNotifications(sb, rule, p, {
      meeting_count: meetingCount,
      total_bj: totalBj,
      week_start: start,
      week_end: end,
    });
  }
  return total;
}

/** scheduled.inactive_3days — no meetings in last 3 days. */
async function handleInactive(
  sb: ReturnType<typeof createClient>,
  rule: Rule,
): Promise<number> {
  const days = Number((rule.conditions as { inactive_days?: number })?.inactive_days ?? 3);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, role, is_active, vedouci_id, garant_id, ziskatel_id")
    .eq("is_active", true)
    .in("role", ["novacek", "ziskatel", "garant", "budouci_vedouci"]);
  if (!profiles) return 0;

  let total = 0;
  for (const p of profiles as Profile[]) {
    const { data: recent } = await sb
      .from("client_meetings")
      .select("id")
      .eq("user_id", p.id)
      .gte("date", cutoffStr)
      .limit(1);
    if (recent && recent.length > 0) continue;
    total += await insertNotifications(sb, rule, p, { inactive_days: days });
  }
  return total;
}

// ─── Entry ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional ?force=rule_id to bypass cron check (manual test)
    const url = new URL(req.url);
    const forceRuleId = url.searchParams.get("force");

    const { data: rules, error } = await sb
      .from("notification_rules")
      .select("*")
      .eq("is_active", true)
      .not("schedule_cron", "is", null);

    if (error) throw error;

    const results: Array<{ rule: string; trigger: string; matched: boolean; inserted: number }> = [];

    for (const rule of (rules ?? []) as Rule[]) {
      const matches = forceRuleId === rule.id ||
        (rule.schedule_cron ? cronMatchesNow(rule.schedule_cron, rule.schedule_timezone || "Europe/Prague") : false);
      if (!matches) {
        results.push({ rule: rule.name, trigger: rule.trigger_event, matched: false, inserted: 0 });
        continue;
      }

      let inserted = 0;
      try {
        switch (rule.trigger_event) {
          case "scheduled.unrecorded_meetings":
            inserted = await handleUnrecordedMeetings(sb, rule);
            break;
          case "scheduled.weekly_report":
            inserted = await handleWeeklyReport(sb, rule);
            break;
          case "scheduled.inactive_days":
            inserted = await handleInactive(sb, rule);
            break;
          default:
            console.warn("[scheduled] unknown trigger:", rule.trigger_event);
        }
        await sb.from("notification_rules").update({ last_run_at: new Date().toISOString() }).eq("id", rule.id);
      } catch (e) {
        console.error(`[scheduled] rule ${rule.name} failed:`, e);
      }
      results.push({ rule: rule.name, trigger: rule.trigger_event, matched: true, inserted });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[scheduled] fatal:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
