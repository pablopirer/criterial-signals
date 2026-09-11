-- Advisory requests — structured detail behind each Advisory form
-- submission (encargos.html), linked to its commercial lead.
--
-- Context (Checkpoint 2 · Fase 1, decision 2b): advisory-request used to
-- only send email, with zero trace in the database. It now also
-- creates/updates a `leads` row (source='advisory_form') and records the
-- request detail here, mirroring the existing `sample_requests` pattern:
-- one detail table per form type, linked to `leads` via lead_id, with its
-- own status lifecycle. Chosen over stuffing it into leads.notes because
-- notes is a single free-text field that would lose history on repeat
-- submissions and mix typed data with prose.
--
-- Access model: service-role only, same as sample_requests /
-- signals_subscribers. RLS enabled, no public policies — advisory-request
-- is the only writer.
--
-- is_test follows the same convention as every other table since
-- Checkpoint 1 (20260911120000_add_is_test_flag.sql): DEFAULT true while
-- Criterial is in validation.
--
-- Additive and reversible. Safe to re-run (IF NOT EXISTS). NOT applied by
-- Claude Code — apply in the SQL Editor, same as the is_test migration.

begin;

create table if not exists public.advisory_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  lead_id      uuid not null references public.leads(id),
  tipo_encargo text not null,
  descripcion  text,
  status       text not null default 'new',
  is_test      boolean not null default true
);

create index if not exists advisory_requests_lead_id_idx
  on public.advisory_requests (lead_id);

alter table public.advisory_requests enable row level security;

grant select, insert, update on public.advisory_requests to service_role;

commit;

-- ROLLBACK (do NOT execute as part of this migration; keep for reference
-- only, in case a future checkpoint needs to revert this one):
--
-- drop table if exists public.advisory_requests;
