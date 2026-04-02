import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BarChart3 } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addWeeks,
  format,
} from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { useMemo } from "react";

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

const MemberActivity = () => {
  const { userId } = useParams<{ userId: string }>();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const { data: memberProfile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const weeks = useMemo(() => {
    const result: Date[] = [];
    let ws = startOfWeek(monthStart, { weekStartsOn: 1 });
    while (ws <= monthEnd) {
      result.push(ws);
      ws = addWeeks(ws, 1);
    }
    return result;
  }, []);

  const { data: records = [] } = useQuery({
    queryKey: ["activity_records", userId, "month", format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const firstWeek = startOfWeek(monthStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from("activity_records")
        .select("*")
        .eq("user_id", userId!)
        .gte("week_start", format(firstWeek, "yyyy-MM-dd"))
        .lte("week_start", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const stats = useMemo(() => {
    const sum = (key: string) => records.reduce((acc: number, r: any) => acc + (r[key] || 0), 0);
    return {
      fsa: { actual: sum("fsa_actual"), planned: sum("fsa_planned") },
      poh: { actual: sum("poh_actual"), planned: sum("poh_planned") },
      ser: { actual: sum("ser_actual"), planned: sum("ser_planned") },
      ref: { actual: sum("ref_actual"), planned: sum("ref_planned") },
    };
  }, [records]);

  const columnSums = useMemo(() => {
    const sums: Record<string, number> = {};
    ACTIVITY_COLUMNS.forEach((col) => {
      sums[col.key] = records.reduce((acc, r: any) => acc + (r[col.key] || 0), 0);
    });
    sums["bj"] = (sums["bj_fsa_actual"] || 0) + (sums["bj_ser_actual"] || 0);
    return sums;
  }, [records]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/tym" style={{ color: "#8aadb3" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <BarChart3 className="h-6 w-6" style={{ color: "#0c2226" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>
          {memberProfile?.full_name || "Načítání..."} — Moje aktivity
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Analýzy" actual={stats.fsa.actual} planned={stats.fsa.planned} actualLabel="proběhlých" plannedLabel="domluvenných" />
        <StatCard label="Pohovory" actual={stats.poh.actual} planned={stats.poh.planned} actualLabel="proběhlých" plannedLabel="naplánovaných" />
        <StatCard label="Poradka" actual={stats.ser.actual} planned={stats.ser.planned} actualLabel="proběhlých" plannedLabel="naplánovaných" />
        <StatCard label="Doporučení" actual={stats.ref.actual} planned={stats.ref.planned} actualLabel="vybraných" plannedLabel="naplánovaných" />
      </div>

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
                return (
                  <tr key={weekStr} className="past">
                    <td className="text-left whitespace-nowrap font-medium">
                      {format(weekStart, "d.", { locale: cs })}–{format(weekEnd, "d. M.", { locale: cs })}
                    </td>
                    {ACTIVITY_COLUMNS.map((col) => {
                      const val = col.key === "bj"
                        ? ((record as any)?.bj_fsa_actual || 0) + ((record as any)?.bj_ser_actual || 0)
                        : (record as any)?.[col.key] || 0;
                      return <td key={col.key}>{val}</td>;
                    })}
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

export default MemberActivity;
