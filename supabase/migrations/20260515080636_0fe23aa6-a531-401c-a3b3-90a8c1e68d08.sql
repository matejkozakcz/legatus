-- 1) Schůzky: nové pole pro datum uznání BJ + počítaný týden
ALTER TABLE public.client_meetings
  ADD COLUMN IF NOT EXISTS bj_recognized_date date,
  ADD COLUMN IF NOT EXISTS bj_week_start date;

-- Trigger funkce: dopočítá bj_week_start z coalesce(bj_recognized_date, date)
CREATE OR REPLACE FUNCTION public.set_meeting_bj_week_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.bj_week_start := date_trunc('week', COALESCE(NEW.bj_recognized_date, NEW.date))::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_meeting_bj_week_start ON public.client_meetings;
CREATE TRIGGER trg_set_meeting_bj_week_start
  BEFORE INSERT OR UPDATE OF date, bj_recognized_date
  ON public.client_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_meeting_bj_week_start();

-- Backfill u existujících řádků
UPDATE public.client_meetings
   SET bj_week_start = date_trunc('week', COALESCE(bj_recognized_date, date))::date
 WHERE bj_week_start IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_meetings_bj_week
  ON public.client_meetings (user_id, bj_week_start);

-- 2) Tabulka uzávěrek produkce
CREATE TABLE IF NOT EXISTS public.production_closures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  period_year int  NOT NULL,
  period_month int NOT NULL,         -- 1..12
  closed_at   timestamptz NOT NULL DEFAULT now(),
  closed_by   uuid NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_closures_user_period_unique UNIQUE (user_id, period_year, period_month),
  CONSTRAINT production_closures_month_chk CHECK (period_month BETWEEN 1 AND 12)
);

ALTER TABLE public.production_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own closures"
  ON public.production_closures
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND closed_by = auth.uid());

CREATE POLICY "Vedouci view subtree closures"
  ON public.production_closures
  FOR SELECT
  TO authenticated
  USING (public.is_in_vedouci_subtree(auth.uid(), user_id));

CREATE POLICY "Garant view novacci closures"
  ON public.production_closures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = production_closures.user_id
         AND p.garant_id = auth.uid()
         AND p.is_active = true
    )
  );

CREATE POLICY "Admin manages closures"
  ON public.production_closures
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_production_closures_updated_at
  BEFORE UPDATE ON public.production_closures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Sync funkce: BJ alokujeme podle bj_week_start, počty podle week_start
CREATE OR REPLACE FUNCTION public.sync_activity_from_meetings(p_user_id uuid, p_week_start date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_manual_bj        numeric;
BEGIN
  -- Aktivity (počty) podle týdne konání
  SELECT
    COUNT(*) FILTER (WHERE meeting_type = 'FSA'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'SER'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POH'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POR'  AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'INFO' AND NOT cancelled),
    COUNT(*) FILTER (WHERE meeting_type = 'POST' AND NOT cancelled),
    COALESCE(SUM(doporuceni_fsa + doporuceni_poradenstvi + doporuceni_pohovor) FILTER (WHERE NOT cancelled), 0)
  INTO
    v_fsa_actual, v_ser_actual, v_poh_actual, v_por_actual,
    v_info_actual, v_postinfo_actual, v_ref_actual
  FROM public.client_meetings
  WHERE user_id    = p_user_id
    AND week_start = p_week_start;

  -- BJ podle týdne uznání (bj_week_start)
  SELECT
    COALESCE(SUM(podepsane_bj) FILTER (WHERE NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'FSA' AND NOT cancelled), 0),
    COALESCE(SUM(podepsane_bj) FILTER (WHERE meeting_type = 'SER' AND NOT cancelled), 0)
  INTO v_bj, v_bj_fsa, v_bj_ser
  FROM public.client_meetings
  WHERE user_id       = p_user_id
    AND bj_week_start = p_week_start;

  -- Manuální úpravy (ručně přidané BJ)
  SELECT COALESCE(SUM(bj), 0) INTO v_manual_bj
  FROM public.manual_bj_adjustments
  WHERE user_id = p_user_id AND week_start = p_week_start;

  v_bj := v_bj + v_manual_bj;

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
$$;

-- 4) Trigger nad client_meetings: přepočet i pro starý/nový bj_week_start
CREATE OR REPLACE FUNCTION public.trg_fn_sync_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.week_start);
    IF OLD.bj_week_start IS NOT NULL AND OLD.bj_week_start <> OLD.week_start THEN
      PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.bj_week_start);
    END IF;
  ELSE
    PERFORM public.sync_activity_from_meetings(NEW.user_id, NEW.week_start);
    IF NEW.bj_week_start IS NOT NULL AND NEW.bj_week_start <> NEW.week_start THEN
      PERFORM public.sync_activity_from_meetings(NEW.user_id, NEW.bj_week_start);
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF OLD.week_start <> NEW.week_start THEN
        PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.week_start);
      END IF;
      IF OLD.bj_week_start IS DISTINCT FROM NEW.bj_week_start
         AND OLD.bj_week_start IS NOT NULL
         AND OLD.bj_week_start <> NEW.week_start THEN
        PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.bj_week_start);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- 5) Přepočet všech existujících activity_records (BJ alokace podle bj_week_start)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, week_start FROM public.client_meetings
    UNION
    SELECT DISTINCT user_id, bj_week_start FROM public.client_meetings WHERE bj_week_start IS NOT NULL
    UNION
    SELECT DISTINCT user_id, week_start FROM public.activity_records
  LOOP
    PERFORM public.sync_activity_from_meetings(r.user_id, r.week_start);
  END LOOP;
END $$;