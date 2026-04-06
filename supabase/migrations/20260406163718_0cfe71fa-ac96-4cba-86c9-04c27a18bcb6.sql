
CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_event text NOT NULL,
  title_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  recipient_roles text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  send_push boolean NOT NULL DEFAULT true,
  send_in_app boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view notification_rules"
  ON public.notification_rules FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin can insert notification_rules"
  ON public.notification_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update notification_rules"
  ON public.notification_rules FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can delete notification_rules"
  ON public.notification_rules FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Seed default notification rules
INSERT INTO public.notification_rules (name, trigger_event, title_template, body_template, recipient_roles, is_active, description) VALUES
  ('Nový člen v týmu', 'new_member', 'Nový člen v týmu', '{{member_name}} se právě zaregistroval/a do vaší struktury.', '{vedouci,budouci_vedouci,garant,ziskatel}', true, 'Odeslat při registraci nového člena'),
  ('Povýšení schváleno', 'promotion_approved', 'Povýšení schváleno', '{{member_name}} byl/a povýšen/a na {{new_role}}.', '{vedouci,budouci_vedouci}', true, 'Odeslat při schválení povýšení'),
  ('Připomínka schůzky', 'meeting_reminder', 'Nadcházející schůzka', 'Máte schůzku s {{client_name}} dnes v {{meeting_time}}.', '{vedouci,budouci_vedouci,garant,ziskatel,novacek}', false, 'Připomínka před plánovanou schůzkou'),
  ('Týdenní souhrn', 'weekly_summary', 'Týdenní souhrn aktivit', 'Tento týden: {{fsa_count}} analýz, {{ser_count}} servisů, {{bj_total}} BJ.', '{vedouci,budouci_vedouci,garant,ziskatel}', false, 'Souhrn aktivit na konci týdne');
