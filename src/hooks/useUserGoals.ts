import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GoalScope, GoalCountType, MetricKey } from "@/lib/goalMetrics";

export interface UserGoal {
  id: string;
  user_id: string;
  metric_key: MetricKey;
  period_key: string | null;
  target_value: number;
  scope: GoalScope;
  count_type: GoalCountType;
  set_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Načte cíle uživatele pro dané období + trvalé cíle (period_key IS NULL).
 */
export function useUserGoals(userId: string | undefined, periodKey: string | null) {
  return useQuery({
    queryKey: ["user_goals", userId, periodKey],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { periodicGoals: [], permanentGoals: [] };
      // Periodické (pro dané období) + trvalé (period_key IS NULL)
      const { data, error } = await supabase
        .from("user_goals" as any)
        .select("*")
        .eq("user_id", userId)
        .or(`period_key.eq.${periodKey ?? ""},period_key.is.null`);
      if (error) throw error;
      const rows = (data || []) as unknown as UserGoal[];
      return {
        periodicGoals: rows.filter((r) => r.period_key === periodKey && periodKey !== null),
        permanentGoals: rows.filter((r) => r.period_key === null),
      };
    },
    staleTime: 30 * 1000,
  });
}
