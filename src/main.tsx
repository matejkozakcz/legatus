import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
