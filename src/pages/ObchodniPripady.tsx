import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  format, isSameWeek, parseISO, isAfter, isBefore, startOfMonth, endOfMonth,
} from "date-fns";
import { cs } from "date-fns/locale";
import { getProductionPeriodStart, getProductionPeriodEnd } from "@/lib/productionPeriod";
import { Plus, X, Loader2, Pencil, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Typy ────────────────────────────────────────────────────────────────────

type MeetingType = "FSA" | "SER";
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
}

interface MeetingForm {
  date: string;
  meeting_type: MeetingType;
  bj: string;
  ref_count: string;
  vizi_spoluprace: boolean;
  poznamka: string;
}

const defaultForm = (): MeetingForm => ({
  date: format(new Date(), "yyyy-MM-dd"),
  meeting_type: "FSA",
  bj: "",
  ref_count: "0",
  vizi_spoluprace: false,
  poznamka: "",
});

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

  // Reset when opening
  useState(() => { setForm(initial); });

  if (!open) return null;

  const set = (patch: Partial<MeetingForm>) => setForm((f) => ({ ...f, ...patch }));

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

        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "#0c2226" }}>
          {initial.date ? "Upravit schůzku" : "Nová schůzka"}
        </h2>

        {/* Datum */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Typ schůzky */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Typ schůzky</label>
          <div className="flex gap-2">
            {(["FSA", "SER"] as MeetingType[]).map((t) => (
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
                {t === "FSA" ? "Analýza" : "Poradka"}
              </button>
            ))}
          </div>
        </div>

        {/* BJ */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">BJ</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.bj}
            onChange={(e) => set({ bj: e.target.value })}
            placeholder="0"
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Doporučení */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Doporučení (počet)</label>
          <input
            type="number"
            min={0}
            value={form.ref_count}
            onChange={(e) => set({ ref_count: e.target.value })}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Vize spolupráce */}
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: "#0c2226" }}>Vidím ho/ji ve spolupráci</span>
          <button
            type="button"
            role="switch"
            aria-checked={form.vizi_spoluprace}
            onClick={() => set({ vizi_spoluprace: !form.vizi_spoluprace })}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{ background: form.vizi_spoluprace ? "#00abbd" : "#d1dfe2" }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{ transform: form.vizi_spoluprace ? "translateX(1.375rem)" : "translateX(0.25rem)" }}
            />
          </button>
        </div>

        {/* Poznámka */}
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
          disabled={saving || !form.date}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Uložit
        </button>
      </div>
    </div>
  );
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

  // Rozsah dat podle filtru
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
        .from("client_meetings" as any)
        .select("*")
        .eq("user_id", profile.id)
        .gte("date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("date", format(dateRange.to, "yyyy-MM-dd"))
        .order("date", { ascending: false });
      if (error) throw error;
      return data as Meeting[];
    },
    enabled: !!profile?.id,
  });

  // ── Statistiky ──
  const stats = useMemo(() => ({
    fsa: meetings.filter((m) => m.meeting_type === "FSA").length,
    ser: meetings.filter((m) => m.meeting_type === "SER").length,
    bj: meetings.reduce((s, m) => s + (m.bj || 0), 0),
    ref: meetings.reduce((s, m) => s + (m.ref_count || 0), 0),
    spoluprace: meetings.filter((m) => m.vizi_spoluprace).length,
  }), [meetings]);

  // ── Mutace: uložit ──
  const saveMutation = useMutation({
    mutationFn: async ({ form, id }: { form: MeetingForm; id?: string }) => {
      const payload = {
        user_id: profile!.id,
        date: form.date,
        meeting_type: form.meeting_type,
        bj: parseFloat(form.bj) || 0,
        ref_count: parseInt(form.ref_count) || 0,
        vizi_spoluprace: form.vizi_spoluprace,
        poznamka: form.poznamka.trim() || null,
      };
      if (id) {
        const { error } = await supabase.from("client_meetings" as any).update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_meetings" as any).insert(payload);
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
      const { error } = await supabase.from("client_meetings" as any).delete().eq("id", id);
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
        bj: String(editMeeting.bj),
        ref_count: String(editMeeting.ref_count),
        vizi_spoluprace: editMeeting.vizi_spoluprace,
        poznamka: editMeeting.poznamka || "",
      }
    : defaultForm();

  // ── Render ──
  return (
    <div className="space-y-8">
      {/* Záhlaví */}
      <div className="flex items-center justify-between">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Analýzy (FSA)", value: stats.fsa, sub: "schůzek" },
          { label: "Poradky (SER)", value: stats.ser, sub: "schůzek" },
          { label: "BJ celkem", value: stats.bj % 1 === 0 ? stats.bj : stats.bj.toFixed(1), sub: "bodů" },
          { label: "Doporučení", value: stats.ref, sub: "kontaktů" },
          { label: "Ke spolupráci", value: stats.spoluprace, sub: "lidí" },
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
            <div key={m.id} className="legatus-card p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: m.meeting_type === "FSA" ? "#e0f5f7" : "#fef3f2",
                      color: m.meeting_type === "FSA" ? "#00737f" : "#c0392b",
                    }}
                  >
                    {m.meeting_type === "FSA" ? "Analýza" : "Poradka"}
                  </span>
                  <span className="font-body text-sm text-muted-foreground">
                    {format(parseISO(m.date), "d. M. yyyy", { locale: cs })}
                  </span>
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
              <div className="flex gap-4 text-sm">
                <span>
                  <span className="text-muted-foreground text-xs">BJ </span>
                  <span className="font-semibold font-heading" style={{ color: "#0c2226" }}>{m.bj}</span>
                </span>
                <span>
                  <span className="text-muted-foreground text-xs">Doporučení </span>
                  <span className="font-semibold font-heading" style={{ color: "#0c2226" }}>{m.ref_count}</span>
                </span>
                {m.vizi_spoluprace && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "#e0f5f7", color: "#00737f" }}>
                    Spolupráce ✓
                  </span>
                )}
              </div>
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
                  <th>BJ</th>
                  <th>Doporučení</th>
                  <th>Spolupráce</th>
                  <th className="text-left">Poznámka</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => {
                  const isToday = m.date === format(now, "yyyy-MM-dd");
                  return (
                    <tr key={m.id} className={isToday ? "current" : ""}>
                      <td className="text-left whitespace-nowrap font-medium">
                        {format(parseISO(m.date), "d. M. yyyy", { locale: cs })}
                      </td>
                      <td>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{
                            background: m.meeting_type === "FSA" ? "#e0f5f7" : "#fef3f2",
                            color: m.meeting_type === "FSA" ? "#00737f" : "#c0392b",
                          }}
                        >
                          {m.meeting_type === "FSA" ? "Analýza" : "Poradka"}
                        </span>
                      </td>
                      <td className="font-semibold" style={{ color: "#0c2226" }}>{m.bj}</td>
                      <td>{m.ref_count}</td>
                      <td>
                        {m.vizi_spoluprace ? (
                          <span style={{ color: "#00abbd", fontWeight: 700 }}>✓</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
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
