import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  getProductionPeriodForMonth,
  getProductionPeriodMonth,
  getProductionPeriodEnd,
} from "@/lib/productionPeriod";
import { format } from "date-fns";

/**
 * Vrací informaci o uzávěrce produkce pro PŘEDCHOZÍ produkční období,
 * pokud už skončilo a uživatel ho ještě neuzavřel.
 *
 * Nabídne se den po skončení období.
 */
export function useProductionClosure() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["production_closure_status", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date();
      // Předchozí měsíc oproti aktuálnímu produkčnímu období
      const cur = getProductionPeriodMonth(today);
      const prevMonth = cur.month === 0 ? 11 : cur.month - 1;
      const prevYear = cur.month === 0 ? cur.year - 1 : cur.year;
      const prev = getProductionPeriodForMonth(prevYear, prevMonth);

      // Den, od kterého má uzávěrku nabízet — den po konci období
      const offerSince = new Date(prev.end);
      offerSince.setDate(offerSince.getDate() + 1);

      // Existující uzávěrka?
      const { data: closures } = await supabase
        .from("production_closures" as any)
        .select("id, closed_at, notes")
        .eq("user_id", user!.id)
        .eq("period_year", prevYear)
        .eq("period_month", prevMonth + 1) // ukládáme 1..12
        .maybeSingle();

      const isClosed = !!closures;

      // Pokud období ještě neskončilo, nezobrazujeme
      const periodEnded = today >= offerSince;

      return {
        prevYear,
        prevMonth, // 0-indexed
        periodStart: prev.start,
        periodEnd: prev.end,
        isClosed,
        periodEnded,
        shouldOffer: periodEnded && !isClosed,
      };
    },
  });
}

/** Pomocný export pro modal — natáhne schůzky daného uživatele v daném období. */
export async function fetchPeriodMeetings(userId: string, start: Date, end: Date) {
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("client_meetings")
    .select(
      "id, date, meeting_type, case_name, podepsane_bj, poradenstvi_status, bj_recognized_date, cancelled, outcome_recorded"
    )
    .eq("user_id", userId)
    .in("meeting_type", ["POR", "FSA", "SER"])
    .gte("date", startStr)
    .lte("date", endStr)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
