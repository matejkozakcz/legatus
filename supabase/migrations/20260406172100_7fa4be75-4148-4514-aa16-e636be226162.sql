ALTER TABLE public.notification_rules
  ADD COLUMN IF NOT EXISTS schedule_type text NOT NULL DEFAULT 'event',
  ADD COLUMN IF NOT EXISTS schedule_time time WITHOUT TIME ZONE DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS schedule_day_of_week integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_day_of_month integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_scheduled_at timestamp with time zone DEFAULT NULL;