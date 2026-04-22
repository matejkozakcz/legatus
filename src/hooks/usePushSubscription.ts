import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type PushPermission = "default" | "granted" | "denied" | "unsupported";

interface UsePushSubscriptionResult {
  permission: PushPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  enable: () => Promise<{ ok: boolean; error?: string }>;
  disable: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function getVapidPublicKey(): Promise<string | null> {
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "vapid_public_key")
    .single();
  if (!data?.value) return null;
  // value is jsonb → could be string with quotes
  if (typeof data.value === "string") return data.value;
  return String(data.value);
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Detect support and current permission
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) {
          setPermission("unsupported");
          setIsLoading(false);
        }
        return;
      }
      setPermission(Notification.permission as PushPermission);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(!!sub && !!user);
      } catch {
        if (!cancelled) setIsSubscribed(false);
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const enable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: "Nepřihlášen" };
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      return { ok: false, error: "Prohlížeč push notifikace nepodporuje" };
    }

    const result = await Notification.requestPermission();
    setPermission(result as PushPermission);
    if (result !== "granted") return { ok: false, error: "Povolení zamítnuto" };

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return { ok: false, error: "VAPID klíč není nakonfigurován (vygeneruj v Adminu)" };

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });
    }

    const json = sub.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, error: error.message };

    setIsSubscribed(true);
    return { ok: true };
  }, [user]);

  const disable = useCallback(async () => {
    if (!user) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (e) {
      console.warn("unsubscribe failed:", e);
    }
    setIsSubscribed(false);
  }, [user]);

  return { permission, isSubscribed, isLoading, enable, disable };
}
