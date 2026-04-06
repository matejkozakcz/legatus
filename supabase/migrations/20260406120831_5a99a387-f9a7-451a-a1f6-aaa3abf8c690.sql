ALTER TABLE public.vedouci_goals 
ADD COLUMN vedouci_count_scope text NOT NULL DEFAULT 'direct',
ADD COLUMN budouci_vedouci_count_scope text NOT NULL DEFAULT 'direct',
ADD COLUMN garant_count_scope text NOT NULL DEFAULT 'direct';