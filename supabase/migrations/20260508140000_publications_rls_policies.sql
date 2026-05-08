-- RLS policies for publications table.
--
-- Access model: authenticated users whose email matches an active subscriber
-- can read published publications of the types their plan grants.
--
-- Plan → types mapping (extend with new CREATE POLICY blocks as plans grow):
--   pro → weekly, monthly

-- pro subscribers: read published weekly and monthly publications.
CREATE POLICY "publications_pro_read"
ON publications
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND type IN ('weekly', 'monthly')
  AND EXISTS (
    SELECT 1 FROM subscribers
    WHERE lower(email) = lower(auth.email())
      AND plan  = 'pro'
      AND status = 'active'
  )
);
