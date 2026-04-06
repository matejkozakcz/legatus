CREATE TABLE public.promotion_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_role text NOT NULL,
  event text NOT NULL,
  cumulative_bj integer,
  direct_ziskatels integer,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.promotion_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vedouci can view all promotion history"
ON public.promotion_history
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'vedouci'::text);

CREATE POLICY "Users can view own promotion history"
ON public.promotion_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can insert promotion history"
ON public.promotion_history
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX idx_promotion_history_user_id ON public.promotion_history(user_id, created_at DESC);