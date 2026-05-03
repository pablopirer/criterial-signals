# CLAUDE.md — Criterial Signals

This file provides context and guidance to Claude Code when working in this repository. Read this fully before taking any action.

## What is this project

Criterial Signals is a market intelligence product focused on Iberia (Spain and Portugal), targeting M&A boutiques, search funds, advisory firms, asset managers, and small investment teams. The product delivers concise written briefs covering deal activity, competitive moves, real estate, and capital markets signals.

It is currently an MVP in early validation. The repository contains the full system: public website, infrastructure-as-code, automation, and content generation.

## Project state (May 2026)

### Validated and working in production
- Public website hosted on GitHub Pages.
- Lead capture form with webhook integration.
- Automated lead and sample request registration in Supabase.
- Sample brief generation via OpenAI API.
- Stripe Payment Link for the Pro plan (€249/month).
- Automated subscriber registration on Stripe webhook.

### Not yet built
- Automated email delivery of generated samples.
- Authenticated access to premium content for subscribers.
- Recurring content engine (weekly digests, monthly briefs).
- Robust idempotency and deduplication.
- End-to-end testing of the funnel.
- Observability and conversion dashboards.

For the full operating context, see `OPERATING_BLUEPRINT.md` at the repository root.

## Stack and architecture

### Current production stack
- **Frontend:** static HTML/CSS hosted on GitHub Pages, located in `/web`.
- **Database:** Supabase (PostgreSQL).
- **Automation:** Make (Integromat) — being migrated out, see roadmap.
- **Content generation:** OpenAI API — being migrated to Anthropic API on Day 2.
- **Payments:** Stripe (Payment Links + webhooks).
- **Email (planned):** Resend.

### Target stack after migration
- **Frontend:** unchanged (static HTML/CSS on GitHub Pages) until Day 4 of the migration plan.
- **Backend logic:** Supabase Edge Functions (TypeScript on Deno), replacing all Make scenarios.
- **LLM provider:** Anthropic API (Claude models), called from Edge Functions. Replaces OpenAI.
- **Schema management:** versioned SQL migrations under `/supabase/migrations`.
- **Prompt management:** versioned prompts under `/prompts`, loaded by a thin TypeScript client.
- **Observability:** scripts under `/scripts` that aggregate Supabase + Stripe + Anthropic metrics.

### Repository layout
```
/
├── CLAUDE.md                 ← this file
├── OPERATING_BLUEPRINT.md    ← business and product context
├── README.md                 ← public-facing project README
├── .gitignore
├── /web                      ← public website (GitHub Pages)
├── /supabase                 ← migrations, config, edge function scaffolding
├── /functions                ← Supabase Edge Functions (TypeScript)
├── /prompts                  ← versioned LLM prompts (Markdown)
├── /scripts                  ← operational and observability scripts
└── /docs
    └── /backups              ← snapshots of pre-migration state (Make, Stripe, Supabase)
```

## Conventions

### Language
- Code: **TypeScript** for everything backend (Edge Functions, scripts, prompt loaders).
- Prompts: **Spanish** for content delivered to end users (the product is Spanish-language).
- Code comments and commit messages: **English**.
- User-facing copy on the website: **Spanish**.

### Code style
- Prefer explicit and verbose code over clever shortcuts. The owner is learning TypeScript.
- Add JSDoc-style comments to every exported function explaining what it does and what each parameter is for.
- Avoid premature abstraction. Inline duplication is acceptable in early-stage code.
- Always handle errors explicitly. Never swallow exceptions silently.

### Database conventions
- Tables in `snake_case` plural (e.g. `leads`, `subscribers`, `publications`).
- Columns in `snake_case`. Always include `id`, `created_at`. Use `updated_at` where mutation is expected.
- Migrations are immutable once committed. Never edit a previous migration; create a new one.

### Git and commits
- Branch model: trunk-based on `main`. Feature work in short-lived branches when needed.
- Commit messages in English, imperative mood. Example: `Add edge function for sample request handling`.
- Commit small, logical units. Avoid mixing reorganization with feature work in a single commit.

## Current roadmap

The migration plan from Make/manual orchestration to a versioned, code-managed funnel. We are at Day 1.

- **Day 1 (in progress):** Repo reorganization, backups, CLAUDE.md, gitignore.
- **Day 2:** Migrate Make scenarios to Supabase Edge Functions. Replace OpenAI with Anthropic API for content generation. Add Resend for email delivery of samples. Implement webhook signature verification and idempotency.
- **Day 3:** Versioned prompts directory. Recurring content engine (weekly digest cron).
- **Day 4:** Authenticated access to publications via Supabase Auth + Row-Level Security. Update `/web/archive.html` to render real content for subscribers.
- **Day 5:** End-to-end test harness. Observability script for funnel metrics.

The owner of this project has a finance background (M&A, FP&A, private equity) and is intermediate-level on technical execution. Explanations should be clear and contextual, not just code dumps.

## Rules and restrictions

These rules override anything else. Follow them strictly.

1. **Do not modify production database schema directly.** All schema changes go through SQL migrations under `/supabase/migrations`, applied via Supabase CLI.

2. **Do not delete or reorganize the existing Make scenarios in production until Day 2 work is complete and tested.** Make is currently the live orchestrator. Removing it before the replacement is validated breaks the funnel.

3. **Do not modify `/web` HTML files until Day 4.** The public website is live. Changes to it require a separate, deliberate decision.

4. **Do not commit secrets.** No API keys, no passwords, no Stripe keys, no Supabase service-role keys, no Anthropic or OpenAI keys in code. Use environment variables. The `.gitignore` enforces this.

5. **Do not invent business logic.** If a decision is not specified in `OPERATING_BLUEPRINT.md` or the current task description, ask the owner before assuming. The product spec is the source of truth.

6. **Do not change the Stripe price or product configuration via code.** Stripe configuration is managed in the Stripe Dashboard for now. Changes to billing are explicit business decisions.

7. **Always show a plan before executing destructive operations** (deletions, migrations, config changes). Wait for explicit approval.

8. **Use `git mv` to move files**, never plain `mv`, so history is preserved.

9. **When in doubt about scope, ask.** It is better to clarify than to over-deliver and force a rollback.

## Useful commands reference

```bash
# Supabase
supabase status
supabase db dump --schema public
supabase functions new <name>
supabase functions serve <name>

# Stripe (test mode)
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
stripe trigger checkout.session.completed

# Local development
cd ~/projects/criterial-signals
```

## Contact and ownership

This project is owned and operated by Pablo Pirer.