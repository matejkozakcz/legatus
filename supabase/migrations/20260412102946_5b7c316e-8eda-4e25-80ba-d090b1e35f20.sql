
-- Create onboarding_tasks table
CREATE TABLE public.onboarding_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  novacek_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  deadline date,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create onboarding_templates table
CREATE TABLE public.onboarding_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER update_onboarding_tasks_updated_at
  BEFORE UPDATE ON public.onboarding_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for onboarding_tasks

-- Nováček can view own tasks
CREATE POLICY "Novacek can view own onboarding tasks"
  ON public.onboarding_tasks FOR SELECT
  TO authenticated
  USING (novacek_id = auth.uid());

-- Nováček can update own tasks (completed, completed_at, description)
CREATE POLICY "Novacek can update own onboarding tasks"
  ON public.onboarding_tasks FOR UPDATE
  TO authenticated
  USING (novacek_id = auth.uid())
  WITH CHECK (novacek_id = auth.uid());

-- Vedoucí/BV can SELECT tasks for their subtree
CREATE POLICY "Vedouci can view subtree onboarding tasks"
  ON public.onboarding_tasks FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), novacek_id)
  );

-- Vedoucí/BV can INSERT tasks
CREATE POLICY "Vedouci can insert subtree onboarding tasks"
  ON public.onboarding_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), novacek_id)
  );

-- Vedoucí/BV can UPDATE tasks
CREATE POLICY "Vedouci can update subtree onboarding tasks"
  ON public.onboarding_tasks FOR UPDATE
  TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), novacek_id)
  )
  WITH CHECK (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), novacek_id)
  );

-- Vedoucí/BV can DELETE tasks
CREATE POLICY "Vedouci can delete subtree onboarding tasks"
  ON public.onboarding_tasks FOR DELETE
  TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), novacek_id)
  );

-- Garant can view their novacci tasks (read-only)
CREATE POLICY "Garant can view novacci onboarding tasks"
  ON public.onboarding_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = onboarding_tasks.novacek_id
        AND profiles.garant_id = auth.uid()
        AND profiles.is_active = true
    )
  );

-- Admin full access
CREATE POLICY "Admin can manage all onboarding tasks"
  ON public.onboarding_tasks FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- RLS for onboarding_templates

-- Admin can manage templates
CREATE POLICY "Admin can manage onboarding templates"
  ON public.onboarding_templates FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Vedoucí/BV can manage templates
CREATE POLICY "Vedouci can manage onboarding templates"
  ON public.onboarding_templates FOR ALL
  TO authenticated
  USING (get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci'))
  WITH CHECK (get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci'));

-- Everyone authenticated can view templates (for applying)
CREATE POLICY "Authenticated can view onboarding templates"
  ON public.onboarding_templates FOR SELECT
  TO authenticated
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_tasks;
