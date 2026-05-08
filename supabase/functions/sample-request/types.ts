/**
 * Types for the sample-request Edge Function.
 *
 * These mirror the contract the public web form (`sample.html`) sends today,
 * which is the same contract the Make webhook expected. Until Day 4, when we
 * touch /web, the function MUST accept exactly these fields.
 */

/**
 * The JSON body posted by sample.html (and previously by Make's webhook).
 * All fields are strings or undefined; the form does not send nested
 * structures or arrays.
 */
export interface SampleRequestPayload {
  full_name?: string;
  email?: string;
  company_name?: string;
  website?: string;
  interest_type?: string;
  notes?: string;
}

/**
 * Subset of the `leads` table columns we read or write in this function.
 * Keep this in sync with the schema described in OPERATING_BLUEPRINT.md
 * and the migrations under /supabase/migrations.
 */
export interface LeadRow {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  website: string | null;
  interest_type: string | null;
  source: string;
  status: string;
  notes: string | null;
}

/**
 * Subset of the `sample_requests` table columns we write in this function.
 */
export interface SampleRequestRow {
  id: string;
  lead_id: string;
  topic: string | null;
  status: string;
}

/**
 * Subset of the `publications` table columns we write in this function.
 */
export interface PublicationRow {
  id: string;
  type: string;
  title: string;
  body_markdown: string;
  status: string;
}

/**
 * Shape of the JSON response the function returns to the caller. We keep
 * the public response minimal: the form just needs to know the request
 * was accepted. We do NOT return generated content or internal IDs to
 * the unauthenticated browser caller.
 */
export interface SampleRequestResponse {
  ok: true;
  request_id: string;
}

export interface SampleRequestErrorResponse {
  ok: false;
  error: string;
}
