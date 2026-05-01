-- Trigger function: when a profile gets/changes its org_unit_id, mark matching invites as used
CREATE OR REPLACE FUNCTION public.mark_matching_invites_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.org_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only react when org_unit_id was just set or changed
  IF TG_OP = 'UPDATE'
     AND OLD.org_unit_id IS NOT DISTINCT FROM NEW.org_unit_id THEN
    RETURN NEW;
  END IF;

  -- Look up the user's email from auth.users (profiles has no email column)
  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = NEW.id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.invites
     SET used_at = now()
   WHERE used_at IS NULL
     AND org_unit_id = NEW.org_unit_id
     AND lower(email) = v_email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_matching_invites_used ON public.profiles;

CREATE TRIGGER trg_mark_matching_invites_used
AFTER INSERT OR UPDATE OF org_unit_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.mark_matching_invites_used();

-- One-off backfill: mark already-joined users' pending invites as used
UPDATE public.invites i
   SET used_at = now()
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
 WHERE i.used_at IS NULL
   AND p.org_unit_id IS NOT NULL
   AND i.org_unit_id = p.org_unit_id
   AND lower(i.email) = lower(u.email);