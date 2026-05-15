
-- ============ group_call_parties ============
CREATE TABLE public.group_call_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  host_id uuid NOT NULL,
  org_unit_id uuid,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  planned_duration_min integer,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  join_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  goals jsonb NOT NULL DEFAULT '{}'::jsonb,
  allow_external boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcp_host ON public.group_call_parties(host_id);
CREATE INDEX idx_gcp_status ON public.group_call_parties(status);
CREATE INDEX idx_gcp_token ON public.group_call_parties(join_token);

ALTER TABLE public.group_call_parties ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gcp_updated_at
BEFORE UPDATE ON public.group_call_parties
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ group_call_party_participants ============
CREATE TABLE public.group_call_party_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.group_call_parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  invited_via text NOT NULL DEFAULT 'manual'
    CHECK (invited_via IN ('host','preset_direct','preset_subtree','preset_garant','preset_workspace','manual','link')),
  role text NOT NULL DEFAULT 'caller' CHECK (role IN ('host','caller')),
  UNIQUE(party_id, user_id)
);

CREATE INDEX idx_gcpp_party ON public.group_call_party_participants(party_id);
CREATE INDEX idx_gcpp_user ON public.group_call_party_participants(user_id);

ALTER TABLE public.group_call_party_participants ENABLE ROW LEVEL SECURITY;

-- ============ Security definer helper to avoid recursion ============
CREATE OR REPLACE FUNCTION public.is_group_party_participant(_party_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_call_party_participants
    WHERE party_id = _party_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_group_party_host(_party_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_call_parties
    WHERE id = _party_id AND host_id = _user_id
  )
$$;

-- ============ RLS policies: group_call_parties ============
CREATE POLICY "Host can manage own party"
ON public.group_call_parties
FOR ALL TO authenticated
USING (host_id = auth.uid())
WITH CHECK (host_id = auth.uid());

CREATE POLICY "Admin manages all parties"
ON public.group_call_parties
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Participants view their party"
ON public.group_call_parties
FOR SELECT TO authenticated
USING (public.is_group_party_participant(id, auth.uid()));

CREATE POLICY "Vedouci view subtree parties"
ON public.group_call_parties
FOR SELECT TO authenticated
USING (is_in_vedouci_subtree(auth.uid(), host_id));

-- Public read for join landing (token-based discovery)
CREATE POLICY "Public read by token"
ON public.group_call_parties
FOR SELECT TO anon, authenticated
USING (join_token IS NOT NULL);

-- ============ RLS policies: participants ============
CREATE POLICY "Admin manages all participants"
ON public.group_call_party_participants
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Host manages participants"
ON public.group_call_party_participants
FOR ALL TO authenticated
USING (public.is_group_party_host(party_id, auth.uid()))
WITH CHECK (public.is_group_party_host(party_id, auth.uid()));

CREATE POLICY "User manages own participation"
ON public.group_call_party_participants
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Participants view co-participants"
ON public.group_call_party_participants
FOR SELECT TO authenticated
USING (public.is_group_party_participant(party_id, auth.uid()));

CREATE POLICY "Vedouci view subtree party participants"
ON public.group_call_party_participants
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_call_parties gcp
    WHERE gcp.id = party_id AND is_in_vedouci_subtree(auth.uid(), gcp.host_id)
  )
);

-- ============ Link existing call_party_sessions to group ============
ALTER TABLE public.call_party_sessions
  ADD COLUMN group_party_id uuid REFERENCES public.group_call_parties(id) ON DELETE SET NULL;

CREATE INDEX idx_cps_group_party ON public.call_party_sessions(group_party_id);

-- ============ Realtime publication ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_call_parties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_call_party_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_party_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_party_sessions;

ALTER TABLE public.group_call_parties REPLICA IDENTITY FULL;
ALTER TABLE public.group_call_party_participants REPLICA IDENTITY FULL;
ALTER TABLE public.call_party_entries REPLICA IDENTITY FULL;
ALTER TABLE public.call_party_sessions REPLICA IDENTITY FULL;
