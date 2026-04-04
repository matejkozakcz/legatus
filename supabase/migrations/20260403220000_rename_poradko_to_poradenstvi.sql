-- ================================================================
-- Migration: přejmenování poradko → poradenstvi
-- + sloučení has_poradko_pohovor do kombinace flagů
-- + sjednocení doporučení do jasných sloupců per fáze
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Přejmenování sloupců
-- ----------------------------------------------------------------
ALTER TABLE public.client_meetings RENAME COLUMN has_poradko          TO has_poradenstvi;
ALTER TABLE public.client_meetings RENAME COLUMN poradko_doporuceni   TO doporuceni_poradenstvi;
ALTER TABLE public.client_meetings RENAME COLUMN poradko_date         TO poradenstvi_date;
ALTER TABLE public.client_meetings RENAME COLUMN poradko_status       TO poradenstvi_status;
ALTER TABLE public.client_meetings RENAME COLUMN ref_count            TO doporuceni_fsa;
ALTER TABLE public.client_meetings RENAME COLUMN pohovor_doporuceni   TO doporuceni_pohovor;

-- ----------------------------------------------------------------
-- 2. Migrace dat z has_poradko_pohovor → kombinace dvou flagů
--    poradko_pohovor_doporuceni → doporuceni_poradenstvi (přičteme)
-- ----------------------------------------------------------------
UPDATE public.client_meetings
SET
  has_poradenstvi          = true,
  has_pohovor              = true,
  doporuceni_poradenstvi   = doporuceni_poradenstvi + poradko_pohovor_doporuceni
WHERE has_poradko_pohovor = true;

-- ----------------------------------------------------------------
-- 3. Odstranění redundantních poradko_pohovor sloupců
-- ----------------------------------------------------------------
ALTER TABLE public.client_meetings DROP COLUMN IF EXISTS has_poradko_pohovor;
ALTER TABLE public.client_meetings DROP COLUMN IF EXISTS poradko_pohovor_doporuceni;
ALTER TABLE public.client_meetings DROP COLUMN IF EXISTS poradko_pohovor_jde_dal;

-- ----------------------------------------------------------------
-- 4. Aktualizace sync funkce s novými názvy
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_activity_from_meetings(
  p_user_id    uuid,
  p_week_start date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fsa_actual  integer;
  v_ser_actual  integer;
  v_poh_actual  integer;
  v_bj          numeric;
  v_bj_fsa      numeric;
  v_bj_ser      numeric;
  v_ref_actual  integer;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POH' AND NOT cancelled),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE NOT cancelled AND poradenstvi_status = 'probehle'), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled AND poradenstvi_status = 'probehle'), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled AND poradenstvi_status = 'probehle'), 0),
    COALESCE(SUM(doporuceni_fsa + doporuceni_poradenstvi + doporuceni_pohovor) FILTER (WHERE NOT cancelled), 0)
  INTO
    v_fsa_actual, v_ser_actual, v_poh_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  FROM public.client_meetings
  WHERE user_id    = p_user_id
    AND week_start = p_week_start;

  INSERT INTO public.activity_records (
    user_id, week_start,
    fsa_actual, ser_actual, poh_actual,
    bj, bj_fsa_actual, bj_ser_actual,
    ref_actual
  )
  VALUES (
    p_user_id, p_week_start,
    v_fsa_actual, v_ser_actual, v_poh_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  )
  ON CONFLICT ON CONSTRAINT activity_records_user_week_unique
  DO UPDATE SET
    fsa_actual    = EXCLUDED.fsa_actual,
    ser_actual    = EXCLUDED.ser_actual,
    poh_actual    = EXCLUDED.poh_actual,
    bj            = EXCLUDED.bj,
    bj_fsa_actual = EXCLUDED.bj_fsa_actual,
    bj_ser_actual = EXCLUDED.bj_ser_actual,
    ref_actual    = EXCLUDED.ref_actual,
    updated_at    = now();
END;
$$;
