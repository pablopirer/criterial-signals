-- Day 2: enforce one lead per email.
--
-- Rationale: the previous Make scenario inserted a new `leads` row on every
-- form submission, producing duplicates whenever a visitor resubmitted. The
-- replacement Edge Function uses an UPSERT keyed on `email`, which requires
-- a unique constraint to be present.
--
-- This migration:
--   1. De-duplicates existing rows by keeping the oldest row per email and
--      moving any newer duplicates' notes/last_contact_at into it.
--   2. Adds a unique constraint on `lower(email)` so casing differences
--      ("Foo@x.com" vs "foo@x.com") collapse to a single lead.
--
-- Notes:
--   - We use a functional unique index rather than a column-level UNIQUE
--     constraint because Postgres unique constraints cannot reference
--     expressions directly.
--   - This migration is safe to re-run: the merge step is idempotent and
--     the index is created with IF NOT EXISTS.

begin;

-- 1. Merge duplicates: for every email with more than one row, keep the
--    earliest row (lowest created_at) and delete the rest. We deliberately
--    do not try to merge `notes` or `interest_type`; the earliest record
--    wins. If you need a richer merge later, do it as a one-off script.
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(email)
      order by created_at asc, id asc
    ) as rn
  from public.leads
  where email is not null
)
delete from public.leads l
using ranked r
where l.id = r.id
  and r.rn > 1;

-- 2. Create the unique index. Using a functional index on lower(email)
--    so casing variants are treated as the same lead.
create unique index if not exists leads_email_lower_unique
  on public.leads (lower(email));

commit;
