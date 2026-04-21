import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { registerPushSubscription } from "@/lib/pushSubscription";
import { toast } from "sonner";

const DISMISS_KEY = "legatus_notif_banner_dismissed_until";

/**
 * Global banner zobrazený nad layoutem, pokud uživatel nemá povolená browser
 * notifications. Skryje se po kliknutí "Povolit", po explicitním zavření
 * (na 7 dní), nebo když Notification API není podporované.
 */
export function NotificationPermissionBanner() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (until && Number(until) > Date.now()) setDismissed(true);
    } catch {}
  }, []);

  if (!user) return null;
  if (permission === "granted" || permission === "unsupported") return null;
  if (dismissed) return null;

  const handleEnable = async () => {
    if (permission === "denied") {
      toast.info("Otevři nastavení prohlížeče → Oznámení a povol je pro tuto stránku.");
      return;
    }
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      toast.success("Oznámení povolena");
      registerPushSubscription(user.id);
    } else if (result === "denied") {
      toast.error("Oznámení byla zamítnuta. Povolit je můžeš v nastavení prohlížeče.");
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 3600 * 1000));
    } catch {}
    setDismissed(true);
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border"
      style={{ background: "hsl(var(--secondary) / 0.12)" }}
    >
      <Bell className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(var(--secondary))" }} />
      <p className="flex-1 text-xs sm:text-sm text-foreground">
        {permission === "denied"
          ? "Oznámení jsou zablokovaná v prohlížeči — nedostáváš upozornění o schůzkách ani úkolech."
          : "Povol oznámení, abys nezmeškal/a důležité události a připomínky."}
      </p>
      <button
        onClick={handleEnable}
        className="text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
        style={{ background: "hsl(var(--secondary))", color: "white" }}
      >
        Povolit
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Skrýt"
        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
