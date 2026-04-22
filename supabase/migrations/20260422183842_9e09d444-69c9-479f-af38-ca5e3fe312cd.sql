-- Add app_config to realtime publication so all clients receive version changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
  END IF;
END $$;

-- Ensure app_version row exists
INSERT INTO public.app_config (key, value, description)
VALUES (
  'app_version',
  to_jsonb(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')),
  'Current app version. Update to force all clients to clear cache and reload.'
)
ON CONFLICT (key) DO NOTHING;