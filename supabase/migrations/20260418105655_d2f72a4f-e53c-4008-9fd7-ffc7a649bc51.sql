
-- Diagnostic log of every scheduled-notifications run per rule
CREATE TABLE public.notification_rule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.notification_rules(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched BOOLEAN NOT NULL DEFAULT true,
  recipients_count INT NOT NULL DEFAULT 0,
  inserted_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  push_sent_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',  -- 'ok' | 'partial' | 'error' | 'skipped'
  error_message TEXT,
  details JSONB
);

CREATE INDEX idx_notif_rule_runs_rule_ran ON public.notification_rule_runs(rule_id, ran_at DESC);
CREATE INDEX idx_notif_rule_runs_ran ON public.notification_rule_runs(ran_at DESC);

ALTER TABLE public.notification_rule_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view rule runs"
  ON public.notification_rule_runs FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can delete rule runs"
  ON public.notification_rule_runs FOR DELETE
  TO authenticated
  USING (is_admin());
-- Inserts come exclusively from edge functions using the service role, which bypasses RLS.
