-- Allow admin to insert and delete any meeting
CREATE POLICY "Admin can insert all meetings"
  ON public.client_meetings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can delete all meetings"
  ON public.client_meetings FOR DELETE TO authenticated
  USING (public.is_admin());