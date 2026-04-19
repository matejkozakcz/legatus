-- ================================================================
-- P1-5: Rozšíření RLS policies o roli budouci_vedouci
--
-- Role 'budouci_vedouci' byla přidána v 20260406120000, ale většina
-- RLS policies (profiles, promotion_requests, promotion_history)
-- stále kontroluje pouze role = 'vedouci'. BV tak v těch tabulkách
-- nemá stejná práva jako V, ačkoli business model to vyžaduje
-- (BV spravuje svůj podstrom stejně jako V).
--
-- Tato migrace rozšiřuje policies o BV. Admin bypass (is_admin())
-- je zachován separátně.
-- ================================================================

-- ----------------------------------------------------------------
-- profiles: Vedouci + BV can view their subtree
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Vedouci can view their subtree" ON public.profiles;

CREATE POLICY "Vedouci can view their subtree"
  ON public.profiles FOR SELECT
  USING (
    public.get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND public.is_in_vedouci_subtree(auth.uid(), id)
  );

-- ----------------------------------------------------------------
-- profiles: Vedouci + BV can update subtree profiles
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Vedouci can update subtree profiles" ON public.profiles;

CREATE POLICY "Vedouci can update subtree profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), id)
  )
  WITH CHECK (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), id)
  );

-- ----------------------------------------------------------------
-- activity_records: Vedouci + BV can view subtree activity records
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Vedouci can view subtree activity records" ON public.activity_records;

CREATE POLICY "Vedouci can view subtree activity records"
  ON public.activity_records FOR SELECT
  USING (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), user_id)
  );

-- ----------------------------------------------------------------
-- promotion_requests: Vedouci + BV can view team promotion requests
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Vedouci can view team promotion requests" ON public.promotion_requests;

CREATE POLICY "Vedouci can view team promotion requests"
  ON public.promotion_requests FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND public.is_in_vedouci_subtree(auth.uid(), user_id)
  );

-- ----------------------------------------------------------------
-- promotion_requests: Vedouci + BV can update
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Vedouci can update promotion requests" ON public.promotion_requests;

CREATE POLICY "Vedouci can update promotion requests"
  ON public.promotion_requests FOR UPDATE TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND public.is_in_vedouci_subtree(auth.uid(), user_id)
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND public.is_in_vedouci_subtree(auth.uid(), user_id)
  );

-- ----------------------------------------------------------------
-- promotion_requests: Vedouci + BV can delete
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Vedouci can delete promotion requests" ON public.promotion_requests;

CREATE POLICY "Vedouci can delete promotion requests"
  ON public.promotion_requests FOR DELETE TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), user_id)
  );

-- ----------------------------------------------------------------
-- promotion_history: Vedouci + BV can view subtree history
-- (zúžení vůči původní policy, která dávala vedoucímu vše — nyní
--  omezeno na podstrom, což je v souladu s principem least privilege)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Vedouci can view all promotion history" ON public.promotion_history;

CREATE POLICY "Vedouci can view subtree promotion history"
  ON public.promotion_history FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('vedouci', 'budouci_vedouci')
    AND is_in_vedouci_subtree(auth.uid(), user_id)
  );
