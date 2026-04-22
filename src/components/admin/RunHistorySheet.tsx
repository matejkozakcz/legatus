import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock, Zap } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";

interface RunLogRow {
  id: string;
  rule_id: string | null;
  rule_name: string | null;
  trigger_event: string | null;
  run_at: string;
  matched: boolean;
  inserted_count: number;
  forced: boolean;
  error_message: string | null;
  duration_ms: number | null;
}

interface RunHistorySheetProps {
  open: boolean;
  onClose: () => void;
  ruleId: string | null;
  ruleName?: string;
}

export function RunHistorySheet({ open, onClose, ruleId, ruleName }: RunHistorySheetProps) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["notification_run_log", ruleId],
    queryFn: async () => {
      if (!ruleId) return [];
      const sb = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: unknown) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: unknown; error: Error | null }>;
              };
            };
          };
        };
      };
      const { data, error } = await sb
        .from("notification_run_log")
        .select("*")
        .eq("rule_id", ruleId)
        .order("run_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as RunLogRow[];
    },
    enabled: open && !!ruleId,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Historie běhů</SheetTitle>
          <SheetDescription>
            {ruleName ? `Pravidlo: ${ruleName}` : "Vyber pravidlo"} · posledních 50 běhů
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground p-4">Načítání…</p>}
          {!isLoading && rows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Pravidlo zatím nikdy neběželo. Vyzkoušej tlačítko „Otestovat teď".
              </p>
            </div>
          )}
          {rows.map((r) => {
            const ok = !r.error_message;
            return (
              <div
                key={r.id}
                className={`rounded-lg border p-3 ${ok ? "border-border bg-card" : "border-destructive/30 bg-destructive/5"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(142,76%,36%)] shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="text-sm font-medium text-foreground truncate">
                      {format(new Date(r.run_at), "d. MMM yyyy · HH:mm:ss", { locale: cs })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {r.forced && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Zap className="h-2.5 w-2.5" /> Test
                      </Badge>
                    )}
                    <Badge variant={ok ? "secondary" : "destructive"} className="text-[10px]">
                      {r.inserted_count} odesláno
                    </Badge>
                  </div>
                </div>
                {r.duration_ms !== null && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 ml-6">Trvání: {r.duration_ms} ms</p>
                )}
                {r.error_message && (
                  <p className="text-xs text-destructive mt-1.5 ml-6 font-mono break-all">{r.error_message}</p>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
