import { useState, useEffect } from "react";
import { X, Loader2, Check, Plus } from "lucide-react";
import { format } from "date-fns";
import type { MeetingType } from "@/components/MeetingFormFields";

export interface FollowUpScheduleData {
  case_id: string;
  meeting_type: MeetingType;
  date: string;
  meeting_time: string;
  duration_minutes: string;
  location_type: string;
  location_detail: string;
}

interface FollowUpModalProps {
  open: boolean;
  onClose: () => void;
  caseName: string;
  caseId: string;
  meetingType: MeetingType;
  onSchedule: (data: FollowUpScheduleData) => Promise<void> | void;
}

/** Returns the suggested client-track follow-up type, or null for POH */
function getClientFollowUp(t: MeetingType): { type: MeetingType; label: string } | null {
  if (t === "FSA") return { type: "POR", label: "Poradenství" };
  if (t === "POR") return { type: "SER", label: "Servis" };
  if (t === "SER") return { type: "POR", label: "Poradenství" };
  return null; // POH — no client track
}

// ─── Inline mini-form ────────────────────────────────────────────────────────

function InlineMiniForm({
  onConfirm,
  onCancel,
  saving,
}: {
  onConfirm: (data: { date: string; time: string; duration: string; locationType: string; locationDetail: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [locationType, setLocationType] = useState("");
  const [locationDetail, setLocationDetail] = useState("");

  return (
    <div className="space-y-3 mt-3 pt-3 border-t border-border">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Datum *</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Čas schůzky</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Délka (min)</label>
          <input type="number" min={0} step={1} value={duration} onChange={(e) => setDuration(e.target.value)}
            placeholder="0" className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Místo</label>
        <div className="flex gap-2 mb-2">
          {(["osobne", "online"] as const).map((lt) => (
            <button key={lt} type="button"
              onClick={() => setLocationType(locationType === lt ? "" : lt)}
              className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${locationType === lt ? "border-transparent text-white" : "border-input bg-background text-muted-foreground"}`}
              style={locationType === lt ? { background: "#00abbd" } : {}}>
              {lt === "osobne" ? "Osobně" : "Online"}
            </button>
          ))}
        </div>
        {locationType && (
          <input type="text" value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)}
            placeholder={locationType === "osobne" ? "Adresa…" : "Platforma…"}
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        )}
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel}
          className="flex-1 h-10 rounded-xl border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          Zrušit
        </button>
        <button onClick={() => onConfirm({ date, time, duration, locationType, locationDetail })}
          disabled={!date || saving}
          className="btn btn-primary btn-md flex-1 flex items-center justify-center gap-1">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Naplánovat
        </button>
      </div>
    </div>
  );
}

// ─── Track section ───────────────────────────────────────────────────────────

function TrackSection({
  label,
  buttonLabel,
  caseId,
  meetingType,
  onSchedule,
}: {
  label: string;
  buttonLabel: string;
  caseId: string;
  meetingType: MeetingType;
  onSchedule: (data: FollowUpScheduleData) => Promise<void> | void;
}) {
  const [state, setState] = useState<"idle" | "expanded" | "done" | "skipped">("idle");
  const [saving, setSaving] = useState(false);

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#00abbd" }}>
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-medium text-foreground">{buttonLabel} naplánováno</span>
      </div>
    );
  }

  if (state === "skipped") return null;

  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-2">{label}</label>
      {state === "idle" && (
        <div className="space-y-1">
          <button onClick={() => setState("expanded")}
            className="w-full h-10 rounded-xl border border-input bg-background text-sm font-semibold text-foreground hover:border-ring transition-colors flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> {buttonLabel}
          </button>
          <button onClick={() => setState("skipped")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
            Přeskočit
          </button>
        </div>
      )}
      {state === "expanded" && (
        <InlineMiniForm
          saving={saving}
          onCancel={() => setState("idle")}
          onConfirm={async (d) => {
            setSaving(true);
            try {
              await onSchedule({
                case_id: caseId,
                meeting_type: meetingType,
                date: d.date,
                meeting_time: d.time,
                duration_minutes: d.duration,
                location_type: d.locationType,
                location_detail: d.locationDetail,
              });
              setState("done");
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export function FollowUpModal({ open, onClose, caseName, caseId, meetingType, onSchedule }: FollowUpModalProps) {
  const [clientDone, setClientDone] = useState(false);
  const [recruitDone, setRecruitDone] = useState(false);

  const clientSuggestion = getClientFollowUp(meetingType);
  const showClient = clientSuggestion !== null; // not POH
  const showRecruit = meetingType !== "POH";

  useEffect(() => {
    if (open) {
      setClientDone(false);
      setRecruitDone(false);
    }
  }, [open]);

  // Auto-close when both tracks resolved
  useEffect(() => {
    if (!open) return;
    const clientResolved = !showClient || clientDone;
    const recruitResolved = !showRecruit || recruitDone;
    if (clientResolved && recruitResolved) {
      // Small delay so the user can see the checkmark
      const t = setTimeout(onClose, 600);
      return () => clearTimeout(t);
    }
  }, [clientDone, recruitDone, showClient, showRecruit, open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
          Jaký je další krok s {caseName}?
        </h2>

        <div className="space-y-5">
          {showClient && clientSuggestion && (
            <TrackSection
              label="Klientská stopa"
              buttonLabel={clientSuggestion.label}
              caseId={caseId}
              meetingType={clientSuggestion.type}
              onSchedule={async (data) => {
                await onSchedule(data);
                setClientDone(true);
              }}
            />
          )}

          {showRecruit && (
            <TrackSection
              label="Náborová stopa"
              buttonLabel="Pohovor"
              caseId={caseId}
              meetingType="POH"
              onSchedule={async (data) => {
                await onSchedule(data);
                setRecruitDone(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
