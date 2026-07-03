-- Free public Signals edition: store a reduced ("open") projection of a Weekly
-- alongside the full Pro version, in the same publication row.
--
-- Context:
--   Go-to-market is free-first via LinkedIn. Free readers get a recurring,
--   reduced public edition of the Weekly ("the what happened": apertura +
--   señales facts + positioning map); Pro keeps the full depth (patrón,
--   implicación, read-through, dato, fuentes) plus the monthly Brief. Both
--   views are derived from the SAME model generation to guarantee consistency
--   and minimise cost — so they live on one row: body_markdown = full (Pro),
--   body_public = reduced (Free).
--
-- Access model:
--   The reduced HTML is served by the public, read-only Edge Function
--   `get-public-editions` (service role), which only ever returns rows where
--   status='published' AND body_public IS NOT NULL. The full body_markdown is
--   never exposed there. No anon RLS policy is added: access is mediated
--   entirely by the Edge Function, mirroring get-sample.
--
-- Notes:
--   - Nullable: only weekly rows carry a public projection; samples, monthly
--     briefs and legacy rows leave it null and never surface in the public feed.
--   - Safe to re-run: uses IF NOT EXISTS.

begin;

alter table public.publications
  add column if not exists body_public text;

commit;
