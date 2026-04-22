-- ============================================================
-- Notifications MVP — Phase 2: rules / templates
-- ============================================================

CREATE TABLE public.notification_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Template content
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  icon TEXT,
  accent_color TEXT,
  link_url TEXT,

  -- Recipient resolution
  recipient_roles JSONB NOT NULL DEFAULT '[]'::jsonb,   -- e.g. ["self","ziskatel","vedouci"]
  recipient_filters JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"only_active": true, "role_in": ["garant"]}

  -- Scheduling (for trigger_event = 'scheduled')
  schedule_cron TEXT,                                   -- e.g. '0 9 * * *'
  schedule_timezone TEXT NOT NULL DEFAULT 'Europe/Prague',
  last_run_at TIMESTAMPTZ,

  -- Extra conditions per trigger
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_rules_trigger_active
  ON public.notification_rules (trigger_event) WHERE is_active = true;

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

-- Admins manage everything
CREATE POLICY "Admin manages notification rules"
ON public.notification_rules FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Authenticated users can read active rules (needed for client-side event evaluation)
CREATE POLICY "Authenticated can view active rules"
ON public.notification_rules FOR SELECT TO authenticated
USING (is_active = true);

-- updated_at trigger
CREATE TRIGGER notification_rules_set_updated_at
BEFORE UPDATE ON public.notification_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Backfill FK from notifications.rule_id (column already exists from phase 1)
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_rule_id_fkey
  FOREIGN KEY (rule_id) REFERENCES public.notification_rules(id) ON DELETE SET NULL;