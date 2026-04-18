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

// --- VAPID JWT ---
async function importVapidPrivateKey(base64url: string): Promise<CryptoKey> {
  // Extract x,y from the known uncompressed public key (04 || x || y)
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


async function createVapidJwt(
  audience: string,
  subject: string,
  privateKey: CryptoKey
): Promise<string> {
  const enc = new TextEncoder();
  const header = uint8ArrayToBase64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const now = Math.floor(Date.now() / 1000);
  // Apple Push Service rejects exp >= 24h. Use 12h to match Parťáq and stay safely under the limit.
  const payload = uint8ArrayToBase64url(enc.encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject })));
  const unsigned = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    enc.encode(unsigned)
  );

  // DER to raw r||s
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

// --- RFC 8291 Web Push Encryption (aes128gcm) ---
async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // Extract
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), ikm));
  // Expand
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = concat(info, new Uint8Array([1]));
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return okm.slice(0, length);
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const typeBytes = enc.encode(type);
  // "Content-Encoding: <type>\0" + "P-256\0" + len(recipient) + recipient + len(sender) + sender
  const header = enc.encode("Content-Encoding: ");
  const nul = new Uint8Array([0]);
  const p256 = enc.encode("P-256");
  const clientLen = new Uint8Array(2);
  clientLen[0] = 0; clientLen[1] = clientPublicKey.length;
  const serverLen = new Uint8Array(2);
  serverLen[0] = 0; serverLen[1] = serverPublicKey.length;
  return concat(header, typeBytes, nul, p256, nul, clientLen, clientPublicKey, serverLen, serverPublicKey);
}

async function encryptPayload(
  plaintext: Uint8Array,
  subscriptionKeys: { p256dh: string; auth: string }
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  const clientPublicKeyBytes = base64urlToUint8Array(subscriptionKeys.p256dh);
  const authSecret = base64urlToUint8Array(subscriptionKeys.auth);

  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      localKeyPair.privateKey,
      256
    )
  );

  // Generate random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const enc = new TextEncoder();

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" + ua_public + as_public, 32)
  const keyInfoInput = concat(
    enc.encode("WebPush: info\0"),
    clientPublicKeyBytes,
    localPublicKeyRaw
  );
  const ikm = await hkdfSha256(sharedSecret, authSecret, keyInfoInput, 32);

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = concat(enc.encode("Content-Encoding: aes128gcm\0"));
  const cek = await hkdfSha256(ikm, salt, cekInfo, 16);

  // Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonceInfo = concat(enc.encode("Content-Encoding: nonce\0"));
  const nonce = await hkdfSha256(ikm, salt, nonceInfo, 12);

  // Pad plaintext: plaintext + delimiter(0x02) for last record
  const padded = concat(plaintext, new Uint8Array([2]));

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = new Uint8Array(4);
  const recordSize = 4096;
  rs[0] = (recordSize >> 24) & 0xff;
  rs[1] = (recordSize >> 16) & 0xff;
  rs[2] = (recordSize >> 8) & 0xff;
  rs[3] = recordSize & 0xff;
  const idLen = new Uint8Array([localPublicKeyRaw.length]);

  const body = concat(salt, rs, idLen, localPublicKeyRaw, encrypted);

  return { ciphertext: body, salt, localPublicKey: localPublicKeyRaw };
}

async function sendWebPush(
  subscription: any,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKeyB64: string
): Promise<Response> {
  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;

  const privateKey = await importVapidPrivateKey(vapidPrivateKeyB64);
  // VAPID subject MUST be a real, reachable mailto: or https URL.
  // Apple Push Service silently drops messages with unreachable subjects (returns 201 anyway).
  const jwt = await createVapidJwt(audience, "mailto:info@weresoft.cz", privateKey);

  // Encrypt payload per RFC 8291
  const plaintextBytes = new TextEncoder().encode(payload);
  const { ciphertext } = await encryptPayload(plaintextBytes, subscription.keys);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body: ciphertext,
  });
}

// --- Main handler ---
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { notification_id } = await req.json();
    if (!notification_id) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get notification
    const { data: notif, error: nErr } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", notification_id)
      .single();
    if (nErr || !notif) {
      return new Response(JSON.stringify({ error: "Notification not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get push subscription for recipient
    const { data: sub } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", notif.recipient_id)
      .single();

    if (!sub?.subscription || !sub.subscription.keys) {
      return new Response(JSON.stringify({ ok: true, pushed: false, reason: "no_subscription" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload = JSON.stringify({
      title: notif.title,
      body: notif.body || notif.message || "",
      data: { notification_id: notif.id, type: notif.type, redirect_url: notif.redirect_url || null },
    });

    console.log(`Sending push to ${notif.recipient_id}, endpoint: ${sub.subscription.endpoint?.slice(0, 60)}...`);

    const pushRes = await sendWebPush(sub.subscription, pushPayload, VAPID_PUBLIC_KEY, vapidPrivateKey);
    const pushStatus = pushRes.status;
    const pushBody = await pushRes.text();

    console.log(`Push response: ${pushStatus} ${pushBody.slice(0, 200)}`);

    // 410/404 = subscription expired → delete stale subscription
    if (pushStatus === 410 || pushStatus === 404) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", notif.recipient_id);

      return new Response(
        JSON.stringify({ ok: true, pushed: false, reason: "subscription_expired", status: pushStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, pushed: pushStatus === 201, status: pushStatus, detail: pushBody.slice(0, 100) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
