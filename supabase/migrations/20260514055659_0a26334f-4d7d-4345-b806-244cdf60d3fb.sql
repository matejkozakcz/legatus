-- 1) Změna pořadí fází: CALL se ruší, SUPERVIZE je před REG.
-- Default fáze pro nově vytvořené kandidáty = POH (vznikají z Pohovoru).
ALTER TABLE public.recruitment_candidates
  ALTER COLUMN current_stage SET DEFAULT 'POH';

-- Existující CALL kandidáty převedeme na POH (zachovat data)
UPDATE public.recruitment_candidates
   SET current_stage = 'POH'
 WHERE current_stage = 'CALL';

-- 2) Trigger na auto-spárování kandidáta s nově vzniklým profilem
-- (rozšiřujeme handle_new_user — match podle emailu z auth.users
--  nebo podle plného jména z metadat).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name text;
  v_email     text;
  v_phone     text;
  v_org_unit  uuid;
  v_cand_id   uuid;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_email     := NEW.email;
  v_phone     := COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone);

  -- Najít kandidáta podle emailu, telefonu nebo jména (case-insensitive).
  SELECT id, org_unit_id INTO v_cand_id, v_org_unit
    FROM public.recruitment_candidates
   WHERE registered_profile_id IS NULL
     AND current_stage <> 'LOST'
     AND (
       (v_email IS NOT NULL AND lower(email) = lower(v_email))
       OR (v_phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g') AND length(regexp_replace(phone, '\D', '', 'g')) >= 9)
       OR (lower(full_name) = lower(v_full_name))
     )
   ORDER BY created_at DESC
   LIMIT 1;

  INSERT INTO public.profiles (id, full_name, role, onboarding_completed, org_unit_id)
  VALUES (
    NEW.id,
    v_full_name,
    'ziskatel',
    false,
    v_org_unit  -- pokud sparovan s kandidátem, předvyplníme workspace
  );

  -- Spárovat kandidáta a posunout do REG.
  IF v_cand_id IS NOT NULL THEN
    UPDATE public.recruitment_candidates
       SET registered_profile_id = NEW.id,
           current_stage         = 'REG',
           stage_changed_at      = now(),
           stage_history         = stage_history || jsonb_build_object(
             'stage', 'REG',
             'at', now(),
             'by', NEW.id,
             'auto_match', true
           )
     WHERE id = v_cand_id;
  END IF;

  RETURN NEW;
END;
$function$;