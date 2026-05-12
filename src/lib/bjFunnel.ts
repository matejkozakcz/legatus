// Centrální výpočet BJ funnelu (Plánované → Rozpracované → Realizované).
// Single source of truth pro Dashboard, Detail člena, Obchodní případy a PDF export.
//
// Definice (potvrzeno s uživatelem):
//   • Plánované   = SUM(potencial_bj) ze všech ne-zrušených FSA/SER schůzek v období
//                   (i budoucí, i proběhlé). Reprezentuje potenciál v pipeline.
//   • Rozpracované = SUM(podepsane_bj || bj) ze schůzek, kde klient řekl ANO,
//                   ale ještě nepodepsal: outcome_recorded=true, vizi_spoluprace=true,
//                   podepsane_bj == 0, cancelled=false.
//                   Pro tyhle případy bereme potencial_bj jako odhad rozjednaného objemu.
//   • Realizované = SUM(podepsane_bj) ze všech ne-zrušených schůzek v období.

export interface BjFunnelMeetingRow {
  meeting_type: string;
  cancelled: boolean;
  outcome_recorded?: boolean | null;
  vizi_spoluprace?: boolean | null;
  potencial_bj?: number | null;
  podepsane_bj?: number | null;
}

export interface BjFunnel {
  planned: number;
  inProgress: number;
  realized: number;
}

export function computeBjFunnel(meetings: BjFunnelMeetingRow[]): BjFunnel {
  let planned = 0;
  let inProgress = 0;
  let realized = 0;

  for (const m of meetings) {
    if (m.cancelled) continue;

    const pot = Number(m.potencial_bj) || 0;
    const pod = Number(m.podepsane_bj) || 0;

    // Plánované — z FSA/SER, kde je definován potencial_bj
    if ((m.meeting_type === "FSA" || m.meeting_type === "SER") && pot > 0) {
      planned += pot;
    }

    // Realizované — co je podepsáno
    realized += pod;

    // Rozpracované — klient řekl ANO, ještě nepodepsáno
    if (m.outcome_recorded === true && m.vizi_spoluprace === true && pod === 0) {
      // Přednostně potencial_bj, jinak 0 (není čím odhadnout)
      inProgress += pot;
    }
  }

  return { planned, inProgress, realized };
}

/** Sloupce, které je potřeba vybrat z client_meetings pro výpočet funnelu. */
export const BJ_FUNNEL_COLUMNS =
  "meeting_type, cancelled, outcome_recorded, vizi_spoluprace, potencial_bj, podepsane_bj";
