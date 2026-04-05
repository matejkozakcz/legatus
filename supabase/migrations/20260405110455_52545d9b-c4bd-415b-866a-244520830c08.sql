
-- 1. Create cases table
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nazev_pripadu TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aktivni',
  poznamka TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cases" ON public.cases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cases" ON public.cases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cases" ON public.cases
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cases" ON public.cases
  FOR DELETE USING (auth.uid() = user_id);

-- Admin policies for cases
CREATE POLICY "Admin can view all cases" ON public.cases
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admin can update all cases" ON public.cases
  FOR UPDATE USING (public.is_admin());

-- Vedouci can view team cases
CREATE POLICY "Vedouci can view team cases" ON public.cases
  FOR SELECT USING (public.is_in_vedouci_subtree(auth.uid(), user_id));

-- 2. Add columns to client_meetings
ALTER TABLE public.client_meetings
  ADD COLUMN case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN meeting_time TIME,
  ADD COLUMN duration_minutes INTEGER,
  ADD COLUMN location_type TEXT,
  ADD COLUMN location_detail TEXT;
