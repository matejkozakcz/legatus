
-- Call Party feature: sessions and entries
CREATE TABLE public.call_party_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  date date NOT NULL DEFAULT CURRENT_DATE,
  goal_called integer NOT NULL DEFAULT 0,
  goal_meetings integer NOT NULL DEFAULT 0,
  goal_fsa integer NOT NULL DEFAULT 0,
  goal_ser integer NOT NULL DEFAULT 0,
  goal_poh integer NOT NULL DEFAULT 0,
  goal_nab integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cps_user_date ON public.call_party_sessions (user_id, date DESC);

ALTER TABLE public.call_party_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own call party sessions"
  ON public.call_party_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Vedouci view subtree call party sessions"
  ON public.call_party_sessions FOR SELECT
  USING (public.is_in_vedouci_subtree(auth.uid(), user_id));

CREATE POLICY "Garant view novacci call party sessions"
  ON public.call_party_sessions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = call_party_sessions.user_id
      AND profiles.garant_id = auth.uid()
      AND profiles.is_active = true
  ));

CREATE POLICY "Admin manage call party sessions"
  ON public.call_party_sessions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_cps_updated_at
  BEFORE UPDATE ON public.call_party_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Entries
CREATE TABLE public.call_party_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.call_party_sessions(id) ON DELETE CASCADE,
  client_name text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'nezvedl',
  meeting_type text,
  created_meeting_id uuid,
  created_case_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cpe_outcome_chk CHECK (outcome IN ('nezvedl','nedomluveno','domluveno')),
  CONSTRAINT cpe_mt_chk CHECK (meeting_type IS NULL OR meeting_type IN ('FSA','SER','POH','NAB'))
);

CREATE INDEX idx_cpe_session ON public.call_party_entries (session_id, sort_order);

ALTER TABLE public.call_party_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own call party entries"
  ON public.call_party_entries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.call_party_sessions s
    WHERE s.id = call_party_entries.session_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.call_party_sessions s
    WHERE s.id = call_party_entries.session_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Vedouci view subtree call party entries"
  ON public.call_party_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.call_party_sessions s
    WHERE s.id = call_party_entries.session_id
      AND public.is_in_vedouci_subtree(auth.uid(), s.user_id)
  ));

CREATE POLICY "Garant view novacci call party entries"
  ON public.call_party_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.call_party_sessions s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = call_party_entries.session_id
      AND p.garant_id = auth.uid()
      AND p.is_active = true
  ));

CREATE POLICY "Admin manage call party entries"
  ON public.call_party_entries FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
