import { useState, useEffect } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Loader2, Trash2 } from "lucide-react";

// ─── Types (shared) ──────────────────────────────────────────────────────────

export type MeetingType = "FSA" | "POR" | "SER" | "POH";

export interface MeetingForm {
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

export interface Case {
  id: string;
  user_id: string;
  nazev_pripadu: string;
  status: string;
  poznamka: string | null;
  created_at: string;
}

export function meetingTypeLabel(t: MeetingType): string {
  if (t === "FSA") return "Analýza";
  if (t === "POR") return "Poradenství";
  if (t === "SER") return "Servis";
  return "Pohovor";
}

export const defaultMeetingForm = (date?: string, time?: string): MeetingForm => ({
  date: date || new Date().toISOString().slice(0, 10),
  meeting_type: "FSA",
  cancelled: false,
  potencial_bj: "",
  has_poradenstvi: false,
  podepsane_bj: "0",
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
  duration_minutes: "",
  location_type: "",
  location_detail: "",
});

// ─── Shared sub-components ───────────────────────────────────────────────────

function NumberInput({ label, value, onChange, step = 1 }: {
  label: string; value: string; onChange: (v: string) => void; step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} step={step} min={0}
        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}

// ─── Meeting Form Modal ──────────────────────────────────────────────────────

interface MeetingFormModalProps {
  open: boolean;
  onClose: () => void;
  initial: MeetingForm;
  onSave: (form: MeetingForm) => void;
  saving: boolean;
  cases: Case[];
  isEdit?: boolean;
  onDelete?: () => void;
  /** If true, show inline case creation (used in Kalendar) */
  allowCreateCase?: boolean;
  onCaseCreated?: (c: Case) => void;
  /** For inline case creation */
  createCaseFn?: (name: string, note: string) => Promise<Case>;
}

export function MeetingFormModal({
  open, onClose, initial, onSave, saving, cases,
  isEdit: isEditProp, onDelete,
  allowCreateCase, createCaseFn, onCaseCreated,
}: MeetingFormModalProps) {
  useBodyScrollLock(open);
  const [form, setForm] = useState<MeetingForm>(initial);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCaseNote, setNewCaseNote] = useState("");
  const [creatingCase, setCreatingCase] = useState(false);

  useEffect(() => {
    setForm(initial);
    setShowDeleteConfirm(false);
    setShowNewCase(false);
    setNewCaseName("");
    setNewCaseNote("");
  }, [initial]);

  if (!open) return null;

  const set = (patch: Partial<MeetingForm>) => setForm((f) => ({ ...f, ...patch }));
  const isEdit = isEditProp ?? false;
  const activeCases = cases.filter((c) => c.status === "aktivni");

  const handleCreateCase = async () => {
    if (!createCaseFn || !newCaseName.trim()) return;
    setCreatingCase(true);
    try {
      const created = await createCaseFn(newCaseName.trim(), newCaseNote.trim());
      onCaseCreated?.(created);
      set({ case_id: created.id });
      setShowNewCase(false);
    } catch {
      // handled upstream
    } finally {
      setCreatingCase(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px)", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Upravit schůzku" : "Nová schůzka"}
        </h2>

        {/* 1. Obchodní případ */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Obchodní případ *</label>
          <select
            value={form.case_id}
            onChange={(e) => {
              if (allowCreateCase && e.target.value === "__new__") {
                setShowNewCase(true);
                set({ case_id: "" });
              } else {
                setShowNewCase(false);
                set({ case_id: e.target.value });
              }
            }}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Vyber případ —</option>
            {activeCases.map((c) => (
              <option key={c.id} value={c.id}>{c.nazev_pripadu}</option>
            ))}
            {allowCreateCase && <option value="__new__">+ Nový případ</option>}
          </select>
        </div>

        {showNewCase && allowCreateCase && (
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

        {/* 2. Typ schůzky */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Typ schůzky</label>
          <div className="flex gap-2 items-center">
            <div className="flex gap-2 flex-1">
              {(["FSA", "POR", "SER", "POH"] as MeetingType[]).filter((t) => t !== "POR" || isEdit).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ meeting_type: t })}
                  className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors ${form.meeting_type === t ? "border-transparent text-white" : "border-input bg-background text-muted-foreground hover:border-ring"}`}
                  style={form.meeting_type === t ? { background: "#00abbd" } : {}}
                >
                  {meetingTypeLabel(t)}
                </button>
              ))}
            </div>
            {form.cancelled && (
              <span
                className="text-xs font-bold px-2 py-1 rounded-lg shrink-0"
                style={{ background: "rgba(252,124,113,0.15)", color: "#fc7c71" }}
              >
                ZRUŠENA
              </span>
            )}
          </div>
        </div>

        {/* 3. Datum */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* 4. Čas + 5. Délka */}
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

        {/* 6. Místo */}
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

        {/* 7. Výsledek schůzky — jen při editaci existující schůzky */}
        {isEdit && !form.cancelled && (
          <div className="mb-4 p-3 rounded-xl border border-input">
            <label className="block text-xs font-semibold text-muted-foreground mb-3">Výsledek schůzky</label>

            {form.meeting_type === "FSA" && (
              <NumberInput label="Doporučení" value={form.doporuceni_fsa} onChange={(v) => set({ doporuceni_fsa: v })} />
            )}

            {(form.meeting_type === "POR" || form.meeting_type === "SER") && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <NumberInput label="Podepsané BJ" value={form.podepsane_bj} onChange={(v) => set({ podepsane_bj: v })} step={0.5} />
                </div>
                <div className="flex-1">
                  <NumberInput label="Doporučení" value={form.doporuceni_poradenstvi} onChange={(v) => set({ doporuceni_poradenstvi: v })} />
                </div>
              </div>
            )}

            {form.meeting_type === "POH" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Jde dál</label>
                  <div className="flex gap-2">
                    {([true, false, null] as const).map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => set({ pohovor_jde_dal: val })}
                        className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${form.pohovor_jde_dal === val ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                        style={
                          form.pohovor_jde_dal === val
                            ? { background: val === true ? "#00abbd" : val === false ? "#fc7c71" : "#8aadb3" }
                            : {}
                        }
                      >
                        {val === true ? "Ano" : val === false ? "Ne" : "—"}
                      </button>
                    ))}
                  </div>
                </div>
                <NumberInput label="Doporučení" value={form.doporuceni_pohovor} onChange={(v) => set({ doporuceni_pohovor: v })} />
              </div>
            )}
          </div>
        )}

        {/* 8. Poznámka */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Poznámka</label>
          <textarea value={form.poznamka} onChange={(e) => set({ poznamka: e.target.value })}
            rows={2} placeholder="Volitelné…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        </div>

        {/* Save button */}
        <button onClick={() => onSave(form)} disabled={saving || !form.case_id || !form.date}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Uložit
        </button>

        {/* 9. Cancel / Restore toggle — jen při editaci existující schůzky */}
        {isEdit && <button
          type="button"
          onClick={() => set({ cancelled: !form.cancelled })}
          className="w-full mt-3 h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors hover:opacity-80"
          style={
            form.cancelled
              ? { color: "#00abbd", background: "transparent", border: "1px solid #00abbd" }
              : { color: "#fc7c71", background: "transparent", border: "1px solid #fc7c71" }
          }
        >
          {form.cancelled ? "Obnovit schůzku" : "Schůzka zrušena"}
        </button>}

        {/* Delete (edit mode only) */}
        {isEdit && onDelete && (
          <>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full mt-3 h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors hover:opacity-80"
                style={{ color: "#fc7c71", background: "transparent", border: "1px solid #fc7c71" }}
              >
                <Trash2 className="h-4 w-4" /> Smazat schůzku
              </button>
            ) : (
              <div className="mt-3 p-3 rounded-xl border border-destructive space-y-2">
                <p className="text-sm text-center text-muted-foreground">Opravdu smazat?</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 h-9 rounded-lg border border-input text-sm font-semibold">
                    Zrušit
                  </button>
                  <button onClick={onDelete}
                    className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
                    style={{ background: "#fc7c71" }}>
                    Smazat
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
