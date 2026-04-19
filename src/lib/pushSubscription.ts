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

/**
 * Zaregistruje push subscription pro daného uživatele.
 *
 * Scope model: 1 řádek v push_subscriptions = 1 zařízení (endpoint).
 * Stejný endpoint (tj. stejný browser install) vlastní vždy ten poslední
 * uživatel, který se na zařízení přihlásil. Zajištěno UNIQUE(endpoint)
 * + UPSERT onConflict: "endpoint", který přepíše user_id.
 *
 * Viz P0-2 v auditu 2026-04-19.
 */
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

    if (!endpoint) {
      console.error("Push subscription has no endpoint");
      return false;
    }

    // Upsert podle endpoint: pokud už pro tento endpoint existuje řádek
    // (= někdo jiný byl na tomto zařízení přihlášen), přepíšeme user_id.
    // DB má UNIQUE(endpoint), takže kolize jdou přes ON CONFLICT.
    const { error } = await supabase
      .from("push_subscriptions" as any)
      .upsert(
        {
          user_id: userId,
          subscription: subJson,
        },
        { onConflict: "endpoint" }
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

/**
 * Při logoutu smažeme DB řádek pro aktuální endpoint a zrušíme
 * i browser-level subscription, aby další uživatel dostal nový endpoint
 * a nepřišel ke zděděné historii.
 */
export async function unregisterPushSubscription(userId: string): Promise<void> {
  try {
    // 1. Zjisti aktuální endpoint tohoto zařízení (pokud existuje)
    let endpoint: string | undefined;
    if ("serviceWorker" in navigator && "PushManager" in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        endpoint = sub?.toJSON().endpoint;

        // 2. Zruš browser subscription – další přihlášený dostane čistý endpoint
        if (sub) {
          await sub.unsubscribe();
        }
      } catch (err) {
        console.error("Failed to unsubscribe browser push:", err);
      }
    }

    // 3. Smaž DB řádek – přednostně podle endpointu (jen řádek tohoto zařízení),
    //    pokud endpoint neznáme (už zrušen), smaž všechny řádky pro user_id
    //    jako fallback (ale to je krajní případ).
    if (endpoint) {
      await supabase
        .from("push_subscriptions" as any)
        .delete()
        .eq("endpoint", endpoint);
    } else {
      await supabase
        .from("push_subscriptions" as any)
        .delete()
        .eq("user_id", userId);
    }
  } catch (err) {
    console.error("Push unregister failed:", err);
  }
}
