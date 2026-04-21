-- Add per-user count_type for people goals: 'total' (current state) or 'increment' (new gains in period)
ALTER TABLE public.vedouci_goals
  ADD COLUMN IF NOT EXISTS vedouci_count_type text NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS budouci_vedouci_count_type text NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS garant_count_type text NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS ziskatel_count_type text NOT NULL DEFAULT 'total';

ALTER TABLE public.vedouci_goals
  DROP CONSTRAINT IF EXISTS vedouci_goals_vedouci_count_type_check,
  ADD CONSTRAINT vedouci_goals_vedouci_count_type_check
    CHECK (vedouci_count_type IN ('total', 'increment'));

ALTER TABLE public.vedouci_goals
  DROP CONSTRAINT IF EXISTS vedouci_goals_budouci_vedouci_count_type_check,
  ADD CONSTRAINT vedouci_goals_budouci_vedouci_count_type_check
    CHECK (budouci_vedouci_count_type IN ('total', 'increment'));

ALTER TABLE public.vedouci_goals
  DROP CONSTRAINT IF EXISTS vedouci_goals_garant_count_type_check,
  ADD CONSTRAINT vedouci_goals_garant_count_type_check
    CHECK (garant_count_type IN ('total', 'increment'));

ALTER TABLE public.vedouci_goals
  DROP CONSTRAINT IF EXISTS vedouci_goals_ziskatel_count_type_check,
  ADD CONSTRAINT vedouci_goals_ziskatel_count_type_check
    CHECK (ziskatel_count_type IN ('total', 'increment'));
