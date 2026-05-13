// Náborová cesta — typy a centrální výpočet.
// Volitelný modul, řízen `org_units.show_recruitment_funnel`.

export type RecruitmentStage =
  | "CALL"
  | "NAB"
  | "POH"
  | "INFO"
  | "POST"
  | "REG"
  | "SUPERVIZE"
  | "LOST";

export const RECRUITMENT_STAGES: RecruitmentStage[] = [
  "CALL",
  "NAB",
  "POH",
  "INFO",
  "POST",
  "REG",
  "SUPERVIZE",
];

export const STAGE_LABELS: Record<RecruitmentStage, string> = {
  CALL: "Call",
  NAB: "Nábor",
  POH: "Pohovor",
  INFO: "Info",
  POST: "Postinfo",
  REG: "Registrace",
  SUPERVIZE: "Supervize",
  LOST: "Ztracený",
};

export const STAGE_COLORS: Record<RecruitmentStage, string> = {
  CALL: "#8aadb3",
  NAB: "#7E22CE",
  POH: "#0D9488",
  INFO: "#7B5EA7",
  POST: "#5E7AB5",
  REG: "#00abbd",
  SUPERVIZE: "#fc7c71",
  LOST: "#9ca3af",
};

export interface CandidateRow {
  id: string;
  current_stage: RecruitmentStage;
  stage_changed_at: string;
  created_at: string;
  registered_profile_id?: string | null;
}

export interface FunnelSummary {
  byStage: Record<RecruitmentStage, number>;
  total: number;
  active: number; // vše kromě LOST
  conversion: number; // REG+SUPERVIZE / active (procenta 0-100)
}

export function emptyByStage(): Record<RecruitmentStage, number> {
  return {
    CALL: 0, NAB: 0, POH: 0, INFO: 0, POST: 0, REG: 0, SUPERVIZE: 0, LOST: 0,
  };
}

export function computeRecruitmentFunnel(rows: CandidateRow[]): FunnelSummary {
  const byStage = emptyByStage();
  for (const r of rows) byStage[r.current_stage] = (byStage[r.current_stage] || 0) + 1;
  const total = rows.length;
  const active = total - byStage.LOST;
  const reached = byStage.REG + byStage.SUPERVIZE;
  const conversion = active > 0 ? Math.round((reached / active) * 100) : 0;
  return { byStage, total, active, conversion };
}

/** Vrací další "očekávanou" fázi (manuální posun). LOST a SUPERVIZE jsou koncové. */
export function nextStage(stage: RecruitmentStage): RecruitmentStage | null {
  const i = RECRUITMENT_STAGES.indexOf(stage);
  if (i < 0 || i >= RECRUITMENT_STAGES.length - 1) return null;
  return RECRUITMENT_STAGES[i + 1];
}

/** Auto-posun na základě typu schůzky a výsledku. */
export function stageAfterMeeting(
  meetingType: string,
  outcome: { jdeDal?: boolean | null; attended?: boolean | null },
): RecruitmentStage | null {
  if (meetingType === "NAB" && outcome.jdeDal === true) return "POH";
  if (meetingType === "POH" && outcome.jdeDal === true) return "INFO";
  if (meetingType === "INFO" && outcome.attended === true) return "POST";
  if (meetingType === "POST" && outcome.attended === true) return "REG";
  return null;
}
