import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MEETING_TYPE_LABELS: Record<string, string> = {
  FSA: "FSA schůzka",
  SER: "Servisní schůzka",
  POH: "Pohovor",
  POR: "Poradenství",
  INFO: "Info schůzka",
  POST: "Post-info schůzka",
};

interface MeetingRow {
  id: string;
  user_id: string;
  meeting_type: string;
  date: string;
  meeting_time: string | null;
  duration_minutes: number | null;
  case_name: string | null;
  location_type: string | null;
  location_detail: string | null;
  poznamka: string | null;
  cancelled: boolean;
  external_event_id: string | null;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function getValidAccessToken(admin: any, userId: string): Promise<{ token: string; calendarId: string } | null> {
  const { data: conn } = await admin
    .from("user_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (!conn) return null;

  const expiresAt = new Date(conn.token_expires_at).getTime();
  const now = Date.now();

  if (expiresAt > now + 60_000) {
    return { token: conn.access_token, calendarId: conn.calendar_id };
  }

  // Refresh
  const refreshed = await refreshAccessToken(conn.refresh_token);
  if (!refreshed) return null;

  const newExpiresAt = new Date(now + refreshed.expires_in * 1000).toISOString();
  await admin
    .from("user_calendar_connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt,
      last_sync_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google");

  return { token: refreshed.access_token, calendarId: conn.calendar_id };
}

function buildEventPayload(m: MeetingRow) {
  const typeLabel = MEETING_TYPE_LABELS[m.meeting_type] || m.meeting_type;
  const summary = m.case_name ? `${typeLabel} — ${m.case_name}` : typeLabel;

  const startTime = m.meeting_time || "09:00:00";
  const startDateTime = `${m.date}T${startTime.length === 5 ? startTime + ":00" : startTime}`;
  const durationMin = m.duration_minutes || 60;
  const startDate = new Date(`${startDateTime}+02:00`);
  const endDate = new Date(startDate.getTime() + durationMin * 60_000);

  const descParts: string[] = [];
  if (m.case_name) descParts.push(`Klient: ${m.case_name}`);
  if (m.location_type) descParts.push(`Místo: ${m.location_type}${m.location_detail ? " — " + m.location_detail : ""}`);
  if (m.poznamka) descParts.push(`\nPoznámka:\n${m.poznamka}`);
  descParts.push("\n— Vytvořeno z Legatus");

  return {
    summary,
    description: descParts.join("\n"),
    location: m.location_detail || undefined,
    start: { dateTime: startDate.toISOString(), timeZone: "Europe/Prague" },
    end: { dateTime: endDate.toISOString(), timeZone: "Europe/Prague" },
    status: m.cancelled ? "cancelled" : "confirmed",
  };
}

async function syncOne(admin: any, meeting: MeetingRow, op: "INSERT" | "UPDATE" | "DELETE") {
  const tokenInfo = await getValidAccessToken(admin, meeting.user_id);
  if (!tokenInfo) return { skipped: true, reason: "no_connection" };

  const { token, calendarId } = tokenInfo;
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  if (op === "DELETE") {
    if (!meeting.external_event_id) return { skipped: true, reason: "no_external_id" };
    await fetch(`${baseUrl}/${meeting.external_event_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: true, action: "deleted" };
  }

  const payload = buildEventPayload(meeting);

  if (meeting.external_event_id) {
    // Update
    const res = await fetch(`${baseUrl}/${meeting.external_event_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      // Event was deleted in Google — recreate
      const createRes = await fetch(baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const created = await createRes.json();
      if (createRes.ok && created.id) {
        await admin.from("client_meetings").update({ external_event_id: created.id }).eq("id", meeting.id);
        return { ok: true, action: "recreated" };
      }
      return { error: "recreate_failed", details: created };
    }
    return { ok: res.ok, action: "updated" };
  } else {
    // Create
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const created = await res.json();
    if (res.ok && created.id) {
      await admin.from("client_meetings").update({ external_event_id: created.id }).eq("id", meeting.id);
      return { ok: true, action: "created" };
    }
    return { error: "create_failed", details: created };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Mode 1: single meeting sync
    if (body.meeting_id) {
      const op = (body.op || "UPDATE") as "INSERT" | "UPDATE" | "DELETE";

      if (op === "DELETE") {
        // For delete, caller must supply external_event_id since meeting may be gone
        const meeting: MeetingRow = {
          id: body.meeting_id,
          user_id: userId,
          meeting_type: "",
          date: "",
          meeting_time: null,
          duration_minutes: null,
          case_name: null,
          location_type: null,
          location_detail: null,
          poznamka: null,
          cancelled: true,
          external_event_id: body.external_event_id,
        };
        const result = await syncOne(admin, meeting, "DELETE");
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: meeting, error: mErr } = await admin
        .from("client_meetings")
        .select("id,user_id,meeting_type,date,meeting_time,duration_minutes,case_name,location_type,location_detail,poznamka,cancelled,external_event_id")
        .eq("id", body.meeting_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (mErr || !meeting) {
        return new Response(JSON.stringify({ error: "meeting_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await syncOne(admin, meeting as MeetingRow, op);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 2: backfill (all future meetings without external_event_id)
    if (body.backfill === true) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: meetings, error: bErr } = await admin
        .from("client_meetings")
        .select("id,user_id,meeting_type,date,meeting_time,duration_minutes,case_name,location_type,location_detail,poznamka,cancelled,external_event_id")
        .eq("user_id", userId)
        .gte("date", today)
        .is("external_event_id", null)
        .eq("cancelled", false)
        .limit(200);

      if (bErr) {
        return new Response(JSON.stringify({ error: bErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let success = 0;
      let failed = 0;
      for (const m of meetings || []) {
        const r = await syncOne(admin, m as MeetingRow, "INSERT");
        if (r.ok) success++;
        else failed++;
      }

      return new Response(JSON.stringify({ ok: true, total: meetings?.length || 0, success, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-meeting-to-calendar error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
