ALTER TABLE public.promotion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own promotion requests"
ON public.promotion_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Vedouci can view team promotion requests"
ON public.promotion_requests FOR SELECT TO authenticated
USING (public.get_user_role(auth.uid()) = 'vedouci');

CREATE POLICY "System can insert promotion requests"
ON public.promotion_requests FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Vedouci can update promotion requests"
ON public.promotion_requests FOR UPDATE TO authenticated
USING (public.get_user_role(auth.uid()) = 'vedouci')
WITH CHECK (public.get_user_role(auth.uid()) = 'vedouci');