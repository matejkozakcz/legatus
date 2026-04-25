import { useState, useMemo, useEffect, useRef } from "react";
import { MojeAktivityContent } from "@/pages/MojeAktivity";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format, parseISO, addDays, subDays, isSameDay,
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  isWithinInterval,
} from "date-fns";
import { cs } from "date-fns/locale";
import { getProductionPeriodForMonth, getProductionPeriodMonth } from "@/lib/productionPeriod";
import { useUnrecordedMeetings } from "@/hooks/useUnrecordedMeetings";
import { AlertCircle } from "lucide-react";

import {
  Plus,
  X,
  Loader2,
  Pencil,
  Trash2,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  BarChart3,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";

import {
  MeetingFormModal,
  type MeetingForm,
  type MeetingType,
  type Case,
  meetingTypeLabel,
  defaultMeetingForm,
} from "@/components/MeetingFormFields";
import { FollowUpModal, type FollowUpScheduleData } from "@/components/FollowUpModal";
import { PeriodNavigator } from "@/components/PeriodNavigator";
import { MeetingDetailModal } from "@/components/MeetingDetailModal";
import { MEETING_TYPE_COLORS, meetingTypeBadgeColors } from "@/lib/meetingColors";

type PoradkoStatus = "probehle" | "zrusene" | null;

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
  location_type: string | null;
  location_detail: string | null;
  outcome_recorded: boolean;
}

const defaultForm = (caseId?: string): MeetingForm => ({
  ...defaultMeetingForm(),
  case_id: caseId || "",
});

const meetingToForm = (m: Meeting): MeetingForm => ({
  date: m.date,
  meeting_type: m.meeting_type,
  cancelled: m.cancelled,
  potencial_bj: m.potencial_bj != null ? String(m.potencial_bj) : "",
  has_poradenstvi: m.has_poradenstvi,
  podepsane_bj: String(m.podepsane_bj || ""),
  doporuceni_poradenstvi: String(m.doporuceni_poradenstvi || 0),
  poradenstvi_date: m.poradenstvi_date || "",
  poradenstvi_status: (m.poradenstvi_status as PoradkoStatus) || null,
  has_pohovor: m.has_pohovor,
  pohovor_jde_dal: m.pohovor_jde_dal,
  doporuceni_pohovor: String(m.doporuceni_pohovor || 0),
  pohovor_date: m.pohovor_date || "",
  doporuceni_fsa: String(m.doporuceni_fsa || 0),
  poznamka: m.poznamka || "",
  case_name: m.case_name || "",
  case_id: m.case_id || "",
  location_type: m.location_type || "",
  location_detail: m.location_detail || "",
  info_zucastnil_se: (m as any).info_zucastnil_se ?? null,
  info_pocet_lidi: (m as any).info_pocet_lidi != null ? String((m as any).info_pocet_lidi) : "",
  parent_meeting_id: (m as any).parent_meeting_id ?? null,
});

// ─── Helper components ───────────────────────────────────────────────────────

function totalRefs(m: Meeting): number {
  return (m.doporuceni_fsa || 0) + (m.doporuceni_poradenstvi || 0) + (m.doporuceni_pohovor || 0);
}

function meetingTypeBadgeStyle(t: MeetingType, cancelled: boolean) {
  return meetingTypeBadgeColors(t, cancelled);
}

// ─── Case Modal (create / edit) ──────────────────────────────────────────────

function CaseModal({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: { nazev_pripadu: string; poznamka: string; status: string };
  onSave: (d: { nazev_pripadu: string; poznamka: string; status: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) setForm(initial);
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const isEdit = initial.nazev_pripadu !== "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Upravit případ" : "Založit případ"}
        </h2>
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Název případu *</label>
          <input
            type="text"
            value={form.nazev_pripadu}
            onChange={(e) => setForm((f) => ({ ...f, nazev_pripadu: e.target.value }))}
            placeholder="Např. Rodina Nováků"
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Poznámka</label>
          <textarea
            value={form.poznamka}
            onChange={(e) => setForm((f) => ({ ...f, poznamka: e.target.value }))}
            rows={2}
            placeholder="Volitelné…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        {isEdit && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
            <div className="flex gap-2">
              {(["aktivni", "uzavreny"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: s }))}
                  className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors ${form.status === s ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                  style={form.status === s ? { background: s === "aktivni" ? "#00abbd" : "#6b7280" } : {}}
                >
                  {s === "aktivni" ? "Aktivní" : "Uzavřený"}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.nazev_pripadu.trim()}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Uložit
        </button>
      </div>
    </div>
  );
}

// MeetingDetailModal moved to shared component @/components/MeetingDetailModal

// ─── Meeting Form Modal ──────────────────────────────────────────────────────

// ─── Follow-Up Suggestion Modal ──────────────────────────────────────────────

// Old FollowUpModal removed — using shared component from @/components/FollowUpModal

// ─── Case Accordion Item ─────────────────────────────────────────────────────

function CaseAccordion({
  c,
  meetings,
  onAddActivity,
  onEditCase,
  onClickMeeting,
  onDeleteMeeting,
}: {
  c: Case;
  meetings: Meeting[];
  onAddActivity: () => void;
  onEditCase: () => void;
  onClickMeeting: (m: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date));
  const activeMeetings = meetings.filter((m) => !m.cancelled);
  const sumRefs = activeMeetings.reduce((s, m) => s + totalRefs(m), 0);
  const sumBj = activeMeetings.reduce((s, m) => s + (m.podepsane_bj || 0), 0);

  return (
    <div className="legatus-card overflow-hidden" style={{ padding: 0 }}>
      <div
        className="cursor-pointer select-none"
        style={{ padding: "10px 12px" }}
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Row 1: chevron + name + actions */}
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="font-heading font-semibold text-sm flex-1" style={{ color: "var(--text-primary)" }}>
            {c.nazev_pripadu}
          </span>
          {c.status === "uzavreny" && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
              Uzavřený
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddActivity();
            }}
            className="p-1.5 rounded-lg transition-colors hover:bg-muted flex-shrink-0"
            style={{ color: "#00abbd" }}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditCase();
            }}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Row 2: stats badges */}
        {(sumRefs > 0 || sumBj > 0) && (
          <div className="flex items-center gap-1.5 ml-6 mt-1.5">
            {sumRefs > 0 && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,171,189,0.12)", color: "#00abbd" }}
              >
                {sumRefs} dop.
              </span>
            )}
            {sumBj > 0 && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,85,95,0.10)", color: "#00555f" }}
              >
                {sumBj} BJ
              </span>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border">
          {sorted.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground text-center">Žádné aktivity v tomto období.</p>
          ) : (
            sorted.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                style={m.cancelled ? { opacity: 0.45, textDecoration: "line-through" } : {}}
                onClick={() => onClickMeeting(m)}
              >
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">
                  {m.cancelled ? (
                    <span style={{ color: "#fc7c71", fontWeight: 600 }}>Zrušená</span>
                  ) : m.outcome_recorded ? (
                    <span style={{ color: "#22c55e", fontWeight: 600 }}>Proběhlá</span>
                  ) : format(parseISO(m.date), "d. M. yyyy", { locale: cs })}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={meetingTypeBadgeStyle(m.meeting_type, m.cancelled)}
                >
                  {meetingTypeLabel(m.meeting_type)}
                </span>
                {!m.outcome_recorded && !m.cancelled && m.date <= format(new Date(), "yyyy-MM-dd") && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f97316" }} />
                )}
                <span className="text-xs text-muted-foreground flex-1">
                  {!m.cancelled && m.has_poradenstvi && m.poradenstvi_status === "probehle"
                    ? `${m.podepsane_bj} BJ`
                    : ""}
                  {!m.cancelled && totalRefs(m) > 0 ? ` · ${totalRefs(m)} dop.` : ""}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMeeting(m.id);
                  }}
                  className="p-1 rounded-lg hover:bg-muted transition-colors"
                >
                  <Trash2 className="h-3 w-3" style={{ color: "#fc7c71" }} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hlavní komponenta ────────────────────────────────────────────────────────

export default function ObchodniPripady({ mobileEmbedded = false }: { mobileEmbedded?: boolean }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobileHook = useIsMobile();
  const isMobile = mobileEmbedded || isMobileHook;
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const now = new Date();
  const currentPeriod = getProductionPeriodMonth(now);

  const [selectedYear, setSelectedYear] = useState(currentPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(currentPeriod.month);

  // Modals
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [editCase, setEditCase] = useState<Case | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);
  const [preCaseId, setPreCaseId] = useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<{ caseId: string; caseName: string; meetingType: MeetingType; parentMeetingId: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState<"schuzky" | "pripady" | "aktivity">(mobileEmbedded ? "pripady" : "schuzky");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("week");
  const [viewModeMenuOpen, setViewModeMenuOpen] = useState(false);
  // Filtry pro Schůzky (jen desktop)
  const ALL_FILTER_TYPES: MeetingType[] = ["FSA", "POR", "SER", "POH"];
  const [typeFilter, setTypeFilter] = useState<Set<MeetingType>>(new Set(ALL_FILTER_TYPES));
  const [showCancelled, setShowCancelled] = useState(false);
  const [showUnrecordedModal, setShowUnrecordedModal] = useState(false);
  const [showUnrecordedBanner, setShowUnrecordedBanner] = useState(true);

  const { unrecordedMeetings, unrecordedCount } = useUnrecordedMeetings();


  const periodRange = useMemo(
    () => getProductionPeriodForMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  // ── Fetch cases ──
  const { data: cases = [], isLoading: casesLoading } = useQuery<Case[]>({
    queryKey: ["cases", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Case[];
    },
    enabled: !!profile?.id,
  });

  // ── Fetch meetings for period ──
  const { data: meetings = [], isLoading: meetingsLoading } = useQuery<Meeting[]>({
    queryKey: [
      "client_meetings",
      profile?.id,
      format(periodRange.start, "yyyy-MM-dd"),
      format(periodRange.end, "yyyy-MM-dd"),
    ],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("*")
        .eq("user_id", profile.id)
        .gte("date", format(periodRange.start, "yyyy-MM-dd"))
        .lte("date", format(periodRange.end, "yyyy-MM-dd"))
        .order("date", { ascending: false });
      if (error) throw error;
      return (data as unknown as Meeting[]) ?? [];
    },
    enabled: !!profile?.id,
  });

  const isLoading = casesLoading || meetingsLoading;

  // Group meetings by case_id
  const meetingsByCase = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    for (const m of meetings) {
      const key = m.case_id || "__unlinked__";
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [meetings]);

  // Date range for selected period (Schůzky tab) — Den / Týden / Měsíc
  // Mobile vždy zobrazuje pouze vybraný den (denní picker), desktop respektuje viewMode.
  const dateRange = useMemo(() => {
    if (isMobile || viewMode === "day") {
      return { start: selectedDate, end: selectedDate };
    }
    if (viewMode === "week") {
      return {
        start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
        end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
      };
    }
    // Měsíc = produkční období (např. duben = 28.3. – 27.4.)
    const pm = getProductionPeriodMonth(selectedDate);
    return getProductionPeriodForMonth(pm.year, pm.month);
  }, [viewMode, selectedDate, isMobile]);

  // Meetings within selected range (Schůzky tab)
  const meetingsForDay = useMemo(() => {
    const startStr = format(dateRange.start, "yyyy-MM-dd");
    const endStr = format(dateRange.end, "yyyy-MM-dd");
    return meetings
      .filter((m) => m.date >= startStr && m.date <= endStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [meetings, dateRange]);

  // Desktop: aplikuj filtry typu schůzky a viditelnost zrušených
  const meetingsForDayDesktop = useMemo(() => {
    return meetingsForDay.filter((m) => {
      if (!showCancelled && m.cancelled) return false;
      // Filtr typu se vztahuje jen na 4 hlavní typy. Ostatní (NAB / INFO / POST) se zobrazí vždy.
      if ((ALL_FILTER_TYPES as string[]).includes(m.meeting_type)) {
        if (!typeFilter.has(m.meeting_type as MeetingType)) return false;
      }
      return true;
    });
  }, [meetingsForDay, typeFilter, showCancelled]);

  // Header navigator props for Schůzky tab (desktop) — mirrors Dashboard mechanics
  const schuzkyHeaderNav = useMemo(() => {
    if (viewMode === "day") {
      return {
        label: isSameDay(selectedDate, new Date()) ? "Dnes" : format(selectedDate, "EEEE", { locale: cs }),
        title: format(selectedDate, "d. MMMM yyyy", { locale: cs }),
        onPrev: () => setSelectedDate((d) => subDays(d, 1)),
        onNext: () => setSelectedDate((d) => addDays(d, 1)),
        onSelectDate: (date: Date) => setSelectedDate(date),
        selectedDate,
        calendarMonth: selectedDate,
        pickerMode: "day" as const,
      };
    }
    if (viewMode === "week") {
      const wStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const wEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
      const todayWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
      return {
        label: isSameDay(wStart, todayWeek)
          ? "Aktuální týden"
          : format(wStart, "LLLL yyyy", { locale: cs }).replace(/^./, (c) => c.toUpperCase()),
        title: `${format(wStart, "d.M.", { locale: cs })} – ${format(wEnd, "d.M.", { locale: cs })}`,
        onPrev: () => setSelectedDate((d) => subWeeks(d, 1)),
        onNext: () => setSelectedDate((d) => addWeeks(d, 1)),
        onSelectDate: (date: Date) => setSelectedDate(startOfWeek(date, { weekStartsOn: 1 })),
        selectedDate: wStart,
        calendarMonth: wStart,
        pickerMode: "day" as const,
      };
    }
    const monthNamesFull = [
      "Leden","Únor","Březen","Duben","Květen","Červen",
      "Červenec","Srpen","Září","Říjen","Listopad","Prosinec",
    ];
    const curPeriod = getProductionPeriodMonth(selectedDate);
    const todayPeriod = getProductionPeriodMonth(new Date());
    const range = getProductionPeriodForMonth(curPeriod.year, curPeriod.month);
    const isCurrent = curPeriod.year === todayPeriod.year && curPeriod.month === todayPeriod.month;
    return {
      label: isCurrent ? "Aktuální období" : "Produkční období",
      title: `${monthNamesFull[curPeriod.month]} ${curPeriod.year}`,
      subtitle: `${format(range.start, "d. M.", { locale: cs })} – ${format(range.end, "d. M. yyyy", { locale: cs })}`,
      onPrev: () => {
        const prevM = curPeriod.month === 0 ? 11 : curPeriod.month - 1;
        const prevY = curPeriod.month === 0 ? curPeriod.year - 1 : curPeriod.year;
        const prevRange = getProductionPeriodForMonth(prevY, prevM);
        setSelectedDate(prevRange.start);
      },
      onNext: () => {
        const nextM = curPeriod.month === 11 ? 0 : curPeriod.month + 1;
        const nextY = curPeriod.month === 11 ? curPeriod.year + 1 : curPeriod.year;
        const nextRange = getProductionPeriodForMonth(nextY, nextM);
        setSelectedDate(nextRange.start);
      },
      onSelectDate: (date: Date) => {
        // Klik v měsíčním pickeru → mapuj kalendářní měsíc na produkční období
        const pm = getProductionPeriodMonth(date);
        const r = getProductionPeriodForMonth(pm.year, pm.month);
        setSelectedDate(r.start);
      },
      selectedDate: new Date(curPeriod.year, curPeriod.month, 1),
      calendarMonth: new Date(curPeriod.year, curPeriod.month, 1),
      pickerMode: "month" as const,
    };
  }, [viewMode, selectedDate]);


  // ── Case mutations ──
  const saveCaseMutation = useMutation({
    mutationFn: async ({
      data,
      id,
    }: {
      data: { nazev_pripadu: string; poznamka: string; status: string };
      id?: string;
    }) => {
      const payload = {
        user_id: profile!.id,
        nazev_pripadu: data.nazev_pripadu.trim(),
        poznamka: data.poznamka.trim() || null,
        status: data.status,
      };
      if (id) {
        const { error } = await supabase
          .from("cases")
          .update(payload as any)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cases").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success(editCase ? "Případ upraven" : "Případ vytvořen");
      setCaseModalOpen(false);
      setEditCase(null);
    },
    onError: (err: any) => toast.error(err.message || "Chyba"),
  });

  // ── Meeting mutations ──
  const saveMeetingMutation = useMutation({
    mutationFn: async ({ form, id }: { form: MeetingForm; id?: string; skipFollowUp?: boolean }) => {
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
        // BJ: přímo z formuláře pro POR a SER (bez podmínky has_poradenstvi/poradenstvi_status)
        podepsane_bj:
          !form.cancelled && (form.meeting_type === "POR" || form.meeting_type === "SER")
            ? parseFloat(form.podepsane_bj) || 0
            : 0,
        // Doporučení podle typu
        doporuceni_fsa: !form.cancelled && (form.meeting_type === "FSA" || form.meeting_type === "NAB") ? parseInt(form.doporuceni_fsa) || 0 : 0,
        doporuceni_poradenstvi:
          !form.cancelled && (form.meeting_type === "POR" || form.meeting_type === "SER")
            ? parseInt(form.doporuceni_poradenstvi) || 0
            : 0,
        doporuceni_pohovor: !form.cancelled && form.meeting_type === "POH" ? parseInt(form.doporuceni_pohovor) || 0 : 0,
        // POH výsledek
        pohovor_jde_dal: !form.cancelled && form.meeting_type === "POH" ? form.pohovor_jde_dal : null,
        vizi_spoluprace: !form.cancelled && form.meeting_type === "POH" && form.pohovor_jde_dal === true,
        // Legacy fields — zachováme null (DB sloupce existují, formulář je nepoužívá)
        has_poradenstvi: false,
        poradenstvi_status: null,
        has_pohovor: false,
        poznamka: form.poznamka.trim() || null,
        // INFO/POST výsledek
        info_zucastnil_se: !form.cancelled && (form.meeting_type === "INFO" || form.meeting_type === "POST") ? form.info_zucastnil_se : null,
        info_pocet_lidi: !form.cancelled && (form.meeting_type === "INFO" || form.meeting_type === "POST") && form.info_pocet_lidi !== "" ? parseInt(form.info_pocet_lidi) || 0 : null,
        parent_meeting_id: form.parent_meeting_id ?? null,
      };
      let insertedId: string | undefined;
      if (id) {
        const { error } = await supabase
          .from("client_meetings")
          .update(payload as any)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("client_meetings").insert(payload as any).select("id").single();
        if (error) throw error;
        insertedId = (data as any)?.id;
      }
      return { insertedId };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
      toast.success(variables.id ? "Schůzka upravena" : "Schůzka přidána");
      const savedForm = variables.form;
      const savedCaseId = savedForm.case_id;
      const savedCase = cases.find((c) => c.id === savedCaseId);
      setMeetingModalOpen(false);
      setEditMeeting(null);
      // Show follow-up if not cancelled and not already from follow-up
      if (!variables.skipFollowUp && !savedForm.cancelled && savedCaseId && savedCase) {
        setFollowUp({ caseId: savedCaseId, caseName: savedCase.nazev_pripadu, meetingType: savedForm.meeting_type, parentMeetingId: result?.insertedId ?? null });
      }
    },
    onError: (err: any) => toast.error(err.message || "Chyba při ukládání"),
  });

  // ── Outcome mutation (save meeting results) ──
  const outcomeMutation = useMutation({
    mutationFn: async ({ meetingId, data }: { meetingId: string; data: Record<string, unknown> }) => {
      const { error } = await supabase.from("client_meetings").update(data).eq("id", meetingId);
      if (error) throw error;
      return { meetingId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
      // Don't close the modal — let the MeetingDetailModal show the follow-up prompt
      toast.success("Výsledek uložen");
    },
    onError: (err: any) => toast.error(err.message || "Chyba při ukládání výsledku"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
      toast.success("Schůzka smazána");
    },
    onError: (err: any) => toast.error(err.message || "Chyba při mazání"),
  });

  // ── Handlers ──
  // openCreateCase removed — cases are now auto-created from meeting form
  const openEditCase = (c: Case) => {
    setEditCase(c);
    setCaseModalOpen(true);
  };

  const openAddMeeting = (caseId: string) => {
    setEditMeeting(null);
    setPreCaseId(caseId);
    setMeetingModalOpen(true);
  };

  const openEditMeeting = (m: Meeting) => {
    setEditMeeting(m);
    setPreCaseId(m.case_id || "");
    setMeetingModalOpen(true);
  };

  const meetingInitialForm: MeetingForm = editMeeting
    ? {
        date: editMeeting.date,
        meeting_type: editMeeting.meeting_type,
        cancelled: editMeeting.cancelled,
        potencial_bj: editMeeting.potencial_bj != null ? String(editMeeting.potencial_bj) : "",
        has_poradenstvi: editMeeting.has_poradenstvi,
        podepsane_bj: String(editMeeting.podepsane_bj || ""),
        doporuceni_poradenstvi: String(editMeeting.doporuceni_poradenstvi || 0),
        poradenstvi_date: editMeeting.poradenstvi_date || "",
        poradenstvi_status: (editMeeting.poradenstvi_status as PoradkoStatus) || null,
        has_pohovor: editMeeting.has_pohovor,
        pohovor_jde_dal: editMeeting.pohovor_jde_dal,
        doporuceni_pohovor: String(editMeeting.doporuceni_pohovor || 0),
        pohovor_date: editMeeting.pohovor_date || "",
        doporuceni_fsa: String(editMeeting.doporuceni_fsa || 0),
        poznamka: editMeeting.poznamka || "",
        case_name: editMeeting.case_name || "",
        case_id: editMeeting.case_id || "",
        location_type: editMeeting.location_type || "",
        location_detail: editMeeting.location_detail || "",
        info_zucastnil_se: (editMeeting as any).info_zucastnil_se ?? null,
        info_pocet_lidi: (editMeeting as any).info_pocet_lidi != null ? String((editMeeting as any).info_pocet_lidi) : "",
      }
    : defaultForm(preCaseId);

  const caseInitialForm = editCase
    ? { nazev_pripadu: editCase.nazev_pripadu, poznamka: editCase.poznamka || "", status: editCase.status }
    : { nazev_pripadu: "", poznamka: "", status: "aktivni" };

  const MONTH_NAMES = [
    "Leden",
    "Únor",
    "Březen",
    "Duben",
    "Květen",
    "Červen",
    "Červenec",
    "Srpen",
    "Září",
    "Říjen",
    "Listopad",
    "Prosinec",
  ];

  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const mobilePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobilePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (mobilePickerRef.current && !mobilePickerRef.current.contains(e.target as Node)) setMobilePickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobilePickerOpen]);

  // ── Render ──
  return (
    <div
      className={isMobile ? "mobile-page" : "space-y-6"}
      style={
        isMobile
          ? {
              paddingBottom: 200,
              ...(!mobileEmbedded
                ? { paddingTop: "max(32px, calc(env(safe-area-inset-top, 32px) + 16px))" }
                : { paddingTop: 8 }),
            }
          : undefined
      }
    >
      {isMobile ? (
        <>
          {/* Mobile header — hide when embedded */}
          {!mobileEmbedded && (
            <div style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
                <h1 className="font-heading font-bold flex-1" style={{ fontSize: 22, color: "var(--text-primary)" }}>
                  Můj byznys
                </h1>
              </div>
            </div>
          )}

          {/* Tab bar — hide when embedded in MobileObchod */}
          {!mobileEmbedded && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{
              display: "flex",
              background: isDark ? "rgba(255,255,255,0.06)" : "#eef3f4",
              borderRadius: 14,
              padding: 4,
              gap: 4,
              width: "100%",
            }}>
              {([
                { key: "schuzky" as const, label: "Schůzky", icon: <CalendarIcon size={14} /> },
                { key: "pripady" as const, label: "Byznys případy", icon: <Briefcase size={14} /> },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: activeTab === tab.key ? 700 : 500,
                    fontFamily: "Poppins, sans-serif",
                    background: activeTab === tab.key
                      ? (isDark ? "rgba(0,171,189,0.2)" : "#ffffff")
                      : "transparent",
                    color: activeTab === tab.key
                      ? (isDark ? "#4dd8e8" : "#00555f")
                      : (isDark ? "#7aadb3" : "#6b8a8f"),
                    boxShadow: activeTab === tab.key
                      ? (isDark ? "none" : "0 1px 4px rgba(0,0,0,0.08)")
                      : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ position: "relative" }}>
                    {tab.icon}
                    {tab.key === "schuzky" && unrecordedCount > 0 && (
                      <span style={{ position: "absolute", top: -2, right: -6, width: 7, height: 7, borderRadius: "50%", background: "#fc7c71" }} />
                    )}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {activeTab === "schuzky" && (<>
          {/* Unrecorded meetings banner — mobile */}
          {unrecordedCount > 0 && showUnrecordedBanner && (
            <div
              style={{
                margin: "0 0 12px",
                padding: "10px 14px",
                borderRadius: 14,
                background: isDark ? "rgba(252,124,113,0.12)" : "rgba(252,124,113,0.08)",
                border: `1px solid ${isDark ? "rgba(252,124,113,0.25)" : "rgba(252,124,113,0.2)"}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <AlertCircle size={16} color="#fc7c71" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, fontFamily: "Poppins, sans-serif", color: isDark ? "#fc7c71" : "#c0392b" }}>
                {unrecordedCount} {unrecordedCount === 1 ? "schůzka bez výsledku" : unrecordedCount < 5 ? "schůzky bez výsledku" : "schůzek bez výsledku"}
              </span>
              <button
                onClick={() => setShowUnrecordedModal(true)}
                style={{
                  fontSize: 11, fontWeight: 700, fontFamily: "Poppins, sans-serif",
                  color: "#fc7c71", background: "none", border: "none", cursor: "pointer",
                  textDecoration: "underline", whiteSpace: "nowrap",
                }}
              >
                Zobrazit
              </button>
              <button
                onClick={() => setShowUnrecordedBanner(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
              >
                <X size={14} color={isDark ? "#7aadb3" : "#8aadb3"} />
              </button>
            </div>
          )}
          {/* Fixed: day picker + add meeting button */}
          <div
            style={{
              position: "fixed",
              bottom: 120,
              left: 16,
              right: 16,
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setEditMeeting(null);
                  setPreCaseId("");
                  setMeetingModalOpen(true);
                }}
                className="btn btn-primary btn-md flex items-center justify-center gap-2"
                style={{ flex: 1, boxShadow: "0 -2px 16px rgba(0,0,0,0.06)" }}
              >
                <Plus size={18} />
                Přidat schůzku
              </button>
              <button
                onClick={() => !isSameDay(selectedDate, new Date()) && setSelectedDate(new Date())}
                disabled={isSameDay(selectedDate, new Date())}
                style={{
                  height: 40, padding: "0 16px", borderRadius: 12, border: "none",
                  background: isSameDay(selectedDate, new Date()) ? (isDark ? "rgba(255,255,255,0.08)" : "#dde8ea") : "#00abbd",
                  color: isSameDay(selectedDate, new Date()) ? (isDark ? "rgba(255,255,255,0.3)" : "#a0b4b8") : "#fff",
                  fontWeight: 600, fontSize: 13, cursor: isSameDay(selectedDate, new Date()) ? "default" : "pointer",
                  fontFamily: "Poppins, sans-serif",
                  boxShadow: isSameDay(selectedDate, new Date()) ? "none" : "0 -2px 16px rgba(0,0,0,0.06)",
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}
              >
                Dnes
              </button>
            </div>
            <div
              ref={mobilePickerRef}
              style={{
                background: isDark ? "rgba(9,29,33,0.85)" : "rgba(255,255,255,0.92)",
                backdropFilter: "blur(20px) saturate(1.8)",
                WebkitBackdropFilter: "blur(20px) saturate(1.8)",
                borderRadius: 16,
                padding: "10px 16px",
                border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(225,233,235,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              <button
                onClick={() => setSelectedDate((d) => subDays(d, 1))}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea",
                  border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ChevronLeft size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
              </button>
              <button
                onClick={() => setMobilePickerOpen((o) => !o)}
                style={{
                  textAlign: "center", background: "none", border: "none",
                  cursor: "pointer", padding: "4px 8px", borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>
                  {isSameDay(selectedDate, new Date()) ? "Dnes" : format(selectedDate, "EEEE", { locale: cs })}
                </div>
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
                  {format(selectedDate, "d. MMMM yyyy", { locale: cs })}
                </div>
              </button>
              <button
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea",
                  border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ChevronRight size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
              </button>

              {/* Calendar popup */}
              {mobilePickerOpen && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                  background: isDark ? "#0a1f23" : "#fff", borderRadius: 14,
                  border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e1e9eb",
                  boxShadow: "0 -8px 24px rgba(0,0,0,0.08)", overflow: "hidden",
                }}>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    month={selectedDate}
                    onMonthChange={() => {}}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setMobilePickerOpen(false);
                      }
                    }}
                    locale={cs}
                    weekStartsOn={1}
                    className="p-3 pointer-events-auto"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mobile meetings list for selected day */}
          {meetingsForDay.length === 0 ? (
            <div className="legatus-card p-8 text-center text-muted-foreground font-body text-sm">
              Žádné schůzky pro tento den.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {meetingsForDay.map((m) => {
                const caseObj = cases.find((c) => c.id === m.case_id);
                return (
                  <div
                    key={m.id}
                    className="legatus-card cursor-pointer"
                    style={{ padding: "12px 16px", opacity: m.cancelled ? 0.5 : 1 }}
                    onClick={() => setDetailMeeting(m)}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={meetingTypeBadgeStyle(m.meeting_type, m.cancelled)}
                      >
                        {meetingTypeLabel(m.meeting_type)}
                      </span>
                      <span className="font-heading font-semibold text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                        {m.case_name || caseObj?.nazev_pripadu || "—"}
                      </span>
                      {m.cancelled && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#ef4444", background: "rgba(239,68,68,0.12)", borderRadius: 8, padding: "2px 8px" }}>Zrušená</span>
                      )}
                      {!m.cancelled && m.outcome_recorded && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#22c55e", background: "rgba(34,197,94,0.12)", borderRadius: 8, padding: "2px 8px" }}>Proběhlá</span>
                      )}
                      {!m.outcome_recorded && !m.cancelled && m.date <= format(new Date(), "yyyy-MM-dd") && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f97316" }} />
                      )}
                    </div>
                    {m.case_name && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary, #6b8a8e)", marginTop: 4, marginLeft: 2 }}>
                        {m.case_name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </>)}
          {activeTab === "aktivity" && <MojeAktivityContent />}
        </>
      ) : (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {/* Desktop header */}
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div className="flex items-center gap-3">
              <Briefcase className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
              <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
                Můj byznys
              </h1>
            </div>
          </div>

          {/* Tab bar — matching mobile style */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{
              display: "flex",
              background: isDark ? "rgba(255,255,255,0.06)" : "#eef3f4",
              borderRadius: 14,
              padding: 4,
              gap: 4,
              width: "100%",
              maxWidth: 520,
            }}>
              {([
                { key: "schuzky" as const, label: "Schůzky", icon: <CalendarIcon size={15} /> },
                { key: "pripady" as const, label: "Byznys případy", icon: <Briefcase size={15} /> },
                { key: "aktivity" as const, label: "Aktivity", icon: <BarChart3 size={15} /> },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "9px 14px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: activeTab === tab.key ? 700 : 500,
                    fontFamily: "Poppins, sans-serif",
                    background: activeTab === tab.key
                      ? (isDark ? "rgba(0,171,189,0.2)" : "#ffffff")
                      : "transparent",
                    color: activeTab === tab.key
                      ? (isDark ? "#4dd8e8" : "#00555f")
                      : (isDark ? "#7aadb3" : "#6b8a8f"),
                    boxShadow: activeTab === tab.key
                      ? (isDark ? "none" : "0 1px 4px rgba(0,0,0,0.08)")
                      : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ position: "relative" }}>
                    {tab.icon}
                    {tab.key === "schuzky" && unrecordedCount > 0 && (
                      <span style={{ position: "absolute", top: -2, right: -6, width: 7, height: 7, borderRadius: "50%", background: "#fc7c71" }} />
                    )}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: Day picker + unrecorded banner for Schůzky tab */}
          {activeTab === "schuzky" && (
            <div style={{ marginBottom: 16 }}>
              {unrecordedCount > 0 && (
                <button
                  onClick={() => setShowUnrecordedModal(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 16px",
                    marginBottom: 12,
                    borderRadius: 14,
                    background: isDark ? "rgba(252,124,113,0.10)" : "rgba(252,124,113,0.06)",
                    border: `1px solid ${isDark ? "rgba(252,124,113,0.2)" : "rgba(252,124,113,0.15)"}`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <AlertCircle size={16} color="#fc7c71" />
                  <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "Poppins, sans-serif", color: isDark ? "#fc7c71" : "#c0392b" }}>
                    {unrecordedCount} {unrecordedCount === 1 ? "schůzka bez výsledku" : unrecordedCount < 5 ? "schůzky bez výsledku" : "schůzek bez výsledku"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fc7c71", fontFamily: "Poppins, sans-serif" }}>
                    Zobrazit vše →
                  </span>
                </button>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* View mode dropdown: Den / Týden / Měsíc — styled to match PeriodNavigator (Dashboard) */}
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
                      fontSize: 14,
                      color: "var(--text-primary)",
                    }}
                  >
                    <span>{viewMode === "day" ? "Den" : viewMode === "week" ? "Týden" : "Měsíc"}</span>
                    <ChevronDown
                      size={14}
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
                          minWidth: 140,
                          overflow: "hidden",
                        }}
                      >
                        {(["day", "week", "month"] as const).map((m) => (
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
                            {m === "day" ? "Den" : m === "week" ? "Týden" : "Měsíc"}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                  <PeriodNavigator
                    label={schuzkyHeaderNav.label}
                    title={schuzkyHeaderNav.title}
                    subtitle={(schuzkyHeaderNav as { subtitle?: string }).subtitle}
                    onPrev={schuzkyHeaderNav.onPrev}
                    onNext={schuzkyHeaderNav.onNext}
                    selectedDate={schuzkyHeaderNav.selectedDate}
                    calendarMonth={schuzkyHeaderNav.calendarMonth}
                    onSelectDate={schuzkyHeaderNav.onSelectDate}
                    pickerMode={schuzkyHeaderNav.pickerMode}
                    widthScale={1.2}
                  />
                </div>
                <button
                  onClick={() => {
                    setEditMeeting(null);
                    setPreCaseId("");
                    setMeetingModalOpen(true);
                  }}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  <Plus size={14} /> Nová schůzka
                </button>
              </div>

              {/* Filtry: typ schůzky + zobrazit zrušené */}
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
                  border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e1e9eb",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDark ? "#7aadb3" : "#6b8a8f",
                    fontFamily: "Poppins, sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Typ:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ALL_FILTER_TYPES.map((t) => {
                    const checked = typeFilter.has(t);
                    const typeColor = MEETING_TYPE_COLORS[t];
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          setTypeFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(t)) next.delete(t); else next.add(t);
                            return next;
                          });
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: checked
                            ? `1px solid ${typeColor}`
                            : (isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #d8e2e4"),
                          background: checked
                            ? `${typeColor}1f`
                            : "transparent",
                          color: checked
                            ? typeColor
                            : (isDark ? "#a8c8cc" : "#6b8a8f"),
                          fontFamily: "Poppins, sans-serif",
                          fontWeight: checked ? 700 : 500,
                          fontSize: 12.5,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            border: checked ? `1px solid ${typeColor}` : "1px solid #c4d0d3",
                            background: checked ? typeColor : "transparent",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 10,
                            lineHeight: 1,
                          }}
                        >
                          {checked ? "✓" : ""}
                        </span>
                        {meetingTypeLabel(t)}
                      </button>
                    );
                  })}
                </div>

                <div style={{ flex: 1 }} />

                {/* Toggle: zobrazit zrušené */}
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: isDark ? "#a8c8cc" : "#6b8a8f",
                  }}
                >
                  <span>Zobrazit zrušené</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showCancelled}
                    onClick={() => setShowCancelled((v) => !v)}
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 999,
                      border: "none",
                      cursor: "pointer",
                      background: showCancelled ? "#00abbd" : (isDark ? "rgba(255,255,255,0.15)" : "#d8e2e4"),
                      position: "relative",
                      transition: "background 0.2s",
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: showCancelled ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 0.2s",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </label>
              </div>
            </div>
          )}

          {/* Desktop: Month navigator for Byznys případy tab */}
          {activeTab === "pripady" && (
            <div style={{ marginBottom: 16 }}>
              <PeriodNavigator
                label="Produkční období"
                title={`${MONTH_NAMES[selectedMonth]} ${selectedYear}`}
                subtitle={`${format(periodRange.start, "d. M.", { locale: cs })} – ${format(periodRange.end, "d. M. yyyy", { locale: cs })}`}
                onPrev={() => {
                  if (selectedMonth === 0) { setSelectedYear((y) => y - 1); setSelectedMonth(11); }
                  else { setSelectedMonth((m) => m - 1); }
                }}
                onNext={() => {
                  if (selectedMonth === 11) { setSelectedYear((y) => y + 1); setSelectedMonth(0); }
                  else { setSelectedMonth((m) => m + 1); }
                }}
                selectedDate={new Date(selectedYear, selectedMonth, 1)}
                calendarMonth={new Date(selectedYear, selectedMonth, 1)}
                onSelectDate={(date) => {
                  const period = getProductionPeriodMonth(date);
                  setSelectedYear(period.year);
                  setSelectedMonth(period.month);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Desktop Schůzky: meetings for selected day */}
      {!isMobile && activeTab === "schuzky" && (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {meetingsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : meetingsForDayDesktop.length === 0 ? (
            <div className="legatus-card p-8 text-center text-muted-foreground font-body text-sm">
              {meetingsForDay.length === 0
                ? (viewMode === "day" ? "Žádné schůzky pro tento den." : viewMode === "week" ? "Žádné schůzky pro tento týden." : "Žádné schůzky pro tento měsíc.")
                : "Žádné schůzky neodpovídají filtrům."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {meetingsForDayDesktop.map((m) => {
                const caseObj = cases.find((c) => c.id === m.case_id);
                return (
                  <div
                    key={m.id}
                    className="legatus-card cursor-pointer hover:shadow-md transition-shadow"
                    style={{ padding: "12px 16px", opacity: m.cancelled ? 0.5 : 1 }}
                    onClick={() => setDetailMeeting(m)}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={meetingTypeBadgeStyle(m.meeting_type, m.cancelled)}
                      >
                        {meetingTypeLabel(m.meeting_type)}
                      </span>
                      {viewMode !== "day" && (
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{
                            background: isDark ? "rgba(255,255,255,0.06)" : "#eef3f4",
                            color: isDark ? "#7aadb3" : "#6b8a8f",
                            fontFamily: "Poppins, sans-serif",
                          }}
                        >
                          {format(parseISO(m.date), "d.M.", { locale: cs })}
                        </span>
                      )}
                      <span className="font-heading font-semibold text-sm flex-1" style={{ color: "var(--text-primary)" }}>
                        {m.case_name || caseObj?.nazev_pripadu || "—"}
                      </span>
                      {!m.outcome_recorded && !m.cancelled && m.date <= format(new Date(), "yyyy-MM-dd") && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f97316" }} />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(m.id); }}
                        className="p-1 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: "#fc7c71" }} />
                      </button>
                    </div>
                    {(m.location_type || totalRefs(m) > 0 || m.podepsane_bj > 0) && (
                      <div className="flex items-center gap-2 mt-2 ml-0.5">
                        {m.location_type && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin size={11} /> {m.location_type === "online" ? "Online" : m.location_detail || m.location_type}
                          </span>
                        )}
                        {totalRefs(m) > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,171,189,0.12)", color: "#00abbd" }}>
                            {totalRefs(m)} dop.
                          </span>
                        )}
                        {m.podepsane_bj > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,85,95,0.10)", color: "#00555f" }}>
                            {m.podepsane_bj} BJ
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "pripady" && (<div style={{ maxWidth: isMobile ? undefined : 800, margin: isMobile ? undefined : "0 auto" }}>
      {/* Cases accordion list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cases.length === 0 ? (
        <div className="legatus-card p-8 text-center text-muted-foreground font-body text-sm">
          Zatím žádné Můj byznys. Nový případ se vytvoří automaticky při založení schůzky.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c) => (
            <CaseAccordion
              key={c.id}
              c={c}
              meetings={meetingsByCase[c.id] || []}
              onAddActivity={() => openAddMeeting(c.id)}
              onEditCase={() => openEditCase(c)}
              onClickMeeting={(m) => setDetailMeeting(m)}
              onDeleteMeeting={(id) => setConfirmDeleteId(id)}
            />
          ))}
        </div>
      )}

      </div>)}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteId(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-xs bg-card rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Smazat schůzku?
            </h2>
            <p className="text-sm text-muted-foreground mb-5">Tato akce je nevratná.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Zrušit
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="flex-1 h-10 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: "#fc7c71" }}
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Case modal */}
      <CaseModal
        open={caseModalOpen}
        onClose={() => {
          setCaseModalOpen(false);
          setEditCase(null);
        }}
        initial={caseInitialForm}
        onSave={(d) => saveCaseMutation.mutate({ data: d, id: editCase?.id })}
        saving={saveCaseMutation.isPending}
      />

      {/* Meeting detail modal */}
      <MeetingDetailModal
        open={!!detailMeeting}
        onClose={() => setDetailMeeting(null)}
        meeting={detailMeeting}
        onSaveOutcome={(meetingId, data) => outcomeMutation.mutate({ meetingId, data })}
        savingOutcome={outcomeMutation.isPending}
        onEdit={() => {
          if (detailMeeting) {
            openEditMeeting(detailMeeting);
            setDetailMeeting(null);
          }
        }}
        onCancel={() => {
          if (detailMeeting) {
            const cancelForm: MeetingForm = {
              ...meetingToForm(detailMeeting),
              cancelled: true,
            };
            saveMeetingMutation.mutate({ form: cancelForm, id: detailMeeting.id, skipFollowUp: true });
          }
        }}
        onScheduleFollowUp={(data) => {
          if (detailMeeting) {
            const form: MeetingForm = {
              ...defaultMeetingForm(data.date),
              meeting_type: data.meeting_type as MeetingType,
              case_id: detailMeeting.case_id || "",
              case_name: detailMeeting.case_name || "",
              parent_meeting_id: detailMeeting.id,
            };
            saveMeetingMutation.mutate({ form, skipFollowUp: true });
            setDetailMeeting(null);
          }
        }}
      />

      {/* Meeting form modal */}
      <MeetingFormModal
        open={meetingModalOpen}
        onClose={() => {
          setMeetingModalOpen(false);
          setEditMeeting(null);
        }}
        initial={meetingInitialForm}
        onSave={(form) => saveMeetingMutation.mutate({ form, id: editMeeting?.id })}
        saving={saveMeetingMutation.isPending}
        cases={cases}
        isEdit={!!editMeeting}
        userRole={profile?.role}
        onDelete={
          editMeeting
            ? () => {
                deleteMutation.mutate(editMeeting.id);
                setMeetingModalOpen(false);
                setEditMeeting(null);
              }
            : undefined
        }
      />

      {/* Follow-up suggestion modal */}
      <FollowUpModal
        open={!!followUp}
        onClose={() => setFollowUp(null)}
        caseName={followUp?.caseName || ""}
        caseId={followUp?.caseId || ""}
        meetingType={followUp?.meetingType || "FSA"}
        parentMeetingId={followUp?.parentMeetingId ?? null}
        onSchedule={async (data) => {
          const form: MeetingForm = {
            ...defaultForm(data.case_id),
            meeting_type: data.meeting_type,
            date: data.date,
            location_type: data.location_type,
            location_detail: data.location_detail,
            parent_meeting_id: data.parent_meeting_id ?? null,
          };
          await new Promise<void>((resolve, reject) => {
            saveMeetingMutation.mutate(
              { form, skipFollowUp: true },
              {
                onSuccess: () => resolve(),
                onError: (err) => reject(err),
              },
            );
          });
        }}
      />

      {activeTab === "aktivity" && (
        <div style={{ maxWidth: isMobile ? undefined : 800, margin: isMobile ? undefined : "0 auto" }}>
          <MojeAktivityContent />
        </div>
      )}

      {/* Unrecorded meetings modal */}
      {showUnrecordedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowUnrecordedModal(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl mx-4 animate-in fade-in zoom-in-95 duration-150"
            style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px 20px 12px", borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #eef3f4", display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={18} color="#fc7c71" />
              <h2 className="font-heading font-bold flex-1" style={{ fontSize: 17, color: "var(--text-primary)" }}>
                Schůzky bez výsledku
              </h2>
              <button onClick={() => setShowUnrecordedModal(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={18} color={isDark ? "#7aadb3" : "#8aadb3"} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
              {unrecordedMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Všechny schůzky mají vyplněný výsledek 🎉</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {unrecordedMeetings.map((m) => (
                    <div
                      key={m.id}
                      className="legatus-card cursor-pointer hover:shadow-md transition-shadow"
                      style={{ padding: "10px 14px" }}
                      onClick={() => {
                        setShowUnrecordedModal(false);
                        // Find the full meeting object from existing data or navigate
                        const fullMeeting = meetings?.find((am: any) => am.id === m.id);
                        if (fullMeeting) {
                          setDetailMeeting(fullMeeting);
                        } else {
                          // Navigate to the date
                          setSelectedDate(parseISO(m.date));
                          setActiveTab("schuzky");
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={meetingTypeBadgeStyle(m.meeting_type as MeetingType, false)}
                        >
                          {meetingTypeLabel(m.meeting_type as MeetingType)}
                        </span>
                        <span className="font-heading font-semibold text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                          {m.case_name || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(parseISO(m.date), "d. M.", { locale: cs })}
                        </span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f97316" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
