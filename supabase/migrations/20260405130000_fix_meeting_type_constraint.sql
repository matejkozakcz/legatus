-- Fix meeting_type check constraint to include all valid types
ALTER TABLE public.client_meetings
  DROP CONSTRAINT IF EXISTS client_meetings_meeting_type_check;

ALTER TABLE public.client_meetings
  ADD CONSTRAINT client_meetings_meeting_type_check
    CHECK (meeting_type IN ('FSA', 'POH', 'SER'));
