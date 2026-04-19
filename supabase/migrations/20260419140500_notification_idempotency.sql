-- P1-3: Idempotency tabulka pro notify-new-member a další idempotentní notifikace.
--
-- Kontext: create-user spouští notify-new-member fire-and-forget. Při
-- re-deploymentu edge funkce nebo double-klik "Vytvořit" se členovi odeslalo
-- více push notifikací. Zavádíme univerzální idempotency store – edge funkce
-- nejprve zapíše (idempotency_key, source), pokud už existuje → nic neodesílá.

CREATE TABLE IF NOT EXISTS public.notification_idempotency (
  idempotency_key text NOT NULL,
  source          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_idempotency_pkey PRIMARY KEY (source, idempotency_key)
);

-- Úklid: záznamy jsou relevantní pár minut (anti-dvojklik / retry), po týdnu
-- je možné bezpečně smazat. Pro jednoduchost ponecháme, admin/Edge může později
-- napojit cron (např. pg_cron) na DELETE WHERE created_at < now() - '7 days'.
CREATE INDEX IF NOT EXISTS idx_notification_idempotency_created_at
  ON public.notification_idempotency (created_at);

-- RLS: vypnuto – tabulka je používaná jen service-role edge funkcemi.
ALTER TABLE public.notification_idempotency ENABLE ROW LEVEL SECURITY;
-- Žádné policies = nikdo z klientů se nedostane, service-role stejně bypassuje RLS.
