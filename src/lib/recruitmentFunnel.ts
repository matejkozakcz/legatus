// Náborová cesta — typy a centrální výpočet.
// Volitelný modul, řízen `org_units.show_recruitment_funnel`.
// Sekvence: NAB (volitelný) → POH (spouštěč) → INFO → POST → SUPERVIZE → REG.

export type RecruitmentStage =
  | "NAB"
  | "POH"
  | "INFO"
  | "POST"
  | "SUPERVIZE"
  | "REG"
  | "LOST";

export const RECRUITMENT_STAGES: RecruitmentStage[] = [
  "NAB",
  "POH",
  "INFO",
  "POST",
  "SUPERVIZE",
  "REG",
];

export const STAGE_LABELS: Record<RecruitmentStage, string> = {
  NAB: "Nábor",
  POH: "Pohovor",
  INFO: "Info",
  POST: "Postinfo",
  SUPERVIZE: "Supervize",
  REG: "Registrace",
  LOST: "Ztracený",
};

export const STAGE_COLORS: Record<RecruitmentStage, string> = {
  NAB: "#7E22CE",
  POH: "#0D9488",
  INFO: "#7B5EA7",
  POST: "#5E7AB5",
  SUPERVIZE: "#fc7c71",
  REG: "#00abbd",
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
  conversion: number; // REG / active (procenta 0-100)
}

export function emptyByStage(): Record<RecruitmentStage, number> {
  return {
    NAB: 0, POH: 0, INFO: 0, POST: 0, SUPERVIZE: 0, REG: 0, LOST: 0,
  };
}

export function computeRecruitmentFunnel(rows: CandidateRow[]): FunnelSummary {
  const byStage = emptyByStage();
  for (const r of rows) byStage[r.current_stage] = (byStage[r.current_stage] || 0) + 1;
  const total = rows.length;
  const active = total - byStage.LOST;
  const conversion = active > 0 ? Math.round((byStage.REG / active) * 100) : 0;
  return { byStage, total, active, conversion };
}

/** Vrací další "očekávanou" fázi (manuální posun). LOST a REG jsou koncové. */
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
  if (meetingType === "POST" && outcome.attended === true) return "SUPERVIZE";
  return null;
}
