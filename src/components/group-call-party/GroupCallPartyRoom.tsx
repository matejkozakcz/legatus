import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useGroupParty, buildLeaderboard, buildTotals, type PartyEntry } from "@/hooks/useGroupParty";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";
import {
  Phone, Trophy, Users, Copy, Check, Loader2, X, Play, Square, Activity, ArrowLeft, RotateCw, ExternalLink,
} from "lucide-react";
import { fireConfetti } from "@/lib/confetti";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";

type Outcome = "nezvedl" | "nedomluveno" | "domluveno";
type CPMeetingType = "FSA" | "SER" | "POH" | "NAB";
const MEETING_TYPES: CPMeetingType[] = ["FSA", "SER", "POH", "NAB"];

interface Props {
  partyId: string;
  onClose: () => void;
}

export function GroupCallPartyRoom({ partyId, onClose }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { party, participants, entries, isLoading, refetchAll } = useGroupParty(partyId);

  const [tab, setTab] = useState<"leaderboard" | "feed" | "invite">("leaderboard");
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [confettiFired, setConfettiFired] = useState(false);

  // Caller's own ad-hoc session id for this party
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("nezvedl");
  const [meetingType, setMeetingType] = useState<CPMeetingType | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isHost = party?.host_id === profile?.id;
  const totals = useMemo(() => buildTotals(entries), [entries]);
  const leaderboard = useMemo(() => buildLeaderboard(entries, participants), [entries, participants]);
  const goalCalls = party?.goals.calls ?? 0;
  const goalMeetings = party?.goals.meetings ?? 0;
  const goalCallsPct = goalCalls ? Math.min(100, (totals.calls / goalCalls) * 100) : 0;
  const goalMeetPct = goalMeetings ? Math.min(100, (totals.meetings / goalMeetings) * 100) : 0;

  // Confetti when goal hit
  useEffect(() => {
    if (!confettiFired && goalCalls > 0 && totals.calls >= goalCalls) {
      fireConfetti();
      setConfettiFired(true);
      toast.success("🎉 Společný cíl hovorů splněn!");
    }
  }, [totals.calls, goalCalls, confettiFired]);

  // Ensure caller has a session linked to this party
  useEffect(() => {
    if (!profile || !party || party.status !== "live" || mySessionId) return;
    (async () => {
      // Look for existing
      const { data: existing } = await supabase
        .from("call_party_sessions")
        .select("id")
        .eq("group_party_id", partyId)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (existing) {
        setMySessionId(existing.id);
        return;
      }
      const { data, error } = await supabase
        .from("call_party_sessions")
        .insert({
          user_id: profile.id,
          name: party.name,
          date: new Date().toISOString().slice(0, 10),
          group_party_id: partyId,
          goals: [],
        })
        .select()
        .single();
      if (error) {
        toast.error(error.message);
      } else {
        setMySessionId(data.id);
      }
    })();
  }, [profile, party, partyId, mySessionId]);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const callAction = async (action: "start" | "end" | "rotate_token") => {
    const { data, error } = await supabase.functions.invoke("group-call-party-action", {
      body: { action, party_id: partyId },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Chyba");
      return;
    }
    refetchAll();
    if (action === "start") toast.success("Party spuštěna");
    if (action === "end") toast.success("Party ukončena");
    if (action === "rotate_token") toast.success("Nový odkaz vygenerován");
  };

  const addEntry = useMutation({
    mutationFn: async () => {
      if (!mySessionId) throw new Error("Chybí session");
      if (!clientName.trim()) throw new Error("Zadej jméno");
      const { error } = await supabase.from("call_party_entries").insert({
        session_id: mySessionId,
        client_name: clientName.trim(),
        outcome,
        meeting_type: outcome === "domluveno" ? meetingType : null,
        sort_order: entries.filter((e) => e.user_id === profile?.id).length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setClientName("");
      setOutcome("nezvedl");
      setMeetingType(null);
      qc.invalidateQueries({ queryKey: ["group_party_entries", partyId] });
      refetchAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Timer / countdown ──────────────────────────────────────────────────
  const elapsed = party?.started_at ? Math.floor((now - new Date(party.started_at).getTime()) / 1000) : 0;
  const remaining = party?.planned_duration_min && party?.started_at
    ? party.planned_duration_min * 60 - elapsed
    : null;
  const timeStr = (s: number) => {
    const sign = s < 0 ? "-" : "";
    const a = Math.abs(s);
    return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  };

  // Invite link
  const inviteUrl = party ? `${window.location.origin}/call-party/join/${party.join_token}` : "";
  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Odkaz zkopírován");
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading || !party) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00abbd" }} />
      </div>
    );
  }

  const myRank = leaderboard.findIndex((r) => r.user_id === profile?.id) + 1;

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Zpět
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-xl truncate" style={{ color: "var(--text-primary, #00555f)" }}>
            {party.name}
          </h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{
                background: party.status === "live" ? "#22c55e" : party.status === "ended" ? "#94a3b8" : "#f59e0b"
              }} />
              {party.status === "live" ? "LIVE" : party.status === "ended" ? "Ukončeno" : "Naplánováno"}
            </span>
            {party.status === "live" && party.started_at && (
              <span className="font-mono">⏱ {timeStr(elapsed)}{remaining !== null && ` / zbývá ${timeStr(remaining)}`}</span>
            )}
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {participants.length}</span>
          </div>
        </div>
        {isHost && party.status === "scheduled" && (
          <Button onClick={() => callAction("start")} style={{ background: "#22c55e", color: "#fff" }} size="sm" className="gap-1">
            <Play className="h-4 w-4" /> Spustit
          </Button>
        )}
        {isHost && party.status === "live" && (
          <Button onClick={() => callAction("end")} variant="outline" size="sm" className="gap-1">
            <Square className="h-4 w-4" /> Ukončit
          </Button>
        )}
      </div>

      {/* Goal progress */}
      {(goalCalls > 0 || goalMeetings > 0) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {goalCalls > 0 && (
            <ProgressBar label="Hovory" current={totals.calls} target={goalCalls} pct={goalCallsPct} color="#00abbd" />
          )}
          {goalMeetings > 0 && (
            <ProgressBar label="Domluvené" current={totals.meetings} target={goalMeetings} pct={goalMeetPct} color="#0D9488" />
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: my call panel */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: "#00555f" }}>
            <Phone className="h-4 w-4" /> Můj panel
            {myRank > 0 && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,171,189,0.1)", color: "#00abbd" }}>
                #{myRank} v žebříčku
              </span>
            )}
          </h3>
          {party.status !== "live" ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {party.status === "scheduled" ? "Party ještě neběží." : "Party skončila."}
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="cn">Jméno klienta</Label>
                <Input id="cn" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Jméno…" />
              </div>
              <div>
                <Label className="text-xs">Výsledek</Label>
                <div className="flex gap-1.5 mt-1">
                  {(["nezvedl", "nedomluveno", "domluveno"] as Outcome[]).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOutcome(o)}
                      className="flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors"
                      style={{
                        background: outcome === o
                          ? (o === "domluveno" ? "#22c55e" : o === "nezvedl" ? "#94a3b8" : "#f59e0b")
                          : "var(--surface-2, rgba(0,0,0,0.04))",
                        color: outcome === o ? "#fff" : "var(--text-primary, #00555f)",
                      }}
                    >
                      {o === "nezvedl" ? "Nezvedl" : o === "nedomluveno" ? "Nedomluveno" : "Domluveno ✓"}
                    </button>
                  ))}
                </div>
              </div>
              {outcome === "domluveno" && (
                <div>
                  <Label className="text-xs">Typ schůzky</Label>
                  <div className="flex gap-1.5 mt-1">
                    {MEETING_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMeetingType(t)}
                        className="flex-1 py-2 rounded-md text-xs font-bold transition-colors"
                        style={{
                          background: meetingType === t ? "#00abbd" : "var(--surface-2, rgba(0,0,0,0.04))",
                          color: meetingType === t ? "#fff" : "#00555f",
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                onClick={() => addEntry.mutate()}
                disabled={addEntry.isPending || !clientName.trim() || (outcome === "domluveno" && !meetingType)}
                className="w-full"
                style={{ background: "#fc7c71", color: "#fff" }}
              >
                {addEntry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Přidat hovor"}
              </Button>

              {/* My recent entries */}
              <div className="pt-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground mb-1.5">Moje poslední</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {entries.filter((e) => e.user_id === profile?.id).slice(0, 8).map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate">{e.client_name}</span>
                      <OutcomePill outcome={e.outcome} type={e.meeting_type} />
                    </div>
                  ))}
                  {entries.filter((e) => e.user_id === profile?.id).length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Zatím nic.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: leaderboard / feed / invite */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex gap-1 mb-3">
            {[
              { k: "leaderboard" as const, l: "Žebříček", i: <Trophy className="h-3.5 w-3.5" /> },
              { k: "feed" as const, l: "Feed", i: <Activity className="h-3.5 w-3.5" /> },
              { k: "invite" as const, l: "Pozvat", i: <Users className="h-3.5 w-3.5" /> },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className="flex-1 py-1.5 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                style={{
                  background: tab === t.k ? "#00abbd" : "transparent",
                  color: tab === t.k ? "#fff" : "var(--text-primary, #00555f)",
                  border: tab === t.k ? "none" : "1px solid var(--border, rgba(0,0,0,0.1))",
                }}
              >
                {t.i} {t.l}
              </button>
            ))}
          </div>

          {tab === "leaderboard" && (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
              {leaderboard.sort((a, b) => b.calls - a.calls).map((row, i) => (
                <div
                  key={row.user_id}
                  className="flex items-center gap-3 p-2 rounded-md"
                  style={{
                    background: row.user_id === profile?.id ? "rgba(0,171,189,0.08)" : "transparent",
                  }}
                >
                  <span className="font-bold text-sm w-6 text-center" style={{
                    color: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#a16207" : "#5a7479"
                  }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                  </span>
                  <span className="flex-1 truncate text-sm">{row.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{row.calls} hov</span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: "#0D9488" }}>{row.meetings} dom</span>
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">Zatím nikdo.</p>}
            </div>
          )}

          {tab === "feed" && (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
              {entries.slice(0, 30).map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-xs p-1.5 rounded">
                  <span className="text-muted-foreground tabular-nums w-12">{format(parseISO(e.created_at), "HH:mm:ss")}</span>
                  <span className="font-medium truncate">{e.user_name}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="truncate flex-1">{e.client_name}</span>
                  <OutcomePill outcome={e.outcome} type={e.meeting_type} />
                </div>
              ))}
              {entries.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">Zatím žádná aktivita.</p>}
            </div>
          )}

          {tab === "invite" && (
            <div className="space-y-3">
              <div className="flex justify-center bg-white p-3 rounded-lg">
                <QRCodeSVG value={inviteUrl} size={180} />
              </div>
              <div className="flex gap-2">
                <Input value={inviteUrl} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} className="font-mono text-xs" />
                <Button onClick={copyLink} size="icon" variant="outline">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {isHost && (
                <Button onClick={() => callAction("rotate_token")} variant="outline" size="sm" className="w-full gap-1">
                  <RotateCw className="h-3.5 w-3.5" /> Vygenerovat nový odkaz
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                {party.allow_external
                  ? "Kdokoli s odkazem se může připojit."
                  : "Připojit se mohou jen členové stejného workspace."}
              </p>
              <div className="pt-2 border-t border-border">
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Pozváni ({participants.length})</p>
                <div className="flex flex-wrap gap-1">
                  {participants.map((p) => (
                    <span key={p.id} className="text-[11px] px-2 py-0.5 rounded-full" style={{
                      background: p.role === "host" ? "#fc7c71" : "rgba(0,171,189,0.1)",
                      color: p.role === "host" ? "#fff" : "#00555f",
                    }}>
                      {p.full_name}{p.role === "host" && " 👑"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target, pct, color }: { label: string; current: number; target: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{current} / {target}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2, rgba(0,0,0,0.06))" }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function OutcomePill({ outcome, type }: { outcome: PartyEntry["outcome"]; type: string | null }) {
  if (outcome === "domluveno") {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#22c55e", color: "#fff" }}>
        ✓ {type ?? "DOM"}
      </span>
    );
  }
  if (outcome === "nezvedl") {
    return <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#94a3b8", color: "#fff" }}>—</span>;
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#f59e0b", color: "#fff" }}>✗</span>;
}
