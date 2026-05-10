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

### Day 6 — Complete (2026-05-08)
- `scripts/generate-content.sh weekly|monthly`: generates 3 variations via
  Anthropic, lets Pablo select one, saves as draft, optionally publishes.
- `scripts/publish-draft.sh <id>`: publishes a draft by ID.
- `prompts/weekly-digest.es.md` and `prompts/monthly-brief.es.md` added.
- Edge Function `get-publications`: verifies user JWT, checks subscribers
  table (plan=pro, status=active), returns allowed publications. Replaces
  PostgREST/RLS approach which broke after JWT key reset.
- Note: PostgREST RLS (auth.uid/auth.email) does not work reliably after
  a JWT key reset. Use Edge Functions for authenticated data access.

### Day 7 — Complete (2026-05-08)
- Full visual redesign of all pages in `/web`.
- Design system: Playfair Display (serif headlines) + Inter (body), card-based
  layout, `#F7F7F5` background, white cards with `#E5E5DF` borders, consistent
  header (`site-header` with border-bottom) and footer (`site-footer`) across
  all pages. Inspired by Miura Partners (miura.partners).
- All 8 pages updated: `index.html`, `pricing.html`, `about.html`,
  `sample.html`, `archive.html`, `request-received.html`, `success.html`,
  `cancel.html`.
- `styles.css` extended with shared components: `.card`, `.card-featured`,
  `.pub-card`, `.pub-body`, `.archive-bar`, `.text-input`, form styles,
  pricing grid, status page styles.
- Nav labels updated to Spanish (Muestra / Planes / Nosotros).
- All JavaScript in `sample.html` and `archive.html` preserved unchanged.

### Day 8 — Complete (2026-05-10)
- Email delivery of generated sample briefs validated end-to-end.
- `_shared/resend.ts` and the step 7 call in `sample-request/index.ts` were
  already implemented; the function was redeployed to include `resend.ts`.
- Full funnel confirmed: form → Edge Function → Anthropic → Supabase → Resend
  → user inbox.
- Note: web/mobile design remains a work in progress (not final).

### Day 10 — Complete (2026-05-10)
- Web/mobile design polish (Phase 2, Priority 3).
- `styles.css`: removed duplicate Google Fonts @import; `.grid` now 2-col
  at tablet (≤900px) and 1-col at mobile (≤600px); hero padding reduced on
  mobile; nav active state via `aria-current="page"`; `.card>.cta-group`
  margin moved from inline to CSS; added `.card--narrow`, `.pricing-card--featured`,
  `.status-page` refactored as centering modifier.
- Background: `#F7F7F5` → `#F4F0EA` (warmer cream/raw tone).
- Brand logo: 17px → 24px, color `#111111` → `#0D1F3C` (dark navy).
- Mobile container padding: increased to 32px at ≤600px (was 24px).
- `pricing.html`: rewritten with 2-plan structure (Free + Pro) per product
  decisions; uses `.pricing-grid`/`.pricing-card` classes; Basic and Team
  tiers removed.
- `cancel.html`: added 3-card info section (was the only page without one).
- `request-received.html`, `success.html`, `cancel.html`: `.status-page`
  modifier applied for centered hero layout.
- Inline `style="margin-top: 20px;"` removed from `.cta-group` across pages.
- `aria-current="page"` added to active nav links on `sample.html`,
  `pricing.html`, `about.html`.
- `archive.html`: inline `max-width` replaced with `.card--narrow` class.

### Day 9 — Complete (2026-05-10)
- Subscriber welcome email automated on new Pro subscriber registration.
- Edge Function `welcome-subscriber` deployed, triggered by Supabase Database
  Webhook on INSERT to `subscribers` where `plan = 'pro'`.
- Email includes: what they receive as Pro, archive access instructions
  (magic link steps), and URL to `archive.html`.
- Auth: custom `x-webhook-secret` header (not Authorization Bearer) to bypass
  Supabase gateway JWT validation. Secret stored as `WELCOME_SUBSCRIBER_SECRET`
  in function secrets. Function deployed with `--no-verify-jwt`.
- Full flow validated: Stripe → Make → subscribers INSERT → webhook →
  Edge Function → Resend → inbox + archive access confirmed.
- Note: Supabase Database Webhooks do NOT automatically send the service role
  key. Must configure custom headers manually in the Dashboard webhook editor.
  The `Authorization: Bearer` approach fails because Supabase gateway validates
  JWT format before reaching the function; use a custom header instead.

### Validated and working in production
- Public website hosted on GitHub Pages (files at repo root).
- Lead capture form → Edge Function → Supabase → Anthropic → Resend → inbox.
- Authenticated archive for Pro subscribers (magic link via Supabase Auth).
- Stripe Payment Link for the Pro plan (€249/month).
- Automated subscriber registration on Stripe webhook.
- Welcome email on new Pro subscriber registration (archive access instructions).
- 14 real leads, 4 active Pro subscribers, 7 generated briefs.

### Not yet built
- Recurring content engine (weekly digests, monthly briefs) — scripts exist
  but execution is manual; not yet scheduled or automated.
- Content publishing workflow automation (draft → published without manual step).
- Company Snapshot product (on-demand, see Product decisions below).
- LinkedIn distribution flow for snapshots.
- Web/mobile design finalization.

---

## Stack and architecture

### Current production stack
- **Frontend:** static HTML/CSS hosted on GitHub Pages, located in `/web`.
- **Database:** Supabase (PostgreSQL).
- **Automation:** Make (Integromat) — deactivated for sample-request; still
  active for Stripe webhook → subscribers registration.
- **Backend logic:** Supabase Edge Functions (TypeScript on Deno).
  - `sample-request` — lead capture, brief generation, email delivery.
  - `get-publications` — authenticated access to Pro publications.
  - `welcome-subscriber` — triggered on new Pro subscriber INSERT.
  - `_shared/` — `anthropic.ts`, `supabase.ts`, `resend.ts`.
- **Content generation:** Anthropic API (Claude Haiku `claude-haiku-4-5-20251001`).
- **Payments:** Stripe (Payment Links + webhooks → Make → Supabase).
- **Email:** Resend (`noreply@criterialsignals.com`, domain verified).

### Schema notes (audited 2026-05-08)
- `leads.interest_type` — nullable (was NOT NULL, fixed in Day 2 migration).
- `leads.email` — NOT NULL, unique constraint `leads_email_unique` added Day 2.
- `leads.source` — NOT NULL, default `sample_form`.
- `leads.status` — NOT NULL, default `new`.
- Always audit live schema before writing functions that insert/upsert data.

### Repository layout
```
/
├── CLAUDE.md
├── OPERATING_BLUEPRINT.md
├── README.md
├── .gitignore
├── /web
├── /supabase
│   ├── /functions
│   │   ├── /_shared            ← anthropic.ts, supabase.ts, resend.ts
│   │   ├── /sample-request     ← index.ts, types.ts, README.md
│   │   ├── /get-publications   ← index.ts
│   │   └── /welcome-subscriber ← index.ts
│   └── /migrations
├── /prompts
├── /scripts
└── /archive
```

---

## Current roadmap

### Phase 1 — Foundation (Days 1–10) ✅ Complete

All infrastructure, automation, and core flows are live and validated.

### Phase 2 — Content engine (next)

Goal: move from manual content generation to a reliable recurring operation.

**Priority 1 — Recurring content cadence**
- Establish a weekly rhythm using `scripts/generate-content.sh weekly`.
- Establish a monthly rhythm using `scripts/generate-content.sh monthly`.
- Decide: keep manual selection indefinitely, or add light scheduling later.
- No automation required yet — manual execution with the existing scripts is sufficient.

**Priority 2 — Publishing workflow**
- Clarify and document the draft → published step for each content type.
- Ensure `archive.html` displays new publications correctly after publish.
- Run `scripts/test-e2e.sh` after each publish cycle.

**Priority 3 — Web and design finalization** ✅ Complete (Day 10)
- All 8 pages audited and updated. Design system consistently applied.
- Pricing updated to Free + Pro (2-plan structure).
- Mobile responsiveness improved. Design is functional and coherent.
- Further polish remains possible but not blocking.

### Phase 3 — Growth and conversion

Goal: activate distribution and begin converting leads to Pro.

**Priority 1 — Company Snapshot (on-demand product)**
- Manual first: generate snapshots by hand using Anthropic, deliver by email.
- Validate demand and format before automating.
- Once validated: build Edge Function `company-snapshot` (similar to `sample-request`).
- Inputs: company name, context, requester email.
- Output: snapshot delivered by email + stored in `publications`.

**Priority 2 — LinkedIn distribution**
- Publish reduced snapshot formats on LinkedIn with CTA to get full version.
- Full version gated behind email capture (existing `sample-request` flow).
- Immediate upsell to Pro on `request-received.html`.
- No new infrastructure needed for initial manual validation.

**Priority 3 — Conversion optimization**
- Review copy and UX on `pricing.html` and `sample.html`.
- Clarify the Free vs Pro value gap more explicitly.
- Consider adding a social proof element (subscriber count, sample excerpt).

### Phase 4 — Robustness (ongoing, lower priority)

- Idempotency on Stripe webhook → subscribers (protect against duplicate events).
- Error handling and retry logic in Edge Functions.
- Alert on `generation_failed` sample requests.
- Migrate Stripe webhook from Make to a dedicated Edge Function
  (`stripe-webhook`) to remove the last Make dependency.

---

## Rules and restrictions

1. **Do not modify production database schema directly.** All schema changes go through SQL migrations under `/supabase/migrations`.
2. **Do not commit secrets.**
3. **Do not invent business logic.**
4. **Do not change Stripe configuration via code.**
5. **Always show a plan before executing destructive operations.**
6. **Use `git mv` to move files.**
7. **When in doubt about scope, ask.**

---

## Useful commands reference

```bash
supabase status
supabase db push
supabase functions deploy <name>
supabase secrets list
supabase secrets set KEY=value
git add . && git commit -m "message" && git push

# Content generation
scripts/generate-content.sh weekly
scripts/generate-content.sh monthly
scripts/publish-draft.sh <id>

# Monitoring
scripts/test-e2e.sh
scripts/funnel-metrics.sh
```

---

## Product decisions (May 2026)

### Plans
- Two plans: Free and Pro. No additional tiers for now.
- The gap between Free and Pro must be meaningful and clear to the user.
- Plans are individual-facing. Company affiliation is optional — captured
  via form field or inferred from corporate email domain.

### Recurring deliverables (Pro plan)
- Weekly digest and monthly brief, plus full access to the publications archive.
- Target audience: individual professionals — analysts, investors, M&A advisors.

### On-demand deliverables
- First on-demand product: **Company Snapshot** — an executive summary of a
  company with Iberian market context (competitive position, recent signals,
  relevant deal activity).
- Additional snapshot-type products may be added over time within the same
  area of expertise.
- Available as a standalone product and included in plans (with different
  conditions per plan tier).
- Dual audience: individual professionals and institutional teams (M&A
  boutiques, search funds, advisory firms).

### Distribution and lead acquisition strategy
- Snapshots published on LinkedIn in a reduced format with a CTA to get the
  full version.
- Full version delivered in exchange for an email address (lead capture),
  with immediate upsell to Pro.
- The snapshot serves simultaneously as a product, a marketing asset, and a
  lead generation mechanism.
- Initial validation will be done manually before automating the flow.

---

## Contact and ownership

This project is owned and operated by Pablo Pirer.