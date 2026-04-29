ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_known_version text;

-- Allow users to update their own last_seen + version (already covered by "Users can update own profile")
-- No new RLS needed.