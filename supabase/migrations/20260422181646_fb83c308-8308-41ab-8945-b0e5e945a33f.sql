DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Authenticated can insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (sender_id IS NULL OR sender_id = auth.uid());