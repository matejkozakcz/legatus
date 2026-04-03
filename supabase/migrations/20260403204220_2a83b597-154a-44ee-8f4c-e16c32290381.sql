
ALTER TABLE public.client_meetings ADD COLUMN IF NOT EXISTS poradko_status text DEFAULT NULL;
-- Migrate existing data: if has_poradko and podepsane_bj > 0, mark as probehle
UPDATE public.client_meetings SET poradko_status = 'probehle' WHERE has_poradko = true AND podepsane_bj > 0;
