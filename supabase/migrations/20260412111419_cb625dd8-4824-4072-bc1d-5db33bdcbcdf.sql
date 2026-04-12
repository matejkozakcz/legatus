
ALTER TABLE public.notification_rules ADD COLUMN redirect_url text DEFAULT NULL;
ALTER TABLE public.notifications ADD COLUMN redirect_url text DEFAULT NULL;
