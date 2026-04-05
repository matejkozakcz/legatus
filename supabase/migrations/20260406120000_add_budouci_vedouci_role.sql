-- Rozšíření CHECK constraintu na profiles.role o chybějící hodnotu 'budouci_vedouci'
-- Původní constraint zahroval pouze: vedouci, garant, ziskatel, novacek
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'vedouci'::text,
    'budouci_vedouci'::text,
    'garant'::text,
    'ziskatel'::text,
    'novacek'::text
  ]));
