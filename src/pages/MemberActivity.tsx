import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addWeeks,
  format,
  isSameWeek,
} from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

const ROLE_COLORS: Record<string, string> = {
  vedouci: "#00555f",
  budouci_vedouci: "#00abbd",
  garant: "#fc7c71",
  ziskatel: "#f5a623",
  novacek: "#8e8e93",
};

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

const ALL_DISPLAY_COLUMNS = [...ACTIVITY_COLUMNS, { key: "bj" as const, header: "BJ" }] as const;

const MOBILE_ACTIVITIES = [
  { label: "Analýzy", plannedKey: "fsa_planned", actualKey: "fsa_actual", plannedLabel: "Domluvené", actualLabel: "Proběhlé" },
  { label: "Poradka", plannedKey: "ser_planned", actualKey: "ser_actual", plannedLabel: "Domluvená", actualLabel: "Proběhlá" },
  { label: "Pohovory", plannedKey: "poh_planned", actualKey: "poh_actual", plannedLabel: "Domluvené", actualLabel: "Proběhlé" },
] as const;

const MemberActivity = () => {
  const { userId } = useParams<{ userId: string }>();
  const isMobile = useIsMobile();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);

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

  // Info & Postinfo meeting counts for vedouci/BV members in current production period
  const isVedouciOrBV = memberProfile?.role === "vedouci" || memberProfile?.role === "budouci_vedouci";
  const { data: infoPostCounts = { info: 0, postinfo: 0 } } = useQuery({
    queryKey: ["member_info_post", userId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      if (!userId) return { info: 0, postinfo: 0 };
      const { data } = await supabase
        .from("client_meetings")
        .select("meeting_type")
        .eq("user_id", userId)
        .eq("cancelled", false)
        .in("meeting_type", ["INFO", "POST"])
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));
      const rows = data || [];
      return {
        info: rows.filter((r: any) => r.meeting_type === "INFO").length,
        postinfo: rows.filter((r: any) => r.meeting_type === "POST").length,
      };
    },
    enabled: !!userId && isVedouciOrBV,
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

  // Mobile week navigation
  const mobileWeekStart = useMemo(
    () => addWeeks(startOfWeek(now, { weekStartsOn: 1 }), mobileWeekOffset),
    [mobileWeekOffset],
  );
  const mobileWeekEnd = endOfWeek(mobileWeekStart, { weekStartsOn: 1 });
  const mobileWeekStr = format(mobileWeekStart, "yyyy-MM-dd");
  const mobileRecord = records.find((r) => r.week_start === mobileWeekStr);
  const isCurrentWeek = isSameWeek(mobileWeekStart, now, { weekStartsOn: 1 });

  if (isMobile) {
    const rec = mobileRecord as any;
    const refPlanned = rec?.ref_planned || 0;
    const refActual = rec?.ref_actual || 0;
    const dopKl = rec?.dop_kl_actual || 0;
    const bjValue = ((rec?.bj_fsa_actual || 0) + (rec?.bj_ser_actual || 0));
    const klFsa = rec?.kl_fsa_actual || 0;

    const formatVal = (actual: number, planned: number) =>
      planned > 0 ? `${actual} / ${planned}` : `${actual}`;

    return (
      <div className="mobile-page">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Link to="/tym" style={{ color: "#00555f", display: "flex" }}>
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--text-primary)" }}>
              {memberProfile?.full_name || "Načítání..."}
            </div>
            {memberProfile?.role && (
              <Badge
                style={{
                  background: ROLE_COLORS[memberProfile.role] || "#8e8e93",
                  color: "#fff",
                  fontSize: 10,
                  padding: "1px 8px",
                  borderRadius: 999,
                  border: "none",
                }}
              >
                {ROLE_LABELS[memberProfile.role] || memberProfile.role}
              </Badge>
            )}
          </div>
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
              width: 32, height: 32, borderRadius: 10, background: "#dde8ea",
              border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ChevronLeft size={15} color="#00555f" />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>
              {isCurrentWeek ? "Aktuální týden" : format(mobileWeekStart, "MMMM yyyy", { locale: cs })}
            </div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
              {format(mobileWeekStart, "d.M.", { locale: cs })} – {format(mobileWeekEnd, "d.M.", { locale: cs })}
            </div>
          </div>
          <button
            onClick={() => setMobileWeekOffset((o) => Math.min(0, o + 1))}
            disabled={mobileWeekOffset >= 0}
            style={{
              width: 32, height: 32, borderRadius: 10, background: "#dde8ea",
              border: "none", cursor: mobileWeekOffset >= 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: mobileWeekOffset >= 0 ? 0.3 : 1,
            }}
          >
            <ChevronRight size={15} color="#00555f" />
          </button>
        </div>

        {/* Activity cards — read-only */}
        {MOBILE_ACTIVITIES.map(({ label, plannedKey, actualKey }) => {
          const plannedVal = rec?.[plannedKey] || 0;
          const actualVal = rec?.[actualKey] || 0;
          return (
            <div key={label} className="mobile-activity-card">
              <div style={{
                fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15,
                color: "var(--text-primary)", textAlign: "center", marginBottom: 10,
              }}>
                {label}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#00abbd", fontWeight: 600, marginBottom: 6 }}>
                    Domluveno
                  </div>
                  <div style={{
                    background: "#dde8ea", borderRadius: 12, padding: "8px 0",
                    fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--text-primary)",
                  }}>
                    {plannedVal}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#00abbd", fontWeight: 600, marginBottom: 6 }}>
                    Splněno
                  </div>
                  <div style={{
                    background: "#dde8ea", borderRadius: 12, padding: "8px 0",
                    fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--text-primary)",
                  }}>
                    {actualVal}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Bottom row: Doporučení, KL z FSA, BJ */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Doporučení", value: formatVal(refActual, refPlanned) },
            { label: "KL z FSA", value: klFsa },
            { label: "BJ", value: bjValue },
          ].map(({ label, value }) => (
            <div key={label} style={{
              flex: 1, background: "#ffffff", borderRadius: 16, padding: "12px 8px",
              border: "1px solid #e1e9eb", textAlign: "center",
            }}>
              <div style={{ fontSize: 11, color: "#00abbd", fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--text-primary)" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Monthly summary — single compact card */}
        <div style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: "14px 16px",
          border: "1px solid #e1e9eb",
        }}>
          <div style={{
            fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14,
            color: "var(--text-primary)", marginBottom: 12,
          }}>
            Měsíční souhrn
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
            {[
              { label: "Analýzy", actual: stats.fsa.actual, planned: stats.fsa.planned },
              { label: "Pohovory", actual: stats.poh.actual, planned: stats.poh.planned },
              { label: "Poradka", actual: stats.ser.actual, planned: stats.ser.planned },
              { label: "Doporučení", actual: stats.ref.actual, planned: stats.ref.planned },
            ].map(({ label, actual, planned }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "#00abbd", fontWeight: 600, marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 18, color: "#00555f" }}>
                  {actual}
                  {planned > 0 && (
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#00abbd" }}> / {planned}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info & Postinfo — vedouci/BV only */}
        {isVedouciOrBV && (
          <div style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: "14px 16px",
            border: "1px solid #e1e9eb",
            marginTop: 12,
          }}>
            <div style={{
              fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14,
              color: "var(--text-primary)", marginBottom: 12,
            }}>
              Info & Postinfo
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
              <div>
                <div style={{ fontSize: 11, color: "#00abbd", fontWeight: 600, marginBottom: 2 }}>Info schůzky</div>
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 18, color: "#00555f" }}>
                  {infoPostCounts.info}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#00abbd", fontWeight: 600, marginBottom: 2 }}>Postinfo</div>
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 18, color: "#00555f" }}>
                  {infoPostCounts.postinfo}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop view — unchanged
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/tym" style={{ color: "var(--text-muted)" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <BarChart3 className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
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
                return (
                  <tr key={weekStr} className="past">
                    <td className="text-left whitespace-nowrap font-medium">
                      {format(weekStart, "d.", { locale: cs })}–{format(weekEnd, "d. M.", { locale: cs })}
                    </td>
                    {ALL_DISPLAY_COLUMNS.map((col) => {
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

export default MemberActivity;
