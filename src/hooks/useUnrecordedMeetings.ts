import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export interface UnrecordedMeeting {
  id: string;
  date: string;
  meeting_type: string;
  case_name: string | null;
  meeting_time: string | null;
}

export function useUnrecordedMeetings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ["unrecorded_meetings", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("id, date, meeting_type, case_name, meeting_time")
        .eq("user_id", user.id)
        .eq("cancelled", false)
        .eq("outcome_recorded", false)
        .lte("date", todayStr)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []) as UnrecordedMeeting[];
    },
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  // Realtime subscription — auto-invalidate on any client_meetings change
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("unrecorded-meetings-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_meetings",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["unrecorded_meetings", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return {
    unrecordedMeetings: meetings,
    unrecordedCount: meetings.length,
    isLoading,
  };
}
