import { useState } from "react";
import { useAppVersion } from "@/hooks/useAppVersion";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

/**
 * Sticky top banner shown when serverVersion !== localVersion.
 * Click "Aktualizovat" → clears caches/SW, preserves auth, reloads.
 */
export function UpdateBanner() {
  const { isStale, performUpdate } = useAppVersion();
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!isStale || dismissed) return null;

  const handleUpdate = async () => {
    setUpdating(true);
    await performUpdate();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        background: "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.92) 100%)",
        color: "hsl(var(--primary-foreground))",
        padding: "10px 16px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        paddingTop: "max(10px, calc(env(safe-area-inset-top, 0px) + 6px))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 auto", justifyContent: "center" }}>
        <RefreshCw size={18} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Je dostupná nová verze Legata</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleUpdate}
          disabled={updating}
          style={{ height: 32, fontWeight: 600 }}
        >
          {updating ? "Aktualizuji…" : "Aktualizovat"}
        </Button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Skrýt"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.85,
          }}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
