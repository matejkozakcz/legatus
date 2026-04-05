
-- Add new columns to existing notifications table
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'deadline',
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS related_meeting_id uuid REFERENCES public.client_meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
