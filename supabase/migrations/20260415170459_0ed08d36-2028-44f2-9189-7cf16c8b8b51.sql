ALTER TABLE public.vedouci_goals 
  ADD COLUMN IF NOT EXISTS ziskatel_count_goal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ziskatel_count_scope text NOT NULL DEFAULT 'direct';