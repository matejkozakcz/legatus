-- Allow any authenticated user to see other active members of their own workspace.
-- This is necessary for the onboarding flow where a newly-registered user
-- (already attached to org_unit_id) needs to pick their leader/recruiter
-- from the workspace's member list before vedouci_id is set.
DROP POLICY IF EXISTS "Members can view workspace peers" ON public.profiles;
CREATE POLICY "Members can view workspace peers"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND org_unit_id IS NOT NULL
    AND org_unit_id = public.my_org_unit_id()
  );
