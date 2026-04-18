import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, XCircle, SkipForward } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

interface RuleRunRow {
  id: string;
  rule_id: string;
  rule_name: string;
  ran_at: string;
  matched: boolean;
  recipients_count: number;
  inserted_count: number;
  failed_count: number;
  push_sent_count: number;
  status: "ok" | "partial" | "error" | "skipped";
  error_message: string | null;
}

interface RuleAggregate {
  rule_id: string;
  rule_name: string;
  matched_runs: number;
  total_inserted: number;
  total_failed: number;
  total_push: number;
  errors: number;
  skipped: number;
  last_run: string | null;
  last_error: string | null;
  last_status: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  partial: { label: "Částečně", cls: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  error: { label: "Chyba", cls: "bg-red-100 text-red-700", icon: XCircle },
  skipped: { label: "Přeskočeno", cls: "bg-slate-100 text-slate-600", icon: SkipForward },
};

export function NotificationDiagnosticsTab() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["notification_rule_runs_7d"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const { data, error } = await supabase
        .from("notification_rule_runs" as any)
        .select("*")
        .gte("ran_at", since.toISOString())
        .order("ran_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as unknown as RuleRunRow[];
    },
    refetchInterval: 30_000,
  });

  const aggregates: RuleAggregate[] = useMemo(() => {
    const map = new Map<string, RuleAggregate>();
    for (const r of runs) {
      let agg = map.get(r.rule_id);
      if (!agg) {
        agg = {
          rule_id: r.rule_id,
          rule_name: r.rule_name,
          matched_runs: 0,
          total_inserted: 0,
          total_failed: 0,
          total_push: 0,
          errors: 0,
          skipped: 0,
          last_run: null,
          last_error: null,
          last_status: null,
        };
        map.set(r.rule_id, agg);
      }
      if (r.matched && r.status !== "skipped") agg.matched_runs++;
      agg.total_inserted += r.inserted_count;
      agg.total_failed += r.failed_count;
      agg.total_push += r.push_sent_count;
      if (r.status === "error") agg.errors++;
      if (r.status === "skipped") agg.skipped++;
      if (!agg.last_run || new Date(r.ran_at) > new Date(agg.last_run)) {
        agg.last_run = r.ran_at;
        agg.last_status = r.status;
        if (r.error_message) agg.last_error = r.error_message;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.rule_name.localeCompare(b.rule_name, "cs"));
  }, [runs]);

  const totals = useMemo(() => {
    return aggregates.reduce(
      (acc, a) => {
        acc.runs += a.matched_runs;
        acc.inserted += a.total_inserted;
        acc.failed += a.total_failed;
        acc.errors += a.errors;
        return acc;
      },
      { runs: 0, inserted: 0, failed: 0, errors: 0 },
    );
  }, [aggregates]);

  if (isLoading) return <div className="p-8 text-muted-foreground">Načítání diagnostiky...</div>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Běhy (7 dní)" value={totals.runs} />
        <SummaryCard label="Notifikace odeslané" value={totals.inserted} positive />
        <SummaryCard label="Chyby insertu" value={totals.failed} negative={totals.failed > 0} />
        <SummaryCard label="Chybové běhy" value={totals.errors} negative={totals.errors > 0} />
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Přehled per pravidlo (posledních 7 dní)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aggregates.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Za posledních 7 dní žádné běhy. Pravidla buď ještě nedoběhla, nebo neexistují.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Pravidlo</th>
                    <th className="py-2 pr-3 font-medium text-center">Běhy</th>
                    <th className="py-2 pr-3 font-medium text-center">Insert</th>
                    <th className="py-2 pr-3 font-medium text-center">Chyby</th>
                    <th className="py-2 pr-3 font-medium text-center">Push</th>
                    <th className="py-2 pr-3 font-medium text-center">Přeskočeno</th>
                    <th className="py-2 pr-3 font-medium">Poslední běh</th>
                    <th className="py-2 pr-3 font-medium">Poslední chyba</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregates.map((a) => {
                    const meta = STATUS_META[a.last_status || "ok"] || STATUS_META.ok;
                    const Icon = meta.icon;
                    return (
                      <tr key={a.rule_id} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{a.rule_name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.cls}`}
                            >
                              <Icon className="h-2.5 w-2.5" /> {meta.label}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-center tabular-nums">{a.matched_runs}</td>
                        <td className="py-2 pr-3 text-center tabular-nums text-emerald-700">
                          {a.total_inserted}
                        </td>
                        <td
                          className={`py-2 pr-3 text-center tabular-nums ${
                            a.total_failed > 0 ? "text-red-700 font-medium" : ""
                          }`}
                        >
                          {a.total_failed}
                        </td>
                        <td className="py-2 pr-3 text-center tabular-nums">{a.total_push}</td>
                        <td className="py-2 pr-3 text-center tabular-nums text-muted-foreground">
                          {a.skipped}
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {a.last_run
                            ? formatDistanceToNow(new Date(a.last_run), { addSuffix: true, locale: cs })
                            : "—"}
                        </td>
                        <td className="py-2 pr-3 text-xs text-red-700 max-w-[280px] truncate" title={a.last_error || ""}>
                          {a.last_error || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent error log */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Posledních 20 záznamů</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs">
            {runs.slice(0, 20).map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.ok;
              return (
                <div key={r.id} className="flex items-start gap-2 py-1 border-b border-border/30 last:border-0">
                  <span
                    className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 w-24 tabular-nums">
                    {new Date(r.ran_at).toLocaleString("cs-CZ", { hour12: false })}
                  </span>
                  <span className="font-medium shrink-0">{r.rule_name}</span>
                  <span className="text-muted-foreground">
                    {r.inserted_count}/{r.recipients_count} odesláno
                    {r.failed_count > 0 && <span className="text-red-700"> · {r.failed_count} chyb</span>}
                    {r.push_sent_count > 0 && <span> · {r.push_sent_count} push</span>}
                  </span>
                  {r.error_message && (
                    <span className="text-red-700 truncate" title={r.error_message}>
                      — {r.error_message}
                    </span>
                  )}
                </div>
              );
            })}
            {runs.length === 0 && <div className="text-muted-foreground py-3">Zatím žádné záznamy.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`text-2xl font-semibold tabular-nums mt-0.5 ${
            negative ? "text-red-700" : positive ? "text-emerald-700" : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
