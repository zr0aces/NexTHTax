# Open existing contents for editing

Status: implemented and automated verification passed. User requested local fix without a GitHub issue.

## Reproduction and cause

- User reported the old-data copy-upgrade screen, with zero document records, when opening an existing folder.
- Initial hypotheses: loaded documents hidden by the calculator; a newer empty tax year selected; unsupported opening of old schemas. The supplied screen identifies the third mechanism. No evidence of lost or unreadable document bytes.
- Root path: `App.openFolder` → `openWorkspace` → `decodeManifest` → all valid schema-1/2 files returned `upgradeRequired`, so no editable session was attached.
- Red regression: `rtk npm test -- --run tests/integration/existingWorkspace.test.ts` failed both old-schema cases: expected a session, received `upgradeRequired`. The existing reopen browser tests covered only current-format data and manually navigated to documents.

## Fix and invariants

- Normalize supported old schemas only in memory, retaining revision and file bytes when opening. Sessions remember their original on-disk version and encode edits through that version's strict schema.
- Schema 1 retains basic documents/attachments; schema 2 retains subtypes, worksheets and scenarios. New facts that cannot fit the opened format fail before writes, rather than being silently dropped or upgrading the folder in place.
- Existing locking, conflict detection, serialized commits, verified writes, pending reconciliation and original-byte recovery snapshots remain in force. Newer unknown schemas remain rejected.
- Old-format document records open selected for editing. Saved old-format worksheets take precedence over newer empty year entries.
- The preserved-original copy upgrade remains available explicitly for newer-format features. Hide/disable incompatible subtype/calculation/plan controls until the user opts into that copy. Current-format opening remains unchanged.
- JSON/ZIP import conversion and existing migration safety are unchanged. The compatibility writer does not modify those public contracts or introduce a new storage version.

## Evidence ledger

1. Existing subtype browser tests passed (2/2), demonstrating that current-format persistence itself worked; they did not reproduce the user's upgrade gate.
2. New old-format session tests failed (2/2) before production changes, matching the reported gate.
3. After the storage adapter, both cases passed: open without rewriting data.json, edit, save with original schema, reopen.
4. Extended integration proof covers document/attachment-reference preservation, original recovery bytes, refusal of unrepresentable facts, read-back failure reconciliation, and second-opener read-only locks.
5. Browser proof covers the exact empty old-folder flow for schemas 1/2, edits surviving reopen in the same folder, saved schema-2 worksheet editing despite a newer empty year, preserved scenarios, and opt-in copy upgrading with source bytes unchanged.
6. Final verification: 208 unit/integration tests, all 14 Chromium tests, typecheck, production build and `git diff --check` passed. Build retains the existing large-chunk warning. Native Chrome/Edge folder picker remains a manual check; browser tests use synthetic OPFS folder handles. No commit, push, deployment or GitHub issue was made by this local fix.

This supersedes the earlier planning statement that opening old folders must immediately require a copy. New-feature copy upgrades still preserve the original; normal compatible editing now preserves the original schema instead.
