-- ── Godmode: is_admin flag + admin bypass RLS ────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Pomocná funkce — bezpečně vrátí admin status (SECURITY DEFINER obchází RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Admin vidí a edituje všechny profily
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin vidí a edituje všechny activity_records
CREATE POLICY "Admin can view all activity records"
  ON public.activity_records FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admin can update all activity records"
  ON public.activity_records FOR UPDATE
  USING (public.is_admin());

-- Admin vidí a edituje všechny promotion_requests
CREATE POLICY "Admin can view all promotion requests"
  ON public.promotion_requests FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admin can update all promotion requests"
  ON public.promotion_requests FOR UPDATE
  USING (public.is_admin());

-- ── Aktivace admina (spusť RUČNĚ v Supabase SQL Editoru) ──────
-- UPDATE public.profiles
-- SET is_admin = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'iam@matejkozak.cz');
