import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { registerPushSubscription } from "@/lib/pushSubscription";
import { toast } from "sonner";

const DISMISS_KEY = "legatus_notif_banner_dismissed_until";

/**
 * Floating toast-style banner pro chybějící povolení browser notifications.
 * Pozice je laděna tak, aby nekolidovala s top-right floating buttons (mobile)
 * ani s pravým horním rohem desktop layoutu — sedí v levém horním rohu pod
 * sidebar/header areou.
 */
export function NotificationPermissionBanner() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
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

  // Mobile: nahoře uprostřed, kompaktní, s respektem k safe-area a floating buttons (~44px vysoké, vpravo)
  // Desktop: vlevo nahoře uvnitř content area (sidebar je vlevo, settings/bell vpravo)
  return (
    <div
      style={{
        position: "fixed",
        top: isMobile
          ? "max(14px, calc(env(safe-area-inset-top, 0px) + 10px))"
          : 16,
        left: isMobile ? 12 : "auto",
        // Na mobilu necháme ~150px volných napravo na 3 floating buttons
        right: isMobile ? 170 : "auto",
        // Na desktopu kotvíme zleva tak, aby seděl uvnitř content area (po sidebaru)
        // Sidebar je ~16rem; ponecháme bezpečnou rezervu.
        marginLeft: isMobile ? undefined : "calc(16rem + 24px)",
        zIndex: 25,
        maxWidth: isMobile ? undefined : 480,
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border shadow-lg"
        style={{
          background: "hsl(var(--card))",
          backdropFilter: "blur(12px) saturate(1.4)",
          WebkitBackdropFilter: "blur(12px) saturate(1.4)",
        }}
      >
        <Bell className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(var(--secondary))" }} />
        <p className="flex-1 text-xs sm:text-sm text-foreground leading-snug">
          {permission === "denied"
            ? "Oznámení jsou zablokovaná v prohlížeči."
            : "Povol oznámení, ať nezmeškáš schůzky."}
        </p>
        <button
          onClick={handleEnable}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
          style={{ background: "hsl(var(--secondary))", color: "white" }}
        >
          Povolit
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Skrýt"
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
