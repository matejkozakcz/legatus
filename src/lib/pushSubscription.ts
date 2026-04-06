import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = "BM2RAC38Sc7QawV3Ir0bmzvUHfxDV1-rjqz2Ht7F27juOnIwkiL_llo-5nNn4NAEGAV7-Vky3xZRD2BWdfjWSeU";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushSubscription(userId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("Push not supported");
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
      });
    }

    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint;

    // Remove any existing subscription with the same endpoint (different user on same device)
    if (endpoint) {
      const { data: existing } = await supabase
        .from("push_subscriptions" as any)
        .select("id, user_id, subscription")
        .neq("user_id", userId);

      if (existing) {
        const staleIds = existing
          .filter((row: any) => row.subscription?.endpoint === endpoint)
          .map((row: any) => row.id);
        if (staleIds.length > 0) {
          await supabase
            .from("push_subscriptions" as any)
            .delete()
            .in("id", staleIds);
        }
      }
    }

    // Save/update subscription for the current user
    const { error } = await supabase
      .from("push_subscriptions" as any)
      .upsert(
        {
          user_id: userId,
          subscription: subJson,
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Push registration failed:", err);
    return false;
  }
}

export async function unregisterPushSubscription(userId: string): Promise<void> {
  try {
    await supabase
      .from("push_subscriptions" as any)
      .delete()
      .eq("user_id", userId);
  } catch (err) {
    console.error("Push unregister failed:", err);
  }
}
