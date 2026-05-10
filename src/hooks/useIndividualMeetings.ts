import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IndividualMeeting {
  id: string;
  org_unit_id: string;
  subject_id: string;
  author_id: string;
  meeting_date: string;
  notes: string;
  next_steps: string;
  created_at: string;
  updated_at: string;
  author: { id: string; full_name: string; role: string } | null;
}

export function useIndividualMeetings(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["individual_meetings", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("individual_meetings")
        .select("*, author:profiles!author_id(id, full_name, role)")
        .eq("subject_id", subjectId!)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as IndividualMeeting[];
    },
  });
}
