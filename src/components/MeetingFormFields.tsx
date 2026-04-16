import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Loader2, Trash2, ChevronDown } from "lucide-react";

// ─── Types (shared) ──────────────────────────────────────────────────────────

export type MeetingType = "FSA" | "POR" | "SER" | "POH" | "NAB" | "INFO" | "POST";

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
  location_type: string;
  location_detail: string;
  // INFO/POST outcome fields
  info_zucastnil_se: boolean | null;
  info_pocet_lidi: string;
}

/** Roles allowed to create INFO and POST meeting types */
export function canCreateInfoPost(role: string | undefined): boolean {
  return role === "vedouci" || role === "budouci_vedouci";
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
  if (t === "NAB") return "Nábor";
  if (t === "INFO") return "Info";
  if (t === "POST") return "Postinfo";
  return "Pohovor";
}

export const defaultMeetingForm = (date?: string): MeetingForm => ({
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
  location_type: "",
  location_detail: "",
  info_zucastnil_se: null,
  info_pocet_lidi: "",
});

// ─── Shared sub-components ───────────────────────────────────────────────────

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={step}
        min={0}
        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

// ─── Case Combobox (autocomplete + inline create) ────────────────────────────

function CaseCombobox({
  cases,
  selectedId,
  onSelect,
  onClear,
  allowCreateCase,
  onCreateClick,
}: {
  cases: Case[];
  selectedId: string;
  onSelect: (c: Case) => void;
  onClear: () => void;
  allowCreateCase?: boolean;
  onCreateClick?: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const filteredCases = cases.filter((c) =>
    c.nazev_pripadu.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  const selectedName = cases.find((c) => c.id === selectedId)?.nazev_pripadu ?? "";

  return (
    <div style={{ position: "relative" }}>
      <label className="block text-xs font-medium text-muted-foreground mb-1">Klient *</label>
      <input
        type="text"
        autoComplete="off"
        placeholder={selectedId ? selectedName || "Vyber případ…" : "Hledat nebo vytvořit případ…"}
        value={dropdownOpen ? query : selectedName}
        onFocus={() => { setDropdownOpen(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); onClear(); }}
        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {dropdownOpen && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          maxHeight: 220, overflowY: "auto",
        }}>
          {filteredCases.length === 0 && !allowCreateCase && (
            <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--muted-foreground)" }}>
              Žádný případ nenalezen
            </div>
          )}
          {filteredCases.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => {
                onSelect(c);
                setQuery("");
                setDropdownOpen(false);
              }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px", fontSize: 13, border: "none",
                background: selectedId === c.id ? "rgba(0,171,189,0.1)" : "transparent",
                color: "var(--text-primary)", cursor: "pointer",
              }}
            >
              {c.nazev_pripadu}
            </button>
          ))}
          {allowCreateCase && query.trim().length > 0 && (
            <button
              type="button"
              onMouseDown={() => {
                onCreateClick?.(query.trim());
                setDropdownOpen(false);
              }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px", fontSize: 13, border: "none",
                borderTop: filteredCases.length > 0 ? "1px solid var(--border)" : "none",
                background: "transparent",
                color: "#00abbd", fontWeight: 600, cursor: "pointer",
              }}
            >
              + Vytvořit „{query.trim()}"
            </button>
          )}
        </div>
      )}
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
  /** Current user role — used to restrict certain meeting types */
  userRole?: string;
}

export function MeetingFormModal({
  open,
  onClose,
  initial,
  onSave,
  saving,
  cases,
  isEdit: isEditProp,
  onDelete,
  allowCreateCase,
  createCaseFn,
  userRole,
}: MeetingFormModalProps) {
  useBodyScrollLock(open);
  const [form, setForm] = useState<MeetingForm>(initial);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingClientName, setPendingClientName] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);

  const { data: meetingDefaults } = useQuery({
    queryKey: ["app_config", "meeting_defaults"],
    queryFn: async () => {
      const { data } = await supabase.from("app_config").select("value").eq("key", "meeting_defaults").single();
      return (data?.value as unknown as Record<string, number>) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const initForm = { ...initial };
      setForm(initForm);
      setShowDeleteConfirm(false);
      setMoreOpen(false);
      setAutoCreating(false);
      setPendingClientName("");
    }
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reset SER to FSA if novacek
  useEffect(() => {
    if (userRole === "novacek" && form.meeting_type === "SER") {
      setForm((f) => ({ ...f, meeting_type: "FSA" }));
    }
  }, [userRole, form.meeting_type]);

  if (!open) return null;

  const set = (patch: Partial<MeetingForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  };
  const isEdit = isEditProp ?? false;
  const activeCases = cases.filter((c) => c.status === "aktivni");

  const handleCaseSelect = (c: Case) => {
    setPendingClientName("");
    set({ case_id: c.id, case_name: c.nazev_pripadu });
  };

  const handleCaseClear = () => {
    set({ case_id: "", case_name: "" });
  };

  const handleCreateClick = (name: string) => {
    setPendingClientName(name);
    // Auto-create the case immediately
    if (createCaseFn) {
      setAutoCreating(true);
      createCaseFn(name, "")
        .then((created) => {
          set({ case_id: created.id, case_name: created.nazev_pripadu });
          setPendingClientName("");
        })
        .catch(() => {})
        .finally(() => setAutoCreating(false));
    }
  };

  const canSave = !!(form.case_id || pendingClientName) && !!form.date;

  const handleSave = async () => {
    if (form.case_id) {
      onSave(form);
    } else if (pendingClientName && createCaseFn) {
      setAutoCreating(true);
      try {
        const created = await createCaseFn(pendingClientName, "");
        const updatedForm = { ...form, case_id: created.id, case_name: created.nazev_pripadu };
        onSave(updatedForm);
      } catch {
        // error handled upstream
      } finally {
        setAutoCreating(false);
      }
    }
  };

  const isSaving = saving || autoCreating;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - 64px)",
          paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 12px))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Upravit schůzku" : "Nová schůzka"}
        </h2>

        {/* 1. Case combobox */}
        <div className="mb-4">
          <CaseCombobox
            cases={activeCases}
            selectedId={form.case_id}
            onSelect={handleCaseSelect}
            onClear={handleCaseClear}
            allowCreateCase={!!createCaseFn}
            onCreateClick={handleCreateClick}
          />
        </div>

        {/* 2. Typ schůzky */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Typ schůzky</label>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-2 flex-1 flex-wrap">
              {(["FSA", "NAB", "SER", "POR", "POH", "INFO", "POST"] as MeetingType[])
                .filter((t) => (t !== "POR" || isEdit) && (t !== "SER" || isEdit) && (t !== "SER" || userRole !== "novacek"))
                .filter((t) => ((t !== "INFO" && t !== "POST") || canCreateInfoPost(userRole)))
                .map((t) => (
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
          <input
            type="date"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
            className="w-full min-w-0 h-10 rounded-xl border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Collapsible: Více možností */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          Více možností
        </button>

        {moreOpen && (
          <div className="space-y-4 mb-4 animate-in fade-in slide-in-from-top-1 duration-150">

            {/* Místo */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Místo</label>
              <div className="flex gap-2 mb-2">
                {(["osobne", "online"] as const).map((lt) => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => set({ location_type: form.location_type === lt ? "" : lt })}
                    className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${form.location_type === lt ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                    style={form.location_type === lt ? { background: "#00abbd" } : {}}
                  >
                    {lt === "osobne" ? "Osobně" : "Online"}
                  </button>
                ))}
              </div>
              {form.location_type && (
                <input
                  type="text"
                  value={form.location_detail}
                  onChange={(e) => set({ location_detail: e.target.value })}
                  placeholder={form.location_type === "osobne" ? "Adresa…" : "Platforma…"}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>

            {/* Poznámka */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Poznámka</label>
              <textarea
                value={form.poznamka}
                onChange={(e) => set({ poznamka: e.target.value })}
                rows={2}
                placeholder="Volitelné…"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
        )}

        {/* 7. Výsledek schůzky — jen při editaci existující schůzky */}
        {isEdit && !form.cancelled && (
          <div className="mb-4 p-3 rounded-xl border border-input">
            <label className="block text-xs font-semibold text-muted-foreground mb-3">Výsledek schůzky</label>

            {(form.meeting_type === "FSA" || form.meeting_type === "NAB") && (
              <NumberInput
                label="Doporučení"
                value={form.doporuceni_fsa}
                onChange={(v) => set({ doporuceni_fsa: v })}
              />
            )}

            {(form.meeting_type === "POR" || form.meeting_type === "SER") && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <NumberInput
                    label="Podepsané BJ"
                    value={form.podepsane_bj}
                    onChange={(v) => set({ podepsane_bj: v })}
                    step={0.5}
                  />
                </div>
                <div className="flex-1">
                  <NumberInput
                    label="Doporučení"
                    value={form.doporuceni_poradenstvi}
                    onChange={(v) => set({ doporuceni_poradenstvi: v })}
                  />
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
                <NumberInput
                  label="Doporučení"
                  value={form.doporuceni_pohovor}
                  onChange={(v) => set({ doporuceni_pohovor: v })}
                />
              </div>
            )}

            {(form.meeting_type === "INFO" || form.meeting_type === "POST") && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Zúčastnil se?</label>
                  <div className="flex gap-2">
                    {([true, false] as const).map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => set({ info_zucastnil_se: val })}
                        className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${form.info_zucastnil_se === val ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                        style={
                          form.info_zucastnil_se === val
                            ? { background: val === true ? "#00abbd" : "#fc7c71" }
                            : {}
                        }
                      >
                        {val === true ? "Ano" : "Ne"}
                      </button>
                    ))}
                  </div>
                </div>
                <NumberInput
                  label="Počet lidí (mimo Legatus)"
                  value={form.info_pocet_lidi}
                  onChange={(v) => set({ info_pocet_lidi: v })}
                />
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={isSaving || !canSave}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />} Uložit
        </button>

        {/* Cancel / Restore toggle — jen při editaci */}
        {isEdit && (
          <button
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
          </button>
        )}

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
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 h-9 rounded-lg border border-input text-sm font-semibold"
                  >
                    Zrušit
                  </button>
                  <button
                    onClick={onDelete}
                    className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
                    style={{ background: "#fc7c71" }}
                  >
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
