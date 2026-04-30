import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Check,
  ArrowLeft,
  Target,
  FileDown,
  Loader2,
  Clock,
  Plus,
} from "lucide-react";
import { exportDashboardPdf, type ExportPeriod } from "@/lib/exportPdf";
import { GoalKey, GOAL_OPTIONS } from "@/components/VedouciGoalsModal";
import { GaugeIndicator } from "@/components/GaugeIndicator";
import { GoalsSection, type GoalGaugeItem } from "@/components/GoalsSection";
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

import { fireConfetti } from "@/lib/confetti";
import { PromotionModal } from "@/components/PromotionModal";
import { VedouciGoalsModal } from "@/components/VedouciGoalsModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { toVocative } from "@/lib/vocative";
import { useTheme } from "@/contexts/ThemeContext";
import { checkPromotions as runCheckPromotions } from "@/lib/checkPromotions";
import { useGoalConfiguration } from "@/hooks/useGoalConfiguration";
import { MeetingFormModal, type MeetingForm, type MeetingType, type Case, defaultMeetingForm } from "@/components/MeetingFormFields";
import { StatCard } from "@/components/StatCard";
import { PeriodNavigator } from "@/components/PeriodNavigator";
import { FollowUpModal } from "@/components/FollowUpModal";
import { toast } from "sonner";
import { computeMeetingStats } from "@/lib/meetingStats";
import { ConversionFunnel } from "@/components/ConversionFunnel";

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

// ─── Info/Postinfo cards with 3 metrics ──────────────────────────────────────

function InfoPostMobileCard({
  label, novi, staracci,
}: { label: string; novi: number; staracci: number }) {
  return (
    <div className="mobile-stat-card">
      <div className="mobile-stat-label">{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
        {[
          { v: novi, l: "Nováčci" },
          { v: staracci, l: "Staráčci" },
        ].map((m, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 24, color: "#00555f", lineHeight: 1 }}>{m.v}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted, #8aadb3)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{m.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoPostDesktopCard({
  label, novi, staracci,
}: { label: string; novi: number; staracci: number }) {
  return (
    <div className="stat-card flex flex-col gap-3 overflow-hidden">
      <p className="font-body text-center truncate" style={{ color: "#EF8C6F", fontSize: 13, fontWeight: 500 }}>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { v: novi, l: "Nováčci" },
          { v: staracci, l: "Staráčci" },
        ].map((m, i) => (
          <div key={i} className="text-center">
            <div className="font-heading font-bold leading-none" style={{ color: "#00555f", fontSize: 28 }}>{m.v}</div>
            <div className="font-body text-[10px] mt-1.5 uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted, #8aadb3)" }}>{m.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ActivityCard — combined stat card for desktop ────────────────────────────

function ActivityCard({
  label,
  actual,
  total,
  newly,
  color,
}: {
  label: string;
  actual: number;
  total: number;
  newly: number;
  color: string;
}) {
  const progress = total > 0 ? actual / total : 0;
  return (
    <div
      className="rounded-xl border border-input bg-card px-4 py-3 space-y-2"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span>
          <span style={{ color, fontWeight: 700, fontSize: 22 }}>{actual}</span>
          <span className="text-xs text-muted-foreground font-medium"> z {total}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(progress * 100)}%`, background: color }}
        />
      </div>
      {newly > 0 && <p className="text-[11px] text-muted-foreground">+{newly} nově domluveno</p>}
    </div>
  );
}

// ─── Helper: compute stats from meetings ──────────────────────────────────────
// Single source of truth: see src/lib/meetingStats.ts. Same logic is used in
// MemberActivity and the PDF export so the cards never disagree.
function computeStats(meetings: any[], todayStr: string) {
  return computeMeetingStats(meetings, todayStr);
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
    nab: inWeek.filter((m: any) => m.meeting_type === "NAB").length,
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
  const [exportingPdf, setExportingPdf] = useState<ExportPeriod | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // ── Dashboard view mode: "month" (production period) | "week" ──
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [viewModeMenuOpen, setViewModeMenuOpen] = useState(false);

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

  // Admin goal configuration
  const { goals: adminGoals } = useGoalConfiguration(activeProfile?.role);

  // Promotion rules from admin config
  const { data: promotionRules } = useQuery({
    queryKey: ["app_config", "promotion_rules"],
    queryFn: async () => {
      const { data } = await supabase.from("app_config").select("value").eq("key", "promotion_rules").single();
      return data?.value as any;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Resolved promotion thresholds
  const promoThresholds = useMemo(() => ({
    ziskatel_bj: promotionRules?.ziskatel_to_garant?.min_bj ?? 1000,
    ziskatel_structure: promotionRules?.ziskatel_to_garant?.min_structure ?? 2,
    garant_structure: promotionRules?.garant_to_bv?.min_structure ?? 5,
    garant_direct: promotionRules?.garant_to_bv?.min_direct ?? 3,
    bv_structure: promotionRules?.bv_to_vedouci?.min_structure ?? 10,
    bv_direct: promotionRules?.bv_to_vedouci?.min_direct ?? 6,
  }), [promotionRules]);

  // Week navigation (shared logic for mobile + desktop activity section)
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const mobileWeekStart = useMemo(
    () => addWeeks(startOfWeek(now, { weekStartsOn: 1 }), mobileWeekOffset),
    [mobileWeekOffset],
  );
  const mobileWeekEnd = endOfWeek(mobileWeekStart, { weekStartsOn: 1 });
  const isMobileWeekEditable = isSameWeek(mobileWeekStart, now, { weekStartsOn: 1 });

  // ── Mobile FAB: new meeting modal ──
  const [fabMeetingOpen, setFabMeetingOpen] = useState(false);
  const [fabFollowUp, setFabFollowUp] = useState<{ caseId: string; caseName: string; meetingType: MeetingType; parentMeetingId: string | null } | null>(null);

  const { data: fabCases = [] } = useQuery({
    queryKey: ["cases", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase.from("cases").select("*").eq("user_id", profile.id).eq("status", "aktivni").order("nazev_pripadu");
      return (data || []) as Case[];
    },
    enabled: !!profile?.id,
  });

  const fabSaveMeeting = useMutation({
    mutationFn: async ({ form }: { form: MeetingForm; skipFollowUp?: boolean }) => {
      const payload: Record<string, unknown> = {
        user_id: profile!.id,
        case_id: form.case_id || null,
        date: form.date,
        meeting_type: form.meeting_type,
        cancelled: form.cancelled,
        case_name: form.case_name.trim() || null,
        location_type: form.location_type || null,
        location_detail: form.location_detail.trim() || null,
        potencial_bj: form.meeting_type === "FSA" && !form.cancelled ? parseFloat(form.potencial_bj) || null : null,
        podepsane_bj: !form.cancelled && (form.meeting_type === "POR" || form.meeting_type === "SER") ? parseFloat(form.podepsane_bj) || 0 : 0,
        doporuceni_fsa: !form.cancelled && (form.meeting_type === "FSA" || form.meeting_type === "NAB") ? parseInt(form.doporuceni_fsa) || 0 : 0,
        doporuceni_poradenstvi: !form.cancelled && (form.meeting_type === "POR" || form.meeting_type === "SER") ? parseInt(form.doporuceni_poradenstvi) || 0 : 0,
        doporuceni_pohovor: !form.cancelled && form.meeting_type === "POH" ? parseInt(form.doporuceni_pohovor) || 0 : 0,
        pohovor_jde_dal: !form.cancelled && form.meeting_type === "POH" ? form.pohovor_jde_dal : null,
        vizi_spoluprace: !form.cancelled && form.meeting_type === "POH" && form.pohovor_jde_dal === true,
        has_poradenstvi: false,
        poradenstvi_status: null,
        has_pohovor: false,
        poznamka: form.poznamka.trim() || null,
        info_zucastnil_se: !form.cancelled && (form.meeting_type === "INFO" || form.meeting_type === "POST") ? form.info_zucastnil_se : null,
        info_pocet_lidi: !form.cancelled && (form.meeting_type === "INFO" || form.meeting_type === "POST") && form.info_pocet_lidi !== "" ? parseInt(form.info_pocet_lidi) || 0 : null,
        parent_meeting_id: form.parent_meeting_id ?? null,
      };
      const { data, error } = await supabase.from("client_meetings").insert(payload as any).select("id").single();
      if (error) throw error;
      return { insertedId: (data as any)?.id as string | undefined };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Schůzka přidána");
      setFabMeetingOpen(false);
      const f = variables.form;
      if (!variables.skipFollowUp && !f.cancelled && f.case_id) {
        const c = fabCases.find((c) => c.id === f.case_id);
        if (c) setFabFollowUp({ caseId: f.case_id, caseName: c.nazev_pripadu, meetingType: f.meeting_type, parentMeetingId: result?.insertedId ?? null });
      }
    },
    onError: (err: any) => toast.error(err.message || "Chyba"),
  });

  const [desktopWeekDate, setDesktopWeekDate] = useState(() => startOfWeek(now, { weekStartsOn: 1 }));
  const desktopWeekStart = useMemo(
    () => startOfWeek(desktopWeekDate, { weekStartsOn: 1 }),
    [desktopWeekDate],
  );
  const desktopWeekEnd = endOfWeek(desktopWeekStart, { weekStartsOn: 1 });
  const isDesktopWeekCurrent = isSameWeek(desktopWeekStart, now, { weekStartsOn: 1 });

  // "Konverze aktivit" reuses the same global week as the rest of the dashboard
  const conversionWeekStart = desktopWeekStart;
  const conversionWeekEnd = desktopWeekEnd;
  const setConversionWeekDate = setDesktopWeekDate;
  const conversionWeekDate = desktopWeekDate;
  const isConversionWeekCurrent = isSameWeek(conversionWeekStart, now, { weekStartsOn: 1 });

  // Vedoucí: kontrola povýšení při načtení Dashboardu (záložní trigger mimo Správa týmu)
  const promotionCheckDoneRef = useRef(false);
  useEffect(() => {
    if (!profile || !["vedouci", "budouci_vedouci"].includes(profile.role) || promotionCheckDoneRef.current) return;
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

  // ── Desktop date range — month mode = production period, week mode = selected week ──
  const dateRange = useMemo(
    () =>
      viewMode === "week"
        ? { from: desktopWeekStart, to: desktopWeekEnd }
        : { from: selectedPeriod.start, to: selectedPeriod.end },
    [viewMode, selectedPeriod, desktopWeekStart, desktopWeekEnd],
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
          "meeting_type, cancelled, date, created_at, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj, outcome_recorded",
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
          "meeting_type, cancelled, date, created_at, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj, outcome_recorded",
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
    () =>
      computeNewlyArranged(desktopMeetings, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")),
    [desktopMeetings, dateRange],
  );

  // ── Desktop week-based meetings for Přehled aktivit ──────────────────────────
  const desktopWeekStartStr = format(desktopWeekStart, "yyyy-MM-dd");
  const desktopWeekEndStr = format(desktopWeekEnd, "yyyy-MM-dd");

  const { data: desktopWeekMeetings = [] } = useQuery({
    queryKey: ["dashboard_meetings_desktop_week", activeUserId, desktopWeekStartStr, desktopWeekEndStr],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select(
          "meeting_type, cancelled, date, created_at, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj, outcome_recorded",
        )
        .eq("user_id", activeUserId)
        .gte("date", desktopWeekStartStr)
        .lte("date", desktopWeekEndStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId && !isMobile,
  });

  const desktopWeekStats = useMemo(() => computeStats(desktopWeekMeetings, todayStr), [desktopWeekMeetings, todayStr]);

  // ── Konverze aktivit: meetings for the currently selected dashboard period ────
  // (follows the global viewMode — week or month — via dateRange)
  const conversionRangeStartStr = format(dateRange.from, "yyyy-MM-dd");
  const conversionRangeEndStr = format(dateRange.to, "yyyy-MM-dd");

  const { data: conversionMeetings = [] } = useQuery({
    queryKey: ["dashboard_conversion_meetings", activeUserId, conversionRangeStartStr, conversionRangeEndStr],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("id, meeting_type, cancelled, outcome_recorded, parent_meeting_id, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor")
        .eq("user_id", activeUserId)
        .gte("date", conversionRangeStartStr)
        .lte("date", conversionRangeEndStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId && !isMobile,
  });

  // ── Newly booked meetings (by created_at in the desktop week) ───────────────
  const { data: newlyBookedMeetings = [] } = useQuery({
    queryKey: ["dashboard_newly_booked", activeUserId, desktopWeekStartStr, desktopWeekEndStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("meeting_type, cancelled")
        .eq("user_id", activeUserId)
        .gte("created_at", desktopWeekStart.toISOString())
        .lte("created_at", desktopWeekEnd.toISOString());
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
      nab: active.filter((m: any) => m.meeting_type === "NAB").length,
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

      // Stáhneme všechny aktivní profily pod stejným Vedoucím NEBO pod activeUserId jako vedoucím
      // (BV může mít vlastní subtým kde členové mají vedouci_id = BV's id)
      const { data: teamMembers } = await supabase
        .from("profiles")
        .select("id, ziskatel_id")
        .or(`vedouci_id.eq.${vedouciId},vedouci_id.eq.${activeUserId}`)
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

  // Vedoucí: INCREMENT counts — lidé povýšení na danou roli v rámci aktuálního
  // období (zdroj = promotion_requests se statusem 'approved' a reviewed_at
  // uvnitř period). Děláme 2 varianty: "direct" (jen ti, koho získal přímo
  // aktuální uživatel) a "structure" (kdokoliv v subtree).
  const periodStartIso = new Date(selectedPeriod.start).toISOString();
  const periodEndIso = new Date(
    new Date(selectedPeriod.end).setHours(23, 59, 59, 999),
  ).toISOString();

  const { data: incrementCounts = { direct: { vedouci: 0, budouci_vedouci: 0, garant: 0, ziskatel: 0 }, structure: { vedouci: 0, budouci_vedouci: 0, garant: 0, ziskatel: 0 } } } = useQuery({
    queryKey: ["promotion_increments", activeUserId, periodStartIso, periodEndIso],
    queryFn: async () => {
      const empty = { direct: { vedouci: 0, budouci_vedouci: 0, garant: 0, ziskatel: 0 }, structure: { vedouci: 0, budouci_vedouci: 0, garant: 0, ziskatel: 0 } };
      if (!activeUserId) return empty;

      // 1) Najdi všechny schválené promotion_requests v období
      const { data: approved } = await supabase
        .from("promotion_requests")
        .select("user_id, requested_role, reviewed_at")
        .eq("status", "approved")
        .gte("reviewed_at", periodStartIso)
        .lte("reviewed_at", periodEndIso);
      if (!approved || approved.length === 0) return empty;

      // 2) Zjistí, kdo je v subtree (structure) a kdo je direct (ziskatel_id = me)
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, ziskatel_id");
      if (!allProfiles) return empty;

      const childMap = new Map<string, string[]>();
      for (const p of allProfiles as any[]) {
        if (p.ziskatel_id) {
          if (!childMap.has(p.ziskatel_id)) childMap.set(p.ziskatel_id, []);
          childMap.get(p.ziskatel_id)!.push(p.id);
        }
      }
      const subtree = new Set<string>();
      const queue = [...(childMap.get(activeUserId) || [])];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (subtree.has(id)) continue;
        subtree.add(id);
        queue.push(...(childMap.get(id) || []));
      }
      const directSet = new Set<string>(childMap.get(activeUserId) || []);

      const counts = {
        direct: { vedouci: 0, budouci_vedouci: 0, garant: 0, ziskatel: 0 } as Record<string, number>,
        structure: { vedouci: 0, budouci_vedouci: 0, garant: 0, ziskatel: 0 } as Record<string, number>,
      };
      for (const a of approved as any[]) {
        const role = a.requested_role;
        if (!(role in counts.direct)) continue;
        if (directSet.has(a.user_id)) counts.direct[role]++;
        if (subtree.has(a.user_id)) counts.structure[role]++;
      }
      return counts;
    },
    enabled: !!activeUserId && activeRole === "vedouci",
  });

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

  // Vedouci/BV: count INFO and POST meetings across team (subtree) for current period
  // RLS limits visibility to user's subtree + self, so we don't need to filter by user_id explicitly
  const { data: teamInfoPostCounts = { info: 0, postinfo: 0, noviInfo: 0, staracciInfo: 0, noviPost: 0, staracciPost: 0 } } = useQuery({
    queryKey: ["team_info_post_counts", activeUserId, periodStartStr, periodEndStr],
    queryFn: async () => {
      const empty = { info: 0, postinfo: 0, noviInfo: 0, staracciInfo: 0, noviPost: 0, staracciPost: 0 };
      if (!activeUserId) return empty;
      const { data } = await supabase
        .from("client_meetings")
        .select("meeting_type, info_pocet_lidi, info_zucastnil_se, user_id")
        .eq("cancelled", false)
        .in("meeting_type", ["INFO", "POST"])
        .gte("date", periodStartStr)
        .lte("date", periodEndStr);
      const rows = data || [];
      const infoRows = rows.filter((r: any) => r.meeting_type === "INFO");
      const postRows = rows.filter((r: any) => r.meeting_type === "POST");
      const sumNovi = (arr: any[]) => arr.reduce((s, r) => s + (Number(r.info_pocet_lidi) || 0), 0);
      const uniqAttended = (arr: any[]) => {
        const ids = new Set<string>();
        for (const r of arr) if (r.info_zucastnil_se === true && r.user_id) ids.add(r.user_id);
        return ids.size;
      };
      return {
        info: infoRows.length,
        postinfo: postRows.length,
        noviInfo: sumNovi(infoRows),
        staracciInfo: uniqAttended(infoRows),
        noviPost: sumNovi(postRows),
        staracciPost: uniqAttended(postRows),
      };
    },
    enabled: !!activeUserId && (activeRole === "vedouci" || activeRole === "budouci_vedouci"),
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

  // Onboarding tasks for Nováček progress bar
  const { data: onboardingTasks = [] } = useQuery({
    queryKey: ["onboarding_tasks_progress", activeUserId],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from("onboarding_tasks")
        .select("id, title, deadline, completed, sort_order")
        .eq("novacek_id", activeUserId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId && activeRole === "novacek",
  });

  const onboardingProgress = useMemo(() => {
    const total = onboardingTasks.length;
    const done = onboardingTasks.filter((t: any) => t.completed).length;
    const nextTask = onboardingTasks.find((t: any) => !t.completed);
    return { total, done, percent: total > 0 ? Math.round((done / total) * 100) : 0, nextTask };
  }, [onboardingTasks]);

  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [goalsSwipePage, setGoalsSwipePage] = useState(0);
  const goalsSwipeRef = useRef<HTMLDivElement>(null);

  // Helper: map goal key to current value (scope + count_type aware for people goals)
  const getGoalScope = (key: GoalKey): string => {
    if (!vedouciGoals) return "direct";
    switch (key) {
      case "vedouci_count":
        return vedouciGoals.vedouci_count_scope || "direct";
      case "budouci_vedouci_count":
        return vedouciGoals.budouci_vedouci_count_scope || "direct";
      case "garant_count":
        return vedouciGoals.garant_count_scope || "direct";
      case "ziskatel_count":
        return (vedouciGoals as any).ziskatel_count_scope || "direct";
      default:
        return "direct";
    }
  };
  const getGoalType = (key: GoalKey): "total" | "increment" => {
    if (!vedouciGoals) return "total";
    switch (key) {
      case "vedouci_count":
        return ((vedouciGoals as any).vedouci_count_type || "total") as "total" | "increment";
      case "budouci_vedouci_count":
        return ((vedouciGoals as any).budouci_vedouci_count_type || "total") as "total" | "increment";
      case "garant_count":
        return ((vedouciGoals as any).garant_count_type || "total") as "total" | "increment";
      case "ziskatel_count":
        return ((vedouciGoals as any).ziskatel_count_type || "total") as "total" | "increment";
      default:
        return "total";
    }
  };
  const getGoalValue = (key: GoalKey): number => {
    const scope = getGoalScope(key);
    const type = getGoalType(key);
    // People goals: pokud type=increment, použij počet povýšení v období
    if (["vedouci_count", "budouci_vedouci_count", "garant_count", "ziskatel_count"].includes(key)) {
      const roleKey = key.replace("_count", "") as "vedouci" | "budouci_vedouci" | "garant" | "ziskatel";
      if (type === "increment") {
        const bucket = scope === "direct" ? incrementCounts.direct : incrementCounts.structure;
        return (bucket as any)[roleKey] ?? 0;
      }
      // total — stávající chování
      switch (key) {
        case "vedouci_count":
          return scope === "direct" ? directVedouciCount : vedouciSubCount;
        case "budouci_vedouci_count":
          return scope === "direct" ? directBvCount : bvCount;
        case "garant_count":
          return scope === "direct" ? directGarantCount : garantCount;
        default:
          return 0;
      }
    }
    switch (key) {
      case "team_bj":
        return vedouciMonthlyBj;
      case "personal_bj":
        return personalMonthlyBj;
      default:
        return 0;
    }
  };
  const getGoalMax = (key: GoalKey): number => {
    if (!vedouciGoals) return 0;
    switch (key) {
      case "team_bj":
        return vedouciGoals.team_bj_goal || 0;
      case "personal_bj":
        return vedouciGoals.personal_bj_goal || 0;
      case "vedouci_count":
        return vedouciGoals.vedouci_count_goal || 0;
      case "budouci_vedouci_count":
        return vedouciGoals.budouci_vedouci_count_goal || 0;
      case "garant_count":
        return vedouciGoals.garant_count_goal || 0;
      case "ziskatel_count":
        return (vedouciGoals as any).ziskatel_count_goal || 0;
      default:
        return 0;
    }
  };
  const getGoalLabel = (key: GoalKey): string => {
    const base = GOAL_OPTIONS.find((g) => g.key === key)?.label ?? key;
    const isPeopleGoal = ["vedouci_count", "budouci_vedouci_count", "garant_count", "ziskatel_count"].includes(key);
    if (!isPeopleGoal) return base;
    const scope = getGoalScope(key);
    const type = getGoalType(key);
    const scopeLabel = scope === "direct" ? "přímí" : "celkem";
    return type === "increment"
      ? `${base} (${scopeLabel}, přírůstek)`
      : `${base} (${scopeLabel})`;
  };
  const selectedGoal1: GoalKey = vedouciGoals?.selected_goal_1 || "team_bj";
  const selectedGoal2: GoalKey | null = vedouciGoals?.selected_goal_2 || null;
  const vedouciGaugeKeys: GoalKey[] = selectedGoal2 ? [selectedGoal1, selectedGoal2] : [selectedGoal1];

  // ── Header period navigator helpers (desktop) ─ MUST be declared before any early return
  const headerNav = useMemo(() => {
    if (viewMode === "week") {
      return {
        label: isDesktopWeekCurrent
          ? "Aktuální týden"
          : format(desktopWeekStart, "LLLL yyyy", { locale: cs }).replace(/^./, (c) => c.toUpperCase()),
        title: `${format(desktopWeekStart, "d.M.", { locale: cs })} – ${format(desktopWeekEnd, "d.M.", { locale: cs })}`,
        onPrev: () => setDesktopWeekDate((d) => subWeeks(d, 1)),
        onNext: () => {
          if (!isDesktopWeekCurrent) setDesktopWeekDate((d) => addWeeks(d, 1));
        },
        onSelectDate: (date: Date) => setDesktopWeekDate(startOfWeek(date, { weekStartsOn: 1 })),
        selectedDate: desktopWeekStart,
        calendarMonth: desktopWeekStart,
        pickerMode: "day" as const,
      };
    }
    const monthNamesFull = [
      "Leden","Únor","Březen","Duben","Květen","Červen",
      "Červenec","Srpen","Září","Říjen","Listopad","Prosinec",
    ];
    const isCurrentMonth = selectedYear === currentPeriod.year && selectedMonth === currentPeriod.month;
    return {
      label: isCurrentMonth ? "Aktuální období" : "Produkční období",
      title: `${monthNamesFull[selectedMonth]} ${selectedYear}`,
      onPrev: () => {
        let m = selectedMonth - 1;
        let y = selectedYear;
        if (m < 0) { m = 11; y -= 1; }
        setSelectedMonth(m); setSelectedYear(y);
      },
      onNext: () => {
        if (selectedYear === currentPeriod.year && selectedMonth === currentPeriod.month) return;
        let m = selectedMonth + 1;
        let y = selectedYear;
        if (m > 11) { m = 0; y += 1; }
        setSelectedMonth(m); setSelectedYear(y);
      },
      onSelectDate: (date: Date) => {
        setSelectedYear(date.getFullYear());
        setSelectedMonth(date.getMonth());
      },
      selectedDate: new Date(selectedYear, selectedMonth, 1),
      calendarMonth: new Date(selectedYear, selectedMonth, 1),
      pickerMode: "month" as const,
    };
  }, [viewMode, isDesktopWeekCurrent, desktopWeekStart, desktopWeekEnd, selectedYear, selectedMonth, currentPeriod]);

  // Portal target for the AppLayout header actions slot (Export PDF appears left of the bell)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderSlot(document.getElementById("app-header-actions-slot"));
  }, []);

  // Sestavení goal items pro GoalsSection podle role.
  // Měsíční cíle = výkonnostní (BJ + vybrané), Povýšení = kumulativní BJ + struktura.
  // Sdíleno mezi mobile a desktop renderem.
  const buildGoalItems = (): {
    monthlyGoals: GoalGaugeItem[];
    promotionGoals: GoalGaugeItem[];
    promotionTargetRole?: string;
  } => {
    const monthlyGoals: GoalGaugeItem[] = [];
    const promotionGoals: GoalGaugeItem[] = [];
    let promotionTargetRole: string | undefined;
    const r = activeRole;

    if (r === "vedouci" || r === "budouci_vedouci") {
      vedouciGaugeKeys.forEach((gk) => {
        const max = getGoalMax(gk);
        const value = getGoalValue(gk);
        monthlyGoals.push({
          key: gk,
          value,
          max,
          label: getGoalLabel(gk),
          placeholder: max === 0,
        });
      });
      if (r === "budouci_vedouci") {
        promotionTargetRole = "Vedoucího";
        promotionGoals.push(
          { key: "bv_struct", value: structureCount, max: promoThresholds.bv_structure, label: "Lidé ve struktuře" },
          { key: "bv_direct", value: directSubordinateCount, max: promoThresholds.bv_direct, label: "Přímá linka" },
        );
      }
    } else if (r === "ziskatel") {
      const personalGoal = (activeProfile as any)?.personal_bj_goal || 0;
      monthlyGoals.push({
        key: "personal_bj",
        value: personalMonthlyBj,
        max: personalGoal,
        label: "Osobní BJ",
        placeholder: personalGoal === 0,
      });
      promotionTargetRole = "Garanta";
      promotionGoals.push(
        {
          key: "z_bj",
          value: totalBjAllTime,
          max: promoThresholds.ziskatel_bj,
          label: "Kumulativní BJ",
          valueLabel: totalBjAllTime >= 1000 ? totalBjAllTime.toLocaleString("cs-CZ") : undefined,
        },
        { key: "z_struct", value: ziskatelStructureCount, max: promoThresholds.ziskatel_structure, label: "Lidé ve struktuře" },
      );
    } else if (r === "garant") {
      const personalGoal = (activeProfile as any)?.personal_bj_goal || 0;
      monthlyGoals.push({
        key: "personal_bj",
        value: personalMonthlyBj,
        max: personalGoal,
        label: "Osobní BJ",
        placeholder: personalGoal === 0,
      });
      promotionTargetRole = "Budoucího vedoucího";
      promotionGoals.push(
        { key: "g_struct", value: structureCount, max: promoThresholds.garant_structure, label: "Lidé ve struktuře" },
        { key: "g_direct", value: directSubordinateCount, max: promoThresholds.garant_direct, label: "Přímá linka" },
      );
    }

    return { monthlyGoals, promotionGoals, promotionTargetRole };
  };

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
              <div style={{ padding: "4px 0" }}>
                {onboardingProgress.total === 0 ? (
                  <div style={{ textAlign: "center", padding: "8px 0" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                      Čekám na přidělení plánu zapracování
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                      Tvůj vedoucí ti brzy přidělí plán.
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>
                      Postup k pozici Získatele
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${onboardingProgress.percent}%`, borderRadius: 5, background: onboardingProgress.percent >= 100 ? "#3FC55D" : "#00abbd", transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 22 }}>
                        {onboardingProgress.percent}%
                      </span>
                    </div>
                    {onboardingProgress.nextTask ? (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                        <div style={{ fontWeight: 600 }}>Další krok: {onboardingProgress.nextTask.title}</div>
                        {onboardingProgress.nextTask.deadline && (
                          <div style={{ opacity: 0.7, marginTop: 2 }}>
                            Deadline: {format(new Date(onboardingProgress.nextTask.deadline), "d. MMMM yyyy", { locale: cs })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#3FC55D" }}>
                        ✓ Všechny úkoly splněny!
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              (() => {
                const { monthlyGoals, promotionGoals, promotionTargetRole } = buildGoalItems();
                const monthName = new Date(selectedYear, selectedMonth, 1).toLocaleDateString("cs-CZ", { month: "long" });
                const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                const hasPromoGoals = promotionGoals.length > 0;

                // Pokud existují cíle povýšení → dvě panely (měsíční + povýšení) s horizontálním swipem
                if (hasPromoGoals) {
                  return (
                    <div style={{ position: "relative", width: "100%" }}>
                      {/* Scroll container — snap na celé šířky */}
                      <div
                        ref={goalsSwipeRef}
                        style={{
                          display: "flex",
                          overflowX: "auto",
                          scrollSnapType: "x mandatory",
                          WebkitOverflowScrolling: "touch",
                          scrollbarWidth: "none",
                          msOverflowStyle: "none",
                          gap: 0,
                          width: "100%",
                        }}
                        className="goals-swipe-container"
                        onScroll={(e) => {
                          const el = e.currentTarget;
                          const page = Math.round(el.scrollLeft / el.offsetWidth);
                          setGoalsSwipePage(page);
                        }}
                      >
                        {/* Panel 1 — měsíční cíle */}
                        <div
                          style={{
                            flex: "0 0 100%",
                            scrollSnapAlign: "start",
                            width: "100%",
                          }}
                        >
                          <GoalsSection
                            monthlyGoals={monthlyGoals}
                            promotionGoals={[]}
                            dark
                            compact
                            monthlyTitle={`Cíle pro ${capitalizedMonth} ${selectedYear}`}
                          />
                        </div>
                        {/* Panel 2 — cíle pro povýšení */}
                        <div
                          style={{
                            flex: "0 0 100%",
                            scrollSnapAlign: "start",
                            width: "100%",
                          }}
                        >
                          <GoalsSection
                            monthlyGoals={[]}
                            promotionGoals={promotionGoals}
                            promotionTargetRole={promotionTargetRole}
                            dark
                            compact
                          />
                        </div>
                      </div>
                      {/* Dot indicators */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          gap: 6,
                          marginTop: 10,
                        }}
                      >
                        {[0, 1].map((i) => (
                          <div
                            key={i}
                            style={{
                              width: i === goalsSwipePage ? 18 : 6,
                              height: 6,
                              borderRadius: 3,
                              background: i === goalsSwipePage ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                              transition: "width 0.25s ease, background 0.25s ease",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                }

                // Vedoucí — jen měsíční cíle, bez swipe
                return (
                  <GoalsSection
                    monthlyGoals={monthlyGoals}
                    promotionGoals={[]}
                    dark
                    compact
                    monthlyTitle={`Cíle pro ${capitalizedMonth} ${selectedYear}`}
                    onEditGoals={role === "vedouci" && !isImpersonating ? () => setGoalsModalOpen(true) : undefined}
                  />
                );
              })()
            )}
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        {role === "vedouci" || role === "budouci_vedouci" ? (
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
                  ...(activeRole !== "novacek" ? [{ label: "Nábory", value: mobileNewlyArranged.nab }] : []),
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

            {/* 2-5) Pohovory, Doporučení, Analýzy, Poradenství — combined card */}
            <div className="mobile-stat-card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                {[
                  { label: "Pohovory", actual: mobileStats.poh.actual, planned: mobileStats.poh.planned },
                  { label: "Doporučení", actual: mobileStats.ref.actual },
                  { label: "Analýzy", actual: mobileStats.fsa.actual, planned: mobileStats.fsa.planned },
                  { label: "Poradenství", actual: mobileStats.por.actual, planned: mobileStats.por.planned },
                ].map((item) => (
                  <div key={item.label} style={{ textAlign: "center" }}>
                    <div className="mobile-stat-label" style={{ fontSize: 10, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, justifyContent: "center" }}>
                      <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 28, color: "#00555f", lineHeight: 1 }}>
                        {item.actual}
                      </span>
                      {item.planned != null && (
                        <>
                          <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 500, fontSize: 17, color: "#b8cfd4", lineHeight: 1 }}>/</span>
                          <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 21, color: "#00abbd", lineHeight: 1 }}>{item.planned}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Info & Postinfo team stats — vedouci/BV only, mobile */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <InfoPostMobileCard
                label="Info schůzky"
                count={teamInfoPostCounts.info}
                novi={teamInfoPostCounts.noviInfo}
                staracci={teamInfoPostCounts.staracciInfo}
              />
              <InfoPostMobileCard
                label="Postinfo"
                count={teamInfoPostCounts.postinfo}
                novi={teamInfoPostCounts.noviPost}
                staracci={teamInfoPostCounts.staracciPost}
              />
            </div>
          </>
        ) : (
          <>
            {/* 1) Nově domluvené schůzky — same position as vedoucí */}
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
                  ...(activeRole !== "novacek" ? [{ label: "Nábory", value: mobileNewlyArranged.nab }] : []),
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

            {/* 2-5) Stat cards — combined card */}
            <div className="mobile-stat-card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                {[
                  { label: "Analýzy", actual: mobileStats.fsa.actual, planned: mobileStats.fsa.planned },
                  { label: "Pohovory", actual: mobileStats.poh.actual, planned: mobileStats.poh.planned },
                  ...(activeRole !== "novacek" ? [{ label: "Nábory", actual: mobileStats.nab.actual, planned: mobileStats.nab.planned }] : []),
                  { label: "Poradenství", actual: mobileStats.por.actual, planned: mobileStats.por.planned },
                  { label: "Doporučení", actual: mobileStats.ref.actual },
                ].map((item) => (
                  <div key={item.label} style={{ textAlign: "center" }}>
                    <div className="mobile-stat-label" style={{ fontSize: 10, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, justifyContent: "center" }}>
                      <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 28, color: "#00555f", lineHeight: 1 }}>
                        {item.actual}
                      </span>
                      {item.planned != null && (
                        <>
                          <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 500, fontSize: 17, color: "#b8cfd4", lineHeight: 1 }}>/</span>
                          <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 21, color: "#00abbd", lineHeight: 1 }}>{item.planned}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Salmon FAB for new meeting ── */}
        <button
          onClick={() => setFabMeetingOpen(true)}
          style={{
            position: "fixed",
            bottom: 178,
            right: 20,
            zIndex: 41,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "#fc7c71",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(252,124,113,0.4)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          aria-label="Nová schůzka"
        >
          <Plus size={24} color="#fff" />
        </button>

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
            role={activeProfile?.role}
          />
        )}

        {/* Meeting form modal from FAB */}
        <MeetingFormModal
          open={fabMeetingOpen}
          onClose={() => setFabMeetingOpen(false)}
          initial={defaultMeetingForm()}
          onSave={(form) => fabSaveMeeting.mutate({ form })}
          saving={fabSaveMeeting.isPending}
          cases={fabCases}
          isEdit={false}
          userRole={profile?.role}
          allowCreateCase
          createCaseFn={async (name, note) => {
            const { data, error } = await supabase.from("cases").insert({
              user_id: profile!.id, nazev_pripadu: name, poznamka: note || null,
            }).select().single();
            if (error) throw error;
            await queryClient.invalidateQueries({ queryKey: ["cases", profile?.id] });
            toast.success("Případ vytvořen");
            return data as unknown as Case;
          }}
        />

        <FollowUpModal
          open={!!fabFollowUp}
          onClose={() => setFabFollowUp(null)}
          caseName={fabFollowUp?.caseName || ""}
          caseId={fabFollowUp?.caseId || ""}
          meetingType={fabFollowUp?.meetingType || "FSA"}
          parentMeetingId={fabFollowUp?.parentMeetingId ?? null}
          onSchedule={async (data) => {
            const form: MeetingForm = {
              ...defaultMeetingForm(data.date),
              meeting_type: data.meeting_type as any,
              case_id: data.case_id,
              location_type: data.location_type,
              location_detail: data.location_detail,
              parent_meeting_id: data.parent_meeting_id ?? null,
            };
            await new Promise<void>((resolve, reject) => {
              fabSaveMeeting.mutate(
                { form, skipFollowUp: true },
                { onSuccess: () => resolve(), onError: (err) => reject(err) },
              );
            });
          }}
        />
      </div>
    );
  }

  // ── DESKTOP render ──────────────────────────────────────────────────────────
  const role = activeRole;

  const renderStavByznysu = () => {

    if (role === "novacek") {
      if (onboardingProgress.total === 0) {
        return (
          <div style={{ width: "100%", textAlign: "center", padding: "20px 0" }}>
            <Clock size={36} style={{ margin: "0 auto 12px", opacity: 0.3, color: "#00abbd" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
              Čekám na přidělení plánu zapracování
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Tvůj vedoucí ti brzy přidělí plán.
            </div>
          </div>
        );
      }
      return (
        <div style={{ width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12 }}>
            Postup k pozici Získatele
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: isDark ? "rgba(255,255,255,0.1)" : "#E1E9EB", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${onboardingProgress.percent}%`, borderRadius: 5, background: onboardingProgress.percent >= 100 ? "#3FC55D" : "#00abbd", transition: "width 0.5s ease" }} />
            </div>
            <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 22, color: "var(--text-primary)" }}>
              {onboardingProgress.percent}%
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {onboardingProgress.done} z {onboardingProgress.total} úkolů splněno
          </div>
          {onboardingProgress.nextTask && (
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: isDark ? "rgba(0,171,189,0.08)" : "rgba(0,171,189,0.06)", border: isDark ? "1px solid rgba(0,171,189,0.2)" : "1px solid rgba(0,171,189,0.15)", textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#00abbd", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Další krok</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{onboardingProgress.nextTask.title}</div>
              {onboardingProgress.nextTask.deadline && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Deadline: {format(new Date(onboardingProgress.nextTask.deadline), "d. MMMM yyyy", { locale: cs })}
                </div>
              )}
            </div>
          )}
          {onboardingProgress.percent >= 100 && (
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: "#3FC55D" }}>
              ✓ Všechny úkoly splněny — čeká na potvrzení povýšení!
            </div>
          )}
        </div>
      );
    }

    // Vedoucí, BV, Získatel, Garant — sjednocený layout
    const { monthlyGoals, promotionGoals, promotionTargetRole } = buildGoalItems();
    const monthName = new Date(selectedYear, selectedMonth, 1).toLocaleDateString("cs-CZ", { month: "long" });
    const capitalizedMonthDesktop = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    // Vedoucí nemá cíl povýšení → použij původní stacked layout
    // Ostatní role → promotion gauges nahoře (compact, side by side), monthly dole
    const hasPromotion = promotionGoals.length > 0;
    return (
      <GoalsSection
        monthlyGoals={monthlyGoals}
        promotionGoals={promotionGoals}
        promotionTargetRole={promotionTargetRole}
        monthlyTitle={`Cíle pro ${capitalizedMonthDesktop} ${selectedYear}`}
        promotionFirst={hasPromotion}
        stacked={!hasPromotion}
      />
    );
  };

  const handleExport = async (period: ExportPeriod) => {
    if (!activeUserId || !activeProfile) return;
    setExportingPdf(period);
    setShowExportMenu(false);
    try {
      await exportDashboardPdf(
        activeUserId,
        activeProfile.role,
        activeProfile.full_name,
        period,
        selectedYear,
        selectedMonth,
        profile?.role,
      );
    } catch (e) {
      console.error("PDF export failed", e);
    } finally {
      setExportingPdf(null);
    }
  };

  // (header navigator helpers + portal slot are computed earlier, before any early returns)

  return (
    <div className="space-y-8">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 16,
          minHeight: 56,
        }}
      >
        {/* Left: title + view mode dropdown */}
        <div className="flex items-center gap-4 flex-wrap" style={{ justifySelf: "start" }}>
          <LayoutDashboard className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
          <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
            DASHBOARD
          </h1>

          {/* View mode dropdown: Měsíc / Týden — styled to match PeriodNavigator */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setViewModeMenuOpen((o) => !o)}
              className="flex items-center gap-2"
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e1e9eb",
                borderRadius: 16,
                background: isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
                fontFamily: "Poppins, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--text-primary)",
                boxShadow: "none",
              }}
            >
              <span>{viewMode === "month" ? "Měsíc" : "Týden"}</span>
              <ChevronDown
                size={15}
                style={{
                  color: isDark ? "#4dd8e8" : "#00555f",
                  transition: "transform 0.2s",
                  transform: viewModeMenuOpen ? "rotate(180deg)" : "rotate(0)",
                }}
              />
            </button>
            {viewModeMenuOpen && (
              <>
                <div
                  onClick={() => setViewModeMenuOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 49 }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    zIndex: 50,
                    background: isDark ? "#0a1f23" : "#ffffff",
                    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e1e9eb",
                    borderRadius: 14,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    minWidth: 160,
                    overflow: "hidden",
                  }}
                >
                  {(["month", "week"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setViewMode(m); setViewModeMenuOpen(false); }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 16px",
                        border: "none",
                        cursor: "pointer",
                        background: viewMode === m ? "rgba(0,171,189,0.12)" : "transparent",
                        color: viewMode === m ? "#00abbd" : "var(--text-primary)",
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: viewMode === m ? 700 : 500,
                        fontSize: 14,
                      }}
                    >
                      {m === "month" ? "Měsíc" : "Týden"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: period navigator — horizontally centered */}
        <div style={{ justifySelf: "center" }}>
          <PeriodNavigator
            label={headerNav.label}
            title={headerNav.title}
            onPrev={headerNav.onPrev}
            onNext={headerNav.onNext}
            onSelectDate={headerNav.onSelectDate}
            selectedDate={headerNav.selectedDate}
            calendarMonth={headerNav.calendarMonth}
            pickerMode={headerNav.pickerMode}
            widthScale={1.35}
          />
        </div>

        {/* Right: spacer reserved for the portaled Export PDF + bell (rendered by AppLayout) */}
        <div style={{ justifySelf: "end" }} />
      </div>

      {/* Header actions — portaled into the AppLayout header slot, left of the bell */}
      {headerSlot && createPortal(
        <>
          <button
            onClick={() => setFabMeetingOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors"
            style={{
              background: "#fc7c71",
              borderColor: "#fc7c71",
              color: "#fff",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#fb6a5e")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fc7c71")}
          >
            <Plus className="h-4 w-4" />
            Schůzka
          </button>
          <button
            onClick={() => handleExport(viewMode)}
            disabled={!!exportingPdf}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input bg-card text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Export PDF
          </button>
        </>,
        headerSlot,
      )}

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
            {/* Cíle (gauges) — 1/4 */}
            <div style={{ width: "25%", flexShrink: 0, display: "flex", flexDirection: "column" }}>
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <h2
                    className="font-heading font-semibold"
                    style={{ fontSize: 22, color: "var(--text-primary)" }}
                  >
                    Cíle
                  </h2>
                  {role === "vedouci" && !isImpersonating && (
                    <button
                      onClick={() => setGoalsModalOpen(true)}
                      aria-label="Upravit cíle"
                      style={{
                        background: "transparent",
                        border: "none",
                        borderRadius: 8,
                        padding: 6,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        color: "#00abbd",
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
                {renderStavByznysu()}
              </div>
            </div>
            {/* Org chart — 3/4 */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
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
                    periodStart={periodStartStr}
                    periodEnd={periodEndStr}
                    onPersonClick={(userId, p) => {
                      handlePersonSwitch(userId, p.full_name);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Vedouci/BV only: Info & Postinfo team stats for current production period */}
        {(activeRole === "vedouci" || activeRole === "budouci_vedouci") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 mt-4" style={{ gap: 8 }}>
            <InfoPostDesktopCard
              label="Info"
              count={teamInfoPostCounts.info}
              novi={teamInfoPostCounts.noviInfo}
              staracci={teamInfoPostCounts.staracciInfo}
            />
            <InfoPostDesktopCard
              label="Postinfo"
              count={teamInfoPostCounts.postinfo}
              novi={teamInfoPostCounts.noviPost}
              staracci={teamInfoPostCounts.staracciPost}
            />
          </div>
        )}

        {/* ─── Konverze aktivit ───────────────────────────────────────────── */}
        {!isMobile && (
          <section className="space-y-6 mt-8">
            <ConversionFunnel meetings={conversionMeetings as any} />
          </section>
        )}


        {profile?.id && (
          <VedouciGoalsModal
            open={goalsModalOpen}
            onClose={() => setGoalsModalOpen(false)}
            userId={profile.id}
            periodKey={periodKey}
            onSaved={() => refetchGoals()}
            role={activeProfile?.role}
          />
        )}

        {/* Desktop „Schůzka" modal — otevírá se z headeru */}
        <MeetingFormModal
          open={fabMeetingOpen}
          onClose={() => setFabMeetingOpen(false)}
          initial={defaultMeetingForm()}
          onSave={(form) => fabSaveMeeting.mutate({ form })}
          saving={fabSaveMeeting.isPending}
          cases={fabCases}
          isEdit={false}
          userRole={profile?.role}
          allowCreateCase
          createCaseFn={async (name, note) => {
            const { data, error } = await supabase.from("cases").insert({
              user_id: profile!.id, nazev_pripadu: name, poznamka: note || null,
            }).select().single();
            if (error) throw error;
            await queryClient.invalidateQueries({ queryKey: ["cases", profile?.id] });
            toast.success("Případ vytvořen");
            return data as unknown as Case;
          }}
        />

        <FollowUpModal
          open={!!fabFollowUp}
          onClose={() => setFabFollowUp(null)}
          caseName={fabFollowUp?.caseName || ""}
          caseId={fabFollowUp?.caseId || ""}
          meetingType={fabFollowUp?.meetingType || "FSA"}
          parentMeetingId={fabFollowUp?.parentMeetingId ?? null}
          onSchedule={async (data) => {
            const form: MeetingForm = {
              ...defaultMeetingForm(data.date),
              meeting_type: data.meeting_type as any,
              case_id: data.case_id,
              location_type: data.location_type,
              location_detail: data.location_detail,
              parent_meeting_id: data.parent_meeting_id ?? null,
            };
            await new Promise<void>((resolve, reject) => {
              fabSaveMeeting.mutate(
                { form, skipFollowUp: true },
                { onSuccess: () => resolve(), onError: (err) => reject(err) },
              );
            });
          }}
        />
      </div>
    </div>
  );
};

export default Dashboard;
