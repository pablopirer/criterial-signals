-- Day 2: make interest_type nullable.
--
-- The column was created as NOT NULL without a default, which means any
-- insert that omits interest_type fails with a 23502 error. The field is
-- optional in the sample form and not marked as required in the business
-- spec. This migration corrects the constraint.

ALTER TABLE public.leads
  ALTER COLUMN interest_type DROP NOT NULL;
