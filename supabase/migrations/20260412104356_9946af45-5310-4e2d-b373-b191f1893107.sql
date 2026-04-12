
ALTER TABLE public.onboarding_tasks
ADD COLUMN deadline_time time without time zone DEFAULT NULL;
