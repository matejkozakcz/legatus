import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, format } from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { OrgChart } from "@/components/OrgChart";
import { fireConfetti } from "@/lib/confetti";
import { PromotionModal } from "@/components/PromotionModal";

type TimeFilter = "this_week" | "last_week" | "this_month";

const Dashboard = () => {
  const { profile } = useAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("this_week");

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (timeFilter) {
      case "this_week":
        return {
          from: startOfWeek(now, { weekStartsOn: 1 }),
          to: endOfWeek(now, { weekStartsOn: 1 }),
        };
      case "last_week":
        return {
          from: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
          to: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        };
      case "this_month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  }, [timeFilter]);

  const { data: records = [] } = useQuery({
    queryKey: ["activity_records", profile?.id, dateRange],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("activity_records")
        .select("*")
        .eq("user_id", profile.id)
        .gte("week_start", format(dateRange.from, "yyyy-MM-dd"))
        .lte("week_start", format(dateRange.to, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
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

  const filterPills: { key: TimeFilter; label: string }[] = [
    { key: "this_week", label: "Tento týden" },
    { key: "last_week", label: "Minulý týden" },
    { key: "this_month", label: "Tento měsíc" },
  ];

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6" style={{ color: "#0c2226" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>
          DASHBOARD
        </h1>
      </div>

      {/* Moje struktura — FIRST */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226" }}>
            Moje struktura
          </h2>
        </div>
        <div className="legatus-card" style={{ padding: 24 }}>
          <OrgChart currentUserId={profile?.id || ""} />
        </div>
      </section>

      {/* Moje aktivity — SECOND */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226" }}>
              Moje aktivity
            </h2>
          </div>
        </div>

        {/* Time filter pills + date range display */}
        <div className="flex items-center gap-2 flex-wrap">
          {filterPills.map((pill) => (
            <button
              key={pill.key}
              onClick={() => setTimeFilter(pill.key)}
              className={`chip ${timeFilter === pill.key ? "chip-teal-active" : "chip-neutral"}`}
            >
              {pill.label}
            </button>
          ))}
          <span className="font-body text-xs text-muted-foreground ml-1">Období od</span>
          <span className="chip chip-neutral" style={{ cursor: "default" }}>
            {format(dateRange.from, "d. M. yyyy", { locale: cs })}
          </span>
          <span className="font-body text-xs text-muted-foreground">do</span>
          <span className="chip chip-neutral" style={{ cursor: "default" }}>
            {format(dateRange.to, "d. M. yyyy", { locale: cs })}
          </span>
        </div>

        {/* Stat cards */}
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
    </div>
  );
};

export default Dashboard;
