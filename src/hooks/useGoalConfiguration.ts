import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface GoalSetting {
  mode: "system" | "custom";
  value: number | null;
}

interface PromotionTarget {
  role: string;
  mode: "system" | "custom";
  value: number;
  scope: "direct" | "full_structure";
  type: "total" | "increment";
}

interface RoleGoals {
  monthly_bj: GoalSetting;
  fsa_weekly: GoalSetting;
  ser_weekly: GoalSetting;
  poh_weekly: GoalSetting;
  referrals_weekly: GoalSetting;
  team_bj?: GoalSetting;
  promotions?: PromotionTarget[];
}

type GoalConfiguration = Record<string, RoleGoals>;

interface ResolvedGoals {
  monthly_bj: number | null;
  fsa_weekly: number | null;
  ser_weekly: number | null;
  poh_weekly: number | null;
  referrals_weekly: number | null;
  team_bj: number | null;
  promotions: PromotionTarget[];
}

/**
 * Fetches goal configuration from app_config and resolves goals for a given role.
 * Returns system-set values when mode is "system", null when mode is "custom" (user decides).
 */
export function useGoalConfiguration(role: string | undefined) {
  const { data: config, isLoading } = useQuery({
    queryKey: ["app_config", "goal_configuration"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "goal_configuration")
        .single();
      return (data?.value as unknown as GoalConfiguration) ?? null;
    },
    staleTime: 5 * 60 * 1000, // cache for 5 min
  });

  const resolved: ResolvedGoals = {
    monthly_bj: null,
    fsa_weekly: null,
    ser_weekly: null,
    poh_weekly: null,
    referrals_weekly: null,
    team_bj: null,
    promotions: [],
  };

  if (config && role && config[role]) {
    const roleGoals = config[role];
    const resolve = (g: GoalSetting | undefined): number | null => {
      if (!g) return null;
      return g.mode === "system" ? (g.value ?? null) : null;
    };

    resolved.monthly_bj = resolve(roleGoals.monthly_bj);
    resolved.fsa_weekly = resolve(roleGoals.fsa_weekly);
    resolved.ser_weekly = resolve(roleGoals.ser_weekly);
    resolved.poh_weekly = resolve(roleGoals.poh_weekly);
    resolved.referrals_weekly = resolve(roleGoals.referrals_weekly);
    resolved.team_bj = resolve(roleGoals.team_bj);
    resolved.promotions = roleGoals.promotions || [];
  }

  return { goals: resolved, isLoading, rawConfig: config };
}
