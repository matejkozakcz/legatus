import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfWeek, endOfWeek, subWeeks,
  format, parseISO,
} from "date-fns";
import { cs } from "date-fns/locale";
import { getProductionPeriodStart, getProductionPeriodEnd } from "@/lib/productionPeriod";
import { Plus, X, Loader2, Pencil, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Typy ────────────────────────────────────────────────────────────────────

type MeetingType = "FSA" | "POH" | "SER";
type TimeFilter = "this_week" | "last_week" | "this_period";

interface Meeting {
  id: string;
  user_id: string;
  date: string;
  week_start: string;
  meeting_type: MeetingType;
  bj: number;
  ref_count: number;
  vizi_spoluprace: boolean;
  poznamka: string | null;
  created_at: string;
  updated_at: string;
  cancelled: boolean;
  potencial_bj: number | null;
  has_poradko: boolean;
  podepsane_bj: number;
  poradko_doporuceni: number;
  poradko_status: string | null;
  has_poradko_pohovor: boolean;
  poradko_pohovor_jde_dal: boolean | null;
  poradko_pohovor_doporuceni: number;
  has_pohovor: boolean;
  pohovor_jde_dal: boolean | null;
  pohovor_doporuceni: number;
  case_name: string | null;
  poradko_date: string | null;
  pohovor_date: string | null;
}

type PoradkoStatus = "probehle" | "zrusene" | null;

interface MeetingForm {
  date: string;
  meeting_type: MeetingType;
  cancelled: boolean;
  potencial_bj: string;
  has_poradko: boolean;
  podepsane_bj: string;
  poradko_doporuceni: string;
  poradko_date: string;
  poradko_status: PoradkoStatus;
  has_pohovor: boolean;
  pohovor_jde_dal: boolean | null;
  pohovor_doporuceni: string;
  pohovor_date: string;
  ref_count: string;
  poznamka: string;
  case_name: string;
}

const defaultForm = (): MeetingForm => ({
  date: format(new Date(), "yyyy-MM-dd"),
  meeting_type: "FSA",
  cancelled: false,
  potencial_bj: "",
  has_poradko: false,
  podepsane_bj: "",
  poradko_doporuceni: "0",
  poradko_date: "",
  poradko_status: null,
  has_pohovor: false,
  pohovor_jde_dal: null,
  pohovor_doporuceni: "0",
  pohovor_date: "",
  ref_count: "0",
  poznamka: "",
  case_name: "",
});

// ─── Helper: toggle switch ───────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={{ color: "#0c2226" }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{ background: checked ? "#00abbd" : "#d1dfe2" }}
      >
        <span
          className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(1.375rem)" : "translateX(0.25rem)" }}
        />
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
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

// ─── Formulářový modal ───────────────────────────────────────────────────────

function MeetingModal({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: MeetingForm;
  onSave: (form: MeetingForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<MeetingForm>(initial);

  useEffect(() => { setForm(initial); }, [initial]);

  if (!open) return null;

  const set = (patch: Partial<MeetingForm>) => setForm((f) => ({ ...f, ...patch }));
  const isEdit = initial.date !== format(new Date(), "yyyy-MM-dd") || initial.has_poradko || initial.cancelled;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "#0c2226" }}>
          {isEdit ? "Upravit schůzku" : "Nová schůzka"}
        </h2>

        {/* Název případu */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Název případu</label>
          <input
            type="text"
            value={form.case_name}
            onChange={(e) => set({ case_name: e.target.value })}
            placeholder="Nepovinné…"
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Datum */}
        {!form.cancelled && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set({ date: e.target.value })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {/* Typ schůzky */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Typ schůzky</label>
          <div className="flex gap-2">
            {(["FSA", "POH", "SER"] as MeetingType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set({ meeting_type: t })}
                className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors ${
                  form.meeting_type === t
                    ? "border-transparent text-white"
                    : "border-input bg-background text-muted-foreground hover:border-ring"
                }`}
                style={form.meeting_type === t ? { background: "#00abbd" } : {}}
              >
                {t === "FSA" ? "Analýza" : t === "POH" ? "Pohovor" : "Servis"}
              </button>
            ))}
          </div>
        </div>

        {!form.cancelled && (
          <>
            {/* Potenciál BJ + Doporučení — jen FSA, vedle sebe */}
            {form.meeting_type === "FSA" && (
              <div className="mb-4 flex gap-3">
                <div className="flex-1">
                  <NumberInput label="Potenciál BJ" value={form.potencial_bj} onChange={(v) => set({ potencial_bj: v })} step={0.5} />
                </div>
                <div className="flex-1">
                  <NumberInput label="Doporučení" value={form.ref_count} onChange={(v) => set({ ref_count: v })} />
                </div>
              </div>
            )}

            {/* Zrušená — between Potenciál BJ and Poradenství */}
            <div className="mb-4">
              <Toggle checked={form.cancelled} onChange={(v) => set({ cancelled: v })} label="Zrušená schůzka" />
            </div>

            {/* ── Sekce Poradko ── */}
            {form.meeting_type !== "POH" && (
              <div className="mb-4 p-3 rounded-xl border border-input">
                <Toggle checked={form.has_poradko} onChange={(v) => set({ has_poradko: v })} label="Poradenství" />
                {form.has_poradko && (
                  <div className="mt-3 space-y-3 pl-1">
                    {/* Status: Proběhlé / Zrušené */}
                    <div className="flex gap-2">
                      {(["probehle", "zrusene"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set({ poradko_status: form.poradko_status === s ? null : s })}
                          className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${
                            form.poradko_status === s
                              ? "border-transparent text-white"
                              : "border-input bg-background text-muted-foreground"
                          }`}
                          style={form.poradko_status === s ? { background: s === "probehle" ? "#00abbd" : "#fc7c71" } : {}}
                        >
                          {s === "probehle" ? "Proběhlé" : "Zrušené"}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Datum poradenství</label>
                      <input
                        type="date"
                        value={form.poradko_date}
                        onChange={(e) => set({ poradko_date: e.target.value })}
                        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {/* Podepsané BJ + Doporučení vedle sebe */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <NumberInput label="Podepsané BJ *" value={form.podepsane_bj} onChange={(v) => set({ podepsane_bj: v })} step={0.5} />
                      </div>
                      <div className="flex-1">
                        <NumberInput label="Doporučení" value={form.poradko_doporuceni} onChange={(v) => set({ poradko_doporuceni: v })} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Sekce Pohovor (přímý) ── */}
            <div className="mb-4 p-3 rounded-xl border border-input">
              <Toggle checked={form.has_pohovor} onChange={(v) => set({ has_pohovor: v })} label="Pohovor" />
              {form.has_pohovor && (
                <div className="mt-3 space-y-3 pl-1">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Datum pohovoru</label>
                    <input
                      type="date"
                      value={form.pohovor_date}
                      onChange={(e) => set({ pohovor_date: e.target.value })}
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex gap-2">
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => set({ pohovor_jde_dal: val })}
                        className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${
                          form.pohovor_jde_dal === val
                            ? "border-transparent text-white"
                            : "border-input bg-background text-muted-foreground"
                        }`}
                        style={form.pohovor_jde_dal === val ? { background: val ? "#00abbd" : "#fc7c71" } : {}}
                      >
                        {val ? "Jde dál" : "Nejde dál"}
                      </button>
                    ))}
                  </div>
                  <NumberInput label="Doporučení" value={form.pohovor_doporuceni} onChange={(v) => set({ pohovor_doporuceni: v })} />
                </div>
              )}
            </div>

            {/* Doporučení (úroveň schůzky) */}
            <div className="mb-4">
              <NumberInput label="Doporučení (schůzka)" value={form.ref_count} onChange={(v) => set({ ref_count: v })} />
            </div>
          </>
        )}

        {/* If cancelled, show toggle here too so user can uncancel */}
        {form.cancelled && (
          <div className="mb-4">
            <Toggle checked={form.cancelled} onChange={(v) => set({ cancelled: v })} label="Zrušená schůzka" />
          </div>
        )}

        {/* Poznámka — vždy viditelná */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Poznámka</label>
          <textarea
            value={form.poznamka}
            onChange={(e) => set({ poznamka: e.target.value })}
            rows={2}
            placeholder="Volitelné…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <button
          onClick={() => onSave(form)}
          disabled={saving || (!form.cancelled && !form.date)}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Uložit
        </button>
      </div>
    </div>
  );
}

// ─── Helper: total refs ──────────────────────────────────────────────────────

function totalRefs(m: Meeting): number {
  return (m.ref_count || 0) + (m.poradko_doporuceni || 0) + (m.pohovor_doporuceni || 0) + (m.poradko_pohovor_doporuceni || 0);
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

// ─── Hlavní komponenta ────────────────────────────────────────────────────────

export default function ObchodniPripady() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const now = new Date();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("this_period");
  const [modalOpen, setModalOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);

  const dateRange = useMemo(() => {
    switch (timeFilter) {
      case "this_week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last_week":
        return {
          from: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
          to: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        };
      case "this_period":
      default:
        return { from: getProductionPeriodStart(now), to: getProductionPeriodEnd(now) };
    }
  }, [timeFilter]);

  // ── Data ──
  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ["client_meetings", profile?.id, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("*")
        .eq("user_id", profile.id)
        .gte("date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("date", format(dateRange.to, "yyyy-MM-dd"))
        .order("date", { ascending: false });
      if (error) throw error;
      return (data as unknown as Meeting[]) ?? [];
    },
    enabled: !!profile?.id,
  });

  // ── Statistiky ──
  const stats = useMemo(() => {
    const active = meetings.filter((m) => !m.cancelled);
    return {
      fsa: active.filter((m) => m.meeting_type === "FSA").length,
      poh: active.filter((m) => m.meeting_type === "POH").length,
      ser: active.filter((m) => m.meeting_type === "SER").length,
      bj: active.reduce((s, m) => s + (m.podepsane_bj || 0), 0),
      ref: active.reduce((s, m) => s + totalRefs(m), 0),
      cancelled: meetings.filter((m) => m.cancelled).length,
    };
  }, [meetings]);

  // ── Mutace: uložit ──
  const saveMutation = useMutation({
    mutationFn: async ({ form, id }: { form: MeetingForm; id?: string }) => {
      const payload: Record<string, unknown> = {
        user_id: profile!.id,
        date: form.cancelled ? format(new Date(), "yyyy-MM-dd") : form.date,
        meeting_type: form.meeting_type,
        cancelled: form.cancelled,
        case_name: form.case_name.trim() || null,
        potencial_bj: form.meeting_type === "FSA" && !form.cancelled ? (parseFloat(form.potencial_bj) || null) : null,
        has_poradko: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko,
        podepsane_bj: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko ? (parseFloat(form.podepsane_bj) || 0) : 0,
        poradko_doporuceni: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko ? (parseInt(form.poradko_doporuceni) || 0) : 0,
        poradko_date: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko && form.poradko_date ? form.poradko_date : null,
        has_poradko_pohovor: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko && form.has_poradko_pohovor,
        poradko_pohovor_jde_dal: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko && form.has_poradko_pohovor ? form.poradko_pohovor_jde_dal : null,
        poradko_pohovor_doporuceni: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko && form.has_poradko_pohovor ? (parseInt(form.poradko_pohovor_doporuceni) || 0) : 0,
        has_pohovor: !form.cancelled && form.has_pohovor,
        pohovor_jde_dal: !form.cancelled && form.has_pohovor ? form.pohovor_jde_dal : null,
        pohovor_doporuceni: !form.cancelled && form.has_pohovor ? (parseInt(form.pohovor_doporuceni) || 0) : 0,
        pohovor_date: !form.cancelled && form.has_pohovor && form.pohovor_date ? form.pohovor_date : null,
        // Keep legacy fields in sync
        bj: !form.cancelled && form.meeting_type !== "POH" && form.has_poradko ? (parseFloat(form.podepsane_bj) || 0) : 0,
        ref_count: !form.cancelled ? (parseInt(form.ref_count) || 0) : 0,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
      toast.success(editMeeting ? "Schůzka upravena" : "Schůzka přidána");
      setModalOpen(false);
      setEditMeeting(null);
    },
    onError: (err: any) => toast.error(err.message || "Chyba při ukládání"),
  });

  // ── Mutace: smazat ──
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

  const openAdd = () => { setEditMeeting(null); setModalOpen(true); };
  const openEdit = (m: Meeting) => { setEditMeeting(m); setModalOpen(true); };

  const handleSave = (form: MeetingForm) => {
    saveMutation.mutate({ form, id: editMeeting?.id });
  };

  const filterPills: { key: TimeFilter; label: string }[] = [
    { key: "this_week", label: "Tento týden" },
    { key: "last_week", label: "Minulý týden" },
    { key: "this_period", label: "Toto období" },
  ];

  const initialForm: MeetingForm = editMeeting
    ? {
        date: editMeeting.date,
        meeting_type: editMeeting.meeting_type,
        cancelled: editMeeting.cancelled,
        potencial_bj: editMeeting.potencial_bj != null ? String(editMeeting.potencial_bj) : "",
        has_poradko: editMeeting.has_poradko,
        podepsane_bj: String(editMeeting.podepsane_bj || ""),
        poradko_doporuceni: String(editMeeting.poradko_doporuceni || 0),
        poradko_date: editMeeting.poradko_date || "",
        has_poradko_pohovor: editMeeting.has_poradko_pohovor,
        poradko_pohovor_jde_dal: editMeeting.poradko_pohovor_jde_dal,
        poradko_pohovor_doporuceni: String(editMeeting.poradko_pohovor_doporuceni || 0),
        has_pohovor: editMeeting.has_pohovor,
        pohovor_jde_dal: editMeeting.pohovor_jde_dal,
        pohovor_doporuceni: String(editMeeting.pohovor_doporuceni || 0),
        pohovor_date: editMeeting.pohovor_date || "",
        ref_count: String(editMeeting.ref_count || 0),
        poznamka: editMeeting.poznamka || "",
        case_name: editMeeting.case_name || "",
      }
    : defaultForm();

  // ── Summary helpers ──
  const meetingSummary = (m: Meeting) => {
    const parts: string[] = [];
    if (m.has_poradko) parts.push(`${m.podepsane_bj} BJ`);
    if (m.has_pohovor) parts.push(m.pohovor_jde_dal ? "Jde dál" : m.pohovor_jde_dal === false ? "Nejde dál" : "Pohovor");
    const refs = totalRefs(m);
    if (refs > 0) parts.push(`${refs} dop.`);
    return parts.join(" · ") || "—";
  };

  // ── Render ──
  return (
    <div className={isMobile ? "mobile-page space-y-6" : "space-y-8"}>
      {/* Záhlaví */}
      <div className="flex items-center justify-between" style={isMobile ? { paddingTop: 16 } : undefined}>
        <div className="flex items-center gap-3">
          <Briefcase className="h-6 w-6" style={{ color: "#0c2226" }} />
          <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>
            Obchodní případy
          </h1>
        </div>
        <button onClick={openAdd} className="btn btn-primary btn-md flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {!isMobile && "Nová schůzka"}
        </button>
      </div>

      {/* Filtry */}
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
        <span className="font-body text-xs text-muted-foreground ml-1">
          {format(dateRange.from, "d. M.", { locale: cs })} – {format(dateRange.to, "d. M. yyyy", { locale: cs })}
        </span>
      </div>

      {/* Statistiky */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Analýzy (FSA)", value: stats.fsa, sub: "schůzek" },
          { label: "Pohovory", value: stats.poh, sub: "schůzek" },
          { label: "Servisy (SER)", value: stats.ser, sub: "schůzek" },
          { label: "Podepsané BJ", value: stats.bj % 1 === 0 ? stats.bj : stats.bj.toFixed(1), sub: "bodů" },
          { label: "Doporučení", value: stats.ref, sub: "kontaktů" },
          { label: "Zrušené", value: stats.cancelled, sub: "schůzek" },
        ].map((s) => (
          <div key={s.label} className="legatus-card p-4 flex flex-col gap-1">
            <span className="font-body text-xs text-muted-foreground">{s.label}</span>
            <span className="font-heading font-bold text-2xl" style={{ color: "#0c2226" }}>{s.value}</span>
            <span className="font-body text-xs text-muted-foreground">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Seznam schůzek */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="legatus-card p-8 text-center text-muted-foreground font-body text-sm">
          Žádné schůzky v tomto období. Přidej první kliknutím na&nbsp;
          <button onClick={openAdd} className="underline hover:text-foreground transition-colors">
            Nová schůzka
          </button>
          .
        </div>
      ) : isMobile ? (
        /* Mobilní karty */
        <div className="flex flex-col gap-3">
          {meetings.map((m) => (
            <div
              key={m.id}
              className="legatus-card p-4"
              style={m.cancelled ? { opacity: 0.5 } : {}}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      ...meetingTypeBadgeStyle(m.meeting_type, m.cancelled),
                      textDecoration: m.cancelled ? "line-through" : undefined,
                    }}
                  >
                    {meetingTypeLabel(m.meeting_type)}
                  </span>
                  {!m.cancelled && (
                    <span className="font-body text-sm text-muted-foreground">
                      {format(parseISO(m.date), "d. M. yyyy", { locale: cs })}
                    </span>
                  )}
                  {m.cancelled && (
                    <span className="text-xs font-medium text-muted-foreground">Zrušená</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(m.id)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" style={{ color: "#fc7c71" }} />
                  </button>
                </div>
              </div>
              {!m.cancelled && (
                <div className="text-sm font-body" style={{ color: "#0c2226" }}>
                  {meetingSummary(m)}
                </div>
              )}
              {m.poznamka && (
                <p className="mt-2 text-xs text-muted-foreground font-body">{m.poznamka}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Desktop tabulka */
        <section className="legatus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="activity-table">
              <thead>
                <tr>
                  <th className="text-left">Datum</th>
                  <th>Typ</th>
                  <th>Podepsané BJ</th>
                  <th>Pohovor</th>
                  <th>Doporučení</th>
                  <th className="text-left">Poznámka</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => {
                  const isToday = m.date === format(now, "yyyy-MM-dd");
                  return (
                    <tr
                      key={m.id}
                      className={isToday ? "current" : ""}
                      style={m.cancelled ? { opacity: 0.45, textDecoration: "line-through" } : {}}
                    >
                      <td className="text-left whitespace-nowrap font-medium">
                        {m.cancelled ? "Zrušená" : format(parseISO(m.date), "d. M. yyyy", { locale: cs })}
                      </td>
                      <td>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={meetingTypeBadgeStyle(m.meeting_type, m.cancelled)}
                        >
                          {meetingTypeLabel(m.meeting_type)}
                        </span>
                      </td>
                      <td className="font-semibold" style={{ color: "#0c2226" }}>
                        {m.cancelled ? "—" : m.has_poradko ? m.podepsane_bj : "—"}
                      </td>
                      <td>
                        {m.cancelled ? "—" : m.has_pohovor ? (
                          m.pohovor_jde_dal ? (
                            <span style={{ color: "#00abbd", fontWeight: 700 }}>Jde dál</span>
                          ) : m.pohovor_jde_dal === false ? (
                            <span style={{ color: "#fc7c71", fontWeight: 600 }}>Nejde dál</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>{m.cancelled ? "—" : totalRefs(m) || "—"}</td>
                      <td className="text-left max-w-[200px]">
                        <span className="block truncate text-muted-foreground text-xs font-body">
                          {m.poznamka || ""}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(m)}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(m.id)}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" style={{ color: "#fc7c71" }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal */}
      <MeetingModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditMeeting(null); }}
        initial={initialForm}
        onSave={handleSave}
        saving={saveMutation.isPending}
      />
    </div>
  );
}
