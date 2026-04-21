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

    /** Best-effort log helper — never throws */
    async function logRun(entry: {
      rule_id: string;
      rule_name: string;
      matched?: boolean;
      recipients_count?: number;
      inserted_count?: number;
      failed_count?: number;
      push_sent_count?: number;
      status: "ok" | "partial" | "error" | "skipped";
      error_message?: string | null;
      details?: any;
    }) {
      try {
        await supabase.from("notification_rule_runs").insert({
          rule_id: entry.rule_id,
          rule_name: entry.rule_name,
          matched: entry.matched ?? true,
          recipients_count: entry.recipients_count ?? 0,
          inserted_count: entry.inserted_count ?? 0,
          failed_count: entry.failed_count ?? 0,
          push_sent_count: entry.push_sent_count ?? 0,
          status: entry.status,
          error_message: entry.error_message ?? null,
          details: entry.details ?? null,
        });
      } catch (e) {
        console.error(`[scheduled-notifications] logRun failed: ${e}`);
      }
    }

    for (const rule of rules) {
      const [schedHour, schedMin] = (rule.schedule_time || "08:00").split(":").map(Number);

      if (currentHour !== schedHour || currentMinute !== schedMin) continue;

      if (rule.schedule_type === "weekly" && rule.schedule_day_of_week !== null && currentDow !== rule.schedule_day_of_week) continue;
      if (rule.schedule_type === "monthly" && rule.schedule_day_of_month !== null && currentDom !== rule.schedule_day_of_month) continue;

      console.log(`[scheduled-notifications] Rule "${rule.name}" matched (type=${rule.schedule_type})`);

      if (rule.last_scheduled_at) {
        const lastDayPrague = pragueDateStr(new Date(rule.last_scheduled_at));
        if (lastDayPrague === todayPrague) {
          console.log(`[scheduled-notifications] Rule "${rule.name}" already sent today (${lastDayPrague}), skipping`);
          await logRun({
            rule_id: rule.id, rule_name: rule.name,
            status: "skipped",
            error_message: `Already sent today (${lastDayPrague})`,
          });
          continue;
        }
      }

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
        await logRun({
          rule_id: rule.id, rule_name: rule.name,
          status: "error",
          error_message: `Lock error: ${lockErr.message}`,
        });
        continue;
      }
      if (!lockedRows || lockedRows.length === 0) {
        console.log(`[scheduled-notifications] Rule "${rule.name}" lock lost (parallel run), skipping`);
        await logRun({
          rule_id: rule.id, rule_name: rule.name,
          status: "skipped",
          error_message: "Lock lost (parallel run)",
        });
        continue;
      }

      let recipients: { id: string; full_name: string; role: string }[] = [];
      let recipientsError: string | null = null;

      if (rule.recipient_type === "by_role" && rule.recipient_roles?.length > 0) {
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("is_active", true)
          .in("role", rule.recipient_roles);
        if (profErr) {
          recipientsError = `Recipients (by_role) error: ${profErr.message}`;
          console.error(`[scheduled-notifications] ${recipientsError}`);
        }
        recipients = profiles || [];
      } else {
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("is_active", true);
        if (profErr) {
          recipientsError = `Recipients (all) error: ${profErr.message}`;
          console.error(`[scheduled-notifications] ${recipientsError}`);
        }
        recipients = profiles || [];
      }

      console.log(`[scheduled-notifications] Rule "${rule.name}" → ${recipients.length} recipients`);

      if (recipients.length === 0) {
        ruleResults.push({ rule: rule.name, recipients: 0, sent: 0 });
        await logRun({
          rule_id: rule.id, rule_name: rule.name,
          recipients_count: 0,
          status: recipientsError ? "error" : "ok",
          error_message: recipientsError ?? "No recipients",
        });
        continue;
      }

      const globalVars = await loadGlobalVars(supabase, pragueTime);

      // Pre-fetch which recipients have at least one push subscription, ať
      // můžeme do detailů zalogovat, kolik adresátů push minelo (push_skipped_no_sub).
      const recipientIds = recipients.map((r) => r.id);
      const { data: subRows } = await supabase
        .from("push_subscriptions")
        .select("user_id")
        .in("user_id", recipientIds);
      const usersWithSub = new Set((subRows || []).map((r: any) => r.user_id));

      const fnUrl = `${supabaseUrl}/functions/v1/send-push`;
      let ruleSent = 0;
      let ruleFailed = 0;
      let rulePushed = 0;
      let pushSkippedNoSub = 0;
      let pushFailed = 0;
      const errorSamples: string[] = [];

      for (const recipient of recipients) {
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
            message: body,
            deadline: todayPrague,
          }).select("id").single();

          if (insErr) {
            ruleFailed++;
            const msg = `Insert failed for ${recipient.id}: ${insErr.message}`;
            console.error(`[scheduled-notifications] ${msg}`);
            if (errorSamples.length < 3) errorSamples.push(msg);
            continue;
          }

          if (notifData?.id && rule.send_push) {
            if (!usersWithSub.has(recipient.id)) {
              pushSkippedNoSub++;
            } else {
              try {
                const pushRes = await fetch(fnUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceRoleKey}`,
                  },
                  body: JSON.stringify({ notification_id: notifData.id }),
                });
                if (pushRes.ok) {
                  rulePushed++;
                } else {
                  pushFailed++;
                  if (errorSamples.length < 3) {
                    errorSamples.push(`Push HTTP ${pushRes.status} for ${recipient.id}`);
                  }
                }
              } catch (e) {
                pushFailed++;
                console.error(`[scheduled-notifications] Push fetch error: ${e}`);
              }
            }
          }
        }

        ruleSent++;
        totalSent++;
      }

      const pushHealthIssue = rule.send_push && rulePushed === 0 && recipients.length > 0;

      ruleResults.push({
        rule: rule.name,
        recipients: recipients.length,
        sent: ruleSent,
        failed: ruleFailed,
        pushed: rulePushed,
        push_skipped_no_sub: pushSkippedNoSub,
        push_failed: pushFailed,
      });

      await logRun({
        rule_id: rule.id,
        rule_name: rule.name,
        recipients_count: recipients.length,
        inserted_count: ruleSent,
        failed_count: ruleFailed,
        push_sent_count: rulePushed,
        status: ruleFailed === 0 ? (pushHealthIssue ? "partial" : "ok") : (ruleSent === 0 ? "error" : "partial"),
        error_message: pushHealthIssue
          ? `Push: 0/${recipients.length} doručeno (no_sub=${pushSkippedNoSub}, failed=${pushFailed})`
          : (errorSamples[0] ?? null),
        details: {
          push_skipped_no_sub: pushSkippedNoSub,
          push_failed: pushFailed,
          push_sent: rulePushed,
          ...(errorSamples.length > 0 ? { errors: errorSamples } : {}),
        },
      });
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
