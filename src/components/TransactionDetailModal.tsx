import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { History } from "lucide-react";
import type { TransactionRow } from "@/pages/Transakce";
import { useAuth } from "@/contexts/AuthContext";

export function TransactionDetailModal({
  transaction,
  onClose,
}: {
  transaction: TransactionRow;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [bj, setBj] = useState(String(transaction.bj));
  const [reason, setReason] = useState("");

  useEffect(() => {
    setBj(String(transaction.bj));
    setReason("");
  }, [transaction]);

  const { data: history = [] } = useQuery({
    queryKey: ["bj_audit", transaction.source, transaction.source_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bj_audit_log")
        .select("*")
        .eq("source", transaction.source)
        .eq("source_id", transaction.source_id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Nepřihlášen");
      const newBj = Number(bj);
      if (isNaN(newBj) || newBj < 0) throw new Error("Neplatná hodnota BJ");
      const oldBj = transaction.bj;

      if (transaction.source === "meeting") {
        const { error } = await supabase
          .from("client_meetings")
          .update({ podepsane_bj: newBj })
          .eq("id", transaction.source_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("manual_bj_adjustments")
          .update({ bj: newBj })
          .eq("id", transaction.source_id);
        if (error) throw error;
      }

      // Audit
      await supabase.from("bj_audit_log").insert({
        source: transaction.source,
        source_id: transaction.source_id,
        user_id: transaction.user_id,
        old_bj: oldBj,
        new_bj: newBj,
        action: newBj === 0 ? "zero" : "update",
        changed_by: user.id,
        change_reason: reason || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transakce_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["transakce_manuals"] });
      queryClient.invalidateQueries({ queryKey: ["bj_audit"] });
      toast.success("BJ aktualizováno");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setToZero = () => setBj("0");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detail transakce</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40">
            <div>
              <div className="text-xs text-muted-foreground">Uživatel</div>
              <div className="font-medium">{transaction.user_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Datum</div>
              <div className="font-medium">
                {format(parseISO(transaction.date), "d.M.yyyy", { locale: cs })}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Typ</div>
              <div className="font-medium">{transaction.meeting_type || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Zdroj</div>
              <div className="font-medium">
                {transaction.source === "manual" ? "Ruční záznam" : "Schůzka"}
              </div>
            </div>
            {transaction.case_name && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Byznys případ</div>
                <div className="font-medium">{transaction.case_name}</div>
              </div>
            )}
            {transaction.poznamka && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Poznámka</div>
                <div className="text-xs">{transaction.poznamka}</div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="bj-edit">Hodnota BJ</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="bj-edit"
                type="number"
                step="0.1"
                min="0"
                value={bj}
                onChange={(e) => setBj(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={setToZero}>
                Vynulovat
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Záznamy nelze mazat, pouze přepsat na 0.
            </p>
          </div>

          <div>
            <Label htmlFor="reason">Důvod změny (volitelné)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pro audit log…"
              maxLength={500}
              rows={2}
            />
          </div>

          {history.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                Historie změn ({history.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="text-xs flex items-center justify-between gap-2 p-2 rounded bg-muted/40">
                    <span className="text-muted-foreground">
                      {format(parseISO(h.created_at), "d.M.yyyy HH:mm", { locale: cs })}
                    </span>
                    <span className="tabular-nums">
                      {Number(h.old_bj ?? 0).toFixed(1)} → <strong>{Number(h.new_bj ?? 0).toFixed(1)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || Number(bj) === transaction.bj}
            style={{ background: "#fc7c71", color: "#fff" }}
            className="hover:opacity-90"
          >
            {mutation.isPending ? "Ukládám…" : "Uložit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
