ALTER TABLE public.client_meetings DROP CONSTRAINT IF EXISTS client_meetings_meeting_type_check;
ALTER TABLE public.client_meetings ADD CONSTRAINT client_meetings_meeting_type_check
  CHECK (meeting_type = ANY (ARRAY['FSA'::text, 'POR'::text, 'SER'::text, 'POH'::text, 'NAB'::text, 'INFO'::text, 'POST'::text]));