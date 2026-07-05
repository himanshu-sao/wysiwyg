# wysiwyg Gap Audit — Code Status & Pending Work

> **Live status of the codebase vs. the roadmap (`TODO.md`), and an explicit
> list of what is still pending.** This is the only gap audit — the earlier
> 2026-07-04 audit is folded in below; nothing is preserved "as-is" for its
> own sake. Surfaces what's *missing, stale, or deferred*, not a code review.
>
> *Last updated: 2026-07-05. Test counts re-verified: **144 middleware + 77 extension
> = 221 total, all passing**; both packages typecheck clean; extension builds.*
>
> **Legend:** 🔴 blocker | 🟡 drift/minor | ✅ shipped | ⏸️ explicitly deferred | 📝 doc-stale (pending)

---

## TL;DR

**Phase 1 (Requirements Bridge) is feature-complete and test-pinned.** There are
**0 open code blockers.** The remaining work is:

1. **📝 P1-7 doc-sync** — ✅ **done** (2026-07-05). The narrative docs have been
   reconciled to "shipped": root `README.md`, `TODO.md`, `PROJECT_BRIEF.md`,
   `ai-ui-editor/PROJECT_PROFILE.md`, `MVP_REQUIREMENTS.md`, the memory file, and
   `ai-ui-editor/README.md` (already updated in the working tree). Stale snapshot
   docs deleted. A doc-consistency guard test is now live.
2. **⏸️ Two explicitly-deferred enhancements** — DevTools panel wiring, and
   streaming for Export mode. Both were marked "deferred / not blocking" by the
   original audit; neither is required for Phase 1.
3. **P1-8 testing stretch goals** — most of P1-8's checklist is already covered
   by the tests landed with the two commits; only an end-to-end test remains.

Everything the original 2026-07-04 audit flagged as a 🔴 blocker or 🟡 drift is
shipped or reconciled, including the doc-sync. The next real milestone is
**Phase 2** (richer profile system on top of the P1-0 registry).

---

## Shipped (verified against code, 2026-07-05)

### Phase 1 hardening & Requirements Bridge foundation — all shipped

| Item | What it is | Verification |
|------|------------|---------------|
| **P1–P10** | Extension build pipeline, context menu, apply-flow fix, Zod + path safety, WebSocket fix, DiffValidator (TS API + oxlint), real sourcemap resolution, real token streaming, XSS sanitization, docs sync. | Each verified against code in the original audit; unchanged. |
| **P1-1** | Project profiles — `PROFILES` (`antikythera` + `generic`), `detectProfile`, `getProfile`. | `ProjectProfiles.test.ts` (19). |
| **P1-2** | Extension context menu (second item, mode handling). | `background.ts` menu items. |
| **P1-3** | Export endpoint `POST /api/ai/export-requirements`. | `ai.ts`, `OpencodeClient.generateRequirementsExport`; 10 tests. |
| **P1-4** | Requirements prompt template — `getRequirementsPrompt` with profile injection + AI-suggested `priority`/`title`. | `PromptTemplates.requirements.test.ts` (12). |
| **P1-5** | Popup export UI — spec preview, editable textarea, hints/scenarios/edge-cases, priority dropdown, title field. | `popup.requirements.test.ts` (17). |

### Phase 1 capstones — the two former blockers, now shipped

| Item | Commit | What landed | Tests added |
|------|--------|-------------|-------------|
| **✅ P1-0 Project Registry** | `e9d2b91` | On-disk path registry in `extension/shared/projectRegistry.ts` (per-origin active project + global override); `chrome.storage.local` persistence; `content-script.ts` uses the registered path (orig. `window.location.origin` placeholder); `GET /api/files/probe-root` validates a project-marker file on disk. | ext `projectRegistry.test.ts` (30); mw `probeRoot.test.ts` (13) + `registryPlumbing.test.ts` (9). |
| **✅ P1-6 File Export** | `acb45ab` | `POST /api/files/append-ideas`; `generateNextId` (3-digit zero-padded `ID-001`…`ID-999`, then `ID-1000`); atomic intake-line + `spec.md` write via `GitManager.writeFilesWithGit`; one-click undo via `/api/git/undo`; `priority` + `title` flow AI prompt → export response → popup → endpoint. | `appendIdeas.test.ts` (15), `OpencodeClient.normalizePriority.test.ts` (6), +2 prompt tests. |

### Follow-up fixes (originally 🟡 drift/minor) — all resolved

| Item | Resolution | Guard test |
|------|-----------|------------|
| **Type-mirror drift** | Both `shared/types.ts` reconciled to full lockstep (same exported type-name set + cross-package sample construction). | `typesMirror.test.ts` (4). |
| **antikythera-specific strings** | Popup/background labels made dynamic from the active project (`${projectLabel}`, `${intakeLabel}`, "Export to project TODO"). | Verified: no hardcoded "antikythera" in user-facing labels. |
| **Model list proliferation** | Consolidated into `AVAILABLE_MODELS` (single `readonly string[]` source of truth in `OpencodeClient.ts`); `listAvailableModels()` returns it; `validateConfig()` rejects an env `NVIDIA_MODEL` not in the catalog; `server.ts` calls `validateConfig()` at boot (fail-fast); `ai-ui-editor/README.md` table kept in lockstep. | `OpencodeClient.models.test.ts` (9, incl. startup-wiring). |
| **Dual sanitization approaches** | `sanitizeFilePath` hardened to segment-wise traversal removal (Windows backslashes, obfuscated `..`, null bytes, absolute paths) and documented as a *coherence heuristic* — `PathSanitizer.safeFilePath` remains the authoritative `path.resolve()`-based security boundary (defense in depth). | +6 tests in `ResponseParser.test.ts`. |

### Confirmed endpoints (all wired, all ✅)

| Route | Method | Handler | Status |
|-------|--------|---------|--------|
| `/api/ai/edit` | POST | `generateEditOptions` | ✅ |
| `/api/ai/edit/stream` | POST | `generateEditOptionsStream` (SSE) | ✅ |
| `/api/ai/export-requirements` | POST | `generateRequirementsExport` | ✅ |
| `/api/files/validate` | POST | `validateDiff` (TS API + oxlint) | ✅ |
| `/api/files/write` | POST | `writeFileWithGit` | ✅ |
| `/api/files/read` | GET | `fs.readFile` via `safeFilePath` | ✅ |
| `/api/files/probe-root` | GET | `probeProjectRoot` (marker check) | ✅ (P1-0) |
| `/api/files/append-ideas` | POST | `appendRequirements` (atomic GitManager write) | ✅ (P1-6) |
| `/api/git/undo` | POST | `undoLastCommit` | ✅ |
| `/ws/connect` | GET (WS) | WebSocket relay | ✅ |

---

<a name="pending"></a>
## Pending

### 📝 P1-7: Doc-sync ✅ done (2026-07-05)

The Phase-1 capstones (P1-0, P1-6) shipped; the narrative docs have been
reconciled to "shipped" and no longer contradict the code. The stale-snapshot/
legacy docs identified below were **deleted** (not just flagged) in this pass:

| Doc | What was done |
|-----|---------------|
| `ai-ui-editor/README.md` | Already reconciled to shipped state (prior session); documents `/probe-root` + `/append-ideas` + registry UX. |
| Root `README.md` | P1-0/P1-6 moved from 🔴/active → ✅/shipped; doc-map rows for deleted docs removed; Known contradictions §4 → "shipped"; Decision → "Phase 1 feature-complete." |
| `TODO.md` | P1-0/P1-6 checkboxes checked + commit hashes; Phase 1 header → "shipped"; "What landed" section added; Related Files table updated; P1-7/P1-8 checkboxes reconciled. |
| `PROJECT_BRIEF.md` | "Active work" → "shipped"; endpoints table updated; Known contradictions §4 → "shipped"; doc-map deleted-docs callout; "In one breath" → Phase 1 complete. |
| `ai-ui-editor/PROJECT_PROFILE.md` | Stopgap callout (🔴→✅); Future Enhancements P1-0 → shipped; Related Files table updated (legacy config.ts row removed). |
| `MVP_REQUIREMENTS.md` | Banner updated: no longer points to deleted `POSTMVP_TODO.md`; Phase 1 shipped framing. |
| `memory/antikythera-integration-vision.md` | P1-0/P1-6 → shipped; "active" → "shipped" labels; closing table updated; deleted-doc ref removed. |
| `ai-ui-editor/MVP_COMPLETE.md`, `POSTMVP_TODO.md`, `PROJECT_STATUS.md`, `config.ts`, `ai-ui-editor/shared/types.ts`, `TODO.proposed.md` | **Deleted.** Snapshot/legacy/duplicate artifacts; their roles are covered by the surviving authoritative docs. |
| Comment dangling refs | `background.ts` and `PathSanitizer.ts` comments that referenced `POSTMVP_TODO.md` → updated to neutral references. |
| Doc-consistency guard test | Added: asserts that no "🔴 P1-0/P1-6" / "planned / not yet built" / future-tense framing persists in the authoritative docs. |

**Done when** criterion met: no "🔴 P1-0" / "🔴 P1-6" / "active work item" /
"P1-6 will add" / "Not yet built" framing remains in any authoritative doc; all
are "shipped" with commit hashes.

### ⏸️ P1-7 follow-ups explicitly deferred (non-blocking)

- **DevTools panel wiring** — `extension/devtools/` has a full React panel that
  listens for `edit-applied` / `edit-undone` messages, but the popup doesn't
  broadcast them, so the panel never receives history. Original audit: *"Not
  blocking P1-0/P1-6. Consider wiring in Phase 2."* **Status: unchanged, deferred.**
- **Export-mode streaming** — Edit mode streams via `/api/ai/edit/stream`;
  Export yields a single spec, so streaming adds little value. Original audit:
  recorded awareness only. **Status: deferred, not pursued.**

### P1-8: Testing stretch goals — mostly covered, one gap

| P1-8 checklist item (`TODO.md`) | Status |
|----------------------------------|--------|
| Unit tests for `getRequirementsPrompt()` incl. priority + title | ✅ `PromptTemplates.requirements.test.ts` (12). |
| Integration tests for `/api/files/append-ideas` (idempotency, ID generation, path-safety traversal, GitManager commit) | ✅ `appendIdeas.test.ts` (15). |
| Integration tests for the project registry (P1-0) | ✅ `probeRoot.test.ts` (13) + `registryPlumbing.test.ts` (9) + ext `projectRegistry.test.ts` (30). |
| E2E: register project → right-click → export → verify `ideas.md` line + `requirements/ID/spec.md` created | ⏸️ **Not done.** No E2E harness exists; would require a running browser + a temp git project. Deferred until an E2E layer is added. |

### Phase 2+ — future roadmap (not pending for Phase 1)

Per `TODO.md`, the Phase-1 capstones unblock Phase 2 (richer profile system on
top of the P1-0 registry: `P2-1` profile schema, `P2-2` profile loader driven by
the registry, `P2-3` selection UX, `P2-4` per-profile output customization) and
eventually Phase 3 (live API bridge to a target project's pipeline). These are
*next-milestone* work, not gaps — listed here only so the pending picture is
complete.

---

## Test results (re-verified 2026-07-05)

> All green. **144 middleware + 77 extension = 221 tests passing.** Both packages
> `tsc --noEmit` clean. Extension `npm run build` succeeds (popup + both workers).

| Project | File | Tests | Status |
|---------|------|-------|--------|
| Middleware | `api.test.ts` | 3 | ✅ |
| Middleware | `appendIdeas.test.ts` *(P1-6)* | 15 | ✅ |
| Middleware | `OpencodeClient.models.test.ts` *(P1-7)* | 9 | ✅ |
| Middleware | `OpencodeClient.normalizePriority.test.ts` *(P1-6)* | 6 | ✅ |
| Middleware | `OpencodeClient.streaming.test.ts` | 3 | ✅ |
| Middleware | `OpencodeClient.test.ts` | 8 | ✅ |
| Middleware | `probeRoot.test.ts` *(P1-0)* | 13 | ✅ |
| Middleware | `ProjectProfiles.test.ts` | 19 | ✅ |
| Middleware | `PromptTemplates.requirements.test.ts` | 12 | ✅ |
| Middleware | `registryPlumbing.test.ts` *(P1-0)* | 9 | ✅ |
| Middleware | `ResponseParser.test.ts` | 21 | ✅ |
| Middleware | `SourcemapResolver.test.ts` | 7 | ✅ |
| Middleware | `docSync.test.ts` *(P1-7 doc-consistency guard)* | 15 | ✅ |
| Middleware | `typesMirror.test.ts` *(P1-7 lockstep guard)* | 4 | ✅ |
| **Middleware Total** | | **144** | ✅ |
| Extension | `apply.test.ts` | 10 | ✅ |
| Extension | `diff.test.ts` | 7 | ✅ |
| Extension | `popup.requirements.test.ts` | 17 | ✅ |
| Extension | `projectRegistry.test.ts` *(P1-0)* | 30 | ✅ |
| Extension | `sanitize.test.ts` | 13 | ✅ |
| **Extension Total** | | **77** | ✅ |
| **Grand Total** | | **221** | ✅ |

---

## How this audit changed

- **2026-07-04 (original):** identified 2 🔴 blockers (P1-0, P1-6) + 4 🟡 drift/minor items; 129 tests.
- **2026-07-05 (rewrite #1):** P1-0 + P1-6 shipped (+83 tests → 206); all 4 drift/minor items resolved with guard tests; `validateConfig()` wired into `server.ts` boot. **0 open code blockers.** Remaining gap: doc-sync (P1-7).
- **2026-07-05 (rewrite #2 — this pass):** P1-7 doc-sync completed — all narrative docs reconciled to "shipped"; 6 stale-snapshot/legacy files deleted; dangling references cleaned; doc-consistency guard test added (+15 tests → 221). **0 open gaps in Phase 1.** The only remaining items are the two explicitly-deferred enhancements (DevTools panel, Export streaming) and the deferred E2E test. Next milestone: Phase 2.

---

*Last updated: 2026-07-05. Status: Phase 1 feature-complete, test-pinned (221 tests), doc-synced; no open Phase 1 gaps. Next = Phase 2 + deferred enhancements.*
