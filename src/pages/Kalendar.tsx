import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, isSameDay, isSameMonth, getDay, startOfDay, getDaysInMonth } from "date-fns";
import { cs } from "date-fns/locale";
import { GraduationCap } from "lucide-react";
import {
  Plus, X, Loader2, Pencil, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";

import { MeetingFormModal, type MeetingForm, type MeetingType, type Case, meetingTypeLabel, defaultMeetingForm } from "@/components/MeetingFormFields";
import { FollowUpModal } from "@/components/FollowUpModal";
import { MeetingDetailModal } from "@/components/MeetingDetailModal";

interface Meeting {
  id: string;
  user_id: string;
  date: string;
  week_start: string;
  meeting_type: MeetingType;
  bj: number;
  doporuceni_fsa: number;
  vizi_spoluprace: boolean;
  poznamka: string | null;
  created_at: string;
  updated_at: string;
  cancelled: boolean;
  potencial_bj: number | null;
  has_poradenstvi: boolean;
  podepsane_bj: number;
  doporuceni_poradenstvi: number;
  poradenstvi_status: string | null;
  has_pohovor: boolean;
  pohovor_jde_dal: boolean | null;
  doporuceni_pohovor: number;
  case_name: string | null;
  poradenstvi_date: string | null;
  pohovor_date: string | null;
  case_id: string | null;
  meeting_time: string | null;
  duration_minutes: number | null;
  location_type: string | null;
  location_detail: string | null;
  outcome_recorded: boolean;
}

// ─── Color mapping by status + type ─────────────────────────────────────────

const TYPE_BORDER: Record<string, string> = {
  FSA: "#00abbd",
  POR: "#8b5cf6",
  SER: "#f97316",
  POH: "#3b82f6",
};

type MeetingStatus = "naplanovana" | "probehla" | "zrusena";

function getMeetingStatus(m: { cancelled: boolean; date: string }): MeetingStatus {
  if (m.cancelled) return "zrusena";
  const todayStr = format(new Date(), "yyyy-MM-dd");
  return m.date < todayStr ? "probehla" : "naplanovana";
}

/** Meeting is past, not cancelled, and has no outcome recorded */
function needsFollowUp(m: Meeting): boolean {
  if (m.cancelled) return false;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  if (m.date >= todayStr) return false;
  return !m.outcome_recorded;
}

function getStatusBg(status: MeetingStatus, dark: boolean): string {
  if (status === "naplanovana") return dark ? "rgba(245,200,66,0.25)" : "rgba(245,200,66,0.18)";
  if (status === "probehla") return dark ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.18)";
  return dark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.12)";
}

function getTypeBorder(type: string): string {
  return TYPE_BORDER[type] || TYPE_BORDER.FSA;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const SLOT_HEIGHT = 40; // px per 30 min
const VISIBLE_HOURS = 5;
const GRID_VISIBLE_HEIGHT = SLOT_HEIGHT * 2 * VISIBLE_HOURS; // 400px

// MeetingDetailModal moved to shared component @/components/MeetingDetailModal

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Kalendar({ mobileEmbedded = false }: { mobileEmbedded?: boolean }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isMobileHook = useIsMobile();
  const isMobile = mobileEmbedded || isMobileHook;
  const queryClient = useQueryClient();

  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Mobile: selected day for daily view
  const [mobileDay, setMobileDay] = useState(new Date());
  const [mobileDayPickerOpen, setMobileDayPickerOpen] = useState(false);
  const [mobilePickerMonth, setMobilePickerMonth] = useState(new Date());
  const mobileDayPickerRef = useRef<HTMLDivElement>(null);

  // Close mobile day picker on outside click
  useEffect(() => {
    if (!mobileDayPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (mobileDayPickerRef.current && !mobileDayPickerRef.current.contains(e.target as Node)) {
        setMobileDayPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileDayPickerOpen]);

  // Modals
  const [meetingFormOpen, setMeetingFormOpen] = useState(false);
  const [meetingFormInitial, setMeetingFormInitial] = useState<MeetingForm>(defaultMeetingForm());
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [followUp, setFollowUp] = useState<{ caseId: string; caseName: string; meetingType: MeetingType } | null>(null);

  // Week grid scroll ref
  const weekGridScrollRef = useRef<HTMLDivElement>(null);

  // Week boundaries
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  // For mobile: fetch just that day's range
  const mobileDayStr = format(mobileDay, "yyyy-MM-dd");

  const rangeStart = isMobile ? startOfDay(mobileDay) : (view === "week" ? weekStart : monthStart);
  const rangeEnd = isMobile ? startOfDay(mobileDay) : (view === "week" ? weekEnd : monthEnd);

  // Fetch meetings
  const { data: meetings = [] } = useQuery({
    queryKey: ["calendar_meetings", user?.id, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .lte("date", format(rangeEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Meeting[];
    },
    enabled: !!user,
  });

  // Fetch cases
  const { data: cases = [] } = useQuery({
    queryKey: ["calendar_cases", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("cases").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Case[];
    },
    enabled: !!user,
  });

  // Fetch onboarding tasks (for nováčci — tasks with deadlines show in calendar)
  interface OnboardingCalTask { id: string; title: string; deadline: string | null; deadline_time: string | null; completed: boolean; }
  const { data: onboardingTasks = [] } = useQuery({
    queryKey: ["calendar_onboarding_tasks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("onboarding_tasks")
        .select("id, title, deadline, deadline_time, completed")
        .eq("novacek_id", user.id)
        .not("deadline", "is", null);
      if (error) throw error;
      return (data || []) as OnboardingCalTask[];
    },
    enabled: !!user,
  });

  const onboardingByDay = useMemo(() => {
    const map: Record<string, OnboardingCalTask[]> = {};
    for (const t of onboardingTasks) {
      if (!t.deadline) continue;
      if (!map[t.deadline]) map[t.deadline] = [];
      map[t.deadline].push(t);
    }
    return map;
  }, [onboardingTasks]);

  const [localCases, setLocalCases] = useState<Case[]>([]);
  useEffect(() => { setLocalCases(cases); }, [cases]);

  // Enriched meetings — doplní case_name z cases pokud ho schůzka nemá
  const caseMap = useMemo(() => new Map(cases.map(c => [c.id, (c as any).nazev_pripadu as string])), [cases]);
  const enrichedMeetings = useMemo(() =>
    meetings.map(m => ({
      ...m,
      case_name: m.case_name || (m.case_id ? (caseMap.get(m.case_id) ?? null) : null),
    })),
  [meetings, caseMap]);

  // Save meeting
  const saveMutation = useMutation({
    mutationFn: async ({ form, skipFollowUp }: { form: MeetingForm; skipFollowUp?: boolean }) => {
      if (!user) throw new Error("Not logged in");
      const weekStartDate = startOfWeek(parseISO(form.date), { weekStartsOn: 1 });
      const payload = {
        user_id: user.id,
        date: form.date,
        week_start: format(weekStartDate, "yyyy-MM-dd"),
        meeting_type: form.meeting_type,
        cancelled: form.cancelled,
        potencial_bj: form.meeting_type === "FSA" && !form.cancelled ? parseFloat(form.potencial_bj) || null : null,
        // BJ: přímo z formuláře pro POR a SER
        podepsane_bj: !form.cancelled && (form.meeting_type === "POR" || form.meeting_type === "SER")
          ? parseFloat(form.podepsane_bj) || 0
          : 0,
        // Doporučení podle typu
        doporuceni_fsa: !form.cancelled && form.meeting_type === "FSA" ? parseInt(form.doporuceni_fsa) || 0 : 0,
        doporuceni_poradenstvi: !form.cancelled && (form.meeting_type === "POR" || form.meeting_type === "SER")
          ? parseInt(form.doporuceni_poradenstvi) || 0
          : 0,
        doporuceni_pohovor: !form.cancelled && form.meeting_type === "POH" ? parseInt(form.doporuceni_pohovor) || 0 : 0,
        // POH výsledek
        pohovor_jde_dal: !form.cancelled && form.meeting_type === "POH" ? form.pohovor_jde_dal : null,
        vizi_spoluprace: !form.cancelled && form.meeting_type === "POH" && form.pohovor_jde_dal === true,
        // Legacy fields
        has_poradenstvi: false,
        poradenstvi_status: null,
        has_pohovor: false,
        poznamka: form.poznamka || null,
        case_id: form.case_id || null,
        case_name: form.case_name || null,
        location_type: form.location_type || null,
        location_type: form.location_type || null,
        location_detail: form.location_detail || null,
      };
      if (editingMeetingId) {
        const { error } = await supabase.from("client_meetings").update(payload).eq("id", editingMeetingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_meetings").insert(payload);
        if (error) throw error;
      }
      return { form, skipFollowUp };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["calendar_meetings"] });
      setMeetingFormOpen(false);
      const wasEdit = !!editingMeetingId;
      setEditingMeetingId(null);
      toast.success(wasEdit ? "Schůzka upravena" : "Schůzka vytvořena");
      // Show follow-up for non-cancelled meetings (not from follow-up itself)
      const form = result.form;
      if (!result.skipFollowUp && !form.cancelled && form.case_id) {
        const c = localCases.find((cs) => cs.id === form.case_id);
        if (c) {
          setFollowUp({ caseId: form.case_id, caseName: c.nazev_pripadu, meetingType: form.meeting_type });
        }
      }
    },
    onError: (err: any) => toast.error(err.message || "Chyba při ukládání"),
  });

  // Save outcome only
  const outcomeMutation = useMutation({
    mutationFn: async ({ meetingId, data }: { meetingId: string; data: Record<string, unknown> }) => {
      const { error } = await supabase.from("client_meetings").update(data).eq("id", meetingId);
      if (error) throw error;
      return { meetingId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar_meetings"] });
      setDetailOpen(false);
      toast.success("Výsledek uložen");
      // Open follow-up
      if (detailMeeting && !detailMeeting.cancelled && detailMeeting.case_id) {
        const c = localCases.find((cs) => cs.id === detailMeeting.case_id);
        if (c) {
          setFollowUp({ caseId: detailMeeting.case_id, caseName: c.nazev_pripadu, meetingType: detailMeeting.meeting_type });
        }
      }
    },
    onError: (err: any) => toast.error(err.message || "Chyba při ukládání výsledku"),
  });

  const handleSlotClick = (dayIndex: number, hour: number, half: boolean) => {
    const day = addDays(weekStart, dayIndex);
    setMeetingFormInitial(defaultMeetingForm(format(day, "yyyy-MM-dd")));
    setEditingMeetingId(null);
    setMeetingFormOpen(true);
  };

  // Click meeting block
  const handleMeetingClick = (m: Meeting) => {
    setDetailMeeting(m);
    setDetailOpen(true);
  };

  // Meetings by day (for week view)
  const meetingsByDay = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    for (const m of enrichedMeetings) {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    }
    return map;
  }, [enrichedMeetings]);

  // Week days array
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Month grid
  const monthGrid = useMemo(() => {
    const firstDay = startOfMonth(currentDate);
    const lastDay = endOfMonth(currentDate);
    const startDow = (getDay(firstDay) + 6) % 7; // Monday = 0
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    let d = firstDay;
    while (d <= lastDay) {
      cells.push(d);
      d = addDays(d, 1);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentDate]);

  const today = new Date();

  // Auto-scroll week grid to current hour
  useEffect(() => {
    if (view !== "week" || isMobile) return;
    const el = weekGridScrollRef.current;
    if (!el) return;
    const now = new Date();
    const targetHour = now.getHours();
    // Scroll so current hour is near top, with 1 hour padding
    const scrollTo = Math.max(0, (targetHour - 1) * SLOT_HEIGHT * 2);
    el.scrollTop = scrollTo;
  }, [view, isMobile, currentDate]);

  // ─── Week View ─────────────────────────────────────────────────────────────

  const renderWeekView = () => (
    <div className="flex-1 flex flex-col rounded-2xl border border-border bg-card overflow-hidden" style={{ minHeight: 0 }}>
      <div className="min-w-[700px] flex flex-col flex-1" style={{ minHeight: 0 }}>
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-card flex-shrink-0">
          <div className="p-2" />
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div key={i} className="p-2 text-center border-l border-border">
                <div className="text-xs text-muted-foreground">{DAY_NAMES[i]}</div>
                <div className={`text-sm font-semibold ${isToday ? "text-secondary" : "text-foreground"}`}>
                  {format(day, "d. M.")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid — scrollable, roste do výšky karty */}
        <div
          ref={weekGridScrollRef}
          className="relative overflow-y-auto flex-1"
          style={{ minHeight: GRID_VISIBLE_HEIGHT }}
        >
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: SLOT_HEIGHT * 2 }}>
              <div className="p-1 text-right pr-2 text-xs text-muted-foreground border-r border-border" style={{ height: SLOT_HEIGHT }}>
                {`${hour}:00`}
              </div>
              {weekDays.map((day, dayIdx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayMeetings = meetingsByDay[dateStr] || [];
                const dayTasks = onboardingByDay[dateStr] || [];

                return (
                  <div key={dayIdx} className="relative border-l border-border">
                    {/* Top half-hour */}
                    <div
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                      style={{ height: SLOT_HEIGHT }}
                      onClick={() => handleSlotClick(dayIdx, hour, false)}
                    />
                    {/* Bottom half-hour */}
                    <div
                      className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      style={{ height: SLOT_HEIGHT }}
                      onClick={() => handleSlotClick(dayIdx, hour, true)}
                    />

                    {/* Meeting blocks */}
                    {dayMeetings.map((m) => {
                      if (!m.meeting_time) return null;
                      const [h, min] = m.meeting_time.split(":").map(Number);
                      if (h !== hour) return null;
                      const topOffset = min * (SLOT_HEIGHT / 30);
                      const duration = m.duration_minutes || 60;
                      const blockHeight = Math.max(duration * (SLOT_HEIGHT / 30), SLOT_HEIGHT * 0.8);
                      const status = getMeetingStatus(m);
                      const borderColor = getTypeBorder(m.meeting_type);

                      return (
                        <div
                          key={m.id}
                          className="absolute left-1 right-1 rounded-lg px-1.5 py-0.5 cursor-pointer overflow-hidden z-10 hover:opacity-90 transition-opacity"
                          style={{
                            top: topOffset,
                            height: blockHeight,
                            background: getStatusBg(status, isDark),
                            borderLeft: `4px solid ${borderColor}`,
                            fontSize: 11,
                          }}
                          onClick={(e) => { e.stopPropagation(); handleMeetingClick(m); }}
                        >
                          <div className="flex items-center gap-0.5">
                            <div className="font-semibold truncate" style={{ color: borderColor, textDecoration: m.cancelled ? "line-through" : undefined }}>
                              {meetingTypeLabel(m.meeting_type)}{m.case_name ? ` - ${m.case_name}` : ""}
                            </div>
                            {needsFollowUp(m) && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f97316" }} />}
                            {needsFollowUp(m) && <AlertCircle size={11} style={{ color: "#fc7c71", flexShrink: 0 }} />}
                          </div>
                          {blockHeight > 30 && (
                            <div className="text-muted-foreground" style={{ fontSize: 10 }}>
                              {m.meeting_time?.slice(0, 5)}
                              {m.cancelled && " • Zrušená"}
                              {needsFollowUp(m) && " • Doplň výsledek"}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Onboarding task blocks */}
                    {dayTasks.map((t) => {
                      const taskHour = t.deadline_time ? parseInt(t.deadline_time.split(":")[0]) : null;
                      if (taskHour === null) {
                        // Tasks without time: show at top of first hour only (hour === 0)
                        if (hour !== 0) return null;
                        return (
                          <div
                            key={`task-${t.id}`}
                            className="absolute left-1 right-1 rounded-lg px-1.5 py-0.5 overflow-hidden z-10"
                            style={{
                              top: 0,
                              height: SLOT_HEIGHT * 0.8,
                              background: isDark ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.08)",
                              borderLeft: "4px solid #8b5cf6",
                              fontSize: 11,
                              opacity: t.completed ? 0.5 : 1,
                            }}
                          >
                            <div className="flex items-center gap-0.5">
                              <GraduationCap size={10} style={{ color: "#8b5cf6", flexShrink: 0 }} />
                              <div className="font-semibold truncate" style={{ color: "#8b5cf6", textDecoration: t.completed ? "line-through" : undefined }}>
                                {t.title}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      if (taskHour !== hour) return null;
                      const taskMin = parseInt(t.deadline_time!.split(":")[1]) || 0;
                      const topOffset = taskMin * (SLOT_HEIGHT / 30);
                      return (
                        <div
                          key={`task-${t.id}`}
                          className="absolute left-1 right-1 rounded-lg px-1.5 py-0.5 overflow-hidden z-10"
                          style={{
                            top: topOffset,
                            height: SLOT_HEIGHT * 0.8,
                            background: isDark ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.08)",
                            borderLeft: "4px solid #8b5cf6",
                            fontSize: 11,
                            opacity: t.completed ? 0.5 : 1,
                          }}
                        >
                          <div className="flex items-center gap-0.5">
                            <GraduationCap size={10} style={{ color: "#8b5cf6", flexShrink: 0 }} />
                            <div className="font-semibold truncate" style={{ color: "#8b5cf6", textDecoration: t.completed ? "line-through" : undefined }}>
                              {t.title}
                            </div>
                          </div>
                          <div className="text-muted-foreground" style={{ fontSize: 10 }}>
                            {t.deadline_time?.slice(0, 5)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Month View ────────────────────────────────────────────────────────────

  const renderMonthView = () => {
    const selectedDayMeetings = selectedDay
      ? enrichedMeetings.filter((m) => isSameDay(parseISO(m.date), selectedDay))
      : [];
    const selectedDayTasks = selectedDay
      ? (onboardingByDay[format(selectedDay, "yyyy-MM-dd")] || [])
      : [];

    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => {
              setMeetingFormInitial(defaultMeetingForm(selectedDay ? format(selectedDay, "yyyy-MM-dd") : ""));
              setEditingMeetingId(null);
              setMeetingFormOpen(true);
            }}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            <Plus size={14} /> Nová schůzka
          </button>
        </div>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAY_NAMES.map((d) => (
              <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7">
            {monthGrid.map((day, i) => {
              if (!day) return <div key={i} className="p-2 border-b border-r border-border min-h-[70px]" />;
              const dateStr = format(day, "yyyy-MM-dd");
               const dayMeetings = meetingsByDay[dateStr] || [];
               const dayTasks = onboardingByDay[dateStr] || [];
               const isToday = isSameDay(day, today);
               const isSelected = selectedDay && isSameDay(day, selectedDay);

              return (
                <div
                  key={i}
                  className={`p-2 border-b border-r border-border min-h-[70px] cursor-pointer transition-colors ${isSelected ? "bg-secondary/10" : "hover:bg-muted/30"}`}
                  onClick={() => setSelectedDay(day)}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? "text-secondary font-bold" : !isSameMonth(day, currentDate) ? "text-muted-foreground/40" : "text-foreground"}`}>
                    {format(day, "d")}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dayTasks.filter(t => !t.completed).map((t) => (
                      <div key={t.id} className="w-2 h-2 rounded-full" style={{ background: "#8b5cf6" }} />
                    ))}
                    {dayMeetings.slice(0, 3).map((m) => (
                      <div key={m.id} className="w-2 h-2 rounded-full" style={{ background: getTypeBorder(m.meeting_type) }} />
                    ))}
                    {dayMeetings.length > 3 && <span className="text-[9px] text-muted-foreground">+{dayMeetings.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected day meetings */}
        {selectedDay && (
          <div className="rounded-2xl border border-border bg-card flex flex-col" style={{ maxHeight: "calc(100vh - 20rem)" }}>
            <div className="flex items-center justify-between p-4 pb-3 shrink-0">
              <h3 className="font-heading font-semibold text-sm text-foreground">
                {format(selectedDay, "EEEE d. MMMM yyyy", { locale: cs })}
              </h3>
              <button
                onClick={() => {
                  setMeetingFormInitial(defaultMeetingForm(format(selectedDay, "yyyy-MM-dd")));
                  setEditingMeetingId(null);
                  setMeetingFormOpen(true);
                }}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                <Plus size={14} /> Nová schůzka
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-4">
              {/* Onboarding tasks */}
              {selectedDayTasks.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {selectedDayTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ opacity: t.completed ? 0.5 : 1 }}>
                      <div className="w-1 h-8 rounded-full" style={{ background: "#8b5cf6" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <GraduationCap size={13} style={{ color: "#8b5cf6", flexShrink: 0 }} />
                          <span className="text-sm font-medium text-foreground truncate" style={{ textDecoration: t.completed ? "line-through" : undefined }}>{t.title}</span>
                          {t.completed && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: "#3FC55D", background: "rgba(63,197,93,0.12)" }}>Splněno</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Zapracování{t.deadline_time ? ` • ${t.deadline_time.slice(0, 5)}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedDayMeetings.length === 0 && selectedDayTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Žádné události</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayMeetings.map((m) => {
                    const borderColor = getTypeBorder(m.meeting_type);
                    return (
                      <button key={m.id} onClick={() => handleMeetingClick(m)}
                        className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                        <div className="w-1 h-8 rounded-full" style={{ background: borderColor }} />
                        <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-1">
                             <span className="text-sm font-medium text-foreground truncate" style={{ textDecoration: m.cancelled ? "line-through" : undefined }}>{meetingTypeLabel(m.meeting_type)}{m.case_name ? ` - ${m.case_name}` : ""}</span>
                             {needsFollowUp(m) && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f97316" }} />}
                             {needsFollowUp(m) && <AlertCircle size={13} style={{ color: "#fc7c71", flexShrink: 0 }} />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.meeting_time?.slice(0, 5) || "—"} • {m.duration_minutes ? `${m.duration_minutes} min` : "—"}
                            {m.cancelled && " • Zrušená"}
                            {needsFollowUp(m) && " • Doplň výsledek"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Navigation ────────────────────────────────────────────────────────────

  const navigate = (dir: -1 | 1) => {
    if (view === "week") {
      setCurrentDate((d) => dir === -1 ? subWeeks(d, 1) : addWeeks(d, 1));
    } else {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setMonth(next.getMonth() + dir);
        return next;
      });
    }
  };

  const goToday = () => setCurrentDate(new Date());

  const headerLabel = view === "week"
    ? `${format(weekStart, "d. M.", { locale: cs })} – ${format(weekEnd, "d. M. yyyy", { locale: cs })}`
    : format(currentDate, "LLLL yyyy", { locale: cs });

  // ─── Mobile daily view helpers ──────────────────────────────────────────────

  const mobileDayTasks = useMemo(() => onboardingByDay[mobileDayStr] || [], [onboardingByDay, mobileDayStr]);

  const mobileDayMeetings = useMemo(() => {
    return [...enrichedMeetings]
      .filter((m) => m.date === mobileDayStr)
      .sort((a, b) => {
        const ta = a.meeting_time || "99:99";
        const tb = b.meeting_time || "99:99";
        return ta.localeCompare(tb);
      });
  }, [enrichedMeetings, mobileDayStr]);

  const isToday = isSameDay(mobileDay, new Date());

  // Mobile calendar grid for day picker
  const mobileCalendarGrid = useMemo(() => {
    const firstDay = startOfMonth(mobilePickerMonth);
    const lastDay = endOfMonth(mobilePickerMonth);
    const startDow = (getDay(firstDay) + 6) % 7;
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    let d = firstDay;
    while (d <= lastDay) {
      cells.push(d);
      d = addDays(d, 1);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [mobilePickerMonth]);

  // ─── Mobile Render ─────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", ...(!mobileEmbedded ? { paddingTop: "max(32px, calc(env(safe-area-inset-top, 32px) + 16px))" } : {}) }}>
        {/* Header — hide when embedded */}
        {!mobileEmbedded && (
        <div style={{ padding: "16px 20px 12px", flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            <h1 className="font-heading font-bold text-foreground" style={{ fontSize: 22 }}>Kalendář</h1>
          </div>
        </div>
        )}

        {/* Scrollable meeting list */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 180 }}>
        <div style={{ padding: "0 16px" }}>
          {/* Onboarding tasks for this day */}
          {mobileDayTasks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: mobileDayMeetings.length > 0 ? 12 : 0 }}>
              {mobileDayTasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: isDark ? "rgba(0,171,189,0.08)" : "rgba(0,171,189,0.06)",
                    borderRadius: 16,
                    border: isDark ? "1px solid rgba(0,171,189,0.2)" : "1px solid rgba(0,171,189,0.15)",
                    borderLeft: "4px solid #8b5cf6",
                    padding: "12px 16px",
                    opacity: t.completed ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <GraduationCap size={15} style={{ color: "#8b5cf6", flexShrink: 0 }} />
                    <span style={{
                      fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 14,
                      color: "var(--text-primary)",
                      textDecoration: t.completed ? "line-through" : undefined,
                    }}>
                      {t.title}
                    </span>
                    {t.completed && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#3FC55D", background: "rgba(63,197,93,0.12)", borderRadius: 8, padding: "2px 8px" }}>
                        Splněno
                      </span>
                    )}
                  </div>
                  {t.deadline_time && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary, #6b8a8e)", marginTop: 4 }}>
                      <Clock size={12} />
                      <span>{t.deadline_time.slice(0, 5)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {mobileDayMeetings.length === 0 && mobileDayTasks.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "48px 20px",
              color: "var(--text-secondary, #6b8a8e)",
              fontSize: 14,
            }}>
              <Calendar className="h-10 w-10 mx-auto mb-3" style={{ color: isDark ? "#2a5a62" : "#c4d8db" }} />
              <div className="font-heading font-semibold" style={{ fontSize: 15, color: "var(--text-primary)", marginBottom: 4 }}>
                Žádné schůzky
              </div>
              <div>Na {format(mobileDay, "EEEE d. MMMM", { locale: cs })} nemáš naplánované žádné schůzky.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mobileDayMeetings.map((m) => {
                const status = getMeetingStatus(m);
                const borderColor = getTypeBorder(m.meeting_type);
                return (
                  <div
                    key={m.id}
                    onClick={() => { setDetailMeeting(m); setDetailOpen(true); }}
                    style={{
                      background: getStatusBg(status, isDark),
                      borderRadius: 16,
                      border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e1e9eb",
                      borderLeft: `4px solid ${borderColor}`,
                      padding: "14px 16px",
                      cursor: "pointer",
                      transition: "transform 0.1s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontFamily: "Poppins, sans-serif",
                          fontWeight: 700,
                          fontSize: 15,
                          color: borderColor,
                          textDecoration: m.cancelled ? "line-through" : undefined,
                        }}>
                          {meetingTypeLabel(m.meeting_type)}{m.case_name ? ` - ${m.case_name}` : ""}
                        </span>
                        {needsFollowUp(m) && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", flexShrink: 0 }} />}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {needsFollowUp(m) && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: "#fc7c71",
                            background: "rgba(252,124,113,0.12)", borderRadius: 8, padding: "2px 8px",
                            display: "flex", alignItems: "center", gap: 3,
                          }}>
                            <AlertCircle size={10} /> Doplň výsledek
                          </span>
                        )}
                        {m.cancelled && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: "#fc7c71",
                            background: "rgba(252,124,113,0.12)", borderRadius: 8, padding: "2px 8px",
                          }}>
                            Zrušená
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      {m.meeting_time && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-secondary, #6b8a8e)" }}>
                          <Clock size={13} />
                          <span>{m.meeting_time.slice(0, 5)}</span>
                          {m.duration_minutes != null && <span style={{ fontSize: 11 }}>({m.duration_minutes} min)</span>}
                        </div>
                      )}
                      {(m.location_detail || m.location_type) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-secondary, #6b8a8e)" }}>
                          <MapPin size={13} />
                          <span>{m.location_detail || (m.location_type === "osobne" ? "Osobně" : "Online")}</span>
                        </div>
                      )}
                    </div>

                    {m.case_name && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary, #6b8a8e)", marginTop: 6 }}>
                        {m.case_name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>{/* end scrollable */}

        {/* Floating button + day picker */}
        <div style={{
          position: "fixed", bottom: 120, left: 16, right: 16, zIndex: 40,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setMeetingFormInitial(defaultMeetingForm(mobileDayStr));
                setEditingMeetingId(null);
                setMeetingFormOpen(true);
              }}
              className="btn btn-primary btn-md flex items-center justify-center gap-2"
              style={{ flex: 1, boxShadow: "0 -2px 16px rgba(0,0,0,0.06)" }}
            >
              <Plus size={18} />
              Přidat schůzku
            </button>
            <button
              onClick={() => !isToday && setMobileDay(new Date())}
              disabled={isToday}
              style={{
                height: 40, padding: "0 16px", borderRadius: 12, border: "none",
                background: isToday ? (isDark ? "rgba(255,255,255,0.08)" : "#dde8ea") : "#00abbd",
                color: isToday ? (isDark ? "rgba(255,255,255,0.3)" : "#a0b4b8") : "#fff",
                fontWeight: 600, fontSize: 13, cursor: isToday ? "default" : "pointer",
                fontFamily: "Poppins, sans-serif",
                boxShadow: isToday ? "none" : "0 -2px 16px rgba(0,0,0,0.06)",
                transition: "all 0.2s",
                flexShrink: 0,
              }}
            >
              Dnes
            </button>
          </div>
          <div ref={mobileDayPickerRef} style={{
            background: isDark ? "rgba(9,29,33,0.85)" : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)",
            borderRadius: 16, padding: "10px 16px",
            border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(225,233,235,0.8)",
            display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative",
          }}>
            <button onClick={() => setMobileDay((d) => subDays(d, 1))}
              style={{ width: 32, height: 32, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
            </button>
            <button onClick={() => { setMobilePickerMonth(mobileDay); setMobileDayPickerOpen((o) => !o); }}
              style={{ textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>
                {isToday ? "Dnes" : format(mobileDay, "EEEE", { locale: cs })}
              </div>
              <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
                {format(mobileDay, "d. MMMM yyyy", { locale: cs })}
              </div>
            </button>
            <button onClick={() => setMobileDay((d) => addDays(d, 1))}
              style={{ width: 32, height: 32, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
            </button>

            {/* Calendar popup */}
            {mobileDayPickerOpen && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                background: isDark ? "#0a1f23" : "#fff", borderRadius: 14,
                border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e1e9eb",
                boxShadow: "0 -8px 24px rgba(0,0,0,0.08)", overflow: "hidden",
              }}>
                {/* Month navigator */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #eef3f4" }}>
                  <button onClick={() => setMobilePickerMonth((d) => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}
                    style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: isDark ? "rgba(255,255,255,0.1)" : "#eef3f4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronLeft size={14} color={isDark ? "#4dd8e8" : "#00555f"} />
                  </button>
                  <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
                    {format(mobilePickerMonth, "LLLL yyyy", { locale: cs })}
                  </span>
                  <button onClick={() => setMobilePickerMonth((d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}
                    style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: isDark ? "rgba(255,255,255,0.1)" : "#eef3f4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronRight size={14} color={isDark ? "#4dd8e8" : "#00555f"} />
                  </button>
                </div>

                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "6px 8px 0" }}>
                  {DAY_NAMES.map((d) => (
                    <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: isDark ? "#4a7a80" : "#8aadb3", padding: "4px 0" }}>{d}</div>
                  ))}
                </div>

                {/* Day grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, padding: "4px 8px 10px" }}>
                  {mobileCalendarGrid.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const isSelected = isSameDay(day, mobileDay);
                    const isTodayCell = isSameDay(day, new Date());
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setMobileDay(day);
                          setMobileDayPickerOpen(false);
                        }}
                        style={{
                          width: "100%", aspectRatio: "1", borderRadius: 10, border: "none",
                          background: isSelected ? "#00abbd" : isTodayCell ? (isDark ? "rgba(0,171,189,0.2)" : "rgba(0,171,189,0.1)") : "transparent",
                          color: isSelected ? "#fff" : isTodayCell ? "#00abbd" : (isDark ? "#c8e0e3" : "#00555f"),
                          fontWeight: isSelected || isTodayCell ? 700 : 500,
                          fontSize: 13, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        <MeetingFormModal
          open={meetingFormOpen}
          onClose={() => setMeetingFormOpen(false)}
          initial={meetingFormInitial}
          onSave={(form) => saveMutation.mutate({ form })}
          saving={saveMutation.isPending}
          cases={localCases}
          isEdit={!!editingMeetingId}
          allowCreateCase
          onCaseCreated={(c) => setLocalCases((prev) => [c, ...prev])}
          createCaseFn={async (name, note) => {
            const { data, error } = await supabase.from("cases").insert({
              user_id: user!.id, nazev_pripadu: name, poznamka: note || null,
            }).select().single();
            if (error) throw error;
            toast.success("Případ vytvořen");
            return data as unknown as Case;
          }}
        />
        <MeetingDetailModal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          meeting={detailMeeting}
          onSaveOutcome={(meetingId, data) => outcomeMutation.mutate({ meetingId, data })}
          savingOutcome={outcomeMutation.isPending}
          onCancel={async () => {
            if (detailMeeting) {
              await supabase.from("client_meetings").update({ cancelled: true }).eq("id", detailMeeting.id);
              queryClient.invalidateQueries({ queryKey: ["calendar_meetings"] });
              toast.success("Schůzka zrušena");
            }
          }}
          onScheduleFollowUp={(data) => {
            if (detailMeeting) {
              const form: MeetingForm = {
                ...defaultMeetingForm(data.date),
                meeting_type: data.meeting_type as MeetingType,
                case_id: detailMeeting.case_id || "",
                case_name: detailMeeting.case_name || "",
              };
              saveMutation.mutate({ form, skipFollowUp: true });
            }
          }}
          onEdit={() => {
            setDetailOpen(false);
            if (detailMeeting) {
              setMeetingFormInitial({
                date: detailMeeting.date,
                meeting_type: detailMeeting.meeting_type,
                cancelled: detailMeeting.cancelled,
                potencial_bj: detailMeeting.potencial_bj?.toString() || "",
                has_poradenstvi: detailMeeting.has_poradenstvi,
                podepsane_bj: detailMeeting.podepsane_bj?.toString() || "",
                doporuceni_poradenstvi: detailMeeting.doporuceni_poradenstvi?.toString() || "0",
                poradenstvi_date: detailMeeting.poradenstvi_date || "",
                poradenstvi_status: detailMeeting.poradenstvi_status as any,
                has_pohovor: detailMeeting.has_pohovor,
                pohovor_jde_dal: detailMeeting.pohovor_jde_dal,
                doporuceni_pohovor: detailMeeting.doporuceni_pohovor?.toString() || "0",
                pohovor_date: detailMeeting.pohovor_date || "",
                doporuceni_fsa: detailMeeting.doporuceni_fsa?.toString() || "0",
                poznamka: detailMeeting.poznamka || "",
                case_name: detailMeeting.case_name || "",
                case_id: detailMeeting.case_id || "",
                location_type: detailMeeting.location_type || "",
                location_type: detailMeeting.location_type || "",
                location_detail: detailMeeting.location_detail || "",
              });
              setEditingMeetingId(detailMeeting.id);
              setMeetingFormOpen(true);
            }
          }}
        />
        <FollowUpModal
          open={!!followUp}
          onClose={() => setFollowUp(null)}
          caseName={followUp?.caseName || ""}
          caseId={followUp?.caseId || ""}
          meetingType={followUp?.meetingType || "FSA"}
          onSchedule={async (data) => {
            const form: MeetingForm = {
              ...defaultMeetingForm(data.date),
              case_id: data.case_id,
              meeting_type: data.meeting_type,
              location_type: data.location_type,
              location_detail: data.location_detail,
            };
            await new Promise<void>((resolve, reject) => {
              saveMutation.mutate({ form, skipFollowUp: true }, {
                onSuccess: () => resolve(),
                onError: (err) => reject(err),
              });
            });
          }}
        />
      </div>
    );
  }

  // ─── Desktop Render ────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col gap-4${view === "week" ? " h-[calc(100vh-4rem)]" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
          <h1 className="font-heading font-bold text-foreground" style={{ fontSize: 28 }}>Kalendář</h1>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
          {(["week", "month"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {v === "week" ? "Týden" : "Měsíc"}
            </button>
          ))}
        </div>
      </div>

      {/* Week/month navigator */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </button>
        <span className="font-heading font-semibold text-sm text-foreground min-w-[180px] text-center">{headerLabel}</span>
        <button onClick={() => navigate(1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4 text-foreground" />
        </button>
        <button onClick={goToday}
          className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-input hover:bg-muted transition-colors text-foreground">
          Dnes
        </button>
      </div>

      {/* Calendar view */}
      {view === "week" ? renderWeekView() : renderMonthView()}

      {/* Modals */}
      <MeetingFormModal
        open={meetingFormOpen}
        onClose={() => setMeetingFormOpen(false)}
        initial={meetingFormInitial}
        onSave={(form) => saveMutation.mutate({ form })}
        saving={saveMutation.isPending}
        cases={localCases}
        isEdit={!!editingMeetingId}
        allowCreateCase
        onCaseCreated={(c) => setLocalCases((prev) => [c, ...prev])}
        createCaseFn={async (name, note) => {
          const { data, error } = await supabase.from("cases").insert({
            user_id: user!.id, nazev_pripadu: name, poznamka: note || null,
          }).select().single();
          if (error) throw error;
          toast.success("Případ vytvořen");
          return data as unknown as Case;
        }}
      />
      <MeetingDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        meeting={detailMeeting}
        onSaveOutcome={(meetingId, data) => outcomeMutation.mutate({ meetingId, data })}
        savingOutcome={outcomeMutation.isPending}
        onCancel={async () => {
          if (detailMeeting) {
            await supabase.from("client_meetings").update({ cancelled: true }).eq("id", detailMeeting.id);
            queryClient.invalidateQueries({ queryKey: ["calendar_meetings"] });
            toast.success("Schůzka zrušena");
          }
        }}
        onScheduleFollowUp={(data) => {
          if (detailMeeting) {
            const form: MeetingForm = {
              ...defaultMeetingForm(data.date),
              meeting_type: data.meeting_type as MeetingType,
              case_id: detailMeeting.case_id || "",
              case_name: detailMeeting.case_name || "",
            };
            saveMutation.mutate({ form, skipFollowUp: true });
          }
        }}
        onEdit={() => {
          setDetailOpen(false);
          if (detailMeeting) {
            setMeetingFormInitial({
              date: detailMeeting.date,
              meeting_type: detailMeeting.meeting_type,
              cancelled: detailMeeting.cancelled,
              potencial_bj: detailMeeting.potencial_bj?.toString() || "",
              has_poradenstvi: detailMeeting.has_poradenstvi,
              podepsane_bj: detailMeeting.podepsane_bj?.toString() || "",
              doporuceni_poradenstvi: detailMeeting.doporuceni_poradenstvi?.toString() || "0",
              poradenstvi_date: detailMeeting.poradenstvi_date || "",
              poradenstvi_status: detailMeeting.poradenstvi_status as any,
              has_pohovor: detailMeeting.has_pohovor,
              pohovor_jde_dal: detailMeeting.pohovor_jde_dal,
              doporuceni_pohovor: detailMeeting.doporuceni_pohovor?.toString() || "0",
              pohovor_date: detailMeeting.pohovor_date || "",
              doporuceni_fsa: detailMeeting.doporuceni_fsa?.toString() || "0",
              poznamka: detailMeeting.poznamka || "",
              case_name: detailMeeting.case_name || "",
              case_id: detailMeeting.case_id || "",
              location_type: detailMeeting.location_type || "",
              location_type: detailMeeting.location_type || "",
              location_detail: detailMeeting.location_detail || "",
            });
            setEditingMeetingId(detailMeeting.id);
            setMeetingFormOpen(true);
          }
        }}
      />
      <FollowUpModal
        open={!!followUp}
        onClose={() => setFollowUp(null)}
        caseName={followUp?.caseName || ""}
        caseId={followUp?.caseId || ""}
        meetingType={followUp?.meetingType || "FSA"}
        onSchedule={async (data) => {
            const form: MeetingForm = {
              ...defaultMeetingForm(data.date),
              case_id: data.case_id,
              meeting_type: data.meeting_type,
              location_type: data.location_type,
              location_detail: data.location_detail,
            };
          await new Promise<void>((resolve, reject) => {
            saveMutation.mutate({ form, skipFollowUp: true }, {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            });
          });
        }}
      />
    </div>
  );
}
