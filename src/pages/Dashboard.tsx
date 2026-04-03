import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard } from "lucide-react";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import { getProductionPeriodStart, getProductionPeriodEnd, daysRemainingInPeriod } from "@/lib/productionPeriod";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { OrgChart } from "@/components/OrgChart";
import { fireConfetti } from "@/lib/confetti";
import { PromotionModal } from "@/components/PromotionModal";
import { useIsMobile } from "@/hooks/use-mobile";

type TimeFilter = "this_week" | "last_week" | "this_month";

// ─── Mobile sub-components ────────────────────────────────────────────────────

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
      <div className="mobile-stat-label">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
        <span style={{
          fontFamily: "Poppins, sans-serif", fontWeight: 800,
          fontSize: 36, color: "#00555f", lineHeight: 1,
        }}>
          {actual}
        </span>
        <span style={{
          fontFamily: "Poppins, sans-serif", fontWeight: 500,
          fontSize: 22, color: "#b8cfd4", lineHeight: 1,
        }}>
          /
        </span>
        <span style={{
          fontFamily: "Poppins, sans-serif", fontWeight: 700,
          fontSize: 28, color: "#00abbd", lineHeight: 1,
        }}>
          {planned}
        </span>
      </div>
      <div className="mobile-stat-sublabel" style={{ marginTop: 5 }}>{sublabel}</div>
    </div>
  );
}

const ROLE_AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  vedouci: { bg: "#00555f", text: "#ffffff" },
  garant:  { bg: "#00abbd", text: "#ffffff" },
  ziskatel:{ bg: "#7c6fcd", text: "#ffffff" },
  novacek: { bg: "#dde8ea", text: "#4a6b70" },
};

function AvatarCircle({ member, index }: { member: any; index: number }) {
  const initials = (member.full_name ?? "?")
    .split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase();
  const colors = ROLE_AVATAR_COLORS[member.role] ?? ROLE_AVATAR_COLORS.novacek;
  return (
    <div style={{
      width: 36, height: 36, borderRadius: "50%",
      background: colors.bg, color: colors.text,
      fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 12,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "2.5px solid white",
      marginLeft: index === 0 ? 0 : -10,
      zIndex: 10 - index,
      position: "relative",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {member.avatar_url
        ? <img src={member.avatar_url} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { profile, user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("this_week");
  const [promotionRole, setPromotionRole] = useState<string | null>(null);
  const prevRoleRef = useRef<string | null>(null);
  const hasCheckedFirstLogin = useRef(false);
  const now = new Date();

  // First login confetti
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

  // ── Desktop date range ──────────────────────────────────────────────────────
  const dateRange = useMemo(() => {
    switch (timeFilter) {
      case "this_week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last_week":
        return { from: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), to: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) };
      case "this_month":
        return { from: getProductionPeriodStart(now), to: getProductionPeriodEnd(now) };
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

  // ── Mobile-only queries ─────────────────────────────────────────────────────

  // All-time cumulative BJ
  const { data: allBjData = [] } = useQuery({
    queryKey: ["bj_all_time", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("activity_records")
        .select("bj")
        .eq("user_id", profile.id);
      return data || [];
    },
    enabled: !!profile?.id && isMobile,
  });
  const totalBjAllTime = useMemo(
    () => allBjData.reduce((acc: number, r: any) => acc + (r.bj || 0), 0),
    [allBjData]
  );

  // This period stats (for mobile grid)
  const monthRange = useMemo(() => ({
    from: getProductionPeriodStart(now),
    to: getProductionPeriodEnd(now),
  }), []);

  const { data: monthRecords = [] } = useQuery({
    queryKey: ["activity_records_month", profile?.id, format(now, "yyyy-MM")],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("activity_records")
        .select("*")
        .eq("user_id", profile.id)
        .gte("week_start", format(monthRange.from, "yyyy-MM-dd"))
        .lte("week_start", format(monthRange.to, "yyyy-MM-dd"));
      return data || [];
    },
    enabled: !!profile?.id && isMobile,
  });

  const monthStats = useMemo(() => {
    const sum = (key: string) => monthRecords.reduce((acc: number, r: any) => acc + (r[key] || 0), 0);
    return {
      fsa: { actual: sum("fsa_actual"), planned: sum("fsa_planned") },
      poh: { actual: sum("poh_actual"), planned: sum("poh_planned") },
      ser: { actual: sum("ser_actual"), planned: sum("ser_planned") },
      ref: { actual: sum("ref_actual"), planned: sum("ref_planned") },
    };
  }, [monthRecords]);

  // Direct team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team_members_direct", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, avatar_url")
        .eq("ziskatel_id", profile.id);
      return data || [];
    },
    enabled: !!profile?.id && isMobile,
  });

  // Pending promotion requests for team
  const { data: pendingPromos = [] } = useQuery({
    queryKey: ["pending_promos_team", profile?.id],
    queryFn: async () => {
      if (!profile?.id || teamMembers.length === 0) return [];
      const ids = teamMembers.map((m: any) => m.id);
      const { data } = await supabase
        .from("promotion_requests")
        .select("id")
        .in("user_id", ids)
        .eq("status", "pending");
      return data || [];
    },
    enabled: !!profile?.id && isMobile && teamMembers.length > 0,
  });

  // ── Desktop filter pills ────────────────────────────────────────────────────
  const filterPills: { key: TimeFilter; label: string }[] = [
    { key: "this_week",  label: "Tento týden" },
    { key: "last_week",  label: "Minulý týden" },
    { key: "this_month", label: "Tento měsíc" },
  ];

  // ── Mobile render ───────────────────────────────────────────────────────────
  if (isMobile) {
    const firstName = profile?.full_name?.split(" ")[0] ?? "";
    const daysRemaining = daysRemainingInPeriod(now);

    // BJ goal toward next promotion
    const role = profile?.role ?? "novacek";
    const bjGoal = 1000; // BJ needed for Garant
    const bjProgress = Math.min(100, (totalBjAllTime / bjGoal) * 100);
    const bjRemaining = Math.max(0, bjGoal - totalBjAllTime);
    const nextRoleLabel = role === "ziskatel" ? "Garanta" : role === "garant" ? "Vedoucího" : null;

    return (
      <div className="mobile-page">

        {/* ── HEADER ── */}
        <div style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div style={{
            fontFamily: "Open Sans, sans-serif", fontSize: 22,
            fontWeight: 400, color: "#0c2226", lineHeight: 1.2,
          }}>
            Ahoj,
          </div>
          <div style={{
            fontFamily: "Poppins, sans-serif", fontSize: 34,
            fontWeight: 800, color: "#0c2226", lineHeight: 1.1,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {firstName}! <span role="img" aria-label="wave">👋</span>
          </div>
          <div style={{
            fontFamily: "Poppins, sans-serif", fontSize: 16,
            fontWeight: 700, color: "#0c2226", marginTop: 10,
          }}>
            Zbývá {daysRemaining} dní a takhle vypadá tvůj byznys:
          </div>
        </div>

        {/* ── KUMULATIVNÍ BJ CARD ── */}
        <div style={{
          background: "linear-gradient(135deg, #00555f 0%, #007a84 100%)",
          borderRadius: 20, padding: "20px 20px 18px",
          marginBottom: 12, color: "white",
          boxShadow: "0 4px 24px rgba(0,85,95,0.28)",
        }}>
          <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 10, fontFamily: "Open Sans, sans-serif" }}>
            Kumulativní BJ (celkem)
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{
              fontFamily: "Poppins, sans-serif", fontWeight: 800,
              fontSize: 52, lineHeight: 1, color: "white",
            }}>
              {totalBjAllTime}
            </span>
            <span style={{ fontSize: 20, fontWeight: 600, opacity: 0.75 }}>BJ</span>
          </div>

          {/* Progress bar */}
          <div style={{
            height: 8, background: "rgba(255,255,255,0.18)",
            borderRadius: 4, overflow: "hidden", marginTop: 16,
          }}>
            <div style={{
              height: "100%", background: "#fc7c71",
              borderRadius: 4, width: `${bjProgress}%`,
              transition: "width 0.6s ease",
            }} />
          </div>

          {/* Bar labels */}
          {nextRoleLabel && (
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginTop: 7, fontSize: 12, opacity: 0.8,
              fontFamily: "Open Sans, sans-serif",
            }}>
              <span>Do {nextRoleLabel} zbývá</span>
              <span style={{ fontWeight: 700 }}>{bjRemaining} BJ</span>
            </div>
          )}
          {!nextRoleLabel && (
            <div style={{ marginTop: 7, fontSize: 12, opacity: 0.8 }}>
              Vedoucí ✓
            </div>
          )}
        </div>

        {/* ── MŮJ TÝM CARD ── */}
        <div className="mobile-activity-card" style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase" as const, color: "#fc7c71", marginBottom: 12,
          }}>
            Můj tým
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Overlapping avatars */}
            <div style={{ display: "flex", alignItems: "center" }}>
              {teamMembers.length === 0 ? (
                <span style={{ fontSize: 13, color: "#8aadb3" }}>Zatím žádní členové</span>
              ) : (
                <>
                  {teamMembers.slice(0, 3).map((m: any, i: number) => (
                    <AvatarCircle key={m.id} member={m} index={i} />
                  ))}
                  {teamMembers.length > 3 && (
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "#00abbd", color: "white",
                      fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 12,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "2.5px solid white",
                      marginLeft: -10, zIndex: 0, position: "relative", flexShrink: 0,
                    }}>
                      +{teamMembers.length - 3}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Zobrazit link */}
            <button
              onClick={() => navigate("/tym")}
              style={{
                border: "none", background: "transparent",
                color: "#00abbd", fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "Poppins, sans-serif",
                padding: 0,
              }}
            >
              Zobrazit →
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#8aadb3", marginTop: 8, fontFamily: "Open Sans, sans-serif" }}>
            {teamMembers.length} členů
            {pendingPromos.length > 0 && ` · ${pendingPromos.length} čekají na schválení`}
          </div>
        </div>

        {/* ── 2×2 STAT GRID (tento měsíc) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <MobileStatCard
            label="Analýzy"
            actual={monthStats.fsa.actual}
            planned={monthStats.fsa.planned}
            sublabel="proběhlých / doml."
          />
          <MobileStatCard
            label="Pohovory"
            actual={monthStats.poh.actual}
            planned={monthStats.poh.planned}
            sublabel="proběhlých / naplán."
          />
          <MobileStatCard
            label="Poradka"
            actual={monthStats.ser.actual}
            planned={monthStats.ser.planned}
            sublabel="proběhlých / naplán."
          />
          <MobileStatCard
            label="Doporučení"
            actual={monthStats.ref.actual}
            planned={monthStats.ref.planned}
            sublabel="vybraných / naplán."
          />
        </div>

        <PromotionModal
          open={!!promotionRole}
          onClose={() => setPromotionRole(null)}
          newRole={promotionRole || ""}
        />
      </div>
    );
  }

  // ── DESKTOP render (unchanged) ──────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6" style={{ color: "#0c2226" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>
          DASHBOARD
        </h1>
      </div>

      <section className="space-y-4">
        <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226" }}>
          Moje struktura
        </h2>
        <div className="legatus-card" style={{ padding: 24 }}>
          <OrgChart currentUserId={profile?.id || ""} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226" }}>
          Moje aktivity
        </h2>

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Analýzy"     actual={stats.fsa.actual} planned={stats.fsa.planned} actualLabel="proběhlých"  plannedLabel="domluvenných"   />
          <StatCard label="Pohovory"    actual={stats.poh.actual} planned={stats.poh.planned} actualLabel="proběhlých"  plannedLabel="naplánovaných"  />
          <StatCard label="Poradka"     actual={stats.ser.actual} planned={stats.ser.planned} actualLabel="proběhlých"  plannedLabel="naplánovaných"  />
          <StatCard label="Doporučení"  actual={stats.ref.actual} planned={stats.ref.planned} actualLabel="vybraných"   plannedLabel="naplánovaných"  />
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
