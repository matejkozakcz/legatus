-- Create profiles table first
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('vedouci','garant','novacek')) DEFAULT 'novacek',
  vedouci_id uuid REFERENCES public.profiles(id),
  garant_id uuid REFERENCES public.profiles(id),
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer functions (table exists now)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_in_vedouci_subtree(_vedouci_id uuid, _target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _target_id
      AND (vedouci_id = _vedouci_id OR id = _vedouci_id)
      AND is_active = true
  )
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Garant can view their novacci"
  ON public.profiles FOR SELECT
  USING (
    public.get_user_role(auth.uid()) = 'garant'
    AND garant_id = auth.uid()
  );

CREATE POLICY "Vedouci can view their subtree"
  ON public.profiles FOR SELECT
  USING (
    public.get_user_role(auth.uid()) = 'vedouci'
    AND public.is_in_vedouci_subtree(auth.uid(), id)
  );

-- Create activity_records table
CREATE TABLE public.activity_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  fsa_planned int DEFAULT 0,
  fsa_actual int DEFAULT 0,
  por_planned int DEFAULT 0,
  por_actual int DEFAULT 0,
  kl_fsa_actual int DEFAULT 0,
  ser_planned int DEFAULT 0,
  ser_actual int DEFAULT 0,
  poh_planned int DEFAULT 0,
  poh_actual int DEFAULT 0,
  ref_planned int DEFAULT 0,
  ref_actual int DEFAULT 0,
  dop_kl_actual int DEFAULT 0,
  bj_fsa_actual int DEFAULT 0,
  bj_ser_actual int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE public.activity_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity records"
  ON public.activity_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Garant can view novacci activity records"
  ON public.activity_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = user_id AND garant_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Vedouci can view subtree activity records"
  ON public.activity_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = user_id AND vedouci_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can insert own activity records"
  ON public.activity_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activity records"
  ON public.activity_records FOR UPDATE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_activity_records_updated_at
  BEFORE UPDATE ON public.activity_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'novacek')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();