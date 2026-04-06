import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = "BM2RAC38Sc7QawV3Ir0bmzvUHfxDV1-rjqz2Ht7F27juOnIwkiL_llo-5nNn4NAEGAV7-Vky3xZRD2BWdfjWSeU";

// --- Base64url helpers ---
function base64urlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(len);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function importVapidPrivateKey(base64url: string): Promise<CryptoKey> {
  const pubBytes = base64urlToUint8Array(VAPID_PUBLIC_KEY);
  const x = uint8ArrayToBase64url(pubBytes.slice(1, 33));
  const y = uint8ArrayToBase64url(pubBytes.slice(33, 65));
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: base64url, x, y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function createVapidJwt(audience: string, subject: string, privateKey: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  const header = uint8ArrayToBase64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = uint8ArrayToBase64url(enc.encode(JSON.stringify({ aud: audience, exp: now + 86400, sub: subject })));
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc.encode(unsigned));
  const sig = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  if (sig[0] === 0x30) {
    const rLen = sig[3];
    r = sig.slice(4, 4 + rLen);
    const sLen = sig[4 + rLen + 1];
    s = sig.slice(4 + rLen + 2, 4 + rLen + 2 + sLen);
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) { const p = new Uint8Array(32); p.set(r, 32 - r.length); r = p; }
    if (s.length < 32) { const p = new Uint8Array(32); p.set(s, 32 - s.length); s = p; }
  } else {
    r = sig.slice(0, 32);
    s = sig.slice(32, 64);
  }
  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);
  return `${unsigned}.${uint8ArrayToBase64url(rawSig)}`;
}

async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), ikm));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = concat(info, new Uint8Array([1]));
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return okm.slice(0, length);
}

async function encryptPayload(plaintext: Uint8Array, subscriptionKeys: { p256dh: string; auth: string }): Promise<Uint8Array> {
  const clientPublicKeyBytes = base64urlToUint8Array(subscriptionKeys.p256dh);
  const authSecret = base64urlToUint8Array(subscriptionKeys.auth);
  const localKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));
  const clientPublicKey = await crypto.subtle.importKey("raw", clientPublicKeyBytes, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientPublicKey }, localKeyPair.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyInfoInput = concat(enc.encode("WebPush: info\0"), clientPublicKeyBytes, localPublicKeyRaw);
  const ikm = await hkdfSha256(sharedSecret, authSecret, keyInfoInput, 32);
  const cekInfo = concat(enc.encode("Content-Encoding: aes128gcm\0"));
  const cek = await hkdfSha256(ikm, salt, cekInfo, 16);
  const nonceInfo = concat(enc.encode("Content-Encoding: nonce\0"));
  const nonce = await hkdfSha256(ikm, salt, nonceInfo, 12);
  const padded = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));
  const rs = new Uint8Array(4);
  const recordSize = 4096;
  rs[0] = (recordSize >> 24) & 0xff;
  rs[1] = (recordSize >> 16) & 0xff;
  rs[2] = (recordSize >> 8) & 0xff;
  rs[3] = recordSize & 0xff;
  const idLen = new Uint8Array([localPublicKeyRaw.length]);
  return concat(salt, rs, idLen, localPublicKeyRaw, encrypted);
}

async function sendWebPush(subscription: any, payload: string, vapidPrivateKeyB64: string): Promise<Response> {
  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;
  const privateKey = await importVapidPrivateKey(vapidPrivateKeyB64);
  const jwt = await createVapidJwt(audience, "mailto:noreply@legatus.app", privateKey);
  const plaintextBytes = new TextEncoder().encode(payload);
  const ciphertext = await encryptPayload(plaintextBytes, subscription.keys);
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    },
    body: ciphertext,
  });
}

/**
 * notify-new-member
 * Sends push notification to vedoucí, BV (budoucí vedoucí), garant, and získatel
 * when a new member registers into their structure.
 *
 * Body: { member_name: string, vedouci_id?: string, garant_id?: string, ziskatel_id?: string }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { member_name, vedouci_id, garant_id, ziskatel_id } = await req.json();

    if (!member_name) {
      return new Response(JSON.stringify({ error: "member_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check notification_rules for active new_member rule
    const { data: rules } = await supabase
      .from("notification_rules")
      .select("*")
      .eq("trigger_event", "new_member")
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      console.log("No active new_member notification rule found, skipping.");
      return new Response(JSON.stringify({ ok: true, pushed: 0, reason: "rule_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rule = rules[0];
    const allowedRoles = new Set<string>(rule.recipient_roles || []);

    // Build map: hierarchy ID → role
    const hierarchyMap: { id: string; role?: string }[] = [];
    if (vedouci_id) hierarchyMap.push({ id: vedouci_id });
    if (garant_id && garant_id !== vedouci_id) hierarchyMap.push({ id: garant_id });
    if (ziskatel_id && ziskatel_id !== vedouci_id && ziskatel_id !== garant_id) hierarchyMap.push({ id: ziskatel_id });

    // Fetch profiles to get roles
    const allIds = hierarchyMap.map((h) => h.id);
    if (allIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, pushed: 0, reason: "no_recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, role, vedouci_id")
      .in("id", allIds);

    // Also check BV (vedoucí's vedoucí)
    const vedouciProfile = profiles?.find((p) => p.id === vedouci_id);
    if (vedouciProfile?.vedouci_id) {
      const { data: bvProfile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", vedouciProfile.vedouci_id)
        .single();
      if (bvProfile) {
        profiles?.push(bvProfile);
      }
    }

    // Filter recipients by allowed roles from the rule
    const recipientIds = (profiles || [])
      .filter((p) => allowedRoles.has(p.role))
      .map((p) => p.id);

    if (recipientIds.length === 0) {
      console.log("No recipients match allowed roles:", Array.from(allowedRoles));
      return new Response(JSON.stringify({ ok: true, pushed: 0, reason: "no_matching_roles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get push subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("user_id, subscription")
      .in("user_id", recipientIds);

    if (!subs || subs.length === 0) {
      console.log("No push subscriptions found for recipients:", recipientIds);
      return new Response(JSON.stringify({ ok: true, pushed: 0, reason: "no_subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply template variables
    const title = (rule.title_template || "Nový člen v týmu").replace("{{member_name}}", member_name);
    const body = (rule.body_template || "").replace("{{member_name}}", member_name);

    const pushPayload = JSON.stringify({
      title,
      body,
      data: { type: "new_member" },
    });

    let pushed = 0;
    for (const sub of subs) {
      if (!sub.subscription?.keys) continue;
      try {
        console.log(`Sending new-member push to ${sub.user_id}`);
        const res = await sendWebPush(sub.subscription, pushPayload, vapidPrivateKey);
        console.log(`Push to ${sub.user_id}: ${res.status}`);
        if (res.status === 201) pushed++;
        if (res.status === 410 || res.status === 404) {
          await supabase.from("push_subscriptions").delete().eq("user_id", sub.user_id);
        }
      } catch (e) {
        console.error(`Push to ${sub.user_id} failed:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, pushed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-new-member error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
