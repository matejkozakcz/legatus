import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Loader2, Pencil, CalendarPlus, Users, FileText, Shield, Check, Clock, ClipboardCheck, Ban, UserPlus } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { cs } from "date-fns/locale";
import { meetingTypeLabel, type MeetingType } from "@/components/MeetingFormFields";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { CandidatePicker } from "@/components/recruitment/CandidatePicker";
import { stageAfterMeeting, type RecruitmentStage } from "@/lib/recruitmentFunnel";
import { useAuth } from "@/contexts/AuthContext";

export interface MeetingDetailData {
  id: string;
  date: string;
  meeting_type: MeetingType | string;
  cancelled: boolean;
  case_name: string | null;
  location_type: string | null;
  location_detail: string | null;
  poznamka: string | null;
  doporuceni_fsa: number;
  podepsane_bj: number;
  doporuceni_poradenstvi: number;
  pohovor_jde_dal: boolean | null;
  doporuceni_pohovor: number;
  outcome_recorded: boolean;
  info_zucastnil_se?: boolean | null;
  info_pocet_lidi?: number | null;
  recruitment_candidate_id?: string | null;
}

interface MeetingDetailModalProps {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDetailData | null;
  onEdit: () => void;
  onSaveOutcome?: (meetingId: string, data: Record<string, unknown>) => void;
  savingOutcome?: boolean;
  onCancel?: () => void;
  onScheduleFollowUp?: (data: { meeting_type: string; date: string }) => void;
}

export function MeetingDetailModal({
  open, onClose, meeting, onEdit,
  onSaveOutcome, savingOutcome,
  onCancel, onScheduleFollowUp,
}: MeetingDetailModalProps) {
  useBodyScrollLock(open);

  const { showRecruitmentFunnel } = useWorkspaceSettings();
  const { user } = useAuth();

  const [dopFsa, setDopFsa] = useState("0");
  const [podBj, setPodBj] = useState("0");
  const [dopPor, setDopPor] = useState("0");
  const [pohDal, setPohDal] = useState<boolean | null>(null);
  const [dopPoh, setDopPoh] = useState("0");
  const [infoZuc, setInfoZuc] = useState<boolean | null>(null);
  const [infoPocet, setInfoPocet] = useState("0");
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showNextStep, setShowNextStep] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [justCancelled, setJustCancelled] = useState(false);
  const [prevSaving, setPrevSaving] = useState(false);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const prevMeetingId = useRef<string | null>(null);

  // Reset state only when opening a DIFFERENT meeting (not on refetch of the same one)
  useEffect(() => {
    if (meeting && meeting.id !== prevMeetingId.current) {
      prevMeetingId.current = meeting.id;
      setDopFsa(meeting.doporuceni_fsa?.toString() || "0");
      setPodBj(meeting.podepsane_bj?.toString() || "0");
      setDopPor(meeting.doporuceni_poradenstvi?.toString() || "0");
      setPohDal(meeting.pohovor_jde_dal ?? null);
      setDopPoh(meeting.doporuceni_pohovor?.toString() || "0");
      setInfoZuc(meeting.info_zucastnil_se ?? null);
      setInfoPocet(meeting.info_pocet_lidi != null ? String(meeting.info_pocet_lidi) : "0");
      setCandidateId(meeting.recruitment_candidate_id ?? null);
      // Load attendees for INFO/POST
      if (meeting.meeting_type === "INFO" || meeting.meeting_type === "POST") {
        supabase
          .from("info_attendees" as any)
          .select("candidate_id")
          .eq("meeting_id", meeting.id)
          .then(({ data }) => setAttendeeIds(((data ?? []) as any[]).map((r) => r.candidate_id)));
      } else {
        setAttendeeIds([]);
      }
      setEditingOutcome(false);
      setShowReschedule(false);
      setShowNextStep(false);
      setJustCancelled(false);
      setPrevSaving(false);
      // Pre-fill reschedule with next week
      const nextDate = addDays(parseISO(meeting.date), 7);
      setRescheduleDate(format(nextDate, "yyyy-MM-dd"));
    }
  }, [meeting]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      prevMeetingId.current = null;
    }
  }, [open]);

  // Detect when saving completes → show next step prompt
  useEffect(() => {
    if (prevSaving && !savingOutcome) {
      // Save just completed successfully
      setShowNextStep(true);
      setEditingOutcome(false);
      // Pre-fill next step date
      if (meeting) {
        const nextDate = addDays(parseISO(meeting.date), 7);
        setRescheduleDate(format(nextDate, "yyyy-MM-dd"));
      }
    }
    setPrevSaving(!!savingOutcome);
  }, [savingOutcome]);

  // Count "Staráčci" — other Legatus users from my structure who attended the same INFO/POST event
  // (RLS filters automatically: vedouci sees subtree, others see only their own → result will be 0 for non-leaders)
  const isInfoPost = meeting?.meeting_type === "INFO" || meeting?.meeting_type === "POST";
  const { data: staracciCount = 0 } = useQuery({
    queryKey: ["info_staracci_count", meeting?.id, meeting?.date, meeting?.meeting_type],
    queryFn: async () => {
      if (!meeting || !isInfoPost) return 0;
      const { data, error } = await supabase
        .from("client_meetings")
        .select("id, user_id, info_zucastnil_se")
        .eq("date", meeting.date)
        .eq("meeting_type", meeting.meeting_type)
        .eq("info_zucastnil_se", true)
        .eq("cancelled", false);
      if (error) return 0;
      // Distinct attending users excluding the current meeting's owner row
      const ids = new Set<string>();
      for (const row of data ?? []) {
        if (row.id !== meeting.id) ids.add(row.user_id);
      }
      return ids.size;
    },
    enabled: !!meeting && isInfoPost && !!open,
    staleTime: 30_000,
  });

  if (!open || !meeting) return null;
  const m = meeting;
  const today = format(new Date(), "yyyy-MM-dd");
  const isPast = !m.cancelled && m.date <= today;
  const showOutcomeForm = onSaveOutcome && isPast && (!m.outcome_recorded || editingOutcome);
  const showOutcomeSummary = isPast && m.outcome_recorded && !editingOutcome;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );

  const handleSaveOutcome = async () => {
    if (!onSaveOutcome) return;
    const data: Record<string, unknown> = { outcome_recorded: true };
    if (m.meeting_type === "FSA") {
      data.doporuceni_fsa = parseInt(dopFsa) || 0;
    } else if (m.meeting_type === "NAB") {
      data.pohovor_jde_dal = pohDal;
      data.doporuceni_fsa = parseInt(dopFsa) || 0;
    } else if (m.meeting_type === "POR" || m.meeting_type === "SER") {
      data.podepsane_bj = parseFloat(podBj) || 0;
      data.doporuceni_poradenstvi = parseInt(dopPor) || 0;
    } else if (m.meeting_type === "POH") {
      data.pohovor_jde_dal = pohDal;
      data.doporuceni_pohovor = parseInt(dopPoh) || 0;
    } else if (m.meeting_type === "INFO" || m.meeting_type === "POST") {
      data.info_zucastnil_se = infoZuc;
      data.info_pocet_lidi = parseInt(infoPocet) || 0;
    }

    // Recruitment: link candidate for POH/NAB
    if (showRecruitmentFunnel && (m.meeting_type === "POH" || m.meeting_type === "NAB")) {
      data.recruitment_candidate_id = candidateId;
    }

    onSaveOutcome(m.id, data);

    // Recruitment side-effects (fire-and-forget)
    if (showRecruitmentFunnel) {
      try {
        // Sync attendees for INFO/POST
        if (m.meeting_type === "INFO" || m.meeting_type === "POST") {
          const { data: existing } = await supabase
            .from("info_attendees" as any)
            .select("id, candidate_id")
            .eq("meeting_id", m.id);
          const existingMap = new Map<string, string>(((existing ?? []) as any[]).map((r) => [r.candidate_id, r.id]));
          const toAdd = attendeeIds.filter((id) => !existingMap.has(id));
          const toRemove = [...existingMap.entries()].filter(([cid]) => !attendeeIds.includes(cid)).map(([, id]) => id);
          if (toAdd.length) {
            await supabase.from("info_attendees" as any).insert(
              toAdd.map((cid) => ({ meeting_id: m.id, candidate_id: cid })) as any,
            );
          }
          if (toRemove.length) {
            await supabase.from("info_attendees" as any).delete().in("id", toRemove);
          }
        }

        // Auto-advance candidate stage for POH/NAB
        if (candidateId && (m.meeting_type === "POH" || m.meeting_type === "NAB")) {
          const next = stageAfterMeeting(m.meeting_type, { jdeDal: pohDal });
          if (next && user) {
            const { data: cand } = await supabase
              .from("recruitment_candidates" as any)
              .select("current_stage, stage_history")
              .eq("id", candidateId)
              .maybeSingle();
            const curStage = (cand as any)?.current_stage as RecruitmentStage | undefined;
            // Only advance forward
            const order = ["CALL","NAB","POH","INFO","POST","REG","SUPERVIZE"];
            if (curStage && order.indexOf(next) > order.indexOf(curStage)) {
              const history = [...(((cand as any)?.stage_history) ?? []), { stage: next, at: new Date().toISOString(), by: user.id }];
              await supabase
                .from("recruitment_candidates" as any)
                .update({ current_stage: next, stage_changed_at: new Date().toISOString(), stage_history: history } as any)
                .eq("id", candidateId);
            }
          }
        }
      } catch (e) {
        console.error("Recruitment sync failed:", e);
      }
    }
  };

  const renderOutcomeSummary = () => {
    const rows: { label: string; value: string }[] = [];
    if (m.meeting_type === "FSA") {
      rows.push({ label: "Doporučení", value: String(m.doporuceni_fsa) });
    } else if (m.meeting_type === "NAB") {
      rows.push({ label: "Jde dál?", value: m.pohovor_jde_dal === true ? "Ano" : m.pohovor_jde_dal === false ? "Ne" : "—" });
      rows.push({ label: "Doporučení", value: String(m.doporuceni_fsa) });
    } else if (m.meeting_type === "POR" || m.meeting_type === "SER") {
      rows.push({ label: "Podepsané BJ", value: String(m.podepsane_bj) });
      rows.push({ label: "Doporučení", value: String(m.doporuceni_poradenstvi) });
    } else if (m.meeting_type === "POH") {
      rows.push({ label: "Jde dál?", value: m.pohovor_jde_dal === true ? "Ano" : m.pohovor_jde_dal === false ? "Ne" : "—" });
      rows.push({ label: "Doporučení", value: String(m.doporuceni_pohovor) });
    } else if (m.meeting_type === "INFO" || m.meeting_type === "POST") {
      rows.push({ label: "Zúčastnil se?", value: m.info_zucastnil_se === true ? "Ano" : m.info_zucastnil_se === false ? "Ne" : "—" });
      rows.push({ label: "Nováčci (mimo Legatus)", value: String(m.info_pocet_lidi ?? 0) });
      rows.push({ label: "Staráčci (z mojí struktury)", value: String(staracciCount) });
    }
    if (rows.length === 0) return null;
    return (
      <div className="mt-4 p-3 rounded-xl border border-input">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground">Výsledek schůzky</span>
          {onSaveOutcome && (
            <button
              onClick={() => setEditingOutcome(true)}
              className="text-xs font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: "#00abbd" }}
            >
              <Pencil className="h-3 w-3" /> Upravit
            </button>
          )}
        </div>
        <div className="space-y-0">
          {rows.map((r) => row(r.label, r.value))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm legatus-modal-glass rounded-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - 64px)", marginBottom: "env(safe-area-inset-bottom, 0px)", paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Detail schůzky
        </h2>
        <div className="space-y-0">
          {m.case_name && (
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-xs text-muted-foreground">Obchodní případ</span>
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{m.case_name}</span>
            </div>
          )}
          {row("Datum", m.cancelled ? "Zrušená" : format(parseISO(m.date), "d. M. yyyy", { locale: cs }))}
          {row("Typ", meetingTypeLabel(m.meeting_type as MeetingType))}
          {m.location_type && row("Místo", m.location_type === "osobne" ? "Osobně" : "Online")}
          {m.location_detail && row(m.location_type === "osobne" ? "Adresa" : "Platforma", m.location_detail)}
          {m.cancelled && row("Stav", <span style={{ color: "#fc7c71", fontWeight: 600 }}>Zrušená</span>)}
          {!m.cancelled && m.outcome_recorded && row("Stav", <span style={{ color: "#22c55e", fontWeight: 600 }}>Proběhlá</span>)}
          {m.poznamka && row("Poznámka", m.poznamka)}
        </div>

        {/* Progress indicator — only for non-POH meetings */}
        {m.meeting_type !== "POH" && (() => {
          const processSteps = [
            { key: "FSA", label: "Analýza", icon: Users },
            { key: "POR", label: "Poradenství", icon: FileText },
            { key: "SER", label: "Servis", icon: Shield },
          ];
          const currentProcessIdx = processSteps.findIndex(s => s.key === m.meeting_type);

          const todayStr = format(new Date(), "yyyy-MM-dd");
          const statusSteps = [
            { key: "planned", label: "Naplánována", icon: Clock },
            { key: "done", label: "Proběhla", icon: Check },
            { key: "outcome", label: "Výsledek", icon: ClipboardCheck },
          ];
          let currentStatusIdx = 0;
          if (m.cancelled) currentStatusIdx = -1; // cancelled state
          else if (m.outcome_recorded) currentStatusIdx = 2;
          else if (m.date <= todayStr) currentStatusIdx = 1;

          const getStatusColor = (i: number, activeIdx: number) => {
            if (m.cancelled) return "#fc7c71"; // red for cancelled
            if (i < activeIdx) return "#22c55e"; // green for completed steps
            if (i === activeIdx) {
              // Active step: orange if action needed, green if just done
              if (activeIdx === 1 && !m.outcome_recorded) return "#f59e0b"; // orange — needs outcome
              if (activeIdx === 2) return "#22c55e"; // green — all done
              return "#00abbd"; // teal for planned (no action needed yet)
            }
            return "var(--text-muted, #8aadb3)"; // future steps
          };

          const renderAxis = (steps: { key: string; label: string; icon: React.ElementType }[], activeIdx: number, useStatusColors = false) => (
            <div className="flex items-center w-full">
              {steps.map((step, i) => {
                const Icon = step.icon;
                const isActive = i === activeIdx;
                const isPast = i < activeIdx;
                const color = useStatusColors ? getStatusColor(i, activeIdx) : (isActive || isPast ? "#00abbd" : "var(--text-muted, #8aadb3)");
                const opacity = isActive ? 1 : isPast ? 0.5 : 0.3;
                return (
                  <div key={step.key} className="flex items-center" style={{ flex: i < steps.length - 1 ? 1 : undefined }}>
                    <div className="flex flex-col items-center" style={{ minWidth: 40 }}>
                      <div
                        className="flex items-center justify-center rounded-full transition-all"
                        style={{
                          width: isActive ? 28 : 22,
                          height: isActive ? 28 : 22,
                          background: isActive ? `${color}22` : isPast ? `${color}14` : "transparent",
                          border: `2px solid ${color}`,
                          opacity,
                        }}
                      >
                        {isPast ? (
                          <Check size={isActive ? 14 : 11} style={{ color }} />
                        ) : (
                          <Icon size={isActive ? 14 : 11} style={{ color }} />
                        )}
                      </div>
                      <span
                        className="mt-1 text-center leading-tight"
                        style={{
                          fontSize: 9,
                          fontWeight: isActive ? 700 : 500,
                          color,
                          opacity: isActive ? 1 : isPast ? 0.7 : 0.5,
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className="flex-1 mx-1"
                        style={{
                          height: 2,
                          background: i < activeIdx ? color : "hsl(var(--border))",
                          opacity: i < activeIdx ? 0.5 : 0.3,
                          borderRadius: 1,
                          marginBottom: 16,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );

          return (
            <div className="mt-4 space-y-3">
              {currentProcessIdx >= 0 && !m.cancelled && (
                <div>
                  <span className="block text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Proces</span>
                  {renderAxis(processSteps, currentProcessIdx)}
                </div>
              )}
              <div>
                <span className="block text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Stav</span>
                {m.cancelled ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center rounded-full" style={{ width: 28, height: 28, border: "2px solid #fc7c71", background: "rgba(252,124,113,0.12)" }}>
                      <X size={14} style={{ color: "#fc7c71" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fc7c71" }}>Zrušená</span>
                  </div>
                ) : renderAxis(statusSteps, currentStatusIdx, true)}
              </div>
            </div>
          );
        })()}

        {/* Outcome read-only summary */}
        {showOutcomeSummary && renderOutcomeSummary()}

        {/* Outcome form — for past, non-cancelled meetings without recorded outcome */}
        {showOutcomeForm && (
          <div className="mt-4 p-3 rounded-xl border border-input">
            <label className="block text-xs font-semibold text-muted-foreground mb-3">Výsledek schůzky</label>

            {m.meeting_type === "FSA" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Doporučení</label>
                <input type="number" value={dopFsa} onChange={(e) => setDopFsa(e.target.value)} min={0}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            )}

            {(m.meeting_type === "POR" || m.meeting_type === "SER") && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Podepsané BJ</label>
                  <input type="number" value={podBj} onChange={(e) => setPodBj(e.target.value)} step={0.5} min={0}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Doporučení</label>
                  <input type="number" value={dopPor} onChange={(e) => setDopPor(e.target.value)} min={0}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
            )}

            {(m.meeting_type === "POH" || m.meeting_type === "NAB") && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Jde dál?</label>
                  <div className="flex gap-2">
                    {([true, false, null] as const).map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setPohDal(val)}
                        className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${pohDal === val ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                        style={
                          pohDal === val
                            ? { background: val === true ? "#00abbd" : val === false ? "#fc7c71" : "#8aadb3" }
                            : {}
                        }
                      >
                        {val === true ? "Ano" : val === false ? "Ne" : "—"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Doporučení</label>
                  {m.meeting_type === "POH" ? (
                    <input type="number" value={dopPoh} onChange={(e) => setDopPoh(e.target.value)} min={0}
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  ) : (
                    <input type="number" value={dopFsa} onChange={(e) => setDopFsa(e.target.value)} min={0}
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  )}
                </div>
                {showRecruitmentFunnel && (
                  <div className="pt-2 border-t border-border">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
                      <UserPlus className="h-3.5 w-3.5" /> Náborová cesta — kandidát
                    </label>
                    <CandidatePicker
                      single
                      selectedIds={candidateId ? [candidateId] : []}
                      onChange={(ids) => setCandidateId(ids[0] ?? null)}
                    />
                  </div>
                )}
              </div>
            )}

            {(m.meeting_type === "INFO" || m.meeting_type === "POST") && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Zúčastnil se?</label>
                  <div className="flex gap-2">
                    {([true, false] as const).map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setInfoZuc(val)}
                        className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${infoZuc === val ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
                        style={
                          infoZuc === val
                            ? { background: val === true ? "#00abbd" : "#fc7c71" }
                            : {}
                        }
                      >
                        {val === true ? "Ano" : "Ne"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nováčci (mimo Legatus)</label>
                  <input type="number" value={infoPocet} onChange={(e) => setInfoPocet(e.target.value)} min={0}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                {showRecruitmentFunnel && (
                  <div className="pt-2 border-t border-border">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
                      <UserPlus className="h-3.5 w-3.5" /> Účastníci z náborové cesty
                    </label>
                    <CandidatePicker
                      selectedIds={attendeeIds}
                      onChange={setAttendeeIds}
                      placeholder="Přidat účastníka…"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Vlastník kandidáta po proběhnutí odklikne účast v detailu kandidáta.
                    </p>
                  </div>
                )}
              </div>
            )}

            <button onClick={handleSaveOutcome} disabled={savingOutcome}
              className="btn btn-primary btn-md w-full flex items-center justify-center gap-2 mt-3">
              {savingOutcome && <Loader2 className="h-4 w-4 animate-spin" />} Uložit výsledek
            </button>
          </div>
        )}

        {/* Next step after outcome save */}
        {showNextStep && onScheduleFollowUp && !showReschedule && (() => {
          const nextType = m.meeting_type === "FSA" ? "POR"
            : m.meeting_type === "POR" ? "SER"
            : m.meeting_type === "INFO" ? "POST"
            : m.meeting_type === "POST" ? "FSA"
            : (m.meeting_type === "POH" || m.meeting_type === "NAB") && pohDal === false ? "FSA"
            : m.meeting_type === "POH" && pohDal === true ? "FSA"
            : m.meeting_type === "NAB" && pohDal === true ? "FSA"
            : m.meeting_type === "NAB" && pohDal === null ? "FSA"
            : null;
          const nextLabel = nextType ? meetingTypeLabel(nextType as MeetingType) : null;
          if (!nextType || !nextLabel) return null;
          return (
            <div className="mt-4 p-3 rounded-xl border border-input space-y-3" style={{ borderColor: "rgba(0,171,189,0.3)", background: "rgba(0,171,189,0.04)" }}>
              <label className="block text-xs font-semibold" style={{ color: "#00abbd" }}>
                Naplánovat další krok — {nextLabel}?
              </label>
              <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
                  <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onScheduleFollowUp({
                      meeting_type: nextType,
                      date: rescheduleDate,
                    });
                    onClose();
                  }}
                  disabled={!rescheduleDate}
                  className="btn btn-primary btn-md flex-1 flex items-center justify-center gap-2"
                >
                  <CalendarPlus className="h-4 w-4" /> Naplánovat {nextLabel}
                </button>
                <button
                  onClick={() => setShowNextStep(false)}
                  className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Přeskočit
                </button>
              </div>
            </div>
          );
        })()}

        {/* Reschedule section after cancel */}
        {showReschedule && onScheduleFollowUp && (
          <div className="mt-4 p-3 rounded-xl border border-input space-y-3">
            <label className="block text-xs font-semibold text-muted-foreground">Naplánovat náhradní termín?</label>
            <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
                <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onScheduleFollowUp({
                    meeting_type: m.meeting_type as string,
                    date: rescheduleDate,
                  });
                  onClose();
                }}
                disabled={!rescheduleDate}
                className="btn btn-primary btn-md flex-1 flex items-center justify-center gap-2"
              >
                <CalendarPlus className="h-4 w-4" /> Naplánovat
              </button>
              <button
                onClick={() => setShowReschedule(false)}
                className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                Přeskočit
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mt-4">
          {onCancel && !m.cancelled && !justCancelled && (
            <button
              onClick={() => {
                onCancel();
                setJustCancelled(true);
                if (onScheduleFollowUp) {
                  setShowReschedule(true);
                }
              }}
              className="flex-1 h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors hover:opacity-80"
              style={{
                border: "1px solid rgba(252,124,113,0.4)",
                background: "rgba(252,124,113,0.08)",
                color: "#fc7c71",
              }}
            >
              <Ban className="h-4 w-4" /> Zrušit schůzku
            </button>
          )}
          {!showReschedule && !showNextStep && (
            <button onClick={onEdit}
              className={`${onCancel && !m.cancelled && !justCancelled ? "flex-1" : "w-full"} h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors hover:opacity-80 border border-input text-muted-foreground`}>
              <Pencil className="h-4 w-4" /> Upravit schůzku
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
