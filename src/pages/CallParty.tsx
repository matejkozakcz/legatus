import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Loader2, PhoneCall, AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { meetingTypeLabel, findDuplicateCases, type MeetingType } from "@/components/MeetingFormFields";
import { MeetingDetailModal, type MeetingDetailData } from "@/components/MeetingDetailModal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

type Outcome = "nezvedl" | "nedomluveno" | "domluveno";
type CPMeetingType = "FSA" | "SER" | "POH" | "NAB";
const CP_MEETING_TYPES: CPMeetingType[] = ["FSA", "SER", "POH", "NAB"];

const outcomeLabel: Record<Outcome, string> = {
  nezvedl: "Nezvedl",
  nedomluveno: "Nedomluveno",
  domluveno: "Domluveno",
};

interface EntryDraft {
  id?: string;
  client_name: string;
  outcome: Outcome;
  meeting_type: CPMeetingType | null;
  /** Pokud uživatel ručně přiřadil řádek k existujícímu případu, ukládáme ID. */
  linked_case_id?: string | null;
  /** Naplánování — vyplňuje se v kroku 2 */
  meeting_date?: string | null;
  meeting_time?: string | null;
  location_detail?: string | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  name: string;
  date: string;
  goal_called: number;
  goal_meetings: number;
  goal_fsa: number;
  goal_ser: number;
  goal_poh: number;
  goal_nab: number;
  notes: string | null;
  created_at: string;
}

interface EntryRow extends EntryDraft {
  id: string;
  session_id: string;
  created_meeting_id: string | null;
  created_case_id: string | null;
  sort_order: number;
}

const emptyEntry = (): EntryDraft => ({
  client_name: "",
  outcome: "nezvedl",
  meeting_type: null,
  linked_case_id: null,
  meeting_date: null,
  meeting_time: null,
  location_detail: null,
});

const today = () => new Date().toISOString().slice(0, 10);

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CallParty() {
  const [tab, setTab] = useState<"new" | "history">("new");
  const [openSession, setOpenSession] = useState<SessionRow | null>(null);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,171,189,0.12)", color: "#00abbd" }}
        >
          <PhoneCall className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Call party
          </h1>
          <p className="text-sm text-muted-foreground">Veď si záznam ze sessionů volání a sleduj plnění cílů.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "history")}>
        <TabsList>
          <TabsTrigger value="new">Nová Call party</TabsTrigger>
          <TabsTrigger value="history">Historie</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <NewCallPartyForm onSaved={() => setTab("history")} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryList onOpen={setOpenSession} />
        </TabsContent>
      </Tabs>

      {openSession && (
        <SessionDetailModal session={openSession} onClose={() => setOpenSession(null)} />
      )}
    </div>
  );
}

// ─── New form ────────────────────────────────────────────────────────────────
function NewCallPartyForm({ onSaved }: { onSaved: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today());
  const [goals, setGoals] = useState({
    called: 0,
    meetings: 0,
    fsa: 0,
    ser: 0,
    poh: 0,
    nab: 0,
  });
  const [entries, setEntries] = useState<EntryDraft[]>([emptyEntry(), emptyEntry(), emptyEntry()]);

  // Načti vlastní obchodní případy pro detekci duplicit (jednou na otevření stránky)
  const { data: existingCases = [] } = useQuery({
    queryKey: ["my_cases_for_duplicate_check", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, nazev_pripadu, status")
        .eq("user_id", profile!.id);
      if (error) throw error;
      return data as { id: string; nazev_pripadu: string; status: string }[];
    },
    enabled: !!profile,
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const filled = entries.filter((e) => e.client_name.trim());
    const called = filled.length;
    const domluveno = filled.filter((e) => e.outcome === "domluveno");
    return {
      called,
      meetings: domluveno.length,
      fsa: domluveno.filter((e) => e.meeting_type === "FSA").length,
      ser: domluveno.filter((e) => e.meeting_type === "SER").length,
      poh: domluveno.filter((e) => e.meeting_type === "POH").length,
      nab: domluveno.filter((e) => e.meeting_type === "NAB").length,
    };
  }, [entries]);

  const updateEntry = (i: number, patch: Partial<EntryDraft>) => {
    setEntries((arr) => arr.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };

  const removeEntry = (i: number) => setEntries((arr) => arr.filter((_, idx) => idx !== i));
  const addEntry = () => setEntries((arr) => [...arr, emptyEntry()]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Nepřihlášen");
      const validEntries = entries.filter((e) => e.client_name.trim());
      if (validEntries.length === 0) throw new Error("Přidej alespoň jeden záznam");

      // 1. session
      const { data: session, error: sessionErr } = await supabase
        .from("call_party_sessions")
        .insert({
          user_id: profile.id,
          name: name.trim() || `Call party ${format(parseISO(date), "d. M. yyyy", { locale: cs })}`,
          date,
          goal_called: goals.called,
          goal_meetings: goals.meetings,
          goal_fsa: goals.fsa,
          goal_ser: goals.ser,
          goal_poh: goals.poh,
          goal_nab: goals.nab,
        })
        .select()
        .single();
      if (sessionErr) throw sessionErr;

      // 2. for each "domluveno" → create case + meeting
      const week_start = (() => {
        const d = parseISO(date);
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - (day - 1));
        return d.toISOString().slice(0, 10);
      })();

      const enriched = await Promise.all(
        validEntries.map(async (e, idx) => {
          let created_case_id: string | null = null;
          let created_meeting_id: string | null = null;

          // Vyhodnoť, na který case má řádek napojení (pro každý outcome).
          // 1) explicitní volba uživatele má přednost
          // 2) jinak exact duplicate
          // 3) jinak (jen pro "domluveno") založ nový case
          if (e.linked_case_id) {
            created_case_id = e.linked_case_id;
          } else {
            const dup = findDuplicateCases(e.client_name.trim(), existingCases);
            if (dup.exact.length > 0) {
              created_case_id = dup.exact[0].id;
            } else if (e.outcome === "domluveno" && e.meeting_type) {
              const { data: caseRow, error: caseErr } = await supabase
                .from("cases")
                .insert({
                  user_id: profile.id,
                  nazev_pripadu: e.client_name.trim(),
                  status: "aktivni",
                })
                .select()
                .single();
              if (caseErr) throw caseErr;
              created_case_id = caseRow.id;
            }
          }

          if (e.outcome === "domluveno" && e.meeting_type && created_case_id) {
            const meetingDate = e.meeting_date || date;
            const mWeekStart = (() => {
              const d = parseISO(meetingDate);
              const day = d.getUTCDay() || 7;
              d.setUTCDate(d.getUTCDate() - (day - 1));
              return d.toISOString().slice(0, 10);
            })();
            const { data: meetingRow, error: mErr } = await supabase
              .from("client_meetings")
              .insert({
                user_id: profile.id,
                date: meetingDate,
                week_start: mWeekStart,
                meeting_time: e.meeting_time || null,
                location_detail: e.location_detail?.trim() || null,
                meeting_type: e.meeting_type,
                case_id: created_case_id,
                case_name: e.client_name.trim(),
                outcome_recorded: false,
              })
              .select()
              .single();
            if (mErr) throw mErr;
            created_meeting_id = meetingRow.id;
          }

          return {
            session_id: session.id,
            client_name: e.client_name.trim(),
            outcome: e.outcome,
            meeting_type: e.outcome === "domluveno" ? e.meeting_type : null,
            created_case_id,
            created_meeting_id,
            sort_order: idx,
          };
        })
      );

      const { error: eErr } = await supabase.from("call_party_entries").insert(enriched);
      if (eErr) throw eErr;
    },
    onSuccess: () => {
      toast.success("Call party uložena");
      qc.invalidateQueries({ queryKey: ["call_party_sessions"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["my_cases_for_duplicate_check"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      // reset
      setName("");
      setDate(today());
      setGoals({ called: 0, meetings: 0, fsa: 0, ser: 0, poh: 0, nab: 0 });
      setEntries([emptyEntry(), emptyEntry(), emptyEntry()]);
      setStep(1);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Uložení selhalo"),
  });

  const scheduledEntries = entries.filter(
    (e) => e.client_name.trim() && e.outcome === "domluveno" && e.meeting_type
  );
  const validCount = entries.filter((e) => e.client_name.trim()).length;

  const handleNext = () => {
    if (validCount === 0) {
      toast.error("Přidej alespoň jeden záznam");
      return;
    }
    setStep(2);
  };

  if (step === 2) {
    return (
      <div className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs font-heading uppercase tracking-wide text-muted-foreground">
          <span>Krok 1</span>
          <span>›</span>
          <span style={{ color: "#00abbd" }}>Krok 2 — Naplánovat schůzky</span>
        </div>

        {/* Summary */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--deep-hex, #00555f)" }}>
            Shrnutí Call party
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <SummaryStat label="Zavoláno" actual={counts.called} goal={goals.called} />
            <SummaryStat label="Domluveno" actual={counts.meetings} goal={goals.meetings} />
            <SummaryStat label="Analýza" actual={counts.fsa} goal={goals.fsa} />
            <SummaryStat label="Servis" actual={counts.ser} goal={goals.ser} />
            <SummaryStat label="Pohovor" actual={counts.poh} goal={goals.poh} />
            <SummaryStat label="Nábor" actual={counts.nab} goal={goals.nab} />
          </div>
        </div>

        {/* Schedule meetings */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--deep-hex, #00555f)" }}>
            Naplánuj domluvené schůzky
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Doplň datum (povinné), čas a místo (volitelné). Bez data se použije datum Call party.
          </p>
          {scheduledEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Žádné domluvené schůzky k naplánování.
            </p>
          ) : (
            <div className="space-y-3">
              {scheduledEntries.map((e) => {
                const realIdx = entries.indexOf(e);
                return (
                  <ScheduleRow
                    key={realIdx}
                    entry={e}
                    fallbackDate={date}
                    onChange={(p) => updateEntry(realIdx, p)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep(1)} className="flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Zpět k hovorům
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="font-heading font-semibold"
            style={{ background: "#fc7c71", color: "#fff" }}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Uložit Call party
              </span>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-heading uppercase tracking-wide text-muted-foreground">
        <span style={{ color: "#00abbd" }}>Krok 1 — Záznam hovorů</span>
        <span>›</span>
        <span>Krok 2</span>
      </div>

      {/* Header */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">Název</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pondělní call party" />
        </div>
        <div>
          <label className="block text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">Datum</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* Goals */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <h2 className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--deep-hex, #00555f)" }}>
          Cíle
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <GoalInput label="Zavolaných" value={goals.called} actual={counts.called} onChange={(v) => setGoals((g) => ({ ...g, called: v }))} />
          <GoalInput label="Domluveno" value={goals.meetings} actual={counts.meetings} onChange={(v) => setGoals((g) => ({ ...g, meetings: v }))} />
          <GoalInput label="Analýza (FSA)" value={goals.fsa} actual={counts.fsa} onChange={(v) => setGoals((g) => ({ ...g, fsa: v }))} />
          <GoalInput label="Servis (SER)" value={goals.ser} actual={counts.ser} onChange={(v) => setGoals((g) => ({ ...g, ser: v }))} />
          <GoalInput label="Pohovor (POH)" value={goals.poh} actual={counts.poh} onChange={(v) => setGoals((g) => ({ ...g, poh: v }))} />
          <GoalInput label="Nábor (NAB)" value={goals.nab} actual={counts.nab} onChange={(v) => setGoals((g) => ({ ...g, nab: v }))} />
        </div>
      </div>

      {/* Entries */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-sm font-semibold" style={{ color: "var(--deep-hex, #00555f)" }}>
            Záznamy hovorů
          </h2>
          <button
            onClick={addEntry}
            className="flex items-center gap-1.5 text-sm font-heading font-semibold px-3 py-1.5 rounded-xl border border-input hover:bg-muted transition"
          >
            <Plus className="h-4 w-4" /> Přidat řádek
          </button>
        </div>
        <div className="space-y-2">
          {entries.map((e, i) => (
            <EntryRow
              key={i}
              entry={e}
              onChange={(p) => updateEntry(i, p)}
              onRemove={() => removeEntry(i)}
              canRemove={entries.length > 1}
              existingCases={existingCases}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          className="font-heading font-semibold"
          style={{ background: "#fc7c71", color: "#fff" }}
        >
          Mám dovoláno →
        </Button>
      </div>
    </div>
  );
}

function SummaryStat({ label, actual, goal }: { label: string; actual: number; goal: number }) {
  const reached = goal > 0 && actual >= goal;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-heading font-semibold text-base" style={{ color: reached ? "#00abbd" : "var(--deep-hex, #00555f)" }}>
        {actual}{goal > 0 ? ` / ${goal}` : ""}
      </div>
    </div>
  );
}

function ScheduleRow({
  entry,
  fallbackDate,
  onChange,
}: {
  entry: EntryDraft;
  fallbackDate: string;
  onChange: (patch: Partial<EntryDraft>) => void;
}) {
  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-heading font-semibold text-sm" style={{ color: "var(--deep-hex, #00555f)" }}>
          {entry.client_name}
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-md font-heading font-semibold"
          style={{ background: "rgba(0,171,189,0.12)", color: "var(--deep-hex, #00555f)" }}
        >
          {meetingTypeLabel(entry.meeting_type as MeetingType)}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Datum *
          </label>
          <Input
            type="date"
            value={entry.meeting_date || fallbackDate}
            onChange={(e) => onChange({ meeting_date: e.target.value })}
            className="h-9"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Čas
          </label>
          <Input
            type="time"
            value={entry.meeting_time || ""}
            onChange={(e) => onChange({ meeting_time: e.target.value || null })}
            className="h-9"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Místo
          </label>
          <Input
            placeholder="Kavárna, Online, Adresa…"
            value={entry.location_detail || ""}
            onChange={(e) => onChange({ location_detail: e.target.value || null })}
            className="h-9"
          />
        </div>
      </div>
    </div>
  );
}

function GoalInput({
  label,
  value,
  actual,
  onChange,
}: {
  label: string;
  value: number;
  actual: number;
  onChange: (v: number) => void;
}) {
  const reached = value > 0 && actual >= value;
  return (
    <div>
      <label className="block text-[11px] font-heading uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-9"
        />
        <span
          className="text-xs font-heading font-semibold whitespace-nowrap"
          style={{ color: reached ? "#00abbd" : "hsl(var(--muted-foreground))" }}
        >
          {actual}/{value || 0}
        </span>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  onChange,
  onRemove,
  canRemove,
  existingCases = [],
}: {
  entry: EntryDraft;
  onChange: (patch: Partial<EntryDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
  existingCases?: { id: string; nazev_pripadu: string; status: string }[];
}) {
  // Debounced duplicate check — počkej 400ms po posledním stisku klávesy,
  // aby se nespouštěla detekce při každém znaku.
  const [debouncedName, setDebouncedName] = useState(entry.client_name);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(entry.client_name), 400);
    return () => clearTimeout(t);
  }, [entry.client_name]);

  const duplicates = useMemo(() => {
    if (!debouncedName.trim() || existingCases.length === 0) return { exact: [], similar: [] };
    return findDuplicateCases(debouncedName, existingCases);
  }, [debouncedName, existingCases]);

  const hasExact = duplicates.exact.length > 0;
  const hasSimilar = duplicates.similar.length > 0;
  const showWarning = hasExact || hasSimilar;

  return (
    <div>
      <div className="grid grid-cols-12 gap-2 items-center">
        <Input
          className={`col-span-5 h-9 ${showWarning ? "border-amber-500" : ""}`}
          placeholder="Jméno klienta"
          value={entry.client_name}
          onChange={(e) => onChange({ client_name: e.target.value })}
        />
        <select
          className="col-span-3 h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={entry.outcome}
          onChange={(e) => {
            const outcome = e.target.value as Outcome;
            onChange({ outcome, meeting_type: outcome === "domluveno" ? entry.meeting_type ?? "FSA" : null });
          }}
        >
          {(Object.keys(outcomeLabel) as Outcome[]).map((o) => (
            <option key={o} value={o}>
              {outcomeLabel[o]}
            </option>
          ))}
        </select>
        {entry.outcome === "domluveno" ? (
          <select
            className="col-span-3 h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={entry.meeting_type ?? "FSA"}
            onChange={(e) => onChange({ meeting_type: e.target.value as CPMeetingType })}
          >
            {CP_MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {meetingTypeLabel(t as MeetingType)}
              </option>
            ))}
          </select>
        ) : (
          <div className="col-span-3" />
        )}
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="col-span-1 h-9 rounded-md border border-input flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-40"
          title="Smazat"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {entry.linked_case_id && (
        <div className="mt-1 ml-1 flex items-center gap-2 text-xs" style={{ color: "#00abbd" }}>
          <span
            className="px-2 py-0.5 rounded-md font-heading font-semibold"
            style={{ background: "rgba(0,171,189,0.12)" }}
          >
            Přiřazeno k případu: „{existingCases.find((c) => c.id === entry.linked_case_id)?.nazev_pripadu ?? "—"}"
          </span>
          <button
            onClick={() => onChange({ linked_case_id: null })}
            className="text-muted-foreground hover:text-destructive"
            title="Zrušit přiřazení"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {showWarning && !entry.linked_case_id && (
        <div
          className="mt-1 ml-1 flex items-start gap-2 text-xs flex-wrap"
          style={{ color: hasExact ? "#b45309" : "#92400e" }}
        >
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            {hasExact
              ? `Tento klient už máš jako obchodní případ: „${duplicates.exact[0].nazev_pripadu}"`
              : `Podobný případ existuje: „${duplicates.similar[0].nazev_pripadu}". Zkontroluj duplicitu.`}
          </span>
          {[...duplicates.exact, ...duplicates.similar].slice(0, 3).map((c) => (
            <button
              key={c.id}
              onClick={() => onChange({ linked_case_id: c.id })}
              className="px-2 py-0.5 rounded-md font-heading font-semibold border transition hover:bg-muted"
              style={{ borderColor: "#00abbd", color: "#00abbd" }}
            >
              Přiřadit k „{c.nazev_pripadu}"
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────
function HistoryList({ onOpen }: { onOpen: (s: SessionRow) => void }) {
  const { profile } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["call_party_sessions", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_party_sessions")
        .select("*")
        .eq("user_id", profile!.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SessionRow[];
    },
    enabled: !!profile,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Zatím žádná Call party. Založ první v záložce vlevo.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((s) => (
        <button
          key={s.id}
          onClick={() => onOpen(s)}
          className="w-full text-left rounded-2xl border border-border bg-card p-4 hover:border-ring transition flex items-center justify-between"
        >
          <div>
            <div className="font-heading font-semibold" style={{ color: "var(--deep-hex, #00555f)" }}>
              {s.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {format(parseISO(s.date), "EEEE d. M. yyyy", { locale: cs })}
            </div>
          </div>
          <SessionSummaryBadges sessionId={s.id} goals={s} />
        </button>
      ))}
    </div>
  );
}

function SessionSummaryBadges({ sessionId, goals }: { sessionId: string; goals: SessionRow }) {
  const { data } = useQuery({
    queryKey: ["call_party_entries_summary", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_party_entries")
        .select("outcome, client_name")
        .eq("session_id", sessionId);
      if (error) throw error;
      return data as { outcome: Outcome; client_name: string }[];
    },
  });
  const called = (data || []).filter((e) => e.client_name.trim()).length;
  const domluveno = (data || []).filter((e) => e.outcome === "domluveno").length;
  return (
    <div className="flex gap-2 text-xs">
      <span className="px-2 py-1 rounded-lg bg-muted">
        Zavoláno: <strong>{called}</strong>
        {goals.goal_called > 0 ? `/${goals.goal_called}` : ""}
      </span>
      <span
        className="px-2 py-1 rounded-lg"
        style={{ background: "rgba(0,171,189,0.12)", color: "var(--deep-hex, #00555f)" }}
      >
        Domluveno: <strong>{domluveno}</strong>
        {goals.goal_meetings > 0 ? `/${goals.goal_meetings}` : ""}
      </span>
    </div>
  );
}

// ─── Detail modal ────────────────────────────────────────────────────────────
function SessionDetailModal({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  useBodyScrollLock(true);
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);

  const { data: openMeeting } = useQuery({
    queryKey: ["call_party_open_meeting", openMeetingId],
    enabled: !!openMeetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("*")
        .eq("id", openMeetingId!)
        .maybeSingle();
      if (error) throw error;
      return data as MeetingDetailData | null;
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["call_party_entries", session.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_party_entries")
        .select("*")
        .eq("session_id", session.id)
        .order("sort_order");
      if (error) throw error;
      return data as EntryRow[];
    },
  });

  // Edit state
  const [name, setName] = useState(session.name);
  const [date, setDate] = useState(session.date);
  const [draft, setDraft] = useState<EntryDraft[] | null>(null);
  const startEdit = () => {
    setName(session.name);
    setDate(session.date);
    setDraft(
      (entries || []).map((e) => ({
        id: e.id,
        client_name: e.client_name,
        outcome: e.outcome,
        meeting_type: (e.meeting_type as CPMeetingType) ?? null,
      }))
    );
    setEditMode(true);
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const { error: sErr } = await supabase
        .from("call_party_sessions")
        .update({ name: name.trim() || session.name, date })
        .eq("id", session.id);
      if (sErr) throw sErr;

      // delete entries not in draft
      const keepIds = draft.filter((d) => d.id).map((d) => d.id!);
      const toDelete = (entries || []).filter((e) => !keepIds.includes(e.id));
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("call_party_entries")
          .delete()
          .in("id", toDelete.map((e) => e.id));
        if (error) throw error;
      }

      // upsert
      for (let i = 0; i < draft.length; i++) {
        const d = draft[i];
        const payload = {
          session_id: session.id,
          client_name: d.client_name.trim(),
          outcome: d.outcome,
          meeting_type: d.outcome === "domluveno" ? d.meeting_type : null,
          sort_order: i,
        };
        if (d.id) {
          await supabase.from("call_party_entries").update(payload).eq("id", d.id);
        } else if (d.client_name.trim()) {
          await supabase.from("call_party_entries").insert(payload);
        }
      }
    },
    onSuccess: () => {
      toast.success("Změny uloženy");
      qc.invalidateQueries({ queryKey: ["call_party_sessions"] });
      qc.invalidateQueries({ queryKey: ["call_party_entries", session.id] });
      qc.invalidateQueries({ queryKey: ["call_party_entries_summary", session.id] });
      setEditMode(false);
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("call_party_sessions").delete().eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Call party smazána");
      qc.invalidateQueries({ queryKey: ["call_party_sessions"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = () => {
    if (confirm("Opravdu smazat tuto Call party? Vytvořené schůzky a obchodní případy zůstanou zachovány.")) {
      deleteSession.mutate();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-card w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--deep-hex, #00555f)" }}>
              {session.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(session.date), "EEEE d. M. yyyy", { locale: cs })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {editMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">Název</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">Datum</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border p-3">
            <h3 className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">Cíle</h3>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <GoalReadout label="Zavolaných" value={session.goal_called} />
              <GoalReadout label="Domluveno" value={session.goal_meetings} />
              <GoalReadout label="Analýza" value={session.goal_fsa} />
              <GoalReadout label="Servis" value={session.goal_ser} />
              <GoalReadout label="Pohovor" value={session.goal_poh} />
              <GoalReadout label="Nábor" value={session.goal_nab} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">Záznamy</h3>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : editMode && draft ? (
              <div className="space-y-2">
                {draft.map((e, i) => (
                  <EntryRow
                    key={i}
                    entry={e}
                    onChange={(p) =>
                      setDraft((d) => (d ? d.map((x, idx) => (idx === i ? { ...x, ...p } : x)) : d))
                    }
                    onRemove={() => setDraft((d) => (d ? d.filter((_, idx) => idx !== i) : d))}
                    canRemove={draft.length > 1}
                  />
                ))}
                <button
                  onClick={() => setDraft((d) => [...(d || []), emptyEntry()])}
                  className="flex items-center gap-1.5 text-sm font-heading font-semibold px-3 py-1.5 rounded-xl border border-input hover:bg-muted transition"
                >
                  <Plus className="h-4 w-4" /> Přidat řádek
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {(entries || []).map((e) => {
                  const clickable = !!e.created_meeting_id;
                  const Wrapper: any = clickable ? "button" : "div";
                  return (
                    <Wrapper
                      key={e.id}
                      {...(clickable
                        ? {
                            onClick: () => setOpenMeetingId(e.created_meeting_id!),
                            title: "Otevřít detail schůzky",
                          }
                        : {})}
                      className={`w-full flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0 text-left ${
                        clickable ? "hover:bg-muted/50 rounded-md px-2 -mx-2 transition" : ""
                      }`}
                    >
                      <span className={clickable ? "underline-offset-2 hover:underline" : ""}>
                        {e.client_name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{outcomeLabel[e.outcome]}</span>
                        {e.outcome === "domluveno" && e.meeting_type && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-md font-heading font-semibold"
                            style={{ background: "rgba(0,171,189,0.12)", color: "var(--deep-hex, #00555f)" }}
                          >
                            {meetingTypeLabel(e.meeting_type as MeetingType)}
                          </span>
                        )}
                      </span>
                    </Wrapper>
                  );
                })}
                {(entries || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Žádné záznamy.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 p-5 border-t border-border">
          <button
            onClick={handleDelete}
            disabled={deleteSession.isPending}
            className="text-sm font-heading text-destructive hover:underline flex items-center gap-1.5"
          >
            <Trash2 className="h-4 w-4" /> Smazat
          </button>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <Button variant="outline" onClick={() => { setEditMode(false); setDraft(null); }}>
                  Zrušit
                </Button>
                <Button
                  onClick={() => saveEdit.mutate()}
                  disabled={saveEdit.isPending}
                  style={{ background: "#fc7c71", color: "#fff" }}
                >
                  {saveEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Uložit změny"}
                </Button>
              </>
            ) : (
              <Button onClick={startEdit} variant="outline" className="flex items-center gap-1.5">
                <Pencil className="h-4 w-4" /> Upravit
              </Button>
            )}
          </div>
        </div>
      </div>

      {openMeetingId && (
        <MeetingDetailModal
          open={!!openMeetingId}
          onClose={() => setOpenMeetingId(null)}
          meeting={openMeeting ?? null}
          onEdit={() => {
            toast.info("Editaci schůzky proveď v Kalendáři nebo Obchodních případech.");
          }}
          onSaveOutcome={async (meetingId, data) => {
            const { error } = await supabase.from("client_meetings").update(data).eq("id", meetingId);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Výsledek uložen");
            qc.invalidateQueries({ queryKey: ["call_party_open_meeting", meetingId] });
            qc.invalidateQueries({ queryKey: ["meetings"] });
            qc.invalidateQueries({ queryKey: ["calendar_meetings"] });
            qc.invalidateQueries({ queryKey: ["activity"] });
            setOpenMeetingId(null);
          }}
          onCancel={async () => {
            if (!openMeetingId) return;
            const { error } = await supabase
              .from("client_meetings")
              .update({ cancelled: true })
              .eq("id", openMeetingId);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Schůzka zrušena");
            qc.invalidateQueries({ queryKey: ["call_party_open_meeting", openMeetingId] });
            qc.invalidateQueries({ queryKey: ["meetings"] });
            qc.invalidateQueries({ queryKey: ["calendar_meetings"] });
            setOpenMeetingId(null);
          }}
        />
      )}
    </div>
  );
}

function GoalReadout({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-heading font-semibold" style={{ color: "var(--deep-hex, #00555f)" }}>{value || "—"}</span>
    </div>
  );
}
