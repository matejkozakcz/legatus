import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = new Set(["novacek"]);
const RATE_LIMIT_PER_HOUR = 20;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Verify requesting user
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const requesterId = user.id;

    // Check requester's role
    const { data: requesterProfile } = await anonClient
      .from("profiles")
      .select("role")
      .eq("id", requesterId)
      .single();

    if (
      !requesterProfile ||
      !["vedouci", "budouci_vedouci", "garant"].includes(requesterProfile.role)
    ) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "Neplatný požadavek." }, 400);
    }

    const rawEmail = typeof payload.email === "string" ? payload.email : "";
    const rawFullName = typeof payload.full_name === "string" ? payload.full_name : "";
    const role = typeof payload.role === "string" ? payload.role : "";
    const vedouci_id = typeof payload.vedouci_id === "string" ? payload.vedouci_id : "";
    const garant_id = typeof payload.garant_id === "string" ? payload.garant_id : "";
    const ziskatel_id = typeof payload.ziskatel_id === "string" ? payload.ziskatel_id : null;

    // Normalize + validate email
    const email = rawEmail.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
      return jsonResponse({ error: "Neplatný formát e-mailu." }, 400);
    }

    // Validate full_name
    const full_name = rawFullName.trim();
    if (full_name.length < 2) {
      return jsonResponse({ error: "Jméno musí mít alespoň 2 znaky." }, 400);
    }

    // Validate role
    if (!ALLOWED_ROLES.has(role)) {
      return jsonResponse({ error: "Neplatná role." }, 400);
    }

    // Validate UUIDs
    if (!UUID_REGEX.test(vedouci_id) || !UUID_REGEX.test(garant_id)) {
      return jsonResponse({ error: "Neplatný identifikátor vedoucího nebo garanta." }, 400);
    }
    if (ziskatel_id && !UUID_REGEX.test(ziskatel_id)) {
      return jsonResponse({ error: "Neplatný identifikátor získatele." }, 400);
    }

    // Service-role client
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Rate limit: max 20 invites / hour / inviter
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: rateErr } = await adminClient
      .from("invite_attempts")
      .select("id", { count: "exact", head: true })
      .eq("inviter_id", requesterId)
      .gte("created_at", oneHourAgo);

    if (rateErr) {
      console.error("invite_attempts count error:", rateErr);
    } else if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return jsonResponse(
        { error: "Překročil jsi limit pozvánek, zkus to za hodinu." },
        429
      );
    }

    // Pre-check duplicate email via admin listUsers (filtered)
    const { data: existing, error: listErr } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) {
      console.error("listUsers error:", listErr);
    } else if (existing?.users?.some((u) => u.email?.toLowerCase() === email)) {
      return jsonResponse({ error: "E-mail je již registrován." }, 409);
    }

    // Send invite (no password ever generated server-side)
    const redirectTo = `${Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")}`;
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name, role },
      }
    );

    if (inviteError || !invited?.user) {
      const msg = inviteError?.message || "Nepodařilo se odeslat pozvánku.";
      // Supabase returns "User already registered" if duplicate slipped past pre-check
      if (/already/i.test(msg) || /registered/i.test(msg)) {
        return jsonResponse({ error: "E-mail je již registrován." }, 409);
      }
      return jsonResponse({ error: msg }, 400);
    }

    const newUserId = invited.user.id;

    // Update profile with hierarchy info
    const updateData: Record<string, unknown> = { vedouci_id, garant_id };
    if (ziskatel_id) updateData.ziskatel_id = ziskatel_id;
    const { error: profileError } = await adminClient
      .from("profiles")
      .update(updateData)
      .eq("id", newUserId);

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    // Log invite attempt for rate limiting
    await adminClient.from("invite_attempts").insert({ inviter_id: requesterId });

    // Fire-and-forget: notify hierarchy about new member
    try {
      const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-new-member`;
      fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          member_name: full_name,
          member_id: newUserId,
          vedouci_id,
          garant_id,
          ziskatel_id: ziskatel_id || null,
        }),
      }).catch((e) => console.error("notify-new-member fire-and-forget error:", e));
    } catch (e) {
      console.error("notify-new-member call error:", e);
    }

    return jsonResponse(
      { user: { id: newUserId, email }, invited: true },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
