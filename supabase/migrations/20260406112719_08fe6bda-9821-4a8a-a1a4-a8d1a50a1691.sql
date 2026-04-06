
-- Fix 1: client_meetings RLS policy - swapped arguments
DROP POLICY IF EXISTS "Vedouci view team meetings" ON public.client_meetings;
CREATE POLICY "Vedouci view team meetings"
  ON public.client_meetings
  FOR SELECT
  TO public
  USING (is_in_vedouci_subtree(auth.uid(), user_id));

-- Fix 2: Also allow garant to view their novacci meetings
CREATE POLICY "Garant can view novacci meetings"
  ON public.client_meetings
  FOR SELECT
  TO public
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = client_meetings.user_id
      AND profiles.garant_id = auth.uid()
      AND profiles.is_active = true
  ));

-- Fix 3: sync_activity_from_meetings - remove poradenstvi_status filter for BJ, add POR counting
CREATE OR REPLACE FUNCTION public.sync_activity_from_meetings(p_user_id uuid, p_week_start date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fsa_actual  integer;
  v_ser_actual  integer;
  v_poh_actual  integer;
  v_por_actual  integer;
  v_bj          numeric;
  v_bj_fsa      numeric;
  v_bj_ser      numeric;
  v_ref_actual  integer;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POH' AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POR' AND NOT cancelled),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled), 0),
    COALESCE(SUM(doporuceni_fsa + doporuceni_poradenstvi + doporuceni_pohovor) FILTER (WHERE NOT cancelled), 0)
  INTO
    v_fsa_actual, v_ser_actual, v_poh_actual, v_por_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  FROM public.client_meetings
  WHERE user_id    = p_user_id
    AND week_start = p_week_start;

  INSERT INTO public.activity_records (
    user_id, week_start,
    fsa_actual, ser_actual, poh_actual, por_actual,
    bj, bj_fsa_actual, bj_ser_actual,
    ref_actual
  )
  VALUES (
    p_user_id, p_week_start,
    v_fsa_actual, v_ser_actual, v_poh_actual, v_por_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  )
  ON CONFLICT ON CONSTRAINT activity_records_user_week_unique
  DO UPDATE SET
    fsa_actual    = EXCLUDED.fsa_actual,
    ser_actual    = EXCLUDED.ser_actual,
    poh_actual    = EXCLUDED.poh_actual,
    por_actual    = EXCLUDED.por_actual,
    bj            = EXCLUDED.bj,
    bj_fsa_actual = EXCLUDED.bj_fsa_actual,
    bj_ser_actual = EXCLUDED.bj_ser_actual,
    ref_actual    = EXCLUDED.ref_actual,
    updated_at    = now();
END;
$function$;

-- Re-sync Rejpal's activity records to fix existing data
SELECT public.sync_activity_from_meetings('5f6ba888-29e2-4ec2-a79d-3a7e1833bc5f'::uuid, '2026-04-06'::date);
SELECT public.sync_activity_from_meetings('5f6ba888-29e2-4ec2-a79d-3a7e1833bc5f'::uuid, '2026-03-30'::date);
