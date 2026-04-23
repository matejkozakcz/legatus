import { useMemo } from "react";
import { ArrowDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversionMeeting {
  id: string;
  meeting_type: string;       // "FSA" | "POR" | "SER" | "POH" | …
  cancelled: boolean;
  outcome_recorded?: boolean | null;
  parent_meeting_id?: string | null;
}

interface ConversionFunnelProps {
  meetings: ConversionMeeting[];
}

// ─── Style tokens ─────────────────────────────────────────────────────────────

const COLORS = {
  fsa: "#F59E0B",     // Analýzy – yellow
  por: "#8B5CF6",     // Poradenství – purple
  ser: "#EF4444",     // Servisy – red
  poh: "#0D9488",     // Pohovory – teal
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Počítá konverzi: kolik proběhlých schůzek dané aktivity má v datasetu navazující POH
 * skrze parent_meeting_id (skutečná follow-up vazba), a kolik POH celkem z této aktivity vzniklo.
 */
function calcStats(
  meetings: ConversionMeeting[],
  type: string,
  pohByParent: Map<string, number>,
) {
  const all = meetings.filter((m) => m.meeting_type === type);
  const planned = all.length;
  const actualMeetings = all.filter((m) => !m.cancelled && m.outcome_recorded === true);
  const actual = actualMeetings.length;
  // Počet proběhlých schůzek tohoto typu, na které je v datasetu navázán alespoň jeden POH
  const meetingsWithFollowup = actualMeetings.filter((m) => (pohByParent.get(m.id) ?? 0) > 0).length;
  // Absolutní počet POH navázaných na proběhlé schůzky tohoto typu
  const pohFromHere = actualMeetings.reduce((sum, m) => sum + (pohByParent.get(m.id) ?? 0), 0);
  const reliability = planned > 0 ? Math.round((actual / planned) * 100) : 0;
  const pohConversion = actual > 0 ? Math.round((meetingsWithFollowup / actual) * 100) : 0;
  return { planned, actual, pohFromHere, reliability, pohConversion };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniColumn({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 flex-1 min-w-0">
      <span className="font-body text-[11px] font-medium text-muted-foreground lowercase text-center">
        {label}
      </span>
      <span
        className="font-heading leading-none text-center"
        style={{
          color: "var(--text-primary)",
          fontSize: 28,
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ReliabilityBar({ reliability, color }: { reliability: number; color: string }) {
  return (
    <div
      className="w-full bg-muted overflow-hidden"
      style={{ height: 4 }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, reliability))}%`,
          height: "100%",
          background: color,
        }}
      />
    </div>
  );
}

function SourceGroup({
  title,
  color,
  domluvene,
  probehle,
  reliability,
  pohConversion,
  pohCount,
}: {
  title: string;
  color: string;
  domluvene: number;
  probehle: number;
  reliability: number;
  pohConversion: number;
  pohCount: number;
}) {
  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      {/* Unified card: title + two columns + progress bar at bottom */}
      <div
        className="rounded-xl bg-card flex flex-col overflow-hidden min-w-0"
        style={{ border: `1.5px solid ${color}`, boxShadow: "var(--shadow-sm)" }}
      >
        {/* Title */}
        <div
          className="font-body text-center"
          style={{ paddingTop: 10, fontSize: 13, fontWeight: 500, color: "#EF8C6F" }}
        >
          {title}
        </div>

        {/* Two columns side-by-side */}
        <div className="flex flex-1">
          <MiniColumn label="domluvené" value={domluvene} />
          <MiniColumn label="proběhlé" value={probehle} />
        </div>

        {/* Progress bar — flush to bottom */}
        <ReliabilityBar reliability={reliability} color={color} />
      </div>

      {/* Down-arrow + conversion to POH — hidden when no conversion */}
      {(pohConversion > 0 || pohCount > 0) && (
        <div className="flex flex-col items-center gap-1" style={{ marginTop: 6 }}>
          <div className="font-body text-[11px] text-muted-foreground leading-none">
            {pohConversion} %
          </div>
          <ArrowDown size={14} className="text-muted-foreground" />
          <div className="font-body text-[10px] text-muted-foreground uppercase tracking-wide">
            {pohCount} POH
          </div>
        </div>
      )}
    </div>
  );
}

function OriginBar({ fsaPct, porPct, serPct }: { fsaPct: number; porPct: number; serPct: number }) {
  return (
    <div className="flex flex-col gap-2 min-w-[180px] flex-1">
      <span className="font-body text-[11px] text-muted-foreground lowercase">původ</span>

      {/* Stacked bar */}
      <div className="h-2.5 rounded-full overflow-hidden flex bg-muted">
        {fsaPct > 0 && <div style={{ width: `${fsaPct}%`, background: COLORS.fsa }} />}
        {porPct > 0 && <div style={{ width: `${porPct}%`, background: COLORS.por }} />}
        {serPct > 0 && <div style={{ width: `${serPct}%`, background: COLORS.ser }} />}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[11px] text-muted-foreground">
        <LegendDot color={COLORS.fsa} label={`FSA ${fsaPct} %`} />
        <LegendDot color={COLORS.por} label={`POR ${porPct} %`} />
        <LegendDot color={COLORS.ser} label={`SER ${serPct} %`} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block rounded-full"
        style={{ width: 8, height: 8, background: color }}
      />
      {label}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ConversionFunnel({ meetings }: ConversionFunnelProps) {
  const stats = useMemo(() => {
    // Build map: parent_meeting_id -> count of POH children that actually happened (or are planned)
    // Konverze počítáme nad všemi POH (i necancelled), aby naplánovaný follow-up ihned poznal vazbu.
    const pohByParent = new Map<string, number>();
    meetings.forEach((m) => {
      if (m.meeting_type === "POH" && m.parent_meeting_id) {
        pohByParent.set(m.parent_meeting_id, (pohByParent.get(m.parent_meeting_id) ?? 0) + 1);
      }
    });

    const fsa = calcStats(meetings, "FSA", pohByParent);
    const por = calcStats(meetings, "POR", pohByParent);
    const ser = calcStats(meetings, "SER", pohByParent);

    // POH karta – domluvené = všechny POH v období, proběhlé = potvrzené
    const pohAll = meetings.filter((m) => m.meeting_type === "POH");
    const pohPlanned = pohAll.length;
    const pohActual = pohAll.filter(
      (m) => !m.cancelled && m.outcome_recorded === true,
    ).length;
    const pohReliability = pohPlanned > 0 ? Math.round((pohActual / pohPlanned) * 100) : 0;

    // Origin breakdown z navázaných POH
    const totalLinkedPoh = fsa.pohFromHere + por.pohFromHere + ser.pohFromHere;
    const fsaPct = totalLinkedPoh > 0 ? Math.round((fsa.pohFromHere / totalLinkedPoh) * 100) : 0;
    const porPct = totalLinkedPoh > 0 ? Math.round((por.pohFromHere / totalLinkedPoh) * 100) : 0;
    const serPct = totalLinkedPoh > 0 ? Math.max(0, 100 - fsaPct - porPct) : 0;

    return { fsa, por, ser, pohPlanned, pohActual, pohReliability, fsaPct, porPct, serPct };
  }, [meetings]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top row — 3 source-activity groups */}
      <div className="flex items-stretch" style={{ gap: 11 }}>
        <SourceGroup
          title="Analýzy"
          color={COLORS.fsa}
          domluvene={stats.fsa.planned}
          probehle={stats.fsa.actual}
          reliability={stats.fsa.reliability}
          pohConversion={stats.fsa.pohConversion}
          pohCount={stats.fsa.pohFromHere}
        />
        <SourceGroup
          title="Poradenství"
          color={COLORS.por}
          domluvene={stats.por.planned}
          probehle={stats.por.actual}
          reliability={stats.por.reliability}
          pohConversion={stats.por.pohConversion}
          pohCount={stats.por.pohFromHere}
        />
        <SourceGroup
          title="Servisy"
          color={COLORS.ser}
          domluvene={stats.ser.planned}
          probehle={stats.ser.actual}
          reliability={stats.ser.reliability}
          pohConversion={stats.ser.pohConversion}
          pohCount={stats.ser.pohFromHere}
        />
      </div>

      {/* Bottom — POH summary card */}
      <div>
        <div
          className="rounded-xl bg-card flex flex-col overflow-hidden"
          style={{ border: `2px solid ${COLORS.poh}`, boxShadow: "var(--shadow-sm)" }}
        >
          {/* Title inside card */}
          <div
            className="font-body text-center"
            style={{ paddingTop: 10, fontSize: 13, fontWeight: 500, color: "#EF8C6F" }}
          >
            Pohovory
          </div>

          <div
            className="px-5 py-4 flex flex-col sm:flex-row items-stretch"
            style={{ gap: 14 }}
          >
            {/* Domluvené */}
            <div className="flex flex-col gap-1 sm:px-3 sm:flex-1 min-w-0">
              <span className="font-body text-[11px] text-muted-foreground lowercase">domluvené</span>
              <span
                className="font-heading leading-none"
                style={{ color: COLORS.poh, fontSize: 32, fontWeight: 600 }}
              >
                {stats.pohPlanned}
              </span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-border" />

            {/* Reliability — center big */}
            <div className="flex flex-col items-center justify-center sm:px-3 sm:flex-1">
              <span
                className="font-heading leading-none"
                style={{ color: "var(--text-primary)", fontSize: 32, fontWeight: 500 }}
              >
                {stats.pohReliability} %
              </span>
              <span className="font-body text-xs text-muted-foreground mt-1">spolehlivost</span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-border" />

            {/* Proběhlé */}
            <div className="flex flex-col gap-1 sm:px-3 sm:flex-1 min-w-0">
              <span className="font-body text-[11px] text-muted-foreground lowercase">proběhlé</span>
              <span
                className="font-heading leading-none"
                style={{ color: "var(--text-primary)", fontSize: 32, fontWeight: 500 }}
              >
                {stats.pohActual}
              </span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-border" />

            {/* Origin */}
            <OriginBar fsaPct={stats.fsaPct} porPct={stats.porPct} serPct={stats.serPct} />
          </div>

          {/* Progress bar — flush to bottom */}
          <ReliabilityBar reliability={stats.pohReliability} color={COLORS.poh} />
        </div>
      </div>
    </div>
  );
}
