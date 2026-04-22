CREATE OR REPLACE FUNCTION public.set_manual_bj_week_start()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.week_start := date_trunc('week', NEW.date)::date;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;