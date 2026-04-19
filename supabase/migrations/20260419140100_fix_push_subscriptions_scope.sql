-- ================================================================
-- P0-2: Fix push subscription scope
--
-- Původní schéma: UNIQUE (user_id)
-- Problém: jeden browser install má jeden endpoint, ale DB
-- identifikuje subscription jen podle user_id. Když na stejném
-- zařízení použije postupně User A a User B, endpoint se re-použije,
-- ale DB o tom neví → push notifikace určená Userovi A
-- dorazí Userovi B (který je teď přihlášený).
--
-- Nové schéma: UNIQUE (endpoint). Endpoint je globálně unikátní
-- (URL konkrétního browser installu), takže UNIQUE(endpoint)
-- garantuje 1 řádek = 1 zařízení. Jeden uživatel smí mít
-- N zařízení (N řádků se stejným user_id, různé endpointy).
-- ================================================================

-- 1. Přidat sloupec endpoint odvozený ze subscription->>'endpoint'
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint text
  GENERATED ALWAYS AS (subscription->>'endpoint') STORED;

-- 2. Uklidit duplicitní endpointy, které v DB mohly vzniknout
--    před fixem (např. staré řádky po User A, když už User B má nový řádek
--    se stejným endpointem). Ponecháme nejnovější (max created_at).
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.endpoint = b.endpoint
  AND a.endpoint IS NOT NULL
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

-- 3. Přepnout constraint z user_id na endpoint
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

-- 4. Index pro rychlé queries podle user_id (už není unikátní)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);
