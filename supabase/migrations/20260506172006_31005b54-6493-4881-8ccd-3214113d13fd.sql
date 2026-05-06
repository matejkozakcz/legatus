ALTER TABLE public.call_party_sessions ADD COLUMN IF NOT EXISTS goals jsonb DEFAULT '[]'::jsonb;

UPDATE public.call_party_sessions
SET goals = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type', t.type, 'target', t.target)), '[]'::jsonb)
  FROM (
    SELECT 'called'::text AS type, goal_called AS target WHERE goal_called IS NOT NULL AND goal_called > 0
    UNION ALL SELECT 'meetings', goal_meetings WHERE goal_meetings IS NOT NULL AND goal_meetings > 0
    UNION ALL SELECT 'FSA', goal_fsa WHERE goal_fsa IS NOT NULL AND goal_fsa > 0
    UNION ALL SELECT 'SER', goal_ser WHERE goal_ser IS NOT NULL AND goal_ser > 0
    UNION ALL SELECT 'POH', goal_poh WHERE goal_poh IS NOT NULL AND goal_poh > 0
    UNION ALL SELECT 'NAB', goal_nab WHERE goal_nab IS NOT NULL AND goal_nab > 0
  ) t
)
WHERE goals IS NULL OR goals = '[]'::jsonb;

UPDATE public.call_party_sessions SET goals = '[]'::jsonb WHERE goals IS NULL;

ALTER TABLE public.call_party_sessions
  DROP COLUMN IF EXISTS goal_called,
  DROP COLUMN IF EXISTS goal_meetings,
  DROP COLUMN IF EXISTS goal_fsa,
  DROP COLUMN IF EXISTS goal_ser,
  DROP COLUMN IF EXISTS goal_poh,
  DROP COLUMN IF EXISTS goal_nab;