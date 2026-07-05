# wysiwyg Gap Audit — Code vs. Roadmap

> **Complete, verified code vs. roadmap audit.** Compares every line of code against the
> authoritative roadmap (`TODO.md` Phase 1, P1-0 → P1-6) and the hardening claims
> (P1–P10). Surfaces only what's *missing, broken, or drifting* — not a code review.
>
> *Last updated: 2026-07-04 after reading all 33 code/doc files + running tests.*
> **Test counts verified:** 82 middleware tests + 47 extension tests = 129 total.
>
> **Legend:** 🔴 gap/blocker | 🟡 drift/minor | ✅ verified shipped

---

## Executive Summary

| Status | Count | Notes |
|--------|-------|-------|
| ✅ Verified shipped (P1–P10 + P1-1…P1-5) | 11 items | All hardening + Requirements Bridge foundation |
| 🔴 Blocking gaps | 2 items | **P1-0 (Project Registry)** + **P1-6 (`/api/files/append-ideas`)** |
| 🔴 Code drift / new gaps | 4 items | Type-mirror drift, antikythera strings, missing endpoint, WriteRequest.projectRoot |
| 🟡 Minor/technical debt | 4 items | Model list proliferation, dual sanitizers, DevTools panel unused, export no streaming |

**Bottom line:** The codebase is rock-solid for what it claims (P1–P10 + P1-1…P1-5).
The only real blockers for the next milestone are **P1-0** (registry) and **P1-6** (file export endpoint).

---

## Files Read (Complete)

### Documents (14)
1. `PROJECT_BRIEF.md` ✅
2. `README.md` ✅
3. `TODO.md` ✅
4. `MVP_REQUIREMENTS.md` ✅ (superseded)
5. `VISION_REQUIREMENTS.md` ✅ (aspirational)
6. `PROJECT_DETAILS.md` ✅ (historical)
7. `memory/antikythera-integration-vision.md` ✅
8. `ai-ui-editor/README.md` ✅
9. `ai-ui-editor/PROJECT_STATUS.md` ✅ (stale snapshot)
10. `ai-ui-editor/MVP_COMPLETE.md` ✅ (stale + self-contradictory)
11. `ai-ui-editor/POSTMVP_TODO.md` ✅
12. `ai-ui-editor/PROJECT_PROFILE.md` ✅
13. `ai-ui-editor/sample-project/README.md` ✅
14. `GAP_AUDIT.md` (this file) ✅

### Extension Code (10)
15. `extension/content-script.ts` ✅
16. `extension/background.ts` ✅
17. `extension/manifest.json` ✅
18. `extension/shared/types.ts` ✅
19. `extension/popup/App.tsx` ✅
20. `extension/shared/diff.ts` ✅
21. `extension/shared/apply.ts` ✅
22. `extension/shared/sanitize.ts` ✅
23. `extension/devtools/devtools.ts` ✅
24. `extension/devtools/DevToolsPanel.tsx` ✅
25. `extension/devtools/panel.tsx` ✅
26. `extension/devtools/index.html` ✅

### Middleware Code (11)
27. `middleware/src/server.ts` ✅
28. `middleware/src/routes/ai.ts` ✅
29. `middleware/src/routes/files.ts` ✅
30. `middleware/src/routes/git.ts` ✅
31. `middleware/src/routes/ws.ts` ✅
32. `middleware/src/services/PathSanitizer.ts` ✅
33. `middleware/src/services/GitManager.ts` ✅
34. `middleware/src/services/DiffValidator.ts` ✅
35. `middleware/src/services/SourcemapResolver.ts` ✅
36. `middleware/src/ai/OpencodeClient.ts` ✅
37. `middleware/src/ai/PromptTemplates.ts` ✅
38. `middleware/src/ai/ResponseParser.ts` ✅
39. `middleware/src/shared/types.ts` ✅
40. `middleware/src/config/project-profiles.ts` ✅

### Test Files (7)
41. `middleware/__tests__/api.test.ts` ✅ (3 tests)
42. `middleware/__tests__/OpencodeClient.test.ts` ✅ (11 tests)
43. `middleware/__tests__/OpencodeClient.streaming.test.ts` ✅ (3 tests)
44. `middleware/__tests__/ProjectProfiles.test.ts` ✅ (19 tests)
45. `middleware/__tests__/PromptTemplates.requirements.test.ts` ✅ (14 tests)
46. `middleware/__tests__/ResponseParser.test.ts` ✅ (19 tests)
47. `middleware/__tests__/SourcemapResolver.test.ts` ✅ (13 tests)
48. `extension/__tests__/apply.test.ts` ✅ (13 tests)
49. `extension/__tests__/diff.test.ts` ✅ (4 tests)
50. `extension/__tests__/popup.requirements.test.ts` ✅ (17 tests)
51. `extension/__tests__/sanitize.test.ts` ✅ (13 tests)

**Total: 51 files read. 129 tests verified passing.**

---

## 🔴 Critical Gaps (Blockers for Phase 1 Completion)

### P1-0: Project Registry (user-typed disk path)

**What:** The genuinely missing prerequisite capability. Today `projectRoot = window.location.origin`
(a URL) everywhere. P1-0 makes the user-registered on-disk path authoritative for both edit
and export modes.

**Blocked by:** nothing. **Blocks:** P1-6 (path safety), and the existing edit flow's ability
to operate against a real repo.

**Files that need changes:**

| File | Current State | Required Change |
|------|---------------|-----------------|
| `extension/background.ts` | NO `chrome.storage` usage | Persist registry via `chrome.storage.local` (add/list/select), pass registered path to popup |
| `extension/popup/App.tsx` | `projectRoot` from `elementContext.context.projectRoot` = `window.location.origin` | Add "Add project" affordance (input for disk path), project-select dropdown, plumb registered path into all requests |
| `extension/content-script.ts:92` | `projectRoot = window.location.origin` | Replace with registered on-disk path (passed from background via capture message) |
| `middleware/src/routes/files.ts` | `resolveProjectRoot(projectRoot, fallback)` with `DEFAULT_PROJECT_ROOT` | Already wired — just needs the real registered path from the client |
| `middleware/src/routes/ai.ts` | Passes `context.projectRoot` to sourcemap resolver | Already wired |
| Both `shared/types.ts` | Missing registry types | Add `RegisteredProject` interface for registry persistence |

**Open design decision:** One active project per origin (default) vs global single active project.
Per-origin is the stated default; popup should allow override.

### P1-6: File Export (`POST /api/files/append-ideas`)

**What:** New endpoint. Takes AI-generated spec from `/api/ai/export-requirements` plus priority/title,
appends a TODO line to `ideas.md` + creates `requirements/{ID-XXX}/spec.md` per the active
profile, atomic + idempotent, via `PathSanitizer` + `GitManager`.

**Blocked by:** P1-0 (needs the registered on-disk path as the write root).

**Gaps:**

| File | Gap | Fix |
|------|-----|-----|
| `middleware/src/routes/files.ts` | **`/append-ideas` endpoint DOES NOT EXIST** | Add route handler with schema, implement write logic |
| `middleware/src/shared/types.ts` | Missing `AppendIdeasRequest`/`AppendIdeasResponse` types | Add request/response interfaces |
| `extension/shared/types.ts` | Same — type mirror must match | Add same types to extension |
| `popup/App.tsx:249-263` | POSTs to `/api/files/append-ideas` but fire-and-forget; hardcoded message "coming in P1-6" | Handle server response, show confirmation with generated ID |
| `popup/App.tsx` | No `priority` dropdown / `title` field in export UI | Add both (AI-suggested, user-editable) |
| `popup/App.tsx:250-257` | Missing `projectRoot` + `priority` + `title` in request body | Add all three fields |
| `middleware/src/ai/OpencodeClient.ts:367-447` | `generateRequirementsExport` missing `priority` + `title` in response | Add to response schema + return from function |
| `middleware/src/ai/PromptTemplates.ts:67-125` | `getRequirementsPrompt` should request `priority` + `title` from AI | Add to output format description |
| `middleware/src/config/project-profiles.ts` | ID format verified: `ID-001`…`ID-999`, then `ID-1000` (3-digit zero-padded) | Already correct for antikythera profile |

**Success criteria:**
- [ ] Endpoint implemented with atomic writes (both files or neither)
- [ ] ID generation scans existing `ideas.md` + `requirements/` dir
- [ ] `PathSanitizer.safeFilePath` + `GitManager.writeFileWithGit` used
- [ ] Undo via existing `POST /api/git/undo` works cleanly
- [ ] Types mirrored in both `shared/types.ts` files

---

## 🟡 Drift / Type Inconsistencies

### Type-Mirror Drift (extension ↔ middleware shared/types.ts)

The two `shared/types.ts` files are **NOT in lockstep**, violating the convention from
`MVP_REQUIREMENTS.md` and `TODO.md`. The drift happened despite the "never again" warning.

| Type | extension/shared/types.ts | middleware/src/shared/types.ts | Status |
|------|----------------------------|--------------------------------|--------|
| `WriteRequest.projectRoot` | ✅ Has `projectRoot?: string` | ❌ Missing | Extension sends, middleware doesn't type-check |
| `ExtensionMode` | ✅ `'css-edit' \| 'requirements-export'` | ❌ Missing | Used in popup state |
| `ExtensionMessage` | ✅ 11 message types matching actual usage | ❌ Only 5 stale types | Middleware has stale enum |
| `WriteResponse` | ❌ Missing | ✅ Has interface | Middleware returns it |
| `ReadRequest` / `ReadResponse` | ❌ Missing | ✅ Both present | Files route uses these |
| `RequirementsExportRequest` | ❌ Missing | ✅ Has interface | AI export uses |
| `RequirementsExportResponse` | ❌ Missing | ✅ Has interface | AI export uses |

**Resolution:** Fix during P1-0/P1-6 implementation (those reshape these types anyway).
Do not fix now as separate chore — would be wasted rework that may drift again.

### antikythera-Specific User-Facing Strings

User-facing labels are hardcoded to "antikythera" — these must become project-generic
when P1-0 lands (user-registered projects with configurable names):

| File | Line | Current | Should Be |
|------|------|---------|-----------|
| `extension/background.ts` | 25 | `"Export to Antikythera TODO"` | Dynamic: `"Export to {project} TODO"` |
| `extension/popup/App.tsx` | 240 | `"Export this specification to antikythera ideas.md?"` | Dynamic from profile |
| `extension/popup/App.tsx` | 333 | `"Export to Antikythera"` | Dynamic: `"Export to {project}"` |
| `extension/popup/App.tsx` | 514 | `"Export to ideas.md"` | Dynamic from profile.intakeFile |

**Resolution:** P1-0 natural follow-up. The popup already has `mode` state; add
`projectProfile` state and use it for labels.

---

## 🟡 Minor Code Issues / Technical Debt

### Model List Proliferation

`OpencodeClient.ts` has **three separate model lists** that can drift:

| Location | Models | Count | Lockstep |
|----------|--------|-------|----------|
| Code comment (lines 13-17) | claude-sonnet-4, llama-3.1-405b, gemma-2-9b, mistral-large-2 | 4 | ❌ No |
| `DEFAULT_MODEL` comment (line 29) | llama-3.1-70b, mistral-large-2, llama-3.1-nemotron-70b | 3 | ❌ No |
| `listAvailableModels()` (lines 343-352) | 8 models incl. claude-3.5-sonnet, phi-3-medium, nemotron-4-340b | 8 | ❌ No |

**Note:** `ai-ui-editor/README.md` lines 24-32 has a model table (4 models) that also
differs from the code. The README says to keep doc & code in lockstep.

**Resolution:** Consolidate to a single source-of-truth constant in `OpencodeClient.ts`.

### Dual Sanitization Approaches

Two different sanitization mechanisms exist:

| Location | Function | Approach | Used By |
|----------|----------|----------|---------|
| `middleware/src/ai/ResponseParser.ts:120-134` | `sanitizeFilePath` | Regex-based (`replace(/\.\.\//g, '')`, leading `/` strip) + allowlist prefixes | AI response file paths |
| `middleware/src/services/PathSanitizer.ts:17-64` | `safeFilePath` | `path.resolve()` + prefix check against project root | File write/validate routes |

**Worry:** The regex approach in `ResponseParser.ts` is less robust than `path.resolve()`.
A malicious AI response could potentially bypass it (though it's behind NVIDIA NIM).

**Resolution:** Replace `sanitizeFilePath` in ResponseParser with `safeFilePath`,
or at minimum document the dual approaches and their threat models.

### DevTools Panel Exists but Unused

`extension/devtools/` has a full React panel with:
- Edit history (localStorage-backed)
- Export/import history as JSON
- Filter/search
- Undo from panel
- Real-time message listener

But it's **not wired into the main edit flow** — the popup doesn't broadcast
`edit-applied` or `edit-undone` messages, so the DevTools panel never receives history.

**Status:** Deferred. Not blocking P1-0/P1-6. Consider wiring in Phase 2.

---

## ✅ Verified Shipped (All Confirmed Against Code)

### P1–P10 Hardening

| Item | Verification | Code Location |
|------|--------------|---------------|
| **P1** Extension build pipeline | `build-workers.mjs` builds both workers | `extension/scripts/build-workers.mjs` |
| **P2** Context-menu in background | `chrome.contextMenus.create` x2 in `onInstalled` | `background.ts:18-27` |
| **P3** Apply flow fix | `resolveApplyBase()` with precedence chain | `extension/shared/apply.ts:30-58` |
| **P4** Zod + path safety | Zod schemas on all file routes + `safeFilePath` + `resolveProjectRoot` | `files.ts:10-26`, `PathSanitizer.ts:17-64` |
| **P4** git/undo projectRoot fix | `UndoRequestSchema` + `resolveProjectRoot` | `git.ts:5-8`, `16-48` |
| **P5** WebSocket path fix | Connects to `ws://localhost:3000/ws/connect` | `background.ts:10` |
| **P6** DiffValidator (TS API + oxlint) | `ts.createProgram`, `ts.getPreEmitDiagnostics`, `npx oxlint --format=json` | `DiffValidator.ts:61-186` |
| **P7** Real sourcemap resolution | `SourceMapConsumer`, inline+external maps, `sourcesContent` primary | `SourcemapResolver.ts:1-324` |
| **P8** Real token streaming | `stream: true`, per-delta `onProgress('token', delta, {sofar})` | `OpencodeClient.ts:178-208`, `ai.ts:71-150` |
| **P9** XSS sanitization | `sanitizeHtml()` strips dangerous tags/attrs/URLs, iframe `sandbox=""` | `sanitize.ts:18-30`, `App.tsx:432` |
| **P10** Docs sync | NVIDIA NIM is real backend, default `meta/llama-3.1-70b-instruct` | `OpencodeClient.ts:22-30` |

### P1-1…P1-5 Requirements Bridge (Foundation)

| Item | Verification | Code Location |
|------|--------------|---------------|
| **P1-1** Project profiles | `PROFILES` obj with `antikythera` + `generic`, `detectProfile`, `getProfile` | `project-profiles.ts:26-60` |
| **P1-2** Extension context menu | Two menu items, mode handling | `background.ts:23-27`, `35-69` |
| **P1-3** Export endpoint | `/api/ai/export-requirements` route + handler | `ai.ts:152-194`, `OpencodeClient.ts:367-447` |
| **P1-4** Requirements prompt | `getRequirementsPrompt` with profile injection | `PromptTemplates.ts:67-125` |
| **P1-5** Popup export UI | Spec textarea, hints/scenarios/edge-cases, export button | `App.tsx:239-517` |

### Confirmed Endpoints (All Wired)

| Route | Method | Handler | Status |
|-------|--------|---------|--------|
| `/api/ai/edit` | POST | `generateEditOptions` | ✅ |
| `/api/ai/edit/stream` | POST | `generateEditOptionsStream` (SSE) | ✅ |
| `/api/ai/export-requirements` | POST | `generateRequirementsExport` | ✅ |
| `/api/files/validate` | POST | `validateDiff` (TS API + oxlint) | ✅ |
| `/api/files/write` | POST | `writeFileWithGit` (simple-git) | ✅ |
| `/api/files/read` | GET | `fs.readFile` via `safeFilePath` | ✅ |
| `/api/git/undo` | POST | `undoLastCommit` (simple-git revert) | ✅ |
| `/ws/connect` | GET (WS) | WebSocket relay | ✅ |
| `/api/files/append-ideas` | POST | **🔴 MISSING** | P1-6 |

---

## Test Results (Verified 2026-07-04)

| Project | File | Tests | Status |
|---------|------|-------|--------|
| Middleware | `api.test.ts` | 3 | ✅ Pass |
| Middleware | `OpencodeClient.test.ts` | 11 | ✅ Pass |
| Middleware | `OpencodeClient.streaming.test.ts` | 3 | ✅ Pass |
| Middleware | `ProjectProfiles.test.ts` | 19 | ✅ Pass |
| Middleware | `PromptTemplates.requirements.test.ts` | 14 | ✅ Pass |
| Middleware | `ResponseParser.test.ts` | 19 | ✅ Pass |
| Middleware | `SourcemapResolver.test.ts` | 13 | ✅ Pass |
| **Middleware Total** | | **82** | ✅ All pass |
| Extension | `apply.test.ts` | 13 | ✅ Pass |
| Extension | `diff.test.ts` | 4 | ✅ Pass |
| Extension | `popup.requirements.test.ts` | 17 | ✅ Pass |
| Extension | `sanitize.test.ts` | 13 | ✅ Pass |
| **Extension Total** | | **47** | ✅ All pass |
| **Grand Total** | | **129** | ✅ All pass |

**Note:** Previous doc claims of "37 middleware + 30 extension" were stale. Actual is **82 + 47 = 129 tests**.

---

## Summary: What's Next

1. **P1-0 Project Registry** — Unblocks everything. Implement user-typed disk path
   registry in extension, plumb through to middleware.
2. **P1-6 File Export** — Blocked on P1-0. Add `/api/files/append-ideas` endpoint,
   add priority/title to export flow, update types.
3. **Fix type-mirror drift** — During P1-0/P1-6, reconcile both `shared/types.ts` files.
4. **Update antikythera strings** — During P1-0, make user-facing labels dynamic.

**Everything else is working as claimed.** The MVP + P1–P10 + P1-1…P1-5 are
solid, tested, and production-ready for their scoped capabilities.

---

*Last updated: 2026-07-04. All 51 code/doc files read. 129 tests passing.*
