# Criterial — Operating Blueprint v2

## 1. Qué es Criterial

Criterial es una firma analítica independiente especializada en el mercado español de inversión privada. Ofrece dos líneas de producto:

- **Advisory** — trabajo analítico bajo demanda: valoraciones de empresa, análisis sectoriales, pitch decks.
- **Criterial Signals** — publicación editorial con señales semanales y briefs mensuales sobre M&A, real estate y capital markets en España.

---

## 2. Stack tecnológico

### Frontend
- **GitHub Pages** — HTML + CSS estático en la raíz del repositorio
- Dominio: `criterialsignals.com`
- Sistema visual: EB Garamond + Inter, heroes con paisajes paralax, cursor mix-blend-mode

### Backend
- **Supabase** — base de datos PostgreSQL + Edge Functions + Auth

### Automatización
- **Make** — desactivado. Todos los flujos gestionados por Edge Functions.

### Generación de contenido
- **Anthropic API** — modelo `claude-sonnet-4-6`, con override vía `ANTHROPIC_MODEL`

### Pagos
- **Stripe** — Payment Links + webhook → Edge Function `stripe-webhook` → Supabase
- Plan Pro: 9,90 €/mes (test mode)

### Email
- **Resend** — `noreply@criterialsignals.com`, dominio verificado

---

## 3. Arquitectura de flujos

### 3.1 Sample request
`sample.html` → Edge Function `sample-request` → `leads` + `sample_requests` → Anthropic API → `publications` (draft) → Resend → email usuario → `request-received.html`

### 3.2 Advisory
`encargos.html` → Edge Function `advisory-request` → Resend → email interno (criterialam@gmail.com) + confirmación usuario → `advisory-received.html`

### 3.3 Pago / suscripción
`pricing.html` → Stripe Payment Link → Stripe Checkout → `success.html` → Stripe webhook → Edge Function `stripe-webhook` → upsert `subscribers`

### 3.4 Welcome email
INSERT en `subscribers` → Supabase Database Webhook → Edge Function `welcome-subscriber` → Resend → email bienvenida

### 3.5 Archivo Pro
`archive.html` → Supabase Auth magic link → Edge Function `get-publications` → publicaciones `weekly` + `monthly` + `sample` con status `published`

---

## 4. Edge Functions

| Función | Descripción |
|---|---|
| `sample-request` | Lead capture, brief generation, email delivery |
| `advisory-request` | Formulario Advisory, notificación interna y confirmación usuario |
| `stripe-webhook` | Recibe eventos Stripe, verifica firma, upsert subscribers |
| `welcome-subscriber` | Triggered por DB Webhook en INSERT a subscribers |
| `get-publications` | Acceso autenticado al archivo Pro (weekly, monthly, sample) |
| `_shared/anthropic.ts` | Cliente Anthropic compartido |
| `_shared/supabase.ts` | Cliente Supabase compartido |
| `_shared/resend.ts` | Templates HTML y envío de emails |

---

## 5. Base de datos

### `leads`
Leads captados desde `sample.html`. Campos: `id`, `created_at`, `full_name`, `email`, `company_name`, `website`, `interest_type`, `source`, `status`, `notes`. Unique index en `lower(email)`.

### `subscribers`
Suscriptores Pro. Campos: `id`, `created_at`, `email`, `full_name`, `company_name`, `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`. Unique constraint en `email`.

### `sample_requests`
Solicitudes de muestra vinculadas a leads. Campos: `id`, `created_at`, `lead_id`, `topic`, `status`.

### `publications`
Publicaciones generadas. Campos: `id`, `created_at`, `type` (sample/weekly/monthly), `title`, `period_start`, `period_end`, `body_markdown`, `status` (draft/published).

### `source_items`
Reservada para futuras fuentes de señales. No activa.

### `outreach_events`
Reservada para seguimiento comercial. No activa.

---

## 6. Web pública

### Páginas principales
- `index.html` — Home de firma: posicionamiento, Advisory y Signals
- `encargos.html` — Advisory: servicios y formulario de contacto
- `pricing.html` — Signals: planes Free y Pro
- `about.html` — Nosotros: presentación de la firma
- `archive.html` — Archivo Pro: autenticado via magic link

### Páginas transaccionales
- `sample.html` — Formulario de solicitud de muestra
- `request-received.html` — Confirmación de muestra
- `advisory-received.html` — Confirmación de consulta Advisory
- `success.html` — Suscripción Pro activada
- `cancel.html` — Suscripción no completada

### Assets compartidos
- `styles.css` — Sistema de diseño completo
- `criterial-shared.js` — Cursor, parallax, scroll reveal, page transition

---

## 7. Stripe

- Producto: `Criterial Signals Pro`
- Precio: 9,90 €/mes (test mode)
- Webhook: `checkout.session.completed` → Edge Function `stripe-webhook`
- Redirect post-pago: `success.html`

---

## 8. Supabase Auth

- Magic link para acceso al archivo Pro
- Site URL: `https://criterialsignals.com/archive.html`
- Redirect URL: `https://criterialsignals.com/archive.html`
- Template magic link: HTML personalizado con sistema visual Criterial

---

## 9. Estado operativo actual

### Validado y en producción
- Web pública con identidad visual completa
- Formulario de muestra → brief generado → email entregado
- Formulario Advisory → notificación interna + confirmación usuario
- Checkout Stripe → suscriptor registrado → welcome email
- Archivo Pro autenticado con magic link
- 9 publicaciones en archivo (1 weekly, 8 samples)

### No construido todavía
- Motor de contenido recurrente automatizado (weekly/monthly)
- Company Snapshot como producto on-demand
- Distribución LinkedIn
- Conversión de leads a Pro (outreach)

---

## 10. Próximos pasos

### Prioridad 1 — Contenido recurrente
- Establecer cadencia semanal con `scripts/generate-content.sh weekly`
- Establecer cadencia mensual con `scripts/generate-content.sh monthly`
- Publicar primer Weekly Signals de producción

### Prioridad 2 — Advisory
- Conseguir primer encargo real
- Validar formato y entregables con cliente real

### Prioridad 3 — Distribución
- Company Snapshot como producto LinkedIn
- Lead capture desde LinkedIn hacia `sample.html`

---

## 11. Convenciones operativas

- Make está desactivado. Ningún flujo activo depende de Make.
- Todos los cambios de schema van por migraciones en `/supabase/migrations/`.
- Secrets nunca en el código — siempre vía `supabase secrets set`.
- El archivo `CLAUDE.md` es la fuente de verdad técnica. Este blueprint es la visión de negocio.
