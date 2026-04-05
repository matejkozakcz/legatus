import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date().toISOString().split("T")[0];

    // Find past, non-cancelled meetings with no outcome filled in
    // FSA: doporuceni_fsa = 0
    // POR/SER: podepsane_bj = 0 AND doporuceni_poradenstvi = 0
    // POH: pohovor_jde_dal IS NULL AND doporuceni_pohovor = 0
    const { data: meetings, error } = await supabase
      .from("client_meetings")
      .select("id, user_id, meeting_type, case_name, date")
      .eq("cancelled", false)
      .lt("date", today)
      .order("date", { ascending: false });

    if (error) throw error;

    // Filter to those needing follow-up
    const needsFollowUp = (meetings || []).filter((m: any) => {
      if (m.meeting_type === "FSA") return m.doporuceni_fsa === undefined || m.doporuceni_fsa === 0;
      if (m.meeting_type === "POR" || m.meeting_type === "SER") return (m.podepsane_bj === undefined || m.podepsane_bj === 0) && (m.doporuceni_poradenstvi === undefined || m.doporuceni_poradenstvi === 0);
      if (m.meeting_type === "POH") return m.pohovor_jde_dal === null && (m.doporuceni_pohovor === undefined || m.doporuceni_pohovor === 0);
      return false;
    });

    // We need full data — re-query with all fields
    const meetingIds = needsFollowUp.map((m: any) => m.id);
    if (meetingIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check which meetings already have a follow-up notification sent (to avoid duplicates)
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("related_meeting_id")
      .eq("type", "followup_needed")
      .in("related_meeting_id", meetingIds);

    const alreadyNotified = new Set((existingNotifs || []).map((n: any) => n.related_meeting_id));

    const toNotify = needsFollowUp.filter((m: any) => !alreadyNotified.has(m.id));

    let sent = 0;
    for (const m of toNotify as any[]) {
      // Create self-notification
      await supabase.from("notifications").insert({
        sender_id: m.user_id,
        recipient_id: m.user_id,
        title: "Doplň výsledek schůzky",
        message: `Schůzka ${m.case_name || m.meeting_type} ze dne ${m.date} nemá vyplněný výsledek.`,
        type: "followup_needed",
        deadline: today,
        related_meeting_id: m.id,
      });

      // Send push notification
      const { data: sub } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", m.user_id)
        .single();

      if (sub?.subscription) {
        const fnUrl = `${supabaseUrl}/functions/v1/send-push`;
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            subscription: sub.subscription,
            title: "Doplň výsledek schůzky",
            body: `Schůzka ${m.case_name || m.meeting_type} ze dne ${m.date} čeká na výsledek.`,
          }),
        });
      }

      sent++;
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
