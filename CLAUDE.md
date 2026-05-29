# CLAUDE.md — Criterial

This file provides context and guidance to Claude Code when working in this repository. Read this fully before taking any action.

---

## 0. Source of truth policy

- **CLAUDE.md** (this file) is the operational and technical source of truth. It covers architecture, flows, rules, and commands.
- **OPERATING_BLUEPRINT.md** is the business and strategy reference. It covers positioning, product vision, and priorities.
- **README.md** is public-facing and may lag behind current state. Do not rely on it for operational decisions.
- If historical changelog (§8) conflicts with §1–§7, current state (§1–§7) wins.

---

## 1. Current state

### What Criterial is
Criterial is an independent analytical firm specialised in the Spanish private investment market. It is currently an MVP in early validation.

Two active business lines:
- **Advisory** — analytical work on demand: company valuations, sector analysis, pitch decks.
- **Criterial Signals** — editorial intelligence product: Weekly Signals and Brief Mensual covering M&A, PE/VC, deuda privada, and liquidity events in the Spanish mid-market. Real estate excluded from scope.

### Geographic and product scope
**Spain only.** Portugal and Iberia references in the historical changelog (§8) reflect earlier scope that was narrowed. Do not treat them as current.

### Domain and hosting
- Public site: **https://criterialsignals.com**
- Hosted on GitHub Pages, custom domain via CNAME.
- HTTPS active.

### Pricing
- Free plan: free.
- Pro plan: **9,90 €/mes** (currently in Stripe test mode).
- No other tiers.

### Content engine status
Manual. Scripts exist (`scripts/generate-content.sh`, `scripts/publish-draft.sh`) but execution is not scheduled or automated.

### Production snapshot (last documented: 2026-05-29)
- 16 leads captured (all status `new`; none contacted or converted)
- 1 active Pro subscriber (previous count of ~4 was incorrect or reflects cancellations — verify in Stripe before using for commercial claims)
- 0 publications published; 0 drafts (reset completo ejecutado 2026-05-29 — el weekly generado en la sesión está pendiente de revisión visual antes de publicar)
- 32 sample requests total: 18 generated successfully, 2 `generation_failed` (users did not receive email), 0 queued
- `criterial-shared.js` confirmed at `?v=3` in all 10 active HTML files (open item from §7 closed 2026-05-29)
- Reset completo de publicaciones ejecutado 2026-05-29. El sistema de contenido ha sido refactorizado — ver §2 y §8.

> **These counts are sourced from `scripts/funnel-metrics.sh` run on 2026-05-29. Verify against Supabase before use in public copy, reporting, or commercial claims.**

---

## 2. Active architecture

### Frontend
- Static HTML + CSS at the **repository root** (not `/web` — that location is obsolete).
- Active HTML pages: `index.html`, `pricing.html`, `about.html`, `sample.html`, `archive.html`, `encargos.html`, `advisory-received.html`, `request-received.html`, `success.html`, `cancel.html`.
- Active CSS: **`styles.v4.css`** — loaded by all HTML pages. `styles.css` remains in the repo but is not loaded by any page.
- Shared JS: **`criterial-shared.js`** — cursor, parallax, scroll reveal, page transition. Loaded via `<script src="criterial-shared.js?v=N">`. The `?v=N` parameter must be bumped in all HTML files whenever `criterial-shared.js` is updated. See §7 for the open item on current version state.
- Design system: EB Garamond + Inter, hero parallax landscapes, custom cursor with `mix-blend-mode: difference`.

### GitHub Pages
- Repo root serves the public site.
- Custom domain: `criterialsignals.com` (CNAME at repo root).
- GitHub Pages caches CSS and JS aggressively — see §7.

### Supabase
- PostgreSQL database.
- Supabase Auth: magic link for archive access. Site URL and redirect URL: `https://criterialsignals.com/archive.html`.
- Edge Functions (TypeScript/Deno) in `/supabase/functions/`:

| Function | Role |
|---|---|
| `sample-request` | Lead capture, brief generation (Anthropic), email delivery (Resend) |
| `advisory-request` | Advisory form: internal notification + user confirmation |
| `stripe-webhook` | Stripe event receiver: verifies signature, upserts `subscribers` |
| `welcome-subscriber` | Triggered by DB Webhook on INSERT to `subscribers` (plan=pro) |
| `get-publications` | Authenticated access to Pro publications |
| `generate-content` | Generación de Weekly y Brief Mensual desde admin.html (web search + HTML semántico) |
| `admin-publications` | CRUD publicaciones y métricas. Acceso restringido a `pablopirer@gmail.com` |
| `_shared/anthropic.ts` | Shared Anthropic client |
| `_shared/supabase.ts` | Shared Supabase client |
| `_shared/resend.ts` | HTML email templates and send helpers |

### Anthropic
- Model: **`claude-sonnet-4-6`**
- Runtime override: set the `ANTHROPIC_MODEL` environment variable (no redeploy needed).
- `max_tokens`: 2048 (sample-request Edge Function); 4000 (content generation script and generate-content Edge Function).
- Brief output schema for sample-request: `{ titulo, subtitulo, tags, snapshot, signals[], watch[] }` (JSON).
- Web search habilitado en generación de contenido via tools: `[{type: 'web_search_20250305', max_uses: 5}]`. El modelo busca noticias reales antes de generar el HTML.

### Resend
- Sender: `noreply@criterialsignals.com` (domain verified).
- Templates: sample brief HTML, advisory confirmation, advisory internal, welcome subscriber, Supabase magic link.

### Stripe
- Product: Criterial Signals Pro, 9,90 €/mes (test mode).
- Webhook event: `checkout.session.completed` → Edge Function `stripe-webhook`.
- Post-payment redirect: `success.html`.
- Subscriber upsert: on conflict `email` (idempotent).

### Make
**Deactivated.** No active production flow depends on Make. All flows are handled by Supabase Edge Functions.

### Repository layout
```
/
├── CLAUDE.md
├── OPERATING_BLUEPRINT.md
├── README.md
├── .gitignore
├── CNAME
├── *.html                      ← index, about, pricing, sample, archive, encargos,
│                                  advisory-received, request-received, success, cancel
├── styles.v4.css               ← active CSS (styles.css present in repo but not loaded)
├── criterial-shared.js         ← shared visual effects module
├── /supabase
│   ├── /functions
│   │   ├── /_shared            ← anthropic.ts, supabase.ts, resend.ts
│   │   ├── /sample-request     ← index.ts, types.ts
│   │   ├── /get-publications   ← index.ts
│   │   ├── /welcome-subscriber ← index.ts
│   │   ├── /advisory-request   ← index.ts
│   │   ├── /stripe-webhook     ← index.ts
│   │   ├── /generate-content   ← index.ts (generación desde admin web)
│   │   └── /admin-publications ← index.ts (CRUD publicaciones, métricas)
│   └── /migrations
├── /prompts
├── /scripts
└── /archive
```

### Publication content system
- El contenido generado es **HTML semántico** con clases CSS `pub-*`, no markdown.
- El campo `body_markdown` en Supabase almacena HTML (el nombre es legacy — no renombrar sin migración).
- Las clases `pub-*` están definidas en `styles.v4.css` bajo el bloque `Publication content — Weekly & Monthly`.
- El modelo genera HTML directamente siguiendo la estructura definida en los prompts (`prompts/weekly-digest.es.md`, `prompts/monthly-brief.es.md`).
- `admin.html` renderiza el HTML directamente (sin marked.js) en el modal de previsualización.
- `archive.html` renderiza el HTML directamente (sin marked.js) en el modal de lectura.

### Schema notes
- `leads.interest_type` — nullable.
- `leads.email` — NOT NULL, unique index on `lower(email)`.
- `leads.source` — NOT NULL, default `sample_form`.
- `leads.status` — NOT NULL, default `new`.
- Always audit live schema before writing functions that insert/upsert data.

---

## 3. Production flows

### 3.1 Sample request
- **Entry point:** `sample.html` form submission.
- **UX:** form redirects immediately to `request-received.html` (~800ms). The backend call is fire-and-forget — generation and email happen asynchronously.
- **Edge Function:** `sample-request`
- **Services touched:** Supabase (`leads`, `sample_requests`, `publications`), Anthropic (JSON brief generation), Resend (HTML email to user).
- **Side effects:** lead upserted in `leads`; brief stored as draft in `publications`; email sent to user.
- **Request headers:** `sample.html` posts to the Edge Function with `Authorization: Bearer <anon/publishable key>` and `x-criterial-signal: <shared secret>`. These headers must stay aligned between `sample.html`, the Edge Function validation logic, and `scripts/test-e2e.sh`. Do not change one without updating all three.
- **Caveats:** If Anthropic returns invalid JSON, `status = generation_failed` is logged and no email is sent. Monitor `sample_requests` for `generation_failed` records.

### 3.2 Advisory request
- **Entry point:** `encargos.html` form submission.
- **Edge Function:** `advisory-request`
- **Services touched:** Resend only (no database write).
- **Side effects:** internal notification email to `criterialam@gmail.com`; confirmation email to user.
- **Request headers:** `encargos.html` posts to the Edge Function with `Authorization: Bearer <anon/publishable key>` and `x-criterial-signal: <shared secret>`. These headers must stay aligned with the Edge Function validation logic.
- **Caveats:** Internal email goes to a personal Gmail — temporary until a Criterial account is set up.

### 3.3 Stripe subscription
- **Entry point:** `pricing.html` → Stripe Payment Link → Stripe Checkout.
- **Post-payment:** Stripe redirects to `success.html`; Stripe fires `checkout.session.completed` webhook.
- **Edge Function:** `stripe-webhook` (verifies `STRIPE_WEBHOOK_SECRET` signature).
- **Services touched:** Supabase (`subscribers` upsert on conflict=email).
- **Side effects:** subscriber record created or updated.
- **Caveats:** Stripe webhook must be configured in the Stripe Dashboard to point to the `stripe-webhook` Edge Function URL. Test mode is active; real payments are not processed.

### 3.4 Welcome subscriber
- **Trigger:** Supabase Database Webhook on INSERT to `subscribers` where `plan = 'pro'`.
- **Edge Function:** `welcome-subscriber` (deployed with `--no-verify-jwt`).
- **Services touched:** Resend.
- **Side effects:** welcome email to new Pro subscriber with archive access instructions.
- **Secret convention:** env var `WELCOME_SUBSCRIBER_SECRET`; configure the Supabase Dashboard webhook with custom header `x-webhook-secret: <WELCOME_SUBSCRIBER_SECRET>`.
- **Caveats:** Do not use `Authorization: Bearer` for this webhook — the Supabase gateway validates JWT format before the request reaches the function, so Bearer auth fails for DB webhooks. Custom header (`x-webhook-secret`) is the required approach. Custom headers must be configured manually in the Dashboard webhook editor; they are not set automatically.

### 3.5 Archive Pro
- **Entry point:** `archive.html` → Supabase Auth magic link login.
- **Edge Function:** `get-publications`
- **Services touched:** Supabase Auth (JWT verification), Supabase DB (`publications` query, `subscribers` plan check).
- **Frontend libraries:** `archive.html` uses the Supabase JS SDK (auth + data fetch). HTML content is rendered directly as innerHTML — marked.js removed 2026-05-29.
- **Side effects:** none (read-only).
- **Access rules:** plan=pro AND status=active in `subscribers`; publications with status=published and type in (weekly, monthly, sample).
- **Caveats:** PostgREST/RLS is NOT the active path for publication access — it was found unreliable after a JWT key reset (see §8, Day 6). `get-publications` Edge Function is the authoritative path.

### 3.6 Manual content generation (terminal script)
- **Entry point:** developer runs script locally.
- **Scripts:** `scripts/generate-content.sh weekly|monthly` (generates 1 Anthropic variation with web search, prompts for confirmation, saves as draft); `scripts/publish-draft.sh <id>` (sets status=published).
- **Services touched:** Anthropic API (web search + HTML generation), Supabase.
- **Side effects:** new publication record inserted in `publications`; after publish, appears in archive for Pro subscribers.
- **Preview:** `admin.html` has a "Previsualizar" button on each card that opens a modal with the rendered HTML content. Allows review before publishing.
- **Caveats:** Execution is manual and not scheduled. Requires approval before running in production. Use as fallback if `generate-content` Edge Function fails.

### 3.7 Content generation (admin web)
- **Entry point:** `admin.html` → botón "Generar Weekly" o "Generar Brief Mensual".
- **Edge Function:** `generate-content`
- **Services touched:** Anthropic API (claude-sonnet-4-6, web search habilitado, max_tokens=4000), Supabase (`publications` insert).
- **Flow:** genera 1 variación con web search → muestra en admin → Pablo selecciona → guarda como draft → previsualiza → publica.
- **Side effects:** nueva publicación en `publications` con status=draft.
- **Script alternativo:** `scripts/generate-content.sh weekly|monthly` — mismo resultado desde terminal. Fallback validado si la Edge Function falla.
- **Rate limit:** el web search consume tokens adicionales. Con el tier actual (30.000 tokens/min), solo 1 variación por llamada es viable sin rate limit error.
- **Caveats:** la Edge Function `generate-content` presentaba errores al final de la sesión 2026-05-29. El script de terminal es el path validado hasta que se diagnostique.

---

## 4. Rules and restrictions

1. **Do not modify production database schema directly.** All schema changes go through SQL migrations under `/supabase/migrations`.
2. **Always include explicit GRANTs in new migrations.** New Supabase projects (from May 2026) do not expose public schema tables to the Data API by default. Any migration that creates a new table must include explicit GRANT statements for `anon`, `authenticated`, and `service_role` as needed, plus RLS enabled.
3. **Do not commit secrets.** Secrets are set via `supabase secrets set`. Never read or expose `.env.local`.
4. **Do not invent business logic.**
5. **Do not change Stripe configuration via code.**
6. **Always show a plan before executing destructive operations.**
7. **Use `git mv` to move files.**
8. **When in doubt about scope, ask.**
9. **Claude Code is the official executor.** All code, CSS, and HTML changes must go through Claude Code. Do not edit files directly from the terminal outside Claude Code, except git commands, shell diagnostics, or utility commands.
10. **Do not deploy, push, or commit without explicit user approval.**
11. **Default operating workflow.** Claude Code executes scoped tasks end-to-end (branch → edit → checks → commit → push → PR). Hermes acts as read-only auditor/reviewer for high-risk or production-sensitive changes. Terminal Ubuntu should be used mainly for final production actions, final verification, emergency recovery, or when Claude Code cannot perform a task. Avoid slow manual step-by-step terminal workflows for changes that Claude Code can handle safely.
12. **Explicit approval required for production actions.** The following require explicit approval before execution: deploying Supabase functions; running `scripts/generate-content.sh` or `scripts/publish-draft.sh`; publishing a draft publication; pushing directly to main; modifying Stripe, Resend, Supabase dashboard, DNS, GitHub Pages settings, or secrets.
13. **Never rename `body_markdown` without a migration.** The field stores HTML since the 2026-05-29 refactor. The name is legacy. Renaming requires a SQL migration and updates to all Edge Functions and scripts that reference it.
14. **Publication content is HTML, not markdown.** Do not pass `body_markdown` content through marked.js or any markdown parser. Render it directly as innerHTML.
15. **`pub-*` CSS classes are the design system for publication content.** Do not inline styles in generated HTML. All styling goes through `styles.v4.css` pub-* classes.

---

## 5. Current roadmap

### In progress / next
- **Recurring content cadence** — establish weekly rhythm (`generate-content.sh weekly`) and monthly rhythm (`generate-content.sh monthly`). Manual execution is sufficient for now; no automation required yet. The ID-capture bug (original `supabase db query` path) was fixed in commit `7fb732a` (replaced with direct REST API call) and validated 2026-05-29: INSERT returns HTTP 201 with the publication ID correctly. Script is safe to run.
- **Advisory validation** — get first real Advisory engagement. Validate format and deliverables with a real client.

### Medium term
- **Email delivery of weekly signal to Pro subscribers** — currently the weekly is only accessible via `archive.html` after login. As the subscriber base grows, pushing the weekly to their inbox reduces friction. Requires a new email template and a send-to-subscribers script or Edge Function. No urgency at current scale.
- **Company Snapshot** — first on-demand product. Manual first (generate via Anthropic, deliver by email). Once validated, build Edge Function `company-snapshot`. Inputs: company name, context, requester email. Output: snapshot delivered by email + stored in `publications`.
- **LinkedIn distribution** — publish reduced snapshot format on LinkedIn with CTA to get full version. Lead capture via existing `sample-request` flow. No new infrastructure needed for initial validation.
- **Conversion optimisation** — review copy and UX on `pricing.html` and `sample.html`; clarify Free vs Pro value gap.

### Robustness (ongoing, lower priority)
- Alert on `generation_failed` sample requests — the only silent failure that affects the end user directly (they see the confirmation page but receive no email). Higher priority than generic error handling.
- Error handling and retry logic in Edge Functions.
- Migrate internal Advisory notification email from personal Gmail to a Criterial account.

---

## 6. Operational commands reference

### Safe diagnostics (no side effects)
```bash
pwd
git status --short
git branch --show-current
git log --oneline -10
supabase status
supabase secrets list
scripts/funnel-metrics.sh
scripts/test-e2e.sh
# GitHub Actions keep-alive workflow: .github/workflows/keep-alive.yml (runs every 5 days, also manual via workflow_dispatch)
```

### Requires explicit approval before running
```bash
supabase db push                          # applies pending migrations to production
supabase functions deploy <name>          # deploys Edge Function to production
supabase secrets set KEY=value            # sets production secret
git add <files> && git commit -m "..."    # commits changes
git push                                  # pushes to remote / triggers GitHub Pages deploy
```

### Production side effects — confirm scope carefully
```bash
scripts/generate-content.sh weekly        # calls Anthropic API; writes DB record
scripts/generate-content.sh monthly       # calls Anthropic API; writes DB record
scripts/publish-draft.sh <id>             # sets publication status=published; immediately visible to Pro subscribers
```

---

## 7. Known risks and pitfalls

### GitHub Pages CSS caching
GitHub Pages caches CSS aggressively. A `?v=X` query parameter on the `href` does **not** invalidate the cache. To force invalidation, rename the CSS file (e.g. `styles.v4.css` → `styles.v5.css`), update all HTML references, then commit and push.

### Active CSS file ambiguity
The active CSS file is **`styles.v4.css`**. `styles.css` remains in the repo but is not loaded by any page. Do not edit `styles.css` expecting it to affect the live site.

### `criterial-shared.js` cache versioning
When `criterial-shared.js` is updated, the `?v=N` query parameter in all HTML `<script>` tags must be bumped in the same commit. Current version: `?v=3` — verified consistent across all 10 active HTML files on 2026-05-29.

### PostgREST/RLS unreliable after JWT key reset
`auth.uid()` / `auth.email()` in RLS policies do not work reliably after a Supabase JWT key reset. Use Edge Functions for all authenticated data access. `get-publications` is the active path for archive access — not PostgREST/RLS.

### Supabase key strategy
Use the publishable key (`sb_publishable_...`) for Supabase JS SDK calls in the frontend. Legacy anon JWT keys may still appear in older code paths (Edge Function bearer calls, older frontend initialisations). Before modifying any auth flow or frontend Supabase initialisation, verify which key is currently in use to avoid breaking authentication.

### Supabase Database Webhooks and custom headers
Database Webhooks do not automatically send the service role key. `Authorization: Bearer` fails because the Supabase gateway validates JWT format before reaching the function. Use a custom header (e.g. `x-webhook-secret`) and deploy the target function with `--no-verify-jwt`.

### `welcome-subscriber` custom-header trust
If updating `welcome-subscriber`, trust the documented custom-header flow (`x-webhook-secret: <WELCOME_SUBSCRIBER_SECRET>`) over any old code comments claiming service-role `Authorization: Bearer` is the mechanism. The Bearer approach was superseded — Supabase gateway rejects it before the function is reached.

### Fire-and-forget sample request UX
`sample.html` redirects to `request-received.html` immediately (~800ms). The Anthropic brief generation and Resend email delivery happen asynchronously in the background. If generation fails, the user has already been redirected and sees the confirmation page. Monitor `sample_requests` for `generation_failed` status.

### Email delivery side effects
Email is sent by Edge Functions (`sample-request`, `welcome-subscriber`, `advisory-request`) in response to real events. Do not trigger these flows in testing without being prepared for real emails to be sent to real addresses.

### Stripe side effects
Any real-mode Stripe webhook event will upsert a subscriber record in production. Test mode is currently active. Stripe configuration must not be changed via code.

### CSS `padding` shorthand on `.container` elements
Never use 3-value `padding: X 0 X` shorthand on elements that also carry `.container`. It zeroes out horizontal padding, overriding `.container`'s lateral padding at all viewports. Always use `padding-top` / `padding-bottom` separately for layout classes.

### Custom cursor: no CSS media queries
Do not use CSS media queries `(hover: none)` or `(pointer: coarse)` to hide the custom cursor. The developer's laptop reports these as true in Chrome even with a functional trackpad, which incorrectly hides the cursor. Always use JS detection: `pointermove` event with `e.pointerType === 'touch'` filter.

### `.env.local` sensitivity
Do not read, log, or expose `.env.local`. Secrets are managed via `supabase secrets set`.

### Supabase free tier — auto-pause risk
The project runs on Supabase free tier during validation. Supabase automatically pauses projects inactive for more than 7 days. The keep-alive mechanism is `.github/workflows/keep-alive.yml`: a scheduled GitHub Actions workflow (cron `0 9 */5 * *`) that pings `get-publications` every 5 days to register activity. If this workflow is disabled or removed, the project will be at risk of being paused again. Validate it is active before any extended pause in deployments.

### `body_markdown` stores HTML (legacy field name)
Since the 2026-05-29 refactor, `body_markdown` stores HTML generated by the model, not markdown. The field name is preserved to avoid a breaking migration. Any code that assumes this field contains markdown and passes it through a markdown parser will double-render or corrupt the content.

### Web search rate limits in content generation
The Anthropic API web search tool consumes significant input tokens per call. At the current tier (30,000 tokens/min org limit), generating more than 1 variation per execution causes rate limit errors. Do not increase the variation count without first upgrading the Anthropic billing tier.

### `generate-content` Edge Function error (pending investigation)
The "Generar Weekly" button in admin.html was giving errors at the end of the 2026-05-29 session. The terminal script (`scripts/generate-content.sh`) is the validated fallback. Investigate the Edge Function before relying on the admin web flow for production generation.

---

## 8. Historical changelog

> This section is preserved for operational lessons, deployment notes, and caveats. It does not override §1–§7. When conflicts exist, current state (§1–§7) wins.

### Day 1 — Complete
- Repo reorganization, backups, CLAUDE.md, .gitignore.

### Day 2 — Complete (2026-05-08)
- Edge Function `sample-request` deployed and validated end-to-end.
- Replaces Make scenario `sample-request-mvp`.
- Anthropic API (Claude Haiku) replaces OpenAI for brief generation. *(Model has since been upgraded — see §2.)*
- Idempotency via unique index on `lower(email)` in `leads`.
- Shared-secret webhook protection via `x-criterial-signal` header.
- Note: Supabase deprecated legacy API keys on 2026-05-03. Use publishable key (`sb_publishable_...`) for JS SDK; legacy JWT anon key still works for Edge Function Bearer auth.

### Day 3 — Complete (2026-05-08)
- Web form (`sample.html`) cutover from Make to Edge Function.
- Make scenario deactivated.
- Resend integrated for email delivery of generated briefs.
- Full funnel validated end-to-end from form to inbox.

### Day 4 — Complete (2026-05-08)
- Supabase Auth enabled with magic link (SMTP via Resend).
- RLS policy on `publications` added. *(Since superseded by `get-publications` EF — see Day 6.)*
- `archive.html` updated: magic link login, fetches publications via Supabase JS SDK.

### Day 5 — Complete (2026-05-08)
- `scripts/test-e2e.sh`: verifies full funnel with PASS/FAIL per step.
- `scripts/funnel-metrics.sh`: reports leads, sample requests, publications and subscribers with breakdowns by status and type.
- Historical `queued` and `generation_failed` sample requests cleaned up.

### Day 6 — Complete (2026-05-08)
- `scripts/generate-content.sh weekly|monthly`: generates 3 variations via Anthropic, lets Pablo select one, saves as draft, optionally publishes.
- `scripts/publish-draft.sh <id>`: publishes a draft by ID.
- `prompts/weekly-digest.es.md` and `prompts/monthly-brief.es.md` added.
- Edge Function `get-publications` deployed: verifies user JWT, checks `subscribers` (plan=pro, status=active), returns allowed publications. **Replaces PostgREST/RLS approach, which broke after JWT key reset.**
- Note: PostgREST RLS (`auth.uid`/`auth.email`) does not work reliably after a JWT key reset. Use Edge Functions for authenticated data access.

### Day 7 — Complete (2026-05-08)
- Full visual redesign of all pages (then located in `/web`, since moved to repo root).
- Design system: Playfair Display + Inter, card-based layout, `#F7F7F5` background. *(Design system replaced in Days 14–15.)*

### Day 8 — Complete (2026-05-10)
- Email delivery of generated sample briefs validated end-to-end.
- Full funnel confirmed: form → Edge Function → Anthropic → Supabase → Resend → user inbox.

### Day 9 — Complete (2026-05-10)
- Edge Function `welcome-subscriber` deployed: triggered by Supabase Database Webhook on INSERT to `subscribers` where `plan = 'pro'`.
- Auth: custom `x-webhook-secret` header (not `Authorization: Bearer`) to bypass Supabase gateway JWT validation. Deployed with `--no-verify-jwt`.
- Note: Supabase Database Webhooks do NOT automatically send the service role key. Must configure custom headers manually in Dashboard webhook editor. `Authorization: Bearer` fails — gateway validates JWT format before reaching the function.
- *(At this point the Stripe → subscribers path still involved Make. Make was fully deactivated in Day 14.)*

### Day 10 — Complete (2026-05-10)
- Design polish: 2-col tablet grid, 1-col mobile grid, nav active state via `aria-current="page"`, `.card--narrow`, `.pricing-card--featured`, `.status-page`.
- Background: `#F7F7F5` → `#F4F0EA`. Brand logo: 17px → 24px, `#111111` → `#0D1F3C`.
- `pricing.html`: rewritten with 2-plan structure (Free + Pro). Basic and Team tiers removed.
- Mobile container padding increased to 32px at ≤600px.

### Day 11 — Complete (2026-05-10)
- Mobile audit: root bug fixed — `.hero`, `.section`, `.site-footer` used 3-value `padding: X 0 X` shorthand that zeroed horizontal padding, overriding `.container` lateral padding at all viewports < 1080px. Fixed by switching to `padding-top`/`padding-bottom`.
- iOS Safari zoom fix: form inputs set to `font-size: 16px` at ≤600px (< 16px triggers automatic zoom).
- Tap targets: `.btn` padding increased to `14px 22px` at ≤600px (~45px height, meets 44px Apple HIG / WCAG minimum).
- Note: never use 3-value `padding: X 0 X` on elements that also carry `.container`.

### Days 12–13 — Complete (2026-05-15)
*(Both sessions addressed the same model upgrade; consolidated here.)*
- Model upgraded from `claude-haiku-4-5-20251001` to `claude-sonnet-4-6` in `_shared/anthropic.ts`. `max_tokens` raised to 2048.
- `SAMPLE_BRIEF_PROMPT` rewritten: system prompt returns ONLY valid JSON with schema `{ titulo, subtitulo, tags, snapshot, signals[], watch[] }`. Scope narrowed to Spain only (Portugal/Iberia removed).
- Step 6 in `sample-request/index.ts` parses JSON before persisting. If parse fails: logs raw text, sets `status = generation_failed`.
- `_shared/resend.ts`: new `BriefData` interface; `buildBriefHtml()` generates table-based HTML email; `sendBriefEmail` sends both `text` and `html`.
- Product decision: scope narrowed to Spanish market only. "Ibérico/ibérica" removed from all prompts. Portugal excluded from product scope.
- Note: `_shared/anthropic.ts` model can be overridden at runtime via `ANTHROPIC_MODEL` env var without redeploying.

### Day 14 — Complete (2026-05-16)
- Web restructured as analytical firm site (Criterial). Navigation: Signals / Advisory / Nosotros.
- `encargos.html` created (Advisory services + contact form). `advisory-received.html` created.
- Brand updated to `Criterial.` across all pages (wordmark with attached dot, EB Garamond).
- CNAME added: `criterialsignals.com` active on GitHub Pages. HTTPS active.
- Edge Function `advisory-request` deployed: validates payload, sends internal notification to `criterialam@gmail.com` and user confirmation via Resend.
- Payment Link updated to 9,90 €/mes (test mode). URLs updated in `pricing.html` and `sample.html`.
- Supabase Auth redirect URLs updated to `https://criterialsignals.com/archive.html`.
- Edge Function `stripe-webhook` deployed: receives Stripe events, verifies `STRIPE_WEBHOOK_SECRET` signature, upserts `subscribers` on `checkout.session.completed`. **Replaces Make scenario `stripe-subscription-mvp`, which was deactivated. Make no longer intervenes in any active flow.**
- Full visual redesign: EB Garamond + Inter, hero parallax landscapes, cursor with `mix-blend-mode: difference`, page transitions, scroll reveal.
- `criterial-shared.js` created as shared visual effects module.
- `archive.html` redesigned: user bar, category tabs (Todo / Weekly / Brief Mensual / Muestras), stats grid, next-publication strip, cards with inline markdown reader modal.
- Email templates updated to new visual system: white background, Georgia serif, 9px uppercase labels.
- `get-publications` EF updated to include type `sample` for Pro plan.

### Day 15 — Complete (2026-05-18)
- Complete visual identity applied across all product elements.
- Email templates finalised: Georgia serif, `#E2DED8` 0.5px separators, Spanish labels ("Resumen ejecutivo", "Señales relevantes", "Qué vigilar").
- Supabase Auth magic link redesigned with custom HTML template consistent with the web.
- Logo and brand package defined: wordmark `Criterial.` in EB Garamond with attached dot; monogram `C.` for favicon and compact use.
- Favicon implemented as inline SVG (navy square, white `C.`) in all HTML.
- Note: GitHub Pages caches CSS aggressively. To force cache invalidation, rename the CSS file and commit. The `?v=X` parameter on the `href` does NOT invalidate GitHub Pages cache.
- Note: all code changes must go through Claude Code. Do not edit files directly from the terminal.

### Day 16 — Complete (2026-05-19)
- Page transition changed from vertical wipe (`translateY`) to white fade (`opacity 0.28s`).
- `sample.html`: form redirects immediately to `request-received.html` (~800ms); fetch is fire-and-forget with `.catch(() => {})`.
- **CSS renamed to `styles.v4.css`** to force cache invalidation on GitHub Pages. All HTML updated. `styles.css` remains in the repo but is not loaded.
- `overflow-x: hidden` → `overflow-x: clip` on body; `overflow: hidden` → `overflow: clip` on `.hero-wrap`, `.service-card`, `.image-section`. `clip` does not create a stacking context, allowing `position: fixed` elements to work correctly.
- Custom cursor resolved: root cause — developer's laptop reports `(hover: none) and (pointer: coarse)` in Chrome, triggering `display: none !important` for cursor elements.
- Fix: cursor hidden by default in CSS; JS uses `pointermove` (not `mousemove`) and filters `e.pointerType === 'touch'`. On first non-touch pointer event: `display: block` and `requestAnimationFrame` loop starts.
- `mix-blend-mode: difference` + `background: #fff` restored on cursor.
- `criterial-shared.js` versioned as `?v=2` in all HTML at this point.
- Cursor divs (`#cursorDot`, `#cursorRing`, `#pageTransition`) moved to end of `<body>` in all HTML.
- Note: do not use CSS media queries `(hover: none)` or `(pointer: coarse)` to hide the cursor. Use `pointermove` with `e.pointerType === 'touch'` filter in JS.

### Day 17 — Complete (2026-05-19)
- "Acceso Pro" link added to nav in all HTML (`archive.html` gets `aria-current="page"`).
  - Style `.nav-access`: 0.5px border instead of animated underline — distinguishes it visually as a login action vs content nav links.
  - Works in dark hero header and `light-header`.
- Nav and hero legibility improvements:
  - Nav items: `font-size: 10.5px / opacity 0.42` → `11px / 0.72`.
  - Nav gap: `34px` → `28px`. `.nav` gets `align-items: center`.
  - `.nav-access`: `padding: 6px 14px`, `align-self: center`.
  - `.eyebrow`: `opacity 0.36 / letter-spacing 0.22em` → `0.6 / 0.18em`.
  - `.hero-sub`: `opacity 0.52` → `0.75`.
  - `.hero-overlay`: softer gradient.
- Cursor fix for `archive.html`:
  - Root cause 1: `mouseenter/mouseleave` per-element listeners did not work with dynamically generated content or when elements disappeared (modal close → ring stuck at 68px).
  - Root cause 2: `cursor: pointer` in archive.html inline styles overrode `cursor: none` (higher specificity).
  - Fix JS: replaced per-element listeners with `ring.classList.toggle('hovering', !!e.target.closest('a, button'))` in `pointermove` handler. Re-evaluates on every move.
  - Fix CSS: removed 4 `cursor: pointer` declarations from archive.html inline styles.
- Note: when `criterial-shared.js` is updated, bump `?v=N` in all HTML `<script>` tags. **The bump to `?v=3` may have been interrupted before all HTML files were updated — verify the actual parameter value in each HTML file before assuming consistency.**

### Day 18 — Complete (2026-05-29)

**Product definition:**
- Criterial Signals scope narrowed and formalized: mid-market español de capital privado. Covers M&A, PE/VC, deuda privada (direct lending, fondos de crédito), and liquidity events (OPAs, salidas a bolsa). Real estate excluded from scope.
- Weekly Signals structure defined: Apertura + Señales de la semana (3-5 señales con etiqueta de tipo, hecho, patrón, implicación) + Qué vigilar + Dato de contexto.
- Brief Mensual structure defined: Tesis del mes + Sectores en movimiento + Mapa de capital + Operación del mes + Perspectiva.
- Both formats target LinkedIn-active professionals: mid-market executives, boutique M&A advisors, family offices, independent investors.

**Content pipeline refactor:**
- Publication content format changed from markdown to semantic HTML with `pub-*` CSS classes.
- `body_markdown` field now stores HTML (legacy name preserved — do not rename without migration).
- marked.js removed from `admin.html` and `archive.html`.
- `styles.v4.css` extended with 304 lines of `pub-*` classes for publication rendering.
- Anthropic API web search tool enabled in content generation (tool: `web_search_20250305`, max_uses=5).
- `max_tokens` raised from 1200 to 4000 in `scripts/generate-content.sh`.
- Prompts updated to v3: web search instructions + HTML structure + strict class name rules (`pub-badge-ma` single dash, `pub-section-label`, `pub-vigilar-title`/`pub-vigilar-sub`).
- Variation count reduced from 3 to 1 to avoid rate limit errors with web search enabled.

**Database:**
- Full reset of `publications` table: 47 records deleted (36 sample drafts + 8 published samples + 3 weekly published).
- First Weekly generated with new system: web search active, real sources cited, HTML output correct.

**Admin:**
- Preview modal added to publication cards in `admin.html`: renders HTML content via `pub-content` class before publishing.
- `admin-publications` Edge Function updated: `body_markdown` added to GET select response.

**Known issues at session end:**
- "Generar Weekly" button in `admin.html` giving errors (Edge Function `generate-content`). Terminal script is validated fallback.
- Preview modal width may need improvement on desktop.

---

## Contact and ownership

This project is owned and operated by Pablo Pirer.
