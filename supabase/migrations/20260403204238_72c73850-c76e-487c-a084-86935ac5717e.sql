
CREATE OR REPLACE FUNCTION public.sync_activity_from_meetings(p_user_id uuid, p_week_start date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fsa_actual  integer;
  v_ser_actual  integer;
  v_bj          numeric;
  v_bj_fsa      numeric;
  v_bj_ser      numeric;
  v_ref_actual  integer;
BEGIN
  SELECT
    COUNT(*)           FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled),
    COUNT(*)           FILTER (WHERE meeting_type = 'SER' AND NOT cancelled),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE NOT cancelled AND poradko_status = 'probehle'), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled AND poradko_status = 'probehle'), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled AND poradko_status = 'probehle'), 0),
    COALESCE(SUM(ref_count + poradko_doporuceni + pohovor_doporuceni + poradko_pohovor_doporuceni) FILTER (WHERE NOT cancelled), 0)
  INTO
    v_fsa_actual, v_ser_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  FROM public.client_meetings
  WHERE user_id   = p_user_id
    AND week_start = p_week_start;

  INSERT INTO public.activity_records (
    user_id, week_start,
    fsa_actual, ser_actual,
    bj, bj_fsa_actual, bj_ser_actual,
    ref_actual
  )
  VALUES (
    p_user_id, p_week_start,
    v_fsa_actual, v_ser_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  )
  ON CONFLICT ON CONSTRAINT activity_records_user_week_unique
  DO UPDATE SET
    fsa_actual    = EXCLUDED.fsa_actual,
    ser_actual    = EXCLUDED.ser_actual,
    bj            = EXCLUDED.bj,
    bj_fsa_actual = EXCLUDED.bj_fsa_actual,
    bj_ser_actual = EXCLUDED.bj_ser_actual,
    ref_actual    = EXCLUDED.ref_actual,
    updated_at    = now();
END;
$function$;
