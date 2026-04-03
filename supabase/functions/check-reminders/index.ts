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

    // Find notifications with deadline = tomorrow and reminder not yet sent
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, title, recipient_id, deadline")
      .eq("deadline", tomorrowStr)
      .eq("reminder_sent", false);

    if (error) throw error;
    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ ok: true, reminders: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    for (const notif of notifications) {
      // Get push subscription
      const { data: sub } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", notif.recipient_id)
        .single();

      if (sub?.subscription) {
        // Call send-push function to reuse push logic
        // But for simplicity, we'll directly send a simple push here too
        // For now, invoke send-push
        const fnUrl = `${supabaseUrl}/functions/v1/send-push`;
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ notification_id: notif.id }),
        });
      }

      // Mark reminder as sent
      await supabase
        .from("notifications")
        .update({ reminder_sent: true })
        .eq("id", notif.id);

      sent++;
    }

    return new Response(JSON.stringify({ ok: true, reminders: sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
