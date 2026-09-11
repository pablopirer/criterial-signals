/**
 * Shared helper: upsert a lead by email with "keep-first-source,
 * fill-blanks-only" merge semantics.
 *
 * `leads.email` is UNIQUE, so a second submission from the same address must
 * never error out and must never duplicate the row. Supabase's `.upsert()`
 * can't express "only fill columns that are currently empty" — `onConflict`
 * always replaces the whole row — so this does an explicit SELECT and then
 * branches (Checkpoint 2 · Fase 1, decision 2a):
 *
 *   - New email   -> INSERT. `source` is whatever the caller passes (the
 *     form/flow that created this lead). `last_contact_at` is set to now.
 *   - Known email -> UPDATE. `source` is NEVER touched — the first source
 *     wins. `last_contact_at` is always refreshed to now. Every other
 *     optional column is filled ONLY if it is currently null/blank; a value
 *     the lead already has is never overwritten by a later, possibly
 *     blanker submission coming from a different form.
 *
 * `is_test` is intentionally never set here — it stays on the column
 * DEFAULT true (see supabase/migrations/20260911120000_add_is_test_flag.sql).
 * Do not change that default from this helper.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface UpsertLeadInput {
  email: string;
  /** Only used when the lead does not exist yet. */
  source: string;
  full_name?: string | null;
  company_name?: string | null;
  website?: string | null;
  interest_type?: string | null;
  notes?: string | null;
}

export interface UpsertLeadResult {
  id: string;
  isNew: boolean;
}

interface ExistingLeadRow {
  id: string;
  full_name: string | null;
  company_name: string | null;
  website: string | null;
  interest_type: string | null;
  notes: string | null;
}

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

export async function upsertLeadByEmail(
  supabase: SupabaseClient,
  input: UpsertLeadInput,
): Promise<UpsertLeadResult> {
  const email = input.email.trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("leads")
    .select("id, full_name, company_name, website, interest_type, notes")
    .eq("email", email)
    .maybeSingle();

  if (selectError) throw selectError;

  if (!existing) {
    const { data, error } = await supabase
      .from("leads")
      .insert({
        email,
        full_name: input.full_name ?? null,
        company_name: input.company_name ?? null,
        website: input.website ?? null,
        interest_type: input.interest_type ?? null,
        notes: input.notes ?? null,
        source: input.source,
        last_contact_at: nowIso,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: data.id as string, isNew: true };
  }

  const row = existing as ExistingLeadRow;

  const fillIfEmpty = (
    currentVal: string | null,
    incoming: string | null | undefined,
  ): string | null => (isBlank(currentVal) ? (incoming ?? null) : currentVal);

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      last_contact_at: nowIso,
      full_name: fillIfEmpty(row.full_name, input.full_name),
      company_name: fillIfEmpty(row.company_name, input.company_name),
      website: fillIfEmpty(row.website, input.website),
      interest_type: fillIfEmpty(row.interest_type, input.interest_type),
      notes: fillIfEmpty(row.notes, input.notes),
      // `source` intentionally absent — the first source is kept.
    })
    .eq("id", row.id);

  if (updateError) throw updateError;

  return { id: row.id, isNew: false };
}
