-- Allow all authenticated users to read only the app_version row
CREATE POLICY "Authenticated can view app_version"
ON public.app_config
FOR SELECT
TO authenticated
USING (key = 'app_version');