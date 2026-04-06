CREATE TABLE public.vedouci_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  team_bj_goal INTEGER NOT NULL DEFAULT 0,
  personal_bj_goal INTEGER NOT NULL DEFAULT 0,
  vedouci_count_goal INTEGER NOT NULL DEFAULT 0,
  budouci_vedouci_count_goal INTEGER NOT NULL DEFAULT 0,
  garant_count_goal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_key)
);

ALTER TABLE public.vedouci_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals"
  ON public.vedouci_goals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals"
  ON public.vedouci_goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON public.vedouci_goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON public.vedouci_goals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);