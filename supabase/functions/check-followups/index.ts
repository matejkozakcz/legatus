import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function czechMeetingsPhrase(count: number): string {
  if (count === 1) return "Dnes proběhla 1 schůzka";
  if (count >= 2 && count <= 4) return `Dnes proběhly ${count} schůzky`;
  return `Dnes proběhlo ${count} schůzek`;
}

function czechMissingPhrase(count: number): string {
  if (count === 1) return "1 nemá vyplněný výsledek";
  if (count >= 2 && count <= 4) return `${count} nemají vyplněný výsledek`;
  return `${count} nemá vyplněný výsledek`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Today's date in Europe/Prague timezone (YYYY-MM-DD)
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });

    // Fetch all active users
    const { data: users, error: usersErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true);

    if (usersErr) throw usersErr;

    let processed = 0;
    let sent = 0;

    for (const u of (users || []) as Array<{ id: string }>) {
      processed++;
      const userId = u.id;

      // Skip if daily recap already sent today.
      // Use array + limit(1) instead of .maybeSingle() — maybeSingle throws when >1 row exists,
      // which would silently fall through and create yet another duplicate.
      const { data: existingRows } = await supabase
        .from("notifications")
        .select("id")
        .eq("recipient_id", userId)
        .eq("type", "daily_recap")
        .eq("deadline", todayStr)
        .limit(1);

      if (existingRows && existingRows.length > 0) continue;

      // Fetch today's meetings
      const { data: meetings } = await supabase
        .from("client_meetings")
        .select("id, outcome_recorded")
        .eq("user_id", userId)
        .eq("date", todayStr)
        .eq("cancelled", false);

      const total = (meetings || []).length;
      const missing = (meetings || []).filter((m: any) => !m.outcome_recorded).length;

      let title = "Přehled dne";
      let message: string;

      if (total === 0) {
        message = "Dnes jsi neměl žádné schůzky.";
      } else if (missing === 0) {
        message = `${czechMeetingsPhrase(total)} · Dobrá práce! ✓`;
      } else {
        message = `${czechMeetingsPhrase(total)} · ${czechMissingPhrase(missing)}.`;
      }

      const { data: notifData, error: insErr } = await supabase
        .from("notifications")
        .insert({
          sender_id: userId,
          recipient_id: userId,
          type: "daily_recap",
          deadline: todayStr,
          related_meeting_id: null,
          title,
          message,
        })
        .select("id")
        .single();

      if (insErr || !notifData?.id) continue;

      // Send push (best effort)
      const fnUrl = `${supabaseUrl}/functions/v1/send-push`;
      await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ notification_id: notifData.id }),
      }).catch(() => {/* push is best effort */});

      sent++;
    }

    return new Response(JSON.stringify({ ok: true, processed, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
