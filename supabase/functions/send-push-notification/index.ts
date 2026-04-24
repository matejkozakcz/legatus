// Sends Web Push to all push_subscriptions for the recipient of a notification row.
// Triggered by DB AFTER INSERT on public.notifications via pg_net.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import webpush from "https://esm.sh/web-push@3.6.7";

interface Payload {
  notification_id?: string;
  recipient_id?: string;
  title?: string;
  body?: string;
  icon?: string | null;
  link_url?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidPrivate) {
      return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Get VAPID public key from app_config
    const { data: cfg } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "vapid_public_key")
      .single();
    const vapidPublic = (cfg?.value ?? "").toString().replace(/^"|"$/g, "");
    if (!vapidPublic) {
      return new Response(JSON.stringify({ error: "vapid_public_key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(
      "mailto:noreply@legatus.app",
      vapidPublic,
      vapidPrivate,
    );

    const body: Payload = await req.json().catch(() => ({}));

    // Resolve notification details
    let title = body.title ?? "Notifikace";
    let messageBody = body.body ?? "";
    let icon = body.icon ?? null;
    let linkUrl = body.link_url ?? null;
    let recipientId = body.recipient_id;

    if (body.notification_id && (!recipientId || !body.title)) {
      const { data: n } = await admin
        .from("notifications")
        .select("recipient_id, title, body, icon, link_url")
        .eq("id", body.notification_id)
        .single();
      if (n) {
        recipientId = n.recipient_id;
        title = n.title;
        messageBody = n.body;
        icon = n.icon;
        linkUrl = n.link_url;
      }
    }

    if (!recipientId) {
      return new Response(JSON.stringify({ error: "recipient_id missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all subscriptions for recipient
    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", recipientId);
    if (subsErr) throw subsErr;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title,
      body: messageBody,
      icon: icon ?? "Bell",
      link_url: linkUrl,
      notification_id: body.notification_id ?? null,
    });

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];
    const errors: Array<{
      sub_id: string;
      endpoint_host: string;
      status?: number;
      message?: string;
      body?: string;
    }> = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const e = err as { statusCode?: number; body?: string; message?: string };
        const status = e?.statusCode;
        if (status === 404 || status === 410) expired.push(sub.id);
        let host = "unknown";
        try {
          host = new URL(sub.endpoint).host;
        } catch {}
        errors.push({
          sub_id: sub.id,
          endpoint_host: host,
          status,
          message: e?.message,
          body: typeof e?.body === "string" ? e.body.slice(0, 300) : undefined,
        });
        console.warn("push send failed:", status, e?.message, e?.body);
      }
    }

    if (expired.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", expired);
    }

    return new Response(
      JSON.stringify({ sent, failed, expired_removed: expired.length, errors }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-push-notification error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
