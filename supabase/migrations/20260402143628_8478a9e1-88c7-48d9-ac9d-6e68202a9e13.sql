
ALTER TABLE public.profiles ADD COLUMN ziskatel_id uuid REFERENCES public.profiles(id);

-- Backfill: set ziskatel_id = garant_id for existing users (the person who acquired them)
UPDATE public.profiles SET ziskatel_id = garant_id WHERE ziskatel_id IS NULL AND garant_id IS NOT NULL;
