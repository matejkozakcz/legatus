
-- Feature flag
ALTER TABLE public.org_units 
  ADD COLUMN IF NOT EXISTS show_recruitment_funnel boolean NOT NULL DEFAULT false;

-- Recruitment candidates
CREATE TABLE IF NOT EXISTS public.recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_unit_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  source text,
  current_stage text NOT NULL DEFAULT 'CALL',
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  stage_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  lost_reason text,
  registered_profile_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_candidates_stage_check CHECK (
    current_stage IN ('CALL','NAB','POH','INFO','POST','REG','SUPERVIZE','LOST')
  )
);

CREATE INDEX IF NOT EXISTS idx_rec_candidates_owner ON public.recruitment_candidates(owner_id);
CREATE INDEX IF NOT EXISTS idx_rec_candidates_org ON public.recruitment_candidates(org_unit_id);
CREATE INDEX IF NOT EXISTS idx_rec_candidates_stage ON public.recruitment_candidates(current_stage);

ALTER TABLE public.recruitment_candidates ENABLE ROW LEVEL SECURITY;

-- Owner can manage own candidates
CREATE POLICY "Owner can manage own candidates"
  ON public.recruitment_candidates
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Vedouci can view subtree candidates
CREATE POLICY "Vedouci can view subtree candidates"
  ON public.recruitment_candidates
  FOR SELECT TO authenticated
  USING (is_in_vedouci_subtree(auth.uid(), owner_id));

-- Vedouci can update subtree candidates (stage moves, etc.)
CREATE POLICY "Vedouci can update subtree candidates"
  ON public.recruitment_candidates
  FOR UPDATE TO authenticated
  USING (is_in_vedouci_subtree(auth.uid(), owner_id))
  WITH CHECK (is_in_vedouci_subtree(auth.uid(), owner_id));

-- Garant view
CREATE POLICY "Garant can view novacci candidates"
  ON public.recruitment_candidates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = recruitment_candidates.owner_id
      AND p.garant_id = auth.uid()
      AND p.is_active = true
  ));

-- Workspace members (same org) can view (for picker)
CREATE POLICY "Workspace members can view candidates"
  ON public.recruitment_candidates
  FOR SELECT TO authenticated
  USING (org_unit_id = my_org_unit_id());

-- Admin
CREATE POLICY "Admin manages candidates"
  ON public.recruitment_candidates
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE TRIGGER trg_rec_candidates_updated_at
  BEFORE UPDATE ON public.recruitment_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Info / Postinfo attendees (M:N)
CREATE TABLE IF NOT EXISTS public.info_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  attended boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_info_attendees_meeting ON public.info_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_info_attendees_candidate ON public.info_attendees(candidate_id);

ALTER TABLE public.info_attendees ENABLE ROW LEVEL SECURITY;

-- Meeting owner manages attendees on own meetings
CREATE POLICY "Meeting owner manages attendees"
  ON public.info_attendees
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_meetings m
    WHERE m.id = info_attendees.meeting_id AND m.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_meetings m
    WHERE m.id = info_attendees.meeting_id AND m.user_id = auth.uid()
  ));

-- Candidate owner can update attendance for their candidates
CREATE POLICY "Candidate owner updates attendance"
  ON public.info_attendees
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recruitment_candidates c
    WHERE c.id = info_attendees.candidate_id AND c.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recruitment_candidates c
    WHERE c.id = info_attendees.candidate_id AND c.owner_id = auth.uid()
  ));

-- Candidate owner can view attendance entries for their candidates
CREATE POLICY "Candidate owner views attendance"
  ON public.info_attendees
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recruitment_candidates c
    WHERE c.id = info_attendees.candidate_id AND c.owner_id = auth.uid()
  ));

-- Vedouci view via subtree on candidate owner
CREATE POLICY "Vedouci view subtree attendance"
  ON public.info_attendees
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recruitment_candidates c
    WHERE c.id = info_attendees.candidate_id
      AND is_in_vedouci_subtree(auth.uid(), c.owner_id)
  ));

-- Admin
CREATE POLICY "Admin manages attendees"
  ON public.info_attendees
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE TRIGGER trg_info_attendees_updated_at
  BEFORE UPDATE ON public.info_attendees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link client_meetings to candidate (POH/NAB)
ALTER TABLE public.client_meetings 
  ADD COLUMN IF NOT EXISTS recruitment_candidate_id uuid;

CREATE INDEX IF NOT EXISTS idx_client_meetings_candidate 
  ON public.client_meetings(recruitment_candidate_id);

-- Link call_party_entries to created candidate
ALTER TABLE public.call_party_entries 
  ADD COLUMN IF NOT EXISTS created_candidate_id uuid;
