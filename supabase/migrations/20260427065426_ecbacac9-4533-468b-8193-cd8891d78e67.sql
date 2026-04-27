-- Allow all authenticated users to read the VAPID public key from app_config.
-- The VAPID public key is publishable (it's an "applicationServerKey" used by browsers
-- when subscribing to Web Push) — it is safe to expose to any logged-in user.
-- Without this, only admins could read it, so non-admin users got
-- "VAPID klíč není nakonfigurován" and could not enable push notifications.

DROP POLICY IF EXISTS "Authenticated can view app_version" ON public.app_config;

CREATE POLICY "Authenticated can view publishable config"
ON public.app_config
FOR SELECT
TO authenticated
USING (key IN ('app_version', 'vapid_public_key'));
