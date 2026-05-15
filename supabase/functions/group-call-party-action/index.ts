// Group Call Party — server-side actions: start/end/join_via_link/rotate_token
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  action: "start" | "end" | "join_via_link" | "rotate_token";
  party_id?: string;
  token?: string;
}

function randomToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // user-scoped client (validates JWT)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;

    // service client for privileged writes
    const admin = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as Body;

    if (body.action === "start") {
      if (!body.party_id) throw new Error("party_id required");
      const { data: party } = await admin
        .from("group_call_parties")
        .select("host_id, status")
        .eq("id", body.party_id)
        .maybeSingle();
      if (!party) throw new Error("Party nenalezena");
      if (party.host_id !== uid) throw new Error("Pouze hostitel může spustit party");
      const { error } = await admin
        .from("group_call_parties")
        .update({ status: "live", started_at: new Date().toISOString() })
        .eq("id", body.party_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "end") {
      if (!body.party_id) throw new Error("party_id required");
      const { data: party } = await admin
        .from("group_call_parties")
        .select("host_id")
        .eq("id", body.party_id)
        .maybeSingle();
      if (!party) throw new Error("Party nenalezena");
      if (party.host_id !== uid) throw new Error("Pouze hostitel může ukončit party");
      const { error } = await admin
        .from("group_call_parties")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", body.party_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "rotate_token") {
      if (!body.party_id) throw new Error("party_id required");
      const { data: party } = await admin
        .from("group_call_parties")
        .select("host_id")
        .eq("id", body.party_id)
        .maybeSingle();
      if (!party || party.host_id !== uid) throw new Error("Pouze hostitel");
      const newToken = randomToken();
      const { error } = await admin
        .from("group_call_parties")
        .update({ join_token: newToken })
        .eq("id", body.party_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, token: newToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "join_via_link") {
      if (!body.token) throw new Error("token required");
      const { data: party } = await admin
        .from("group_call_parties")
        .select("id, status, host_id, allow_external, org_unit_id, name")
        .eq("join_token", body.token)
        .maybeSingle();
      if (!party) throw new Error("Party nenalezena");
      if (party.status === "ended") throw new Error("Tato party už skončila");

      // External-restriction: if disabled, user must be in same workspace
      if (!party.allow_external && party.org_unit_id) {
        const { data: profile } = await admin
          .from("profiles")
          .select("org_unit_id")
          .eq("id", uid)
          .maybeSingle();
        if (!profile || profile.org_unit_id !== party.org_unit_id) {
          throw new Error("Tato party je omezena na workspace hostitele");
        }
      }

      // Upsert participant
      const { error } = await admin
        .from("group_call_party_participants")
        .upsert(
          {
            party_id: party.id,
            user_id: uid,
            invited_via: "link",
            role: party.host_id === uid ? "host" : "caller",
            left_at: null,
          },
          { onConflict: "party_id,user_id" },
        );
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, party_id: party.id, name: party.name }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
