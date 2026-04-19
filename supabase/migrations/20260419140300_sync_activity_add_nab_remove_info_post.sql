-- P1-7: Integrovat NAB do sync_activity_from_meetings.
--        INFO a POST se nemají počítat do activity.
--
-- Kontext: Migrace 20260416202119 přidala info_actual/postinfo_actual a začala je
-- počítat v sync funkci. Podle aktuálního rozhodnutí se INFO a POST do activity
-- nezapočítávají (slouží jen jako typy schůzek v klientské stopě).
-- NAB (nábor) naopak chybělo úplně – přidáváme nab_actual a začínáme počítat.
--
-- Sloupce info_planned/info_actual/postinfo_planned/postinfo_actual necháváme
-- v tabulce (data migrace nemažeme – někdo mohl mít nastavené plány), ale
-- sync funkce je už nebude přepisovat. Nové záznamy dostanou 0 díky DEFAULT 0.

ALTER TABLE public.activity_records
  ADD COLUMN IF NOT EXISTS nab_planned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nab_actual  integer NOT NULL DEFAULT 0;

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
  v_nab_actual  integer;
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
    COUNT(*) FILTER (WHERE meeting_type = 'NAB' AND NOT cancelled),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled), 0),
    COALESCE(SUM(doporuceni_fsa + doporuceni_poradenstvi + doporuceni_pohovor) FILTER (WHERE NOT cancelled), 0)
  INTO
    v_fsa_actual, v_ser_actual, v_poh_actual, v_por_actual,
    v_nab_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  FROM public.client_meetings
  WHERE user_id    = p_user_id
    AND week_start = p_week_start;

  INSERT INTO public.activity_records (
    user_id, week_start,
    fsa_actual, ser_actual, poh_actual, por_actual,
    nab_actual,
    bj, bj_fsa_actual, bj_ser_actual,
    ref_actual
  )
  VALUES (
    p_user_id, p_week_start,
    v_fsa_actual, v_ser_actual, v_poh_actual, v_por_actual,
    v_nab_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  )
  ON CONFLICT ON CONSTRAINT activity_records_user_week_unique
  DO UPDATE SET
    fsa_actual    = EXCLUDED.fsa_actual,
    ser_actual    = EXCLUDED.ser_actual,
    poh_actual    = EXCLUDED.poh_actual,
    por_actual    = EXCLUDED.por_actual,
    nab_actual    = EXCLUDED.nab_actual,
    bj            = EXCLUDED.bj,
    bj_fsa_actual = EXCLUDED.bj_fsa_actual,
    bj_ser_actual = EXCLUDED.bj_ser_actual,
    ref_actual    = EXCLUDED.ref_actual,
    updated_at    = now();
END;
$function$;

-- Vyčistit historická data: INFO/POST actual se už nepočítá
UPDATE public.activity_records
SET info_actual = 0,
    postinfo_actual = 0
WHERE info_actual <> 0 OR postinfo_actual <> 0;
