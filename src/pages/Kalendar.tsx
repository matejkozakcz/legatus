import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, isSameDay, isSameMonth, getDay, startOfDay, getDaysInMonth } from "date-fns";
import { cs } from "date-fns/locale";
import {
  Plus, X, Loader2, Pencil, ChevronLeft, ChevronRight, Calendar, Clock, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";

// ─── Types ───────────────────────────────────────────────────────────────────

type MeetingType = "FSA" | "POH" | "SER";

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
}

interface Case {
  id: string;
  user_id: string;
  nazev_pripadu: string;
  status: string;
  poznamka: string | null;
  created_at: string;
}

interface MeetingForm {
  date: string;
  meeting_type: MeetingType;
  cancelled: boolean;
  potencial_bj: string;
  has_poradenstvi: boolean;
  podepsane_bj: string;
  doporuceni_poradenstvi: string;
  poradenstvi_date: string;
  poradenstvi_status: "probehle" | "zrusene" | null;
  has_pohovor: boolean;
  pohovor_jde_dal: boolean | null;
  doporuceni_pohovor: string;
  pohovor_date: string;
  doporuceni_fsa: string;
  poznamka: string;
  case_name: string;
  case_id: string;
  meeting_time: string;
  duration_minutes: string;
  location_type: string;
  location_detail: string;
}

const defaultForm = (date?: string, time?: string): MeetingForm => ({
  date: date || format(new Date(), "yyyy-MM-dd"),
  meeting_type: "FSA",
  cancelled: false,
  potencial_bj: "",
  has_poradenstvi: false,
  podepsane_bj: "",
  doporuceni_poradenstvi: "0",
  poradenstvi_date: "",
  poradenstvi_status: null,
  has_pohovor: false,
  pohovor_jde_dal: null,
  doporuceni_pohovor: "0",
  pohovor_date: "",
  doporuceni_fsa: "0",
  poznamka: "",
  case_name: "",
  case_id: "",
  meeting_time: time || "",
  duration_minutes: "60",
  location_type: "",
  location_detail: "",
});

// ─── Color mapping by meeting type ──────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  FSA: { bg: "rgba(0,171,189,0.15)", border: "#00abbd", text: "#00737f" },
  POH: { bg: "rgba(59,130,246,0.15)", border: "#3b82f6", text: "#1e40af" },
  SER: { bg: "rgba(249,115,22,0.15)", border: "#f97316", text: "#9a3412" },
  Analyza: { bg: "rgba(139,92,246,0.15)", border: "#8b5cf6", text: "#5b21b6" },
  Poradko: { bg: "rgba(34,197,94,0.15)", border: "#22c55e", text: "#15803d" },
};

function getTypeColor(type: string) {
  return TYPE_COLORS[type] || TYPE_COLORS.FSA;
}

function meetingTypeLabel(t: MeetingType): string {
  return t === "FSA" ? "Analýza" : t === "POH" ? "Pohovor" : "Servis";
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const SLOT_HEIGHT = 40; // px per 30 min
const VISIBLE_HOURS = 5;
const GRID_VISIBLE_HEIGHT = SLOT_HEIGHT * 2 * VISIBLE_HOURS; // 400px

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{ background: checked ? "#00abbd" : "#d1dfe2" }}>
        <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(1.375rem)" : "translateX(0.25rem)" }} />
      </button>
    </div>
  );
}

function NumberInput({ label, value, onChange, min = 0, step = 1, placeholder = "0" }: {
  label: string; value: string; onChange: (v: string) => void; min?: number; step?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input type="number" min={min} step={step} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}

// ─── Detail Modal ────────────────────────────────────────────────────────────

function MeetingDetailModal({ open, onClose, meeting, onEdit }: {
  open: boolean; onClose: () => void; meeting: Meeting | null; onEdit: () => void;
}) {
  if (!open || !meeting) return null;
  const m = meeting;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Detail schůzky</h2>
        <div className="space-y-0">
          {row("Datum", m.cancelled ? "Zrušená" : format(parseISO(m.date), "d. M. yyyy", { locale: cs }))}
          {m.meeting_time && row("Čas", m.meeting_time.slice(0, 5))}
          {m.duration_minutes != null && row("Délka", `${m.duration_minutes} min`)}
          {row("Typ", meetingTypeLabel(m.meeting_type))}
          {m.location_type && row("Místo", m.location_type === "osobne" ? "Osobně" : "Online")}
          {m.location_detail && row(m.location_type === "osobne" ? "Adresa" : "Platforma", m.location_detail)}
          {m.cancelled && row("Stav", "Zrušená")}
          {!m.cancelled && m.meeting_type === "FSA" && m.potencial_bj != null && row("Potenciál BJ", m.potencial_bj)}
          {!m.cancelled && m.has_poradenstvi && (
            <>
              {row("Poradenství", m.poradenstvi_status === "probehle" ? "Proběhlé" : m.poradenstvi_status === "zrusene" ? "Zrušené" : "Ano")}
              {m.poradenstvi_date && row("Datum poradenství", format(parseISO(m.poradenstvi_date), "d. M. yyyy", { locale: cs }))}
              {row("Podepsané BJ", m.podepsane_bj)}
              {row("Doporučení (poradko)", m.doporuceni_poradenstvi)}
            </>
          )}
          {!m.cancelled && m.has_pohovor && (
            <>
              {row("Pohovor", m.pohovor_jde_dal === true ? "Jde dál" : m.pohovor_jde_dal === false ? "Nejde dál" : "Ano")}
              {m.pohovor_date && row("Datum pohovoru", format(parseISO(m.pohovor_date), "d. M. yyyy", { locale: cs }))}
              {row("Doporučení (pohovor)", m.doporuceni_pohovor)}
            </>
          )}
          {!m.cancelled && row("Doporučení (schůzka)", m.doporuceni_fsa)}
          {m.poznamka && row("Poznámka", m.poznamka)}
        </div>
        <button onClick={onEdit} className="btn btn-primary btn-md w-full flex items-center justify-center gap-2 mt-5">
          <Pencil className="h-4 w-4" /> Upravit schůzku
        </button>
      </div>
    </div>
  );
}

// ─── Meeting Form Modal with inline case creation ────────────────────────────

function CalendarMeetingModal({ open, onClose, initial, onSave, saving, cases, onCaseCreated }: {
  open: boolean; onClose: () => void; initial: MeetingForm;
  onSave: (form: MeetingForm) => void; saving: boolean; cases: Case[];
  onCaseCreated: (c: Case) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<MeetingForm>(initial);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCaseNote, setNewCaseNote] = useState("");
  const [creatingCase, setCreatingCase] = useState(false);

  useEffect(() => { setForm(initial); setShowNewCase(false); setNewCaseName(""); setNewCaseNote(""); }, [initial]);
  if (!open) return null;
  const set = (patch: Partial<MeetingForm>) => setForm((f) => ({ ...f, ...patch }));
  const activeCases = cases.filter((c) => c.status === "aktivni");

  const handleCreateCase = async () => {
    if (!newCaseName.trim() || !user) return;
    setCreatingCase(true);
    try {
      const { data, error } = await supabase.from("cases").insert({
        user_id: user.id, nazev_pripadu: newCaseName.trim(), poznamka: newCaseNote.trim() || null,
      }).select().single();
      if (error) throw error;
      onCaseCreated(data as unknown as Case);
      set({ case_id: data.id });
      setShowNewCase(false);
      toast.success("Případ vytvořen");
    } catch (err: any) {
      toast.error(err.message || "Chyba při vytváření případu");
    } finally {
      setCreatingCase(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>Nová schůzka</h2>

        {/* Case selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Obchodní případ *</label>
          <select value={form.case_id} onChange={(e) => {
            if (e.target.value === "__new__") { setShowNewCase(true); set({ case_id: "" }); }
            else { setShowNewCase(false); set({ case_id: e.target.value }); }
          }}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">— Vyber případ —</option>
            {activeCases.map((c) => <option key={c.id} value={c.id}>{c.nazev_pripadu}</option>)}
            <option value="__new__">+ Nový případ</option>
          </select>
        </div>

        {showNewCase && (
          <div className="mb-4 p-3 rounded-xl border border-input space-y-2">
            <input type="text" value={newCaseName} onChange={(e) => setNewCaseName(e.target.value)}
              placeholder="Název případu *"
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="text" value={newCaseNote} onChange={(e) => setNewCaseNote(e.target.value)}
              placeholder="Poznámka (volitelné)"
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={handleCreateCase} disabled={creatingCase || !newCaseName.trim()}
              className="btn btn-primary btn-sm w-full flex items-center justify-center gap-1 text-xs">
              {creatingCase && <Loader2 className="h-3 w-3 animate-spin" />} Vytvořit případ
            </button>
          </div>
        )}

        {/* Date + Time */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Čas schůzky</label>
            <input type="time" value={form.meeting_time} onChange={(e) => set({ meeting_time: e.target.value })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex-1">
            <NumberInput label="Délka (min)" value={form.duration_minutes} onChange={(v) => set({ duration_minutes: v })} />
          </div>
        </div>

        {/* Location */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Místo</label>
          <div className="flex gap-2 mb-2">
            {(["osobne", "online"] as const).map((lt) => (
              <button key={lt} type="button" onClick={() => set({ location_type: form.location_type === lt ? "" : lt })}
                className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${form.location_type === lt ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                style={form.location_type === lt ? { background: "#00abbd" } : {}}>
                {lt === "osobne" ? "Osobně" : "Online"}
              </button>
            ))}
          </div>
          {form.location_type && (
            <input type="text" value={form.location_detail} onChange={(e) => set({ location_detail: e.target.value })}
              placeholder={form.location_type === "osobne" ? "Adresa…" : "Platforma…"}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          )}
        </div>

        {/* Meeting type */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Typ schůzky</label>
          <div className="flex gap-2">
            {(["FSA", "POH", "SER"] as MeetingType[]).map((t) => (
              <button key={t} type="button" onClick={() => set({ meeting_type: t })}
                className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors ${form.meeting_type === t ? "border-transparent text-white" : "border-input bg-background text-muted-foreground hover:border-ring"}`}
                style={form.meeting_type === t ? { background: "#00abbd" } : {}}>
                {meetingTypeLabel(t)}
              </button>
            ))}
          </div>
        </div>

        {/* Extended fields */}
        {!form.cancelled && (
          <>
            {form.meeting_type === "FSA" && (
              <div className="mb-4 flex gap-3">
                <div className="flex-1"><NumberInput label="Potenciál BJ" value={form.potencial_bj} onChange={(v) => set({ potencial_bj: v })} step={0.5} /></div>
                <div className="flex-1"><NumberInput label="Doporučení" value={form.doporuceni_fsa} onChange={(v) => set({ doporuceni_fsa: v })} /></div>
              </div>
            )}
            <div className="mb-4"><Toggle checked={form.cancelled} onChange={(v) => set({ cancelled: v })} label="Zrušená schůzka" /></div>
            {form.meeting_type !== "POH" && (
              <div className="mb-4 p-3 rounded-xl border border-input">
                <Toggle checked={form.has_poradenstvi} onChange={(v) => set({ has_poradenstvi: v })} label="Poradenství" />
                {form.has_poradenstvi && (
                  <div className="mt-3 space-y-3 pl-1">
                    <div className="flex gap-2">
                      {(["probehle", "zrusene"] as const).map((s) => (
                        <button key={s} type="button" onClick={() => set({ poradenstvi_status: form.poradenstvi_status === s ? null : s })}
                          className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${form.poradenstvi_status === s ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                          style={form.poradenstvi_status === s ? { background: s === "probehle" ? "#00abbd" : "#fc7c71" } : {}}>
                          {s === "probehle" ? "Proběhlé" : "Zrušené"}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Datum poradenství</label>
                      <input type="date" value={form.poradenstvi_date} onChange={(e) => set({ poradenstvi_date: e.target.value })}
                        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1"><NumberInput label="Podepsané BJ" value={form.podepsane_bj} onChange={(v) => set({ podepsane_bj: v })} step={0.5} /></div>
                      <div className="flex-1"><NumberInput label="Doporučení" value={form.doporuceni_poradenstvi} onChange={(v) => set({ doporuceni_poradenstvi: v })} /></div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="mb-4 p-3 rounded-xl border border-input">
              <Toggle checked={form.has_pohovor} onChange={(v) => set({ has_pohovor: v })} label="Pohovor" />
              {form.has_pohovor && (
                <div className="mt-3 space-y-3 pl-1">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Datum pohovoru</label>
                    <input type="date" value={form.pohovor_date} onChange={(e) => set({ pohovor_date: e.target.value })}
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="flex gap-2">
                    {[true, false].map((val) => (
                      <button key={String(val)} type="button" onClick={() => set({ pohovor_jde_dal: val })}
                        className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${form.pohovor_jde_dal === val ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                        style={form.pohovor_jde_dal === val ? { background: val ? "#00abbd" : "#fc7c71" } : {}}>
                        {val ? "Jde dál" : "Nejde dál"}
                      </button>
                    ))}
                  </div>
                  <NumberInput label="Doporučení" value={form.doporuceni_pohovor} onChange={(v) => set({ doporuceni_pohovor: v })} />
                </div>
              )}
            </div>
            {form.meeting_type !== "FSA" && (
              <div className="mb-4"><NumberInput label="Doporučení (schůzka)" value={form.doporuceni_fsa} onChange={(v) => set({ doporuceni_fsa: v })} /></div>
            )}
          </>
        )}

        {form.cancelled && (
          <div className="mb-4"><Toggle checked={form.cancelled} onChange={(v) => set({ cancelled: v })} label="Zrušená schůzka" /></div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Poznámka</label>
          <textarea value={form.poznamka} onChange={(e) => set({ poznamka: e.target.value })}
            rows={2} placeholder="Volitelné…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        </div>

        <button onClick={() => onSave(form)} disabled={saving || !form.case_id || (!form.cancelled && !form.date)}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Uložit
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Kalendar() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isMobile = useIsMobile();
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
  const [meetingFormInitial, setMeetingFormInitial] = useState<MeetingForm>(defaultForm());
  const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

  const [localCases, setLocalCases] = useState<Case[]>([]);
  useEffect(() => { setLocalCases(cases); }, [cases]);

  // Save meeting
  const saveMutation = useMutation({
    mutationFn: async (form: MeetingForm) => {
      if (!user) throw new Error("Not logged in");
      const weekStartDate = startOfWeek(parseISO(form.date), { weekStartsOn: 1 });
      const payload = {
        user_id: user.id,
        date: form.date,
        week_start: format(weekStartDate, "yyyy-MM-dd"),
        meeting_type: form.meeting_type,
        cancelled: form.cancelled,
        potencial_bj: form.potencial_bj ? parseFloat(form.potencial_bj) : null,
        has_poradenstvi: form.has_poradenstvi,
        podepsane_bj: form.podepsane_bj ? parseFloat(form.podepsane_bj) : 0,
        doporuceni_poradenstvi: parseInt(form.doporuceni_poradenstvi) || 0,
        poradenstvi_date: form.poradenstvi_date || null,
        poradenstvi_status: form.poradenstvi_status,
        has_pohovor: form.has_pohovor,
        pohovor_jde_dal: form.pohovor_jde_dal,
        doporuceni_pohovor: parseInt(form.doporuceni_pohovor) || 0,
        pohovor_date: form.pohovor_date || null,
        doporuceni_fsa: parseInt(form.doporuceni_fsa) || 0,
        poznamka: form.poznamka || null,
        case_id: form.case_id || null,
        case_name: form.case_name || null,
        meeting_time: form.meeting_time || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        location_type: form.location_type || null,
        location_detail: form.location_detail || null,
      };
      const { error } = await supabase.from("client_meetings").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar_meetings"] });
      setMeetingFormOpen(false);
      toast.success("Schůzka vytvořena");
    },
    onError: (err: any) => toast.error(err.message || "Chyba při ukládání"),
  });

  // Click on empty time slot
  const handleSlotClick = (dayIndex: number, hour: number, half: boolean) => {
    const day = addDays(weekStart, dayIndex);
    const time = `${String(hour).padStart(2, "0")}:${half ? "30" : "00"}`;
    setMeetingFormInitial(defaultForm(format(day, "yyyy-MM-dd"), time));
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
    for (const m of meetings) {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    }
    return map;
  }, [meetings]);

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

  // ─── Week View ─────────────────────────────────────────────────────────────

  const renderWeekView = () => (
    <div className="flex-1 overflow-auto rounded-2xl border border-border bg-card">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border sticky top-0 z-10 bg-card">
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

        {/* Time grid */}
        <div className="relative">
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: SLOT_HEIGHT * 2 }}>
              <div className="p-1 text-right pr-2 text-xs text-muted-foreground border-r border-border" style={{ height: SLOT_HEIGHT }}>
                {`${hour}:00`}
              </div>
              {weekDays.map((day, dayIdx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayMeetings = meetingsByDay[dateStr] || [];

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

                    {/* Meeting blocks — render only in the row matching the meeting's start hour */}
                    {dayMeetings.map((m) => {
                      if (!m.meeting_time) return null;
                      const [h, min] = m.meeting_time.split(":").map(Number);
                      if (h < 7 || h > 21) return null;
                      if (h !== hour) return null;
                      const topOffset = min * (SLOT_HEIGHT / 30);
                      const duration = m.duration_minutes || 60;
                      const blockHeight = Math.max(duration * (SLOT_HEIGHT / 30), SLOT_HEIGHT * 0.8);
                      const colors = getTypeColor(m.meeting_type);

                      return (
                        <div
                          key={m.id}
                          className="absolute left-1 right-1 rounded-lg px-1.5 py-0.5 cursor-pointer overflow-hidden z-10 hover:opacity-90 transition-opacity"
                          style={{
                            top: topOffset,
                            height: blockHeight,
                            background: isDark ? colors.bg.replace("0.15", "0.25") : colors.bg,
                            borderLeft: `3px solid ${colors.border}`,
                            fontSize: 11,
                          }}
                          onClick={(e) => { e.stopPropagation(); handleMeetingClick(m); }}
                        >
                          <div className="font-semibold truncate" style={{ color: isDark ? colors.border : colors.text }}>
                            {meetingTypeLabel(m.meeting_type)}
                          </div>
                          {blockHeight > 30 && m.case_name && (
                            <div className="truncate text-muted-foreground" style={{ fontSize: 10 }}>{m.case_name}</div>
                          )}
                          {blockHeight > 30 && (
                            <div className="text-muted-foreground" style={{ fontSize: 10 }}>
                              {m.meeting_time?.slice(0, 5)}
                              {m.cancelled && " • Zrušená"}
                            </div>
                          )}
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
      ? meetings.filter((m) => isSameDay(parseISO(m.date), selectedDay))
      : [];

    return (
      <div className="space-y-4">
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
                    {dayMeetings.slice(0, 3).map((m) => {
                      const colors = getTypeColor(m.meeting_type);
                      return (
                        <div key={m.id} className="w-2 h-2 rounded-full" style={{ background: colors.border }} />
                      );
                    })}
                    {dayMeetings.length > 3 && <span className="text-[9px] text-muted-foreground">+{dayMeetings.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected day meetings */}
        {selectedDay && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-heading font-semibold text-sm mb-3 text-foreground">
              {format(selectedDay, "EEEE d. MMMM yyyy", { locale: cs })}
            </h3>
            {selectedDayMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné schůzky</p>
            ) : (
              <div className="space-y-2">
                {selectedDayMeetings.map((m) => {
                  const colors = getTypeColor(m.meeting_type);
                  return (
                    <button key={m.id} onClick={() => handleMeetingClick(m)}
                      className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                      <div className="w-1 h-8 rounded-full" style={{ background: colors.border }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{meetingTypeLabel(m.meeting_type)}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.meeting_time?.slice(0, 5) || "—"} • {m.duration_minutes ? `${m.duration_minutes} min` : "—"}
                          {m.cancelled && " • Zrušená"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
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

  const mobileDayMeetings = useMemo(() => {
    return [...meetings]
      .filter((m) => m.date === mobileDayStr)
      .sort((a, b) => {
        const ta = a.meeting_time || "99:99";
        const tb = b.meeting_time || "99:99";
        return ta.localeCompare(tb);
      });
  }, [meetings, mobileDayStr]);

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
      <div className="mobile-page" style={{ paddingBottom: 180, paddingTop: "max(32px, calc(env(safe-area-inset-top, 32px) + 16px))" }}>
        {/* Header */}
        <div style={{ padding: "0 20px", marginBottom: 16, paddingTop: 16 }}>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            <h1 className="font-heading font-bold text-foreground" style={{ fontSize: 22 }}>Kalendář</h1>
          </div>
        </div>

        {/* Meeting list for the day */}
        <div style={{ padding: "0 16px" }}>
          {mobileDayMeetings.length === 0 ? (
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
                const colors = getTypeColor(m.meeting_type);
                return (
                  <div
                    key={m.id}
                    onClick={() => { setDetailMeeting(m); setDetailOpen(true); }}
                    style={{
                      background: isDark ? "rgba(9,29,33,0.6)" : "#fff",
                      borderRadius: 16,
                      border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e1e9eb",
                      borderLeft: `4px solid ${colors.border}`,
                      padding: "14px 16px",
                      cursor: "pointer",
                      opacity: m.cancelled ? 0.55 : 1,
                      transition: "transform 0.1s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 700,
                        fontSize: 15,
                        color: isDark ? colors.border : colors.text,
                      }}>
                        {meetingTypeLabel(m.meeting_type)}
                      </span>
                      {m.cancelled && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, color: "#fc7c71",
                          background: "rgba(252,124,113,0.12)", borderRadius: 8, padding: "2px 8px",
                        }}>
                          Zrušená
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      {m.meeting_time && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-secondary, #6b8a8e)" }}>
                          <Clock size={13} />
                          <span>{m.meeting_time.slice(0, 5)}</span>
                          {m.duration_minutes != null && <span style={{ fontSize: 11 }}>({m.duration_minutes} min)</span>}
                        </div>
                      )}
                      {m.location_type && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-secondary, #6b8a8e)" }}>
                          <MapPin size={13} />
                          <span>{m.location_type === "osobne" ? "Osobně" : "Online"}</span>
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

        {/* Floating day picker bar */}
        <div style={{ position: "fixed", bottom: 120, left: 16, right: 16, zIndex: 40 }}>
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
        <CalendarMeetingModal
          open={meetingFormOpen}
          onClose={() => setMeetingFormOpen(false)}
          initial={meetingFormInitial}
          onSave={(form) => saveMutation.mutate(form)}
          saving={saveMutation.isPending}
          cases={localCases}
          onCaseCreated={(c) => setLocalCases((prev) => [c, ...prev])}
        />
        <MeetingDetailModal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          meeting={detailMeeting}
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
                meeting_time: detailMeeting.meeting_time || "",
                duration_minutes: detailMeeting.duration_minutes?.toString() || "",
                location_type: detailMeeting.location_type || "",
                location_detail: detailMeeting.location_detail || "",
              });
              setMeetingFormOpen(true);
            }
          }}
        />
      </div>
    );
  }

  // ─── Desktop Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
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
      <CalendarMeetingModal
        open={meetingFormOpen}
        onClose={() => setMeetingFormOpen(false)}
        initial={meetingFormInitial}
        onSave={(form) => saveMutation.mutate(form)}
        saving={saveMutation.isPending}
        cases={localCases}
        onCaseCreated={(c) => setLocalCases((prev) => [c, ...prev])}
      />
      <MeetingDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        meeting={detailMeeting}
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
              meeting_time: detailMeeting.meeting_time || "",
              duration_minutes: detailMeeting.duration_minutes?.toString() || "",
              location_type: detailMeeting.location_type || "",
              location_detail: detailMeeting.location_detail || "",
            });
            setMeetingFormOpen(true);
          }
        }}
      />
    </div>
  );
}
