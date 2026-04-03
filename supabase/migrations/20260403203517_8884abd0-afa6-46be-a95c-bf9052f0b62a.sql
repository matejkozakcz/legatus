
ALTER TABLE public.client_meetings ADD COLUMN IF NOT EXISTS case_name text DEFAULT NULL;
ALTER TABLE public.client_meetings ADD COLUMN IF NOT EXISTS poradko_date date DEFAULT NULL;
ALTER TABLE public.client_meetings ADD COLUMN IF NOT EXISTS pohovor_date date DEFAULT NULL;
