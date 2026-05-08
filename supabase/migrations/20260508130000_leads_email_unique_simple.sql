-- Day 2: add simple unique constraint on email to support upsert.
--
-- The existing leads_email_lower_unique index is on lower(email), which
-- PostgREST cannot use for ON CONFLICT resolution from the JS client.
-- This adds a straightforward unique constraint on email that the
-- Supabase JS upsert can reference directly.

ALTER TABLE public.leads
  ADD CONSTRAINT leads_email_unique UNIQUE (email);
