import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

/** YYYY-MM-DD in Europe/Prague */
function pragueDateStr(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    // Use Europe/Prague timezone for all schedule comparisons
    const pragueTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));
    const currentHour = pragueTime.getHours();
    const currentMinute = pragueTime.getMinutes();
    const currentDow = pragueTime.getDay(); // 0=Sunday
    const currentDom = pragueTime.getDate();
    const todayPrague = pragueDateStr(now);

    console.log(`[scheduled-notifications] Prague: ${currentHour}:${String(currentMinute).padStart(2,'0')}, dow=${currentDow}, today=${todayPrague}`);

    // Load all active scheduled rules
    const { data: rules, error: rulesError } = await supabase
      .from("notification_rules")
      .select("*")
      .eq("is_active", true)
      .neq("schedule_type", "event");

    if (rulesError) throw rulesError;
    
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    const ruleResults: any[] = [];

    for (const rule of rules) {
      // Parse schedule_time (HH:MM)
      const [schedHour, schedMin] = (rule.schedule_time || "08:00").split(":").map(Number);

      // Check EXACT minute match (cron runs every minute)
      if (currentHour !== schedHour || currentMinute !== schedMin) continue;

      // Check day constraints (null means "every day")
      if (rule.schedule_type === "weekly" && rule.schedule_day_of_week !== null && currentDow !== rule.schedule_day_of_week) continue;
      if (rule.schedule_type === "monthly" && rule.schedule_day_of_month !== null && currentDom !== rule.schedule_day_of_month) continue;

      console.log(`[scheduled-notifications] Rule "${rule.name}" matched (type=${rule.schedule_type})`);

      // Dedup: skip if already sent TODAY in Prague TZ
      if (rule.last_scheduled_at) {
        const lastDayPrague = pragueDateStr(new Date(rule.last_scheduled_at));
        if (lastDayPrague === todayPrague) {
          console.log(`[scheduled-notifications] Rule "${rule.name}" already sent today (${lastDayPrague}), skipping`);
          continue;
        }
      }

      // Atomic CAS lock: update last_scheduled_at ONLY if it's still the same value we read.
      // This prevents two parallel cron invocations from both proceeding.
      const previousLast = rule.last_scheduled_at;
      let lockQuery = supabase
        .from("notification_rules")
        .update({ last_scheduled_at: now.toISOString() })
        .eq("id", rule.id);
      lockQuery = previousLast === null
        ? lockQuery.is("last_scheduled_at", null)
        : lockQuery.eq("last_scheduled_at", previousLast);
      const { data: lockedRows, error: lockErr } = await lockQuery.select("id");

      if (lockErr) {
        console.error(`[scheduled-notifications] Lock error for "${rule.name}": ${lockErr.message}`);
        continue;
      }
      if (!lockedRows || lockedRows.length === 0) {
        console.log(`[scheduled-notifications] Rule "${rule.name}" lock lost (parallel run), skipping`);
        continue;
      }

      // Get recipients with profile data
      let recipients: { id: string; full_name: string; role: string }[] = [];

      if (rule.recipient_type === "by_role" && rule.recipient_roles?.length > 0) {
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("is_active", true)
          .in("role", rule.recipient_roles);
        if (profErr) console.error(`[scheduled-notifications] Recipients (by_role) error: ${profErr.message}`);
        recipients = profiles || [];
      } else {
        // recipient_type "self" or fallback → all active members
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("is_active", true);
        if (profErr) console.error(`[scheduled-notifications] Recipients (all) error: ${profErr.message}`);
        recipients = profiles || [];
      }

      console.log(`[scheduled-notifications] Rule "${rule.name}" → ${recipients.length} recipients`);

      if (recipients.length === 0) {
        ruleResults.push({ rule: rule.name, recipients: 0, sent: 0 });
        continue;
      }

      // Load global aggregate data
      const globalVars = await loadGlobalVars(supabase, pragueTime);

      // Send notifications per recipient with personalized vars
      const fnUrl = `${supabaseUrl}/functions/v1/send-push`;
      let ruleSent = 0;
      let ruleFailed = 0;

      for (const recipient of recipients) {
        // Load per-user vars (activity, meetings planned this week)
        const userVars = await loadUserVars(supabase, recipient.id, pragueTime);

        const allVars: Record<string, string | number> = {
          ...globalVars,
          ...userVars,
          member_name: recipient.full_name,
          role: recipient.role,
          role_label: ROLE_LABELS[recipient.role] || recipient.role,
        };

        const title = renderTemplate(rule.title_template, allVars);
        const body = renderTemplate(rule.body_template, allVars);

        if (rule.send_in_app) {
          const { data: notifData, error: insErr } = await supabase.from("notifications").insert({
            sender_id: recipient.id,
            recipient_id: recipient.id,
            type: rule.trigger_event || "scheduled",
            title,
            body,
            message: body, // also fill message for backward compat
            deadline: todayPrague,
          }).select("id").single();

          if (insErr) {
            ruleFailed++;
            console.error(`[scheduled-notifications] Insert failed for ${recipient.id} (rule ${rule.name}): ${insErr.message}`);
            continue;
          }

          if (notifData?.id && rule.send_push) {
            await fetch(fnUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({ notification_id: notifData.id }),
            }).catch((e) => console.error(`[scheduled-notifications] Push fetch error: ${e}`));
          }
        }

        ruleSent++;
        totalSent++;
      }

      ruleResults.push({ rule: rule.name, recipients: recipients.length, sent: ruleSent, failed: ruleFailed });
    }

    return new Response(JSON.stringify({ ok: true, sent: totalSent, rules: ruleResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[scheduled-notifications] fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

/**
 * Load per-user variables: their planned activities and personal stats for the current week.
 */
async function loadUserVars(supabase: any, userId: string, pragueNow: Date): Promise<Record<string, string | number>> {
  const weekStart = getWeekStart(pragueNow);

  // Get user's activity record for this week
  const { data: activity } = await supabase
    .from("activity_records")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  // Get user's meetings for today
  const today = `${pragueNow.getFullYear()}-${String(pragueNow.getMonth() + 1).padStart(2, "0")}-${String(pragueNow.getDate()).padStart(2, "0")}`;

  const { data: todayMeetings } = await supabase
    .from("client_meetings")
    .select("id, meeting_type, cancelled")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("cancelled", false);

  const meetings = todayMeetings || [];
  const todayFsa = meetings.filter((m: any) => m.meeting_type === "FSA").length;
  const todayPoh = meetings.filter((m: any) => m.meeting_type === "POH").length;
  const todaySer = meetings.filter((m: any) => m.meeting_type === "SER").length;
  const todayTotal = meetings.length;

  // Get user's profile for goals
  const { data: profile } = await supabase
    .from("profiles")
    .select("personal_bj_goal, monthly_bj_goal")
    .eq("id", userId)
    .maybeSingle();

  const a = activity || {};

  return {
    // Planned values from activity_records
    fsa_planned: a.fsa_planned ?? 0,
    ser_planned: a.ser_planned ?? 0,
    poh_planned: a.poh_planned ?? 0,
    por_planned: a.por_planned ?? 0,
    ref_planned: a.ref_planned ?? 0,
    // Actuals from activity_records
    fsa_actual: a.fsa_actual ?? 0,
    ser_actual: a.ser_actual ?? 0,
    poh_actual: a.poh_actual ?? 0,
    por_actual: a.por_actual ?? 0,
    ref_actual: a.ref_actual ?? 0,
    bj: a.bj ?? 0,
    bj_fsa_actual: a.bj_fsa_actual ?? 0,
    bj_ser_actual: a.bj_ser_actual ?? 0,
    // Today's meetings
    today_fsa: todayFsa,
    today_poh: todayPoh,
    today_ser: todaySer,
    today_meetings: todayTotal,
    // Goals
    personal_bj_goal: profile?.personal_bj_goal ?? 0,
    monthly_bj_goal: profile?.monthly_bj_goal ?? 0,
  };
}

/**
 * Load global aggregate variables across the whole team.
 */
async function loadGlobalVars(supabase: any, pragueNow: Date): Promise<Record<string, string | number>> {
  const weekStart = getWeekStart(pragueNow);

  const { data: weekMeetings } = await supabase
    .from("client_meetings")
    .select("id, meeting_type, podepsane_bj, cancelled")
    .gte("date", weekStart)
    .eq("cancelled", false);

  const meetings = weekMeetings || [];
  const totalBj = meetings.reduce((s: number, m: any) => s + (Number(m.podepsane_bj) || 0), 0);
  const totalFsa = meetings.filter((m: any) => m.meeting_type === "FSA").length;
  const totalSer = meetings.filter((m: any) => m.meeting_type === "SER").length;
  const totalPoh = meetings.filter((m: any) => m.meeting_type === "POH").length;
  const totalMeetings = meetings.length;

  const { count: memberCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: pendingPromotions } = await supabase
    .from("promotion_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return {
    week_start: weekStart,
    total_bj: totalBj,
    total_fsa: totalFsa,
    total_ser: totalSer,
    total_poh: totalPoh,
    total_meetings: totalMeetings,
    member_count: memberCount || 0,
    pending_promotions: pendingPromotions || 0,
    date: pragueNow.toLocaleDateString("cs-CZ"),
    day_name: pragueNow.toLocaleDateString("cs-CZ", { weekday: "long" }),
  };
}

function getWeekStart(d: Date): string {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? 6 : day - 1;
  dt.setDate(dt.getDate() - diff);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
