CREATE TABLE public.invite_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_attempts_inviter_created
  ON public.invite_attempts(inviter_id, created_at DESC);

ALTER TABLE public.invite_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (edge function) can read/write.