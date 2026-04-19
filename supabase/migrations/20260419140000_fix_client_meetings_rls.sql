-- ================================================================
-- P0-1: Fix RLS na client_meetings
--
-- Původní policy měla prohozené argumenty:
--   is_in_vedouci_subtree(user_id, auth.uid())
-- Funkce má signaturu (_vedouci_id, _target_id), takže toto
-- kontrolovalo, jestli je PŘIHLÁŠENÝ člověk ve stromu pod MAJITELEM
-- záznamu – tedy přesně opačně, než se zamýšlelo.
--
-- Důsledek: žádný vedoucí (ani BV) neviděl meetings svého týmu.
--
-- Zároveň rozšiřujeme policy o budouci_vedouci (viz P1-5).
-- ================================================================

DROP POLICY IF EXISTS "Vedouci view team meetings" ON public.client_meetings;

CREATE POLICY "Vedouci view team meetings"
  ON public.client_meetings FOR SELECT
  USING (
    public.get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND public.is_in_vedouci_subtree(auth.uid(), user_id)
  );
