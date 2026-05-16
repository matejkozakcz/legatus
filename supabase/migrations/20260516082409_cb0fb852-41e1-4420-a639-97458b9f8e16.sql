ALTER TABLE public.call_party_entries
  ADD COLUMN IF NOT EXISTS meeting_date date,
  ADD COLUMN IF NOT EXISTS meeting_time time;