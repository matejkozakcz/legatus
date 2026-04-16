ALTER TABLE public.client_meetings 
  ADD COLUMN IF NOT EXISTS info_zucastnil_se boolean,
  ADD COLUMN IF NOT EXISTS info_pocet_lidi integer;