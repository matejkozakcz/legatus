CREATE POLICY "Admin can view all notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (public.is_admin());