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
- Soft cutover: Make still running. Web form still points to Make webhook.
- Resend email delivery deferred to a second pass.

### Validated and working in production
- Public website hosted on GitHub Pages.
- Lead capture form with webhook integration (still via Make).
- Automated lead and sample request registration in Supabase.
- Sample brief generation via Anthropic API (Claude Haiku).
- Stripe Payment Link for the Pro plan (€249/month).
- Automated subscriber registration on Stripe webhook.

### Not yet built
- Automated email delivery of generated samples (Resend — Day 2 second pass).
- Authenticated access to premium content for subscribers.
- Recurring content engine (weekly digests, monthly briefs).
- End-to-end testing of the funnel.
- Observability and conversion dashboards.

## Stack and architecture

### Current production stack
- **Frontend:** static HTML/CSS hosted on GitHub Pages, located in `/web`.
- **Database:** Supabase (PostgreSQL).
- **Automation:** Make (Integromat) — still live, pending cutover validation.
- **Backend logic:** Supabase Edge Functions (TypeScript on Deno) — `sample-request` deployed.
- **Content generation:** Anthropic API (Claude Haiku `claude-haiku-4-5-20251001`).
- **Payments:** Stripe (Payment Links + webhooks).
- **Email (planned):** Resend.

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
- **Day 2:** Complete. Edge Function deployed and validated. Resend deferred.
- **Day 3:** Cutover web form to Edge Function. Add Resend email delivery.
- **Day 4:** Authenticated access via Supabase Auth + RLS. Update `/web/archive.html`.
- **Day 5:** End-to-end test harness. Observability script for funnel metrics.

## Rules and restrictions

1. **Do not modify production database schema directly.** All schema changes go through SQL migrations under `/supabase/migrations`.
2. **Do not deactivate Make scenarios until Day 3 cutover is validated.**
3. **Do not commit secrets.**
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