-- Enable pg_net for async HTTP calls from the database
create extension if not exists pg_net with schema extensions;

-- Trigger function: after a new notification row, fire send-push-notification edge function
create or replace function public.trg_fn_send_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_anon text;
  v_request_id bigint;
begin
  -- Read function URL + anon key from app_config (set by admin once)
  select value::text into v_url
  from public.app_config
  where key = 'edge_send_push_url'
  limit 1;

  select value::text into v_anon
  from public.app_config
  where key = 'edge_anon_key'
  limit 1;

  -- Strip leading/trailing JSON quotes
  v_url := trim(both '"' from coalesce(v_url, ''));
  v_anon := trim(both '"' from coalesce(v_anon, ''));

  if v_url = '' or v_anon = '' then
    -- Not configured yet — silently skip. App still works in-app.
    return new;
  end if;

  begin
    select net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body := jsonb_build_object(
        'notification_id', new.id,
        'recipient_id', new.recipient_id,
        'title', new.title,
        'body', new.body,
        'icon', new.icon,
        'link_url', new.link_url
      )
    ) into v_request_id;
  exception when others then
    -- Never block the INSERT
    raise notice 'send-push-notification call failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- Drop existing trigger if any
drop trigger if exists trg_send_push_on_notification on public.notifications;

create trigger trg_send_push_on_notification
after insert on public.notifications
for each row
execute function public.trg_fn_send_push_on_notification();