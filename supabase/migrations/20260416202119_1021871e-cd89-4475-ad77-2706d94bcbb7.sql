ALTER TABLE public.activity_records
  ADD COLUMN IF NOT EXISTS info_planned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS info_actual integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS postinfo_planned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS postinfo_actual integer NOT NULL DEFAULT 0;

-- Update sync function to also compute info_actual & postinfo_actual
CREATE OR REPLACE FUNCTION public.sync_activity_from_meetings(p_user_id uuid, p_week_start date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fsa_actual       integer;
  v_ser_actual       integer;
  v_poh_actual       integer;
  v_por_actual       integer;
  v_info_actual      integer;
  v_postinfo_actual  integer;
  v_bj               numeric;
  v_bj_fsa           numeric;
  v_bj_ser           numeric;
  v_ref_actual       integer;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE meeting_type = 'FSA'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'SER'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POH'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POR'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'INFO' AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POST' AND NOT cancelled),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled), 0),
    COALESCE(SUM(doporuceni_fsa + doporuceni_poradenstvi + doporuceni_pohovor) FILTER (WHERE NOT cancelled), 0)
  INTO
    v_fsa_actual, v_ser_actual, v_poh_actual, v_por_actual,
    v_info_actual, v_postinfo_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  FROM public.client_meetings
  WHERE user_id    = p_user_id
    AND week_start = p_week_start;

  INSERT INTO public.activity_records (
    user_id, week_start,
    fsa_actual, ser_actual, poh_actual, por_actual,
    info_actual, postinfo_actual,
    bj, bj_fsa_actual, bj_ser_actual,
    ref_actual
  )
  VALUES (
    p_user_id, p_week_start,
    v_fsa_actual, v_ser_actual, v_poh_actual, v_por_actual,
    v_info_actual, v_postinfo_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  )
  ON CONFLICT ON CONSTRAINT activity_records_user_week_unique
  DO UPDATE SET
    fsa_actual       = EXCLUDED.fsa_actual,
    ser_actual       = EXCLUDED.ser_actual,
    poh_actual       = EXCLUDED.poh_actual,
    por_actual       = EXCLUDED.por_actual,
    info_actual      = EXCLUDED.info_actual,
    postinfo_actual  = EXCLUDED.postinfo_actual,
    bj               = EXCLUDED.bj,
    bj_fsa_actual    = EXCLUDED.bj_fsa_actual,
    bj_ser_actual    = EXCLUDED.bj_ser_actual,
    ref_actual       = EXCLUDED.ref_actual,
    updated_at       = now();
END;
$function$;