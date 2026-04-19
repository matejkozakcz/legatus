import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = "BM2RAC38Sc7QawV3Ir0bmzvUHfxDV1-rjqz2Ht7F27juOnIwkiL_llo-5nNn4NAEGAV7-Vky3xZRD2BWdfjWSeU";

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
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
  return result;
}

async function importVapidPrivateKey(base64url: string): Promise<CryptoKey> {
  const pubBytes = base64urlToUint8Array(VAPID_PUBLIC_KEY);
  const x = uint8ArrayToBase64url(pubBytes.slice(1, 33));
  const y = uint8ArrayToBase64url(pubBytes.slice(33, 65));
  return crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: base64url, x, y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
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
    const rLen = sig[3]; r = sig.slice(4, 4 + rLen); const sLen = sig[4 + rLen + 1]; s = sig.slice(4 + rLen + 2, 4 + rLen + 2 + sLen);
    if (r.length > 32) r = r.slice(r.length - 32); if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) { const p = new Uint8Array(32); p.set(r, 32 - r.length); r = p; }
    if (s.length < 32) { const p = new Uint8Array(32); p.set(s, 32 - s.length); s = p; }
  } else { r = sig.slice(0, 32); s = sig.slice(32, 64); }
  const rawSig = new Uint8Array(64); rawSig.set(r, 0); rawSig.set(s, 32);
  return `${unsigned}.${uint8ArrayToBase64url(rawSig)}`;
}

async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), ikm));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, concat(info, new Uint8Array([1]))));
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
  const ikm = await hkdfSha256(sharedSecret, authSecret, concat(enc.encode("WebPush: info\0"), clientPublicKeyBytes, localPublicKeyRaw), 32);
  const cek = await hkdfSha256(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfSha256(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);
  const padded = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));
  const rs = new Uint8Array(4); const recordSize = 4096;
  rs[0] = (recordSize >> 24) & 0xff; rs[1] = (recordSize >> 16) & 0xff; rs[2] = (recordSize >> 8) & 0xff; rs[3] = recordSize & 0xff;
  return concat(salt, rs, new Uint8Array([localPublicKeyRaw.length]), localPublicKeyRaw, encrypted);
}

async function sendWebPush(subscription: any, payload: string, vapidPrivateKeyB64: string): Promise<Response> {
  const endpoint = subscription.endpoint;
  const privateKey = await importVapidPrivateKey(vapidPrivateKeyB64);
  const jwt = await createVapidJwt(new URL(endpoint).origin, "mailto:noreply@legatus.app", privateKey);
  const ciphertext = await encryptPayload(new TextEncoder().encode(payload), subscription.keys);
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", TTL: "86400", Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}` },
    body: ciphertext,
  });
}

/**
 * test-notification
 * Sends a test push notification to the calling user.
 * Body: { title: string, body: string }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const { title, body } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get caller user_id from JWT
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify admin
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get push subscriptions (po P0-2: uživatel může mít víc zařízení)
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("subscription, endpoint")
      .eq("user_id", user.id);

    const validSubs = (subs || []).filter((s: any) => s.subscription?.keys);
    if (validSubs.length === 0) {
      return new Response(JSON.stringify({ ok: false, reason: "no_subscription", message: "Nemáte aktivní push odběr na žádném zařízení." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload = JSON.stringify({ title: title || "🧪 Test notifikace", body: body || "Toto je testovací notifikace z admin dashboardu.", data: { type: "test" } });

    let pushed = 0;
    let lastStatus = 0;
    const expiredEndpoints: string[] = [];

    for (const s of validSubs) {
      try {
        const res = await sendWebPush(s.subscription, pushPayload, vapidPrivateKey);
        lastStatus = res.status;
        if (res.status === 201) pushed++;
        if ((res.status === 410 || res.status === 404) && s.endpoint) {
          expiredEndpoints.push(s.endpoint);
        }
      } catch (e) {
        console.error("test push failed:", e);
      }
    }

    if (expiredEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
    }

    if (pushed === 0 && expiredEndpoints.length === validSubs.length) {
      return new Response(JSON.stringify({ ok: false, reason: "subscription_expired" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: pushed > 0, pushed, total: validSubs.length, status: lastStatus }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("test-notification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
