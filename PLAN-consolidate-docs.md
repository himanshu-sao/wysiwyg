# Plan: Consolidate the markdown docs (heavy merge)

## Goal
Reduce 11 markdown files to a tight, non-overlapping set: one front-door index, one
authoritative narrative (pitch + state + contradictions), one roadmap+audit, one
aspirational north star, and the two in-package technical docs — without losing any
unique content and with the doc-consistency guard test rewritten to pin the new set.

## Target structure (5 docs + 2 in-package + 1 scaffold)
| Final file | Absorbs / changes | Role |
|---|---|---|
| `README.md` (slim) | Kept as index only: 1-paragraph pitch, doc table, quick-start pointer, status one-liner. Drops the duplicated "shared understanding", "known contradictions", "doc status map", deleted-doc callout (all move to PROJECT_BRIEF). | Front door |
| `PROJECT_BRIEF.md` | Becomes the *single* authoritative narrative. Absorbs: README's "Known contradictions" + "What's actually implemented"; `GAP_AUDIT.md`'s *current* TL;DR + Pending/deferred + endpoints table + "shipped" verification; `PROJECT_DETAILS.md`'s 3 use cases (already present in §3). Keeps its own pitch, scope guardrails, doc map (updated). | Authoritative narrative + state |
| `TODO.md` | Absorbs `GAP_AUDIT.md`'s per-test results table + "How this audit changed" history (as an appendix), and `MVP_REQUIREMENTS.md`'s MVP-01…19 acceptance-criteria table + sample-test-project file list (as a "MVP spec of record" appendix, marked superseded). Phase 1 record + Phase 2–4 future stay. | Roadmap + audit + historical spec |
| `VISION.md` | Rename from `VISION_REQUIREMENTS.md`, body unchanged. | Aspirational north star |
| `ai-ui-editor/README.md` | UNCHANGED (API + setup authority; pinned by `OpencodeClient.models.test.ts` + guard test). | Tech reference |
| `ai-ui-editor/PROJECT_PROFILE.md` | UNCHANGED (pinned by guard test; referenced by TODO.md). | Profile system |
| `ai-ui-editor/sample-project/README.md` | UNCHANGED. | Scaffold |
| `memory/antikythera-integration-vision.md` | Light edit: update its cross-refs (GAP_AUDIT→TODO audit appendix; MVP_REQUIREMENTS→TODO appendix) and the closing note. Content otherwise unchanged (pinned by guard test). | Repo memory |

## Deleted
- `PROJECT_DETAILS.md` — only unique content (3 north-star use cases) already in PROJECT_BRIEF §3; its own banner says "wrong on load-bearing points."
- `GAP_AUDIT.md` — its live-status content folds into PROJECT_BRIEF; its historical/test-detail content folds into TODO.md appendices.
- `MVP_REQUIREMENTS.md` — its MVP-01…19 acceptance table + API contracts + sample-project file list fold into a TODO.md "MVP spec of record" appendix; its banner (superseded) is preserved there.
- `VISION_REQUIREMENTS.md` → renamed `VISION.md`.

## Guard test rewrite: `ai-ui-editor/middleware/__tests__/docSync.test.ts`
Rewrite the 15 assertions to pin the **new** file set. New assertions (same anti-drift
intent — shipped work described as shipped — re-pointed at the surviving files):
- `README.md`: slim — assert it links to PROJECT_BRIEF, TODO, VISION, ai-ui-editor/README; assert it does NOT contain the heavy "shared understanding"/"known contradictions" blocks (they moved). Drop the old `P1-0.*shipped.*e9d2b91`/`P1-6.*shipped.*acb45ab` assertions on README (those move to PROJECT_BRIEF).
- `PROJECT_BRIEF.md`: assert contains `/api/files/probe-root`, `/api/files/append-ideas`, `P1-0` shipped `e9d2b91`, `P1-6` shipped `acb45ab`, `Phase 1.*feature-complete`; assert NOT `🔴.*Active work`, not `append-ideas.*planned`.
- `TODO.md`: assert `Phase 1.*shipped`, `What landed`, P1-0/P1-6 sections (`### P1-0:` … `### P1-7:`) still `[x]`-checked with no `[ ]`; assert the new "Audit" appendix + "MVP spec of record" appendix headers exist.
- `GAP_AUDIT.md` must NOT exist (assert `fs.access` throws) — proves the merge happened and wasn't half-done. Same for `PROJECT_DETAILS.md`, `MVP_REQUIREMENTS.md`, `VISION_REQUIREMENTS.md`.
- `VISION.md` exists and contains a v2.0 aspirational marker.
- No authoritative doc links to a deleted file (replace the old deleted-snapshot-doc regex with one covering the 4 newly-deleted files).
- `ai-ui-editor/README.md` + `ai-ui-editor/PROJECT_PROFILE.md` + `memory/antikythera-integration-vision.md`: keep the existing "shipped, not planned" assertions (text in those files isn't changing materially).

## Cross-reference fixes (so no dangling links)
Repo docs to update after the merge:
- `TODO.md`: `MVP_REQUIREMENTS.md` ref → "see MVP spec of record appendix (this file)"; `PROJECT_PROFILE.md` link unchanged; remove the "doc-sync pass deleted X" historic callouts that reference the now-deleted files where they'd dangle.
- `PROJECT_BRIEF.md`: doc-map rows for `GAP_AUDIT.md`/`PROJECT_DETAILS.md`/`MVP_REQUIREMENTS.md` → fold into the new structure; `VISION_REQUIREMENTS.md` → `VISION.md`.
- `ai-ui-editor/README.md:395`: `VISION_REQUIREMENTS.md` link → `../VISION.md`.
- `ai-ui-editor/sample-project/README.md`: links to `../../PROJECT_BRIEF.md` still valid.
- `memory/antikythera-integration-vision.md`: `GAP_AUDIT.md`/`MVP_REQUIREMENTS.md` refs → TODO.md appendices.
- Code comments citing `GAP_AUDIT` by name (`OpencodeClient.ts`, `server.ts`, `ResponseParser.ts`, and 4 test files): these cite it as "the audit that found X" — historically accurate, leave the prose but they don't *link* to a file, so no dangling reference. (Confirmed: no code path string-references `GAP_AUDIT.md` as a file to load.)

## Harness auto-memory updates (outside the repo)
Update `~/.claude/projects/.../memory/`:
- `doc-authoritative-trio.md`: trio is now `README.md` + `PROJECT_BRIEF.md` + `TODO.md` (unchanged names, PROJECT_BRIEF absorbs GAP_AUDIT); update the "stale/contradicting" list (remove PROJECT_DETAILS, MVP_COMPLETE, PROJECT_STATUS, TODO.proposed — all already gone; note GAP_AUDIT + MVP_REQUIREMENTS + VISION_REQUIREMENTS folded; VISION renamed).
- `project-brief-location.md`: still "read PROJECT_BRIEF first" — note it now also carries the live audit + contradictions formerly in GAP_AUDIT/README.
- `antikythera-is-example.md`: still accurate; confirm `memory/antikythera-integration-vision.md` ref holds.
- `wysiwyg-project-intent.md`: unchanged (cites PROJECT_BRIEF).
- `MEMORY.md` index: no topic changes, no edit needed (lines still describe the same memories) — verify only.

## Verification
1. `cd ai-ui-editor/middleware && npm test` — all 144 + 77 = 221 tests still pass (docSync now re-pointed assertions; typesMirror + models tests untouched and still valid since ai-ui-editor/README.md content is unchanged).
2. `cd ai-ui-editor/middleware && npx tsc --noEmit` and `cd ai-ui-editor/extension && npx tsc --noEmit` — clean.
3. `cd ai-ui-editor/extension && npm run build` — succeeds.
4. Manual: `grep -rn "GAP_AUDIT\|PROJECT_DETAILS\|MVP_REQUIREMENTS\|VISION_REQUIREMENTS" --include=*.md` returns only intentional historic mentions inside TODO.md appendices, no live links to deleted files.

## Out of scope
- Not touching any `.ts`/`.tsx` source behavior.
- Not changing `ai-ui-editor/README.md`, `ai-ui-editor/PROJECT_PROFILE.md`, or `ai-ui-editor/sample-project/README.md` content.
- Not altering the test results counts (still 221 total); only docSync's assertions change shape.
