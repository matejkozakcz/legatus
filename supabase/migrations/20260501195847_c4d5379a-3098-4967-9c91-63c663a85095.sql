CREATE TABLE IF NOT EXISTS public.invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'ziskatel',
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Named FKs to match PostgREST embed names used in the app
ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_org_unit_id_fkey;
ALTER TABLE public.invites
  ADD CONSTRAINT invites_org_unit_id_fkey
  FOREIGN KEY (org_unit_id) REFERENCES public.org_units(id) ON DELETE CASCADE;

ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_invited_by_fkey;
ALTER TABLE public.invites
  ADD CONSTRAINT invites_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invites_token_key ON public.invites(token);
CREATE INDEX IF NOT EXISTS invites_org_unit_id_idx ON public.invites(org_unit_id);
CREATE INDEX IF NOT EXISTS invites_email_idx ON public.invites(lower(email));

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage invites" ON public.invites;
CREATE POLICY "Admin can manage invites"
  ON public.invites
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can read invite by token" ON public.invites;
CREATE POLICY "Public can read invite by token"
  ON public.invites
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Owner can view workspace invites" ON public.invites;
CREATE POLICY "Owner can view workspace invites"
  ON public.invites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_units ou
      WHERE ou.id = invites.org_unit_id
        AND ou.owner_id = auth.uid()
    )
  );