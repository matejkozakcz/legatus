-- 1) Nový default v handle_new_user: 'ziskatel' místo 'novacek'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_active, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'ziskatel'),
    true,
    false
  );
  RETURN NEW;
END;
$function$;

-- 2) Změna defaultu na sloupci profiles.role
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'ziskatel';

-- 3) Deaktivace všech existujících Nováčků
UPDATE public.profiles
SET is_active = false
WHERE role = 'novacek' AND is_active = true;