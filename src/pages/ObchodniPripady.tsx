import { useState, useMemo, useEffect, useRef } from "react";
import { MojeAktivityContent } from "@/pages/MojeAktivity";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { getProductionPeriodForMonth, getProductionPeriodMonth } from "@/lib/productionPeriod";
import { ProductionMonthPicker } from "@/components/ProductionMonthPicker";
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
  Calendar,
  BarChart3,
} from "lucide-react";
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
import { MeetingDetailModal } from "@/components/MeetingDetailModal";

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
});

// ─── Helper components ───────────────────────────────────────────────────────

function totalRefs(m: Meeting): number {
  return (m.doporuceni_fsa || 0) + (m.doporuceni_poradenstvi || 0) + (m.doporuceni_pohovor || 0);
}

function meetingTypeBadgeStyle(t: MeetingType, cancelled: boolean) {
  if (cancelled) return { background: "#e5e7eb", color: "#6b7280" };
  if (t === "FSA") return { background: "#e0f5f7", color: "#00737f" };
  if (t === "POR") return { background: "#e8f5e9", color: "#2e7d32" };
  if (t === "POH") return { background: "#fef9e7", color: "#92700c" };
  if (t === "NAB") return { background: "#f3e8ff", color: "#7e22ce" };
  return { background: "#fef3f2", color: "#c0392b" };
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
                  {m.cancelled ? "Zrušená" : format(parseISO(m.date), "d. M. yyyy", { locale: cs })}
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
  const [followUp, setFollowUp] = useState<{ caseId: string; caseName: string; meetingType: MeetingType } | null>(null);
  const [activeTab, setActiveTab] = useState<"schuzky" | "pripady" | "aktivity">("schuzky");

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
      };
      if (id) {
        const { error } = await supabase
          .from("client_meetings")
          .update(payload as any)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_meetings").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
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
        setFollowUp({ caseId: savedCaseId, caseName: savedCase.nazev_pripadu, meetingType: savedForm.meeting_type });
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
      setDetailMeeting(null);
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

          {/* Tab bar */}
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
                { key: "schuzky" as const, label: "Schůzky", icon: <Calendar size={14} /> },
                { key: "pripady" as const, label: "Byznys případy", icon: <Briefcase size={14} /> },
                { key: "aktivity" as const, label: "Aktivity", icon: <BarChart3 size={14} /> },
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
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "schuzky" && (<>
          {/* Fixed: Create case button + period bar */}
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
                onClick={() => {
                  if (selectedMonth === 0) {
                    setSelectedYear((y) => y - 1);
                    setSelectedMonth(11);
                  } else {
                    setSelectedMonth((m) => m - 1);
                  }
                }}
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
              <button
                onClick={() => setMobilePickerOpen((o) => !o)}
                style={{
                  textAlign: "center",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>Produkční období</div>
                <div
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    color: "var(--text-primary)",
                  }}
                >
                  {MONTH_NAMES[selectedMonth]} {selectedYear}
                </div>
              </button>
              <button
                onClick={() => {
                  if (selectedMonth === 11) {
                    setSelectedYear((y) => y + 1);
                    setSelectedMonth(0);
                  } else {
                    setSelectedMonth((m) => m + 1);
                  }
                }}
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
                <ChevronRight size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
              </button>
              {mobilePickerOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: isDark ? "#0a1f23" : "#fff",
                    borderRadius: 14,
                    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e1e9eb",
                    boxShadow: "0 -8px 24px rgba(0,0,0,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #eef3f4",
                    }}
                  >
                    <button
                      onClick={() => setSelectedYear((y) => y - 1)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: "none",
                        background: isDark ? "rgba(255,255,255,0.1)" : "#eef3f4",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronLeft size={14} color={isDark ? "#4dd8e8" : "#00555f"} />
                    </button>
                    <span
                      style={{
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 700,
                        fontSize: 15,
                        color: "var(--text-primary)",
                      }}
                    >
                      {selectedYear}
                    </span>
                    <button
                      onClick={() => setSelectedYear((y) => y + 1)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: "none",
                        background: isDark ? "rgba(255,255,255,0.1)" : "#eef3f4",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronRight size={14} color={isDark ? "#4dd8e8" : "#00555f"} />
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: 8 }}>
                    {MONTH_NAMES.map((name, idx) => {
                      const isSelected = idx === selectedMonth;
                      const isCurrent = selectedYear === currentPeriod.year && idx === currentPeriod.month;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedMonth(idx);
                            setMobilePickerOpen(false);
                          }}
                          style={{
                            padding: "8px 4px",
                            borderRadius: 10,
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "Open Sans, sans-serif",
                            fontSize: 13,
                            fontWeight: isSelected ? 700 : 500,
                            background: isSelected ? "#00abbd" : "transparent",
                            color: isSelected ? "#fff" : isCurrent ? "#00abbd" : "var(--text-primary)",
                            transition: "background 0.15s, color 0.15s",
                          }}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
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
                { key: "schuzky" as const, label: "Schůzky", icon: <Calendar size={15} /> },
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
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: Period picker (shown for schuzky & pripady tabs) */}
          {activeTab !== "aktivity" && (
            <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 16 }}>
              <ProductionMonthPicker
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onChange={(y, m) => {
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }}
              />
              <span className="font-body text-xs text-muted-foreground">
                {format(periodRange.start, "d. M.", { locale: cs })} –{" "}
                {format(periodRange.end, "d. M. yyyy", { locale: cs })}
              </span>
              <div className="flex-1" />
            </div>
          )}
        </div>
      )}

      {(activeTab === "schuzky" || activeTab === "pripady") && (<>
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
        onSchedule={async (data) => {
          const form: MeetingForm = {
            ...defaultForm(data.case_id),
            meeting_type: data.meeting_type,
            date: data.date,
            location_type: data.location_type,
            location_detail: data.location_detail,
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
      </>)}

      {activeTab === "aktivity" && (
        <div style={{ maxWidth: isMobile ? undefined : 800, margin: isMobile ? undefined : "0 auto" }}>
          <MojeAktivityContent />
        </div>
      )}
    </div>
  );
}
