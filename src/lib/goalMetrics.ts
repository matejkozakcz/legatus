// Centrální definice cílových metrik pro user_goals systém.
// Každá metrika má label, zda je periodická / může být trvalá, a zda jde o "people goal".

export type MetricKey =
  | "personal_bj"
  | "team_bj"
  | "ser_bj"
  | "fsa_count"
  | "poh_count"
  | "referrals"
  | "lidi_na_info"
  | "garant_count"
  | "ziskatel_count"
  | "vedouci_count"
  | "budouci_vedouci_count";

export type GoalScope = "direct" | "structure";
export type GoalCountType = "total" | "increment";

export interface MetricDef {
  key: MetricKey;
  label: string;
  shortLabel?: string;
  placeholder: string;
  /** Lze nastavit jako periodický (pro konkrétní období) */
  periodic: boolean;
  /** Lze nastavit jako trvalý */
  permanent: boolean;
  /** Vyžaduje scope + count_type (počty lidí ve struktuře) */
  peopleGoal: boolean;
  /** Tip / nápověda pro UI */
  hint?: string;
}

export const METRIC_DEFS: Record<MetricKey, MetricDef> = {
  personal_bj: {
    key: "personal_bj",
    label: "Osobní BJ",
    placeholder: "např. 500",
    periodic: true,
    permanent: false,
    peopleGoal: false,
  },
  team_bj: {
    key: "team_bj",
    label: "Týmové BJ",
    placeholder: "např. 5000",
    periodic: true,
    permanent: false,
    peopleGoal: false,
  },
  ser_bj: {
    key: "ser_bj",
    label: "Servisní BJ",
    placeholder: "např. 200",
    periodic: true,
    permanent: false,
    peopleGoal: false,
  },
  fsa_count: {
    key: "fsa_count",
    label: "Analýzy",
    placeholder: "např. 20",
    periodic: true,
    permanent: false,
    peopleGoal: false,
  },
  poh_count: {
    key: "poh_count",
    label: "Pohovory",
    placeholder: "např. 8",
    periodic: true,
    permanent: false,
    peopleGoal: false,
  },
  referrals: {
    key: "referrals",
    label: "Doporučení",
    placeholder: "např. 30",
    periodic: true,
    permanent: false,
    peopleGoal: false,
  },
  lidi_na_info: {
    key: "lidi_na_info",
    label: "Lidi na info",
    placeholder: "např. 15",
    periodic: true,
    permanent: false,
    peopleGoal: false,
  },
  garant_count: {
    key: "garant_count",
    label: "Počet Garantů",
    placeholder: "0",
    periodic: true,
    permanent: true,
    peopleGoal: true,
  },
  ziskatel_count: {
    key: "ziskatel_count",
    label: "Lidi po SV",
    placeholder: "0",
    periodic: true,
    permanent: true,
    peopleGoal: true,
  },
  vedouci_count: {
    key: "vedouci_count",
    label: "Počet Vedoucích",
    placeholder: "0",
    periodic: true,
    permanent: true,
    peopleGoal: true,
  },
  budouci_vedouci_count: {
    key: "budouci_vedouci_count",
    label: "Počet BV",
    placeholder: "0",
    periodic: true,
    permanent: true,
    peopleGoal: true,
  },
};

export const ALL_METRICS: MetricKey[] = Object.keys(METRIC_DEFS) as MetricKey[];

export const PEOPLE_METRICS: MetricKey[] = ALL_METRICS.filter((k) => METRIC_DEFS[k].peopleGoal);

export function metricLabel(key: string): string {
  return METRIC_DEFS[key as MetricKey]?.label ?? key;
}
