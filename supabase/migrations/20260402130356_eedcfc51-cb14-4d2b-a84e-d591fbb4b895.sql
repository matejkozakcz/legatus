
-- Vedoucí can update profiles in their subtree
CREATE POLICY "Vedouci can update subtree profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'vedouci'
  AND is_in_vedouci_subtree(auth.uid(), id)
)
WITH CHECK (
  get_user_role(auth.uid()) = 'vedouci'
  AND is_in_vedouci_subtree(auth.uid(), id)
);

-- Garant can update their novacci
CREATE POLICY "Garant can update their novacci"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'garant'
  AND garant_id = auth.uid()
)
WITH CHECK (
  get_user_role(auth.uid()) = 'garant'
  AND garant_id = auth.uid()
);

-- Users can update own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
