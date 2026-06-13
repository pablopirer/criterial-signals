-- Phase 1 of the Sample redesign: make sample publications addressable by a
-- public, unguessable token, and store structured content for the web brief.
--
-- Context:
--   The new Sample deliverable is an interactive web page ("muestra web")
--   served by the public, read-only Edge Function `get-sample`. Each sample
--   needs a stable, unguessable URL token. We also store the brief as
--   structured JSON (`body_data`) so the page can render rich sections — and,
--   in Phase 2, the capital map — instead of parsing the markdown-ish text in
--   `body_markdown`.
--
-- Access model:
--   `get-sample` uses the service role and filters on type='sample' + exact
--   token match. No anon RLS policy is added here: public access is mediated
--   entirely by the Edge Function, which never serves non-sample rows. The
--   token existing on weekly/monthly rows is therefore harmless.
--
-- Notes:
--   - gen_random_uuid() is built-in (already used for every id default) and
--     is volatile, so each pre-existing row receives a distinct token, which
--     lets the unique index build cleanly.
--   - Safe to re-run: every statement uses IF NOT EXISTS.

begin;

-- Unguessable public handle for each publication. Only ever exposed for
-- type='sample' via the get-sample Edge Function.
alter table public.publications
  add column if not exists public_token uuid not null default gen_random_uuid();

-- Structured brief content (snapshot, signals, watch, and later the capital
-- map graph). JSON so the web brief renders rich sections without parsing
-- body_markdown. Nullable: legacy samples predate this column.
alter table public.publications
  add column if not exists body_data jsonb;

create unique index if not exists publications_public_token_unique
  on public.publications (public_token);

commit;
