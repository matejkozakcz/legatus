CREATE POLICY "Vedouci can delete promotion requests"
ON public.promotion_requests
FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'vedouci'::text);