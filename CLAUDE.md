# CLAUDE.md — Criterial Signals

This file provides context and guidance to Claude Code when working in this repository. Read this fully before taking any action.

## What is this project

Criterial Signals is a market intelligence product focused on Iberia (Spain and Portugal), targeting M&A boutiques, search funds, advisory firms, asset managers, and small investment teams. The product delivers concise written briefs covering deal activity, competitive moves, real estate, and capital markets signals.

It is currently an MVP in early validation. The repository contains the full system: public website, infrastructure-as-code, automation, and content generation.

## Project state (May 2026)

### Day 1 — Complete
- Repo reorganization, backups, CLAUDE.md, .gitignore.

### Day 2 — Complete (2026-05-08)
- Edge Function `sample-request` deployed and validated end-to-end.
- Replaces Make scenario `sample-request-mvp`.
- Anthropic API (Claude Haiku) replaces OpenAI for brief generation.
- Idempotency via unique index on `lower(email)` in `leads`.
- Shared-secret webhook protection via `x-criterial-signal` header.

### Day 3 — Complete (2026-05-08)
- Web form (`sample.html`) cutover from Make to Edge Function.
- Make scenario deactivated.
- Resend integrated for email delivery of generated briefs.
- Full funnel validated end-to-end from form to inbox.
- Note: Supabase deprecated legacy API keys on 2026-05-03. Use publishable
  key (`sb_publishable_...`) for JS SDK; legacy JWT anon key still works
  for Edge Function Bearer auth.

### Day 4 — Complete (2026-05-08)
- Supabase Auth enabled with magic link (SMTP via Resend).
- RLS policy on `publications`: pro/active subscribers can read `weekly`
  and `monthly` publications with `status = published`.
- `archive.html` updated: magic link login, fetches publications via
  Supabase JS SDK, renders markdown with marked.js.

### Day 5 — Complete (2026-05-08)
- `scripts/test-e2e.sh`: verifies full funnel with PASS/FAIL per step.
- `scripts/funnel-metrics.sh`: reports leads, sample requests, publications
  and subscribers with breakdowns by status and type.
- Historical `queued` and `generation_failed` sample requests cleaned up.

### Validated and working in production
- Public website hosted on GitHub Pages.
- Lead capture form → Edge Function → Supabase → Anthropic → Resend.
- Authenticated archive for Pro subscribers (magic link via Supabase Auth).
- Stripe Payment Link for the Pro plan (€249/month).
- Automated subscriber registration on Stripe webhook.
- 14 real leads, 4 active Pro subscribers, 7 generated briefs.

### Not yet built
- Recurring content engine (weekly digests, monthly briefs).
- Content publishing workflow (moving publications from `draft` to `published`).

## Stack and architecture

### Current production stack
- **Frontend:** static HTML/CSS hosted on GitHub Pages, located in `/web`.
- **Database:** Supabase (PostgreSQL).
- **Automation:** Make (Integromat) — deactivated. Edge Function is now live.
- **Backend logic:** Supabase Edge Functions (TypeScript on Deno) — `sample-request` deployed.
- **Content generation:** Anthropic API (Claude Haiku `claude-haiku-4-5-20251001`).
- **Payments:** Stripe (Payment Links + webhooks).
- **Email:** Resend (`noreply@criterialsignals.com`, domain verified).

### Schema notes (audited 2026-05-08)
- `leads.interest_type` — nullable (was NOT NULL, fixed in Day 2 migration).
- `leads.email` — NOT NULL, unique constraint `leads_email_unique` added Day 2.
- `leads.source` — NOT NULL, default `sample_form`.
- `leads.status` — NOT NULL, default `new`.
- Always audit live schema before writing functions that insert/upsert data.

### Repository layout
/
├── CLAUDE.md
├── OPERATING_BLUEPRINT.md
├── README.md
├── .gitignore
├── /web
├── /supabase
│   ├── /functions
│   │   ├── /_shared         ← anthropic.ts, supabase.ts
│   │   └── /sample-request  ← index.ts, types.ts, README.md
│   └── /migrations
├── /prompts
├── /scripts
└── /archive

## Current roadmap

- **Day 1:** Complete.
- **Day 2:** Complete.
- **Day 3:** Complete.
- **Day 4:** Complete.
- **Day 5:** Complete.
- **Day 6:** Recurring content engine — weekly digest and monthly brief generation.

## Rules and restrictions

1. **Do not modify production database schema directly.** All schema changes go through SQL migrations under `/supabase/migrations`.
2. **Do not commit secrets.**
4. **Do not invent business logic.**
5. **Do not change Stripe configuration via code.**
6. **Always show a plan before executing destructive operations.**
7. **Use `git mv` to move files.**
8. **When in doubt about scope, ask.**

## Useful commands reference

```bash
supabase status
supabase db push
supabase functions deploy <name>
supabase secrets list
supabase secrets set KEY=value
git add . && git commit -m "message" && git push
```

## Contact and ownership

This project is owned and operated by Pablo Pirer.