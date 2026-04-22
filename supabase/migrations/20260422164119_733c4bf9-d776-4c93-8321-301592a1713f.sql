CREATE POLICY "Admin can update all meetings"
  ON public.client_meetings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());