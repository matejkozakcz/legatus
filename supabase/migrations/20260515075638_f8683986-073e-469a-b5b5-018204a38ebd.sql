ALTER TABLE public.individual_meetings
  DROP CONSTRAINT IF EXISTS individual_meetings_subject_id_fkey;

DROP POLICY IF EXISTS individual_meetings_select ON public.individual_meetings;

CREATE POLICY individual_meetings_select ON public.individual_meetings
FOR SELECT
USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = individual_meetings.subject_id
      AND (p.vedouci_id = auth.uid() OR p.garant_id = auth.uid())
  )
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT p.vedouci_id AS superior_id
        FROM public.profiles p
       WHERE p.id = individual_meetings.subject_id
         AND p.vedouci_id IS NOT NULL
      UNION ALL
      SELECT p2.vedouci_id
        FROM public.profiles p2
        JOIN chain c ON p2.id = c.superior_id
       WHERE p2.vedouci_id IS NOT NULL
    )
    SELECT 1 FROM chain WHERE chain.superior_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.recruitment_candidates c
     WHERE c.id = individual_meetings.subject_id
       AND (
         c.owner_id = auth.uid()
         OR public.is_in_vedouci_subtree(auth.uid(), c.owner_id)
         OR EXISTS (
           SELECT 1 FROM public.profiles pp
            WHERE pp.id = c.owner_id
              AND pp.garant_id = auth.uid()
              AND pp.is_active = true
         )
       )
  )
);