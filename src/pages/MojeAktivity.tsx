import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, subWeeks, format, isSameWeek, isAfter } from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

function Counter({
  value,
  editable,
  onDecrement,
  onIncrement,
}: {
  value: number;
  editable: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const [pressed, setPressed] = useState<"minus" | "plus" | null>(null);

  const handlePress = (side: "minus" | "plus", action: () => void) => {
    if (!editable) return;
    setPressed(side);
    action();
    setTimeout(() => setPressed(null), 150);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#dde8ea", borderRadius: 12, overflow: "hidden",
    }}>
      <button
        disabled={!editable}
        onPointerDown={() => handlePress("minus", onDecrement)}
        style={{
          width: 36, height: 36, border: "none",
          background: pressed === "minus" ? "#b8cfd4" : "transparent",
          cursor: editable ? "pointer" : "default",
          fontSize: 20,
          color: pressed === "minus" ? "#fc7c71" : "#00555f",
          fontWeight: 300,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: editable ? 1 : 0.4,
          transition: "background 0.1s, color 0.1s",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none",
        }}
      >
        −
      </button>
      <span style={{
        minWidth: 32, textAlign: "center",
        fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 17, color: "#0c2226",
        transition: "transform 0.1s",
        transform: pressed ? "scale(1.15)" : "scale(1)",
        display: "inline-block",
      }}>
        {value}
      </span>
      <button
        disabled={!editable}
        onPointerDown={() => handlePress("plus", onIncrement)}
        style={{
          width: 36, height: 36, border: "none",
          background: pressed === "plus" ? "#b8cfd4" : "transparent",
          cursor: editable ? "pointer" : "default",
          fontSize: 20,
          color: pressed === "plus" ? "#fc7c71" : "#00555f",
          fontWeight: 300,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: editable ? 1 : 0.4,
          transition: "background 0.1s, color 0.1s",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none",
        }}
      >
        +
      </button>
    </div>
  );
}

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

const ALL_DISPLAY_COLUMNS = ACTIVITY_COLUMNS;

const MojeAktivity = () => {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const now = new Date();
  // Mobile week navigation state
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  // Optimistic local values for instant UI feedback (mobile only)
  const [localValues, setLocalValues] = useState<Record<string, number>>({});
  const localValuesRef = useRef<Record<string, number>>({});
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

  // Sync local values from server whenever week changes or records arrive
  useEffect(() => {
    const rec = mobileRecord as any;
    const fresh: Record<string, number> = {
      fsa_planned: rec?.fsa_planned || 0,
      fsa_actual:  rec?.fsa_actual  || 0,
      ser_planned: rec?.ser_planned || 0,
      ser_actual:  rec?.ser_actual  || 0,
      poh_planned: rec?.poh_planned || 0,
      poh_actual:  rec?.poh_actual  || 0,
      ref_actual:  rec?.ref_actual  || 0,
      bj:          rec?.bj          || 0,
    };
    localValuesRef.current = fresh;
    setLocalValues(fresh);
  }, [mobileWeekStr, mobileRecord]);

  // Mobile change: instant local update + debounced server save
  const handleMobileChange = useCallback(
    (key: string, newVal: number) => {
      const updated = { ...localValuesRef.current, [key]: newVal };
      localValuesRef.current = updated;
      setLocalValues({ ...updated });

      const timerKey = "mobile-save-" + mobileWeekStr;
      if (debounceTimers.current[timerKey]) clearTimeout(debounceTimers.current[timerKey]);
      debounceTimers.current[timerKey] = setTimeout(() => {
        const existing = records.find((r) => r.week_start === mobileWeekStr);
        const record: any = { ...(existing || {}), week_start: mobileWeekStr, ...localValuesRef.current };
        upsertMutation.mutate(record);
      }, 800);
    },
    [mobileWeekStr, records, upsertMutation]
  );

  // Activities with both planned and actual keys
  const MOBILE_ACTIVITIES = [
    {
      label: "Analýzy",
      plannedKey: "fsa_planned" as ActivityKey,
      plannedLabel: "Domluvené",
      actualKey: "fsa_actual" as ActivityKey,
      actualLabel: "Proběhlé",
    },
    {
      label: "Poradka",
      plannedKey: "ser_planned" as ActivityKey,
      plannedLabel: "Domluvená",
      actualKey: "ser_actual" as ActivityKey,
      actualLabel: "Proběhlá",
    },
    {
      label: "Pohovory",
      plannedKey: "poh_planned" as ActivityKey,
      plannedLabel: "Domluvené",
      actualKey: "poh_actual" as ActivityKey,
      actualLabel: "Proběhlé",
    },
  ] as const;

  if (isMobile) {
    const bjValue = localValues.bj || 0;
    const refActual = localValues.ref_actual || 0;

    return (
      <div className="mobile-page">
        {/* Header */}
        <div className="mobile-page-header">
          <div className="mobile-page-title">Moje aktivity</div>
        </div>

        {/* Week navigation */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: "10px 16px",
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
              width: 32, height: 32, borderRadius: 10,
              background: "#dde8ea", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ChevronLeft size={15} color="#00555f" />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>
              {isMobileWeekEditable ? "Aktuální týden" : format(mobileWeekStart, "MMMM yyyy", { locale: cs })}
            </div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "#0c2226" }}>
              {format(mobileWeekStart, "d.M.", { locale: cs })} – {format(mobileWeekEnd, "d.M.", { locale: cs })}
            </div>
          </div>
          <button
            onClick={() => setMobileWeekOffset((o) => Math.min(0, o + 1))}
            disabled={mobileWeekOffset >= 0}
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: "#dde8ea",
              border: "none", cursor: mobileWeekOffset >= 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: mobileWeekOffset >= 0 ? 0.3 : 1,
            }}
          >
            <ChevronRight size={15} color="#00555f" />
          </button>
        </div>

        {/* Analýzy, Poradka, Pohovory — dual counters */}
        {MOBILE_ACTIVITIES.map(({ label, plannedKey, plannedLabel, actualKey, actualLabel }) => {
          const plannedVal = localValues[plannedKey] || 0;
          const actualVal = localValues[actualKey] || 0;
          return (
            <div key={label} className="mobile-activity-card">
              <div style={{
                fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15,
                color: "#0c2226", textAlign: "center", marginBottom: 14,
              }}>
                {label}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {/* Planned counter */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#8aadb3", fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
                    {plannedLabel}
                  </div>
                  <Counter
                    value={plannedVal}
                    editable={isMobileWeekEditable}
                    onDecrement={() => handleMobileChange(plannedKey, Math.max(0, plannedVal - 1))}
                    onIncrement={() => handleMobileChange(plannedKey, plannedVal + 1)}
                  />
                </div>
                {/* Divider */}
                <div style={{ width: 1, background: "#e1e9eb", alignSelf: "stretch" }} />
                {/* Actual counter */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#8aadb3", fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
                    {actualLabel}
                  </div>
                  <Counter
                    value={actualVal}
                    editable={isMobileWeekEditable}
                    onDecrement={() => handleMobileChange(actualKey, Math.max(0, actualVal - 1))}
                    onIncrement={() => handleMobileChange(actualKey, actualVal + 1)}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Doporučení + BJ — 2-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div className="mobile-activity-card" style={{ padding: 14 }}>
            <div style={{
              fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14,
              color: "#0c2226", textAlign: "center", marginBottom: 12,
            }}>
              Doporučení
            </div>
            <Counter
              value={refActual}
              editable={isMobileWeekEditable}
              onDecrement={() => handleMobileChange("ref_actual", Math.max(0, refActual - 1))}
              onIncrement={() => handleMobileChange("ref_actual", refActual + 1)}
            />
          </div>
          <div className="mobile-activity-card" style={{ padding: 14 }}>
            <div style={{
              fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14,
              color: "#0c2226", textAlign: "center", marginBottom: 12,
            }}>
              BJ
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#dde8ea", borderRadius: 12, padding: "8px 0",
            }}>
              <span style={{
                fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 22, color: "#00555f",
              }}>
                {bjValue}
              </span>
            </div>
          </div>
        </div>

        {/* Autosave */}
        <div style={{
          textAlign: "center", fontSize: 11, color: "#8aadb3",
          padding: "6px 0 12px", display: "flex",
          alignItems: "center", justifyContent: "center", gap: 5,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fc55d", flexShrink: 0 }} />
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
