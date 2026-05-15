import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { fetchPeriodMeetings } from "@/hooks/useProductionClosure";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import {
  getProductionPeriodForMonth,
  getProductionPeriodMonth,
} from "@/lib/productionPeriod";
import { meetingTypeLabel, type MeetingType } from "@/components/MeetingFormFields";
import { X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const MONTH_NAMES = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

type RowState = {
  id: string;
  date: string;
  meeting_type: string;
  case_name: string | null;
  podepsane_bj: string;
  poradenstvi_status: "probehle" | "zrusene" | null;
  bj_recognized_date: string;
  initial: {
    podepsane_bj: number;
    poradenstvi_status: string | null;
    bj_recognized_date: string;
  };
  cancelled: boolean;
};

export interface UzaverkaModalProps {
  open: boolean;
  onClose: () => void;
  /** Volitelně přepsat období; default = předchozí. */
  year?: number;
  month?: number; // 0-indexed
}

export function UzaverkaModal({ open, onClose, year, month }: UzaverkaModalProps) {
  useBodyScrollLock(open);
  const { user } = useAuth();
  const qc = useQueryClient();

  // Default = předchozí produkční období
  const period = useMemo(() => {
    if (year != null && month != null) {
      return { year, month, ...getProductionPeriodForMonth(year, month) };
    }
    const cur = getProductionPeriodMonth(new Date());
    const m = cur.month === 0 ? 11 : cur.month - 1;
    const y = cur.month === 0 ? cur.year - 1 : cur.year;
    return { year: y, month: m, ...getProductionPeriodForMonth(y, m) };
  }, [year, month]);

  const periodLabel = `${MONTH_NAMES[period.month]} ${period.year}`;
  const startStr = format(period.start, "d. M.");
  const endStr = format(period.end, "d. M. yyyy");

  // Načíst schůzky a uzávěrku
  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ["uzaverka_meetings", user?.id, period.year, period.month],
    enabled: !!user?.id && open,
    queryFn: () => fetchPeriodMeetings(user!.id, period.start, period.end),
  });

  const { data: existingClosure } = useQuery({
    queryKey: ["uzaverka_closure", user?.id, period.year, period.month],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("production_closures" as any)
        .select("id, closed_at, notes")
        .eq("user_id", user!.id)
        .eq("period_year", period.year)
        .eq("period_month", period.month + 1)
        .maybeSingle();
      return data as any;
    },
  });

  const [rows, setRows] = useState<RowState[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setRows(
      (meetings as any[]).map((m) => ({
        id: m.id,
        date: m.date,
        meeting_type: m.meeting_type,
        case_name: m.case_name,
        podepsane_bj: String(m.podepsane_bj ?? 0),
        poradenstvi_status: (m.poradenstvi_status as any) ?? null,
        bj_recognized_date: m.bj_recognized_date || m.date,
        initial: {
          podepsane_bj: Number(m.podepsane_bj ?? 0),
          poradenstvi_status: m.poradenstvi_status ?? null,
          bj_recognized_date: m.bj_recognized_date || m.date,
        },
        cancelled: m.cancelled,
      }))
    );
    setNotes("");
  }, [meetings, open]);

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // Statistika
  const stats = useMemo(() => {
    let inPeriod = 0;
    let movedOut = 0;
    let count = rows.length;
    let signedCount = 0;
    let pendingCount = 0;
    for (const r of rows) {
      if (r.cancelled) continue;
      const bj = parseFloat(r.podepsane_bj) || 0;
      const inThisPeriod =
        r.bj_recognized_date >= format(period.start, "yyyy-MM-dd") &&
        r.bj_recognized_date <= format(period.end, "yyyy-MM-dd");
      if (bj > 0 && r.poradenstvi_status === "probehle") {
        if (inThisPeriod) inPeriod += bj;
        else movedOut += bj;
      }
      if (r.poradenstvi_status === "probehle") signedCount++;
      else if (r.poradenstvi_status == null) pendingCount++;
    }
    return { count, inPeriod, movedOut, signedCount, pendingCount };
  }, [rows, period]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Nepřihlášený uživatel");
      // Diff a aktualizace
      const changed = rows.filter((r) => {
        return (
          Number(r.podepsane_bj) !== r.initial.podepsane_bj ||
          r.poradenstvi_status !== r.initial.poradenstvi_status ||
          r.bj_recognized_date !== r.initial.bj_recognized_date
        );
      });
      for (const r of changed) {
        const { error } = await supabase
          .from("client_meetings")
          .update({
            podepsane_bj: parseFloat(r.podepsane_bj) || 0,
            poradenstvi_status: r.poradenstvi_status,
            bj_recognized_date: r.bj_recognized_date,
            outcome_recorded: true,
          } as any)
          .eq("id", r.id);
        if (error) throw error;
      }
      // Uzavřít období
      const payload = {
        user_id: user.id,
        period_year: period.year,
        period_month: period.month + 1,
        closed_by: user.id,
        notes: notes.trim() || null,
        closed_at: new Date().toISOString(),
      };
      if (existingClosure?.id) {
        const { error } = await supabase
          .from("production_closures" as any)
          .update(payload as any)
          .eq("id", existingClosure.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("production_closures" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_closure_status"] });
      qc.invalidateQueries({ queryKey: ["uzaverka_closure"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["activity_records"] });
      toast.success(`Uzávěrka pro ${periodLabel} uložena`);
      onClose();
    },
    onError: (e: any) => {
      toast.error(e?.message || "Chyba při ukládání uzávěrky");
    },
  });

  if (!open) return null;

  const periodStartStr = format(period.start, "yyyy-MM-dd");
  const periodEndStr = format(period.end, "yyyy-MM-dd");

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-background shadow-2xl mx-4 overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - 64px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border"
          style={{ background: "var(--background, white)" }}
        >
          <div>
            <h2 className="font-heading text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Uzávěrka produkce — {periodLabel}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Období {startStr} – {endStr}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {existingClosure && (
            <div
              className="mb-4 p-3 rounded-xl flex items-start gap-2"
              style={{ background: "rgba(34,197,94,0.08)", color: "#16a34a" }}
            >
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong>Období je uzavřeno</strong>
                {existingClosure.closed_at &&
                  ` (${format(parseISO(existingClosure.closed_at), "d. M. yyyy HH:mm", { locale: cs })})`}
                . Změny přepíší předchozí uzávěrku.
              </div>
            </div>
          )}

          {/* Souhrn */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            <StatBox label="Schůzek" value={String(stats.count)} />
            <StatBox label="Schválené" value={String(stats.signedCount)} color="#22c55e" />
            <StatBox label="Čekající" value={String(stats.pendingCount)} color="#f59e0b" />
            <StatBox label="BJ v období" value={String(stats.inPeriod)} color="#00abbd" />
          </div>

          {stats.movedOut > 0 && (
            <div
              className="mb-4 p-2.5 rounded-lg flex items-center gap-2 text-xs"
              style={{ background: "rgba(252,124,113,0.08)", color: "#fc7c71" }}
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>{stats.movedOut} BJ</strong> bude přesunuto mimo toto období (datum uznání je jinde).
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              V tomto období žádné poradenství / analýzy / servisy.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-2">Klient</th>
                    <th className="text-left py-2 px-2">Typ</th>
                    <th className="text-left py-2 px-2">Datum</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2 px-2">BJ</th>
                    <th className="text-left py-2 pl-2">Uznáno k</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const inPeriod =
                      r.bj_recognized_date >= periodStartStr &&
                      r.bj_recognized_date <= periodEndStr;
                    return (
                      <tr key={r.id} className="border-b border-border/60">
                        <td
                          className="py-2 pr-2 font-medium"
                          style={{ color: "var(--text-primary)", maxWidth: 150 }}
                        >
                          <div className="truncate" title={r.case_name || "—"}>
                            {r.case_name || "—"}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs">
                          {meetingTypeLabel(r.meeting_type as MeetingType)}
                        </td>
                        <td className="py-2 px-2 text-xs whitespace-nowrap">
                          {format(parseISO(r.date), "d. M.", { locale: cs })}
                        </td>
                        <td className="py-2 px-2">
                          {r.cancelled ? (
                            <span className="text-xs text-muted-foreground">Zrušeno</span>
                          ) : (
                            <select
                              value={r.poradenstvi_status ?? ""}
                              onChange={(e) =>
                                updateRow(r.id, {
                                  poradenstvi_status:
                                    (e.target.value as RowState["poradenstvi_status"]) || null,
                                })
                              }
                              className="text-xs rounded border border-input bg-background px-1.5 py-1"
                            >
                              <option value="">Čeká</option>
                              <option value="probehle">Schváleno</option>
                              <option value="zrusene">Zamítnuto</option>
                            </select>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            value={r.podepsane_bj}
                            onChange={(e) => updateRow(r.id, { podepsane_bj: e.target.value })}
                            className="w-16 text-xs text-right rounded border border-input bg-background px-2 py-1"
                            disabled={r.cancelled || r.poradenstvi_status === "zrusene"}
                          />
                        </td>
                        <td className="py-2 pl-2">
                          <input
                            type="date"
                            value={r.bj_recognized_date}
                            onChange={(e) => updateRow(r.id, { bj_recognized_date: e.target.value })}
                            className="text-xs rounded border border-input bg-background px-1.5 py-1"
                            style={{
                              color: inPeriod ? "var(--text-primary)" : "#fc7c71",
                              fontWeight: inPeriod ? 400 : 600,
                            }}
                            disabled={r.cancelled || r.poradenstvi_status === "zrusene"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Poznámka */}
          <div className="mt-5">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Poznámka k uzávěrce (volitelné)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
              placeholder="Např. Klient X podepíše až 5. 11."
            />
          </div>
        </div>

        {/* Akce */}
        <div
          className="sticky bottom-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-border"
          style={{ background: "var(--background, white)" }}
        >
          <button
            onClick={onClose}
            className="rounded-lg border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Zavřít
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || isLoading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2"
            style={{ background: "#fc7c71" }}
          >
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {existingClosure ? "Aktualizovat uzávěrku" : `Uzavřít ${periodLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border p-2.5 text-center">
      <div
        className="text-lg font-bold font-heading"
        style={{ color: color || "var(--text-primary)" }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}
