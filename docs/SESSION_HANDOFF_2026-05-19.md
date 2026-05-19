# Session Handoff — 2026-05-19

## Current repository state

- **Branch:** main
- **Working tree:** clean at last validation
- `main` local and `origin/main` were aligned after the latest merges
- No open local branches expected

---

## Completed in this session

| PR | Branch | What it did |
|---|---|---|
| #1 | `docs/clean-claude-md` | CLAUDE.md restructured as operational/technical source of truth (8-section format: §0–§8) |
| #2 | `docs/update-readme` | README.md updated as public-facing overview |
| #3 | `docs/update-operating-blueprint` | OPERATING_BLUEPRINT.md aligned: `styles.css` → `styles.v4.css` (active CSS) |
| #4 | `fix/welcome-archive-url` | Fixed stale archive URL in `supabase/functions/_shared/resend.ts`: `pablopirer.github.io/criterial-signals/archive.html` → `https://criterialsignals.com/archive.html` |
| #5 | `fix/bump-shared-js-v3` | Bumped `criterial-shared.js?v=2` → `?v=3` across all 10 public HTML pages |
| #6 | `docs/clean-stale-model-refs` | Removed stale `claude-haiku` references from `sample-request/README.md`, `.env.local.example`, and `_shared/anthropic.ts` comment |
| #7 | `fix/harden-content-scripts` | Hardened recurring content scripts: `generate-content.sh` now uses `claude-sonnet-4-6`; `publish-draft.sh` no longer fails silently (uses `RETURNING`, checks row count, exits non-zero on failure) |

---

## Production-sensitive actions performed

| Action | Details |
|---|---|
| Supabase Edge Function redeployed | `welcome-subscriber` — to pick up updated `ARCHIVE_URL = https://criterialsignals.com/archive.html` (PR #4 fix) |
| No further redeployment currently required | Unless `_shared/resend.ts` or `welcome-subscriber/index.ts` changes again |

---

## Current Weekly Signals draft

| Field | Value |
|---|---|
| Draft ID | `78bd30ab-7892-44ce-aea1-33549717711c` |
| Status | `draft` (not published) |
| Title | `Weekly Signals — 19 de mayo de 2026` |
| Period | 2026-05-18 to 2026-05-19 |
| Body header | `Semana del 18 al 19 de mayo de 2026` |
| Model used | `claude-sonnet-4-6` |
| Variation selected | 2 |
| Backup | `~/criterial-backups/weekly-draft-backup-78bd30ab.txt` (outside repo) |

**The draft has NOT been published.** Pro subscribers cannot see it yet.

### How the draft was created

`generate-content.sh weekly` was run from Terminal Ubuntu. The script printed `Guardando borrador en Supabase... FAILED`, but the INSERT actually succeeded — the draft record is confirmed in the database. The failure was a false positive in the script's ID-capture logic after the `supabase db query --linked` call.

---

## Open bug — generate-content.sh false FAILED after INSERT

**Symptom:** After a successful INSERT into `publications`, the script reports `FAILED` and exits without printing the publication ID. The INSERT itself succeeded.

**Root cause (likely):** The script captures the returned ID by piping `supabase db query --linked ... RETURNING id` into Python. The `2>/dev/null || true` pattern on the `supabase` call suppresses errors; if the Supabase CLI output format or JSON structure differs from what the Python parser expects, `PUB_ID` comes back empty and the script exits.

**Impact:** The weekly draft exists in the database but the operator has no script-printed ID. The ID must be retrieved manually from Supabase (`SELECT id FROM publications ORDER BY created_at DESC LIMIT 1`). The draft cannot be published via the current `publish-draft.sh` without the ID.

**Recommended fix:** Create a fix branch for `scripts/generate-content.sh`:
- Inspect the actual output of `supabase db query --linked` with `RETURNING id`
- Fix the Python ID-extraction logic to match the actual JSON structure
- Test the parsing with the known draft record before running a new generation

**Do not rerun `generate-content.sh weekly`** until this bug is fixed, unless explicitly accepted — it will call Anthropic 3× and may create a second draft.

---

## Recommended next tasks (priority order)

1. **Fix `generate-content.sh` false FAILED bug** — create a fix branch, inspect the Supabase CLI output format, correct the ID-capture logic.
2. **Merge the fix** after review.
3. **Review the current weekly draft** — read `~/criterial-backups/weekly-draft-backup-78bd30ab.txt` or query Supabase directly.
4. **Only after explicit approval**, publish:
   ```bash
   bash scripts/publish-draft.sh 78bd30ab-7892-44ce-aea1-33549717711c
   ```

---

## Operating workflow going forward

| Agent | Role |
|---|---|
| **Claude Code** | Primary executor: scoped branches, edits, checks, commits, pushes, PRs |
| **Hermes** | Read-only auditor: reviews diffs, repo state, and production-sensitive changes |
| **ChatGPT** | Coordinator: decisions, risk framing, task sequencing, prompt writing |
| **Terminal Ubuntu** | Final production actions; emergency/manual recovery; cases where Claude Code cannot act |

Avoid slow manual step-by-step terminal workflows for changes Claude Code can handle safely.

---

## Hard stops — explicit approval required before any of the following

- Publishing the current weekly draft
- Deploying any Supabase function
- Running `scripts/generate-content.sh`
- Running `scripts/publish-draft.sh`
- Pushing directly to main
- Modifying Stripe, Resend, Supabase dashboard, DNS, GitHub Pages settings, or secrets
- Reading or exposing `.env.local`
