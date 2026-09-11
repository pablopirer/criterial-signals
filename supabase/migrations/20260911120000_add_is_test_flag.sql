-- Fase 1 · Checkpoint 1 — internal `is_test` flag on every production table.
--
-- Additive and reversible: adds one boolean column per table, backfills it,
-- touches nothing else. No data is deleted or otherwise modified.
--
-- Purpose: mark all current rows as test data (confirmed by the owner,
-- 2026-09-11 — 20 leads, 48 sample_requests, 13 publications incl. the
-- Weekly currently published on the live site, 1 subscriber,
-- 1 signals_subscriber, 0 outreach_events, 0 source_items).
--
-- `is_test` is INTERNAL METADATA ONLY as of this checkpoint. No Edge
-- Function, admin.html, view or query reads or filters by it yet. The
-- published Weekly keeps serving criterialsignals.com exactly as before —
-- it is simply tagged is_test = true like every other existing row.
--
-- DEFAULT true is deliberate: while Criterial is still in validation, every
-- new row is born tagged as test data. The default flips to false at
-- launch, in a future checkpoint — not here.
--
-- Schema verified live before writing this migration (read-only, 2026-09-11):
--   information_schema.columns for leads, sample_requests, publications,
--   subscribers, signals_subscribers, outreach_events, source_items — all
--   table/column names confirmed exactly as used below; none already had an
--   is_test (or equivalent) column.
--   pg_constraint on public.leads → only leads_pkey (PRIMARY KEY) and
--   leads_email_unique (UNIQUE(email)). No CHECK constraint on `source`
--   (it is free text, NOT NULL DEFAULT 'sample_form') → left untouched, as
--   instructed when there is no CHECK to widen. Nothing here prepares the
--   'advisory_form' / 'signals_open' / 'stripe_pro' / 'manual' values from
--   a CHECK-widening standpoint because there is no CHECK to widen; the
--   application code already writes whatever text it wants to `source`.
--
-- outreach_events and source_items are currently empty (0 rows each) but
-- get the same column for uniformity, per the recommended default.

BEGIN;

ALTER TABLE public.leads               ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.sample_requests     ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.publications        ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.subscribers         ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.signals_subscribers ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.outreach_events     ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.source_items        ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;

-- Backfill: everything that exists today is test data, including the
-- published Weekly (it stays visible publicly; is_test is not read by any
-- code path yet, so this has zero effect on what the site serves).
UPDATE public.leads               SET is_test = true;
UPDATE public.sample_requests     SET is_test = true;
UPDATE public.publications        SET is_test = true;
UPDATE public.subscribers         SET is_test = true;
UPDATE public.signals_subscribers SET is_test = true;
UPDATE public.outreach_events     SET is_test = true;
UPDATE public.source_items        SET is_test = true;

COMMIT;

-- ROLLBACK (do NOT execute as part of this migration; keep for reference
-- only, in case a future checkpoint needs to revert this one):
--
-- ALTER TABLE public.leads               DROP COLUMN IF EXISTS is_test;
-- ALTER TABLE public.sample_requests     DROP COLUMN IF EXISTS is_test;
-- ALTER TABLE public.publications        DROP COLUMN IF EXISTS is_test;
-- ALTER TABLE public.subscribers         DROP COLUMN IF EXISTS is_test;
-- ALTER TABLE public.signals_subscribers DROP COLUMN IF EXISTS is_test;
-- ALTER TABLE public.outreach_events     DROP COLUMN IF EXISTS is_test;
-- ALTER TABLE public.source_items        DROP COLUMN IF EXISTS is_test;
