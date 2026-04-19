ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_id uuid;

CREATE INDEX IF NOT EXISTS idx_notifications_related_entity
  ON public.notifications(related_entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_unread_entity
  ON public.notifications(recipient_id, type, related_entity_id)
  WHERE read = false AND related_entity_id IS NOT NULL;