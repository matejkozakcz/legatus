import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { X, ArrowRight, Trash2, Plus, Copy, GraduationCap, Lock, Check } from "lucide-react";
import { toast } from "sonner";
import {
  RecruitmentStage,
  RECRUITMENT_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  nextStage,
} from "@/lib/recruitmentFunnel";
import {
  IndividualFormInline,
  useIndividualSave,
  useIndividualDelete,
  type IndividualMeeting,
} from "@/components/IndividualyTab";
import { useIndividualMeetings } from "@/hooks/useIndividualMeetings";

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
  org_unit_id: string;
  registered_profile_id: string | null;
  created_at: string;
}

export function CandidateDetailModal({ candidateId, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"zapracovani" | "rozvoj">("zapracovani");
  const [lostReason, setLostReason] = useState("");
  const [editingRecord, setEditingRecord] = useState<IndividualMeeting | "new" | null>(null);
  const [viewing, setViewing] = useState<IndividualMeeting | null>(null);

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
      if (data) setLostReason((data as any).lost_reason ?? "");
      return data as unknown as CandidateFull;
    },
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["candidate_meetings", candidateId],
    enabled: open && !!candidateId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_meetings")
        .select("id, date, meeting_type, outcome_recorded, pohovor_jde_dal, case_name")
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
        .select("id, meeting_id, attended, client_meetings!inner(date, meeting_type, case_name)")
        .eq("candidate_id", candidateId);
      return ((data ?? []) as any[]).map((r) => ({ ...r, meeting: r.client_meetings }));
    },
  });

  // Workspace invite token (for invite link display)
  const { data: workspace } = useQuery({
    queryKey: ["candidate_workspace", candidate?.org_unit_id],
    enabled: !!candidate?.org_unit_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("org_units")
        .select("invite_token, name")
        .eq("id", candidate!.org_unit_id)
        .maybeSingle();
      return data;
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

  // ── Rozvoj (Individuály) ────────────────────────────────────────────
  const { data: individualRecords = [], isLoading: indLoading } = useIndividualMeetings(candidateId);
  const saveInd = useIndividualSave(candidateId, () => {
    setEditingRecord(null);
  });
  const deleteInd = useIndividualDelete(candidateId, () => setViewing(null));

  useEffect(() => {
    if (!open) {
      setTab("zapracovani");
      setEditingRecord(null);
      setViewing(null);
    }
  }, [open]);

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
  const showInviteLink =
    !isLost &&
    !candidate.registered_profile_id &&
    (candidate.current_stage === "SUPERVIZE" || candidate.current_stage === "REG");

  const inviteUrl = workspace?.invite_token
    ? `${window.location.origin}/join?ws=${workspace.invite_token}`
    : null;

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link zkopírován");
  };

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
          {candidate.registered_profile_id && (
            <div className="text-xs font-semibold text-center" style={{ color: STAGE_COLORS.REG }}>
              ✓ Registrován v Legatovi
            </div>
          )}
        </div>

        {/* Akce posunu fáze */}
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

        {/* Invite link pro registraci do Legata */}
        {showInviteLink && inviteUrl && (
          <div
            className="mb-4 p-3 rounded-xl border"
            style={{ background: "rgba(0,171,189,0.06)", borderColor: "rgba(0,171,189,0.25)" }}
          >
            <div className="text-xs font-semibold mb-1" style={{ color: "#00555f" }}>
              Pozvánka do Legata
            </div>
            <div className="text-[11px] text-muted-foreground mb-2">
              Po registraci se profil automaticky spáruje s tímto kandidátem (podle e-mailu, telefonu nebo jména).
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-[11px]"
              />
              <button
                onClick={copyInvite}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold text-white"
                style={{ background: "#fc7c71" }}
              >
                <Copy className="h-3 w-3" /> Kopírovat
              </button>
            </div>
          </div>
        )}

        {/* Tabs: Zapracování / Rozvoj */}
        <div className="flex gap-1 mt-2 mb-3 border-b" style={{ borderColor: "var(--border)" }}>
          {([
            { key: "zapracovani" as const, label: "Zapracování" },
            { key: "rozvoj" as const, label: "Rozvoj" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-3 py-2 text-sm font-semibold transition-colors"
              style={{
                color: tab === t.key ? "#00abbd" : "var(--text-muted)",
                borderBottom: tab === t.key ? "2px solid #00abbd" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "zapracovani" && (
          <div>
            {/* Schůzky kandidáta */}
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" /> Schůzky
            </h3>
            {meetings.length === 0 && attendance.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                Zatím žádné schůzky.
              </p>
            ) : (
              <div className="space-y-1.5 mb-4">
                {meetings.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-xs p-2 rounded-md border border-border">
                    <span>
                      <span className="font-semibold">{m.meeting_type}</span>
                      <span className="text-muted-foreground ml-2">
                        {format(new Date(m.date), "d. M. yyyy", { locale: cs })}
                      </span>
                      {m.case_name && (
                        <span className="text-muted-foreground ml-2 text-[10px]">· {m.case_name}</span>
                      )}
                    </span>
                    {m.outcome_recorded && (
                      <span className="text-[10px] font-semibold" style={{ color: "#00abbd" }}>✓ vyplněno</span>
                    )}
                  </div>
                ))}
                {attendance.map((a: any) => (
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
                          ✓
                        </button>
                        <button
                          onClick={() => setAttendance.mutate({ id: a.id, attended: false })}
                          className={`h-7 px-2.5 rounded-md text-[11px] font-semibold ${a.attended === false ? "text-white" : "border border-input"}`}
                          style={a.attended === false ? { background: "#fc7c71" } : {}}
                        >
                          ✗
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {a.attended === true ? "✓" : a.attended === false ? "✗" : "?"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "rozvoj" && (
          <div>
            {editingRecord ? (
              <IndividualFormInline
                initial={editingRecord === "new" ? null : editingRecord}
                onCancel={() => setEditingRecord(null)}
                onSave={(d) => saveInd.mutate({ id: editingRecord === "new" ? undefined : editingRecord.id, ...d })}
                saving={saveInd.isPending}
              />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Deník rozvoje
                  </p>
                  <button
                    onClick={() => setEditingRecord("new")}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: "#fc7c71" }}
                  >
                    <Plus size={14} /> Nový individuál
                  </button>
                </div>
                {indLoading ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Načítám…</p>
                ) : individualRecords.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
                    Zatím žádné zápisky
                  </p>
                ) : (
                  <div className="space-y-2">
                    {individualRecords.map((r) => {
                      const isMine = r.author_id === user?.id;
                      const isOpen = viewing?.id === r.id;
                      return (
                        <div key={r.id}>
                          <button
                            onClick={() => setViewing(isOpen ? null : r)}
                            className="w-full text-left rounded-lg border transition-colors hover:border-[#00abbd]"
                            style={{
                              padding: "10px 12px",
                              background: isOpen ? "rgba(0,171,189,0.08)" : "rgba(0,0,0,0.02)",
                              borderColor: isOpen ? "#00abbd" : "var(--border)",
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                                {format(new Date(r.meeting_date), "d. M. yyyy", { locale: cs })}
                              </span>
                              {!isMine && <Lock size={11} style={{ color: "var(--text-muted)" }} />}
                            </div>
                            <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>
                              {r.author?.full_name || "—"}
                            </p>
                            <p className="text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
                              {isOpen ? r.notes : r.notes.slice(0, 120)}
                            </p>
                            {isOpen && r.next_steps && (
                              <div className="mt-2 pt-2 border-t border-border">
                                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Next steps</p>
                                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.next_steps}</p>
                              </div>
                            )}
                          </button>
                          {isOpen && isMine && (
                            <div className="flex gap-2 mt-1.5">
                              <button
                                onClick={() => setEditingRecord(r)}
                                className="text-[11px] font-semibold"
                                style={{ color: "#00abbd" }}
                              >
                                Upravit
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Smazat zápisek?")) deleteInd.mutate(r.id);
                                }}
                                className="text-[11px] font-semibold text-destructive"
                              >
                                Smazat
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-3">
                  Po registraci kandidáta v Legatovi se zápisky zachovají a zůstanou navázané na nově vzniklý profil.
                </p>
              </>
            )}
          </div>
        )}

        {/* Smazat */}
        {canEdit && (
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => {
                if (confirm("Smazat tohoto kandidáta?")) deleteCandidate.mutate();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Smazat kandidáta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
