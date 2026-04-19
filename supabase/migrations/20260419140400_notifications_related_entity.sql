-- P1-2: Stabilní deduplikace notifikací pomocí related_entity_id
--
-- Kontext: dosud jsme deduplikovali podle title stringu – šablona notifikace se
-- mění (např. editace šablony v DB, jiný počet BJ v title) a stejná událost se
-- proto zdvojuje. Přidáváme related_entity_id, které se plní stabilním klíčem
-- (např. ID člena u promotion_eligible) a partial unique index, aby DB garantovala
-- maximálně jednu nepřečtenou notifikaci na (příjemce, typ, entita).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_id uuid;

CREATE INDEX IF NOT EXISTS idx_notifications_related_entity_id
  ON public.notifications (related_entity_id)
  WHERE related_entity_id IS NOT NULL;

-- Deduplikační index: pro každého příjemce / typ / entitu jen jedna nepřečtená notifikace.
-- Nečte se "read = false" přímo v UNIQUE predicate, protože potřebujeme pouze jeden
-- aktivní záznam – starší přečtené ignorujeme pomocí WHERE.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_unread_entity
  ON public.notifications (recipient_id, type, related_entity_id)
  WHERE read = false AND related_entity_id IS NOT NULL;
