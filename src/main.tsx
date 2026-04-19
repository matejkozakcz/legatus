import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Supabase invite/recovery linky pošlou uživatele na <origin>/<path>#access_token=...&type=invite|recovery
// Chceme, aby tyhle linky vždy přistály na /set-password — ať už redirectTo
// bylo nastavené jakkoli, nebo ať má uživatel stránku zacachovanou.
// Přesměrujeme JEŠTĚ PŘED mountováním Reactu, aby SDK nezpracoval hash
// a nevlítl rovnou do dashboardu bez hesla.
(() => {
  try {
    const hash = window.location.hash || "";
    if (!hash) return;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const type = params.get("type");
    const onSetPassword = window.location.pathname === "/set-password";
    if ((type === "invite" || type === "recovery") && !onSetPassword) {
      // Zachováme hash (obsahuje access_token, který SDK musí zpracovat na /set-password)
      window.location.replace(`/set-password${hash}`);
    }
  } catch {
    /* ignore — necháme normální flow */
  }
})();

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for PWA
// Skip in iframe / Lovable preview hosts — service workers there cause stale cache
// and push subscriptions registered against the preview origin never receive
// pushes sent for the production origin.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if ("serviceWorker" in navigator) {
  if (isInIframe || isPreviewHost) {
    // Clean up any previously registered SW + push subscription on preview hosts
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach(async (r) => {
        try {
          const sub = await r.pushManager.getSubscription();
          await sub?.unsubscribe();
        } catch { /* ignore */ }
        r.unregister();
      });
    });
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("SW registration failed:", err));
    });
  }
}
