import { useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, subWeeks, format, isSameWeek, isAfter } from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

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
] as const;

type ActivityKey = (typeof ACTIVITY_COLUMNS)[number]["key"];

const BJ_COLUMN = { key: "bj" as const, header: "BJ" };

const ALL_DISPLAY_COLUMNS = [...ACTIVITY_COLUMNS, BJ_COLUMN] as const;

const MojeAktivity = () => {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const now = new Date();
  // Mobile week navigation state
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
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
        const updated = {
          week_start: weekStart,
          ...(existing || {}),
          [key]: value,
        };
        // Auto-calculate BJ = BJ FSA + BJ SER
        updated.bj = (updated.bj_fsa_actual || 0) + (updated.bj_ser_actual || 0);
        upsertMutation.mutate(updated);
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
    // BJ total is always sum of BJ FSA + BJ SER
    sums["bj"] = (sums["bj_fsa_actual"] || 0) + (sums["bj_ser_actual"] || 0);
    return sums;
  }, [records]);

  // Mobile-specific data
  const mobileWeekStart = useMemo(
    () => addWeeks(startOfWeek(now, { weekStartsOn: 1 }), mobileWeekOffset),
    [mobileWeekOffset]
  );
  const mobileWeekEnd = endOfWeek(mobileWeekStart, { weekStartsOn: 1 });
  const mobileWeekStr = format(mobileWeekStart, "yyyy-MM-dd");
  const mobileRecord = records.find((r) => r.week_start === mobileWeekStr);
  const isMobileWeekEditable = isSameWeek(mobileWeekStart, now, { weekStartsOn: 1 });

  const MOBILE_ACTIVITIES = [
    { key: "fsa_actual" as ActivityKey, label: "Analýzy (FSA)", planned: "fsa_planned", color: "#00abbd" },
    { key: "poh_actual" as ActivityKey, label: "Pohovory (POH)", planned: "poh_planned", color: "#7c6fcd" },
    { key: "ser_actual" as ActivityKey, label: "Poradka (SER)", planned: "ser_planned", color: "#2da44e" },
    { key: "ref_actual" as ActivityKey, label: "Doporučení (REF)", planned: "ref_planned", color: "#e08a00" },
  ] as const;

  if (isMobile) {
    return (
      <div className="mobile-page">
        {/* Header */}
        <div className="mobile-page-header">
          <div className="mobile-page-title">Moje aktivity</div>
          <div className="mobile-page-subtitle">Zadej výsledky za tento týden</div>
        </div>

        {/* Week navigation */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: "12px 16px",
            marginBottom: 12,
            border: "1px solid #e1e9eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={() => setMobileWeekOffset((o) => o - 1)}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: "#dde8ea", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ChevronLeft size={16} color="#00555f" />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#8aadb3" }}>
              {isMobileWeekEditable ? "Aktuální týden" : format(mobileWeekStart, "MMMM yyyy", { locale: cs })}
            </div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 14, color: "#0c2226" }}>
              {format(mobileWeekStart, "d.", { locale: cs })}–{format(mobileWeekEnd, "d. M.", { locale: cs })}
            </div>
          </div>
          <button
            onClick={() => setMobileWeekOffset((o) => Math.min(0, o + 1))}
            disabled={mobileWeekOffset >= 0}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: mobileWeekOffset >= 0 ? "#f0f4f5" : "#dde8ea",
              border: "none", cursor: mobileWeekOffset >= 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: mobileWeekOffset >= 0 ? 0.4 : 1,
            }}
          >
            <ChevronRight size={16} color="#00555f" />
          </button>
        </div>

        {/* Activity cards with counters */}
        {MOBILE_ACTIVITIES.map(({ key, label, planned: plannedKey, color }) => {
          const actualVal = (mobileRecord as any)?.[key] || 0;
          const plannedVal = (mobileRecord as any)?.[plannedKey] || 0;
          return (
            <div key={key} className="mobile-activity-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 14, color: "#0c2226" }}>
                  {label}
                </div>
                {plannedVal > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: `${color}1a`, color }}>
                    plán: {plannedVal}
                  </span>
                )}
              </div>
              {/* Counter row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "#8aadb3", width: 70 }}>Uskutečněno</span>
                <div style={{ display: "flex", alignItems: "center", background: "#dde8ea", borderRadius: 12, overflow: "hidden" }}>
                  <button
                    disabled={!isMobileWeekEditable}
                    onClick={() => isMobileWeekEditable && handleCellChange(mobileWeekStr, key, Math.max(0, actualVal - 1))}
                    style={{
                      width: 36, height: 36, border: "none", background: "transparent",
                      cursor: isMobileWeekEditable ? "pointer" : "default",
                      fontSize: 18, color: "#00555f", fontWeight: 300,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    −
                  </button>
                  <span
                    style={{
                      width: 44, textAlign: "center",
                      fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 16, color: "#0c2226",
                    }}
                  >
                    {actualVal}
                  </span>
                  <button
                    disabled={!isMobileWeekEditable}
                    onClick={() => isMobileWeekEditable && handleCellChange(mobileWeekStr, key, actualVal + 1)}
                    style={{
                      width: 36, height: 36, border: "none", background: "transparent",
                      cursor: isMobileWeekEditable ? "pointer" : "default",
                      fontSize: 18, color: "#00555f", fontWeight: 300,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* BJ total */}
        <div
          style={{
            background: "linear-gradient(135deg, #00555f 0%, #00777e 100%)",
            borderRadius: 18, padding: 16, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>BJ tento týden</div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 28, color: "white" }}>
              {((mobileRecord as any)?.bj_fsa_actual || 0) + ((mobileRecord as any)?.bj_ser_actual || 0)}
            </div>
          </div>
          <BarChart3 size={32} color="rgba(255,255,255,0.3)" />
        </div>

        {/* Autosave note */}
        <div style={{ textAlign: "center", fontSize: 11, color: "#8aadb3", padding: "8px 0 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fc55d" }} />
          Automaticky ukládáno
        </div>
      </div>
    );
  }

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
                {ALL_DISPLAY_COLUMNS.map((col) => (
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
                    {ALL_DISPLAY_COLUMNS.map((col) => {
                      const isBjTotal = col.key === "bj";
                      const cellValue = isBjTotal
                        ? ((record as any)?.bj_fsa_actual || 0) + ((record as any)?.bj_ser_actual || 0)
                        : (record as any)?.[col.key] || 0;
                      return (
                        <td key={col.key}>
                          {isEditable && !isBjTotal ? (
                            <input
                              type="number"
                              min={0}
                              defaultValue={cellValue}
                              onBlur={(e) => handleCellChange(weekStr, col.key as ActivityKey, parseInt(e.target.value) || 0)}
                            />
                          ) : (
                            cellValue
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="summary">
                <td className="text-left">Celkem</td>
                {ALL_DISPLAY_COLUMNS.map((col) => (
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
