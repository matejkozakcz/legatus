import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, formatISO, format } from "date-fns";
import { cs } from "date-fns/locale";
import {
  X,
  Loader2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Pencil,
  Calendar,
  GraduationCap,
  Plus,
  Trash2,
  Check,
  Lock,
} from "lucide-react";
import { getProductionPeriodMonth, getProductionPeriodForMonth } from "@/lib/productionPeriod";
import { computeMeetingStats } from "@/lib/meetingStats";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { IndividualyTab, IndividualFormInline, useIndividualSave, useIndividualDelete, type IndividualMeeting } from "@/components/IndividualyTab";

interface ProfileNode {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

interface MemberDetailModalProps {
  member: ProfileNode;
  onClose: () => void;
  onEdit?: () => void;
  onNotify?: () => void;
}

const roleBadgeConfig: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

const avatarColors: Record<string, { bg: string; color: string }> = {
  vedouci: { bg: "#e6f0f1", color: "#00555f" },
  garant: { bg: "#e6f7f9", color: "#008fa0" },
  ziskatel: { bg: "#eeebf7", color: "#7c6fcd" },
  novacek: { bg: "#fff2f1", color: "#e05a50" },
};

function getWeekStart() {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return formatISO(monday, { representation: "date" });
}

export function MemberDetailModal({ member, onClose, onEdit, onNotify }: MemberDetailModalProps) {
  useBodyScrollLock(true);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { profile: viewerProfile, isAdmin, godMode, user } = useAuth();
  const queryClient = useQueryClient();
  const viewerRole = viewerProfile?.role;
  const isGodMode = isAdmin && godMode;
  const canEditOnboarding = viewerRole === "vedouci" || viewerRole === "budouci_vedouci";
  const isNovacek = member.role === "novacek";

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [activeTab, setActiveTab] = useState<"stats" | "rozvoj">("stats");

  // Individuály state
  const [viewingMeeting, setViewingMeeting] = useState<IndividualMeeting | null>(null);
  const [editingRecord, setEditingRecord] = useState<IndividualMeeting | "new" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const currentUserId = user?.id;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingMeeting) {
          setViewingMeeting(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, viewingMeeting]);

  const weekStart = getWeekStart();

  const { data: weekMeetings = [], isLoading } = useQuery({
    queryKey: ["member_week_meetings", member.id, weekStart],
    queryFn: async () => {
      const weekEnd = format(new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("client_meetings")
        .select(
          "meeting_type, cancelled, date, outcome_recorded, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor",
        )
        .eq("user_id", member.id)
        .gte("date", weekStart)
        .lte("date", weekEnd);
      if (error) throw error;
      return data || [];
    },
  });

  const currentPeriod = getProductionPeriodMonth(new Date());
  const periodRange = getProductionPeriodForMonth(currentPeriod.year, currentPeriod.month);
  const periodStartStr = format(periodRange.start, "yyyy-MM-dd");
  const periodEndStr = format(periodRange.end, "yyyy-MM-dd");

  const { data: personalBj = 0 } = useQuery({
    queryKey: ["member_personal_bj", member.id, periodStartStr, periodEndStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("podepsane_bj")
        .eq("user_id", member.id)
        .eq("cancelled", false)
        .gte("date", periodStartStr)
        .lte("date", periodEndStr);
      if (error) throw error;
      return (data || []).reduce((acc: number, r: any) => acc + (Number(r.podepsane_bj) || 0), 0);
    },
  });

  const isLeader = member.role === "vedouci" || member.role === "budouci_vedouci";
  const { data: teamBj = 0 } = useQuery({
    queryKey: ["member_team_bj", member.id, periodStartStr, periodEndStr],
    queryFn: async () => {
      const { data: subs } = await supabase
        .from("profiles")
        .select("id")
        .eq("vedouci_id", member.id)
        .eq("is_active", true);
      const ids = [member.id, ...(subs || []).map((s: any) => s.id)];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("podepsane_bj")
        .in("user_id", ids)
        .eq("cancelled", false)
        .gte("date", periodStartStr)
        .lte("date", periodEndStr);
      if (error) throw error;
      return (data || []).reduce((acc: number, r: any) => acc + (Number(r.podepsane_bj) || 0), 0);
    },
    enabled: isLeader,
  });

  const { data: upcomingMeetings = [], isLoading: isMeetingsLoading } = useQuery({
    queryKey: ["member_upcoming_meetings", member.id],
    queryFn: async () => {
      const today = formatISO(new Date(), { representation: "date" });
      const { data, error } = await supabase
        .from("client_meetings")
        .select("id, date, meeting_time, meeting_type, case_name, cancelled")
        .eq("user_id", member.id)
        .eq("cancelled", false)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        date: string;
        meeting_time: string | null;
        meeting_type: string;
        case_name: string | null;
        cancelled: boolean;
      }>;
    },
    enabled: isGodMode,
  });

  const { data: promotionHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["promotion_history", member.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotion_history")
        .select("id, requested_role, event, cumulative_bj, direct_ziskatels, note, created_at")
        .eq("user_id", member.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        requested_role: string;
        event: string;
        cumulative_bj: number | null;
        direct_ziskatels: number | null;
        note: string | null;
        created_at: string;
      }>;
    },
  });

  const { data: onboardingTasks = [] } = useQuery({
    queryKey: ["onboarding_tasks_member", member.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_tasks")
        .select("*")
        .eq("novacek_id", member.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: isNovacek,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["onboarding_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isNovacek && canEditOnboarding,
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ title, deadline }: { title: string; deadline: string }) => {
      const maxOrder = onboardingTasks.length > 0 ? Math.max(...onboardingTasks.map((t: any) => t.sort_order)) + 1 : 0;
      const { error } = await supabase.from("onboarding_tasks").insert({
        novacek_id: member.id,
        title,
        deadline: deadline || null,
        sort_order: maxOrder,
        created_by: viewerProfile?.id || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks_member", member.id] });
      setNewTaskTitle("");
      setNewTaskDeadline("");
      toast.success("Úkol přidán");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("onboarding_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks_member", member.id] });
      toast.success("Úkol smazán");
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const { error } = await supabase
        .from("onboarding_tasks")
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks_member", member.id] });
    },
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = templates.find((t: any) => t.id === templateId);
      if (!template) return;
      const items = (template as any).items as Array<{ title: string; default_deadline_days: number }>;
      const baseOrder = onboardingTasks.length > 0 ? Math.max(...onboardingTasks.map((t: any) => t.sort_order)) + 1 : 0;
      const today = new Date();
      const rows = items.map((item, idx) => ({
        novacek_id: member.id,
        title: item.title,
        deadline: item.default_deadline_days
          ? format(new Date(today.getTime() + item.default_deadline_days * 86400000), "yyyy-MM-dd")
          : null,
        sort_order: baseOrder + idx,
        created_by: viewerProfile?.id || "",
      }));
      const { error } = await supabase.from("onboarding_tasks").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks_member", member.id] });
      toast.success("Šablona aplikována");
    },
  });

  const initials = member.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = avatarColors[member.role] || avatarColors.novacek;
  const badge = roleBadgeConfig[member.role] || roleBadgeConfig.novacek;

  const meetingStats = computeMeetingStats(weekMeetings as any);

  const stats = [
    { label: "Analýzy", actual: meetingStats.fsa.actual, planned: meetingStats.fsa.planned },
    { label: "Pohovory", actual: meetingStats.poh.actual, planned: meetingStats.poh.planned },
    { label: "Nábory", actual: meetingStats.nab.actual, planned: meetingStats.nab.planned },
    { label: "Poradenství", actual: meetingStats.por.actual, planned: meetingStats.por.planned },
    { label: "Doporučení", actual: meetingStats.ref.actual, planned: meetingStats.ref.planned },
  ];

  const meetingTypeLabels: Record<string, string> = {
    FSA: "Analýza",
    SER: "Servis",
    POH: "Pohovor",
    POR: "Poradenství",
    NAB: "Nábor",
    INFO: "Info",
    POST: "Postinfo",
  };

  const viewingBadge = viewingMeeting ? roleBadgeConfig[viewingMeeting.author?.role || ""] || null : null;
  const canEditViewing = !!viewingMeeting && viewingMeeting.author_id === currentUserId;

  const showRightColumn = activeTab === "rozvoj";
  const rightContent: "form" | "confirm" | "detail" | "empty" = editingRecord
    ? "form"
    : confirmDeleteId
      ? "confirm"
      : viewingMeeting
        ? "detail"
        : "empty";

  const saveMutation = useIndividualSave(member.id, () => setEditingRecord(null));
  const deleteMutation = useIndividualDelete(member.id, () => {
    setConfirmDeleteId(null);
    setViewingMeeting(null);
  });

  const LEFT_W = 600;
  const RIGHT_W = 460;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      {/* Modal — dvousloupcový na záložce Rozvoj */}
      <div
        className="relative w-full mx-4 rounded-2xl shadow-2xl overflow-hidden flex"
        style={{
          maxWidth: showRightColumn ? LEFT_W + RIGHT_W : LEFT_W,
          height: "min(760px, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px))",
          animation: "modalIn 150ms ease-out forwards",
          background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
          border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none",
          boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.6)" : "0 8px 40px rgba(0,0,0,0.18)",
          transition: "max-width 200ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Levý sloupec — původní obsah */}
        <div
          className="flex flex-col overflow-y-auto"
          style={{
            width: LEFT_W,
            flexShrink: 0,
            padding: "1.5rem",
            paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
            borderRight: showRightColumn ? (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #E1E9EB") : "none",
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={18} style={{ color: "#89ADB4" }} />
          </button>

          {/* Header */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              {member.avatar_url ? (
                <img
                  src={member.avatar_url}
                  alt={member.full_name}
                  loading="lazy"
                  className="rounded-full object-cover"
                  style={{
                    width: 64,
                    height: 64,
                    border: isDark ? "2px solid rgba(255,255,255,0.15)" : "2px solid #fff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }}
                />
              ) : (
                <div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 64,
                    height: 64,
                    background: colors.bg,
                    color: colors.color,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }}
                >
                  <span className="font-heading font-semibold text-xl">{initials}</span>
                </div>
              )}
            </div>

            <h3 className="font-heading text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {member.full_name}
            </h3>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className={badge.className}>{badge.label}</span>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,85,95,0.10)", color: "#00555f" }}
                title="Osobní BJ — aktuální produkční období"
              >
                Osobní {personalBj} BJ
              </span>
              {isLeader && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(0,171,189,0.12)", color: "#00abbd" }}
                  title="Týmové BJ — aktuální produkční období"
                >
                  Tým {teamBj} BJ
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1 mt-4 border-b"
            style={{ borderColor: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }}
          >
            {(
              [
                { key: "stats", label: "Statistiky" },
                { key: "rozvoj", label: "Rozvoj" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="px-3 py-2 text-sm font-semibold transition-colors"
                style={{
                  color: activeTab === t.key ? "#00abbd" : "var(--text-muted)",
                  borderBottom: activeTab === t.key ? "2px solid #00abbd" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "stats" && (
            <>
              <div className="mt-4">
                <p className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  Statistiky tohoto týdne
                </p>

                {isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="animate-spin" size={24} style={{ color: "#00abbd" }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {stats.map((s) => (
                      <div key={s.label} className="stat-card flex flex-col gap-1" style={{ padding: "12px 16px" }}>
                        <p
                          className="font-body text-[11px] font-semibold uppercase tracking-[0.08em]"
                          style={{ color: "#fc7c71" }}
                        >
                          {s.label}
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span
                            className="font-heading text-2xl font-bold leading-none"
                            style={{ color: isDark ? "#4dd8e8" : "#00555f" }}
                          >
                            {s.actual}
                          </span>
                          <span className="font-body text-sm font-semibold" style={{ color: "#00abbd" }}>
                            z {s.planned}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isGodMode && (
                <>
                  <div
                    className="my-4"
                    style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }}
                  />
                  <div>
                    <p className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                      Nadcházející schůzky
                    </p>
                    {isMeetingsLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin" size={20} style={{ color: "#00abbd" }} />
                      </div>
                    ) : upcomingMeetings.length === 0 ? (
                      <p className="text-xs font-body" style={{ color: "var(--text-muted)" }}>
                        Žádné naplánované schůzky
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {upcomingMeetings.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 rounded-lg"
                            style={{
                              padding: "8px 12px",
                              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,85,95,0.04)",
                              border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #e1e9eb",
                            }}
                          >
                            <Calendar size={14} style={{ color: "#00abbd", flexShrink: 0 }} />
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-xs font-body font-medium truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {meetingTypeLabels[m.meeting_type] || m.meeting_type}
                                {m.case_name && ` — ${m.case_name}`}
                              </p>
                              <p className="text-[11px] font-body" style={{ color: "var(--text-muted)" }}>
                                {format(new Date(m.date), "EEEE d. MMMM", { locale: cs })}
                                {m.meeting_time && `, ${m.meeting_time.slice(0, 5)}`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {isGodMode && promotionHistory.length > 0 && (
                <>
                  <div
                    className="my-4"
                    style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }}
                  />
                  <div>
                    <p className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                      Historie povýšení
                    </p>
                    {isHistoryLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin" size={20} style={{ color: "#00abbd" }} />
                      </div>
                    ) : (
                      <div className="space-y-0 relative">
                        <div
                          className="absolute left-[11px] top-2 bottom-2"
                          style={{ width: 2, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }}
                        />
                        {promotionHistory.map((entry) => {
                          const eventConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
                            eligible: { icon: <TrendingUp size={12} />, color: "#00abbd", label: "Splňuje podmínky" },
                            not_eligible: {
                              icon: <TrendingDown size={12} />,
                              color: "#f59e0b",
                              label: "Podmínky nesplněny",
                            },
                            approved: { icon: <CheckCircle2 size={12} />, color: "#3FC55D", label: "Schváleno" },
                            rejected: { icon: <XCircle size={12} />, color: "#ef4444", label: "Zamítnuto" },
                          };
                          const cfg = eventConfig[entry.event] || eventConfig.eligible;
                          const roleLabels: Record<string, string> = {
                            garant: "Garant",
                            budouci_vedouci: "Budoucí vedoucí",
                            vedouci: "Vedoucí",
                          };

                          return (
                            <div key={entry.id} className="flex items-start gap-3 py-2 relative">
                              <div
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center z-10"
                                style={{ background: isDark ? "hsl(188,18%,18%)" : "#ffffff" }}
                              >
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                                  style={{ background: cfg.color }}
                                >
                                  {cfg.icon}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold" style={{ color: cfg.color }}>
                                    {cfg.label}
                                  </span>
                                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                                    → {roleLabels[entry.requested_role] || entry.requested_role}
                                  </span>
                                </div>
                                {entry.note && (
                                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                    {entry.note}
                                  </p>
                                )}
                                {(entry.cumulative_bj != null || entry.direct_ziskatels != null) && (
                                  <p
                                    className="text-[10px] mt-0.5"
                                    style={{ color: isDark ? "rgba(255,255,255,0.35)" : "#9ca3af" }}
                                  >
                                    {entry.cumulative_bj != null && `BJ: ${entry.cumulative_bj}`}
                                    {entry.cumulative_bj != null && entry.direct_ziskatels != null && " · "}
                                    {entry.direct_ziskatels != null && `Struktura: ${entry.direct_ziskatels}`}
                                  </p>
                                )}
                                <p
                                  className="text-[10px] mt-0.5"
                                  style={{ color: isDark ? "rgba(255,255,255,0.3)" : "#b0b8bc" }}
                                >
                                  {format(new Date(entry.created_at), "d. MMMM yyyy, HH:mm", { locale: cs })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {isNovacek && (
                <>
                  <div
                    className="my-4"
                    style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }}
                  />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p
                        className="font-heading text-sm font-semibold flex items-center gap-2"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <GraduationCap size={16} style={{ color: "#00abbd" }} />
                        Zapracování
                      </p>
                      {canEditOnboarding && templates.length > 0 && (
                        <select
                          onChange={(e) => {
                            if (e.target.value) applyTemplateMutation.mutate(e.target.value);
                            e.target.value = "";
                          }}
                          className="text-xs rounded-lg border border-input bg-background px-2 py-1"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <option value="">Použít šablonu…</option>
                          {templates.map((t: any) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {onboardingTasks.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 6,
                              borderRadius: 3,
                              background: isDark ? "rgba(255,255,255,0.1)" : "#E1E9EB",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${onboardingTasks.length > 0 ? Math.round((onboardingTasks.filter((t: any) => t.completed).length / onboardingTasks.length) * 100) : 0}%`,
                                borderRadius: 3,
                                background: "#00abbd",
                                transition: "width 0.3s",
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold" style={{ color: "#00abbd" }}>
                            {onboardingTasks.filter((t: any) => t.completed).length}/{onboardingTasks.length}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {onboardingTasks.map((task: any) => {
                        const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();
                        return (
                          <div
                            key={task.id}
                            className="flex items-start gap-2 rounded-lg"
                            style={{
                              padding: "8px 10px",
                              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,85,95,0.03)",
                              border: isOverdue
                                ? "1px solid rgba(252,124,113,0.3)"
                                : isDark
                                  ? "1px solid rgba(255,255,255,0.06)"
                                  : "1px solid #e1e9eb",
                            }}
                          >
                            {canEditOnboarding ? (
                              <button
                                onClick={() =>
                                  toggleTaskMutation.mutate({ taskId: task.id, completed: !task.completed })
                                }
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 6,
                                  flexShrink: 0,
                                  marginTop: 1,
                                  border: task.completed ? "none" : "2px solid #b8cfd4",
                                  background: task.completed ? "#3FC55D" : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                }}
                              >
                                {task.completed && <Check size={12} color="white" />}
                              </button>
                            ) : (
                              <div
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 6,
                                  flexShrink: 0,
                                  marginTop: 1,
                                  border: task.completed ? "none" : "2px solid #b8cfd4",
                                  background: task.completed ? "#3FC55D" : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {task.completed && <Check size={12} color="white" />}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-xs font-medium"
                                style={{
                                  color: "var(--text-primary)",
                                  textDecoration: task.completed ? "line-through" : "none",
                                  opacity: task.completed ? 0.6 : 1,
                                }}
                              >
                                {task.title}
                              </p>
                              {task.deadline && (
                                <p
                                  className="text-[10px]"
                                  style={{ color: isOverdue ? "#fc7c71" : "var(--text-muted)", marginTop: 1 }}
                                >
                                  {format(new Date(task.deadline), "d.M.yyyy")}
                                </p>
                              )}
                              {task.description && (
                                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                  {task.description}
                                </p>
                              )}
                            </div>
                            {canEditOnboarding && (
                              <button
                                onClick={() => deleteTaskMutation.mutate(task.id)}
                                style={{
                                  flexShrink: 0,
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 2,
                                }}
                              >
                                <Trash2 size={14} style={{ color: "#fc7c71", opacity: 0.6 }} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {canEditOnboarding && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Nový úkol…"
                          className="flex-1 text-xs rounded-lg border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
                        />
                        <input
                          type="date"
                          value={newTaskDeadline}
                          onChange={(e) => setNewTaskDeadline(e.target.value)}
                          className="text-xs rounded-lg border border-input bg-background px-2 py-1.5 w-28"
                        />
                        <button
                          onClick={() => {
                            if (newTaskTitle.trim())
                              addTaskMutation.mutate({ title: newTaskTitle.trim(), deadline: newTaskDeadline });
                          }}
                          disabled={!newTaskTitle.trim() || addTaskMutation.isPending}
                          className="flex items-center justify-center rounded-lg"
                          style={{
                            width: 30,
                            height: 30,
                            background: "#00abbd",
                            border: "none",
                            cursor: "pointer",
                            opacity: newTaskTitle.trim() ? 1 : 0.4,
                          }}
                        >
                          <Plus size={14} color="white" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "rozvoj" && (
            <div className="mt-4">
              <IndividualyTab
                memberId={member.id}
                onViewMeeting={setViewingMeeting}
                viewingId={viewingMeeting?.id || null}
                editingRecord={editingRecord}
                onSetEditing={setEditingRecord}
                confirmDeleteId={confirmDeleteId}
                onSetConfirmDelete={setConfirmDeleteId}
              />
            </div>
          )}

          {/* Divider */}
          <div className="my-4" style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }} />

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              className="btn btn-md btn-secondary w-full flex items-center justify-center gap-2"
              onClick={() => {
                onClose();
                navigate(`/tym/${member.id}/aktivity`);
              }}
            >
              Zobrazit plnou aktivitu
              <ArrowRight size={16} />
            </button>
            {onEdit && (
              <button
                className="btn btn-md btn-ghost w-full flex items-center justify-center gap-2"
                onClick={() => {
                  onClose();
                  onEdit();
                }}
              >
                <Pencil size={16} />
                Upravit profil
              </button>
            )}
          </div>
        </div>

        {/* Pravý sloupec — vždy přítomný na záložce Rozvoj */}
        {showRightColumn && (
          <div
            className="flex flex-col gap-4 overflow-y-auto"
            style={{
              width: RIGHT_W,
              flexShrink: 0,
              padding: "1.5rem",
              background: isDark ? "hsl(188,18%,16%)" : "#f8fbfb",
            }}
          >
            {rightContent === "empty" && (
              <div className="flex flex-1 items-center justify-center text-center px-4">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Vyber zápisek vlevo nebo vytvoř nový individuál.
                </p>
              </div>
            )}

            {rightContent === "form" && editingRecord && (
              <IndividualFormInline
                initial={editingRecord === "new" ? null : editingRecord}
                onCancel={() => setEditingRecord(null)}
                saving={saveMutation.isPending}
                onSave={(data) =>
                  saveMutation.mutate({
                    id: editingRecord === "new" ? undefined : editingRecord.id,
                    meeting_date: data.meeting_date,
                    notes: data.notes,
                    next_steps: data.next_steps,
                  })
                }
              />
            )}

            {rightContent === "confirm" && (
              <div className="flex flex-col gap-3 h-full">
                <h3 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Smazat zápis?
                </h3>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Opravdu chceš smazat tento zápis? Tato akce je nevratná.
                </p>
                <div className="flex gap-2 mt-auto pt-2">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    Zrušit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(confirmDeleteId!)}
                    disabled={deleteMutation.isPending}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "#fc7c71" }}
                  >
                    {deleteMutation.isPending ? "Mažu…" : "Smazat"}
                  </button>
                </div>
              </div>
            )}

            {rightContent === "detail" && viewingMeeting && (
              <>
                <div>
                  <p className="font-heading text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    {format(new Date(viewingMeeting.meeting_date), "d. M. yyyy", { locale: cs })}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {viewingMeeting.author?.full_name || "—"}
                    </span>
                    {viewingBadge && <span className={viewingBadge.className}>{viewingBadge.label}</span>}
                    {!canEditViewing && (
                      <span
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: "var(--muted)", color: "var(--text-muted)" }}
                      >
                        <Lock size={9} /> Pouze pro čtení
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }} />

                <div>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Záznam
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
                    {viewingMeeting.notes}
                  </p>
                </div>

                <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }} />

                <div>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Next steps
                  </p>
                  {viewingMeeting.next_steps ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      {viewingMeeting.next_steps}
                    </p>
                  ) : (
                    <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
                      Žádné next steps
                    </p>
                  )}
                </div>

                {canEditViewing && (
                  <div className="flex gap-2 mt-auto pt-2">
                    <button
                      onClick={() => setEditingRecord(viewingMeeting)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted"
                    >
                      <Pencil size={14} /> Upravit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(viewingMeeting.id)}
                      className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
                      style={{ background: "rgba(252,124,113,0.1)", color: "#fc7c71" }}
                    >
                      <Trash2 size={14} /> Smazat
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
