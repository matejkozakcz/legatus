import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ChevronLeft, ChevronRight, Pencil, Check, ArrowLeft, Target } from "lucide-react";
import { GoalKey, GOAL_OPTIONS } from "@/components/VedouciGoalsModal";
import { GaugeIndicator } from "@/components/GaugeIndicator";
import { startOfWeek, endOfWeek, subWeeks, addWeeks, format, isSameWeek } from "date-fns";
import {
  getProductionPeriodStart,
  getProductionPeriodEnd,
  getProductionPeriodForMonth,
  getProductionPeriodMonth,
  daysRemainingInPeriod,
} from "@/lib/productionPeriod";
import { cs } from "date-fns/locale";

import { OrgChart } from "@/components/OrgChart";
import { ProductionMonthPicker } from "@/components/ProductionMonthPicker";
import { fireConfetti } from "@/lib/confetti";
import { PromotionModal } from "@/components/PromotionModal";
import { VedouciGoalsModal } from "@/components/VedouciGoalsModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { toVocative } from "@/lib/vocative";
import { useTheme } from "@/contexts/ThemeContext";
import { checkPromotions as runCheckPromotions } from "@/lib/checkPromotions";

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

// ─── MiniStatCard — compact card for desktop stats ────────────────────────────

function MiniStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl border border-input bg-card px-3 py-2.5"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </div>
      <div className="font-heading font-bold" style={{ fontSize: 28, lineHeight: 1, color, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Helper: compute stats from meetings ──────────────────────────────────────

function computeStats(meetings: any[], todayStr: string) {
  const countAll = (type: string) =>
    meetings.filter((m: any) => m.meeting_type === type && !m.cancelled).length;

  const countPast = (type: string) =>
    meetings.filter((m: any) => m.meeting_type === type && !m.cancelled && m.date <= todayStr).length;

  const sumAllRefs = () =>
    meetings
      .filter((m: any) => !m.cancelled)
      .reduce(
        (acc: number, m: any) =>
          acc + (m.doporuceni_fsa || 0) + (m.doporuceni_poradenstvi || 0) + (m.doporuceni_pohovor || 0),
        0,
      );

  return {
    fsa: { actual: countPast("FSA"), planned: countAll("FSA") },
    poh: { actual: countPast("POH"), planned: countAll("POH") },
    ser: { actual: countPast("SER"), planned: countAll("SER") },
    por: { actual: countPast("POR"), planned: countAll("POR") },
    ref: { actual: sumAllRefs(), planned: 0 },
  };
}

// ─── Helper: compute newly arranged meetings this week ────────────────────────

function computeNewlyArranged(meetings: any[], weekStartStr: string, weekEndStr: string) {
  const inWeek = meetings.filter((m: any) => {
    if (m.cancelled || !m.created_at) return false;
    const createdDate = m.created_at.slice(0, 10);
    return createdDate >= weekStartStr && createdDate <= weekEndStr;
  });

  return {
    fsa: inWeek.filter((m: any) => m.meeting_type === "FSA").length,
    ser: inWeek.filter((m: any) => m.meeting_type === "SER").length,
    poh: inWeek.filter((m: any) => m.meeting_type === "POH").length,
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
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const currentPeriod = getProductionPeriodMonth(now);
  const [selectedYear, setSelectedYear] = useState(currentPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(currentPeriod.month);
  const selectedPeriod = useMemo(
    () => getProductionPeriodForMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );
  const [promotionRole, setPromotionRole] = useState<string | null>(null);
  const prevRoleRef = useRef<string | null>(null);
  const hasCheckedFirstLogin = useRef(false);

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
  const activeProfile = isImpersonating && viewingProfile ? { ...profile, ...viewingProfile } : profile;

  // Mobile week navigation
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const mobileWeekStart = useMemo(
    () => addWeeks(startOfWeek(now, { weekStartsOn: 1 }), mobileWeekOffset),
    [mobileWeekOffset],
  );
  const mobileWeekEnd = endOfWeek(mobileWeekStart, { weekStartsOn: 1 });
  const isMobileWeekEditable = isSameWeek(mobileWeekStart, now, { weekStartsOn: 1 });

  // Vedoucí: kontrola povýšení při načtení Dashboardu (záložní trigger mimo Správa týmu)
  const promotionCheckDoneRef = useRef(false);
  useEffect(() => {
    if (!profile || profile.role !== "vedouci" || promotionCheckDoneRef.current) return;
    promotionCheckDoneRef.current = true;

    supabase
      .from("profiles")
      .select("id, role, full_name, ziskatel_id")
      .eq("vedouci_id", profile.id)
      .eq("is_active", true)
      .then(({ data }) => {
        if (data && data.length > 0) {
          runCheckPromotions({ id: profile.id, role: profile.role, full_name: profile.full_name }, data as any);
        }
      });
  }, [profile]);

  // Trigger check-followups edge function once per session to create meeting notifications
  const followupCheckDoneRef = useRef(false);
  useEffect(() => {
    if (!user || followupCheckDoneRef.current) return;
    followupCheckDoneRef.current = true;
    const projectUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${projectUrl}/functions/v1/check-followups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
    }).catch(() => {});
    fetch(`${projectUrl}/functions/v1/check-reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
    }).catch(() => {});
  }, [user]);

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

  // ── Desktop date range — driven by production period picker ──────────────
  const dateRange = useMemo(
    () => ({
      from: selectedPeriod.start,
      to: selectedPeriod.end,
    }),
    [selectedPeriod],
  );

  // ── Desktop stats from client_meetings ──────────────────────────────────────
  const { data: desktopMeetings = [] } = useQuery({
    queryKey: [
      "dashboard_meetings",
      activeUserId,
      format(dateRange.from, "yyyy-MM-dd"),
      format(dateRange.to, "yyyy-MM-dd"),
    ],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select(
          "meeting_type, cancelled, date, created_at, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj",
        )
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
        .select(
          "meeting_type, cancelled, date, created_at, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj",
        )
        .eq("user_id", activeUserId)
        .gte("date", mobileWeekStartStr)
        .lte("date", mobileWeekEndStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId && isMobile,
  });

  const mobileStats = useMemo(() => computeStats(mobileMeetings, todayStr), [mobileMeetings, todayStr]);

  // ── Newly arranged meetings (created_at in displayed week/period) ──────────
  const mobileNewlyArranged = useMemo(
    () => computeNewlyArranged(mobileMeetings, mobileWeekStartStr, mobileWeekEndStr),
    [mobileMeetings, mobileWeekStartStr, mobileWeekEndStr],
  );

  const desktopNewlyArranged = useMemo(
    () => computeNewlyArranged(desktopMeetings, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")),
    [desktopMeetings, dateRange],
  );

  // ── Newly booked meetings (by created_at, not date) ─────────────────────────
  const { data: newlyBookedMeetings = [] } = useQuery({
    queryKey: [
      "dashboard_newly_booked",
      activeUserId,
      dateRange.from.toISOString(),
      dateRange.to.toISOString(),
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("meeting_type, cancelled")
        .eq("user_id", activeUserId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId,
  });

  const newlyBooked = useMemo(() => {
    const active = newlyBookedMeetings.filter((m: any) => !m.cancelled);
    return {
      fsa: active.filter((m: any) => m.meeting_type === "FSA").length,
      poh: active.filter((m: any) => m.meeting_type === "POH").length,
      ser: active.filter((m: any) => m.meeting_type === "SER").length,
      por: active.filter((m: any) => m.meeting_type === "POR").length,
    };
  }, [newlyBookedMeetings]);

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

  // Garant / BV: celá struktura — rekurzivní BFS přes ziskatel_id
  // Podřízení Garanta mají vedouci_id = jejich Vedoucí, ne Garantovo ID,
  // takže jedinou spolehlivou vazbou je ziskatel_id řetěz.
  const { data: structureCount = 0 } = useQuery({
    queryKey: ["structure_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;

      // Zjistíme vedouci_id aktivního uživatele
      const { data: me } = await supabase.from("profiles").select("vedouci_id").eq("id", activeUserId).single();

      const vedouciId = me?.vedouci_id ?? activeUserId;

      // Stáhneme všechny aktivní profily pod stejným Vedoucím (celý tým)
      const { data: teamMembers } = await supabase
        .from("profiles")
        .select("id, ziskatel_id")
        .eq("vedouci_id", vedouciId)
        .eq("is_active", true);

      if (!teamMembers) return 0;

      // BFS od activeUserId přes ziskatel_id vazby
      const childMap = new Map<string, string[]>();
      teamMembers.forEach((p: any) => {
        if (p.ziskatel_id) {
          if (!childMap.has(p.ziskatel_id)) childMap.set(p.ziskatel_id, []);
          childMap.get(p.ziskatel_id)!.push(p.id);
        }
      });

      let count = 0;
      const queue = [...(childMap.get(activeUserId) || [])];
      while (queue.length > 0) {
        const id = queue.shift()!;
        count++;
        queue.push(...(childMap.get(id) || []));
      }
      return count;
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

  // Vedoucí: recursive structure counts (BFS via ziskatel_id)
  const { data: structureRoleCounts = { garant: 0, budouci_vedouci: 0, vedouci: 0 } } = useQuery({
    queryKey: ["structure_role_counts", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return { garant: 0, budouci_vedouci: 0, vedouci: 0 };
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, role, ziskatel_id")
        .eq("is_active", true);
      if (!allProfiles) return { garant: 0, budouci_vedouci: 0, vedouci: 0 };

      const childMap = new Map<string, string[]>();
      allProfiles.forEach((p: any) => {
        if (p.ziskatel_id) {
          if (!childMap.has(p.ziskatel_id)) childMap.set(p.ziskatel_id, []);
          childMap.get(p.ziskatel_id)!.push(p.id);
        }
      });

      const counts = { garant: 0, budouci_vedouci: 0, vedouci: 0 };
      const queue = [...(childMap.get(activeUserId) || [])];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const profile = allProfiles.find((p: any) => p.id === id);
        if (profile) {
          if (profile.role === "garant") counts.garant++;
          else if (profile.role === "budouci_vedouci") counts.budouci_vedouci++;
          else if (profile.role === "vedouci") counts.vedouci++;
        }
        queue.push(...(childMap.get(id) || []));
      }
      return counts;
    },
    enabled: !!activeUserId && activeRole === "vedouci",
  });

  const garantCount = structureRoleCounts.garant;
  const bvCount = structureRoleCounts.budouci_vedouci;
  const vedouciSubCount = structureRoleCounts.vedouci;

  // Vedoucí: DIRECT counts (ziskatel_id = me) per role
  const { data: directVedouciCount = 0 } = useQuery({
    queryKey: ["direct_vedouci_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("ziskatel_id", activeUserId)
        .eq("role", "vedouci")
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!activeUserId && activeRole === "vedouci",
  });

  const { data: directBvCount = 0 } = useQuery({
    queryKey: ["direct_bv_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("ziskatel_id", activeUserId)
        .eq("role", "budouci_vedouci")
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!activeUserId && activeRole === "vedouci",
  });

  const { data: directGarantCount = 0 } = useQuery({
    queryKey: ["direct_garant_count", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("ziskatel_id", activeUserId)
        .eq("role", "garant")
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!activeUserId && activeRole === "vedouci",
  });

  // Period dates from picker (used by Stav byznysu + Přehled aktivit)
  const periodStartStr = format(selectedPeriod.start, "yyyy-MM-dd");
  const periodEndStr = format(selectedPeriod.end, "yyyy-MM-dd");
  const periodKey = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

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

  // Vedoucí goals per period
  const { data: vedouciGoals, refetch: refetchGoals } = useQuery({
    queryKey: ["vedouci_goals", profile?.id, periodKey],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data } = await supabase
        .from("vedouci_goals" as any)
        .select("*")
        .eq("user_id", profile.id)
        .eq("period_key", periodKey)
        .maybeSingle();
      return data as any;
    },
    enabled: !!profile?.id && activeRole === "vedouci",
  });

  const [goalsModalOpen, setGoalsModalOpen] = useState(false);

  // Helper: map goal key to current value (scope-aware for people goals)
  const getGoalScope = (key: GoalKey): string => {
    if (!vedouciGoals) return "direct";
    switch (key) {
      case "vedouci_count": return vedouciGoals.vedouci_count_scope || "direct";
      case "budouci_vedouci_count": return vedouciGoals.budouci_vedouci_count_scope || "direct";
      case "garant_count": return vedouciGoals.garant_count_scope || "direct";
      default: return "direct";
    }
  };
  const getGoalValue = (key: GoalKey): number => {
    const scope = getGoalScope(key);
    switch (key) {
      case "team_bj": return vedouciMonthlyBj;
      case "personal_bj": return personalMonthlyBj;
      case "vedouci_count": return scope === "direct" ? directVedouciCount : vedouciSubCount;
      case "budouci_vedouci_count": return scope === "direct" ? directBvCount : bvCount;
      case "garant_count": return scope === "direct" ? directGarantCount : garantCount;
      default: return 0;
    }
  };
  const getGoalMax = (key: GoalKey): number => {
    if (!vedouciGoals) return 0;
    switch (key) {
      case "team_bj": return vedouciGoals.team_bj_goal || 0;
      case "personal_bj": return vedouciGoals.personal_bj_goal || 0;
      case "vedouci_count": return vedouciGoals.vedouci_count_goal || 0;
      case "budouci_vedouci_count": return vedouciGoals.budouci_vedouci_count_goal || 0;
      case "garant_count": return vedouciGoals.garant_count_goal || 0;
      default: return 0;
    }
  };
  const getGoalLabel = (key: GoalKey): string => {
    const base = GOAL_OPTIONS.find((g) => g.key === key)?.label ?? key;
    const isPeopleGoal = ["vedouci_count", "budouci_vedouci_count", "garant_count"].includes(key);
    if (!isPeopleGoal) return base;
    const scope = getGoalScope(key);
    return scope === "direct" ? `${base} (přímí)` : `${base} (celkem)`;
  };
  const selectedGoal1: GoalKey = vedouciGoals?.selected_goal_1 || "team_bj";
  const selectedGoal2: GoalKey | null = vedouciGoals?.selected_goal_2 || null;
  const vedouciGaugeKeys: GoalKey[] = selectedGoal2 ? [selectedGoal1, selectedGoal2] : [selectedGoal1];

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
              : role === "novacek"
                ? "Postup k tvému povýšení na pozici Získatele:"
                : role === "ziskatel"
                  ? "Postup k tvému povýšení na pozici Garanta:"
                  : role === "garant"
                    ? "Postup k tvému povýšení na pozici Budoucího vedoucího:"
                    : "Postup k tvému povýšení na pozici Vedoucího:"}
          </div>
        </div>

        {/* ── STAV BYZNYSU GAUGES ── */}
        <div style={{ position: "relative" }}>
          {role === "vedouci" && !isImpersonating && (
            <button
              onClick={() => setGoalsModalOpen(true)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                zIndex: 2,
                background: "rgba(255,255,255,0.15)",
                border: "none",
                borderRadius: 8,
                padding: 6,
                cursor: "pointer",
              }}
            >
              <Pencil size={14} color="rgba(255,255,255,0.8)" />
            </button>
          )}
          <div
            style={{
              background: "linear-gradient(135deg, #00555f 0%, #007a84 100%)",
              borderRadius: 20,
              padding: "16px 12px 14px",
              marginBottom: 12,
              color: "white",
              boxShadow: "0 4px 24px rgba(0,85,95,0.28)",
            }}
          >
            {role === "novacek" ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder dark />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder dark />
                </div>
              </div>
            ) : role === "vedouci" ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                {vedouciGaugeKeys.map((gk) => {
                  const val = getGoalValue(gk);
                  const max = getGoalMax(gk);
                  const done = max > 0 && val >= max;
                  return (
                    <div key={gk} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <GaugeIndicator
                        value={val}
                        max={max || 1}
                        label={getGoalLabel(gk)}
                        sublabel={max > 0 ? (done ? "✓ Splněno" : `${val} z ${max}`) : `${val}`}
                        dark
                        completed={done}
                        placeholder={max === 0}
                        valueLabel={max === 0 ? String(val) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            ) : role === "ziskatel" ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={totalBjAllTime} max={1000} label="Kumulativní BJ" sublabel={totalBjAllTime >= 1000 ? "✓ Splněno" : `${totalBjAllTime} z 1 000`} dark completed={totalBjAllTime >= 1000} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={ziskatelStructureCount} max={2} label="Lidé ve struktuře" sublabel={ziskatelStructureCount >= 2 ? "✓ Splněno" : `${ziskatelStructureCount} z 2`} dark completed={ziskatelStructureCount >= 2} />
                </div>
              </div>
            ) : role === "garant" ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={structureCount} max={5} label="Lidé ve struktuře" sublabel={structureCount >= 5 ? "✓ Splněno" : `${structureCount} z 5`} dark completed={structureCount >= 5} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={directSubordinateCount} max={3} label="Přímá linka" sublabel={directSubordinateCount >= 3 ? "✓ Splněno" : `${directSubordinateCount} z 3`} dark completed={directSubordinateCount >= 3} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={structureCount} max={10} label="Lidé ve struktuře" sublabel={structureCount >= 10 ? "✓ Splněno" : `${structureCount} z 10`} dark completed={structureCount >= 10} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <GaugeIndicator value={directSubordinateCount} max={6} label="Přímá linka" sublabel={directSubordinateCount >= 6 ? "✓ Splněno" : `${directSubordinateCount} z 6`} dark completed={directSubordinateCount >= 6} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        {(role === "vedouci" || role === "budouci_vedouci") ? (
          <>
            {/* 1) Nově domluvené schůzky */}
            <div
              style={{
                background: isDark ? "rgba(0,171,189,0.08)" : "rgba(0,171,189,0.06)",
                borderRadius: 16,
                padding: "14px 16px",
                marginBottom: 10,
                border: isDark ? "1px solid rgba(0,171,189,0.2)" : "1px solid rgba(0,171,189,0.15)",
              }}
            >
              <div
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#00abbd",
                  marginBottom: 12,
                }}
              >
                Nově domluveno tento týden
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "space-around" }}>
                {[
                  { label: "Analýzy", value: mobileNewlyArranged.fsa },
                  { label: "Pohovory", value: mobileNewlyArranged.poh },
                  { label: "Servisy", value: mobileNewlyArranged.ser },
                ].map((item) => (
                  <div key={item.label} style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 800,
                        fontSize: 28,
                        color: "#00555f",
                        lineHeight: 1,
                      }}
                    >
                      {item.value}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginTop: 4,
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2-5) Pohovory, Doporučení, Analýzy, Poradenství */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <MobileStatCard
                label="Pohovory"
                actual={mobileStats.poh.actual}
                planned={mobileStats.poh.planned}
                sublabel="proběhlých / na týden"
              />
              <MobileStatCard label="Doporučení" actual={mobileStats.ref.actual} sublabel="celkem" />
              <MobileStatCard
                label="Analýzy"
                actual={mobileStats.fsa.actual}
                planned={mobileStats.fsa.planned}
                sublabel="proběhlých / na týden"
              />
              <MobileStatCard
                label="Poradenství"
                actual={mobileStats.por.actual}
                planned={mobileStats.por.planned}
                sublabel="proběhlých / na týden"
              />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <MobileStatCard
                label="Analýzy"
                actual={mobileStats.fsa.actual}
                planned={mobileStats.fsa.planned}
                sublabel="proběhlých / na týden"
              />
              <MobileStatCard
                label="Pohovory"
                actual={mobileStats.poh.actual}
                planned={mobileStats.poh.planned}
                sublabel="proběhlých / na týden"
              />
              <MobileStatCard
                label="Servisy"
                actual={mobileStats.ser.actual}
                planned={mobileStats.ser.planned}
                sublabel="proběhlých / na týden"
              />
              <MobileStatCard
                label="Poradenství"
                actual={mobileStats.por.actual}
                planned={mobileStats.por.planned}
                sublabel="proběhlých / na týden"
              />
              <MobileStatCard label="Doporučení" actual={mobileStats.ref.actual} sublabel="celkem" />
            </div>

            {/* Nově domluveno */}
            <div
              style={{
                background: isDark ? "rgba(0,171,189,0.08)" : "rgba(0,171,189,0.06)",
                borderRadius: 16,
                padding: "14px 16px",
                marginBottom: 10,
                border: isDark ? "1px solid rgba(0,171,189,0.2)" : "1px solid rgba(0,171,189,0.15)",
              }}
            >
              <div
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#00abbd",
                  marginBottom: 12,
                }}
              >
                Nově domluveno tento týden
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "space-around" }}>
                {[
                  { label: "Analýzy", value: mobileNewlyArranged.fsa },
                  { label: "Servisy", value: mobileNewlyArranged.ser },
                  { label: "Pohovory", value: mobileNewlyArranged.poh },
                ].map((item) => (
                  <div key={item.label} style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 800,
                        fontSize: 28,
                        color: "#00555f",
                        lineHeight: 1,
                      }}
                    >
                      {item.value}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginTop: 4,
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

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
            <div
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}
            >
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
        {profile?.id && (
          <VedouciGoalsModal
            open={goalsModalOpen}
            onClose={() => setGoalsModalOpen(false)}
            userId={profile.id}
            periodKey={periodKey}
            onSaved={() => refetchGoals()}
          />
        )}
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
      return (
        <>
          {!isImpersonating && (
            <button
              onClick={() => setGoalsModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold self-end transition-colors hover:opacity-80"
              style={{ color: "#00abbd", marginBottom: -8 }}
            >
              <Pencil size={12} /> Upravit cíle
            </button>
          )}
          {vedouciGaugeKeys.map((gk) => {
            const val = getGoalValue(gk);
            const max = getGoalMax(gk);
            const done = max > 0 && val >= max;
            return (
              <GaugeIndicator
                key={gk}
                value={val}
                max={max || 1}
                label={getGoalLabel(gk)}
                sublabel={max > 0 ? (done ? "✓ Splněno" : `${val} z ${max}`) : `${val}`}
                completed={done}
                placeholder={max === 0}
                valueLabel={max === 0 ? String(val) : undefined}
              />
            );
          })}
        </>
      );
    }

    if (role === "ziskatel") {
      const bjDone = totalBjAllTime >= 1000;
      const peopleDone = ziskatelStructureCount >= 2;
      return (
        <>
          <GaugeIndicator
            value={totalBjAllTime}
            max={1000}
            label="Kumulativní BJ"
            sublabel={bjDone ? "✓ Splněno" : `${totalBjAllTime} z 1 000`}
            completed={bjDone}
          />
          <GaugeIndicator
            value={ziskatelStructureCount}
            max={2}
            label="Lidé ve struktuře"
            sublabel={peopleDone ? "✓ Splněno" : `${ziskatelStructureCount} z 2`}
            completed={peopleDone}
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
            value={structureCount}
            max={5}
            label="Lidé ve struktuře"
            sublabel={structDone ? "✓ Splněno" : `${structureCount} z 5`}
            completed={structDone}
          />
          <GaugeIndicator
            value={directSubordinateCount}
            max={3}
            label="Přímá linka"
            sublabel={directDone ? "✓ Splněno" : `${directSubordinateCount} z 3`}
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
          value={structureCount}
          max={10}
          label="Lidé ve struktuře"
          sublabel={structDone ? "✓ Splněno" : `${structureCount} z 10`}
          completed={structDone}
        />
        <GaugeIndicator
          value={directSubordinateCount}
          max={6}
          label="Přímá linka"
          sublabel={directDone ? "✓ Splněno" : `${directSubordinateCount} z 6`}
          completed={directDone}
        />
      </>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <LayoutDashboard className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
          DASHBOARD
        </h1>
        <ProductionMonthPicker
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onChange={(y, m) => {
            setSelectedYear(y);
            setSelectedMonth(m);
          }}
        />
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
          <div className="flex gap-6" style={{ alignItems: "stretch", height: 500 }}>
            {/* Stav byznysu — 1/4 */}
            <div style={{ width: "25%", flexShrink: 0, display: "flex", flexDirection: "column" }}>
              <h2
                className="font-heading font-semibold"
                style={{ fontSize: 22, color: "var(--text-primary)", marginBottom: 16 }}
              >
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
              <h2
                className="font-heading font-semibold"
                style={{ fontSize: 22, color: "var(--text-primary)", marginBottom: 16 }}
              >
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
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    minHeight: 0,
                    transition: "opacity 0.2s ease, transform 0.2s ease",
                    opacity: orgTransitioning ? 0 : 1,
                    transform: orgTransitioning ? "scale(0.97)" : "scale(1)",
                  }}
                >
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

          <div className="space-y-4">
            {/* Row 1 — Proběhlo */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Proběhlo</p>
              <div className="grid grid-cols-5 gap-2">
                <MiniStatCard label="Analýzy" value={stats.fsa.actual} color="#00abbd" />
                <MiniStatCard label="Pohovory" value={stats.poh.actual} color="#f59e0b" />
                <MiniStatCard label="Servisy" value={stats.ser.actual} color="#ef4444" />
                <MiniStatCard label="Poradenství" value={stats.por.actual} color="#8b5cf6" />
                <MiniStatCard label="Doporučení" value={stats.ref.actual} color="#10b981" />
              </div>
            </div>
            {/* Row 2 — Nově domluveno */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Nově domluveno</p>
              <div className="grid grid-cols-4 gap-2">
                <MiniStatCard label="Analýzy" value={newlyBooked.fsa} color="#00abbd" />
                <MiniStatCard label="Pohovory" value={newlyBooked.poh} color="#f59e0b" />
                <MiniStatCard label="Servisy" value={newlyBooked.ser} color="#ef4444" />
                <MiniStatCard label="Poradenství" value={newlyBooked.por} color="#8b5cf6" />
              </div>
            </div>
          </div>
        </section>

        <PromotionModal open={!!promotionRole} onClose={() => setPromotionRole(null)} newRole={promotionRole || ""} />
        {profile?.id && (
          <VedouciGoalsModal
            open={goalsModalOpen}
            onClose={() => setGoalsModalOpen(false)}
            userId={profile.id}
            periodKey={periodKey}
            onSaved={() => refetchGoals()}
          />
        )}
      </div>
    </div>
  );
};

export default Dashboard;
