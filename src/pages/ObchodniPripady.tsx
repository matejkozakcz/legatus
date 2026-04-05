import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import {
  getProductionPeriodForMonth,
  getProductionPeriodMonth,
} from "@/lib/productionPeriod";
import { ProductionMonthPicker } from "@/components/ProductionMonthPicker";
import {
  Plus, X, Loader2, Pencil, Trash2, Briefcase, ChevronLeft, ChevronRight,
  ChevronDown, ChevronRight as ChevronRightIcon, Clock, MapPin,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";

// ─── Typy ────────────────────────────────────────────────────────────────────

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

type PoradkoStatus = "probehle" | "zrusene" | null;

interface MeetingForm {
  date: string;
  meeting_type: MeetingType;
  cancelled: boolean;
  potencial_bj: string;
  has_poradenstvi: boolean;
  podepsane_bj: string;
  doporuceni_poradenstvi: string;
  poradenstvi_date: string;
  poradenstvi_status: PoradkoStatus;
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

const defaultForm = (caseId?: string): MeetingForm => ({
  date: format(new Date(), "yyyy-MM-dd"),
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
  case_id: caseId || "",
  meeting_time: "",
  duration_minutes: "",
  location_type: "",
  location_detail: "",
});

// ─── Helper components ───────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</span>
      <button
        type="button" role="switch" aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{ background: checked ? "#00abbd" : "#d1dfe2" }}
      >
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

function totalRefs(m: Meeting): number {
  return (m.doporuceni_fsa || 0) + (m.doporuceni_poradenstvi || 0) + (m.doporuceni_pohovor || 0);
}

function meetingTypeLabel(t: MeetingType): string {
  return t === "FSA" ? "Analýza" : t === "POH" ? "Pohovor" : "Servis";
}

function meetingTypeBadgeStyle(t: MeetingType, cancelled: boolean) {
  if (cancelled) return { background: "#e5e7eb", color: "#6b7280" };
  if (t === "FSA") return { background: "#e0f5f7", color: "#00737f" };
  if (t === "POH") return { background: "#fef9e7", color: "#92700c" };
  return { background: "#fef3f2", color: "#c0392b" };
}

// ─── Case Modal (create / edit) ──────────────────────────────────────────────

function CaseModal({ open, onClose, initial, onSave, saving }: {
  open: boolean; onClose: () => void;
  initial: { nazev_pripadu: string; poznamka: string; status: string };
  onSave: (d: { nazev_pripadu: string; poznamka: string; status: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  useEffect(() => { setForm(initial); }, [initial]);
  if (!open) return null;
  const isEdit = initial.nazev_pripadu !== "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Upravit případ" : "Založit případ"}
        </h2>
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Název případu *</label>
          <input type="text" value={form.nazev_pripadu} onChange={(e) => setForm((f) => ({ ...f, nazev_pripadu: e.target.value }))}
            placeholder="Např. Rodina Nováků"
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Poznámka</label>
          <textarea value={form.poznamka} onChange={(e) => setForm((f) => ({ ...f, poznamka: e.target.value }))}
            rows={2} placeholder="Volitelné…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        </div>
        {isEdit && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
            <div className="flex gap-2">
              {(["aktivni", "uzavreny"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, status: s }))}
                  className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors ${form.status === s ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                  style={form.status === s ? { background: s === "aktivni" ? "#00abbd" : "#6b7280" } : {}}>
                  {s === "aktivni" ? "Aktivní" : "Uzavřený"}
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => onSave(form)} disabled={saving || !form.nazev_pripadu.trim()}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Uložit
        </button>
      </div>
    </div>
  );
}

// ─── Meeting Detail Modal (read-only) ────────────────────────────────────────

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

// ─── Meeting Form Modal ──────────────────────────────────────────────────────

function MeetingModal({ open, onClose, initial, onSave, saving, cases }: {
  open: boolean; onClose: () => void; initial: MeetingForm;
  onSave: (form: MeetingForm) => void; saving: boolean; cases: Case[];
}) {
  const [form, setForm] = useState<MeetingForm>(initial);
  useEffect(() => { setForm(initial); }, [initial]);
  if (!open) return null;
  const set = (patch: Partial<MeetingForm>) => setForm((f) => ({ ...f, ...patch }));
  const isEdit = !!initial.case_id && initial.date !== format(new Date(), "yyyy-MM-dd");
  const activeCases = cases.filter((c) => c.status === "aktivni");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Upravit schůzku" : "Nová aktivita"}
        </h2>

        {/* Case selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Obchodní případ *</label>
          <select value={form.case_id} onChange={(e) => set({ case_id: e.target.value })}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">— Vyber případ —</option>
            {activeCases.map((c) => <option key={c.id} value={c.id}>{c.nazev_pripadu}</option>)}
          </select>
        </div>

        {/* Datum */}
        {!form.cancelled && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
            <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        )}

        {/* Čas + Délka */}
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

        {/* Místo */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Místo</label>
          <div className="flex gap-2 mb-2">
            {(["osobne", "online"] as const).map((lt) => (
              <button key={lt} type="button"
                onClick={() => set({ location_type: form.location_type === lt ? "" : lt })}
                className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${form.location_type === lt ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                style={form.location_type === lt ? { background: "#00abbd" } : {}}>
                {lt === "osobne" ? "Osobně" : "Online"}
              </button>
            ))}
          </div>
          {form.location_type && (
            <input type="text" value={form.location_detail}
              onChange={(e) => set({ location_detail: e.target.value })}
              placeholder={form.location_type === "osobne" ? "Adresa…" : "Platforma…"}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          )}
        </div>

        {/* Typ schůzky */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Typ schůzky</label>
          <div className="flex gap-2">
            {(["FSA", "POH", "SER"] as MeetingType[]).map((t) => (
              <button key={t} type="button" onClick={() => set({ meeting_type: t })}
                className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors ${form.meeting_type === t ? "border-transparent text-white" : "border-input bg-background text-muted-foreground hover:border-ring"}`}
                style={form.meeting_type === t ? { background: "#00abbd" } : {}}>
                {t === "FSA" ? "Analýza" : t === "POH" ? "Pohovor" : "Servis"}
              </button>
            ))}
          </div>
        </div>

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
                        <button key={s} type="button"
                          onClick={() => set({ poradenstvi_status: form.poradenstvi_status === s ? null : s })}
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
                      <div className="flex-1"><NumberInput label="Podepsané BJ *" value={form.podepsane_bj} onChange={(v) => set({ podepsane_bj: v })} step={0.5} /></div>
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

// ─── Follow-Up Suggestion Modal ──────────────────────────────────────────────

function getFollowUpSuggestions(meetingType: MeetingType): { type: MeetingType; label: string }[] {
  switch (meetingType) {
    case "FSA": return [{ type: "POH", label: "Pohovor" }];
    case "POH": return [{ type: "FSA", label: "Analýza" }];
    case "SER": return [{ type: "POH", label: "Pohovor" }, { type: "FSA", label: "Poradko" }];
    default: return [{ type: "POH", label: "Pohovor" }];
  }
}

function FollowUpModal({ open, onClose, caseName, caseId, meetingType, onSchedule }: {
  open: boolean; onClose: () => void; caseName: string; caseId: string;
  meetingType: MeetingType;
  onSchedule: (data: { case_id: string; meeting_type: MeetingType; date: string; meeting_time: string; duration_minutes: string; location_type: string; location_detail: string }) => void;
}) {
  const suggestions = getFollowUpSuggestions(meetingType);
  const [expanded, setExpanded] = useState<MeetingType | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [locationType, setLocationType] = useState("");
  const [locationDetail, setLocationDetail] = useState("");

  useEffect(() => {
    if (open) {
      setExpanded(null);
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTime(""); setDuration(""); setLocationType(""); setLocationDetail("");
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!expanded || !date) return;
    onSchedule({ case_id: caseId, meeting_type: expanded, date, meeting_time: time, duration_minutes: duration, location_type: locationType, location_detail: locationDetail });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
          Jaký je další krok s případem {caseName}?
        </h2>

        <div className="flex flex-col gap-2 mb-4">
          {suggestions.map((s) => (
            <button key={s.type} type="button"
              onClick={() => setExpanded(expanded === s.type ? null : s.type)}
              className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${expanded === s.type ? "border-transparent text-white" : "border-input bg-background text-muted-foreground hover:border-ring"}`}
              style={expanded === s.type ? { background: "#00abbd" } : {}}>
              {s.label}
            </button>
          ))}
          {!expanded && (
            <button type="button" onClick={onClose}
              className="h-10 rounded-xl border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Žádná
            </button>
          )}
        </div>

        {expanded && (
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Datum *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Čas schůzky</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex-1">
                <NumberInput label="Délka (min)" value={duration} onChange={setDuration} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Místo</label>
              <div className="flex gap-2 mb-2">
                {(["osobne", "online"] as const).map((lt) => (
                  <button key={lt} type="button"
                    onClick={() => setLocationType(locationType === lt ? "" : lt)}
                    className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${locationType === lt ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                    style={locationType === lt ? { background: "#00abbd" } : {}}>
                    {lt === "osobne" ? "Osobně" : "Online"}
                  </button>
                ))}
              </div>
              {locationType && (
                <input type="text" value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)}
                  placeholder={locationType === "osobne" ? "Adresa…" : "Platforma…"}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setExpanded(null)}
                className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Zrušit
              </button>
              <button onClick={handleConfirm} disabled={!date}
                className="btn btn-primary btn-md flex-1 flex items-center justify-center">
                Naplánovat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Case Accordion Item ─────────────────────────────────────────────────────

function CaseAccordion({ c, meetings, onAddActivity, onEditCase, onClickMeeting, onDeleteMeeting }: {
  c: Case; meetings: Meeting[];
  onAddActivity: () => void; onEditCase: () => void;
  onClickMeeting: (m: Meeting) => void; onDeleteMeeting: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="legatus-card overflow-hidden">
      <div className="flex items-center gap-2 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRightIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        <span className="font-heading font-semibold text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>
          {c.nazev_pripadu}
        </span>
        {c.status === "uzavreny" && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Uzavřený</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); onAddActivity(); }}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-muted"
          style={{ color: "#00abbd" }}>
          + Aktivita
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEditCase(); }}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border">
          {sorted.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Žádné aktivity v tomto období.</p>
          ) : (
            sorted.map((m) => (
              <div key={m.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                style={m.cancelled ? { opacity: 0.45, textDecoration: "line-through" } : {}}
                onClick={() => onClickMeeting(m)}>
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">
                  {m.cancelled ? "Zrušená" : format(parseISO(m.date), "d. M. yyyy", { locale: cs })}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={meetingTypeBadgeStyle(m.meeting_type, m.cancelled)}>
                  {meetingTypeLabel(m.meeting_type)}
                </span>
                <span className="text-xs text-muted-foreground flex-1">
                  {!m.cancelled && m.has_poradenstvi && m.poradenstvi_status === "probehle" ? `${m.podepsane_bj} BJ` : ""}
                  {!m.cancelled && totalRefs(m) > 0 ? ` · ${totalRefs(m)} dop.` : ""}
                </span>
                <button onClick={(e) => { e.stopPropagation(); onDeleteMeeting(m.id); }}
                  className="p-1 rounded-lg hover:bg-muted transition-colors">
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

export default function ObchodniPripady() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
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
    queryKey: ["client_meetings", profile?.id, format(periodRange.start, "yyyy-MM-dd"), format(periodRange.end, "yyyy-MM-dd")],
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
    mutationFn: async ({ data, id }: { data: { nazev_pripadu: string; poznamka: string; status: string }; id?: string }) => {
      const payload = { user_id: profile!.id, nazev_pripadu: data.nazev_pripadu.trim(), poznamka: data.poznamka.trim() || null, status: data.status };
      if (id) {
        const { error } = await supabase.from("cases").update(payload as any).eq("id", id);
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
    mutationFn: async ({ form, id }: { form: MeetingForm; id?: string }) => {
      const payload: Record<string, unknown> = {
        user_id: profile!.id,
        case_id: form.case_id || null,
        date: form.cancelled ? format(new Date(), "yyyy-MM-dd") : form.date,
        meeting_type: form.meeting_type,
        cancelled: form.cancelled,
        case_name: form.case_name.trim() || null,
        meeting_time: form.meeting_time || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        location_type: form.location_type || null,
        location_detail: form.location_detail.trim() || null,
        potencial_bj: form.meeting_type === "FSA" && !form.cancelled ? parseFloat(form.potencial_bj) || null : null,
        has_poradenstvi: !form.cancelled && form.meeting_type !== "POH" && form.has_poradenstvi,
        podepsane_bj: !form.cancelled && form.meeting_type !== "POH" && form.has_poradenstvi ? parseFloat(form.podepsane_bj) || 0 : 0,
        doporuceni_poradenstvi: !form.cancelled && form.meeting_type !== "POH" && form.has_poradenstvi ? parseInt(form.doporuceni_poradenstvi) || 0 : 0,
        poradenstvi_date: !form.cancelled && form.meeting_type !== "POH" && form.has_poradenstvi && form.poradenstvi_date ? form.poradenstvi_date : null,
        poradenstvi_status: !form.cancelled && form.meeting_type !== "POH" && form.has_poradenstvi ? form.poradenstvi_status : null,
        has_pohovor: !form.cancelled && form.has_pohovor,
        pohovor_jde_dal: !form.cancelled && form.has_pohovor ? form.pohovor_jde_dal : null,
        doporuceni_pohovor: !form.cancelled && form.has_pohovor ? parseInt(form.doporuceni_pohovor) || 0 : 0,
        pohovor_date: !form.cancelled && form.has_pohovor && form.pohovor_date ? form.pohovor_date : null,
        bj: !form.cancelled && form.meeting_type !== "POH" && form.has_poradenstvi && form.poradenstvi_status === "probehle" ? parseFloat(form.podepsane_bj) || 0 : 0,
        doporuceni_fsa: !form.cancelled ? parseInt(form.doporuceni_fsa) || 0 : 0,
        vizi_spoluprace: !form.cancelled && form.has_pohovor && form.pohovor_jde_dal === true,
        poznamka: form.poznamka.trim() || null,
      };
      if (id) {
        const { error } = await supabase.from("client_meetings").update(payload as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_meetings").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
      toast.success(editMeeting ? "Schůzka upravena" : "Schůzka přidána");
      const savedForm = variables.form;
      const savedCaseId = savedForm.case_id;
      const savedCase = cases.find((c) => c.id === savedCaseId);
      setMeetingModalOpen(false);
      setEditMeeting(null);
      // Show follow-up if not cancelled
      if (!savedForm.cancelled && savedCaseId && savedCase) {
        setFollowUp({ caseId: savedCaseId, caseName: savedCase.nazev_pripadu, meetingType: savedForm.meeting_type });
      }
    },
    onError: (err: any) => toast.error(err.message || "Chyba při ukládání"),
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
  const openCreateCase = () => { setEditCase(null); setCaseModalOpen(true); };
  const openEditCase = (c: Case) => { setEditCase(c); setCaseModalOpen(true); };

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
        meeting_time: editMeeting.meeting_time ? editMeeting.meeting_time.slice(0, 5) : "",
        duration_minutes: editMeeting.duration_minutes != null ? String(editMeeting.duration_minutes) : "",
        location_type: editMeeting.location_type || "",
        location_detail: editMeeting.location_detail || "",
      }
    : defaultForm(preCaseId);

  const caseInitialForm = editCase
    ? { nazev_pripadu: editCase.nazev_pripadu, poznamka: editCase.poznamka || "", status: editCase.status }
    : { nazev_pripadu: "", poznamka: "", status: "aktivni" };

  const MONTH_NAMES = [
    "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
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
    <div className={isMobile ? "mobile-page" : "space-y-6"} style={isMobile ? { paddingBottom: 200, paddingTop: "max(32px, calc(env(safe-area-inset-top, 32px) + 16px))" } : undefined}>
      {isMobile ? (
        <>
          {/* Mobile header */}
          <div style={{ marginBottom: 16 }}>
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
              <h1 className="font-heading font-bold flex-1" style={{ fontSize: 22, color: "var(--text-primary)" }}>
                Obchodní případy
              </h1>
              <NotificationBell />
            </div>
          </div>

          {/* Fixed: Create case button + period bar */}
          <div style={{ position: "fixed", bottom: 120, left: 16, right: 16, zIndex: 40, display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={openCreateCase} className="btn btn-primary btn-md w-full flex items-center justify-center gap-2" style={{ boxShadow: "0 -2px 16px rgba(0,0,0,0.06)" }}>
              <Plus className="h-4 w-4" /> Založit případ
            </button>
            <div ref={mobilePickerRef} style={{
              background: isDark ? "rgba(9,29,33,0.85)" : "rgba(255,255,255,0.92)",
              backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)",
              borderRadius: 16, padding: "10px 16px",
              border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(225,233,235,0.8)",
              display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative",
            }}>
              <button onClick={() => { if (selectedMonth === 0) { setSelectedYear((y) => y - 1); setSelectedMonth(11); } else { setSelectedMonth((m) => m - 1); } }}
                style={{ width: 32, height: 32, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronLeft size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
              </button>
              <button onClick={() => setMobilePickerOpen((o) => !o)}
                style={{ textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>Produkční období</div>
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
                  {MONTH_NAMES[selectedMonth]} {selectedYear}
                </div>
              </button>
              <button onClick={() => { if (selectedMonth === 11) { setSelectedYear((y) => y + 1); setSelectedMonth(0); } else { setSelectedMonth((m) => m + 1); } }}
                style={{ width: 32, height: 32, borderRadius: 10, background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronRight size={15} color={isDark ? "#4dd8e8" : "#00555f"} />
              </button>
              {mobilePickerOpen && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                  background: isDark ? "#0a1f23" : "#fff", borderRadius: 14,
                  border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e1e9eb",
                  boxShadow: "0 -8px 24px rgba(0,0,0,0.08)", overflow: "hidden",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #eef3f4" }}>
                    <button onClick={() => setSelectedYear((y) => y - 1)}
                      style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: isDark ? "rgba(255,255,255,0.1)" : "#eef3f4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ChevronLeft size={14} color={isDark ? "#4dd8e8" : "#00555f"} />
                    </button>
                    <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{selectedYear}</span>
                    <button onClick={() => setSelectedYear((y) => y + 1)}
                      style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: isDark ? "rgba(255,255,255,0.1)" : "#eef3f4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ChevronRight size={14} color={isDark ? "#4dd8e8" : "#00555f"} />
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: 8 }}>
                    {MONTH_NAMES.map((name, idx) => {
                      const isSelected = idx === selectedMonth;
                      const isCurrent = selectedYear === currentPeriod.year && idx === currentPeriod.month;
                      return (
                        <button key={idx} onClick={() => { setSelectedMonth(idx); setMobilePickerOpen(false); }}
                          style={{
                            padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
                            fontFamily: "Open Sans, sans-serif", fontSize: 13,
                            fontWeight: isSelected ? 700 : 500,
                            background: isSelected ? "#00abbd" : "transparent",
                            color: isSelected ? "#fff" : isCurrent ? "#00abbd" : "var(--text-primary)",
                            transition: "background 0.15s, color 0.15s",
                          }}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Desktop header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Briefcase className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
              <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
                Obchodní případy
              </h1>
            </div>
            <NotificationBell />
          </div>

          {/* Desktop: Period picker + button */}
          <div className="flex items-center gap-3 flex-wrap">
            <ProductionMonthPicker
              selectedYear={selectedYear} selectedMonth={selectedMonth}
              onChange={(y, m) => { setSelectedYear(y); setSelectedMonth(m); }}
            />
            <span className="font-body text-xs text-muted-foreground">
              {format(periodRange.start, "d. M.", { locale: cs })} – {format(periodRange.end, "d. M. yyyy", { locale: cs })}
            </span>
            <div className="flex-1" />
            <button onClick={openCreateCase} className="btn btn-primary btn-md flex items-center gap-2">
              <Plus className="h-4 w-4" /> Založit případ
            </button>
          </div>
        </>
      )}

      {/* Cases accordion list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : cases.length === 0 ? (
        <div className="legatus-card p-8 text-center text-muted-foreground font-body text-sm">
          Zatím žádné obchodní případy. Klikni na{" "}
          <button onClick={openCreateCase} className="underline hover:text-foreground transition-colors">Založit případ</button>.
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
          <div className="relative w-full max-w-xs bg-card rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Smazat schůzku?</h2>
            <p className="text-sm text-muted-foreground mb-5">Tato akce je nevratná.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)}
                className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Zrušit
              </button>
              <button onClick={() => { deleteMutation.mutate(confirmDeleteId); setConfirmDeleteId(null); }}
                className="flex-1 h-10 rounded-xl text-sm font-semibold text-white transition-colors" style={{ background: "#fc7c71" }}>
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Case modal */}
      <CaseModal
        open={caseModalOpen}
        onClose={() => { setCaseModalOpen(false); setEditCase(null); }}
        initial={caseInitialForm}
        onSave={(d) => saveCaseMutation.mutate({ data: d, id: editCase?.id })}
        saving={saveCaseMutation.isPending}
      />

      {/* Meeting detail modal */}
      <MeetingDetailModal
        open={!!detailMeeting}
        onClose={() => setDetailMeeting(null)}
        meeting={detailMeeting}
        onEdit={() => {
          if (detailMeeting) {
            openEditMeeting(detailMeeting);
            setDetailMeeting(null);
          }
        }}
      />

      {/* Meeting form modal */}
      <MeetingModal
        open={meetingModalOpen}
        onClose={() => { setMeetingModalOpen(false); setEditMeeting(null); }}
        initial={meetingInitialForm}
        onSave={(form) => saveMeetingMutation.mutate({ form, id: editMeeting?.id })}
        saving={saveMeetingMutation.isPending}
        cases={cases}
      />

      {/* Follow-up suggestion modal */}
      <FollowUpModal
        open={!!followUp}
        onClose={() => setFollowUp(null)}
        caseName={followUp?.caseName || ""}
        caseId={followUp?.caseId || ""}
        meetingType={followUp?.meetingType || "FSA"}
        onSchedule={(data) => {
          const form: MeetingForm = {
            ...defaultForm(data.case_id),
            meeting_type: data.meeting_type,
            date: data.date,
            meeting_time: data.meeting_time,
            duration_minutes: data.duration_minutes,
            location_type: data.location_type,
            location_detail: data.location_detail,
          };
          setFollowUp(null);
          saveMeetingMutation.mutate({ form });
        }}
      />
    </div>
  );
}
