CREATE TABLE public.push_delivery_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id uuid,
  recipient_id uuid NOT NULL,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  expired_removed integer NOT NULL DEFAULT 0,
  subscription_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  general_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_delivery_log_notification ON public.push_delivery_log(notification_id);
CREATE INDEX idx_push_delivery_log_recipient ON public.push_delivery_log(recipient_id);
CREATE INDEX idx_push_delivery_log_created ON public.push_delivery_log(created_at DESC);

ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view delivery log"
  ON public.push_delivery_log FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Service can insert delivery log"
  ON public.push_delivery_log FOR INSERT
  TO authenticated
  WITH CHECK (true);