CREATE POLICY "Users can insert self notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_id AND auth.uid() = recipient_id);