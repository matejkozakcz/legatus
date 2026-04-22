import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";

const DISMISS_KEY = "legatus_push_optin_dismissed_at";
const DISMISS_DAYS = 7; // re-show after a week

export function PushOptInBanner() {
  const { user } = useAuth();
  const { permission, isSubscribed, isLoading, enable } = usePushSubscription();
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) {
        setDismissed(false);
        return;
      }
      const ts = parseInt(raw, 10);
      const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
      setDismissed(ageDays < DISMISS_DAYS);
    } catch {
      setDismissed(false);
    }
  }, [user?.id]);

  if (
    !user ||
    isLoading ||
    dismissed ||
    isSubscribed ||
    permission === "granted" ||
    permission === "denied" ||
    permission === "unsupported"
  ) {
    return null;
  }

  const handleEnable = async () => {
    setBusy(true);
    const res = await enable();
    setBusy(false);
    if (res.ok) {
      toast.success("Push notifikace povoleny");
    } else {
      toast.error(res.error ?? "Nepodařilo se povolit");
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,520px)] rounded-2xl shadow-xl border border-border bg-card p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4"
      role="dialog"
      aria-label="Povolit push notifikace"
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: "hsl(var(--accent) / 0.15)", color: "hsl(var(--accent))" }}
      >
        <Bell className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-sm text-foreground">
          Povolit push notifikace?
        </p>
        <p className="text-xs text-muted-foreground">
          Dej si notifikace o povýšení, schůzkách a důležitých událostech přímo do prohlížeče.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleEnable}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          style={{ background: "hsl(var(--primary))" }}
        >
          {busy ? "Zapínám…" : "Povolit"}
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          aria-label="Zavřít"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
