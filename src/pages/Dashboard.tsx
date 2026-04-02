import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard } from "lucide-react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, format } from "date-fns";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { OrgChart } from "@/components/OrgChart";
import { fireConfetti } from "@/lib/confetti";
import { PromotionModal } from "@/components/PromotionModal";
import { useIsMobile } from "@/hooks/use-mobile";

type TimeFilter = "this_week" | "last_week" | "this_month";

function MobileStatCard({
  label,
  actual,
  planned,
  sublabel,
}: {
  label: string;
  actual: number;
  planned: number;
  sublabel: string;
}) {
  return (
    <div className="mobile-stat-card">
      {/* Coral label */}
      <div className="mobile-stat-label">{label}</div>

      {/* actual  z  planned — baseline aligned, same as desktop StatCard */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
        <span style={{
          fontFamily: "Poppins, sans-serif",
          fontWeight: 700,
          fontSize: 30,
          color: "#00555f",
          lineHeight: 1,
        }}>
          {actual}
        </span>
        <span style={{
          fontFamily: "Poppins, sans-serif",
          fontWeight: 600,
          fontSize: 26,   /* double the original 13px "sub" size */
          color: "#00abbd",
          lineHeight: 1,
        }}>
          z {planned}
        </span>
      </div>

      {/* sublabel */}
      <div className="mobile-stat-sublabel" style={{ marginTop: 4 }}>{sublabel}</div>
    </div>
  );
}

const Dashboard = () => {
  const { profile, user } = useAuth();
  const isMobile = useIsMobile();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("this_week");
  const [promotionRole, setPromotionRole] = useState<string | null>(null);
  const prevRoleRef = useRef<string | null>(null);
  const hasCheckedFirstLogin = useRef(false);

  // First login detection
  useEffect(() => {
    if (!user || !profile || hasCheckedFirstLogin.current) return;
    hasCheckedFirstLogin.current = true;

    const key = `legatus_first_login_${user.id}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "true");
      fireConfetti();
    }
  }, [user, profile]);

  // Promotion detection
  useEffect(() => {
    if (!profile) return;
    const prev = prevRoleRef.current;
    prevRoleRef.current = profile.role;

    if (prev && prev !== profile.role) {
      const roleOrder: Record<string, number> = { novacek: 0, ziskatel: 1, garant: 2, vedouci: 3 };
      if ((roleOrder[profile.role] ?? 0) > (roleOrder[prev] ?? 0)) {
        fireConfetti();
        setPromotionRole(profile.role);
      }
    }
  }, [profile?.role]);

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

  const totalBj = useMemo(
    () => records.reduce((acc: number, r: any) => acc + (r.bj || 0), 0),
    [records]
  );

  if (isMobile) {
    return (
      <div className="mobile-page">
        {/* Mobile greeting header */}
        <div className="mobile-page-header">
          <div style={{ fontSize: 14, color: "#8aadb3" }}>
            {format(new Date(), "EEEE, d. MMMM", { locale: cs })}
          </div>
          <div className="mobile-page-title">
            Ahoj, {profile?.full_name?.split(" ")[0] ?? ""}!
          </div>
        </div>

        {/* BJ card */}
        <div className="mobile-bj-card">
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>BJ za vybrané období</div>
          <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 36 }}>
            {totalBj}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>bodů</div>
          <div className="progress-track" style={{ marginTop: 12 }}>
            <div
              className="progress-fill"
              style={{
                background: "#fc7c71",
                width: `${Math.min(100, (totalBj / 100) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Time filter chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
          {filterPills.map((pill) => (
            <button
              key={pill.key}
              onClick={() => setTimeFilter(pill.key)}
              className={`chip ${timeFilter === pill.key ? "chip-teal-active" : "chip-neutral"}`}
              style={{ flexShrink: 0 }}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* 2×2 stat grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <MobileStatCard label="Analýzy" actual={stats.fsa.actual} planned={stats.fsa.planned} sublabel="proběhlých" />
          <MobileStatCard label="Pohovory" actual={stats.poh.actual} planned={stats.poh.planned} sublabel="proběhlých" />
          <MobileStatCard label="Poradka" actual={stats.ser.actual} planned={stats.ser.planned} sublabel="proběhlých" />
          <MobileStatCard label="Doporučení" actual={stats.ref.actual} planned={stats.ref.planned} sublabel="vybraných" />
        </div>

        {/* Struktura */}
        <div style={{ marginBottom: 16 }}>
          <div className="mobile-page-title" style={{ fontSize: 18, marginBottom: 12 }}>
            Moje struktura
          </div>
          <div className="legatus-card" style={{ padding: 16, overflowX: "auto" }}>
            <OrgChart currentUserId={profile?.id || ""} />
          </div>
        </div>

        <PromotionModal
          open={!!promotionRole}
          onClose={() => setPromotionRole(null)}
          newRole={promotionRole || ""}
        />
      </div>
    );
  }

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

      <PromotionModal
        open={!!promotionRole}
        onClose={() => setPromotionRole(null)}
        newRole={promotionRole || ""}
      />
    </div>
  );
};

export default Dashboard;
