# sample-request

Edge Function that replaces the Make scenario `sample-request-mvp`. It accepts
a POST from the public sample form, registers the lead and the request in
Supabase, generates a sample brief via the Anthropic API, and stores the
brief in `publications`.

## Required environment variables

Set these as Function Secrets in Supabase (`supabase secrets set`):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | API key for the Anthropic Messages API. |
| `ANTHROPIC_MODEL` | Optional override of the default model ID. Defaults to `claude-haiku-4-5-20251001`. |
| `SAMPLE_REQUEST_SECRET` | Shared secret expected in the `x-criterial-signal` header. The web form must send the same value. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase
automatically — do not set them as secrets.

## Local development

```bash
# Serve locally with hot reload. Reads .env.local for env vars.
supabase functions serve sample-request --env-file .env.local
```

`.env.local` (gitignored) should contain:

```
ANTHROPIC_API_KEY=sk-ant-...
SAMPLE_REQUEST_SECRET=some-long-random-string
```

## Smoke test

Once the function is running locally:

```bash
curl -i -X POST http://localhost:54321/functions/v1/sample-request \
  -H "content-type: application/json" \
  -H "x-criterial-signal: $SAMPLE_REQUEST_SECRET" \
  -d '{
    "full_name": "Test User",
    "email": "test+d2@criterialsignals.com",
    "company_name": "Test Capital",
    "website": "https://example.com",
    "interest_type": "Mid-market M&A in Iberian industrials",
    "notes": "Day 2 smoke test"
  }'
```

Expected response: `200 OK` with body `{"ok":true,"request_id":"<uuid>"}`.

Verify in Supabase:

```sql
select id, email, source, status, created_at
from leads where email = 'test+d2@criterialsignals.com';

select id, lead_id, topic, status, created_at
from sample_requests order by created_at desc limit 5;

select id, type, title, status, length(body_markdown) as body_len, created_at
from publications order by created_at desc limit 5;
```

## Migration cutover

The function does NOT replace Make automatically. Cutover steps:

1. Deploy this function: `supabase functions deploy sample-request`.
2. Set the three secrets listed above.
3. Run the smoke test above against the deployed URL (replace `localhost:54321`
   with `https://<project>.supabase.co`).
4. Verify the rows appear in Supabase.
5. Update `web/sample.html` to POST to the function URL with the
   `x-criterial-signal` header. (Day 4 work — until then, leave Make running.)
6. After 24-48h of clean traffic on the new function, deactivate (do not
   delete) the Make scenario.

## Failure modes and what they mean

| Symptom | Likely cause |
| --- | --- |
| `401 Unauthorized` | The form is not sending `x-criterial-signal`, or the value differs from `SAMPLE_REQUEST_SECRET`. |
| `400 Field 'email' is required` | Form posted without an email or with an empty one. |
| Lead saved but `sample_requests.status = 'generation_failed'` | Anthropic call failed. Check function logs for the exact error from the Anthropic API. The lead is intact and the request can be re-driven manually. |
| Lead saved, request `status = 'queued'` and never moves | Function crashed between the request insert and the Anthropic call. Check logs. |
