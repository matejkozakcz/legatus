ALTER TABLE public.vedouci_goals
  ADD COLUMN IF NOT EXISTS vedouci_count_type text NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS budouci_vedouci_count_type text NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS garant_count_type text NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS ziskatel_count_type text NOT NULL DEFAULT 'total';