-- Drop notification system tables (CASCADE removes dependent indexes/constraints/policies)
DROP TABLE IF EXISTS public.notification_rule_runs CASCADE;
DROP TABLE IF EXISTS public.notification_rules CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;