-- Newsletter list: who subscribes and where they came from.
--
-- Context: the LinkedIn campaign of November 2026 is meant to find out who the
-- audience is. Each subscriber of the open edition now keeps:
--
--   perfil  what they do, answered (optionally) right after subscribing:
--           pe_vc | asesor | empresa | family_office | banca_deuda |
--           inversor_internacional | otro. Null if they skip the question.
--   origen  how they arrived, captured by signals.html on the first subscribe:
--           the utm_* parameters of the link, the referrer, the landing URL
--           and the page language. Never overwritten by a later subscribe.
--
-- Additive and reversible. No new table, so no new grants: signals_subscribers
-- keeps RLS on with no public policies (service role only).

begin;

alter table public.signals_subscribers
  add column if not exists perfil text,
  add column if not exists origen jsonb;

alter table public.signals_subscribers
  drop constraint if exists signals_subscribers_perfil_check;
alter table public.signals_subscribers
  add constraint signals_subscribers_perfil_check check (
    perfil is null or perfil in (
      'pe_vc', 'asesor', 'empresa', 'family_office', 'banca_deuda',
      'inversor_internacional', 'otro'
    )
  );

commit;

-- ROLLBACK (do NOT execute as part of this migration; keep for reference):
--
-- alter table public.signals_subscribers
--   drop constraint if exists signals_subscribers_perfil_check,
--   drop column if exists perfil,
--   drop column if exists origen;
