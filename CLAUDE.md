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

### Day 11 — Complete (2026-05-10)
- Mobile-specific audit and fixes (second pass, all 8 pages).
- Root bug fixed: `.hero`, `.section`, `.site-footer` used 3-value padding
  shorthand (`padding: X 0 X`) which silently set horizontal padding to 0,
  overriding `.container`'s lateral padding on every page at every viewport
  < 1080px. Fixed by switching to explicit `padding-top`/`padding-bottom`
  on all 7 affected declarations (base + ≤900px + ≤600px breakpoints).
- iOS Safari zoom fix: form inputs, selects, and textareas set to
  `font-size: 16px` at ≤600px (< 16px triggers automatic zoom on iOS).
- Tap targets: `.btn` padding increased to `14px 22px` at ≤600px (~45px
  height, meets 44px Apple HIG / WCAG minimum).
- `.pricing-card` padding reduced to 20px at ≤600px (was 28px, now matches
  `.card`).
- Section spacing on mobile reduced to `8px 0 20px` to eliminate "floating
  cards" effect caused by 56px inter-section gap (36px bottom + 20px top).
- Form labels increased to `font-size: 14px` at ≤600px.
- `h1` `line-height` set to `1.2` at ≤600px for Playfair Display wrapped
  headings.
- Form inputs set to `max-width: 100%` at ≤600px.
- Note: never use 3-value `padding: X 0 X` shorthand on elements that also
  carry `.container` — it zeroes out the horizontal padding by cascade.
  Always use `padding-top` / `padding-bottom` for layout classes.

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

### Day 12 — Complete (2026-05-15)
- Model upgraded from `claude-haiku-4-5-20251001` to `claude-sonnet-4-6` in
  `_shared/anthropic.ts`. `max_tokens` raised from 1024 to 2048.
- `SAMPLE_BRIEF_PROMPT` rewritten in `sample-request/index.ts`:
  - System prompt now instructs the model to return ONLY valid JSON with a
    fixed schema: `titulo`, `subtitulo`, `tags`, `snapshot`, `signals[]`,
    `watch[]`. Focus narrowed to Spain only (Portugal/Iberia removed).
  - User prompt simplified to one line plus a temporal anchor (Mayo 2026).
- Step 6 in `sample-request/index.ts` now parses the JSON response from
  Anthropic before persisting. If parse fails, logs raw text and sets
  `status = generation_failed`. If successful, builds `body_markdown` and
  `title` from the parsed fields.
- `_shared/resend.ts` updated:
  - New `BriefData` interface exported (mirrors the JSON schema above).
  - `SendBriefEmailInput.briefText` replaced by `briefData: BriefData`.
  - New `buildBriefHtml()` function generates a full HTML email template
    (table-based, inline styles, mobile-compatible) with header, snapshot,
    signals, watch, and CTA to pricing page.
  - `sendBriefEmail` now sends both `text` (plain) and `html` versions.
- Full funnel validated end-to-end: form → Edge Function → Anthropic (JSON)
  → parse → Supabase → Resend (HTML email) → inbox. Confirmed working.
- Note: `_shared/anthropic.ts` model can be overridden at runtime via the
  `ANTHROPIC_MODEL` env var without redeploying.

### Day 14 — Complete (2026-05-16)
- Web restructurada como site de firma analítica (Criterial) en lugar de producto editorial.
- Nueva arquitectura de navegación: Signals / Advisory / Nosotros.
- `index.html` reescrito como home de firma: posicionamiento analítico, servicios de
  Advisory y Criterial Signals como producto editorial.
- `about.html` reescrito como presentación de firma independiente especializada en
  mercado español de inversión privada.
- `pricing.html` reescrito como página de Signals con planes Free y Pro (9,90 €/mes).
- `encargos.html` creado y renombrado conceptualmente a Advisory: hero, tres servicios
  (Valoración de empresa, Análisis sectorial, Pitch deck) y formulario de contacto.
- `advisory-received.html` creado como página de confirmación post-formulario.
- `sample.html`, `request-received.html`, `success.html`, `cancel.html` actualizados
  con copy alineado a la nueva arquitectura.
- Brand actualizado a Criterial en header de todas las páginas.
- Footer actualizado a Criterial en todas las páginas.
- CNAME añadido: criterialsignals.com operativo en GitHub Pages.
- HTTPS activo tras propagación del certificado SSL de GitHub Pages.
- Edge Function `advisory-request` desplegada: valida payload, envía email de
  notificación interna a pablopirer@gmail.com y confirmación al usuario vía Resend.
- Templates HTML añadidos a todos los emails: advisory confirmación, advisory interno
  y welcome suscriptor Pro. Sistema visual consistente con el email del sample brief.
- Payment Link de Stripe actualizado a 9,90 €/mes (modo test). URL actualizada en
  `pricing.html` y `sample.html`.
- Supabase Auth URL Configuration actualizada: Site URL y Redirect URL apuntan a
  `https://criterialsignals.com/archive.html`.
- Make `stripe-subscription-mvp`: URL actualizada con `?on_conflict=email` y header
  `Prefer` con `resolution=merge-duplicates,return=representation` para evitar fallos
  por email duplicado.
- `_shared/resend.ts` actualizado con `buildWelcomeHtml`, `buildAdvisoryConfirmationHtml`,
  `buildAdvisoryInternalHtml` y `sendAdvisoryEmails`.

### Day 13 — Complete (2026-05-15)
- Model upgraded from `claude-sonnet-4-6` (previously `claude-haiku-4-5-20251001`) in
  `_shared/anthropic.ts`. `max_tokens` raised from 1024 to 2048.
- `SAMPLE_BRIEF_PROMPT` rewritten in `sample-request/index.ts`:
  - System prompt instructs the model to return ONLY valid JSON with a fixed schema:
    `titulo`, `subtitulo`, `tags`, `snapshot`, `signals[]`, `watch[]`.
  - Focus narrowed to Spain only (Portugal/Iberia removed from scope).
  - User prompt includes temporal anchor (Mayo 2026) with instructions to use
    coherent date references and qualify estimates with "aproximadamente" or "en torno a".
- Step 6 in `sample-request/index.ts` parses the JSON response from Anthropic before
  persisting. If parse fails, logs raw text and sets `status = generation_failed`.
- `_shared/resend.ts` updated:
  - New `BriefData` interface exported (mirrors the JSON schema above).
  - `SendBriefEmailInput.briefText` replaced by `briefData: BriefData`.
  - New `buildBriefHtml()` function generates a full HTML email template
    (table-based, inline styles, mobile-compatible) with header, snapshot,
    signals, watch, and CTA to pricing page.
  - `sendBriefEmail` now sends both `text` (plain) and `html` versions.
- Full funnel validated end-to-end: form → Edge Function → Anthropic (JSON)
  → parse → Supabase → Resend (HTML email) → inbox. Confirmed working.
- Product decision: scope narrowed to Spanish market only. "Ibérico/ibérica"
  removed from all prompts. "Iberia" acceptable only when geographically relevant.
  Portugal excluded from product scope for now.

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
  - `advisory-request` — formulario de contacto Advisory, notificación interna y confirmación al usuario.
  - `_shared/` — `anthropic.ts`, `supabase.ts`, `resend.ts`.
- **Content generation:** Anthropic API (Claude Haiku `claude-haiku-4-5-20251001`).
- **Payments:** Stripe (Payment Links + webhooks → Make → Supabase). Plan Pro: 9,90 €/mes (test mode).
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
├── CNAME
├── *.html                      ← index, about, pricing, sample, archive, encargos, advisory-received, request-received, success, cancel
├── styles.css
├── /supabase
│   ├── /functions
│   │   ├── /_shared            ← anthropic.ts, supabase.ts, resend.ts
│   │   ├── /sample-request     ← index.ts, types.ts, README.md
│   │   ├── /get-publications   ← index.ts
│   │   ├── /welcome-subscriber ← index.ts
│   │   └── /advisory-request   ← index.ts
│   └── /migrations
├── /prompts
├── /scripts
└── /archive
```

---

## Current roadmap

### Phase 1 — Foundation (Days 1–11) ✅ Complete

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

**Priority 3 — Web and design finalization** ✅ Complete (Days 10–11)
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

- ~~Idempotency on Stripe webhook → subscribers~~ ✅ Resolved Day 14 via upsert in Make (on_conflict=email).
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
8. **Always include explicit GRANTs in new migrations.** From May 30 2026, new Supabase projects do not expose public schema tables to the Data API by default. Any migration that creates a new table must include explicit GRANT statements for `anon`, `authenticated`, and `service_role` as needed, plus RLS enabled. Example in `/supabase/migrations/`.

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

### Advisory
- Tres servicios activos: Valoración de empresa, Análisis sectorial, Pitch deck.
- Contacto vía formulario web (`encargos.html`) con notificación interna a
  `pablopirer@gmail.com` y confirmación automática al usuario.
- Email de notificación interna temporal a Gmail personal — pendiente migrar a
  cuenta Criterial cuando esté lista.

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