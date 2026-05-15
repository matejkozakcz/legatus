import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyGroupParties, useGroupParty, buildLeaderboard, buildTotals } from "@/hooks/useGroupParty";
import { Trophy, Loader2, Users } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { cs } from "date-fns/locale";

export function GroupCallPartyLeaderboardTab({ onOpenParty }: { onOpenParty: (id: string) => void }) {
  const { profile } = useAuth();
  const { data: parties = [], isLoading } = useMyGroupParties(profile?.id ?? null);

  const targetParty = useMemo(() => {
    const live = parties.find((p) => p.status === "live");
    if (live) return live;
    const cutoff = subDays(new Date(), 14).toISOString();
    return parties.find((p) => p.status === "ended" && (p.scheduled_at ?? "") > cutoff) ?? parties[0] ?? null;
  }, [parties]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00abbd" }} /></div>;
  }

  if (!targetParty) {
    return (
      <div className="text-center py-16 rounded-xl border border-dashed border-border">
        <Trophy className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "#00abbd" }} />
        <h3 className="font-heading font-semibold text-base mb-1">Zatím žádný žebříček</h3>
        <p className="text-sm text-muted-foreground">Vytvoř první skupinovou call party v záložce „Nová".</p>
      </div>
    );
  }

  return <LeaderboardForParty partyId={targetParty.id} onOpen={() => onOpenParty(targetParty.id)} />;
}

function LeaderboardForParty({ partyId, onOpen }: { partyId: string; onOpen: () => void }) {
  const { profile } = useAuth();
  const { party, participants, entries, isLoading } = useGroupParty(partyId);

  const totals = useMemo(() => buildTotals(entries), [entries]);
  const leaderboard = useMemo(
    () => buildLeaderboard(entries, participants).sort((a, b) => b.calls - a.calls || b.meetings - a.meetings),
    [entries, participants],
  );

  if (isLoading || !party) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00abbd" }} /></div>;
  }

  const goalCalls = party.goals.calls ?? 0;
  const goalMeetings = party.goals.meetings ?? 0;
  const callsPct = goalCalls ? Math.min(100, (totals.calls / goalCalls) * 100) : 0;
  const meetPct = goalMeetings ? Math.min(100, (totals.meetings / goalMeetings) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-heading font-bold text-xl" style={{ color: "var(--text-primary, #00555f)" }}>{party.name}</h2>
              <StatusBadge status={party.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {party.scheduled_at && format(parseISO(party.scheduled_at), "d. M. yyyy · HH:mm", { locale: cs })}
              <span className="ml-2 inline-flex items-center gap-1"><Users className="h-3 w-3" /> {participants.length}</span>
            </p>
          </div>
          <button
            onClick={onOpen}
            className="text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: "#00abbd", color: "#fff" }}
          >
            Otevřít party
          </button>
        </div>

        {(goalCalls > 0 || goalMeetings > 0) && (
          <div className="mt-4 space-y-3">
            {goalCalls > 0 && <ProgressRow label="Hovory" current={totals.calls} target={goalCalls} pct={callsPct} color="#00abbd" />}
            {goalMeetings > 0 && <ProgressRow label="Domluvené" current={totals.meetings} target={goalMeetings} pct={meetPct} color="#0D9488" />}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: "#00555f" }}>
          <Trophy className="h-4 w-4" /> Žebříček
        </h3>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Zatím žádné hovory.</p>
        ) : (
          <div className="space-y-1.5">
            {leaderboard.map((row, i) => (
              <div
                key={row.user_id}
                className="flex items-center gap-3 p-2 rounded-md"
                style={{ background: row.user_id === profile?.id ? "rgba(0,171,189,0.08)" : "transparent" }}
              >
                <span className="font-bold text-sm w-8 text-center">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                </span>
                <span className="flex-1 truncate text-sm">{row.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{row.calls} hov</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: "#0D9488" }}>{row.meetings} dom</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "scheduled" | "live" | "ended" }) {
  const cfg = {
    live: { bg: "#22c55e", label: "LIVE" },
    scheduled: { bg: "#f59e0b", label: "Naplánováno" },
    ended: { bg: "#94a3b8", label: "Ukončeno" },
  }[status];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: "#fff" }}>
      {cfg.label}
    </span>
  );
}

function ProgressRow({ label, current, target, pct, color }: { label: string; current: number; target: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{current} / {target}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
