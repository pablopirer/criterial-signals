-- Auto-notify the free ("open") newsletter list when an open edition publishes.
--
-- Context:
--   Publishing a weekly that carries a body_public projection (admin-publications
--   PATCH status→published) now also emails the signals_subscribers list, in the
--   background, reusing the same trigger point as the Pro notification. To make
--   that exactly-once and safe against re-publishing, we record when the open
--   edition blast went out — separate from `notified_at`, which tracks the Pro
--   notification. The blast only sends if open_notified_at IS NULL, then stamps it.
--
-- Notes:
--   - Nullable: existing/legacy rows (including the 4 already-published open
--     editions) are treated as "not yet blasted" but never blast unless re-PATCHed
--     to published — same idempotency behaviour as notified_at.
--   - Safe to re-run: uses IF NOT EXISTS.

begin;

alter table public.publications
  add column if not exists open_notified_at timestamptz;

commit;
