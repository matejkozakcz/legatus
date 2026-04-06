
-- Create app_config table for dynamic business logic configuration
CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admin can view app_config" ON public.app_config
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Only admins can insert
CREATE POLICY "Admin can insert app_config" ON public.app_config
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Only admins can update
CREATE POLICY "Admin can update app_config" ON public.app_config
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed default promotion rules
INSERT INTO public.app_config (key, value, description) VALUES
  ('promotion_rules', '{"ziskatel_to_garant": {"min_bj": 1000, "min_structure": 2}, "garant_to_bv": {"min_structure": 5, "min_direct": 3}, "bv_to_vedouci": {"min_structure": 10, "min_direct": 6}}', 'Pravidla povýšení – prahy BJ a počty lidí'),
  ('period_end_day', '{"default": 27, "december_rule": "first_working_day_january"}', 'Den konce produkčního období');
