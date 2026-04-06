ALTER TABLE public.vedouci_goals 
ADD COLUMN selected_goal_1 text NOT NULL DEFAULT 'team_bj',
ADD COLUMN selected_goal_2 text NOT NULL DEFAULT 'personal_bj';