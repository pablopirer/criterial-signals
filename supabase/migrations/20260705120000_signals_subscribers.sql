-- Newsletter subscribers for the free ("open") Signals edition.
--
-- Context:
--   signals.html (the public open edition) now captures emails inline. A
--   subscriber to the open edition is NOT a commercial lead (that's `leads`,
--   fed by the sample/advisory forms): it's a newsletter recipient with its own
--   lifecycle — active/unsubscribed — and needs an unguessable unsubscribe
--   token for the mandatory opt-out link in every email.
--
-- Access model:
--   All reads/writes go through service-role Edge Functions (subscribe-signals,
--   send-open-edition, unsubscribe-signals). RLS is enabled with NO public
--   policies — access is mediated entirely by the Edge Functions, mirroring the
--   get-sample / get-public-editions pattern. Only service_role is granted.
--
-- Notes:
--   - UNIQUE(email): re-subscribing upserts the same row (and can reactivate an
--     unsubscribed one). subscribe-signals always stores email lowercased, so a
--     plain column UNIQUE constraint is both case-safe AND targetable by
--     PostgREST's onConflict="email" — an expression index on lower(email) is
--     NOT (see leads_email_unique_simple.sql for the same lesson).
--   - Safe to re-run: uses IF NOT EXISTS.

begin;

create table if not exists public.signals_subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  created_at        timestamptz not null default now(),
  status            text not null default 'active',
  unsubscribe_token uuid not null default gen_random_uuid(),
  source            text not null default 'signals_open'
);

create index if not exists signals_subscribers_token_idx
  on public.signals_subscribers (unsubscribe_token);

alter table public.signals_subscribers enable row level security;

grant select, insert, update on public.signals_subscribers to service_role;

commit;
