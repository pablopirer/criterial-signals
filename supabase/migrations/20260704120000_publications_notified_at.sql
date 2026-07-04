-- Auto-notify Pro subscribers when a weekly/monthly is published.
--
-- Context:
--   Publishing (admin-publications PATCH status→published) now fires the Pro
--   email notification automatically (it forwards to the existing send-weekly
--   Edge Function in the background). To make that exactly-once and safe against
--   re-publishing, we record when a publication was notified. The auto-notify
--   only sends if notified_at IS NULL, then stamps it.
--
-- Notes:
--   - Nullable: existing/legacy rows are treated as "not yet notified". The
--     manual "Enviar →" button (send-weekly) still works and can force a re-send.
--   - Safe to re-run: uses IF NOT EXISTS.

begin;

alter table public.publications
  add column if not exists notified_at timestamptz;

commit;
