import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  format,
} from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { OrgChart } from "@/components/OrgChart";

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
    const sum = (key: string) =>
      records.reduce((acc: number, r: any) => acc + (r[key] || 0), 0);
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
        <LayoutDashboard className="h-6 w-6 text-foreground" />
        <h1 className="font-heading font-bold text-2xl text-foreground">DASHBOARD</h1>
      </div>

      {/* Moje statistika */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-semibold text-lg text-foreground">Moje statistika</h2>
            <Link to="/aktivity" className="text-muted-foreground hover:text-secondary transition-colors">
              <Pencil className="h-4 w-4" />
            </Link>
          </div>
          <p className="text-sm text-muted-foreground font-body">
            Období od {format(dateRange.from, "d. M. yyyy", { locale: cs })} do{" "}
            {format(dateRange.to, "d. M. yyyy", { locale: cs })}
          </p>
        </div>

        {/* Time filter pills */}
        <div className="flex gap-2">
          {filterPills.map((pill) => (
            <button
              key={pill.key}
              onClick={() => setTimeFilter(pill.key)}
              className={`px-4 py-1.5 rounded-pill text-sm font-body font-medium transition-colors ${
                timeFilter === pill.key
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-card text-muted-foreground hover:bg-border"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Analýzy" actual={stats.fsa.actual} planned={stats.fsa.planned} accentColor="#00abbd" />
          <StatCard label="Pohovory" actual={stats.poh.actual} planned={stats.poh.planned} accentColor="#7c6fcd" />
          <StatCard label="Poradka" actual={stats.ser.actual} planned={stats.ser.planned} accentColor="#2da44e" />
          <StatCard label="Doporučení" actual={stats.ref.actual} planned={stats.ref.planned} accentColor="#e08a00" />
        </div>

        <div className="flex justify-end">
          <Link
            to="/aktivity"
            className="text-sm text-secondary hover:text-secondary/80 font-body font-medium transition-colors"
          >
            Zobrazit detailní statistiku →
          </Link>
        </div>
      </section>

      {/* Moje struktura */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-semibold text-lg text-foreground">Moje struktura</h2>
          {(profile?.role === "vedouci" || profile?.role === "garant") && (
            <Link to="/tym" className="text-muted-foreground hover:text-secondary transition-colors">
              <Pencil className="h-4 w-4" />
            </Link>
          )}
        </div>
        <div className="bg-card rounded-card shadow-card p-6">
          <OrgChart currentUserId={profile?.id || ""} />
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
