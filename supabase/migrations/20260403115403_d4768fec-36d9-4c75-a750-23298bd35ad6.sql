
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  deadline date NOT NULL,
  reminder_sent boolean NOT NULL DEFAULT false,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sender can insert for direct subordinates"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = recipient_id
    AND (vedouci_id = auth.uid() OR garant_id = auth.uid() OR ziskatel_id = auth.uid())
    AND is_active = true
  )
);

CREATE POLICY "Recipient can select own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = recipient_id);

CREATE POLICY "Sender can select sent notifications"
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = sender_id);

CREATE POLICY "Recipient can update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions"
ON public.push_subscriptions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
