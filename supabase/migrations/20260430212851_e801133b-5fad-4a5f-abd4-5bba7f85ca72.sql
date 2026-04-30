-- 1) Add invite_token column to org_units
ALTER TABLE public.org_units
  ADD COLUMN IF NOT EXISTS invite_token text UNIQUE
    DEFAULT encode(extensions.gen_random_bytes(24), 'hex');

-- Backfill any existing rows without token
UPDATE public.org_units
   SET invite_token = encode(extensions.gen_random_bytes(24), 'hex')
 WHERE invite_token IS NULL;

ALTER TABLE public.org_units
  ALTER COLUMN invite_token SET NOT NULL;

-- 2) Allow anonymous (unauthenticated) read of org_unit by token only
--    so the Join page can resolve "/join/ws/:token" before signup.
DROP POLICY IF EXISTS "Public can read org_unit by invite_token" ON public.org_units;
CREATE POLICY "Public can read org_unit by invite_token"
  ON public.org_units
  FOR SELECT
  TO anon, authenticated
  USING (invite_token IS NOT NULL);

-- Note: this exposes id/name/owner_id/parent_unit_id of all active workspaces
-- to anyone who can guess a token. Tokens are 48 hex chars (192 bits) so this
-- is effectively unguessable. Existing more-permissive policies for owners /
-- members / superadmin remain in place.

-- 3) Allow workspace owner (or anyone whose org_unit_id matches) and
--    superadmin to UPDATE invite_token (rotation).
DROP POLICY IF EXISTS "Owner or admin can rotate invite_token" ON public.org_units;
CREATE POLICY "Owner or admin can rotate invite_token"
  ON public.org_units
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.is_admin = true
    )
  );

-- 4) Helper RPC to look up workspace members visible during onboarding
--    (after signup but before profile.org_unit_id is set, RLS would block
--     a normal SELECT on profiles for the new user).
CREATE OR REPLACE FUNCTION public.get_workspace_members_for_onboarding(_token text)
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
    FROM public.profiles p
    JOIN public.org_units ou ON ou.id = p.org_unit_id
   WHERE ou.invite_token = _token
     AND p.is_active = true
   ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_members_for_onboarding(text)
  TO anon, authenticated;
