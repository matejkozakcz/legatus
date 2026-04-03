
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ziskatel_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Update handle_new_user to set onboarding_completed = false for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_active, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'novacek'),
    true,
    false
  );
  RETURN NEW;
END;
$$;

-- RLS: any authenticated user can view vedouci profiles (for onboarding picker)
CREATE POLICY "Authenticated can view vedouci profiles"
ON public.profiles FOR SELECT TO authenticated
USING (role = 'vedouci' AND is_active = true);

-- RLS: any authenticated user can view active members with a vedouci (for ziskatel picker)
CREATE POLICY "Authenticated can view members under vedouci"
ON public.profiles FOR SELECT TO authenticated
USING (is_active = true AND vedouci_id IS NOT NULL);
