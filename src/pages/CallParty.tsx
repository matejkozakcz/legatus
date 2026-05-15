import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isToday } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Loader2, PhoneCall, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, History, ChevronDown, Users, UserRound, Trophy } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { GroupCallPartyWizard } from "@/components/group-call-party/GroupCallPartyWizard";
import { GroupCallPartyLeaderboardTab } from "@/components/group-call-party/GroupCallPartyLeaderboardTab";
import { useMyGroupParties } from "@/hooks/useGroupParty";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useTheme } from "@/contexts/ThemeContext";
import { meetingTypeLabel, findDuplicateCases, type MeetingType } from "@/components/MeetingFormFields";
import { MeetingDetailModal, type MeetingDetailData } from "@/components/MeetingDetailModal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

type Outcome = "nezvedl" | "nedomluveno" | "domluveno";
type CPMeetingType = "FSA" | "SER" | "POH" | "NAB";
const CP_MEETING_TYPES: CPMeetingType[] = ["FSA", "SER", "POH", "NAB"];

type GoalType = "called" | "meetings" | "FSA" | "SER" | "POH" | "NAB";
const ALL_GOAL_TYPES: GoalType[] = ["called", "meetings", "FSA", "SER", "POH", "NAB"];

interface GoalItem {
  type: GoalType;
  target: number | null;
}

// label = uppercase label color, bar = strong fill color, tint = card background tint, border = card border tint
const GOAL_META: Record<GoalType, { label: string; labelColor: string; bar: string; tint: string; border: string }> = {
  called:   { label: "ZAVOLÁNO",      labelColor: "#5a7479", bar: "#00abbd", tint: "rgba(0,171,189,0.05)",  border: "rgba(0,171,189,0.20)" },
  meetings: { label: "DOMLUVENO",     labelColor: "#5a7479", bar: "#00abbd", tint: "rgba(0,171,189,0.05)",  border: "rgba(0,171,189,0.20)" },
  FSA:      { label: "ANALÝZA (FSA)", labelColor: "#b8801a", bar: "#F59E0B", tint: "rgba(245,158,11,0.05)", border: "rgba(245,158,11,0.22)" },
  SER:      { label: "SERVIS (SER)",  labelColor: "#c2410c", bar: "#EF4444", tint: "rgba(239,68,68,0.05)",  border: "rgba(239,68,68,0.22)" },
  POH:      { label: "POHOVOR (POH)", labelColor: "#0a6e60", bar: "#0D9488", tint: "rgba(13,148,136,0.05)", border: "rgba(13,148,136,0.22)" },
  NAB:      { label: "NÁBOR (NAB)",   labelColor: "#6d28d9", bar: "#8B5CF6", tint: "rgba(139,92,246,0.05)", border: "rgba(139,92,246,0.22)" },
};

const GOAL_LABEL_SHORT: Record<GoalType, string> = {
  called: "Zavoláno",
  meetings: "Domluveno",
  FSA: "Analýza (FSA)",
  SER: "Servis (SER)",
  POH: "Pohovor (POH)",
  NAB: "Nábor (NAB)",
};

const outcomeLabel: Record<Outcome, string> = {
  nezvedl: "Nezvedl",
  nedomluveno: "Nedomluveno",
  domluveno: "Domluveno",
};

const MEETING_TYPE_PILL: Record<CPMeetingType, { color: string; bg: string }> = {
  FSA: { color: "#b8801a", bg: "rgba(245,158,11,0.18)" },
  SER: { color: "#c2410c", bg: "rgba(239,68,68,0.18)" },
  POH: { color: "#0a6e60", bg: "rgba(13,148,136,0.18)" },
  NAB: { color: "#6d28d9", bg: "rgba(139,92,246,0.20)" },
};

interface EntryDraft {
  id?: string;
  client_name: string;
  outcome: Outcome;
  meeting_type: CPMeetingType | null;
  linked_case_id?: string | null;
  meeting_date?: string | null;
  meeting_time?: string | null;
  location_detail?: string | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  name: string;
  date: string;
  goals: GoalItem[];
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

function parseGoals(raw: unknown): GoalItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<GoalType>();
  const out: GoalItem[] = [];
  for (const g of raw as any[]) {
    if (!g || typeof g !== "object") continue;
    const t = g.type as GoalType;
    if (!ALL_GOAL_TYPES.includes(t) || seen.has(t)) continue;
    seen.add(t);
    const target = g.target == null ? null : Number(g.target);
    out.push({ type: t, target: Number.isFinite(target as number) ? (target as number) : null });
  }
  return out;
}

function computeCurrent(type: GoalType, entries: { client_name: string; outcome: Outcome; meeting_type: CPMeetingType | null }[]): number {
  const filled = entries.filter((e) => e.client_name.trim());
  if (type === "called") return filled.length;
  const dom = filled.filter((e) => e.outcome === "domluveno");
  if (type === "meetings") return dom.length;
  return dom.filter((e) => e.meeting_type === type).length;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CallParty() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"new" | "history" | "leaderboard">("new");
  const [searchParams, setSearchParams] = useSearchParams();
  const directPartyId = searchParams.get("party");
  const [openSession, setOpenSession] = useState<SessionRow | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Today's call count for header subtitle
  const { data: todayCount = 0 } = useQuery({
    queryKey: ["call_party_today_count", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data: sess } = await supabase
        .from("call_party_sessions")
        .select("id")
        .eq("user_id", profile!.id)
        .eq("date", today());
      const ids = (sess || []).map((s: any) => s.id);
      if (ids.length === 0) return 0;
      const { count } = await supabase
        .from("call_party_entries")
        .select("id", { count: "exact", head: true })
        .in("session_id", ids);
      return count || 0;
    },
    staleTime: 30_000,
  });

  const tabs = [
    { key: "new" as const, label: "Nová Call party", icon: <PhoneCall size={14} /> },
    { key: "leaderboard" as const, label: "Žebříček", icon: <Trophy size={14} /> },
    { key: "history" as const, label: "Historie", icon: <History size={14} /> },
  ];

  // Auto-open Nová with party context when ?party=… is present
  useEffect(() => {
    if (directPartyId) setTab("new");
  }, [directPartyId]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }} className="px-4 md:px-8 py-6 md:py-10">
      {/* Header — title left, segmented pill right */}
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: 22 }}>
        <div className="flex items-center gap-3">
          <PhoneCall className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
          <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)", lineHeight: 1.1 }}>
            Call party
          </h1>
          <span style={{ fontSize: 13, color: "#5a7479" }}>· {todayCount} {todayCount === 1 ? "hovor" : todayCount >= 2 && todayCount <= 4 ? "hovory" : "hovorů"} dnes</span>
        </div>

        <div style={{
          display: "inline-flex",
          background: isDark ? "rgba(255,255,255,0.06)" : "#eef3f4",
          borderRadius: 999,
          padding: 4,
          gap: 4,
        }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: tab === t.key ? 700 : 500,
                fontFamily: "Poppins, sans-serif",
                background: tab === t.key
                  ? (isDark ? "rgba(0,171,189,0.2)" : "#ffffff")
                  : "transparent",
                color: tab === t.key
                  ? (isDark ? "#4dd8e8" : "#00555f")
                  : (isDark ? "#7aadb3" : "#6b8a8f"),
                boxShadow: tab === t.key
                  ? (isDark ? "none" : "0 1px 4px rgba(0,0,0,0.08)")
                  : "none",
                transition: "all 0.15s ease",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "new" && (
        <NewCallPartyEntry
          directPartyId={directPartyId}
          onClearDirect={() => setSearchParams({})}
          onSaved={() => setTab("history")}
        />
      )}
      {tab === "leaderboard" && (
        <GroupCallPartyLeaderboardTab
          onOpenParty={(id) => { setSearchParams({ party: id }); setTab("new"); }}
        />
      )}
      {tab === "history" && <HistoryList onOpen={setOpenSession} />}

      {openSession && <SessionDetailModal session={openSession} onClose={() => setOpenSession(null)} />}
    </div>
  );
}

// ─── Entry: chooser → private wizard | group wizard ──────────────────────────
function NewCallPartyEntry({
  directPartyId,
  onClearDirect,
  onSaved,
}: {
  directPartyId: string | null;
  onClearDirect: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<"chooser" | "private" | "group">(
    directPartyId ? "group" : "chooser",
  );
  const [groupPartyId, setGroupPartyId] = useState<string | null>(directPartyId);

  // Sync if directPartyId changes externally
  useEffect(() => {
    if (directPartyId) {
      setGroupPartyId(directPartyId);
      setMode("group");
    }
  }, [directPartyId]);

  const { data: parties = [] } = useMyGroupParties(profile?.id ?? null);
  const ongoing = parties.filter((p) => p.status === "live" || p.status === "scheduled");

  const goChooser = () => {
    setMode("chooser");
    setGroupPartyId(null);
    if (directPartyId) onClearDirect();
  };

  if (mode === "private") {
    return <NewCallPartyForm onSaved={onSaved} onBack={() => setMode("chooser")} />;
  }
  if (mode === "group") {
    return <GroupCallPartyWizard initialPartyId={groupPartyId} onClose={goChooser} />;
  }

  // Chooser
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <ChooserCard
          icon={<UserRound className="h-10 w-10" strokeWidth={1.5} />}
          title="Soukromá"
          description="Budu volat sám."
          onClick={() => setMode("private")}
        />
        <ChooserCard
          icon={<Users className="h-10 w-10" strokeWidth={1.5} />}
          title="Skupinová"
          description="Apes together strong."
          onClick={() => { setGroupPartyId(null); setMode("group"); }}
          accent
        />
      </div>

      {ongoing.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold text-xs uppercase tracking-wide mb-2" style={{ color: "#5a7479" }}>
            Pokračovat
          </h3>
          <div className="space-y-2">
            {ongoing.map((p) => (
              <button
                key={p.id}
                onClick={() => { setGroupPartyId(p.id); setMode("group"); }}
                className="w-full text-left rounded-xl border border-border bg-card p-3 hover:shadow-md transition-shadow flex items-center gap-3"
              >
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: p.status === "live" ? "#22c55e" : "#f59e0b", color: "#fff" }}
                >
                  {p.status === "live" ? "LIVE" : "Naplánováno"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-semibold text-sm truncate" style={{ color: "var(--text-primary, #00555f)" }}>{p.name}</div>
                  {p.scheduled_at && (
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(p.scheduled_at), "EEEE d. M. · HH:mm", { locale: cs })}
                    </div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChooserCard({
  icon, title, description, onClick, accent,
}: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-2xl border border-border bg-card p-6 text-left transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{
        background: accent ? "linear-gradient(135deg, rgba(0,171,189,0.08), rgba(0,85,95,0.04))" : undefined,
      }}
    >
      <div
        className="inline-flex items-center justify-center rounded-2xl mb-4"
        style={{
          width: 64, height: 64,
          background: accent ? "rgba(0,171,189,0.12)" : "rgba(0,85,95,0.06)",
          color: accent ? "#00abbd" : "#00555f",
        }}
      >
        {icon}
      </div>
      <h3 className="font-heading font-bold text-lg mb-1" style={{ color: "var(--text-primary, #00555f)" }}>{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <ArrowRight
        className="absolute top-6 right-6 h-5 w-5 transition-transform group-hover:translate-x-1"
        style={{ color: accent ? "#00abbd" : "#5a7479" }}
      />
    </button>
  );
}

// ─── New form ────────────────────────────────────────────────────────────────
function NewCallPartyForm({ onSaved }: { onSaved: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today());
  const [goals, setGoals] = useState<GoalItem[]>([
    { type: "called", target: null },
    { type: "meetings", target: null },
  ]);
  const [entries, setEntries] = useState<EntryDraft[]>([emptyEntry()]);

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

  const updateEntry = (i: number, patch: Partial<EntryDraft>) => {
    setEntries((arr) => arr.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const removeEntry = (i: number) => setEntries((arr) => arr.filter((_, idx) => idx !== i));
  const addEntry = () => setEntries((arr) => [...arr, emptyEntry()]);

  const summary = useMemo(() => {
    const filled = entries.filter((e) => e.client_name.trim());
    return {
      called: filled.length,
      domluveno: filled.filter((e) => e.outcome === "domluveno").length,
      nezvedl: filled.filter((e) => e.outcome === "nezvedl").length,
    };
  }, [entries]);

  const calledGoal = goals.find((g) => g.type === "called");

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Nepřihlášen");
      const validEntries = entries.filter((e) => e.client_name.trim());
      if (validEntries.length === 0) throw new Error("Přidej alespoň jeden záznam");

      const cleanGoals = goals.filter((g) => g.target != null && g.target > 0);

      const { data: session, error: sessionErr } = await supabase
        .from("call_party_sessions")
        .insert({
          user_id: profile.id,
          name: name.trim() || `Call party ${format(parseISO(date), "d. M. yyyy", { locale: cs })}`,
          date,
          goals: cleanGoals as any,
        })
        .select()
        .single();
      if (sessionErr) throw sessionErr;

      const enriched = await Promise.all(
        validEntries.map(async (e, idx) => {
          let created_case_id: string | null = null;
          let created_meeting_id: string | null = null;

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
        }),
      );

      const { error: eErr } = await supabase.from("call_party_entries").insert(enriched);
      if (eErr) throw eErr;
    },
    onSuccess: () => {
      toast.success("Call party uložena");
      qc.invalidateQueries({ queryKey: ["call_party_sessions"] });
      qc.invalidateQueries({ queryKey: ["call_party_today_count"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["my_cases_for_duplicate_check"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setName("");
      setDate(today());
      setGoals([{ type: "called", target: null }, { type: "meetings", target: null }]);
      setEntries([emptyEntry()]);
      setStep(1);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Uložení selhalo"),
  });

  const scheduledEntries = entries.filter((e) => e.client_name.trim() && e.outcome === "domluveno" && e.meeting_type);
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
        <StepIndicator step={2} />

        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--deep-hex, #00555f)" }}>
            Shrnutí Call party
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {goals.filter((g) => g.target != null && g.target > 0).map((g) => (
              <SummaryStat
                key={g.type}
                label={GOAL_LABEL_SHORT[g.type]}
                actual={computeCurrent(g.type, entries as any)}
                goal={g.target!}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--deep-hex, #00555f)" }}>
            Naplánuj domluvené schůzky
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Doplň datum (povinné), čas a místo (volitelné). Bez data se použije datum Call party.
          </p>
          {scheduledEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Žádné domluvené schůzky k naplánování.</p>
          ) : (
            <div className="space-y-3">
              {scheduledEntries.map((e) => {
                const realIdx = entries.indexOf(e);
                return (
                  <ScheduleRow key={realIdx} entry={e} fallbackDate={date} onChange={(p) => updateEntry(realIdx, p)} />
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
    <div className="space-y-5" style={{ paddingBottom: 96 }}>
      <StepIndicator step={1} />

      {/* Name + Date */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">Název</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pondělní call party" />
        </div>
        <div>
          <label className="block text-xs font-heading uppercase tracking-wide text-muted-foreground mb-1">Datum</label>
          <DatePickerField value={date} onChange={setDate} />
        </div>
      </div>

      {/* Goals card */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="mb-4">
          <h2 className="font-heading font-semibold" style={{ fontSize: 15, color: "var(--deep-hex, #00555f)" }}>
            Cíle pro tuto Call party
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Volitelné — sleduj progress během volání</p>
        </div>

        <GoalsEditor goals={goals} setGoals={setGoals} entries={entries} />
      </div>

      {/* Entries card */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold" style={{ fontSize: 15, color: "var(--deep-hex, #00555f)" }}>
            Záznamy hovorů
          </h2>
          <span className="text-xs text-muted-foreground">{validCount} {validCount === 1 ? "záznam" : validCount >= 2 && validCount <= 4 ? "záznamy" : "záznamů"}</span>
        </div>

        {/* Column headers */}
        <div
          className="hidden md:grid items-center mb-2 px-1"
          style={{ gridTemplateColumns: "1.6fr 1fr 1fr 36px", gap: 10, fontSize: 10, letterSpacing: "0.06em", color: "#5a7479", textTransform: "uppercase", fontWeight: 600 }}
        >
          <span>Jméno</span>
          <span>Výsledek</span>
          <span>Typ schůzky</span>
          <span />
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
          <button
            onClick={addEntry}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-sm font-heading font-semibold px-3 py-2.5 rounded-xl border border-dashed hover:bg-muted transition"
            style={{ color: "#00abbd", borderColor: "#9cd5dc" }}
          >
            <Plus className="h-4 w-4" /> Přidat řádek
          </button>
        </div>
      </div>

      {/* Sticky-style bottom bar */}
      <StickyBottomBar
        summary={summary}
        onClick={handleNext}
      />
    </div>
  );
}

// ─── Goals editor ────────────────────────────────────────────────────────────
function GoalsEditor({
  goals,
  setGoals,
  entries,
}: {
  goals: GoalItem[];
  setGoals: (g: GoalItem[]) => void;
  entries: EntryDraft[];
}) {
  const [adding, setAdding] = useState(false);

  const usedTypes = new Set(goals.map((g) => g.type));
  const availableTypes = ALL_GOAL_TYPES.filter((t) => !usedTypes.has(t));

  const updateGoal = (idx: number, patch: Partial<GoalItem>) => {
    setGoals(goals.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  };

  const removeGoal = (idx: number) => {
    const removed = goals[idx];
    const next = goals.filter((_, i) => i !== idx);
    setGoals(next);
    toast("Cíl smazán", {
      action: {
        label: "Vrátit",
        onClick: () => setGoals([...next.slice(0, idx), removed, ...next.slice(idx)]),
      },
      duration: 5000,
    });
  };

  const addGoal = (type: GoalType) => {
    setGoals([...goals, { type, target: null }]);
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      {goals.length > 0 && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {goals.map((g, idx) => (
            <GoalRow
              key={g.type + "_" + idx}
              goal={g}
              entries={entries}
              onChange={(patch) => updateGoal(idx, patch)}
              onRemove={() => removeGoal(idx)}
            />
          ))}
        </div>
      )}

      {adding && availableTypes.length > 0 ? (
        <div
          className="rounded-[10px] p-3 flex items-center gap-2 flex-wrap"
          style={{ border: "1.5px dashed rgba(0,171,189,0.4)", background: "rgba(0,171,189,0.04)" }}
        >
          <span className="text-xs text-muted-foreground mr-1">Vyber typ cíle:</span>
          {ALL_GOAL_TYPES.map((t) => {
            const used = usedTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => !used && addGoal(t)}
                disabled={used}
                className="text-xs font-heading font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: GOAL_META[t].tint, color: GOAL_META[t].labelColor, border: `1px solid ${GOAL_META[t].border}` }}
              >
                {GOAL_LABEL_SHORT[t]}
              </button>
            );
          })}
          <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground hover:underline ml-1">
            Zrušit
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={availableTypes.length === 0}
          className="w-full inline-flex items-center justify-center gap-1.5 font-heading font-semibold transition hover:bg-[rgba(0,171,189,0.06)] disabled:opacity-40"
          style={{
            color: "#00abbd",
            border: "1.5px dashed rgba(0,171,189,0.4)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          <Plus className="h-4 w-4" /> Přidat cíl
        </button>
      )}
    </div>
  );
}

function GoalRow({
  goal,
  entries,
  onChange,
  onRemove,
}: {
  goal: GoalItem;
  entries: EntryDraft[];
  onChange: (p: Partial<GoalItem>) => void;
  onRemove: () => void;
}) {
  const meta = GOAL_META[goal.type];
  const current = computeCurrent(goal.type, entries as any);
  const target = goal.target ?? 0;
  const hasTarget = target > 0;
  const pct = hasTarget ? Math.min(100, (current / target) * 100) : 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(target ? String(target) : "");

  const commit = () => {
    const v = Number(draft);
    onChange({ target: Number.isFinite(v) && v > 0 ? v : null });
    setEditing(false);
  };
  const startEdit = () => {
    setDraft(target ? String(target) : "");
    setEditing(true);
  };

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const cardStyle: React.CSSProperties = hasTarget
    ? { background: meta.tint, border: `0.5px solid ${meta.border}` }
    : {
        background: isDark ? "rgba(255,255,255,0.04)" : "#f7f9fa",
        border: isDark ? "0.5px solid rgba(255,255,255,0.08)" : "0.5px solid rgba(0,85,95,0.1)",
      };

  return (
    <div className="rounded-xl p-3" style={cardStyle}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="font-heading"
          style={{
            fontSize: 11,
            fontWeight: hasTarget ? 700 : 600,
            letterSpacing: "0.06em",
            color: meta.labelColor,
            textTransform: "uppercase",
          }}
        >
          {meta.label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={startEdit}
            className="p-1 rounded hover:bg-[rgba(0,171,189,0.12)] transition"
            title="Upravit cíl"
            style={{ color: "#00abbd" }}
          >
            <Pencil style={{ width: 13, height: 13 }} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-[rgba(226,75,74,0.12)] transition"
            title="Smazat cíl"
            style={{ color: "#e24b4a" }}
          >
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Cíl (např. 20)"
            className="flex-1 bg-white/70 border border-input rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgba(0,171,189,0.3)]"
          />
          <button
            onClick={commit}
            className="text-xs font-heading font-semibold px-3 py-1.5 rounded-md text-white"
            style={{ background: "#00abbd" }}
          >
            Uložit
          </button>
        </div>
      ) : hasTarget ? (
        <>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="font-heading font-bold" style={{ fontSize: 22, color: meta.bar, lineHeight: 1 }}>
              {current}
            </span>
            <span className="text-[13px] text-muted-foreground">/ {target}</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 4, background: `${meta.bar}1f` }}>
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, background: meta.bar, borderRadius: 999 }}
            />
          </div>
        </>
      ) : (
        <button
          onClick={startEdit}
          className="w-full font-heading font-semibold transition hover:bg-[rgba(0,171,189,0.06)]"
          style={{
            border: "1px dashed rgba(0,171,189,0.5)",
            color: "#00abbd",
            borderRadius: 8,
            padding: "5px 12px",
            fontSize: 13,
          }}
        >
          Nastav cíl
        </button>
      )}
    </div>
  );
}

// ─── Sticky bottom bar ───────────────────────────────────────────────────────
function StickyBottomBar({
  summary,
  onClick,
}: {
  summary: { called: number; domluveno: number; nezvedl: number };
  onClick: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const [desktop, setDesktop] = useState(isDesktop);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = () => setDesktop(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div
      className="flex items-center justify-between gap-4 flex-wrap"
      style={{
        position: "fixed",
        bottom: 16,
        left: desktop ? "50%" : 16,
        right: desktop ? undefined : 16,
        transform: desktop ? "translateX(calc(-50% + 130px))" : "none",
        width: desktop ? "calc(100% - 320px)" : undefined,
        maxWidth: 1200,
        zIndex: 40,
        background: isDark ? "rgba(20,40,44,0.85)" : "rgba(255,255,255,0.85)",
        backdropFilter: "blur(20px) saturate(1.6)",
        WebkitBackdropFilter: "blur(20px) saturate(1.6)",
        border: isDark ? "0.5px solid rgba(255,255,255,0.10)" : "0.5px solid rgba(255,255,255,0.95)",
        borderRadius: 16,
        boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,85,95,0.12)",
        padding: "14px 20px",
      }}
    >
      <div style={{ fontSize: 13, color: isDark ? "rgba(200,220,225,0.7)" : "#5a7479" }}>
        <strong style={{ color: isDark ? "#4dd8e8" : "#00555f" }}>
          {summary.called} {summary.called === 1 ? "hovor" : summary.called >= 2 && summary.called <= 4 ? "hovory" : "hovorů"}
        </strong>
        {" · "}
        {summary.domluveno} domluveno
        {" · "}
        {summary.nezvedl} nezvednuto
      </div>
      <button
        onClick={onClick}
        className="font-heading font-semibold inline-flex items-center gap-1.5"
        style={{
          background: "#fc7c71",
          color: "#fff",
          padding: "11px 22px",
          borderRadius: 12,
          fontSize: 14,
          boxShadow: "0 2px 8px rgba(252,124,113,0.3)",
          border: "none",
          cursor: "pointer",
        }}
      >
        Mám dovoláno →
      </button>
    </div>
  );
}

function SummaryStat({ label, actual, goal }: { label: string; actual: number; goal: number }) {
  const reached = goal > 0 && actual >= goal;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className="font-heading font-semibold text-base"
        style={{ color: reached ? "#00abbd" : "var(--deep-hex, #00555f)" }}
      >
        {actual}
        {goal > 0 ? ` / ${goal}` : ""}
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
        {entry.meeting_type && (
          <span
            className="text-xs px-2 py-0.5 rounded-md font-heading font-semibold"
            style={{ background: MEETING_TYPE_PILL[entry.meeting_type].bg, color: MEETING_TYPE_PILL[entry.meeting_type].color }}
          >
            {meetingTypeLabel(entry.meeting_type as MeetingType)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Datum *</label>
          <Input
            type="date"
            value={entry.meeting_date || fallbackDate}
            onChange={(e) => onChange({ meeting_date: e.target.value })}
            className="h-9"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Čas</label>
          <Input
            type="time"
            value={entry.meeting_time || ""}
            onChange={(e) => onChange({ meeting_time: e.target.value || null })}
            className="h-9"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Místo</label>
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

// ─── Entry row (Step 1) ──────────────────────────────────────────────────────
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

  const inputBase = {
    background: "#f1f5f6",
    borderRadius: 10,
    padding: "9px 14px",
    border: showWarning ? "1px solid #f59e0b" : "1px solid transparent",
    fontSize: 14,
    width: "100%",
    outline: "none",
  } as React.CSSProperties;

  const outcomeStyle = (o: Outcome): React.CSSProperties => {
    if (o === "domluveno") return { background: "rgba(13,148,136,0.10)", color: "#0D9488", fontWeight: 600 };
    return { background: "rgba(90,116,121,0.10)", color: "#5a7479", fontWeight: 500 };
  };

  const isDom = entry.outcome === "domluveno";
  const mt = entry.meeting_type;

  return (
    <div>
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: "1.6fr 1fr 1fr 36px", gap: 10 }}
      >
        <input
          style={inputBase}
          placeholder="Jméno"
          value={entry.client_name}
          onChange={(e) => onChange({ client_name: e.target.value })}
        />
        <SelectPill
          value={entry.outcome}
          onChange={(v) => {
            const outcome = v as Outcome;
            onChange({ outcome, meeting_type: outcome === "domluveno" ? entry.meeting_type : null });
          }}
          options={(Object.keys(outcomeLabel) as Outcome[]).map((o) => ({ value: o, label: outcomeLabel[o] }))}
          style={{
            ...outcomeStyle(entry.outcome),
            borderRadius: 10,
            padding: "9px 14px",
            border: "1px solid transparent",
          }}
        />
        <SelectPill
          value={mt ?? ""}
          disabled={!isDom}
          onChange={(v) => onChange({ meeting_type: v as CPMeetingType })}
          options={[
            ...(isDom ? [] : [{ value: "", label: "—" }]),
            ...CP_MEETING_TYPES.map((t) => ({ value: t, label: meetingTypeLabel(t as MeetingType) })),
          ]}
          placeholder={isDom ? "Vyber" : "—"}
          style={
            isDom && mt
              ? {
                  background: MEETING_TYPE_PILL[mt].bg,
                  color: MEETING_TYPE_PILL[mt].color,
                  fontWeight: 600,
                  borderRadius: 10,
                  padding: "9px 14px",
                  border: "1px solid transparent",
                }
              : {
                  background: "#f1f5f6",
                  color: isDom ? "#5a7479" : "#9aa9ad",
                  fontStyle: isDom ? "normal" : "italic",
                  borderRadius: 10,
                  padding: "9px 14px",
                  border: "1px solid transparent",
                }
          }
        />
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 transition"
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

// ─── Reusable styled select with chevron ─────────────────────────────────────
function SelectPill({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: "relative", opacity: disabled ? 0.7 : 1 }}>
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full text-sm cursor-pointer disabled:cursor-not-allowed"
        style={{
          ...style,
          paddingRight: 28,
          outline: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
        }}
      >
        {placeholder && !value && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute pointer-events-none"
        style={{ right: 10, top: "50%", transform: "translateY(-50%)", height: 14, width: 14, opacity: 0.6, color: "currentColor" }}
      />
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
      return (data || []).map((d: any) => ({ ...d, goals: parseGoals(d.goals) })) as SessionRow[];
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
          <SessionSummaryBadges sessionId={s.id} goals={s.goals} />
        </button>
      ))}
    </div>
  );
}

function SessionSummaryBadges({ sessionId, goals }: { sessionId: string; goals: GoalItem[] }) {
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
  const calledTarget = goals.find((g) => g.type === "called")?.target;
  const meetTarget = goals.find((g) => g.type === "meetings")?.target;
  return (
    <div className="flex gap-2 text-xs">
      <span className="px-2 py-1 rounded-lg bg-muted">
        Zavoláno: <strong>{called}</strong>
        {calledTarget ? `/${calledTarget}` : ""}
      </span>
      <span
        className="px-2 py-1 rounded-lg"
        style={{ background: "rgba(0,171,189,0.12)", color: "var(--deep-hex, #00555f)" }}
      >
        Domluveno: <strong>{domluveno}</strong>
        {meetTarget ? `/${meetTarget}` : ""}
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
      const { data, error } = await supabase.from("client_meetings").select("*").eq("id", openMeetingId!).maybeSingle();
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

  const [name, setName] = useState(session.name);
  const [date, setDate] = useState(session.date);
  const [editGoals, setEditGoals] = useState<GoalItem[]>(session.goals);
  const [draft, setDraft] = useState<EntryDraft[] | null>(null);

  const startEdit = () => {
    setName(session.name);
    setDate(session.date);
    setEditGoals(session.goals);
    setDraft(
      (entries || []).map((e) => ({
        id: e.id,
        client_name: e.client_name,
        outcome: e.outcome,
        meeting_type: (e.meeting_type as CPMeetingType) ?? null,
      })),
    );
    setEditMode(true);
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const cleanGoals = editGoals.filter((g) => g.target != null && g.target > 0);
      const { error: sErr } = await supabase
        .from("call_party_sessions")
        .update({ name: name.trim() || session.name, date, goals: cleanGoals as any })
        .eq("id", session.id);
      if (sErr) throw sErr;

      const keepIds = draft.filter((d) => d.id).map((d) => d.id!);
      const toDelete = (entries || []).filter((e) => !keepIds.includes(e.id));
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("call_party_entries")
          .delete()
          .in("id", toDelete.map((e) => e.id));
        if (error) throw error;
      }

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
            {editMode ? (
              <GoalsEditor
                goals={editGoals}
                setGoals={setEditGoals}
                entries={(draft || []) as EntryDraft[]}
              />
            ) : session.goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bez cílů</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {session.goals.map((g) => (
                  <div key={g.type} className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: GOAL_META[g.type].labelColor }}>
                      {GOAL_META[g.type].label}
                    </span>
                    <span className="font-heading font-semibold" style={{ color: "var(--deep-hex, #00555f)" }}>
                      {g.target || "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
                    onChange={(p) => setDraft((d) => (d ? d.map((x, idx) => (idx === i ? { ...x, ...p } : x)) : d))}
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
                      <span className={clickable ? "underline-offset-2 hover:underline" : ""}>{e.client_name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{outcomeLabel[e.outcome]}</span>
                        {e.outcome === "domluveno" && e.meeting_type && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-md font-heading font-semibold"
                            style={{
                              background: MEETING_TYPE_PILL[e.meeting_type as CPMeetingType]?.bg || "rgba(0,171,189,0.12)",
                              color: MEETING_TYPE_PILL[e.meeting_type as CPMeetingType]?.color || "var(--deep-hex, #00555f)",
                            }}
                          >
                            {meetingTypeLabel(e.meeting_type as MeetingType)}
                          </span>
                        )}
                      </span>
                    </Wrapper>
                  );
                })}
                {(entries || []).length === 0 && <p className="text-sm text-muted-foreground">Žádné záznamy.</p>}
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditMode(false);
                    setDraft(null);
                  }}
                >
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

// ─── Step indicator (compact) ────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1, label: "Záznam hovorů" },
    { n: 2, label: "Naplánovat schůzky" },
  ];
  return (
    <div className="flex items-start justify-center" style={{ gap: 0 }}>
      {steps.map((s, idx) => {
        const active = s.n === step;
        const done = s.n < step;
        return (
          <div key={s.n} className="flex items-start">
            <div className="flex flex-col items-center" style={{ minWidth: 110 }}>
              <div
                className="flex items-center justify-center font-heading font-bold"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  fontSize: 11,
                  background: active || done ? "#00abbd" : "transparent",
                  color: active || done ? "#fff" : "rgba(0,85,95,0.6)",
                  border: active || done ? "none" : "1.5px solid rgba(0,85,95,0.35)",
                }}
              >
                {s.n}
              </div>
              <div
                className="font-heading mt-1 text-center"
                style={{
                  fontSize: 11,
                  fontWeight: active ? 700 : 600,
                  color: active ? "#00abbd" : "#5a7479",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {s.label}
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div
                style={{
                  height: 1,
                  width: 60,
                  background: done || step > s.n ? "#00abbd" : "rgba(0,85,95,0.18)",
                  marginTop: 11,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Date picker field — same UI as PeriodNavigator (no day-cycling arrows) ──
function DatePickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseISO(value), [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = isToday(selected) ? "Dnes" : format(selected, "EEEE", { locale: cs });
  const title = format(selected, "d. MMMM yyyy", { locale: cs });

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
          borderRadius: 16,
          padding: "10px 16px",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e1e9eb",
          width: "100%",
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>{label}</div>
        <div
          style={{
            fontFamily: "Poppins, sans-serif",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </div>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: isDark ? "#0a1f23" : "#fff",
            borderRadius: 14,
            border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e1e9eb",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            locale={cs}
            weekStartsOn={1}
            className="p-3 pointer-events-auto"
          />
        </div>
      )}
    </div>
  );
}
