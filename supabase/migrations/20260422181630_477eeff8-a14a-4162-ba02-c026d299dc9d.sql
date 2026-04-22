-- ============================================================
-- Notifications MVP — Phase 1: core tables
-- ============================================================

-- ── notifications ─────────────────────────────────────────────
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rule_id UUID, -- FK added in phase 2 when notification_rules exists
  trigger_event TEXT NOT NULL,             -- e.g. 'promotion_approved', 'manual', 'scheduled'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,                                -- lucide icon name
  accent_color TEXT,                        -- hex / hsl token
  link_url TEXT,                            -- in-app route to open on click
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, -- variables used to render the template
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_recipient_unread
  ON public.notifications (recipient_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipient sees own notifications
CREATE POLICY "Recipient can view own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (recipient_id = auth.uid());

-- Recipient marks own as read
CREATE POLICY "Recipient can update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- Recipient deletes own notifications
CREATE POLICY "Recipient can delete own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (recipient_id = auth.uid());

-- Any authenticated user (the "sender session") may insert notifications.
-- Server-side helpers always set sender_id = auth.uid() or NULL for system events.
CREATE POLICY "Authenticated can insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (true);

-- Admins see everything (for diagnostics / log tab)
CREATE POLICY "Admin can view all notifications"
ON public.notifications FOR SELECT TO authenticated
USING (is_admin());


-- ── push_subscriptions ──────────────────────────────────────
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manages own push subscriptions"
ON public.push_subscriptions FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin can view push subscriptions"
ON public.push_subscriptions FOR SELECT TO authenticated
USING (is_admin());


-- ── Realtime ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;