// Single source of truth for "planned vs. actual" stats computed
// directly from client_meetings rows. Used across Dashboard,
// MemberActivity and MojeAktivity so the cards always agree
// with the PDF export.
//
// Definitions (matching exportPdf.ts):
//   • planned = ALL meetings of a given type in the period
//               (including cancelled and meetings without a recorded outcome)
//   • actual  = non-cancelled meetings of that type with date <= today
//   • ref     = sum of doporuceni_* columns; planned = all non-cancelled,
//               actual = non-cancelled with date <= today

export interface MeetingStatRow {
  meeting_type: string;
  cancelled: boolean;
  date: string;
  doporuceni_fsa?: number | null;
  doporuceni_poradenstvi?: number | null;
  doporuceni_pohovor?: number | null;
}

export interface PlannedActual {
  actual: number;
  planned: number;
}

export interface MeetingStats {
  fsa: PlannedActual;
  poh: PlannedActual;
  ser: PlannedActual;
  por: PlannedActual;
  ref: PlannedActual;
}

const sumRefs = (arr: MeetingStatRow[]) =>
  arr.reduce(
    (acc, m) =>
      acc +
      (Number(m.doporuceni_fsa) || 0) +
      (Number(m.doporuceni_poradenstvi) || 0) +
      (Number(m.doporuceni_pohovor) || 0),
    0,
  );

export function computeMeetingStats(meetings: MeetingStatRow[], todayStr: string): MeetingStats {
  // For type-counts: planned uses ALL rows (incl. cancelled), actual filters
  // out cancellations and future-dated rows. For doporučení we exclude
  // cancellations from both (cancelled meetings shouldn't count their refs).
  const countAll = (type: string) => meetings.filter((m) => m.meeting_type === type).length;
  const countActual = (type: string) =>
    meetings.filter((m) => m.meeting_type === type && !m.cancelled && m.date <= todayStr).length;

  const refsAll = meetings.filter((m) => !m.cancelled);
  const refsActual = refsAll.filter((m) => m.date <= todayStr);

  return {
    fsa: { planned: countAll("FSA"), actual: countActual("FSA") },
    poh: { planned: countAll("POH"), actual: countActual("POH") },
    ser: { planned: countAll("SER"), actual: countActual("SER") },
    por: { planned: countAll("POR"), actual: countActual("POR") },
    ref: { planned: sumRefs(refsAll), actual: sumRefs(refsActual) },
  };
}
