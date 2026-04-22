-- 1) Manual BJ adjustments
CREATE TABLE public.manual_bj_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  week_start DATE NOT NULL,
  bj NUMERIC NOT NULL DEFAULT 0,
  poznamka TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_bj_user_week ON public.manual_bj_adjustments(user_id, week_start);
CREATE INDEX idx_manual_bj_date ON public.manual_bj_adjustments(date DESC);

ALTER TABLE public.manual_bj_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view manual bj adjustments"
  ON public.manual_bj_adjustments FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin can insert manual bj adjustments"
  ON public.manual_bj_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update manual bj adjustments"
  ON public.manual_bj_adjustments FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own manual bj adjustments"
  ON public.manual_bj_adjustments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Auto-set week_start
CREATE OR REPLACE FUNCTION public.set_manual_bj_week_start()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.week_start := date_trunc('week', NEW.date)::date;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manual_bj_week_start
  BEFORE INSERT OR UPDATE ON public.manual_bj_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_manual_bj_week_start();

-- 2) Audit log
CREATE TABLE public.bj_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('meeting', 'manual')),
  source_id UUID NOT NULL,
  user_id UUID NOT NULL,
  old_bj NUMERIC,
  new_bj NUMERIC,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'zero')),
  changed_by UUID NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bj_audit_source ON public.bj_audit_log(source, source_id);
CREATE INDEX idx_bj_audit_user ON public.bj_audit_log(user_id, created_at DESC);

ALTER TABLE public.bj_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view audit log"
  ON public.bj_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin can insert audit log"
  ON public.bj_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND auth.uid() = changed_by);

-- 3) Update sync_activity_from_meetings to include manual adjustments
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
  v_manual_bj        numeric;
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

  -- Add manual adjustments
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
$function$;

-- 4) Trigger on manual adjustments to recompute activity_records
CREATE OR REPLACE FUNCTION public.trg_fn_sync_manual_bj()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.week_start);
  ELSE
    PERFORM public.sync_activity_from_meetings(NEW.user_id, NEW.week_start);
    IF TG_OP = 'UPDATE' AND OLD.week_start <> NEW.week_start THEN
      PERFORM public.sync_activity_from_meetings(OLD.user_id, OLD.week_start);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_manual_bj_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.manual_bj_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_manual_bj();