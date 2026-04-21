-- Admin může vkládat notifikace libovolnému uživateli (pro testování
-- notifikací z Admin dashboardu cílenému uživateli, ne jen sobě).
-- Stávající policy NOTIFICATION_INSERT_SCOPE dovoluje vložit jen do
-- vlastní hierarchie, což blokuje test mimo vlastní tým.

CREATE POLICY "Admin can insert any notification"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Admin taky potřebuje SELECT, aby po insertu viděl řádek zpět (supabase
-- .select("id").single() ho vyžaduje).
CREATE POLICY "Admin can view all notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (public.is_admin());
