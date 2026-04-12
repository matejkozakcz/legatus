import { useState, useEffect } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Loader2, Pencil, CalendarPlus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { meetingTypeLabel, type MeetingType } from "@/components/MeetingFormFields";

export interface MeetingDetailData {
  id: string;
  date: string;
  meeting_type: MeetingType | string;
  cancelled: boolean;
  case_name: string | null;
  case_id: string | null;
  meeting_time: string | null;
  duration_minutes: number | null;
  location_type: string | null;
  location_detail: string | null;
  poznamka: string | null;
  doporuceni_fsa: number;
  podepsane_bj: number;
  doporuceni_poradenstvi: number;
  pohovor_jde_dal: boolean | null;
  doporuceni_pohovor: number;
  outcome_recorded: boolean;
}

export interface FollowUpData {
  meeting_type: MeetingType;
  date: string;
  time: string;
  case_id: string;
}

const FOLLOW_UP_TYPE: Record<string, MeetingType | null> = {
  FSA: "POR",
  POR: "SER",
  SER: "POR",
  POH: null,
};

interface MeetingDetailModalProps {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDetailData | null;
  onEdit: () => void;
  onSaveOutcome?: (meetingId: string, data: Record<string, unknown>) => void;
  savingOutcome?: boolean;
  onCancel?: () => void;
  onScheduleFollowUp?: (data: FollowUpData) => void;
}

export function MeetingDetailModal({
  open, onClose, meeting, onEdit,
  onSaveOutcome, savingOutcome,
  onCancel, onScheduleFollowUp,
}: MeetingDetailModalProps) {
  useBodyScrollLock(open);

  const [dopFsa, setDopFsa] = useState("0");
  const [podBj, setPodBj] = useState("0");
  const [dopPor, setDopPor] = useState("0");
  const [pohDal, setPohDal] = useState<boolean | null>(null);
  const [dopPoh, setDopPoh] = useState("0");
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [followUpTime, setFollowUpTime] = useState("09:00");

  useEffect(() => {
    if (meeting) {
      setDopFsa(meeting.doporuceni_fsa?.toString() || "0");
      setPodBj(meeting.podepsane_bj?.toString() || "0");
      setDopPor(meeting.doporuceni_poradenstvi?.toString() || "0");
      setPohDal(meeting.pohovor_jde_dal ?? null);
      setDopPoh(meeting.doporuceni_pohovor?.toString() || "0");
      setEditingOutcome(false);
      setShowFollowUp(false);
      setFollowUpDate(format(new Date(), "yyyy-MM-dd"));
      setFollowUpTime("09:00");
    }
  }, [meeting]);

  if (!open || !meeting) return null;
  const m = meeting;
  const today = format(new Date(), "yyyy-MM-dd");
  const isPast = !m.cancelled && m.date <= today;
  const showOutcomeForm = onSaveOutcome && isPast && (!m.outcome_recorded || editingOutcome);
  const showOutcomeSummary = isPast && m.outcome_recorded && !editingOutcome;
  const followUpType = FOLLOW_UP_TYPE[m.meeting_type as string] ?? null;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );

  const handleSaveOutcome = () => {
    if (!onSaveOutcome) return;
    const data: Record<string, unknown> = { outcome_recorded: true };
    if (m.meeting_type === "FSA") {
      data.doporuceni_fsa = parseInt(dopFsa) || 0;
    } else if (m.meeting_type === "POR" || m.meeting_type === "SER") {
      data.podepsane_bj = parseFloat(podBj) || 0;
      data.doporuceni_poradenstvi = parseInt(dopPor) || 0;
    } else if (m.meeting_type === "POH") {
      data.pohovor_jde_dal = pohDal;
      data.doporuceni_pohovor = parseInt(dopPoh) || 0;
    }
    onSaveOutcome(m.id, data);
    // Show follow-up section after saving (if applicable)
    if (followUpType && onScheduleFollowUp && m.case_id) {
      setShowFollowUp(true);
    }
  };

  const handleScheduleFollowUp = () => {
    if (!onScheduleFollowUp || !followUpType || !m.case_id) return;
    onScheduleFollowUp({
      meeting_type: followUpType,
      date: followUpDate,
      time: followUpTime,
      case_id: m.case_id,
    });
    onClose();
  };

  const renderOutcomeSummary = () => {
    const rows: { label: string; value: string }[] = [];
    if (m.meeting_type === "FSA") {
      rows.push({ label: "Doporučení FSA", value: String(m.doporuceni_fsa) });
    } else if (m.meeting_type === "POR" || m.meeting_type === "SER") {
      rows.push({ label: "Podepsané BJ", value: String(m.podepsane_bj) });
      rows.push({ label: "Doporučení", value: String(m.doporuceni_poradenstvi) });
    } else if (m.meeting_type === "POH") {
      rows.push({ label: "Jde dál?", value: m.pohovor_jde_dal === true ? "Ano" : m.pohovor_jde_dal === false ? "Ne" : "—" });
      rows.push({ label: "Doporučení", value: String(m.doporuceni_pohovor) });
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
          {m.meeting_time && row("Čas", m.meeting_time.slice(0, 5))}
          {m.duration_minutes != null && row("Délka", `${m.duration_minutes} min`)}
          {row("Typ", meetingTypeLabel(m.meeting_type as MeetingType))}
          {m.location_type && row("Místo", m.location_type === "osobne" ? "Osobně" : "Online")}
          {m.location_detail && row(m.location_type === "osobne" ? "Adresa" : "Platforma", m.location_detail)}
          {m.cancelled && row("Stav", "Zrušená")}
          {m.poznamka && row("Poznámka", m.poznamka)}
        </div>

        {/* Outcome read-only summary */}
        {showOutcomeSummary && renderOutcomeSummary()}

        {/* Outcome form — for past, non-cancelled meetings without recorded outcome */}
        {showOutcomeForm && !showFollowUp && (
          <div className="mt-4 p-3 rounded-xl border border-input">
            <label className="block text-xs font-semibold text-muted-foreground mb-3">Výsledek schůzky</label>

            {m.meeting_type === "FSA" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Doporučení FSA</label>
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

            {m.meeting_type === "POH" && (
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
                  <input type="number" value={dopPoh} onChange={(e) => setDopPoh(e.target.value)} min={0}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
            )}

            <button onClick={handleSaveOutcome} disabled={savingOutcome}
              className="btn btn-primary btn-md w-full flex items-center justify-center gap-2 mt-3">
              {savingOutcome && <Loader2 className="h-4 w-4 animate-spin" />} Uložit výsledek
            </button>
          </div>
        )}

        {/* Inline follow-up section — shown after outcome is saved */}
        {showFollowUp && followUpType && m.case_id && (
          <div className="mt-4 p-3 rounded-xl border border-input">
            <div className="flex items-center gap-2 mb-3">
              <CalendarPlus className="h-4 w-4" style={{ color: "#00abbd" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                Naplánovat následnou schůzku?
              </span>
            </div>
            <div className="mb-3">
              <span className="text-xs text-muted-foreground">
                Typ: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{meetingTypeLabel(followUpType)}</span>
              </span>
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Datum</label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Čas</label>
                <input
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFollowUp(false)}
                className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                Přeskočit
              </button>
              <button
                onClick={handleScheduleFollowUp}
                className="btn btn-primary btn-md flex-1 flex items-center justify-center gap-2"
              >
                <CalendarPlus className="h-4 w-4" /> Naplánovat
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!showFollowUp && (
          <div className="flex gap-3 mt-4">
            {onCancel && !m.cancelled && (
              <button
                onClick={onCancel}
                className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" /> Zrušit
              </button>
            )}
            <button onClick={onEdit}
              className={`${onCancel && !m.cancelled ? "flex-1" : "w-full"} h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors hover:opacity-80 border border-input text-muted-foreground`}>
              <Pencil className="h-4 w-4" /> Upravit schůzku
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
