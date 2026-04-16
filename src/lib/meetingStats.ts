// Single source of truth for "planned vs. actual" stats computed
// directly from client_meetings rows. Used across Dashboard,
// MemberActivity and MojeAktivity so the cards always agree
// with the PDF export.
//
// Definitions:
//   • planned = ALL meetings of a given type in the period
//               (including cancelled and meetings without a recorded outcome)
//   • actual  = meetings the user CONFIRMED as completed
//               (outcome_recorded = true AND not cancelled)
//   • ref     = sum of doporuceni_* columns; planned = all non-cancelled,
//               actual = only from confirmed (outcome_recorded) meetings
//
// IMPORTANT: "Proběhlá schůzka" = uživatel ji potvrdil jako proběhlou
// (outcome_recorded = true). Nestačí jen, že date <= today.

export interface MeetingStatRow {
  meeting_type: string;
  cancelled: boolean;
  date: string;
  outcome_recorded?: boolean | null;
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

export function computeMeetingStats(meetings: MeetingStatRow[], _todayStr?: string): MeetingStats {
  // Planned: ALL rows of given type in period (including cancelled / not yet recorded).
  // Actual: only meetings the user explicitly CONFIRMED as completed
  //         (outcome_recorded = true AND not cancelled).
  const countAll = (type: string) => meetings.filter((m) => m.meeting_type === type).length;
  const countActual = (type: string) =>
    meetings.filter(
      (m) => m.meeting_type === type && !m.cancelled && m.outcome_recorded === true,
    ).length;

  const refsAll = meetings.filter((m) => !m.cancelled);
  const refsActual = meetings.filter((m) => !m.cancelled && m.outcome_recorded === true);

  return {
    fsa: { planned: countAll("FSA"), actual: countActual("FSA") },
    poh: { planned: countAll("POH"), actual: countActual("POH") },
    ser: { planned: countAll("SER"), actual: countActual("SER") },
    por: { planned: countAll("POR"), actual: countActual("POR") },
    ref: { planned: sumRefs(refsAll), actual: sumRefs(refsActual) },
  };
}
