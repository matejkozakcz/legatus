import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
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
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentDow = now.getUTCDay(); // 0=Sunday
    const currentDom = now.getUTCDate();

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

    for (const rule of rules) {
      // Parse schedule_time (HH:MM)
      const [schedHour, schedMin] = (rule.schedule_time || "08:00").split(":").map(Number);

      // Check if it's the right time (within 2 min window since cron runs every minute)
      if (currentHour !== schedHour || Math.abs(currentMinute - schedMin) > 1) continue;

      // Check day constraints (null means "every day of week" or "every day of month")
      if (rule.schedule_type === "weekly" && rule.schedule_day_of_week !== null && currentDow !== rule.schedule_day_of_week) continue;
      if (rule.schedule_type === "monthly" && rule.schedule_day_of_month !== null && currentDom !== rule.schedule_day_of_month) continue;

      // Dedup: skip if already sent within the last 23 hours
      if (rule.last_scheduled_at) {
        const lastSent = new Date(rule.last_scheduled_at).getTime();
        if (now.getTime() - lastSent < 23 * 60 * 60 * 1000) continue;
      }

      // Get recipients based on recipient_type
      let recipientIds: string[] = [];

      if (rule.recipient_type === "by_role" && rule.recipient_roles?.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, role, full_name")
          .eq("is_active", true)
          .in("role", rule.recipient_roles);
        recipientIds = (profiles || []).map((p: any) => p.id);
      } else {
        // Default: all active users (for by_role with no roles, or self/hierarchy in scheduled context)
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("is_active", true);
        recipientIds = (profiles || []).map((p: any) => p.id);
      }

      if (recipientIds.length === 0) continue;

      // Load aggregate data for dynamic templates
      const templateVars = await loadDynamicVars(supabase);

      // Send notifications
      const fnUrl = `${supabaseUrl}/functions/v1/send-push`;

      for (const recipientId of recipientIds) {
        const title = renderTemplate(rule.title_template, templateVars);
        const body = renderTemplate(rule.body_template, templateVars);

        if (rule.send_in_app) {
          const { data: notifData } = await supabase.from("notifications").insert({
            sender_id: recipientId,
            recipient_id: recipientId,
            type: rule.trigger_event || "scheduled",
            title,
            body,
            deadline: now.toISOString().split("T")[0],
          }).select("id").single();

          if (notifData?.id && rule.send_push) {
            await fetch(fnUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({ notification_id: notifData.id }),
            }).catch(() => {});
          }
        }

        totalSent++;
      }

      // Mark as sent
      await supabase
        .from("notification_rules")
        .update({ last_scheduled_at: now.toISOString() })
        .eq("id", rule.id);
    }

    return new Response(JSON.stringify({ ok: true, sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Load dynamic variables for scheduled notification templates.
 * These are aggregate values across the system.
 */
async function loadDynamicVars(supabase: any): Promise<Record<string, string | number>> {
  const now = new Date();
  const weekStart = getWeekStart(now);

  // Team-wide stats for current week
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

  // Active members count
  const { count: memberCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  // Pending promotion requests
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
    date: now.toLocaleDateString("cs-CZ"),
    day_name: now.toLocaleDateString("cs-CZ", { weekday: "long" }),
  };
}

function getWeekStart(d: Date): string {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().split("T")[0];
}
