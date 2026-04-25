# Criterial Signals — MVP Operating Blueprint v1

## 1. Objetivo del MVP

Criterial Signals es un MVP orientado a validar una ruta simple de captación, generación de muestra y monetización para un producto de inteligencia de mercado centrado en Iberia.

### Lo que el MVP ya hace
- Captar leads desde una página web pública.
- Registrar automáticamente leads en Supabase.
- Registrar solicitudes de muestra (`sample_requests`).
- Generar una muestra con OpenAI.
- Guardar esa muestra en `publications`.
- Ofrecer un checkout real del plan Pro mediante Stripe Payment Link.
- Registrar automáticamente suscriptores pagados en `subscribers` a través de webhook de Stripe y Make.

### Lo que el MVP todavía no hace
- Entregar automáticamente la muestra al usuario por email.
- Dar acceso autenticado o diferenciado a contenido premium.
- Generar de forma recurrente weekly digests o monthly briefs en producción.
- Gestionar deduplicación robusta, idempotencia avanzada o manejo exhaustivo de errores.

---

## 2. Stack tecnológico

### Frontend / web pública
- **GitHub Pages**
- HTML + CSS estático
- Repositorio: `criterial-signals`

### Base de datos
- **Supabase**

### Automatización
- **Make**

### Generación de contenido
- **OpenAI API**

### Cobro
- **Stripe**
- Payment Link para el plan Pro
- Webhook Stripe → Make para alta automática de subscriber

---

## 3. Arquitectura general

## 3.1 Flujo de sample request

**Usuario web → `sample.html` → webhook de Make → `leads` → `sample_requests` → OpenAI → `publications` → `request-received.html`**

Resultado:
- se crea un lead,
- se registra una solicitud de muestra,
- se genera una publicación sample en borrador.

## 3.2 Flujo de pago / suscripción

**Usuario web → `pricing.html` o CTA desde `sample.html` → Stripe Payment Link Pro → Stripe Checkout → `success.html` → Stripe webhook → Make → `subscribers`**

Resultado:
- se realiza el pago,
- Stripe envía `checkout.session.completed`,
- Make registra el subscriber en Supabase.

---

## 4. Base de datos Supabase

## 4.1 Tablas creadas

### `leads`
Función:
- almacenar leads captados desde el formulario de muestra.

Campos relevantes:
- `id`
- `created_at`
- `full_name`
- `email`
- `company_name`
- `website`
- `interest_type`
- `source`
- `status`
- `last_contact_at`
- `notes`

### `subscribers`
Función:
- almacenar usuarios/suscriptores que han completado el checkout.

Campos relevantes:
- `id`
- `created_at`
- `email`
- `full_name`
- `company_name`
- `plan`
- `status`
- `stripe_customer_id`
- `stripe_subscription_id`
- `subscription_start`
- `renewal_date`

### `source_items`
Función:
- tabla pensada para futuras fuentes, señales o inputs de mercado.
- actualmente no es crítica en el flujo MVP ya validado.

### `publications`
Función:
- almacenar muestras y publicaciones generadas.

Campos relevantes:
- `id`
- `created_at`
- `type`
- `title`
- `period_start`
- `period_end`
- `body_markdown`
- `body_html`
- `pdf_url`
- `status`

### `sample_requests`
Función:
- registrar solicitudes de muestra y vincularlas a un lead.

Campos relevantes:
- `id`
- `created_at`
- `lead_id`
- `topic`
- `status`
- `sample_publication_id`
- `sent_at`

### `outreach_events`
Función:
- tabla reservada para seguimiento futuro de outreach / eventos comerciales.
- no está aún integrada en el flujo activo.

---

## 5. Escenarios Make

## 5.1 Escenario `sample-request-mvp`

### Finalidad
Procesar una solicitud de muestra lanzada desde la web.

### Orden actual correcto de módulos
1. **Webhook**
2. **HTTP → `leads`**
3. **HTTP → `sample_requests`**
4. **OpenAI**
5. **HTTP → `publications`**

### Detalle de cada módulo

#### 1. Webhook
- recibe payload JSON desde `sample.html`
- campos esperados:
  - `full_name`
  - `email`
  - `company_name`
  - `website`
  - `interest_type`
  - `notes`

#### 2. HTTP → `leads`
Inserta una fila en `leads`.

Payload lógico:
- `full_name` ← webhook
- `email` ← webhook
- `company_name` ← webhook
- `website` ← webhook
- `interest_type` ← webhook
- `source` = `sample_form`
- `status` = `new`
- `notes` ← webhook

#### 3. HTTP → `sample_requests`
Inserta una fila en `sample_requests`.

Payload lógico:
- `lead_id` ← `id` devuelto por el módulo HTTP de `leads`
- `topic` ← webhook `interest_type`
- `status` = `queued`

#### 4. OpenAI
Genera un sample brief usando el interés principal del usuario.

Prompt base:
- sample breve
- español profesional
- estructura:
  - Executive Snapshot
  - Three Relevant Signals
  - What to Watch

#### 5. HTTP → `publications`
Inserta una fila en `publications`.

Payload lógico:
- `type` = `sample`
- `title` = `Auto-generated sample brief`
- `body_markdown` ← texto generado por OpenAI
- `status` = `draft`

### Estado actual
- validado de extremo a extremo desde web real
- funcional

---

## 5.2 Escenario `stripe-subscription-mvp`

### Finalidad
Registrar automáticamente suscriptores tras el pago en Stripe.

### Orden actual
1. **Webhook**
2. **HTTP → `subscribers`**

### Detalle

#### 1. Webhook
- recibe eventos reales de Stripe
- evento usado:
  - `checkout.session.completed`

#### 2. HTTP → `subscribers`
Inserta una fila en `subscribers`.

Payload lógico:
- `email` ← email del checkout Stripe
- `full_name` ← nombre del cliente si está disponible
- `company_name` ← vacío por ahora
- `plan` = `pro`
- `status` = `active`
- `stripe_customer_id` ← `customer`
- `stripe_subscription_id` ← `subscription`

### Estado actual
- validado con compra real en test mode
- funcional

---

## 6. Web pública

## 6.1 Páginas existentes

### `index.html`
Home principal del proyecto.

### `sample.html`
Página de solicitud de muestra con formulario real conectado al webhook de Make.

### `pricing.html`
Página de pricing.
Actualmente el plan Pro enlaza al Payment Link de Stripe.

### `about.html`
Página descriptiva del producto.

### `success.html`
Página de éxito tras completar el pago.

### `cancel.html`
Página de cancelación o no finalización del pago.

### `archive.html`
Página placeholder para archivo de publicaciones.

### `request-received.html`
Página de confirmación tras enviar correctamente el formulario de sample request.

---

## 7. Stripe

## 7.1 Configuración actual

### Producto
- `Criterial Signals Pro`

### Precio
- recurrente mensual
- `249 EUR / mes`

### Enlace de pago
- Payment Link del plan Pro
- conectado ya a la web

### Redirect post-pago
- `success.html`

### Cancel URL
- no aplica en el enfoque actual basado en Payment Links

## 7.2 Webhook Stripe
- endpoint configurado hacia Make
- evento escuchado:
  - `checkout.session.completed`

### Estado
- validado con evento real en test mode

---

## 8. OpenAI

## 8.1 Uso actual
OpenAI se usa para generar muestras breves basadas en `interest_type`.

## 8.2 Estado
- API con billing operativo
- integrada en Make
- generando contenido real correctamente

---

## 9. Estado operativo actual

## 9.1 Validado
- web pública activa
- formulario funcional
- webhook Make funcional
- leads guardados
- sample_requests guardadas
- sample generado y guardado
- checkout Stripe funcional
- success page funcional
- subscriber guardado tras pago

## 9.2 No validado todavía
- entrega automática del sample al usuario
- acceso premium real tras pago
- onboarding del subscriber
- uso recurrente semanal/mensual en producción
- email transaccional
- deduplicación e idempotencia robusta

---

## 10. Riesgos y limitaciones actuales

### 10.1 Manejo de errores
- Make puede desactivar escenarios ante errores si una inserción falla.
- Falta reforzar tratamiento de errores e idempotencia.

### 10.2 Duplicados
- un mismo usuario puede generar múltiples leads o requests si reenvía formularios.
- un mismo pago puede necesitar protección adicional contra duplicados.

### 10.3 Entrega
- el usuario no recibe todavía la muestra por email ni accede automáticamente al contenido generado.

### 10.4 Producto recurrente
- no existe aún un motor de producción recurrente de weekly digest / monthly brief.

### 10.5 Dependencia de herramientas
- el sistema depende hoy de:
  - GitHub Pages
  - Supabase
  - Make
  - OpenAI
  - Stripe

---

## 11. Próximos pasos recomendados

## 11.1 Prioridad inmediata
**Optimización de conversión de la web**

Objetivos:
- mejorar copy
- reducir fricción
- clarificar propuesta de valor
- empujar mejor hacia Pro

## 11.2 Prioridad siguiente
**Construcción del motor de contenido recurrente**

Objetivos:
- weekly digest
- monthly brief
- archivo más útil
- entregables repetibles

## 11.3 Prioridad posterior
**Entrega y activación**
- email transaccional
- onboarding del suscriptor
- acceso al contenido
- vínculo entre `sample_requests` y `publications`

---

## 12. Convenciones y notas operativas

### 12.1 Entorno
Todo lo validado hasta ahora se ha probado en:
- GitHub Pages público
- Supabase operativo
- Stripe test mode
- Make activo

### 12.2 Criterio de éxito usado
Cada flujo se ha considerado válido cuando:
- la acción se ejecuta desde web o Stripe,
- Make la procesa,
- y la fila correspondiente aparece en Supabase.

### 12.3 Filosofía de construcción seguida
- primero flujos reales,
- luego robustez,
- luego sofisticación.

---

## 13. Resumen ejecutivo final

Criterial Signals dispone ya de un MVP operativo capaz de:
- captar leads desde una web pública,
- generar una muestra automatizada,
- cobrar un plan Pro mediante Stripe,
- y registrar automáticamente suscriptores en base de datos.

El sistema todavía no está en fase de producto plenamente autónomo y maduro, pero ya ha superado la fase conceptual y dispone de:
- captación real,
- generación real,
- cobro real,
- registro real de suscriptores.

La prioridad siguiente recomendada es optimizar la conversión comercial antes de ampliar la sofisticación del motor de contenido.
