import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, Copy, Check, AlertTriangle, Smartphone } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";

export function PushSetupPanel() {
  const { permission, isSubscribed, enable, disable } = usePushSubscription();
  const [vapidPublic, setVapidPublic] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedPrivate, setGeneratedPrivate] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load current VAPID public key from app_config
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "vapid_public_key")
        .single();
      if (data?.value) {
        const v = typeof data.value === "string" ? data.value : String(data.value);
        setVapidPublic(v);
      }
    })();
  }, [generatedPrivate]);

  const handleGenerate = async () => {
    if (
      vapidPublic &&
      !confirm(
        "VAPID klíč už existuje. Vygenerování nového páru znehodnotí VŠECHNY existující push subscriptions (uživatelé budou muset push znovu povolit). Pokračovat?",
      )
    ) {
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-vapid-keys", {
        body: {},
      });
      if (error) throw error;
      const priv = (data as { privateKey?: string })?.privateKey;
      if (!priv) throw new Error("Funkce nevrátila private key");
      setGeneratedPrivate(priv);
      toast.success("Pár vygenerován. Zkopíruj private key do secretu.");
    } catch (e) {
      toast.error(`Chyba: ${e instanceof Error ? e.message : "neznámá"}`);
    } finally {
      setGenerating(false);
    }
  };

  const copyPrivate = async () => {
    if (!generatedPrivate) return;
    await navigator.clipboard.writeText(generatedPrivate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleSelf = async () => {
    setBusy(true);
    if (isSubscribed) {
      await disable();
      toast.success("Push odhlášeny");
    } else {
      const r = await enable();
      if (r.ok) toast.success("Push povoleny");
      else toast.error(r.error ?? "Chyba");
    }
    setBusy(false);
  };

  return (
    <Card className="border-accent/30">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "hsl(var(--accent) / 0.15)", color: "hsl(var(--accent))" }}
          >
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-heading font-semibold text-sm text-foreground">
              Web Push (VAPID)
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Aby šly notifikace doručit jako OS push do prohlížeče, je potřeba VAPID klíč.
            </p>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {vapidPublic ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Check className="h-3 w-3" /> Public key nakonfigurován
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/40">
                  <AlertTriangle className="h-3 w-3" /> Public key chybí
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
                {generating ? "Generuji…" : vapidPublic ? "Přegenerovat pár" : "Vygenerovat pár"}
              </Button>
            </div>

            {generatedPrivate && (
              <div className="mt-3 p-3 rounded-lg border border-warning/40 bg-warning/5">
                <p className="text-xs font-semibold text-foreground mb-1">
                  Private key — zkopíruj a vlož do secretu <code>VAPID_PRIVATE_KEY</code>:
                </p>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Tenhle klíč se zobrazí jen jednou. Po obnovení stránky ho už neuvidíš.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] bg-muted px-2 py-1.5 rounded break-all font-mono">
                    {generatedPrivate}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyPrivate}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Self push test */}
        <div className="border-t border-border pt-3 flex items-start gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
          >
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-heading font-semibold text-sm text-foreground">
              Tvůj push status
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {permission === "unsupported"
                ? "Tento prohlížeč push nepodporuje."
                : permission === "denied"
                  ? "Notifikace zablokovány v prohlížeči — povol je v nastavení stránky."
                  : isSubscribed
                    ? "Jsi přihlášen k push. Notifikace dorazí i mimo aplikaci."
                    : "Push nepřihlášeny. Klikni níže pro povolení."}
            </p>
            {permission !== "unsupported" && permission !== "denied" && (
              <Button
                size="sm"
                variant={isSubscribed ? "outline" : "default"}
                className="mt-2"
                onClick={handleToggleSelf}
                disabled={busy || !vapidPublic}
              >
                {busy ? "…" : isSubscribed ? "Odhlásit push" : "Povolit push"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
