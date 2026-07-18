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

### Production snapshot (last documented: 2026-06-29)
- 20 leads captured (all status `new`; none contacted or converted; no new lead since 2026-05-18) — verified against live DB 2026-06-28
- 1 active Pro subscriber — verify in Stripe before using for commercial claims
- 2 publications published: Weekly Signals nº1 (`995ddce5-42f8-479f-87f3-717ca198ba97`, 2026-06-13) and "Weekly Signals — 28 de junio de 2026" (`f5bbbf6b-345e-4006-b939-6bc4d302098a`, published + sent to Pro 2026-06-28); 5 sample drafts (per-lead, addressable by token — their natural resting state)
- 46 sample requests total: 7 `generation_failed` (users did not receive email; all predate the Day 22 fix), 0 queued — verified against live DB 2026-06-28
- Active CSS is **`styles.v11.css`** and `criterial-shared.js` is at **`?v=8`** across all active HTML files. CSS renamed v10→v11 in Day 29 for the Monthly Brief "El Informe" **v6 solidity pass** (heavy `mb-*` revision: break-out layout, framed data panel, pull-quote, drop cap). `criterial-shared.js` UNCHANGED since v5 (buildMetrics/buildMap reused) → `?v=8` stays.

> **Counts from `scripts/funnel-metrics.sh`. Verify against Supabase/Stripe before using in public copy or commercial claims.**

---

## 2. Active architecture

### Frontend
- Static HTML + CSS at the **repository root** (not `/web` — that location is obsolete).
- Active HTML pages: `index.html`, `pricing.html`, `about.html`, `sample.html`, `muestra.html`, `signals.html`, `archive.html`, `encargos.html`, `advisory-received.html`, `request-received.html`, `success.html`, `cancel.html`. `admin.html` is the internal admin console (publication CRUD, content generation, Pro email send) — not linked from public nav. `muestra.html` renders the interactive web brief delivered to Sample requesters (since Day 22). `signals.html` is the **public** free-edition reader ("Signals · Edición abierta"), added Day 27 — no login; fetches `get-public-editions`. The public nav "Signals" points to `signals.html` (was `sample.html`).
- Active CSS: **`styles.v11.css`** — loaded by all HTML pages (renamed from `styles.v10.css` in Day 29 to bust GitHub Pages cache). `styles.css` remains in the repo but is not loaded by any page.
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
| `sample-request` | Lead capture, brief generation (Anthropic + web search), envelope email (Resend) |
| `get-sample` | Public read-only access to a sample brief by `public_token` (no auth; `verify_jwt: false`). Serves `body_data` to `muestra.html` |
| `get-public-editions` | Public read-only feed of free Signals editions (no auth; `verify_jwt: false`). Returns only `body_public` of `published` rows; never exposes `body_markdown`. Serves `signals.html`. Added Day 27. |
| `subscribe-signals` | Inline newsletter capture from `signals.html` (no auth; `verify_jwt: false`; gated by `x-criterial-signal` like `sample-request`). Upserts `signals_subscribers` (idempotent, reactivates bajas), sends confirmation email. Added Day 28. |
| `send-open-edition` | Emails the free newsletter list (`signals_subscribers` active) when an open edition publishes. Admin-JWT (mirrors `send-weekly`). Called from `admin-publications` on publish, background. Added Day 28. |
| `unsubscribe-signals` | Public opt-out by `unsubscribe_token` (no auth; `verify_jwt: false`). GET → sets `status='unsubscribed'`, returns HTML page. Target of the unsubscribe link in every newsletter email. Added Day 28. |
| `advisory-request` | Advisory form: internal notification + user confirmation |
| `stripe-webhook` | Stripe event receiver: verifies signature, upserts `subscribers` |
| `welcome-subscriber` | Triggered by DB Webhook on INSERT to `subscribers` (plan=pro) |
| `get-publications` | Authenticated access to Pro publications |
| `generate-content` | Generación de Weekly y Brief Mensual desde admin.html (web search + HTML semántico) |
| `send-weekly` | Envío de notificación email a suscriptores Pro activos cuando se publica un Weekly o Monthly. Llamado manualmente desde admin.html. |
| `admin-publications` | CRUD publicaciones y métricas. Acceso restringido a `pablopirer@gmail.com` |
| `_shared/anthropic.ts` | Shared Anthropic client |
| `_shared/supabase.ts` | Shared Supabase client |
| `_shared/resend.ts` | HTML email templates and send helpers |

### Anthropic
- Model: **`claude-sonnet-4-6`**
- Runtime override: set the `ANTHROPIC_MODEL` environment variable (no redeploy needed).
- `max_tokens`: 8000 (sample-request Edge Function — raised in Day 22 for the larger map+sources schema with web search); 12000 (content generation script and generate-content Edge Function — raised from 8000 in Day 25: the Weekly already ran near the limit and the added `mapa` block truncated the JSON at 8000).
- Brief output schema for sample-request: `{ titulo, subtitulo, tags, snapshot, signals[], watch[], mapa, fuentes[] }` (JSON). `mapa` is a quadrant positioning map (`eje_x`/`eje_y`, `cuadrantes`, `nodos` with x/y/size/momentum/etc.); `fuentes[]` are real, web-searched, cited sources. Persisted as `publications.body_data` (jsonb) and rendered by `muestra.html`.
- Web search habilitado en `generate-content` **y en `sample-request`** (este último desde Day 22) via tools: `[{type: 'web_search_20250305', max_uses: N}]`. `sample-request` usa `max_uses: 5`; `generate-content` se bajó a **`max_uses: 3`** en Day 25 (la generación síncrona del Weekly se pasaba del límite wall-clock del Edge Function con 5 → gateway "Error desconocido"). El modelo busca noticias reales antes de generar el contenido. Con web search el modelo suele envolver el JSON en prosa + valla ```json; usar el helper `extractJsonObject` para parsear (ver §7).
- **Brief Mensual = "El Informe" (v6, Day 29):** el Monthly es un INFORME editorial long-form que se lee (identidad `mb-*` propia, NO las tarjetas `pub-*-new` del Weekly). Emite **JSON**, parseado con `extractJsonObject` (502 limpio si falla) y convertido con `monthlyJsonToHtml`. Schema: `{ titulo, dek, period, resumen[], pullquote, tesis[] (4-5 párrafos), contexto[] (macro), operaciones[] (tabla citada, ≥8), macro[] (opcional, con fuente), sectores[] (cuerpo array de 2-3 párrafos), mapa (tracker), operacion (deep-dive, analisis[] párrafos), perspectiva[], fuentes[] }`. Estructura: masthead + dek + byline → resumen ejecutivo → tesis (con pull-quote + capitular) → **contexto de mercado** → **"El mes en datos"** (panel enmarcado) → tabla de operaciones → rotación (prosa) → mapa → operación del mes → perspectiva → fuentes. **Layout break-out:** la prosa va en columna de lectura (`.mb-col`, ~660px) y los exhibits (panel de datos, tabla, mapa) + reglas de sección a ancho completo (~920px). **El panel de datos se DERIVA de `operaciones[]`** (nº ops, desglose por sector en barras `pub-metrics`/`buildMetrics`, volumen divulgado, ticket medio, sector más activo) — SIEMPRE está y es trazable; `macro[]` son callouts extra opcionales con fuente. El **mapa es un tracker temporal** (`xprev/yprev`; toggle "Ahora"/"Hace un mes"). `maxTokens:16000` (informe denso). Solo-Pro (`public_html:null`). Nº de edición server-side. Paridad en `scripts/generate-content.sh`.
  - *(v4, superado el mismo día: primer intento con estructura tipo-Weekly (cifras[]/sectores tarjeta/catalizadores) — auditado con el usuario, se parecía demasiado al Weekly y el panel de cifras macro no renderizaba. Reemplazado por "El Informe".)*
- **Mapa de posicionamiento del Weekly (Day 25):** el schema del Weekly incluye un bloque `mapa` (idéntico al de la muestra: `eje_x`/`eje_y`, `cuadrantes`, `nodos[]` con x/y/x2/y2/size/momentum/label/cuerpo/chips/fuente). `generate-content` (y el script) lo emiten como `<div class="pub-map" data-mapa="<base64 UTF-8>">` incrustado en el HTML. El mapa NO se guarda en `body_data` — viaja dentro de `body_markdown`. Se renderiza client-side con `window.hydratePubWidgets(root)` en `criterial-shared.js`, llamado por `archive.html` (lector Pro) y `admin.html` (preview) tras inyectar el cuerpo. Ver §7.

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
├── *.html                      ← index, about, pricing, sample, muestra, archive, encargos,
│                                  advisory-received, request-received, success, cancel, admin
├── styles.v11.css              ← active CSS (styles.css present in repo but not loaded)
├── criterial-shared.js         ← shared visual effects module
├── /supabase
│   ├── /functions
│   │   ├── /_shared            ← anthropic.ts, supabase.ts, resend.ts
│   │   ├── /sample-request     ← index.ts, types.ts
│   │   ├── /get-sample         ← index.ts (public sample brief by token)
│   │   ├── /get-publications   ← index.ts
│   │   ├── /welcome-subscriber ← index.ts
│   │   ├── /advisory-request   ← index.ts
│   │   ├── /stripe-webhook     ← index.ts
│   │   ├── /generate-content   ← index.ts (generación desde admin web)
│   │   ├── /send-weekly        ← index.ts (notificación Pro de Weekly/Monthly)
│   │   └── /admin-publications ← index.ts (CRUD publicaciones, métricas)
│   └── /migrations
├── /prompts
├── /scripts
└── /archive
```

### Publication content system
- El contenido generado es **HTML semántico** con clases CSS `pub-*`, no markdown.
- El campo `body_markdown` en Supabase almacena HTML (el nombre es legacy — no renombrar sin migración).
- Las clases `pub-*` están definidas en `styles.v11.css` bajo el bloque `Publication content — Weekly & Monthly`. Las clases `pub-map-*` (mapa) y `pub-metrics-*` (barras) están ahí; las clases **`mb-*`** son la identidad de informe del Brief Mensual ("El Informe", v6) en el mismo archivo — layout break-out, panel enmarcado, pull-quote, capitular.
- El modelo genera HTML directamente siguiendo la estructura definida en los prompts (`prompts/weekly-digest.es.md`, `prompts/monthly-brief.es.md`).
- `admin.html` renderiza el HTML directamente (sin marked.js) en el modal de previsualización.
- `archive.html` renderiza el HTML directamente (sin marked.js) en el modal de lectura.

### Schema notes
- `leads.interest_type` — nullable.
- `leads.email` — NOT NULL, unique index on `lower(email)`.
- `leads.source` — NOT NULL, default `sample_form`.
- `leads.status` — NOT NULL, default `new`.
- `publications.public_token` — unguessable handle for public sample access. Added Day 22 (migration `20260613120000_publications_sample_token.sql`).
- `publications.body_data` — jsonb; structured sample brief content (snapshot, signals, watch, mapa, fuentes). Served by `get-sample`, rendered by `muestra.html`. (`body_markdown` still stores HTML for Weekly/Monthly — see Publication content system.)
- `publications.body_public` — text (nullable); the reduced free/"open" HTML projection of a Weekly (apertura + señales[hecho] + mapa), stored on the SAME row as the full `body_markdown` (Pro). Served by `get-public-editions` to `signals.html`; never returned by `get-publications` (Pro archive shows the full `body_markdown`). Only weekly rows carry it. Added Day 27 (migration `20260703120000_publications_body_public.sql`).
- `publications.open_notified_at` — timestamptz (nullable); idempotency stamp for the free open-edition email blast (`send-open-edition`), separate from `notified_at` (Pro). Set by `admin-publications` after the blast. Added Day 28 (migration `20260705120100_publications_open_notified_at.sql`).
- `signals_subscribers` — newsletter list for the free open edition (distinct from `leads`, which is sales/muestra). Columns: `id`, `email` (NOT NULL, `UNIQUE` — plain constraint, not `lower(email)`, because `subscribe-signals` always stores lowercase and PostgREST `onConflict` can't target an expression index), `created_at`, `status` (`active`|`unsubscribed`), `unsubscribe_token` (uuid, unguessable), `source` (default `signals_open`). RLS on, no public policies — access only via the three service-role EFs. Added Day 28 (migration `20260705120000_signals_subscribers.sql`).
- Always audit live schema before writing functions that insert/upsert data.

### Development environment
- OS: Windows nativo (Surface Pro)
- Shell para scripts bash: Git Bash
- Claude Code: app de desktop de Claude
- Repo local: `C:\Users\pablo\projects\criterial-signals`
- Scripts bash (`generate-content.sh`, `publish-draft.sh`, `funnel-metrics.sh`, `test-e2e.sh`) se ejecutan desde Git Bash, no desde PowerShell
- WSL Ubuntu: desinstalado. No usar como referencia para rutas o comandos.
- Git configurado con `core.autocrlf false` para evitar conversión de line endings en scripts bash

---

## 3. Production flows

### 3.1 Sample request
- **Entry point:** `sample.html` form submission.
- **UX:** form redirects immediately to `request-received.html` (~800ms). The backend call is fire-and-forget.
- **Edge Function:** `sample-request` (generation) + `get-sample` (public read of the finished brief).
- **Deliverable (since Day 22):** the user receives a minimal **envelope email** (`sendSampleEnvelope`) with a CTA linking to an **interactive web brief** at `muestra.html?...token`. The brief is no longer embedded as HTML in the email.
- **Services touched:** Supabase (`leads`, `sample_requests`, `publications`), Anthropic (JSON brief generation **with web search**), Resend (envelope email to user).
- **Background generation:** `sample-request` inserts the lead + `sample_request`, responds 200 immediately, then runs generation → persist → email inside `EdgeRuntime.waitUntil` (`generateAndDeliver()`). Required because web search pushed generation to 30–90s, longer than the client stays connected.
- **Side effects:** lead upserted in `leads`; sample stored in `publications` with `public_token` + `body_data`; envelope email sent to user. `muestra.html` then fetches the brief via `get-sample` using the token.
- **Request headers:** `sample.html` posts to the Edge Function with `Authorization: Bearer <anon/publishable key>` and `x-criterial-signal: <shared secret>`. These headers must stay aligned between `sample.html`, the Edge Function validation logic, and `scripts/test-e2e.sh`. Do not change one without updating all three.
- **Caveats:** If Anthropic returns unparseable output, `status = generation_failed` is logged, no email is sent, and an internal alert email goes to `criterialam@gmail.com`. With web search the model wraps the JSON in prose — parsing uses the `extractJsonObject` helper (see §7). Monitor `sample_requests` for `generation_failed` records.

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
- **Services touched:** Anthropic API (claude-sonnet-4-6, web search habilitado, max_tokens=8000), Supabase (`publications` insert).
- **Flow:** genera 1 variación con web search → muestra en admin → Pablo selecciona → guarda como draft → previsualiza → publica.
- **Side effects:** nueva publicación en `publications` con status=draft.
- **Script alternativo:** `scripts/generate-content.sh weekly|monthly` — mismo resultado desde terminal. Fallback validado si la Edge Function falla.
- **Rate limit:** el web search consume tokens adicionales. Con el tier actual (30.000 tokens/min), solo 1 variación por llamada es viable sin rate limit error. En Day 25 se bajó `max_uses` de 5 a 3 en `generate-content` para que la generación síncrona no chocara con el límite wall-clock del Edge Function.
- **Caveats:** la Edge Function `generate-content` fue reparada en Day 21 (2026-06-13): prompts actualizados a v6/v3, web search habilitado, reducida a 1 variación, conversión JSON→HTML en TypeScript. Ambos paths (EF y script de terminal) están validados.

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
15. **`pub-*`/`mb-*` CSS classes are the design system for publication content.** Do not inline styles in generated HTML. All styling goes through `styles.v11.css` classes.

---

## 5. Current roadmap

### In progress / next
- **Recurring content cadence** — establish weekly rhythm (`generate-content.sh weekly` or admin.html "Generar Weekly"). Manual execution is sufficient for now; no automation required yet.
- **Advisory validation** — get first real Advisory engagement. Validate format and deliverables with a real client.

### Medium term
- **Company Snapshot** — first on-demand product. Manual first (generate via Anthropic, deliver by email). Once validated, build Edge Function `company-snapshot`. Inputs: company name, context, requester email. Output: snapshot delivered by email + stored in `publications`.
- **LinkedIn distribution** — publish reduced snapshot format on LinkedIn with CTA to get full version. Lead capture via existing `sample-request` flow. No new infrastructure needed for initial validation.
- **Conversion optimisation** — review copy and UX on `pricing.html` and `sample.html`; clarify Free vs Pro value gap.

### Robustness (ongoing, lower priority)
- Alert on `generation_failed` sample requests — the only silent failure that affects the end user directly (they see the confirmation page but receive no email). Higher priority than generic error handling.
- Error handling and retry logic in Edge Functions.
- Migrate internal Advisory notification email from personal Gmail to a Criterial account.

---

## 6. Operational commands reference

> Los comandos bash se ejecutan desde **Git Bash**. Los comandos `supabase` y `git` pueden ejecutarse desde PowerShell o Git Bash indistintamente.

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
GitHub Pages caches CSS aggressively. A `?v=X` query parameter on the `href` does **not** invalidate the cache. To force invalidation, rename the CSS file (the active file is now `styles.v8.css`; next bump it to `styles.v9.css`), update all HTML references, then commit and push. This was last done in Day 25 (`styles.v7.css` → `styles.v8.css`). Note: a plain `sed` over `*.html` normalizes CRLF→LF on the files that use CRLF (currently `admin.html`, `archive.html`, `sample.html`) — restore them with `sed -i 's/$/\r/'` after the bump to keep the diff clean.

### Active CSS file ambiguity
The active CSS file is **`styles.v11.css`** (renamed from `styles.v10.css` in Day 29). `styles.css` remains in the repo but is not loaded by any page. Do not edit `styles.css` expecting it to affect the live site.

### `criterial-shared.js` cache versioning
When `criterial-shared.js` is updated, the `?v=N` query parameter in all HTML `<script>` tags must be bumped in the same commit. Current version: `?v=8` — bumped in Day 29 (map temporal-tracker relabel in `buildMap`: "Ahora"/"Hace un mes" via `xprev/yprev`, for the Monthly v5); `?v=7` added `buildMetrics`; previously `?v=6` in Day 26. Verified consistent across all active HTML files. Note: when testing renderer changes locally, the browser also caches `criterial-shared.js?v=8` AND `styles.v10.css` — bump the query (or load with a unique param) to force a fresh copy; a stale CSS is why widget styles can appear unstyled locally.

### Weekly interactive map — base64 in HTML, hydrated client-side
The Weekly positioning map (Day 25) travels as a `<div class="pub-map" data-mapa="<base64>">` placeholder inside `body_markdown` (base64 of the `mapa` JSON, UTF-8-safe). Base64 has no quotes/apostrophes, so it survives `archive.html`'s attribute-escaping round-trip (`safeBody` → `data-body` → `innerHTML`) untouched. The renderer `window.hydratePubWidgets(root)` (in `criterial-shared.js`) decodes it and builds the interactive SVG (quadrant labels rendered OUTSIDE the plot frame; bubble centres clamped inside; a light de-overlap relax with anchor pull-back). It is called by `archive.html` `openPubModal` and `admin.html` `previewPublication` after setting innerHTML — scripts inside innerHTML do NOT execute, so hydration must be driven by the host page. A malformed map hides its own section and never breaks the publication. No DB schema change: the data rides in `body_markdown`, not `body_data`.

### Synchronous generation is near the Edge Function ceiling — and the Monthly exceeds it
`generate-content` generates synchronously (the admin waits for the result — unlike `sample-request`, which runs in `EdgeRuntime.waitUntil`). This exposes it to two limits, both hit in Day 25 on the Weekly after the `mapa` block enlarged the output:
- **Truncation → invalid JSON (502 "no parseable"):** the Weekly already ran near 8000 output tokens; the map pushed it over and the JSON was cut mid-object. Fix: `max_tokens` raised to 12000.
- **Wall-clock/gateway timeout → HTTP without `{error}` body → admin shows "Error desconocido":** a 5-search run exceeded the Edge Function wall-clock limit and the gateway killed it (the function's own errors always carry `{error}`; a bare gateway failure does not). Fix: web search `max_uses` reduced 5→3.

**The Brief Mensual does NOT fit reliably (Day 30).** The v6/v7 Monthly (~16000 output tokens + web search) sits right on the wall-clock ceiling: it succeeds sometimes and 504s others (verified `execution_time_ms: 150888`). **Async does NOT fix this** — contrary to an earlier note here. Supabase's wall-clock limit (Free: **150s**, Paid: 400s) is the duration a worker stays active *including* background tasks, and `EdgeRuntime.waitUntil()` prevents early retirement but does **not** extend the hard limit. Moving generation to background would only hide the timeout (silent death at 150s) instead of surfacing it. So: **the Monthly is generated from the terminal** (`scripts/generate-content.sh monthly`, no gateway ceiling locally); the admin "Generar Brief Mensual" button now shows a `confirm()` warning + the terminal command before attempting, and `generate()` maps 504/546 to a diagnosable error. Async remains the right fix for `sample-request` (30-90s, fits easily); it is NOT the fix for the Monthly. Real headroom for the button would require Supabase Pro (400s) — a business call, not a technical one. See memory `project_monthly_generation_wallclock`.

### Web search wraps JSON output in prose — use `extractJsonObject`
When Anthropic web search is enabled, the model frequently prefixes conversational prose before the JSON (e.g. "Con los datos recopilados, genero ahora el brief…") and wraps it in a ```json fence. A parser that only strips the fence leaves the prose and `JSON.parse` throws on the first non-JSON char — this was the confirmed root cause of silent `generation_failed` sample requests. The fix is the `extractJsonObject` helper (in `sample-request` and `generate-content`): it prefers a fenced block, then bounds to the outermost `{ … }`. Any new JSON-returning path that uses web search must parse through this helper, never raw `JSON.parse`. Since Day 30 the single copy lives in `_shared/json.ts`, imported by `sample-request`, `generate-content` and `generate-linkedin` (the inline duplicates were removed). Note: the monthly path is NOT exempt — since the Day 29 "El Informe" redesign it also emits JSON and parses through this helper (an older note here claimed it emitted HTML directly; that is obsolete).

### Edge Function async work must be awaited inside `EdgeRuntime.waitUntil`
Fire-and-forget `sendEmail(...)` calls (no `await`) inside `EdgeRuntime.waitUntil` can be torn down with the isolate before the HTTP request reaches Resend — this is why the 14-jun `generation_failed` alert emails never arrived despite the rows being correctly marked. Always `await` outbound calls inside `waitUntil`, and log (do not swallow) errors.

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
The project runs on Supabase free tier during validation. Supabase automatically pauses projects inactive for more than 7 days. The keep-alive mechanism is `.github/workflows/keep-alive.yml`: a scheduled GitHub Actions workflow (cron `0 9 */5 * *`) that runs every 5 days and performs a real database query via PostgREST (`GET /rest/v1/publications?select=id&limit=1`) with `apikey` and `Authorization: Bearer` headers to register genuine database activity. If this workflow is disabled or removed, the project will be at risk of being paused again. Validate it is active before any extended pause in deployments.
The anon key used by this workflow is stored as the GitHub Actions secret `SUPABASE_ANON_KEY`. It must not appear in code or in `.env.local`.

### `body_markdown` stores HTML (legacy field name)
Since the 2026-05-29 refactor, `body_markdown` stores HTML generated by the model, not markdown. The field name is preserved to avoid a breaking migration. Any code that assumes this field contains markdown and passes it through a markdown parser will double-render or corrupt the content.

### Web search rate limits in content generation
The Anthropic API web search tool consumes significant input tokens per call. At the current tier (30,000 tokens/min org limit), generating more than 1 variation per execution causes rate limit errors. Do not increase the variation count without first upgrading the Anthropic billing tier.

### `generate-content` Edge Function — ambos paths validados
The "Generar Weekly" and "Generar Brief Mensual" buttons in admin.html are operational as of Day 21 (2026-06-13). The EF uses the same prompts v6/v3 and web search as the terminal script. The terminal script (`scripts/generate-content.sh`) remains a valid fallback.

### Windows line endings (CRLF)
Los scripts bash fallan en Git Bash si Git convierte los line endings a CRLF al hacer checkout. Resuelto configurando `core.autocrlf false` en el repo local. Si se clona el repo en una máquina nueva en Windows, ejecutar `git config core.autocrlf false` y luego `git checkout HEAD -- scripts/` antes de usar los scripts.

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
- "Generar Weekly" button in `admin.html` giving errors (Edge Function `generate-content`). Terminal script (`scripts/generate-content.sh`) is the validated fallback. Not investigated in Day 20. *(Fixed in Day 21.)*

### Day 20 — Complete (2026-06-13)

**`scripts/generate-content.sh` fixed for Windows (4 fixes):**
- `export PYTHONUTF8=1` — Python 3.14 on Windows defaults to cp1252; forces UTF-8 for all I/O.
- `max_tokens` 4000 → 8000 — model output was truncated mid-JSON with 4000.
- `open(body_file, encoding='utf-8')` — explicit UTF-8 for the temp file write.
- URL fix: `f'{supabase_url}publications'` — `SUPABASE_URL` already ends in `/rest/v1/`; previous code appended `/rest/v1/publications` again, causing `PGRST125`.

**First real Weekly Signals published:** ID `995ddce5-42f8-479f-87f3-717ca198ba97`, via `scripts/publish-draft.sh`. Web search active, real M&A sources cited. Visible in `archive.html` for Pro subscribers.

**`archive.html` reader redesigned:** full-screen modal (z-index 500, `inset: 0`) replacing narrow 720px overlay. Topbar with "Criterial." brand and "← Volver al archivo" button. Wider content column (max-width 1100px).

**Fix: content scrolling above topbar** — `position: sticky` inside `overflow-y: auto` does not work reliably in Chrome. Fixed by switching to flex-column layout on the modal: topbar is a non-scrolling `flex-shrink: 0` child; `pub-modal-scroll` wrapper (`flex: 1; overflow-y: auto`) contains all scrollable content. `modal.scrollTop` → `pubModalScroll.scrollTop` in JS.

**`styles.v5.css` pub-\* improvements:** larger font sizes (30px title, 16px body), more vertical spacing throughout, `border-left` accent on dato-nuevo, `border-top` on vigilar cards.

**`admin.html` card menu (···):** Publicar / Despublicar / Eliminar dropdown on each publication card. Eliminar sends `DELETE /admin-publications` with a confirm dialog.

**`admin-publications` Edge Function:** DELETE endpoint added and deployed.

**`prompts/weekly-digest.es.md` updated (v6):** `<strong>` tag instruction for key figures and company names (max 2–3 per field).

**`scripts/generate-content.sh` Python `esc()` updated:** uses `re.split(r'(</?strong>)', ...)` so `<strong>` tags pass through `html.escape()` intact.

### Day 21 — Complete (2026-06-13)

**Email delivery de Weekly/Monthly a suscriptores Pro:**
- Nueva Edge Function `send-weekly`: verifica JWT admin, obtiene suscriptores `plan=pro status=active`, envía email de notificación a cada uno vía Resend, devuelve `{ sent, emails, errors? }`.
- `_shared/resend.ts`: nueva función `sendPublicationNotification()` con plantilla branded (cabecera CRITERIAL SIGNALS · PRO, título, período, CTA "Leer en el archivo →", instrucción de acceso vía magic link).
- `admin.html`: botón "Enviar →" en cards published+weekly/monthly. Muestra `confirm()` nativo antes de enviar. Alerta con count de enviados en éxito. El botón no aparece en drafts ni en publicaciones de tipo `sample`.
- Flujo manual intencional: el admin decide cuándo enviar después de revisar la publicación.
- Validado end-to-end: email recibido correctamente en Gmail con formato correcto y CTA funcional.

**`generate-content` Edge Function reparada.** Root causes identificados y corregidos:
1. `_shared/prompts.ts` usaba prompts v1 obsoletos (incluía Real Estate, fuera de scope). Actualizado a prompts v6 (weekly, JSON schema) y v3 (monthly, HTML directo).
2. `_shared/anthropic.ts` no soportaba el parámetro `tools`. Añadido parámetro opcional `tools?: AnthropicTool[]`.
3. `generate-content/index.ts` generaba 3 variaciones en paralelo (`Promise.all`), causando rate limit con el tier actual. Reducido a 1 variación.
4. El EF devolvía texto crudo. Weekly ahora convierte JSON→HTML en TypeScript (puerto de la lógica Python del script de terminal). Monthly usa HTML directo del modelo.
- `max_tokens` subido de 6000 a 8000 para coincidir con el script de terminal validado.
- `{{period}}` en el prompt ahora se reemplaza con regex `/g` para cubrir todas las ocurrencias (el template del monthly tiene dos).
- EF desplegada y validada: genera Weekly con web search, fuentes reales, estructura `pub-*` correcta.
- Ambos paths (EF via admin.html y terminal script) son ahora equivalentes y validados.

### Day 22 — Complete (2026-06-13 → 2026-06-23)

**Rediseño del producto "muestra" (entrega del Sample) en 3 fases.** La entrega pasa de un email con el brief en HTML embebido a un **email-sobre minimalista** que enlaza a un **brief web interactivo** servido en `muestra.html`.

- **Fase 1 — brief web direccionable (commit `4e63724`):**
  - Migración `20260613120000_publications_sample_token.sql`: añade `publications.public_token` (handle no adivinable) y `body_data` (jsonb).
  - Nueva Edge Function `get-sample` (pública, `verify_jwt: false`): sirve un sample por token, solo lectura.
  - `sample-request`: genera `body_data` estructurado, guarda el token y `sample_publication_id`, envía el email-sobre (`sendSampleEnvelope` en `_shared/resend.ts`) con CTA a la muestra.
  - `sample.html`: nuevos temas (M&A, PE/VC, deuda privada, liquidez, general) + campo sector opcional; eliminados Real Estate / Capital Markets; marca "Signals".
  - `muestra.html`: diseño editorial (paper canvas, signal cards, momentum pills, reading progress, CTA band).
- **Fase 2 — mapa de capital interactivo (commit `88cbc40`):** el prompt emite un grafo de flujos de capital (`mapa{nodos, flujos, detalle}`); renderer SVG dinámico en `muestra.html` (flujos origen→destino estilo Sankey, toggle temporal reciente/esperado, panel de detalle). Defensivo: un grafo inválido se omite, nunca rompe el brief. `maxTokens` 3000→5000.
- **Fase 3 — mapa de posicionamiento + fuentes reales (commit `35ed1b4`):** reemplaza el grafo abstracto por un **mapa de posicionamiento por cuadrantes** (ejes, cuadrantes, burbujas tintadas por momentum y dimensionadas por volumen, trayectoria animada), más intuitivo y de mayor valor. Web search habilitado en `sample-request`; nuevo `fuentes[]` (fuentes reales citadas, links http-only, XSS-safe). `maxTokens` 5000→6000. Renderers validados localmente antes de desplegar.

**Fixes de robustez del Sample (post-rediseño):**
- **Generación en background (commit `cbc43d4`):** con web search la generación pasó de segundos a 30–90s; como el form es fire-and-forget (el navegador redirige a ~800ms), la función moría al desconectar el cliente y el email no llegaba. Fix: insertar lead + sample_request, responder 200 de inmediato, y correr generación→persistencia→email en `EdgeRuntime.waitUntil` (lógica extraída a `generateAndDeliver()`).
- **Alerta de `generation_failed` (commits `89c94d4`, `7bb26b0`):** se añadió alerta interna a `criterialam@gmail.com` cuando Anthropic falla o devuelve JSON inválido. Las alertas del 14-jun nunca llegaron porque los envíos eran fire-and-forget dentro de `EdgeRuntime.waitUntil` y el isolate se destruía antes de llegar a Resend. Fix: `await` en ambos envíos + log (no swallow) de errores. Ver §7.
- **Extracción robusta de JSON (commits `aa25a90`, `6535a75`):** causa raíz confirmada de `generation_failed` — con web search el modelo envuelve el brief en prosa + valla ```json; el parser antiguo solo quitaba las vallas y dejaba la prosa, así que `JSON.parse` fallaba en el primer carácter no-JSON. Nuevo helper `extractJsonObject` (prefiere el bloque con valla, luego acota al `{ … }` más externo). Portado de `sample-request` a `generate-content` (path weekly; monthly emite HTML directo y no aplica). `maxTokens` de sample-request 6000→8000. Ver §7.

**Estado en producción al cierre:** `sample-request` v24, `generate-content` v3, `get-sample` v1 — todas activas. `sample-request` y `generate-content` con `extractJsonObject` y `verify_jwt: true`; `get-sample` con `verify_jwt: false` (acceso público por token). Re-test end-to-end OK. `origin/main` en `6535a75`.

**Entorno / despliegue:** la CLI local de Supabase está bloqueada por Smart App Control (binario sin firmar). Desplegar Edge Functions vía el MCP de Supabase o Management API + Node, **nunca** `supabase functions deploy`. El PAT temporal `deploy-temp` usado para estos despliegues fue **revocado** (confirmado 2026-06-28).

### Day 23 — Complete (2026-06-28)

**Validación end-to-end de los dos flujos de producto (entorno de prueba):**
- **Solicitar muestra (i):** validado de punta a punta. POST a `sample-request` → generación en background (Anthropic + web search) → `extractJsonObject` → persistencia (`body_data` + `public_token`) → `get-sample` por token → email-sobre entregado (verificado en bandeja) → render correcto en `muestra.html` (identidad visual intacta).
- **Generar Weekly + ciclo de estado (ii):** validado desde `admin.html` con sesión admin real. Generar (`generate-content` EF + web search) → guardar borrador (`admin-publications` POST) → publicar (PATCH→published) → despublicar (PATCH→draft) → eliminar (DELETE). Los cinco pasos verificados contra la DB.

**Fix "Dato de contexto" (Weekly):**
- Causa raíz: el schema del prompt definía `dato.cifra` de forma laxa ("cifra o dato destacado") y el modelo metía una frase larga en `<span class="pub-dato-num">` (cifra de display a 38px), rompiendo la maqueta.
- Prompt acotado en `_shared/prompts.ts` (EF) y `prompts/weekly-digest.es.md` (script): `cifra` = cifra corta (~12 caracteres, p.ej. "+64%"); el contexto va en `texto`.
- Guarda defensiva CSS en `.pub-dato-new`/`.pub-dato-num` (flex-wrap + overflow-wrap) por si el modelo se desvía.
- Verificado en producción: la cifra ahora sale corta ("+64%") y renderiza como número grande + texto al lado.

**Hardening de parseo JSON en `generate-content`:**
- El modelo emite JSON inválido de forma intermitente (visto: `"contexto">…` en vez de `"contexto": "…"`). El fallback anterior devolvía el texto crudo, que `admin.html` pintaba como JSON literal y podía guardarse como publicación rota.
- Ahora, si `JSON.parse` del Weekly falla, el EF devuelve un **error 502 limpio** ("vuelve a generar") + log del output, en vez de JSON crudo. Ver §7.

**Despliegues y repo:**
- `generate-content` redesplegado a **v5** (fix de `cifra` + hardening), vía MCP de Supabase (la CLI sigue bloqueada por Smart App Control). `verify_jwt: true`.
- **CSS renombrado `styles.v5.css` → `styles.v6.css`** (baile anti-caché de §7) + 12 HTML actualizadas; arrastra la guarda `pub-dato`. `criterial-shared.js` sigue en `?v=3`.
- Commits en `main` (todos pusheados): `462ac06` (Day 22 + gitignore), `ba577bd` (fix prompt + hardening JSON), `39adb07` (rename CSS a v6 + guarda).

### Day 24 — Complete (2026-06-28 → 2026-06-29)

**Primer Weekly real publicado y enviado a Pro (rompe la sequía de contenido):**
- Generado desde `admin.html` (`generate-content` v5), revisado, guardado como borrador, **publicado** y **enviado a suscriptores Pro** vía `send-weekly`. ID `f5bbbf6b-345e-4006-b939-6bc4d302098a`, "Weekly Signals — 28 de junio de 2026"; dato `+64%` (cifra corta — fix de Day 23 verificado en vivo). Email recibido con CTA al archivo. 2ª publicación viva del MVP. Único Pro activo: `pablopirer@gmail.com` (cuenta de prueba).
- Conducido por **fetch en segundo plano** con la sesión admin (`generate-content` → `admin-publications` POST/PATCH → `send-weekly`). El render de la variación de ~26KB en el DOM congelaba el tab; los fetch ligeros son estables. Útil para futuras operaciones de admin.

**`sample-request` — paridad de robustez confirmada (sin cambios):** ya usa `extractJsonObject` y, ante JSON inválido, marca `generation_failed`, loguea el output crudo y envía alerta (awaited) a `ALERT_EMAIL`. Equivalente/superior al hardening de `generate-content`.

**Triaje de borradores:** eliminados los 2 Weekly obsoletos (13-jun, 23-jun). Conservados los 5 sample (direccionables por token; draft es su estado natural).

**Auditoría móvil + mejoras (commit `960d43b`):**
- **Nav hamburguesa:** `criterial-shared.js` inyecta un toggle en el header; `styles.v7.css` lo renderiza como overlay full-screen ≤600px (funciona en header oscuro y en `light-header`). Arregla "Acceso Pro" cortado e inaccesible en móvil. El toggle se inyecta por JS para no duplicar markup en las 12 HTML.
- **Tabla de operaciones del Weekly (`pub-ops-table`):** en ≤600px pasa a tarjetas apiladas con etiquetas (TIPO/SECTOR/TESIS por `nth-of-type`) en vez de tabla de 4 columnas.
- **Mapa de posicionamiento de la muestra (`renderMap` en `muestra.html`):** viewBox más alto (430×480) + burbujas menores en móvil para evitar solapamiento (alto renderizado 216→386px).
- **Copy de scope:** eliminado "real estate"/"capital markets" de `index`, `pricing`, `about`, `archive` → "M&A, private equity y deuda privada".
- **Despliegue:** CSS renombrado `styles.v6.css` → `styles.v7.css` + `criterial-shared.js` bump `?v=3` → `?v=4` en las 12 HTML (baile anti-caché de §7), preservando CRLF en `admin`/`archive`/`sample`. Verificado en vivo: los assets sirven el código nuevo.

**Estado en producción al cierre:** `sample-request` v24, `generate-content` v5, `get-sample` v1, `send-weekly` v1 — todas activas. CSS activo `styles.v7.css`; `criterial-shared.js` en `?v=4`. `origin/main` en `960d43b` (mobile) + el commit de esta documentación. Working tree limpio.

### Day 25 — Complete (2026-07-03)

**Mapa de posicionamiento interactivo en el Weekly Signals (Fase 1 de potenciar el entregable con interactividad, replicando la muestra):**
- **Objetivo:** el Weekly era "una newsletter bien maquetada" (texto estático); la muestra sí tenía el mapa interactivo. Se porta ese elemento al Weekly como centerpiece. Mockup validado con el usuario antes de construir.
- **Arquitectura (clave):** los datos del mapa viajan **dentro del HTML** como `<div class="pub-map" data-mapa="<base64 UTF-8>">` (no por `body_data`), así no hay cambios de esquema, ni de `get-publications`, ni de `admin-publications`. Se hidrata client-side con `window.hydratePubWidgets(root)` en `criterial-shared.js`, llamado por `archive.html` y `admin.html` tras el `innerHTML` (el JS dentro de un innerHTML no se ejecuta). Ver §7.
- **Prompt:** bloque `mapa` (idéntico al de la muestra) añadido al schema del Weekly en `_shared/prompts.ts` (EF) y `prompts/weekly-digest.es.md` (script).
- **EF `generate-content`:** emite el placeholder base64 (`toBase64Utf8`, defensivo: solo si ≥3 nodos válidos). Desplegada v6, luego **v7** con el fix de robustez (ver abajo). `verify_jwt: true`.
- **Renderer:** `hydratePubWidgets` porta `renderMap` de la muestra con clases `pub-map-*`. Mejoras de diseño sobre el original: etiquetas de cuadrante **fuera** del marco + centro de burbuja recortado dentro (elimina el solape etiqueta↔burbuja por construcción), radio menor, color de cuadrante uniforme, sin ticks "baja/alta" redundantes, y un **relax de anti-solape** con anclaje débil (separa solo los círculos que se pisan; desplazamiento ≤9px; las no-colisionantes no se mueven).
- **CSS:** `styles.v7.css` → **`styles.v8.css`** + bloque `.pub-map-*`. Assets bumpeados `?v=4` → `?v=5` en las 12 HTML (baile anti-caché de §7), CRLF preservado en `admin`/`archive`/`sample`.

**Fixes de robustez de generación (durante la validación Opción C — desplegar solo la EF y generar un Weekly real antes de pushear el sitio):**
- El primer intento de "Generar Weekly" dio **502 "no parseable"** (truncamiento: el Weekly ya rozaba 8000 tokens y el mapa lo pasó) y el segundo **"Error desconocido"** (timeout del gateway con 5 búsquedas). Diagnóstico vía logs `api` (dos `getUser` a ~8 min → descarta rate limit y confirma que la función arrancaba). Fix desplegado en v7: `max_tokens` 8000→**12000** y web search `max_uses` 5→**3**. Sincronizado el `max_tokens` del script de terminal.

**Validación end-to-end sobre datos reales:** borrador "Weekly Signals — 3 de julio de 2026" (id `15169f7d-7098-45e7-baea-a57725070426`) generado desde `admin.html` con la v7. El modelo produjo un mapa de alta calidad (6 sectores con operaciones reales y citadas: AIVORIQ/Alantra, Waterland/INCOSA, RealTime/STAY, Darlim, Lãberit/Gloin, TSB Sabadell→Santander). Renderizado en local con los datos reales: 0 solapes (actual + trayectoria), 0 colisiones de esquina, todo dentro del marco.

**Backlog (memoria `project_weekly_map_backlog`):** Fase 2 — ② operaciones filtrables/expandibles, ③ barras del "Dato de contexto"; y pendientes menores — `numero` fijo en "Nº 1" (error de contenido), a11y de teclado del mapa. (El solape burbuja↔burbuja de la revisión se resolvió con el relax.)

**Estado en producción al cierre:** `sample-request` v24, **`generate-content` v7**, `get-sample` v1, `send-weekly` v1 — todas activas. Assets nuevos (`styles.v8.css`, `criterial-shared.js?v=5`, hidratación) en la rama de Fase 1 / PR; el mapa queda vivo en el sitio al mergear. El borrador del 3-jul sigue sin publicar (decisión del usuario).

### Day 29 — En progreso (2026-07-05 → 2026-07-06)

**Rediseño del Brief Mensual como entregable premium de Pro (el pilar que justifica el precio), en dos iteraciones el mismo día.**

**Iteración 1 (v4) — construida, desplegada (`generate-content` v10) y AUDITADA.** Diagnóstico inicial: el Monthly era más débil que el Weekly (HTML plano del modelo). Se pasó a JSON + conversor `monthlyJsonToHtml`, número de edición server-side para ambos tipos, y elementos "El mes en cifras" (barras)/sectores tarjeta/catalizadores. Al generar el primer Brief real con el usuario, **el veredicto fue que seguía pareciendo un Weekly largo**: reutilizaba el lenguaje visual del Weekly (mismo mapa, tarjetas de sector, ritmo de secciones) y el panel de cifras macro no renderizaba (guarda anti-invención sin agregados citables). El número de edición server-side y el fix del título "Brief Mensual" del v4 se conservan.

**Iteración 2 (v5) — "El Informe".** Reconcepción de formato acordada con el usuario (informe editorial + panel de datos, mapa como tracker temporal):
- **Identidad de informe propia (`mb-*`), NO tarjetas `pub-*-new`:** masthead + dek, resumen ejecutivo, tesis multipárrafo long-form (serif), secciones numeradas, rotación de sectores en prosa, house view. Se LEE, no se escanea.
- **Panel de datos DERIVADO** de la tabla de operaciones citadas (`operaciones[]`): nº ops, desglose por sector (barras `pub-metrics`/`buildMetrics`), volumen divulgado, ticket medio → callouts `mb-stat` + barras. **Siempre presente y trazable** (fix del fallo del v4). `macro[]` = extra opcional con fuente.
- **Mapa = tracker temporal:** `buildMap` usa `xprev/yprev` (hace un mes) y el toggle pasa a "Ahora"/"Hace un mes" (retrocompatible: el Weekly con `x2/y2` sigue diciendo "Trayectoria").
- **Prompt v5** (`_shared/prompts.ts` + `prompts/monthly-brief.es.md`): schema nuevo (dek, resumen[], tesis[] párrafos, operaciones[] con `n_importe`, macro[], sectores prosa, mapa con xprev/yprev, perspectiva[]); exige ≥5 operaciones citadas.
- **CSS:** `styles.v9.css` → **`styles.v10.css`** + bloque `mb-*`. Assets `?v=7` → **`?v=8`** (relabel del mapa) en las 13 HTML (baile anti-caché §7), CRLF preservado.
- **Script:** `scripts/generate-content.sh` builder monthly reescrito a v5 (paridad), validado en local (7 secciones, panel derivado correcto: volumen=suma real, ticket=media, macro sin fuente filtrada).
- **v5 desplegado y generado:** `generate-content` v11 desplegada (verificada byte a byte), frontend en `main` (v10/?v=8), y primer Brief Mensual real generado desde admin con el usuario.

**Iteración 3 (v6) — pasada de solidez.** Auditado el v5 real, el veredicto fue que el concepto acertaba pero faltaba **solidez**: contenido escueto, panel de datos ligero, maqueta en tira estrecha. Tres palancas (acordadas con el usuario):
- **Densidad (prompt v6):** tesis 4-5 párrafos, **nuevo `contexto`** (macro), sectores `cuerpo` como array de 2-3 párrafos (3-4 sectores), **≥8 operaciones**, `operacion.analisis` array multipárrafo, `pullquote`. `maxTokens` 12000 → **16000**.
- **Panel de datos con peso:** "El mes en datos" enmarcado (`.mb-data`, ancho completo), más callouts con números grandes (+ "Sector más activo" derivado), barras re-estilizadas.
- **Jerarquía/diseño:** **break-out** (prosa en `.mb-col` ~660px; exhibits + reglas de sección a ancho completo ~920px), **pull-quote** (`.mb-quote`), **capitular** (`.mb-prose--lead`), masthead con byline, fuentes como lista de referencias.
- **CSS:** `styles.v10.css` → **`styles.v11.css`** (revisión fuerte de `mb-*`). `criterial-shared.js` **sin cambios** (buildMetrics/buildMap reusados) → **`?v=8` sin bump**. Script en paridad (validado: 8 secciones incl. Contexto, break-out, panel derivado, multipárrafo).
- **Validación local:** diseño confirmado por inspect (report 920 / columna 660 / exhibits 920, panel enmarcado #FBFAF8, pull-quote, capitular, responsive). **Pendiente:** desplegar `generate-content` v12 (v6), merge+push frontend (v11), generar/publicar el Brief real (acciones de prod, requieren aprobación).

### Day 28 — Complete (2026-07-05)

**Captura de email inline + newsletter de la edición abierta en `signals.html` (peldaño 2 de la escalera GTM).** El tráfico que traiga LinkedIn ya no se pierde: `signals.html` capta correos y funciona como newsletter con ciclo de vida propio (confirmación + aviso en cada edición + baja voluntaria). Sesión: plan mode → decisiones de negocio (modelo newsletter completo, captura en 3 sitios incl. lector) → build → deploy → validación E2E en prod.

- **Esquema (2 migraciones, aplicadas vía MCP):** tabla nueva `signals_subscribers` (lista de newsletter, separada de `leads`; `email UNIQUE` plano, `status active|unsubscribed`, `unsubscribe_token`, `source`; RLS on sin políticas públicas) y `publications.open_notified_at` (idempotencia del blast Free, separada de `notified_at` de Pro). Ver §2 schema notes.
- **3 EFs nuevas (deploy vía MCP):** `subscribe-signals` v1 (`verify_jwt:false`, secret `x-criterial-signal`; upsert idempotente que reactiva bajas; email de confirmación), `send-open-edition` v1 (`verify_jwt:true`, JWT admin como `send-weekly`; blast a la lista activa con deep-link `signals.html?edition=<id>` + baja por suscriptor), `unsubscribe-signals` v1 (`verify_jwt:false`, baja pública por token → página HTML). Bundle de las dos EFs de email: `_shared/resend.ts` **recortado** (solo `sendEmail` + helpers de newsletter), precedente de `generate-linkedin` — el repo mantiene el `resend.ts` completo con `sendSignalsConfirmation`/`sendOpenEditionEmail`.
- **`admin-publications` v7:** al publicar (PATCH→published) dispara Pro (`send-weekly`) **y** Free (`send-open-edition`) en paralelo, ambos en background e idempotentes por separado (`notified_at` / `open_notified_at`). Solo dispara Free para weekly con `body_public`.
- **`signals.html`:** banda de captura en 3 sitios (dedicada, estado vacío, lector), wiring del form con estados inline, deep-link `?edition=<id>` que auto-abre la edición. CSS `.sg-capture*` inline en la página → **sin** rename de `styles.v8.css` ni bump de `criterial-shared.js` (no se tocan).
- **Validación E2E en prod (2026-07-05):** suscripción → fila `active`/`signals_open` (HTTP 200); baja por token → `unsubscribed` + página HTML; re-suscripción (mayúsculas) → reactiva a `active` sin duplicado (colapso case-insensitive), token conservado. El blast al publicar hereda el patrón probado de `send-weekly` (no re-testeado en vivo; se ejercita en el próximo publish).
- **Pendiente:** el blast Free solo se dispara al publicar desde `admin-publications` (publicar por SQL directo no lo dispara, igual que Pro).

**Estado en producción al cierre:** `sample-request` v24, `generate-content` v9, `get-sample` v1, `send-weekly` v1, **`admin-publications` v7**, `get-public-editions` v1, **`subscribe-signals` v1**, **`send-open-edition` v1**, **`unsubscribe-signals` v1** — todas activas. Tablas: `signals_subscribers` nueva + `publications.open_notified_at`. Assets sin cambios (`styles.v8.css`, `criterial-shared.js?v=6`).

### Day 27 — Complete (2026-07-03)

**Salida al mercado free-first (LinkedIn): estrategia + Fase 1 (edición Free pública) + Fase 0 (posicionamiento).** Sesión de planificación (plan mode) → decisiones de negocio cerradas → build.

**Estrategia (escalera de 3 peldaños):** (1) LinkedIn (posts cortos, alcance), (2) edición Free pública en web (prueba de valor, captura de email), (3) Pro (producto objetivo). Decisiones cerradas: **hueco Free↔Pro por profundidad** (Free = el "qué pasó": apertura + señales + mapa; Pro = el "y qué": patrón/implicación, read-through, fuentes, Brief Mensual); **CM de LinkedIn asistido** (generador de copy, publicación manual — sin API, Fase 2 pendiente); **precio Pro diferido / acceso anticipado** durante la validación (KPI = audiencia, no facturación). Nombre del tier Free: **"Signals"** (el nav apunta al hub público; la edición se llama "Signals · Edición abierta").

**Fase 1 — edición Free pública (derivada del Weekly, una sola generación → dos proyecciones):**
- **Migración `20260703120000_publications_body_public.sql`:** `publications.body_public` (text, nullable) — proyección reducida en la MISMA fila que `body_markdown` (full/Pro). Aplicada en prod.
- **`generate-content` (v9):** parsea el JSON una vez y emite `weeklyJsonToHtml` (Pro completa) + `weeklyJsonToPublicHtml` (Free reducida); devuelve `public_html`. Verificado con fixture que la reducida no filtra contenido Pro.
- **`get-public-editions` (v1, `verify_jwt: false`):** EF pública que sirve solo `body_public` de filas `published`; nunca expone `body_markdown`. Smoke-test OK (`{editions: []}` sin auth).
- **`admin-publications` (v5) + `admin.html`:** propagan `body_public` al guardar el borrador.
- **`signals.html`:** lector público (sin login) que lista y renderiza las ediciones abiertas con `hydratePubWidgets` (mapa interactivo + a11y del Day 26) y CTA de upsell a Pro. Verificado en preview: estado vacío sin EF, modal + mapa hidratado (6 burbujas) con edición inyectada.
- **`scripts/generate-content.sh`:** paridad — produce y guarda `body_public` (builder reducido en heredoc con env; degradación segura → `null` si falla).

**Fase 0 — posicionamiento (copy + nav):**
- Nav "Signals" repuntado de `sample.html` → `signals.html` en las 12 HTML (CRLF preservado en admin/archive/sample).
- `pricing.html`: Free → "Signals · Abierto" (ediciones abiertas recurrentes, CTA a `signals.html`); Pro → "Pro · Acceso anticipado" (profundidad: Weekly completo, read-through, Brief Mensual, archivo). Hero CTAs → Leer Signals / Solicitar muestra.
- `index.html`: CTAs "Explorar Signals" → `signals.html`; etiqueta "Free" → "Abierto".
- Stripe intacto (test mode, no se toca por código).

**Auto-notificación a Pro al publicar (2026-07-04):** publicar ya no requiere pulsar "Enviar →". `admin-publications` PATCH (status→published) dispara la notificación automáticamente **reusando la EF `send-weekly`** (le reenvía el JWT admin de la petición) — sin duplicar la plantilla, `send-weekly` sin tocar. Idempotente vía nueva columna `publications.notified_at` (migración `20260704120000_publications_notified_at.sql`): solo envía si es null y la estampa tras el envío, así re-publicar no re-emite. Corre en background (`EdgeRuntime.waitUntil`, con fallback a await inline). Solo weekly/monthly. El botón manual "Enviar →" sigue como re-envío. Nota: publicar por SQL directo (fuera de admin-publications) no dispara la auto-notificación.

**Estado en producción al cierre:** `sample-request` v24, **`generate-content` v9**, `get-sample` v1, `send-weekly` v1, **`admin-publications` v6**, **`get-public-editions` v1** — todas activas. Columnas `body_public` y `notified_at` en prod. Editions publicadas: Nº 1-4 (11-jun, 28-jun, 3-jul, 4-jul); el 4-jul es el primero con edición abierta (`body_public`) — vivo en `signals.html`. Pendiente: Fase 2 (generador de posts LinkedIn), Brief Mensual, captura de email inline en signals.html.

### Day 26 — Complete (2026-07-03)

**Endurecimiento de Signals de cara al lanzamiento en LinkedIn (auditoría técnica del flujo Signals → punch list priorizado → pasos 1-3).**

**Paso 1 — Nº de edición del Weekly asignado en servidor (bug de contenido):**
- Causa raíz: el `numero` lo emitía el modelo, que copiaba el `1` literal del ejemplo del schema — todos los Weekly salían "Nº 1" (verificado en los 3 existentes); además el modelo no puede conocer la secuencia.
- Fix: se calcula en servidor como (Weekly publicados + 1). `generate-content` EF consulta el count antes de construir el HTML; `scripts/generate-content.sh` replica el cálculo vía PostgREST y lo pasa a la conversión por env var. Quitado `"numero"` del schema en ambos prompts (`_shared/prompts.ts` y `prompts/weekly-digest.es.md`). Fallback a Nº 1 si la query falla.
- `generate-content` desplegada **v8** (verify_jwt true) vía MCP de Supabase.
- Corrección histórica en DB: el Weekly del 28-jun (`f5bbbf6b…`) pasó de "Nº 1" a "Nº 2" (UPDATE quirúrgico del span). Archivo coherente: 11-jun=Nº 1, 28-jun=Nº 2, próximo=Nº 3.

**Pasos 2+3 — mapa de posicionamiento unificado + a11y de teclado:**
- **Paso 2 (parity):** el mapa de la muestra (`muestra.html renderMap`, el lead magnet público) usaba el renderer antiguo (etiquetas de cuadrante DENTRO del marco → colisión con burbujas, ticks "baja/alta", sin anti-solape). Portado el renderer bueno del Weekly (`hydratePubWidgets`): etiquetas fuera del marco, centros recortados dentro (`fit`), relax anti-solape, sin ticks redundantes, corner labels con color uniforme.
- **Paso 3 (a11y):** burbujas focusables (`tabindex=0`, `role=button`, `aria-label`) con foco/Enter/Espacio que abren el detalle, en los **dos** renderers (`renderMap` y `buildMap`); el SVG pasa de `role="img"` a `role="group"` para exponer las burbujas a lectores de pantalla. Foco visible en la muestra (`.mu-bub:focus-visible`); el Weekly usa el outline por defecto (no se renombró el CSS por una sola regla — `styles.v8.css` sin cambios).
- Cache-bust: `criterial-shared.js` `?v=5` → **`?v=6`** en las 12 HTML (CRLF preservado en `admin`/`archive`/`sample`).
- **Validado en preview con datos reales** (samples con schema de posicionamiento Fase 3, p.ej. `0b114ddd` 6 nodos): desktop (640×400) y móvil (430×480), 0 solapes, 0 fuera de marco, teclado + toggle de trayectoria OK, en ambos renderers. (Nota: algunas muestras antiguas usan el schema Fase 2 de grafo de flujos sin `x`/`y`; `renderMap` las descarta correctamente y no pinta mapa.)

**Backlog restante (memoria `project_weekly_map_backlog`):** Fase 2 — ② operaciones filtrables/expandibles, ③ barras del "Dato de contexto". Pendiente de negocio: cadencia semanal, formato reducido para LinkedIn, primer encargo Advisory.

**Estado en producción al cierre:** `sample-request` v24, **`generate-content` v8**, `get-sample` v1, `send-weekly` v1. Assets `styles.v8.css` + **`criterial-shared.js?v=6`**. Rama `fix/weekly-edition-number` (3 commits) pendiente de push/merge; el paso 1 ya está activo en prod vía el deploy de la EF, los pasos 2-3 van vivos al mergear + desplegar Pages.

### Day 19 — Complete (2026-06-11)
- **Keep-alive reparado:** el workflow `keep-alive.yml` pingaba `get-publications` (Edge Function) en lugar de hacer una query real a la DB. Supabase no registraba actividad de base de datos y pausó el proyecto. Fix: el workflow ahora hace `GET /rest/v1/publications?select=id&limit=1` con headers `apikey` y `Authorization`. Anon key almacenada como secret `SUPABASE_ANON_KEY` en GitHub Actions. Validado con HTTP 200.
- **Migración de entorno de desarrollo:** WSL Ubuntu eliminado. Stack completo instalado en Windows nativo (Git 2.54, Node.js v26, npm v11, Supabase CLI v2.105, Claude Code v2.1.173). Repo clonado en `C:\Users\pablo\projects\criterial-signals`. Scripts bash ejecutables desde Git Bash. Line endings corregidos con `core.autocrlf false`.

---

## Contact and ownership

This project is owned and operated by Pablo Pirer.
