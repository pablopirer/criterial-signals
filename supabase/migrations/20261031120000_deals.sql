-- Deal base — one row per private-capital deal, fed by published Weeklies.
--
-- Context (proposal "Criterial — Propuesta de modelo de contenidos",
-- 2026-10-31, Fase 2): the Weekly now emits structured deal data (stored in
-- publications.body_data since Fase 1). This table accumulates it across
-- weeks, without duplicates, so the Brief Mensual and later formats (deal
-- radar, investor profiles, quarterly barometer) can compute real figures
-- instead of relying on one web-search pass.
--
-- Who writes: admin-publications, through the two functions below, when a
-- Weekly is published (sync), unpublished or deleted (unsync). The Edge
-- Function normalises each deal first (deal_key, closed labels, valid date,
-- amount converted to euros with the ECB reference rate). Publishing a
-- Weekly by direct SQL or scripts/publish-draft.sh does NOT feed this table.
--
-- Dedupe: deal_key is the normalised target company (accents, punctuation
-- and legal suffixes stripped), plus the scope (espana|exterior). The same
-- deal reported in two Weeklies becomes one row whose publication_ids lists
-- both; missing fields are filled from the later report, never overwritten.
--
-- Access model: service-role only, like sample_requests / signals_subscribers.
-- RLS enabled, no public policies.
--
-- is_test: a deal is test data while every Weekly that reported it is test
-- data (publications.is_test, DEFAULT true during validation).
--
-- Additive and reversible. Safe to re-run.

begin;

create table if not exists public.deals (
  id                   uuid primary key default gen_random_uuid(),
  deal_key             text not null unique,
  nombre               text not null,
  comprador            text,
  objetivo             text,
  tipo                 text,
  sector               text,
  importe              text,
  n_importe            numeric,
  moneda               text,
  importe_eur          numeric,
  fecha                date,
  ambito               text not null default 'espana' check (ambito in ('espana', 'exterior')),
  tesis                text,
  fuente_medio         text,
  fuente_url           text,
  first_publication_id uuid references public.publications(id) on delete set null,
  publication_ids      uuid[] not null default '{}',
  is_test              boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists deals_fecha_idx on public.deals (fecha);
create index if not exists deals_sector_idx on public.deals (sector);
create index if not exists deals_publication_ids_idx on public.deals using gin (publication_ids);

alter table public.deals enable row level security;

-- The project's default privileges hand new tables to anon/authenticated;
-- RLS without policies already blocks them, this makes it explicit.
revoke all on public.deals from anon, authenticated;
grant select, insert, update, delete on public.deals to service_role;

-- Add (or merge) the deals of one publication. p_deals is an array of
-- already-normalised objects whose keys match the columns above.
create or replace function public.deals_sync_publication(
  p_publication_id uuid,
  p_deals jsonb,
  p_is_test boolean
) returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.deals as d (
    deal_key, nombre, comprador, objetivo, tipo, sector, importe, n_importe,
    moneda, importe_eur, fecha, ambito, tesis, fuente_medio, fuente_url,
    first_publication_id, publication_ids, is_test
  )
  select
    x.deal_key, x.nombre, x.comprador, x.objetivo, x.tipo, x.sector, x.importe,
    x.n_importe, x.moneda, x.importe_eur, x.fecha, coalesce(x.ambito, 'espana'),
    x.tesis, x.fuente_medio, x.fuente_url,
    p_publication_id, array[p_publication_id], p_is_test
  from jsonb_to_recordset(coalesce(p_deals, '[]'::jsonb)) as x(
    deal_key text, nombre text, comprador text, objetivo text, tipo text,
    sector text, importe text, n_importe numeric, moneda text,
    importe_eur numeric, fecha date, ambito text, tesis text,
    fuente_medio text, fuente_url text
  )
  where coalesce(x.deal_key, '') <> '' and coalesce(x.nombre, '') <> ''
  on conflict (deal_key) do update set
    publication_ids = case
      when p_publication_id = any(d.publication_ids) then d.publication_ids
      else d.publication_ids || p_publication_id
    end,
    comprador    = coalesce(d.comprador, excluded.comprador),
    objetivo     = coalesce(d.objetivo, excluded.objetivo),
    tipo         = coalesce(d.tipo, excluded.tipo),
    sector       = coalesce(d.sector, excluded.sector),
    -- An amount, once known, wins over "n.d."; a known amount is never replaced.
    importe      = case when d.n_importe is null and excluded.n_importe is not null
                        then excluded.importe else d.importe end,
    n_importe    = coalesce(d.n_importe, excluded.n_importe),
    moneda       = coalesce(d.moneda, excluded.moneda),
    importe_eur  = coalesce(d.importe_eur, excluded.importe_eur),
    fecha        = least(d.fecha, excluded.fecha),
    tesis        = coalesce(d.tesis, excluded.tesis),
    fuente_medio = coalesce(d.fuente_medio, excluded.fuente_medio),
    fuente_url   = coalesce(d.fuente_url, excluded.fuente_url),
    is_test      = d.is_test and excluded.is_test,
    updated_at   = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Take one publication out of the base: drop it from every deal's
-- publication_ids and delete the deals no publication reports any more.
-- Returns the number of deals deleted.
create or replace function public.deals_unsync_publication(
  p_publication_id uuid
) returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  update public.deals
     set publication_ids = array_remove(publication_ids, p_publication_id),
         updated_at = now()
   where p_publication_id = any(publication_ids);
  delete from public.deals where cardinality(publication_ids) = 0;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.deals_sync_publication(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.deals_unsync_publication(uuid) from public, anon, authenticated;
grant execute on function public.deals_sync_publication(uuid, jsonb, boolean) to service_role;
grant execute on function public.deals_unsync_publication(uuid) to service_role;

commit;

-- ROLLBACK (do NOT execute as part of this migration; keep for reference):
--
-- drop function if exists public.deals_sync_publication(uuid, jsonb, boolean);
-- drop function if exists public.deals_unsync_publication(uuid);
-- drop table if exists public.deals;
