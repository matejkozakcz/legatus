-- Generator for short, human-friendly workspace invite codes.
-- 6 chars, uppercase alphanumeric without confusing chars (no 0/O/1/I).
CREATE OR REPLACE FUNCTION public.generate_workspace_invite_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars
  code text;
  i int;
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::int,
        1
      );
    END LOOP;
    -- Ensure uniqueness
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.org_units WHERE invite_token = code
    );
    attempts := attempts + 1;
    IF attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique workspace invite code after 50 attempts';
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- Replace default for new workspaces
ALTER TABLE public.org_units
  ALTER COLUMN invite_token SET DEFAULT public.generate_workspace_invite_code();

-- Re-issue codes for all existing workspaces (old hex tokens become invalid)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.org_units LOOP
    UPDATE public.org_units
       SET invite_token = public.generate_workspace_invite_code()
     WHERE id = r.id;
  END LOOP;
END $$;
