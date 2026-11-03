-- Deal base: status, source date and last review.
--
-- Context: the offer proposal of 2026-11-02 ("Anunciada no equivale a
-- cerrada") asks every recorded fact to carry its status, the date it was
-- published and when it was last reviewed. Added before real data enters the
-- base, so no backfill is needed (only test deals exist).
--
--   estado            anunciada | en_proceso | cerrada | cancelada. When two
--                     Weeklies disagree, the more advanced status wins
--                     (cancelada is terminal), so re-syncing an older Weekly
--                     never moves a deal backwards.
--   fecha_publicacion date the source published the news (fecha = date of the
--                     fact itself). The earliest one is kept.
--   revisado_at       last time a Weekly confirmed or completed the row.
--
-- Additive and reversible. Safe to re-run.

begin;

alter table public.deals
  add column if not exists estado text
    check (estado in ('anunciada', 'en_proceso', 'cerrada', 'cancelada')),
  add column if not exists fecha_publicacion date,
  add column if not exists revisado_at timestamptz not null default now();

create or replace function public.deals_estado_rank(e text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case e
    when 'anunciada'  then 1
    when 'en_proceso' then 2
    when 'cerrada'    then 3
    when 'cancelada'  then 4
    else 0
  end;
$$;

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
    estado, fecha_publicacion,
    first_publication_id, publication_ids, is_test
  )
  select
    x.deal_key, x.nombre, x.comprador, x.objetivo, x.tipo, x.sector, x.importe,
    x.n_importe, x.moneda, x.importe_eur, x.fecha, coalesce(x.ambito, 'espana'),
    x.tesis, x.fuente_medio, x.fuente_url,
    x.estado, x.fecha_publicacion,
    p_publication_id, array[p_publication_id], p_is_test
  from jsonb_to_recordset(coalesce(p_deals, '[]'::jsonb)) as x(
    deal_key text, nombre text, comprador text, objetivo text, tipo text,
    sector text, importe text, n_importe numeric, moneda text,
    importe_eur numeric, fecha date, ambito text, tesis text,
    fuente_medio text, fuente_url text, estado text, fecha_publicacion date
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
    -- The more advanced status wins, so an older report never moves it back.
    estado       = case when public.deals_estado_rank(excluded.estado) > public.deals_estado_rank(d.estado)
                        then excluded.estado else d.estado end,
    fecha_publicacion = least(d.fecha_publicacion, excluded.fecha_publicacion),
    is_test      = d.is_test and excluded.is_test,
    revisado_at  = now(),
    updated_at   = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.deals_estado_rank(text) from public, anon, authenticated;
grant execute on function public.deals_estado_rank(text) to service_role;

commit;

-- ROLLBACK (do NOT execute as part of this migration; keep for reference):
--
-- Re-create deals_sync_publication from 20261031120000_deals.sql, then:
-- drop function if exists public.deals_estado_rank(text);
-- alter table public.deals drop column if exists estado,
--   drop column if exists fecha_publicacion, drop column if exists revisado_at;
