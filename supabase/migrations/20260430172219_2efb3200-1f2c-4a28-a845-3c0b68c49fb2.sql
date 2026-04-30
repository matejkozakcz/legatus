-- Enable realtime for profiles and client_meetings so admin Activity tab can refresh on actual changes
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.client_meetings REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_meetings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;