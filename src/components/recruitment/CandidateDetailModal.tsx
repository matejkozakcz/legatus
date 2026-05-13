import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { X, ChevronRight, ArrowRight, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  RecruitmentStage,
  RECRUITMENT_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  nextStage,
} from "@/lib/recruitmentFunnel";

interface Props {
  candidateId: string;
  open: boolean;
  onClose: () => void;
}

interface CandidateFull {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  current_stage: RecruitmentStage;
  stage_changed_at: string;
  stage_history: Array<{ stage: string; at: string; by: string }>;
  lost_reason: string | null;
  notes: string | null;
  owner_id: string;
  created_at: string;
}

interface AttendanceRow {
  id: string;
  meeting_id: string;
  attended: boolean | null;
  meeting?: { date: string; meeting_type: string } | null;
}

export function CandidateDetailModal({ candidateId, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");

  const { data: candidate } = useQuery({
    queryKey: ["recruitment_candidate", candidateId],
    enabled: open && !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruitment_candidates" as any)
        .select("*")
        .eq("id", candidateId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setNotes((data as any).notes ?? "");
        setLostReason((data as any).lost_reason ?? "");
      }
      return data as unknown as CandidateFull;
    },
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["candidate_meetings", candidateId],
    enabled: open && !!candidateId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_meetings")
        .select("id, date, meeting_type, outcome_recorded, pohovor_jde_dal")
        .eq("recruitment_candidate_id", candidateId)
        .order("date", { ascending: true });
      return data ?? [];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["candidate_attendance", candidateId],
    enabled: open && !!candidateId,
    queryFn: async () => {
      const { data } = await supabase
        .from("info_attendees" as any)
        .select("id, meeting_id, attended, client_meetings!inner(date, meeting_type)")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: true });
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        meeting: r.client_meetings,
      })) as AttendanceRow[];
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async (toStage: RecruitmentStage) => {
      if (!candidate || !user) return;
      const history = [...(candidate.stage_history ?? []), { stage: toStage, at: new Date().toISOString(), by: user.id }];
      const { error } = await supabase
        .from("recruitment_candidates" as any)
        .update({ current_stage: toStage, stage_changed_at: new Date().toISOString(), stage_history: history } as any)
        .eq("id", candidate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fáze posunuta");
      qc.invalidateQueries({ queryKey: ["recruitment_candidate", candidateId] });
      qc.invalidateQueries({ queryKey: ["recruitment_candidates_list"] });
      qc.invalidateQueries({ queryKey: ["recruitment_candidates_picker"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const markLost = useMutation({
    mutationFn: async () => {
      if (!candidate || !user) return;
      const history = [...(candidate.stage_history ?? []), { stage: "LOST", at: new Date().toISOString(), by: user.id }];
      const { error } = await supabase
        .from("recruitment_candidates" as any)
        .update({
          current_stage: "LOST",
          stage_changed_at: new Date().toISOString(),
          stage_history: history,
          lost_reason: lostReason.trim() || null,
        } as any)
        .eq("id", candidate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Označeno jako ztracený");
      qc.invalidateQueries({ queryKey: ["recruitment_candidate", candidateId] });
      qc.invalidateQueries({ queryKey: ["recruitment_candidates_list"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const saveNotes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("recruitment_candidates" as any)
        .update({ notes: notes.trim() || null } as any)
        .eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Uloženo"),
  });

  const setAttendance = useMutation({
    mutationFn: async (vars: { id: string; attended: boolean }) => {
      const { error } = await supabase
        .from("info_attendees" as any)
        .update({ attended: vars.attended } as any)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate_attendance", candidateId] });
    },
  });

  const deleteCandidate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recruitment_candidates" as any).delete().eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kandidát smazán");
      qc.invalidateQueries({ queryKey: ["recruitment_candidates_list"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  if (!open) return null;
  if (!candidate) {
    return (
      <div className="fixed inset-0 z-[200] flex items-start justify-center pt-12" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative w-full max-w-md legatus-modal-glass rounded-2xl p-6 mx-4">Načítám…</div>
      </div>
    );
  }

  const next = nextStage(candidate.current_stage);
  const canEdit = candidate.owner_id === user?.id;
  const isLost = candidate.current_stage === "LOST";

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md legatus-modal-glass rounded-2xl p-6 overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - 64px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-heading text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          {candidate.full_name}
        </h2>
        {(candidate.phone || candidate.email) && (
          <div className="text-xs text-muted-foreground mb-4">
            {candidate.phone}{candidate.phone && candidate.email ? " · " : ""}{candidate.email}
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-1">
            {RECRUITMENT_STAGES.map((s) => {
              const idx = RECRUITMENT_STAGES.indexOf(s);
              const cur = RECRUITMENT_STAGES.indexOf(candidate.current_stage as RecruitmentStage);
              const reached = !isLost && cur >= idx;
              const isCurrent = candidate.current_stage === s;
              return (
                <div key={s} className="flex flex-col items-center" style={{ minWidth: 52 }}>
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: reached ? STAGE_COLORS[s] : "transparent",
                      border: `2px solid ${reached ? STAGE_COLORS[s] : "#cbd5d8"}`,
                      color: reached ? "#fff" : "#8aadb3",
                      boxShadow: isCurrent ? "0 0 0 3px rgba(0,171,189,0.2)" : "none",
                    }}
                  >
                    {idx + 1}
                  </div>
                  <span className="text-[10px] mt-1" style={{ color: isCurrent ? STAGE_COLORS[s] : "#8aadb3", fontWeight: isCurrent ? 700 : 400 }}>
                    {STAGE_LABELS[s]}
                  </span>
                </div>
              );
            })}
          </div>
          {isLost && (
            <div className="text-xs font-semibold text-center" style={{ color: STAGE_COLORS.LOST }}>
              ❌ Ztracený{candidate.lost_reason ? ` — ${candidate.lost_reason}` : ""}
            </div>
          )}
        </div>

        {/* Akce */}
        {canEdit && !isLost && (
          <div className="flex flex-wrap gap-2 mb-4">
            {next && (
              <button
                onClick={() => advanceMutation.mutate(next)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold text-white"
                style={{ background: "#00abbd" }}
              >
                Posunout do {STAGE_LABELS[next]} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => {
                const reason = prompt("Důvod (nepovinné):", lostReason);
                if (reason !== null) {
                  setLostReason(reason);
                  markLost.mutate();
                }
              }}
              className="h-9 px-3 rounded-lg text-xs font-semibold border border-input"
              style={{ color: STAGE_COLORS.LOST }}
            >
              Označit ztraceného
            </button>
          </div>
        )}

        {/* Schůzky */}
        {meetings.length > 0 && (
          <section className="mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Schůzky</h3>
            <div className="space-y-1.5">
              {meetings.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between text-xs p-2 rounded-md border border-border">
                  <span>
                    <span className="font-semibold">{m.meeting_type}</span>
                    <span className="text-muted-foreground ml-2">
                      {format(new Date(m.date), "d. M. yyyy", { locale: cs })}
                    </span>
                  </span>
                  {m.outcome_recorded && (
                    <span className="text-[10px] font-semibold" style={{ color: "#00abbd" }}>✓ vyplněno</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Účast na Info / Postinfo (vyžaduje potvrzení) */}
        {attendance.length > 0 && (
          <section className="mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Potvrzení účasti</h3>
            <div className="space-y-1.5">
              {attendance.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border">
                  <span className="text-xs">
                    <span className="font-semibold">{a.meeting?.meeting_type}</span>
                    {a.meeting && (
                      <span className="text-muted-foreground ml-2">
                        {format(new Date(a.meeting.date), "d. M. yyyy", { locale: cs })}
                      </span>
                    )}
                  </span>
                  {canEdit ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setAttendance.mutate({ id: a.id, attended: true })}
                        className={`h-7 px-2.5 rounded-md text-[11px] font-semibold ${a.attended === true ? "text-white" : "border border-input"}`}
                        style={a.attended === true ? { background: "#00abbd" } : {}}
                      >
                        Účast ✓
                      </button>
                      <button
                        onClick={() => setAttendance.mutate({ id: a.id, attended: false })}
                        className={`h-7 px-2.5 rounded-md text-[11px] font-semibold ${a.attended === false ? "text-white" : "border border-input"}`}
                        style={a.attended === false ? { background: "#fc7c71" } : {}}
                      >
                        Nepřišel ✗
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {a.attended === true ? "✓ účast" : a.attended === false ? "✗ nepřišel" : "neodklikáno"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Poznámka */}
        {canEdit && (
          <section className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Poznámka</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => saveNotes.mutate()}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
            />
          </section>
        )}

        {/* Smazat */}
        {canEdit && (
          <button
            onClick={() => {
              if (confirm("Smazat tohoto kandidáta?")) deleteCandidate.mutate();
            }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Smazat kandidáta
          </button>
        )}
      </div>
    </div>
  );
}
