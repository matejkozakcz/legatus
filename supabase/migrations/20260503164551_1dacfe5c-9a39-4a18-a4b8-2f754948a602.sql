DROP POLICY IF EXISTS "Users can view own goals" ON public.vedouci_goals;

CREATE POLICY "Users can view own goals"
  ON public.vedouci_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Vedouci view team goals"
  ON public.vedouci_goals FOR SELECT
  USING (
    public.get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND public.is_in_vedouci_subtree(auth.uid(), user_id)
  );