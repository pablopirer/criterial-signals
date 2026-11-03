-- Deal base: primary source and amount perimeter.
--
-- Context: the review of the February 2026 simulation (2026-11-03) found deals
-- classified from press headlines (a capital increase recorded as an
-- acquisition) and amounts whose perimeter was not stated (one of two sales
-- shown as if it were the whole deal). Each deal now keeps:
--
--   fuente_primaria  URL of the note by the manager, buyer or company, which
--                    is what the classification must rest on.
--   nota_importe     what the amount covers when it is not the whole deal, or
--                    why its nature is unclear.
--
-- Merge rule as for the other text fields: the first report wins, later ones
-- only fill gaps. Additive and reversible. Safe to re-run.
--
-- Also: a deal is matched by company alone, not company + ambito. The same
-- simulation found one seed round stored twice because two Weeklies disagreed
-- on its ambito; it now merges into the first row and keeps that row's ambito.

begin;

alter table public.deals
  add column if not exists fuente_primaria text,
  add column if not exists nota_importe text;

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
    estado, fecha_publicacion, fuente_primaria, nota_importe,
    first_publication_id, publication_ids, is_test
  )
  select
    -- The same company reported with a different ambito by another Weekly
    -- (a Berlin start-up tagged "exterior" one week and "espana" the next) is
    -- the same deal: it merges into the row already stored, whose ambito stays.
    coalesce(
      (select e.deal_key from public.deals e
        where split_part(e.deal_key, '|', 1) = split_part(x.deal_key, '|', 1)
        order by (e.deal_key = x.deal_key) desc, e.created_at
        limit 1),
      x.deal_key),
    x.nombre, x.comprador, x.objetivo, x.tipo, x.sector, x.importe,
    x.n_importe, x.moneda, x.importe_eur, x.fecha, coalesce(x.ambito, 'espana'),
    x.tesis, x.fuente_medio, x.fuente_url,
    x.estado, x.fecha_publicacion, x.fuente_primaria, x.nota_importe,
    p_publication_id, array[p_publication_id], p_is_test
  from jsonb_to_recordset(coalesce(p_deals, '[]'::jsonb)) as x(
    deal_key text, nombre text, comprador text, objetivo text, tipo text,
    sector text, importe text, n_importe numeric, moneda text,
    importe_eur numeric, fecha date, ambito text, tesis text,
    fuente_medio text, fuente_url text, estado text, fecha_publicacion date,
    fuente_primaria text, nota_importe text
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
    nota_importe = coalesce(d.nota_importe, excluded.nota_importe),
    fecha        = least(d.fecha, excluded.fecha),
    tesis        = coalesce(d.tesis, excluded.tesis),
    fuente_medio = coalesce(d.fuente_medio, excluded.fuente_medio),
    fuente_url   = coalesce(d.fuente_url, excluded.fuente_url),
    fuente_primaria = coalesce(d.fuente_primaria, excluded.fuente_primaria),
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

commit;

-- ROLLBACK (do NOT execute as part of this migration; keep for reference):
--
-- Re-create deals_sync_publication from 20261103120000_deals_estado.sql, then:
-- alter table public.deals drop column if exists fuente_primaria,
--   drop column if exists nota_importe;
