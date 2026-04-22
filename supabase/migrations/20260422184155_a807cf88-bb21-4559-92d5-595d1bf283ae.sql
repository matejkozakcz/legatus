CREATE TABLE IF NOT EXISTS public.notification_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.notification_rules(id) ON DELETE CASCADE,
  rule_name text,
  trigger_event text,
  run_at timestamptz NOT NULL DEFAULT now(),
  matched boolean NOT NULL DEFAULT false,
  inserted_count integer NOT NULL DEFAULT 0,
  forced boolean NOT NULL DEFAULT false,
  error_message text,
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS idx_run_log_rule ON public.notification_run_log(rule_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_log_run_at ON public.notification_run_log(run_at DESC);

ALTER TABLE public.notification_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view run log"
ON public.notification_run_log
FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY "Service role / admin can insert run log"
ON public.notification_run_log
FOR INSERT
TO authenticated
WITH CHECK (is_admin());