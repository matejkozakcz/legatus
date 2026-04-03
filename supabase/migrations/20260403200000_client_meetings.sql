-- ================================================================
-- Migration: client_meetings
-- Tabulka per-klient FSA/SER záznamů s automatickou agregací
-- do activity_records přes trigger.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Tabulka
-- ----------------------------------------------------------------
CREATE TABLE public.client_meetings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  -- week_start se počítá automaticky z date (pondělí daného týdne)
  week_start      date        GENERATED ALWAYS AS (date_trunc('week', date)::date) STORED,
  meeting_type    text        NOT NULL CHECK (meeting_type IN ('FSA', 'SER')),
  bj              numeric     NOT NULL DEFAULT 0 CHECK (bj >= 0),
  ref_count       integer     NOT NULL DEFAULT 0 CHECK (ref_count >= 0),
  vizi_spoluprace boolean     NOT NULL DEFAULT false,
  poznamka        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index pro rychlou agregaci po user+týden
CREATE INDEX idx_client_meetings_user_week
  ON public.client_meetings (user_id, week_start);

-- Index pro admin/vedoucí pohled přes datum
CREATE INDEX idx_client_meetings_date
  ON public.client_meetings (date DESC);

-- ----------------------------------------------------------------
-- 2. Unique constraint na activity_records (user_id, week_start)
--    — potřebný pro ON CONFLICT v sync funkci.
--    Přidáme pouze pokud ještě neexistuje.
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_records_user_week_unique'
      AND conrelid = 'public.activity_records'::regclass
  ) THEN
    ALTER TABLE public.activity_records
      ADD CONSTRAINT activity_records_user_week_unique
      UNIQUE (user_id, week_start);
  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------
ALTER TABLE public.client_meetings ENABLE ROW LEVEL SECURITY;

-- Uživatel spravuje vlastní záznamy
CREATE POLICY "Users manage own meetings"
  ON public.client_meetings
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Vedoucí vidí záznamy svého týmu (read-only)
CREATE POLICY "Vedouci view team meetings"
  ON public.client_meetings
  FOR SELECT
  USING (public.is_in_vedouci_subtree(user_id, auth.uid()));

-- Admin vidí vše
CREATE POLICY "Admin view all meetings"
  ON public.client_meetings
  FOR SELECT
  USING (public.is_admin());

-- ----------------------------------------------------------------
-- 4. Sync funkce: přepočítá agregáty v activity_records
--    pro daného uživatele a týden z client_meetings.
--    Dotýká se POUZE polí odvozených z client_meetings,
--    ostatní pole (poh, por, kl_fsa, dop_kl, planned) zachová.
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
  v_bj          numeric;
  v_bj_fsa      numeric;
  v_bj_ser      numeric;
  v_ref_actual  integer;
BEGIN
  -- Agregace z client_meetings pro daný user + týden
  SELECT
    COUNT(*)           FILTER (WHERE meeting_type = 'FSA'),
    COUNT(*)           FILTER (WHERE meeting_type = 'SER'),
    COALESCE(SUM(bj),                               0),
    COALESCE(SUM(bj)   FILTER (WHERE meeting_type = 'FSA'), 0),
    COALESCE(SUM(bj)   FILTER (WHERE meeting_type = 'SER'), 0),
    COALESCE(SUM(ref_count),                        0)
  INTO
    v_fsa_actual, v_ser_actual,
    v_bj, v_bj_fsa, v_bj_ser,
    v_ref_actual
  FROM public.client_meetings
  WHERE user_id   = p_user_id
    AND week_start = p_week_start;

  -- Upsert do activity_records:
  -- INSERT při prvním záznamu toho týdne,
  -- UPDATE pouze polí odvozených z CRM (ostatní zachová).
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
$$;

-- ----------------------------------------------------------------
-- 5. Trigger funkce — volá sync po každé změně v client_meetings
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_sync_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Po smazání přepočítej starý týden
    PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.week_start);
  ELSE
    -- Po INSERT nebo UPDATE přepočítej nový týden
    PERFORM public.sync_activity_from_meetings(NEW.user_id, NEW.week_start);
    -- Pokud se schůzka přesunula do jiného týdne, přepočítej i starý
    IF TG_OP = 'UPDATE' AND OLD.week_start <> NEW.week_start THEN
      PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.week_start);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------
-- 6. Trigger na tabulce
-- ----------------------------------------------------------------
CREATE TRIGGER trg_sync_activity
  AFTER INSERT OR UPDATE OR DELETE
  ON public.client_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_activity();

-- ----------------------------------------------------------------
-- 7. updated_at trigger pro client_meetings
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_client_meetings_updated_at
  BEFORE UPDATE ON public.client_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
