import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ChevronLeft, ChevronRight, Pencil, Check, ArrowLeft } from "lucide-react";
import { GaugeIndicator } from "@/components/GaugeIndicator";
import { startOfWeek, endOfWeek, subWeeks, addWeeks, format, isSameWeek } from "date-fns";
import { getProductionPeriodStart, getProductionPeriodEnd, daysRemainingInPeriod } from "@/lib/productionPeriod";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { OrgChart } from "@/components/OrgChart";
import { fireConfetti } from "@/lib/confetti";
import { PromotionModal } from "@/components/PromotionModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { toVocative } from "@/lib/vocative";
import { useTheme } from "@/contexts/ThemeContext";

type TimeFilter = "this_week" | "last_week" | "this_month";


// ─── Mobile read-only stat card ───────────────────────────────────────────────

function MobileStatCard({
  label,
  actual,
  planned,
  sublabel,
}: {
  label: string;
  actual: number;
  planned?: number;
  sublabel: string;
}) {
  return (
    <div
      className="mobile-stat-card"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
    >
      <div style={{ flex: 1 }}>
        <div className="mobile-stat-label">{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
          <span
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 800,
              fontSize: 36,
              color: "#00555f",
              lineHeight: 1,
            }}
          >
            {actual}
          </span>
          {planned != null && (
            <>
              <span
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 500,
                  fontSize: 22,
                  color: "#b8cfd4",
                  lineHeight: 1,
                }}
              >
                /
              </span>
              <span
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 700,
                  fontSize: 28,
                  color: "#00abbd",
                  lineHeight: 1,
                }}
              >
                {planned}
              </span>
            </>
          )}
        </div>
        <div className="mobile-stat-sublabel" style={{ marginTop: 5 }}>
          {sublabel}
        </div>
      </div>
    </div>
  );
}

// ─── Helper: compute stats from meetings ──────────────────────────────────────

function computeStats(meetings: any[], todayStr: string) {
  const count = (type: string, past: boolean) =>
    meetings.filter(
      (m: any) =>
        m.meeting_type === type &&
        !m.cancelled &&
        (past ? m.date < todayStr : m.date >= todayStr),
    ).length;

  const sumRefs = (past: boolean) =>
    meetings
      .filter((m: any) => !m.cancelled && (past ? m.date < todayStr : m.date >= todayStr))
      .reduce(
        (acc: number, m: any) =>
          acc + (m.doporuceni_fsa || 0) + (m.doporuceni_poradenstvi || 0) + (m.doporuceni_pohovor || 0),
        0,
      );

  return {
    fsa: { actual: count("FSA", true), planned: count("FSA", false) },
    poh: { actual: count("POH", true), planned: count("POH", false) },
    ser: { actual: count("SER", true), planned: count("SER", false) },
    por: { actual: count("POR", true), planned: count("POR", false) },
    ref: { actual: sumRefs(true), planned: sumRefs(false) },
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { profile, user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("this_week");
  const [promotionRole, setPromotionRole] = useState<string | null>(null);
  const prevRoleRef = useRef<string | null>(null);
  const hasCheckedFirstLogin = useRef(false);
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  // ── Impersonation: view dashboard as another team member ──
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingUserName, setViewingUserName] = useState<string>("");

  // Transition state for smooth OrgChart view switching
  const [orgTransitioning, setOrgTransitioning] = useState(false);
  const pendingSwitch = useRef<{ userId: string | null; userName: string } | null>(null);

  const handlePersonSwitch = (userId: string | null, userName: string) => {
    if (userId === viewingUserId) return;
    setOrgTransitioning(true);
    pendingSwitch.current = { userId, userName };
  };

  useEffect(() => {
    if (!orgTransitioning) return;
    const timer = setTimeout(() => {
      if (pendingSwitch.current) {
        setViewingUserId(pendingSwitch.current.userId);
        setViewingUserName(pendingSwitch.current.userName);
        pendingSwitch.current = null;
      }
      requestAnimationFrame(() => setOrgTransitioning(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [orgTransitioning]);

  // The ID used for all data queries — either impersonated user or self
  const activeUserId = viewingUserId || profile?.id || "";
  const isImpersonating = !!viewingUserId && viewingUserId !== profile?.id;

  // Fetch impersonated user's profile for role-dependent sections
  const { data: viewingProfile } = useQuery({
    queryKey: ["impersonated_profile", viewingUserId],
    queryFn: async () => {
      if (!viewingUserId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, monthly_bj_goal, personal_bj_goal, osobni_id")
        .eq("id", viewingUserId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!viewingUserId && viewingUserId !== profile?.id,
  });

  // Active profile for rendering (impersonated or own)
  const activeProfile = isImpersonating && viewingProfile
    ? { ...profile, ...viewingProfile }
    : profile;

  // Mobile week navigation
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const mobileWeekStart = useMemo(
    () => addWeeks(startOfWeek(now, { weekStartsOn: 1 }), mobileWeekOffset),
    [mobileWeekOffset],
  );
  const mobileWeekEnd = endOfWeek(mobileWeekStart, { weekStartsOn: 1 });
  const isMobileWeekEditable = isSameWeek(mobileWeekStart, now, { weekStartsOn: 1 });

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

  useEffect(() => {
    if (!profile) return;
    const prev = prevRoleRef.current;
    prevRoleRef.current = profile.role;
    if (prev && prev !== profile.role) {
      const roleOrder: Record<string, number> = { novacek: 0, ziskatel: 1, garant: 2, budouci_vedouci: 3, vedouci: 4 };
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
        return {
          from: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
          to: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        };
      case "this_month":
        return { from: getProductionPeriodStart(now), to: getProductionPeriodEnd(now) };
    }
  }, [timeFilter]);

  // ── Desktop stats from client_meetings ──────────────────────────────────────
  const { data: desktopMeetings = [] } = useQuery({
    queryKey: ["dashboard_meetings", activeUserId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("meeting_type, cancelled, date, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj")
        .eq("user_id", activeUserId)
        .gte("date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("date", format(dateRange.to, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId,
  });

  const stats = useMemo(() => computeStats(desktopMeetings, todayStr), [desktopMeetings, todayStr]);

  // ── Mobile stats from client_meetings (week) ───────────────────────────────
  const mobileWeekStartStr = format(mobileWeekStart, "yyyy-MM-dd");
  const mobileWeekEndStr = format(mobileWeekEnd, "yyyy-MM-dd");

  const { data: mobileMeetings = [] } = useQuery({
    queryKey: ["dashboard_meetings_mobile", activeUserId, mobileWeekStartStr, mobileWeekEndStr],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("meeting_type, cancelled, date, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj")
        .eq("user_id", activeUserId)
        .gte("date", mobileWeekStartStr)
        .lte("date", mobileWeekEndStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId && isMobile,
  });

  const mobileStats = useMemo(() => computeStats(mobileMeetings, todayStr), [mobileMeetings, todayStr]);

  // ── Queries for Stav byznysu card (all roles, desktop + mobile) ───────────

  const activeRole = activeProfile?.role ?? "novacek";

  // All-time cumulative BJ from meetings
  const { data: meetingBjTotal = 0 } = useQuery({
    queryKey: ["bj_all_time_meetings", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { data } = await supabase
        .from("client_meetings")
        .select("podepsane_bj")
        .eq("user_id", activeUserId)
        .eq("cancelled", false);
      return (data || []).reduce((acc: number, r: any) => acc + (Number(r.podepsane_bj) || 0), 0);
    },
    enabled: !!activeUserId && activeRole !== "vedouci" && activeRole !== "novacek",
  });

  // Historical BJ from onboarding (stored in activity_records for Dec 2025)
  const { data: historicalBj = 0 } = useQuery({
    queryKey: ["bj_historical", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { data } = await supabase
        .from("activity_records")
        .select("bj")
        .eq("user_id", activeUserId)
        .eq("week_start", "2025-12-01")
        .maybeSingle();
      return Number(data?.bj) || 0;
    },
    enabled: !!activeUserId && activeRole !== "vedouci" && activeRole !== "novacek",
  });

  const totalBjAllTime = meetingBjTotal + historicalBj;

  // Získatel: lidé ve struktuře (ziskatel_id = profile.id)
  const { data: ziskatelStructureCount = 0 } = useQuery({
    queryKey: ["ziskatel_structure_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("ziskatel_id", activeUserId)
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!activeUserId && activeRole === "ziskatel",
  });

  // Garant / BV: přímí podřízení (ziskatel_id = profile.id)
  const { data: directSubordinateCount = 0 } = useQuery({
    queryKey: ["direct_subordinate_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("ziskatel_id", activeUserId)
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!activeUserId && (activeRole === "garant" || activeRole === "budouci_vedouci"),
  });

  // Garant / BV: celá struktura (rekurzivně přes garant_id / vedouci_id)
  const { data: structureCount = 0 } = useQuery({
    queryKey: ["structure_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .or(`garant_id.eq.${activeUserId},vedouci_id.eq.${activeUserId}`)
        .eq("is_active", true)
        .neq("id", activeUserId);
      return count || 0;
    },
    enabled: !!activeUserId && (activeRole === "garant" || activeRole === "budouci_vedouci"),
  });

  // Vedoucí: počet BV a Vedoucích ve struktuře
  const { data: seniorMemberCount = 0 } = useQuery({
    queryKey: ["senior_member_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("vedouci_id", activeUserId)
        .in("role", ["budouci_vedouci", "vedouci"])
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!activeUserId && activeRole === "vedouci",
  });

  // Vedoucí: monthly BJ for entire subtree
  const periodStart = getProductionPeriodStart(now);
  const periodEnd = getProductionPeriodEnd(now);
  const periodStartStr = format(periodStart, "yyyy-MM-dd");
  const periodEndStr = format(periodEnd, "yyyy-MM-dd");

  // Vedoucí: monthly BJ for entire subtree (team) — from client_meetings
  const { data: vedouciMonthlyBj = 0 } = useQuery({
    queryKey: ["vedouci_monthly_bj_meetings", activeUserId, periodStartStr],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { data } = await supabase
        .from("client_meetings")
        .select("podepsane_bj")
        .eq("cancelled", false)
        .gte("date", periodStartStr)
        .lte("date", periodEndStr);
      return (data || []).reduce((acc: number, r: any) => acc + (Number(r.podepsane_bj) || 0), 0);
    },
    enabled: !!activeUserId && activeRole === "vedouci",
  });

  // Personal monthly BJ (current production period) — from client_meetings
  const { data: personalMonthlyBj = 0 } = useQuery({
    queryKey: ["personal_monthly_bj_meetings", activeUserId, periodStartStr],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { data } = await supabase
        .from("client_meetings")
        .select("podepsane_bj")
        .eq("user_id", activeUserId)
        .eq("cancelled", false)
        .gte("date", periodStartStr)
        .lte("date", periodEndStr);
      return (data || []).reduce((acc: number, r: any) => acc + (Number(r.podepsane_bj) || 0), 0);
    },
    enabled: !!activeUserId,
  });

  // Vedoucí: monthly_bj_goal from profile
  const monthlyBjGoal = activeProfile?.monthly_bj_goal || 0;
  const personalBjGoal = (activeProfile as any)?.personal_bj_goal || 0;
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInputValue, setGoalInputValue] = useState("");
  const [editingPersonalGoal, setEditingPersonalGoal] = useState(false);
  const [personalGoalInputValue, setPersonalGoalInputValue] = useState("");

  const updateGoalMutation = useMutation({
    mutationFn: async (newGoal: number) => {
      if (!profile?.id) throw new Error("No user");
      const { error } = await supabase
        .from("profiles")
        .update({ monthly_bj_goal: newGoal } as any)
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingGoal(false);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      window.location.reload();
    },
  });

  const updatePersonalGoalMutation = useMutation({
    mutationFn: async (newGoal: number) => {
      if (!profile?.id) throw new Error("No user");
      const { error } = await supabase
        .from("profiles")
        .update({ personal_bj_goal: newGoal } as any)
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingPersonalGoal(false);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      window.location.reload();
    },
  });

  // ── Desktop filter pills ────────────────────────────────────────────────────
  const filterPills: { key: TimeFilter; label: string }[] = [
    { key: "this_week", label: "Tento týden" },
    { key: "last_week", label: "Minulý týden" },
    { key: "this_month", label: "Tento měsíc" },
  ];

  // ── Mobile render ───────────────────────────────────────────────────────────
  if (isMobile) {
    const firstName = isImpersonating
      ? viewingUserName.split(" ")[0]
      : toVocative(profile?.full_name?.split(" ")[0] ?? "");
    const daysRemaining = daysRemainingInPeriod(now);

    const role = activeRole;

    return (
      <div className="mobile-page" style={{ paddingBottom: 160 }}>
        {/* ── HEADER ── */}
        <div style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div
            style={{
              fontFamily: "Open Sans, sans-serif",
              fontSize: 22,
              fontWeight: 400,
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}
          >
            Ahoj,
          </div>
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontSize: 34,
              fontWeight: 800,
              color: "var(--text-primary)",
              lineHeight: 1.1,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {firstName}!{" "}
            <span role="img" aria-label="wave">
              👋
            </span>
          </div>
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginTop: 10,
            }}
          >
            {role === "vedouci"
              ? `Zbývá ${daysRemaining} dní a takhle vypadá tvůj byznys:`
              : role === "novacek" ? "Postup k tvému povýšení na pozici Získatele:"
              : role === "ziskatel" ? "Postup k tvému povýšení na pozici Garanta:"
              : role === "garant" ? "Postup k tvému povýšení na pozici Budoucího vedoucího:"
              : "Postup k tvému povýšení na pozici Vedoucího:"
            }
          </div>
        </div>

        {/* ── STAV BYZNYSU GAUGES ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #00555f 0%, #007a84 100%)",
            borderRadius: 20,
            padding: "16px 12px 14px",
            marginBottom: 12,
            color: "white",
            boxShadow: "0 4px 24px rgba(0,85,95,0.28)",
            display: "flex",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {role === "novacek" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder dark />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder dark />
              </div>
            </>
          ) : role === "vedouci" ? (
            // Vedoucí: čísla místo gauges
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <span style={{ fontFamily: "Open Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>Týmové BJ</span>
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 48, color: "white", lineHeight: 1 }}>{vedouciMonthlyBj}</span>
                <span style={{ fontFamily: "Open Sans, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>aktuální produkční období</span>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.2)", alignSelf: "stretch", margin: "0 4px" }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <span style={{ fontFamily: "Open Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>BV a Vedoucí</span>
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 48, color: "#86efac", lineHeight: 1 }}>{seniorMemberCount}</span>
                <span style={{ fontFamily: "Open Sans, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>ve struktuře</span>
              </div>
            </>
          ) : role === "ziskatel" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={totalBjAllTime} max={1000} label="BJ celkem"
                  sublabel={totalBjAllTime >= 1000 ? "✓ Splněno" : `${Math.max(0, 1000 - totalBjAllTime)} BJ zbývá`}
                  dark completed={totalBjAllTime >= 1000} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={ziskatelStructureCount} max={2} label="Lidé ve struktuře"
                  sublabel={ziskatelStructureCount >= 2 ? "✓ Splněno" : `${ziskatelStructureCount} z 2`}
                  dark completed={ziskatelStructureCount >= 2} />
              </div>
            </>
          ) : role === "garant" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={structureCount} max={5} label="Lidé ve struktuře"
                  sublabel={structureCount >= 5 ? "✓ Splněno" : `${structureCount} z 5`}
                  dark completed={structureCount >= 5} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={directSubordinateCount} max={3} label="Přímá linka"
                  sublabel={directSubordinateCount >= 3 ? "✓ Splněno" : `${directSubordinateCount} z 3`}
                  dark completed={directSubordinateCount >= 3} />
              </div>
            </>
          ) : (
            // budouci_vedouci
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={structureCount} max={10} label="Lidé ve struktuře"
                  sublabel={structureCount >= 10 ? "✓ Splněno" : `${structureCount} z 10`}
                  dark completed={structureCount >= 10} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={directSubordinateCount} max={6} label="Přímá linka"
                  sublabel={directSubordinateCount >= 6 ? "✓ Splněno" : `${directSubordinateCount} z 6`}
                  dark completed={directSubordinateCount >= 6} />
              </div>
            </>
          )}
        </div>

        {/* ── 2×3 STAT GRID (read-only, from meetings) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <MobileStatCard
            label="Analýzy"
            actual={mobileStats.fsa.actual}
            planned={mobileStats.fsa.planned}
            sublabel="proběhlých / doml."
          />
          <MobileStatCard
            label="Pohovory"
            actual={mobileStats.poh.actual}
            planned={mobileStats.poh.planned}
            sublabel="proběhlých / naplán."
          />
          <MobileStatCard
            label="Servisy"
            actual={mobileStats.ser.actual}
            planned={mobileStats.ser.planned}
            sublabel="proběhlých / naplán."
          />
          <MobileStatCard
            label="Poradenství"
            actual={mobileStats.por.actual}
            planned={mobileStats.por.planned}
            sublabel="proběhlých / naplán."
          />
          <MobileStatCard
            label="Doporučení"
            actual={mobileStats.ref.actual}
            sublabel="celkem"
          />
        </div>

        {/* ── WEEK NAVIGATOR (fixed above bottom nav) ── */}
        <div
          style={{
            position: "fixed",
            bottom: 120,
            left: 16,
            right: 16,
            zIndex: 40,
            background: isDark ? "rgba(9,29,33,0.85)" : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px) saturate(1.8)",
            WebkitBackdropFilter: "blur(20px) saturate(1.8)",
            borderRadius: 16,
            padding: "10px 16px",
            border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(225,233,235,0.8)",
            boxShadow: isDark ? "0 -2px 16px rgba(0,0,0,0.4)" : "0 -2px 16px rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={() => setMobileWeekOffset((o) => o - 1)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronLeft size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>
              {isMobileWeekEditable ? "Aktuální týden" : format(mobileWeekStart, "MMMM yyyy", { locale: cs })}
            </div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
              {format(mobileWeekStart, "d.M.", { locale: cs })} – {format(mobileWeekEnd, "d.M.", { locale: cs })}
            </div>
          </div>
          <button
            onClick={() => setMobileWeekOffset((o) => Math.min(0, o + 1))}
            disabled={mobileWeekOffset >= 0}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea",
              border: "none",
              cursor: mobileWeekOffset >= 0 ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: mobileWeekOffset >= 0 ? 0.3 : 1,
            }}
          >
            <ChevronRight size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
          </button>
        </div>


        <PromotionModal open={!!promotionRole} onClose={() => setPromotionRole(null)} newRole={promotionRole || ""} />
      </div>
    );
  }

  // ── DESKTOP render ──────────────────────────────────────────────────────────
  const role = activeRole;

  const renderStavByznysu = () => {
    if (role === "novacek") {
      return (
        <>
          <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder />
          <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder />
        </>
      );
    }

    if (role === "vedouci") {
      // Vedoucí vidí čísla, ne gauges
      const statStyle = { textAlign: "center" as const, width: "100%" };
      const bigNumStyle = {
        fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 52,
        lineHeight: 1, color: "#00555f",
      };
      const labelStyle = {
        fontFamily: "Open Sans, sans-serif", fontWeight: 600, fontSize: 12,
        color: "var(--text-secondary)", marginBottom: 8,
      };
      const sublabelStyle = {
        fontFamily: "Open Sans, sans-serif", fontSize: 11,
        color: "var(--text-muted)", marginTop: 6,
      };
      return (
        <>
          <div style={statStyle}>
            <div style={labelStyle}>Týmové BJ</div>
            <div style={bigNumStyle}>{vedouciMonthlyBj}</div>
            <div style={sublabelStyle}>aktuální produkční období</div>
          </div>
          <div style={{ width: "100%", height: 1, background: "var(--border)" }} />
          <div style={statStyle}>
            <div style={labelStyle}>BV a Vedoucí</div>
            <div style={{ ...bigNumStyle, color: "#00abbd" }}>{seniorMemberCount}</div>
            <div style={sublabelStyle}>ve struktuře</div>
          </div>
        </>
      );
    }

    if (role === "ziskatel") {
      const bjDone = totalBjAllTime >= 1000;
      const structDone = ziskatelStructureCount >= 2;
      return (
        <>
          <GaugeIndicator
            value={totalBjAllTime} max={1000}
            label="BJ celkem" sublabel={bjDone ? "✓ Splněno" : `${Math.max(0, 1000 - totalBjAllTime)} BJ zbývá`}
            completed={bjDone}
          />
          <GaugeIndicator
            value={ziskatelStructureCount} max={2}
            label="Lidé ve struktuře" sublabel={structDone ? "✓ Splněno" : `${ziskatelStructureCount} z 2`}
            completed={structDone}
          />
        </>
      );
    }

    if (role === "garant") {
      const structDone = structureCount >= 5;
      const directDone = directSubordinateCount >= 3;
      return (
        <>
          <GaugeIndicator
            value={structureCount} max={5}
            label="Lidé ve struktuře" sublabel={structDone ? "✓ Splněno" : `${structureCount} z 5`}
            completed={structDone}
          />
          <GaugeIndicator
            value={directSubordinateCount} max={3}
            label="Přímá linka" sublabel={directDone ? "✓ Splněno" : `${directSubordinateCount} z 3`}
            completed={directDone}
          />
        </>
      );
    }

    // budouci_vedouci
    const structDone = structureCount >= 10;
    const directDone = directSubordinateCount >= 6;
    return (
      <>
        <GaugeIndicator
          value={structureCount} max={10}
          label="Lidé ve struktuře" sublabel={structDone ? "✓ Splněno" : `${structureCount} z 10`}
          completed={structDone}
        />
        <GaugeIndicator
          value={directSubordinateCount} max={6}
          label="Přímá linka" sublabel={directDone ? "✓ Splněno" : `${directSubordinateCount} z 6`}
          completed={directDone}
        />
      </>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
          DASHBOARD
        </h1>
      </div>

      <div>
      {/* Impersonation banner */}
      {isImpersonating && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: "rgba(0,171,189,0.12)", border: "1px solid rgba(0,171,189,0.3)" }}
        >
          <button
            onClick={() => handlePersonSwitch(null, "")}
            className="flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80"
            style={{ color: "#00abbd" }}
          >
            <ArrowLeft size={16} /> Zpět na můj dashboard
          </button>
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Prohlížíte dashboard: <strong>{viewingUserName}</strong>
          </span>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex gap-6" style={{ alignItems: "stretch", minHeight: 350 }}>
          {/* Stav byznysu — 1/4 */}
          <div style={{ width: "25%", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "var(--text-primary)", marginBottom: 16 }}>
              Stav byznysu
            </h2>
            <div
              className="legatus-card"
              style={{
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 20,
                alignItems: "center",
                flex: 1,
                overflowY: "auto",
              }}
            >
              {renderStavByznysu()}
            </div>
          </div>
          {/* Moje struktura — 3/5 */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "var(--text-primary)", marginBottom: 16 }}>
              {isImpersonating ? `Struktura — ${viewingUserName}` : "Moje struktura"}
            </h2>
            <div
              className="legatus-card"
              style={{
                padding: 24,
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div style={{
                flex: 1, overflowY: "auto", minHeight: 0,
                transition: "opacity 0.2s ease, transform 0.2s ease",
                opacity: orgTransitioning ? 0 : 1,
                transform: orgTransitioning ? "scale(0.97)" : "scale(1)",
              }}>
                <OrgChart
                  currentUserId={profile?.id || ""}
                  focusUserId={viewingUserId || undefined}
                  viewerRole={profile?.role}
                  onPersonClick={(userId, p) => {
                    handlePersonSwitch(userId, p.full_name);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "var(--text-primary)" }}>
          Přehled aktivit
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            label="Servisy"
            actual={stats.ser.actual}
            planned={stats.ser.planned}
            actualLabel="proběhlých"
            plannedLabel="naplánovaných"
          />
          <StatCard
            label="Poradenství"
            actual={stats.por.actual}
            planned={stats.por.planned}
            actualLabel="proběhlých"
            plannedLabel="naplánovaných"
          />
          <StatCard
            label="Doporučení"
            actual={stats.ref.actual}
            actualLabel="celkem"
          />
        </div>
      </section>

      

      <PromotionModal open={!!promotionRole} onClose={() => setPromotionRole(null)} newRole={promotionRole || ""} />
      </div>
    </div>
  );
};

export default Dashboard;
