import { useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Pencil } from "lucide-react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, format, isSameWeek, isAfter } from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { toast } from "sonner";

const ACTIVITY_COLUMNS = [
  { key: "fsa_planned", header: "FSA Dom." },
  { key: "fsa_actual", header: "FSA Usc." },
  { key: "por_planned", header: "POR Dom." },
  { key: "por_actual", header: "POR Usc." },
  { key: "kl_fsa_actual", header: "KL z FSA" },
  { key: "ser_planned", header: "SER Dom." },
  { key: "ser_actual", header: "SER Usc." },
  { key: "poh_planned", header: "POH Dom." },
  { key: "poh_actual", header: "POH Usc." },
  { key: "ref_planned", header: "REF Dom." },
  { key: "ref_actual", header: "REF Usc." },
  { key: "dop_kl_actual", header: "DOP KL" },
  { key: "bj_fsa_actual", header: "BJ FSA" },
  { key: "bj_ser_actual", header: "BJ SER" },
  { key: "bj", header: "BJ" },
] as const;

type ActivityKey = (typeof ACTIVITY_COLUMNS)[number]["key"];

const MojeAktivity = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Get weeks in current month
  const weeks = useMemo(() => {
    const result: Date[] = [];
    let weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    while (weekStart <= monthEnd) {
      result.push(weekStart);
      weekStart = addWeeks(weekStart, 1);
    }
    return result;
  }, []);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["activity_records", profile?.id, "month", format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      if (!profile?.id) return [];
      const firstWeek = startOfWeek(monthStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("activity_records")
        .select("*")
        .eq("user_id", profile.id)
        .gte("week_start", format(firstWeek, "yyyy-MM-dd"))
        .lte("week_start", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const upsertMutation = useMutation({
    mutationFn: async (record: { week_start: string; [key: string]: any }) => {
      if (!profile?.id) throw new Error("No user");
      const { error } = await supabase
        .from("activity_records")
        .upsert({ user_id: profile.id, ...record }, { onConflict: "user_id,week_start" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
    },
    onError: () => {
      toast.error("Nepodařilo se uložit změny.");
    },
  });

  const handleCellChange = useCallback(
    (weekStart: string, key: ActivityKey, value: number) => {
      const timerKey = `${weekStart}-${key}`;
      if (debounceTimers.current[timerKey]) {
        clearTimeout(debounceTimers.current[timerKey]);
      }
      debounceTimers.current[timerKey] = setTimeout(() => {
        const existing = records.find((r) => r.week_start === weekStart);
        upsertMutation.mutate({
          week_start: weekStart,
          ...(existing || {}),
          [key]: value,
        });
      }, 500);
    },
    [records, upsertMutation],
  );

  // Stats for the month
  const stats = useMemo(() => {
    const sum = (key: string) => records.reduce((acc: number, r: any) => acc + (r[key] || 0), 0);
    return {
      fsa: { actual: sum("fsa_actual"), planned: sum("fsa_planned") },
      poh: { actual: sum("poh_actual"), planned: sum("poh_planned") },
      ser: { actual: sum("ser_actual"), planned: sum("ser_planned") },
      ref: { actual: sum("ref_actual"), planned: sum("ref_planned") },
    };
  }, [records]);

  // Column sums
  const columnSums = useMemo(() => {
    const sums: Record<string, number> = {};
    ACTIVITY_COLUMNS.forEach((col) => {
      sums[col.key] = records.reduce((acc, r: any) => acc + (r[col.key] || 0), 0);
    });
    return sums;
  }, [records]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6" style={{ color: "#0c2226" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>
          Moje aktivity
        </h1>
      </div>

      {/* Stats */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226" }}>
            Moje aktivity
          </h2>
          <Pencil className="h-4 w-4" style={{ color: "#8aadb3" }} />
        </div>

        <div className="flex items-center gap-2">
          <span className="chip chip-teal-active">Tento měsíc</span>
          <span className="font-body ml-4" style={{ fontSize: 12, color: "#8aadb3" }}>
            Období od {format(monthStart, "d. M. yyyy", { locale: cs })} do{" "}
            {format(monthEnd, "d. M. yyyy", { locale: cs })}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Analýzy"
            actual={stats.fsa.actual}
            planned={stats.fsa.planned}
            actualLabel="proběhlých"
            plannedLabel="domluvenných"
          />
          <StatCard
            label="Pohovory"
            actual={stats.poh.actual}
            planned={stats.poh.planned}
            actualLabel="proběhlých"
            plannedLabel="naplánovaných"
          />
          <StatCard
            label="Poradka"
            actual={stats.ser.actual}
            planned={stats.ser.planned}
            actualLabel="proběhlých"
            plannedLabel="naplánovaných"
          />
          <StatCard
            label="Doporučení"
            actual={stats.ref.actual}
            planned={stats.ref.planned}
            actualLabel="vybraných"
            plannedLabel="naplánovaných"
          />
        </div>
      </section>

      {/* Activity table */}
      <section className="legatus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="activity-table">
            <thead>
              <tr>
                <th className="text-left">Týden</th>
                {ACTIVITY_COLUMNS.map((col) => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((weekStart) => {
                const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
                const weekStr = format(weekStart, "yyyy-MM-dd");
                const record = records.find((r) => r.week_start === weekStr);
                const isCurrentWeek = isSameWeek(weekStart, now, { weekStartsOn: 1 });
                const isPast = !isCurrentWeek && !isAfter(weekStart, now);
                const isEditable = isCurrentWeek;

                return (
                  <tr key={weekStr} className={isCurrentWeek ? "current" : isPast ? "past" : ""}>
                    <td className="text-left whitespace-nowrap font-medium">
                      {format(weekStart, "d.", { locale: cs })}–{format(weekEnd, "d. M.", { locale: cs })}
                    </td>
                    {ACTIVITY_COLUMNS.map((col) => (
                      <td key={col.key}>
                        {isEditable ? (
                          <input
                            type="number"
                            min={0}
                            defaultValue={(record as any)?.[col.key] || 0}
                            onBlur={(e) => handleCellChange(weekStr, col.key, parseInt(e.target.value) || 0)}
                          />
                        ) : (
                          (record as any)?.[col.key] || 0
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="summary">
                <td className="text-left">Celkem</td>
                {ACTIVITY_COLUMNS.map((col) => (
                  <td key={col.key}>{columnSums[col.key]}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default MojeAktivity;
