import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Copy, RefreshCw, Link as LinkIcon, Check } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  orgUnitId: string;
  /** When true, shows "Rotovat" action (admin / owner). */
  canRotate?: boolean;
  /** Visual variant for embedding contexts. */
  variant?: "admin" | "team";
}

export function WorkspaceInviteLinkCard({ orgUnitId, canRotate = false, variant = "team" }: Props) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const { data: unit, isLoading } = useQuery({
    queryKey: ["org_unit_invite_token", orgUnitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_units")
        .select("id, name, invite_token")
        .eq("id", orgUnitId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; invite_token: string } | null;
    },
    enabled: !!orgUnitId,
  });

  const link = unit?.invite_token
    ? `${window.location.origin}/join/${unit.invite_token}`
    : "";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Odkaz zkopírován");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Nepodařilo se zkopírovat");
    }
  };

  const rotate = useMutation({
    mutationFn: async () => {
      // Generate a fresh 6-char workspace code (uppercase alphanumeric, no 0/O/1/I).
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      const newToken = Array.from(bytes)
        .map((b) => alphabet[b % alphabet.length])
        .join("");
      const { error } = await supabase
        .from("org_units")
        .update({ invite_token: newToken })
        .eq("id", orgUnitId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vygenerován nový odkaz");
      qc.invalidateQueries({ queryKey: ["org_unit_invite_token", orgUnitId] });
      setConfirmRotate(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  if (isLoading || !unit) {
    return (
      <div className="rounded-xl border border-border p-4 bg-card/50">
        <p className="text-xs text-muted-foreground">Načítání odkazu…</p>
      </div>
    );
  }

  const isAdmin = variant === "admin";

  return (
    <>
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          border: "1.5px solid #00abbd33",
          background: isAdmin ? "rgba(0,171,189,0.04)" : "var(--surface-2, rgba(0,171,189,0.05))",
        }}
      >
        <div className="flex items-start gap-2">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "#00abbd", color: "white" }}
          >
            <LinkIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-heading font-semibold text-sm" style={{ color: "var(--text-primary, #00555f)" }}>
              Pozvánkový odkaz workspace
            </h4>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted, #5a7378)" }}>
              Sdílej s novými členy. Otevře onboarding přímo do tohoto workspace.
            </p>
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={link}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 min-w-0 h-9 px-3 rounded-lg text-xs font-mono truncate outline-none"
            style={{
              border: "1px solid #00abbd33",
              background: "white",
              color: "#0c2226",
            }}
          />
          <button
            type="button"
            onClick={copy}
            className="h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            style={{
              background: copied ? "#22c55e" : "#00abbd",
              color: "white",
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Hotovo" : "Kopírovat"}
          </button>
          {canRotate && (
            <button
              type="button"
              onClick={() => setConfirmRotate(true)}
              className="h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border"
              style={{
                borderColor: "#cdd9db",
                color: "#5a7378",
                background: "white",
              }}
              title="Vygenerovat nový odkaz a zneplatnit starý"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Rotovat
            </button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vygenerovat nový odkaz?</AlertDialogTitle>
            <AlertDialogDescription>
              Stávající odkaz přestane fungovat. Lidé, kterým jsi ho už poslal/a, se přes
              něj nebudou moci zaregistrovat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rotate.mutate()}
              className="bg-[#fc7c71] hover:bg-[#fc7c71]/90"
            >
              Vygenerovat nový
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
