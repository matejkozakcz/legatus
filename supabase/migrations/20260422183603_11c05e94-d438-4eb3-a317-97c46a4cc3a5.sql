-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Seed three scheduled rules (only if they don't exist yet, identified by trigger_event)
INSERT INTO public.notification_rules (
  name, description, trigger_event, is_active,
  title_template, body_template, icon, accent_color, link_url,
  recipient_roles, recipient_filters, conditions,
  schedule_cron, schedule_timezone
)
SELECT
  'Nezadané výsledky schůzek',
  'Denní připomínka uživatelům, kteří mají schůzky bez vyplněného výsledku.',
  'scheduled.unrecorded_meetings',
  true,
  'Máš {{count}} nezadaných výsledků',
  'Vyplň prosím výsledky svých schůzek. Nejstarší je z {{oldest_date}}.',
  'AlertCircle',
  'warning',
  '/moje-aktivity',
  '["self"]'::jsonb,
  '{"only_active": true}'::jsonb,
  '{"older_than_days": 1}'::jsonb,
  '0 18 * * *',
  'Europe/Prague'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_rules WHERE trigger_event = 'scheduled.unrecorded_meetings'
);

INSERT INTO public.notification_rules (
  name, description, trigger_event, is_active,
  title_template, body_template, icon, accent_color, link_url,
  recipient_roles, recipient_filters, conditions,
  schedule_cron, schedule_timezone
)
SELECT
  'Týdenní report',
  'Pondělí ráno — souhrn předchozího týdne (počet schůzek, BJ).',
  'scheduled.weekly_report',
  true,
  'Týdenní report ({{week_start}} – {{week_end}})',
  'Měl/a jsi {{meeting_count}} schůzek a {{total_bj}} BJ. Pěkná práce!',
  'TrendingUp',
  'accent',
  '/dashboard',
  '["self"]'::jsonb,
  '{"only_active": true}'::jsonb,
  '{}'::jsonb,
  '0 8 * * 1',
  'Europe/Prague'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_rules WHERE trigger_event = 'scheduled.weekly_report'
);

INSERT INTO public.notification_rules (
  name, description, trigger_event, is_active,
  title_template, body_template, icon, accent_color, link_url,
  recipient_roles, recipient_filters, conditions,
  schedule_cron, schedule_timezone
)
SELECT
  '3 dny bez aktivity',
  'Upozornění uživateli + jeho vedoucímu, pokud 3 dny nezadal žádnou schůzku.',
  'scheduled.inactive_days',
  true,
  '{{member_name}} 3 dny bez schůzky',
  'V posledních {{inactive_days}} dnech nebyla zaznamenána žádná schůzka.',
  'BellRing',
  'destructive',
  '/moje-aktivity',
  '["self", "vedouci"]'::jsonb,
  '{"only_active": true}'::jsonb,
  '{"inactive_days": 3}'::jsonb,
  '0 9 * * *',
  'Europe/Prague'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_rules WHERE trigger_event = 'scheduled.inactive_days'
);

-- Store edge function URL for scheduled runner in app_config
INSERT INTO public.app_config (key, value, description)
VALUES (
  'edge_scheduled_url',
  to_jsonb('https://hiisenvrdakfnlzkiand.supabase.co/functions/v1/run-scheduled-notifications'::text),
  'URL of the run-scheduled-notifications edge function'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Schedule cron job (every 15 minutes). Idempotent: unschedule first if exists.
DO $$
BEGIN
  PERFORM cron.unschedule('run-scheduled-notifications-every-15min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-scheduled-notifications-every-15min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'run-scheduled-notifications-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := trim(both '"' from (SELECT value::text FROM public.app_config WHERE key = 'edge_scheduled_url')),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(both '"' from (SELECT value::text FROM public.app_config WHERE key = 'edge_anon_key'))
    ),
    body := jsonb_build_object('source', 'pg_cron', 'time', now())
  );
  $$
);