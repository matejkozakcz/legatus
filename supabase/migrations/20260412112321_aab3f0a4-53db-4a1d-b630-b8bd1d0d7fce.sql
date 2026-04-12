
ALTER TABLE public.promotion_requests DROP CONSTRAINT promotion_requests_requested_role_check;
ALTER TABLE public.promotion_requests ADD CONSTRAINT promotion_requests_requested_role_check 
  CHECK (requested_role = ANY (ARRAY['ziskatel', 'garant', 'budouci_vedouci', 'vedouci']));
