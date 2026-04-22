insert into public.app_config (key, value, description) values
  ('edge_send_push_url', '"https://hiisenvrdakfnlzkiand.supabase.co/functions/v1/send-push-notification"'::jsonb, 'URL edge funkce pro odesílání web push'),
  ('edge_anon_key', '"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaXNlbnZyZGFrZm5semtpYW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjc0OTQsImV4cCI6MjA5MDcwMzQ5NH0.X5Sy1_xKg3oDx4v_IuPio_UXZJVYT2W8Lao-dE0PXLc"'::jsonb, 'Anon key pro autorizaci edge funkce volané z DB triggeru')
on conflict (key) do update set value = excluded.value;