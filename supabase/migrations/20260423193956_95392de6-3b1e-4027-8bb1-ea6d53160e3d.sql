ALTER TABLE public.client_meetings
ADD COLUMN parent_meeting_id uuid REFERENCES public.client_meetings(id) ON DELETE SET NULL;

CREATE INDEX idx_client_meetings_parent_meeting_id
ON public.client_meetings(parent_meeting_id);