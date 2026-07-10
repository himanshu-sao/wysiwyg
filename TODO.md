# wysiwyg TODO

**Created**: 2026-07-04
**Last revised**: 2026-07-09 (post-Phase-1 requirements-vs-code audit; see **Phase 1.5**)

> **Status:** **Phase 1 (Requirements Bridge) is feature-complete and test-pinned**
> (**231 tests passing** — 148 middleware + 83 extension; count corrected 2026-07-09,
> was stale at "221"; bumped 2026-07-09 by the P1.5-2 panel-history tests). The two former blockers shipped: **P1-0 Project Registry**
> (`e9d2b91`) and **P1-6 File Export** (`acb45ab`). The Phase 1 sections below are kept
> as a record of what was specified and what shipped; nothing in Phase 1 is active.
>
> **Before Phase 2, finish the small "Phase 1.5" cleanup** below — one real code fix, two
> deferred-scope decisions, and a doc-count correction surfaced by the 2026-07-09 audit.
> It is small and unblocks the next milestone cleanly. **The next real milestone is Phase 2**
> (richer profile system on the P1-0 registry) — see the **Audit appendix** at the end of
> this file for the live code-vs-roadmap status (formerly a standalone `GAP_AUDIT.md`, now
> folded in here). The single authoritative narrative (pitch + live status + scope) lives
> in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md).

---

## What wysiwyg is

wysiwyg is an **AI-driven prompt generator that has access to the running UI.**

The problem it solves: once an app is built by AI, the hardest part of iterating is
**knowing what prompt to give the AI next**. wysiwyg gives the AI access to the actual
UI (DOM, computed styles, hierarchy, resolved source) and, with per-project context,
turns a vague user intent into a high-quality instruction.

Two output *shapes* of that same prompt-generation capability:
- **Edit mode** — generate a code diff and apply it to the running project (already
  implemented for CSS/visual edits; see the MVP history in git for the baseline).
- **Export mode** — generate a structured spec/TODO and write it back into *that
  project's own* backlog conventions, so a downstream AI agent (or human) can act on it.

**Multi-project is core, not a Phase-2 add-on.** wysiwyg works across multiple projects.
The user tells wysiwyg **which project** they're in by typing that project's **on-disk
path**; wysiwyg learns its structure/conventions and persists the registry. **One
registered project per session, used by both modes.**

> **The `example` profile is a built-in demonstration profile** — it shows what a real
> profile configuration looks like. It is *not* the purpose of wysiwyg; it's a template.
> Any mention below of "the example profile" refers to this built-in demo and should
> generalise to any user-registered project.

---

## What landed (2026-07-05)

- **P1-0 Project Registry** — shipped `e9d2b91`. On-disk path registry
  (`extension/shared/projectRegistry.ts`); `chrome.storage.local` persistence; per-origin
  active project + global override; `GET /api/files/probe-root` validates a project marker
  on disk; the registered on-disk path replaces `window.location.origin` as `projectRoot`.
  Tests: ext `projectRegistry.test.ts` (30), mw `probeRoot.test.ts` (13) + `registryPlumbing.test.ts` (9).
- **P1-6 File Export** — shipped `acb45ab`. `POST /api/files/append-ideas` appends the
  profile intake line + creates `requirements/{ID-XXX}/spec.md` in one atomic git commit via
  `GitManager.writeFilesWithGit` (undoable via `/api/git/undo`). `generateNextId` 3-digit
  zero-padded `ID-001`…`ID-999` then `ID-1000`. Priority + title flow export response →
  popup → endpoint. Tests: `appendIdeas.test.ts` (15), `OpencodeClient.normalizePriority.test.ts` (6), +2 prompt tests.
- **P1-7 doc-sync** (this pass) — narrative docs reconciled to "shipped"; stale
  snapshot/legacy docs removed (`MVP_COMPLETE.md`, `POSTMVP_TODO.md`, `PROJECT_STATUS.md`,
  `config.ts`, `extension/shared/types.ts`); a doc-consistency guard test pins the sync.
- **P1-8 testing** — unit/integration for the prompt, `/append-ideas` (idempotency, ID
  generation, traversal rejection, GitManager commit), and the registry all shipped. Only the
  E2E test remains deferred (no E2E harness yet).

## What changed in the previous revision (2026-07-04, kept for record)

- **Framing**: rewritten from "wire wysiwyg to a specific target" to "AI-driven prompt
  generator with UI access; multi-project via user-registered disk paths." Built-in
  profiles are examples, not the purpose.
- **New task P1-0 (Project Registration)**: captured the then-missing capability —
  user types a disk path, wysiwyg inspects it, persists a project registry, and that
  registered path becomes the authoritative `projectRoot` for both edit *and* export.
  (Shipped 2026-07-05 as above.)
- **P1-6 enriched** with the example profile's intake format (defined in
  `middleware/src/config/project-profiles.ts`), request/response schema, ID rule, and the
  `PathSanitizer` + `GitManager` reuse requirement. Priority becomes AI-suggested +
  user-overridable. Destination root = the user-registered disk path, not the dev-server
  `projectRoot`.
- **Phases 2–4**: left intact (they age well); only their framing lines touched so they
  don't contradict the new model.

---

## How to Use This File

**When starting work**: Pick a task, mark it `in_progress`.
**When done**: Mark as `completed` and **remove the item** from this file.
**When blocked**: Create a subtask describing the blocker, link it with `Blocked by: #XXX`.

This keeps the TODO list fresh — only active work remains visible.

---

## Conventions (apply to every task)

- **Type mirror**: `extension/shared/types.ts` and `middleware/src/shared/types.ts` are
  *manually mirrored* (the extension can't import across the package boundary). Any new
  request/response type added in one **must** be added to the other in the same change.
  This has already drifted once — keep them in lockstep.
- **Path safety**: any endpoint that writes a file **must** route the path through
  `PathSanitizer.safeFilePath(projectRoot, file)` and use `GitManager` for the write.
  No raw `fs.appendFile`/`fs.writeFile` to user-supplied paths. (Established in P4-git.)
- **Project root**: `projectRoot` used by file/git operations is the **user-registered
  on-disk path** (see P1-0), **not** `window.location.origin`. The content script's
  current `projectRoot = window.location.origin` is a placeholder to be replaced by P1-0.
- **ID format** (example profile, verified): `ID-XXX` where `XXX` is **3-digit
  zero-padded, uppercase** (`ID-001`, `ID-002`). Above 999, use 4 digits (`ID-1000`).
  Next available ID = scan `ideas.md` + `requirements/` for the max numeric ID, +1.

---

## Phase 1: Requirements Bridge (MVP) ✅ shipped

**Goal**: wysiwyg captures UI context + user intent → understands the target project →
generates a structured spec → writes a TODO item back into that project's own backlog.

> **Phase 1 is complete** (foundation P1-1…P1-5 + capstones P1-0 `e9d2b91` / P1-6 `acb45ab`).
> The detail blocks below are kept as the spec of record. Active work resumes in Phase 2.

### Foundation (done — removed from active list; see git history)

- ✅ P1-1 Project profiles (definitions + URL detection) — `middleware/src/config/project-profiles.ts`, 19 tests.
- ✅ P1-2 Extension context menu (second item, mode handling) — `background.ts` + `shared/types.ts` + popup.
- ✅ P1-3 Export endpoint `POST /api/ai/export-requirements` — `routes/ai.ts` + `OpencodeClient.generateRequirementsExport`, 10 tests.
- ✅ P1-4 Requirements prompt template — `PromptTemplates.getRequirementsPrompt` (folded into P1-3).
- ✅ P1-5 Popup export UI — spec preview, editable textarea, hints/scenarios/edge-cases sections, export button, 17 tests.

### P1-0: Project Registry (user-typed disk path) ✅ shipped `e9d2b91`

**Why**: wysiwyg must "store/know/work with the path for multiple projects." Before P1-0
the only "project root" was `window.location.origin` (a URL), so file/git operations
couldn't target a real repo. The user can now register a project by its on-disk path, and
that path becomes the authoritative `projectRoot` for both edit and export modes.

**Resolved**: P1-6's path safety now has a real root to bind to, and the edit flow operates
against a real repo (with `DEFAULT_PROJECT_ROOT` as the fallback when nothing is registered
for an origin).

**Design** (shipped):
- [x] **Popup: "Add project" affordance.** User types an absolute on-disk path; the path is
      validated as a project root via `GET /api/files/probe-root` (a project marker on disk)
      before it is accepted into the registry.
- [x] **Inspect on register.** Profiles stay URL-detected; the registered path is stored
      alongside the profile name. `example` matches its profile; otherwise `generic`,
      user-overrideable.
- [x] **Persist the registry** in `chrome.storage.local` (the manifest has the `storage`
      permission). Keyed by origin; stores `{ path, profileName, displayName, registeredAt }`.
      Supports multiple projects.
- [x] **Select active project per session.** Per-origin active project + global override
      (the open question below, resolved per-origin with global override). The selected
      project's `path` is `projectRoot` everywhere the popup used `elementContext.context.projectRoot`.
- [x] **Plumb the real path through the middleware.** The registered on-disk path replaces
      `window.location.origin` in `content-script.ts` (background passes the registered path
      down, since the content script can't read `chrome.storage` synchronously).
- [x] **Tests**: ext `projectRegistry.test.ts` (30) for add/list/select/persist; mw
      `probeRoot.test.ts` (13) + `registryPlumbing.test.ts` (9) — including that the
      registered path, not `window.location.origin`, reaches the write path.

**Resolved open question**: per-origin active project with a global override.

### P1-6: File Export (write spec into the active project's backlog) ✅ shipped `acb45ab`

**Was blocked by**: P1-0 (the registered on-disk path as the write root) — resolved.

**What it does**: takes the AI-generated spec (from `/api/ai/export-requirements`) plus
a priority, and appends a TODO line + writes a `spec.md` into the active project per its
profile's conventions. For the `example` profile that means:

- Append to `<root>/automation-ideas/ideas.md`:
  `- [ID-XXX] {title} | Priority: {Priority}` (verified real format; see Conventions).
  Title = first line of the spec's Overview, or a short AI-suggested title.
- Create `<root>/automation-ideas/requirements/{ID-XXX}/spec.md` with the spec body.
- (Do **not** touch `pipeline-state.json` — that is the project's internal concern, not
  wysiwyg's. wysiwyg only writes files a human could paste by hand. Live pipeline coupling
  is Phase 3.)

**Endpoint**: `POST /api/files/append-ideas`
- **Request** (extends current `handleExport` payload in `popup/App.tsx`):
  ```ts
  {
    spec: string;                  // generated spec markdown
    title?: string;                // short title for the ideas.md line (AI-suggested)
    priority: 'High' | 'Medium' | 'Low'; // AI-suggested in export response, user-overridable in popup
    architectureHints: string[];
    testScenarios: string[];
    edgeCases: string[];
    element?: ElementContext;
    instruction: string;
    projectRoot: string;           // the user-registered on-disk path (from P1-0), NOT window.location.origin
  }
  ```
- **Response**:
  ```ts
  {
    success: boolean;
    id?: string;          // the generated ID-XXX
    ideasLine?: string;   // the line appended to ideas.md (for confirmation/undo)
    specPath?: string;    // absolute path to the created spec.md
    error?: string;
  }
  ```
- **ID generation**: scan existing `ideas.md` lines + `requirements/` dir names for the
  max numeric ID; +1; format per Conventions (`ID-001`…`ID-999`, then `ID-1000`).
- **Path safety**: resolve `ideas.md` and `requirements/{ID}/spec.md` via
  `PathSanitizer.safeFilePath(projectRoot, <profile-relative path>)`. Reject any path that
  escapes `projectRoot`. **Reuse `GitManager`** to commit the new files
  (`commitMessage: AI export: {title} ({id})`) — consistent with the P4-git hardening and
  gives the user a one-click undo via existing `POST /api/git/undo`.
- **Atomic + idempotent**: never partially write (if spec.md creation fails, don't append
  the ideas.md line). Re-running the same export must not silently duplicate the line.

**Reopens slightly (part of this task)**:
- P1-3/P1-4: add `priority` ('High' | 'Medium' | 'Low') and `title` (string) to the export
  response schema + the requirements prompt so the AI suggests them. Update
  `PromptTemplates.requirements.test.ts`.
- P1-5: add a priority control + title field (both pre-filled from the AI response,
  editable) to the export popup. `handleExport` sends the edited values. Update
  `popup.requirements.test.ts`.

**Done when** (✅ all met):
- [x] `POST /api/files/append-ideas` implemented with schema above, PathSanitizer + GitManager.
- [x] ID generation correct against the example profile conventions (verified: next ID after
      `ID-999` → `ID-1000`; respects 3-digit zero-padding).
- [x] Priority + title flow from export response → popup override → endpoint.
- [x] Types mirrored in both `shared/types.ts` files (singleton mirror after P1-7 cleanup).
- [x] Undo (`POST /api/git/undo`) reverts the export commit cleanly.

### P1-7: Documentation ✅ (this pass, 2026-07-05)
- [x] `ai-ui-editor/README.md` kept as the setup + API source of truth — documents export
      mode, project registration (P1-0), `/probe-root` + `/append-ideas`, and the models table.
- [x] Root `README.md` slimmed to a front-door index — the heavy narrative (shared
      understanding, known contradictions, doc status map) moved into `PROJECT_BRIEF.md`,
      which is now the single authoritative narrative (+ live status, formerly in the
      now-folded `GAP_AUDIT.md`).
- [x] `ai-ui-editor/PROJECT_PROFILE.md` updated to reflect that user-registered paths are
      selectable now (P1-0 shipped).
- [x] Stale snapshot/legacy docs removed as part of the sync: `ai-ui-editor/PROJECT_STATUS.md`,
      `MVP_COMPLETE.md`, `POSTMVP_TODO.md`, `config.ts`, and the dropped `extension/shared/types.ts`.
      (Their roles are covered by `ai-ui-editor/README.md` + this TODO + `PROJECT_BRIEF.md`.)
- [x] **Doc consolidation (2026-07-05)**: the four remaining overlapping root docs were
      folded to remove duplication — `PROJECT_DETAILS.md` (use cases already in
      `PROJECT_BRIEF.md` §3), `GAP_AUDIT.md` (live status folded into `PROJECT_BRIEF.md` §7;
      audit detail folded into the **Audit appendix** below), `MVP_REQUIREMENTS.md`
      (MVP-01…19 + API contracts folded into the **MVP spec of record appendix** below),
      and `VISION_REQUIREMENTS.md` renamed to `VISION.md`. The doc-consistency guard test
      (`docSync.test.ts`) was rewritten to pin the consolidated set.
- [x] A doc-consistency guard test pins the sync so the docs can't silently re-drift.

### P1-8: Testing
- [x] Unit tests for `getRequirementsPrompt()` incl. priority + title — `PromptTemplates.requirements.test.ts` (12).
- [x] Integration tests for `/api/files/append-ideas` (idempotency, ID generation, path-safety traversal rejection, GitManager commit) — `appendIdeas.test.ts` (15).
- [x] Integration tests for the project registry (P1-0) — `probeRoot.test.ts` (13), `registryPlumbing.test.ts` (9), ext `projectRegistry.test.ts` (30).
- [ ] E2E: register project → right-click → export → verify ideas.md line + requirements/ID/spec.md created. **Deferred** — no E2E harness exists yet (would need a running browser + a temp git project).

---

## Phase 1.5: Post-Phase-1 cleanup (2026-07-09 audit findings)

> **Why this exists**: a requirements-vs-code audit on 2026-07-09 verified every load-bearing
> Phase 1 claim against the source (all 10 endpoints live + wired, registry/storage/manifest
> confirmed, atomic+sanitized export commit, `validateConfig()` fail-fast at boot, type mirror
> + guard test intact, 224 tests green, both `tsc --noEmit` clean, extension builds). Phase 1 is
> genuinely complete — **no product capability is missing.** This phase holds the four small
> items the audit surfaced: one real code defect, two deferred-scope decisions to make, and a
> doc/test-count correction. None touches shipped behavior; all are safe to do before Phase 2.
> Pick any item, follow the "Done when" checklist, and you can start implementation without
> re-deriving the context.

### P1.5-1: Fix the leftover `antikythera` type cast in the export popup  *(code fix)*

**What & why** — `ai-ui-editor/extension/popup/App.tsx:417` casts the export profile as
`('antikythera' | 'generic')`:
```ts
projectProfile: activeProject()?.profileName as ('antikythera' | 'generic') | undefined,
```
The `example` profile was **renamed from `antikythera`** during the decouple work; every
other type contract and comparison in the codebase uses `'example' | 'generic'`
(`middleware/src/shared/types.ts`, `extension/shared/types.ts`, `App.tsx:389`).
This `as`-cast escaped typecheck because `as` is unchecked, and it is the **only surviving
`antikythera` reference in source** (verified by repo-wide grep). It is a direct violation of
the project's #1 guardrail ("built-in profiles are examples, not antikythera" — see
`PROJECT_BRIEF.md` §9/§10). It does not break runtime today (the real `profileName` value
passes through), but it is a latent lie in the type contract and naming.

**How to fix**
- [x] Change the cast to use the declared union instead of a hardcoded literal pair. Prefer
      importing the profile-name type (e.g. `ProjectProfileName` if exported from
      `shared/types.ts`, which is `'example' | 'generic'`) and casting to that; or simply
      `as 'example' | 'generic' | undefined`. Remove the `antikythera` literal entirely.
      → Done 2026-07-09: `App.tsx:417` cast now `as ('example' | 'generic') | undefined`.
- [x] Confirm `typesMirror.test.ts` still reflects `'example' | 'generic'` on both sides —
      this change should *narrow* toward the mirror, not diverge from it.
- [x] grep shield: after the fix, `grep -rniE "antikythera" ai-ui-editor/middleware/src ai-ui-editor/extension`
      (with node_modules excluded) returns **zero hits in `.ts`/`.tsx`**.

**Done when** — [x] App.tsx:417 no longer mentions `antikythera`; [x] `npm test` (ext + mw)
still green (77 ext + 147 mw); [x] both `npx tsc --noEmit` clean + ext build clean; [x]
repo-wide source grep for `antikythera` is empty. *(Optional guard test deferred — the grep
is now trivially empty, so a dedicated `namingGuard.test.ts` is low-value until names can
drift again; revisit if profiles multiply.)*

---

### P1.5-2: Decide the DevTools panel fate — wire it OR delete it  *(scope decision + code)*

**What & why** — `ai-ui-editor/extension/devtools/` is a **full React panel that is built but
disconnected.** `DevToolsPanel.tsx` registers a listener for `edit-applied` / `edit-undone`
messages and persists an edit history to `localStorage`; it also sends `undo-specific`
messages. **But nothing in the extension ever broadcasts `edit-applied`/`edit-undone`** (repo-wide
grep finds those strings *only* in the panel's own listener), and none of `edit-applied`/
`edit-undone`/`undo-specific` appear in the `ExtensionMessage` type union
(`extension/shared/types.ts`). So the panel can never receive history — it is a UI with no
data source. The docs correctly mark this "deferred" (see Audit appendix "P1-7 follow-ups
explicitly deferred"). Carrying ~150 lines of dead, unmaintained code into Phase 2 is itself
a drift risk. **Pick one — do not leave it undecided.**

**Option A — Wire it (recommended; the UI investment is already paid)** ✅ done 2026-07-09
- [x] Add `'edit-applied'` and `'edit-undone'` to the `ExtensionMessage` type union in both
      `extension/shared/types.ts` and `middleware/src/shared/types.ts` (type-mirror
      convention — added to **both** in the same change; `typesMirror.test.ts` pins
      lockstep; also documented with `+ P1.5-2` guards). (`undo-specific` was added too.)
- [x] (Deviation from the literal "broadcast from `background.ts`" above — logged) The
      apply/undo logic lives in the **popup** (`App.tsx` `handleApply`/`handleUndo`), and
      `background.ts`'s `send-to-server` is a generic `{endpoint, body}` relay with no
      notion of apply-vs-undo. The popup is the actor that knows which `EditOption.id` was
      applied and whether `/api/files/write`/`/api/git/undo` succeeded, so the broadcast is
      emitted from the popup on success (using the same `chrome.runtime.sendMessage` channel
      the background uses — the devtools-panel listener receives it identically regardless of
      emitting context). Stable per-edit `id` = `EditOption.id` (set by the AI response).
      New `extension/shared/editHistoryBroadcast.ts` holds the pure `editAppliedPayload` /
      `editUndonePayload` helpers (mirrors `applyDiff`/`resolveApplyBase` testability pattern).
- [x] `undo-specific` (panel → background) is handled: `background.ts` `case 'undo-specific'`
      POSTs `/api/git/undo` and broadcasts `edit-undone` echoing the panel's `entryId`.
      Per the note, this is **"undo last" semantics initially** (`/api/git/undo` only undoes
      the most recent commit; per-edit undo is not yet supported). The panel's `undo-specific`
      send is no longer a dangling message.
- [x] Test: `extension/__tests__/panelHistory.test.ts` (6 asserts) pins the
      `editAppliedPayload` / `editUndonePayload` payload contract (stable id, the fields the
      panel reads, exact `type` strings) + a `chrome.runtime.sendMessage` spy asserting the
      emitted payload is forwarded verbatim. Extension tests: 77 → **83** (docSync count-guard
      bumped to `LIVE_EXT=83 / LIVE_GRAND=231` in the same change).

**Option B — Delete it (acceptable if Phase 2 won't use a history panel soon)** — *not chosen*
- [ ] (Not done — Option A chosen instead.) Remove `ai-ui-editor/extension/devtools/` entirely.

**Done when** — [x] a single option chosen and complete; [x] no `edit-applied`/`edit-undone`/
`undo-specific` strings remain in source except where actually wired+typed (verified: panel
listener + popup/background emitters + the union); [x] `npm test` green (148 mw + 83 ext =
231); [x] `manifest.json` + extension build clean (devtools entries unchanged — panel is now
a live, wired UI).

---

### P1.5-3: Add an end-to-end test harness  *(product enhancement; unblocks safe Phase 2)*

**What & why** — Phase 1's unit/integration coverage is strong (148+83 tests) but the
**riskiest cross-boundary chain has no end-to-end test**: popup → registry → content-script →
middleware → on-disk git project. The audit explicitly flagged this as the one remaining test
gap (Audit appendix "P1-8 testing stretch goals": E2E is the only ⏸️ item). Phase 2 adds *more*
cross-boundary behavior (ProfileManager reading the registry, per-profile output paths), so a
working E2E harness now de-risks every later task.

**How to build** (suggested shape — adapt to the existing Vitest setup)
- [ ] Add an E2E project type/test dir, e.g. `ai-ui-editor/e2e/`. Use a **temp git project on
      disk** (create in `os.tmpdir()` via a setup script: `git init`, a `package.json` marker
      so `/api/files/probe-root` accepts it, and a profile-appropriate `ideas.md`).
- [ ] Spin the real middleware via a Vitest `globalSetup` (`npm run dev` equivalent, or
      `server.ts`'s exported `start()` on an ephemeral port) so tests hit the live HTTP routes
      — not `app.inject`. Use `fetch` against `localhost:<port>/api/...`.
- [ ] The browser side: either (a) a real Chrome via puppeteer/playwright loading the built
      extension from `extension/dist`, or (b) a lighter "transport E2E" that replays the
      exact `chrome.runtime.sendMessage` payloads the popup sends. Prefer (a) for true E2E;
      use (b) only if a headed browser isn't feasible in CI.
- [ ] **The one canonical test**: register the temp project path → simulate right-click export
      → POST `/api/files/append-ideas` with a spec → assert the `ideas.md` line
      (`- [ID-001] {title} | Priority: {Priority}`) *and* `requirements/ID-001/spec.md` exist
      on disk, and that the resulting git commit is undoable via `/api/git/undo` (files vanish
      after undo). Assert ID increments on a second run.
- [ ] Gate path-safety in E2E too: a `projectRoot` containing `..` or a non-absolute URL is
      rejected (mirrors `registryPlumbing.test.ts` but through the real server).

**Done when** — [ ] one green E2E test exercises register→export→verify-on-disk→undo;
[ ] E2E runs against the real middleware (not just `inject`); [ ] `npm test` from `middleware`
optionally includes the e2e suite (or a separate `npm run test:e2e`); [ ] the test cleans up
its temp git project in teardown.

---

### P1.5-4: Correct the stale test counts in the docs  *(doc update; unblocks the guard)*

**What & why** — the 2026-07-09 audit ran the suites and found the docs advertise a stale
number, **and the doc's own table doesn't foot internally**:
- `TODO.md:471,499` say **221 tests** (`144 middleware + 77 extension`). Actual run:
  **147 middleware + 77 extension = 224**.
- `TODO.md:490,509` say `docSync.test.ts` has **16** assertions. Actual: **18**.
- `TODO.md:492` labels the middleware column total **144**, but the rows above it sum to
  **145** (an arithmetic slip independent of the count change).

`PROJECT_BRIEF.md` §7 repeats the stale "221 tests (144 middleware + 77 extension)" too. The
`docSync.test.ts` guard does **not** assert these numbers — which is *why* 221→224 drifted
unnoticed — so after fixing the prose, pin the count so a future test-add re-breaks the guard
and forces the doc to follow.

**How to fix** — ✅ done 2026-07-09 (note: adding the guard assertion itself bumped the
live totals +1, so the corrected targets are **148 / 225 / 19**, not the original 147/224/18).
- [x] `TODO.md` Appendix A test table: set `docSync.test.ts` → **19**; set **Middleware
      Total → 148**; set **Grand Total → 225**. Recounted every row; arithmetic now foots
      (rows sum to 148).
- [x] `TODO.md` prose + grand-total cell + audit-history callout: bumped to **148 / 225**;
      added a dated `2026-07-09 (P1.5 audit + cleanup)` audit-history entry (the old "16
      assertions / unchanged at 221" line is kept as historical record of the consolidation
      pass).
- [x] `PROJECT_BRIEF.md` §7 status paragraph + §12 "in one breath": changed to
      "225 tests (148 middleware + 77 extension)".
- [x] **Added the count pin to `middleware/__tests__/docSync.test.ts`** as
      `P1.5-4: TODO.md + PROJECT_BRIEF.md state the current live test totals (count pin)`.
      It snapshots `LIVE_MW=148 / LIVE_EXT=77 / LIVE_GRAND=225 / LIVE_DOCSYNC=19` and greps
      the docs for those numbers + the table total cell + the docSync row. **Verified by
      negative control**: temporarily drifting `225→226` in PROJECT_BRIEF.md made the test
      fail (1 failed | 18 passed); after restore, 19 pass. A future test-add without bumping
      the LIVE_* constants + the doc will now fail the guard — exactly the intent.

**Done when** — [x] TODO.md + PROJECT_BRIEF.md state **225 / 148 / 19** and the table
arithmetic foots (rows sum to 148); [x] `npm test` green (148 mw + 77 ext = 225) *including*
the new count-pinning assertion in `docSync.test.ts` (now 19 tests); [x] a deliberate
doc drift now *fails* the guard (verified by negative control).

---

### Phase 1.5 — ordering & exit

Suggested order: **P1.5-1** (one-line fix, removes a guardrail violation) → **P1.5-4** (doc +
guard, so future drift is auto-caught) → **P1.5-2** (scope decision — wire or delete) →
**P1.5-3** (E2E harness, larger, but de-risks everything after). All four are independent
enough to do in any order; the only soft dependency is that P1.5-3's E2E test will
*naturally* re-verify the P1.5-1 fix and exercise the P1.5-2 decision, so doing it last lets
it double as regression cover for the others.

**Phase 1.5 is done when** its checklist is empty *and* `npm test` / both `tsc --noEmit` /
extension `npm run build` are green *and* the docSync guard (with the new count pin) passes.
Then start Phase 2.

---

## Phase 2: Project Profiles + Multi-Project Support

(**Reframed** under the new model: Phase 2 matures the registry from Phase 1's
manual/origin-based selection into a richer profile system. Most of this stays as
written; the "Profile Loader" now channels the *user-registered* projects from P1-0,
not only provider-side config.)

**Goal**: Richer per-project context and selection UX on top of the P1-0 registry.

### P2-1: Profile Schema
- [ ] Define profile JSON schema (extends `ProjectProfile`; now includes registered path + markers).
- [ ] Document profile format (update `PROJECT_PROFILE.md`).

### P2-2: Profile Loader
- [ ] Add `ProfileManager` service in `middleware/src/services/` that reads from the
      **registered project registry** (P1-0) plus built-in profiles.
- [ ] Load profiles from `config/profiles/*.json` (provider-side known projects).
- [ ] Prompt template uses profile context (already true for built-ins; extend to registry).

### P2-3: UI for Profile Selection
- [ ] Profile/project dropdown in popup (driven by the registry, not just URL detection).
- [ ] Persist last-used profile per origin.

### P2-4: Output Customization
- [ ] Per-profile output paths (already in `ProjectProfile.directories`).
- [ ] Per-profile artifact templates (match the project's real spec.md sections — e.g.
      the example profile's Overview/Requirements/Scope/Edge Cases/Constraints sections).

---

## Phase 3: API Bridge (Full Integration)

**Goal**: Direct, live handoff from wysiwyg to a target project's pipeline. This is where
coupling to the target project's *internal* API begins — Phase 1 deliberately avoids it
(file handoff only).

### P3-1: Target Project API Endpoint
- [ ] Add `POST /api/ideas/upsert` **in the target project** (uses its own internal API;
      **never** write internal state files directly — follow the target project's own conventions).
- [ ] Accepts: `{ spec, architectureHints, testScenarios, title, priority }`.
- [ ] Creates a new item in the target project's pipeline at intake stage.

### P3-2: wysiwyg → Target Project HTTP Client
- [ ] Add a generic `pipelineClient` in `middleware/src/services/`.
- [ ] POST to the target project's upsert endpoint.
- [ ] Handle auth (API key or local-only).

### P3-3: Chrome Extension Pipeline View
- [ ] New panel showing the target project's Kanban board (fetch from its API).
- [ ] Click item → see full spec + artifacts.

### P3-4: Status Sync
- [ ] After the target project processes the item, update wysiwyg UI.
- [ ] Show: "In Progress → Review → Complete".

---

## Phase 4: Advanced Features

**Goal**: Rich context, better AI, team collaboration.

### P4-1: Multi-Element Selection
- [ ] Capture multiple elements in one export.
- [ ] Describe relationship: "Add a button group here".

### P4-2: Conversation History
- [ ] Store export history per project.
- [ ] Reference previous exports: "As we did for ID-001...".

### P4-3: AI Follow-Up Questions
- [ ] Before generating spec, AI asks clarifying questions.
- [ ] "Should this poll Jira or use webhooks?"

### P4-4: Team Sharing
- [ ] Export specs as shareable markdown.
- [ ] Include in PR descriptions.

---

## Out of Scope (Explicitly Deferred)

- [ ] wysiwyg directly modifying a target project's pipeline state (bypasses its own
      6-stage loop) — only via that project's own API, in Phase 3.
- [ ] Running a target project's tests from wysiwyg.
- [ ] Real-time sync between wysiwyg and the target project's UIs.
- [ ] Automatic priority assignment (user decides; AI only suggests).

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to create a new TODO | < 2 min | Stopwatch test (10 iterations) |
| Spec quality (harness feedback) | > 80% actionable | Manual review |
| Files-to-modify accuracy | > 70% correct | Compare vs. actual changes |
| User satisfaction | "This saves me time" | User interview |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AI generates vague specs | Add few-shot examples to prompt; require numbered requirements |
| Wrong files suggested | Include project profile + RAG over codebase |
| ideas.md format drifts | Validate against the target project's actual intake-file format (verified for the example profile in P1-6) |
| User bypasses review | Make review mandatory; no auto-export |
| Path traversal via projectRoot | Route every write through `PathSanitizer.safeFilePath` (Conventions) |

---

## Related Files

| File | Purpose |
|------|---------|
| `ai-ui-editor/extension/content-script.ts` | Context menu, DOM capture; uses the registered on-disk `projectRoot` (P1-0). |
| `ai-ui-editor/extension/shared/projectRegistry.ts` | On-disk path registry (P1-0): per-origin active project + global override, `chrome.storage.local`. |
| `ai-ui-editor/extension/popup/App.tsx` | Popup UI; `handleExport` posts to `/api/files/append-ideas` (P1-6). |
| `ai-ui-editor/extension/background.ts` | Service worker, messaging relay; carries the registered projectRoot to the content script (P1-0). |
| `ai-ui-editor/middleware/src/routes/ai.ts` | AI endpoints incl. `/edit`, `/edit/stream`, `/export-requirements`. |
| `ai-ui-editor/middleware/src/routes/files.ts` | File routes: `/validate`, `/write`, `/read`, `/probe-root` (P1-0), `/append-ideas` (P1-6). |
| `ai-ui-editor/middleware/src/ai/PromptTemplates.ts` | Prompt generation; `getRequirementsPrompt` (priority + title). |
| `ai-ui-editor/middleware/src/config/project-profiles.ts` | Profile defs + URL detection (built-in `example` + `generic`). |
| `ai-ui-editor/middleware/src/services/PathSanitizer.ts` | Path-traversal guard; `/append-ideas` routes through `safeFilePath`. |
| `ai-ui-editor/middleware/src/services/GitManager.ts` | Git write/undo; `/append-ideas` commits via `writeFilesWithGit` (undoable). |
| `ai-ui-editor/extension/shared/types.ts` ↔ `ai-ui-editor/middleware/src/shared/types.ts` | **Manually mirrored — keep in lockstep** (Conventions); pinned by `typesMirror.test.ts`. (A stray `ai-ui-editor/shared/types.ts` copy was removed in P1-7 cleanup; the live mirror pair is the two files above.) |

---

## Appendix A — Audit (folded from `GAP_AUDIT.md`, 2026-07-05)

> The live code-vs-roadmap status below was a standalone doc (`GAP_AUDIT.md`) until the
> 2026-07-05 consolidation; it's preserved here so the roadmap file also carries the audit.
> Narrative status (the one-paragraph view) lives in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) §7.

### TL;DR

**Phase 1 (Requirements Bridge) is feature-complete and test-pinned.** There are
**0 open code blockers.** The remaining work is:

1. **P1-7 doc-sync** — ✅ **done** (2026-07-05). The narrative docs have been reconciled to
   "shipped"; this consolidation (fold of `PROJECT_DETAILS.md` / `GAP_AUDIT.md` /
   `MVP_REQUIREMENTS.md`, rename of `VISION_REQUIREMENTS.md` → `VISION.md`) is the second
   pass. A doc-consistency guard test pins the consolidated set.
2. **Two explicitly-deferred enhancements** — DevTools panel wiring, and streaming for
   Export mode. Both were marked "deferred / not blocking" by the original audit; neither
   is required for Phase 1.
3. **P1-8 testing stretch goals** — most of P1-8's checklist is already covered by the
   tests landed with the two commits; only an end-to-end test remains.

The next real milestone is **Phase 2** (richer profile system on top of the P1-0 registry).

### Shipped (verified against code, 2026-07-05)

#### Phase 1 hardening & Requirements Bridge foundation — all shipped

| Item | What it is | Verification |
|------|------------|---------------|
| **P1–P10** | Extension build pipeline, context menu, apply-flow fix, Zod + path safety, WebSocket fix, DiffValidator (TS API + oxlint), real sourcemap resolution, real token streaming, XSS sanitization, docs sync. | Each verified against code in the original audit; unchanged. |
| **P1-1** | Project profiles — `PROFILES` (`example` + `generic`), `detectProfile`, `getProfile`. | `ProjectProfiles.test.ts` (19). |
| **P1-2** | Extension context menu (second item, mode handling). | `background.ts` menu items. |
| **P1-3** | Export endpoint `POST /api/ai/export-requirements`. | `ai.ts`, `OpencodeClient.generateRequirementsExport`; 10 tests. |
| **P1-4** | Requirements prompt template — `getRequirementsPrompt` with profile injection + AI-suggested `priority`/`title`. | `PromptTemplates.requirements.test.ts` (12). |
| **P1-5** | Popup export UI — spec preview, editable textarea, hints/scenarios/edge-cases, priority dropdown, title field. | `popup.requirements.test.ts` (17). |

#### Phase 1 capstones — the two former blockers, now shipped

| Item | Commit | What landed | Tests added |
|------|--------|-------------|-------------|
| **✅ P1-0 Project Registry** | `e9d2b91` | On-disk path registry in `extension/shared/projectRegistry.ts` (per-origin active project + global override); `chrome.storage.local` persistence; `content-script.ts` uses the registered path (orig. `window.location.origin` placeholder); `GET /api/files/probe-root` validates a project-marker file on disk. | ext `projectRegistry.test.ts` (30); mw `probeRoot.test.ts` (13) + `registryPlumbing.test.ts` (9). |
| **✅ P1-6 File Export** | `acb45ab` | `POST /api/files/append-ideas`; `generateNextId` (3-digit zero-padded `ID-001`…`ID-999`, then `ID-1000`); atomic intake-line + `spec.md` write via `GitManager.writeFilesWithGit`; one-click undo via `/api/git/undo`; `priority` + `title` flow AI prompt → export response → popup → endpoint. | `appendIdeas.test.ts` (15), `OpencodeClient.normalizePriority.test.ts` (6), +2 prompt tests. |

#### Follow-up fixes (originally 🟡 drift/minor) — all resolved

| Item | Resolution | Guard test |
|------|-----------|------------|
| **Type-mirror drift** | Both `shared/types.ts` reconciled to full lockstep (same exported type-name set + cross-package sample construction). | `typesMirror.test.ts` (4). |
| **Hardcoded project-label strings** | Popup/background labels made dynamic from the active project (`${projectLabel}`, `${intakeLabel}`, "Export to project TODO"). | Verified: no hardcoded project-specific strings in user-facing labels. |
| **Model list proliferation** | Consolidated into `AVAILABLE_MODELS` (single `readonly string[]` source of truth in `OpencodeClient.ts`); `listAvailableModels()` returns it; `validateConfig()` rejects an env `NVIDIA_MODEL` not in the catalog; `server.ts` calls `validateConfig()` at boot (fail-fast); `ai-ui-editor/README.md` table kept in lockstep. | `OpencodeClient.models.test.ts` (9, incl. startup-wiring). |
| **Dual sanitization approaches** | `sanitizeFilePath` hardened to segment-wise traversal removal (Windows backslashes, obfuscated `..`, null bytes, absolute paths) and documented as a *coherence heuristic* — `PathSanitizer.safeFilePath` remains the authoritative `path.resolve()`-based security boundary (defense in depth). | +6 tests in `ResponseParser.test.ts`. |

#### Confirmed endpoints (all wired, all ✅)

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

#### P1-7 follow-ups explicitly deferred (non-blocking)

- **DevTools panel wiring** ✅ done (P1.5-2, 2026-07-09) — `extension/devtools/`'s React panel
  now receives a live edge: the popup broadcasts `edit-applied`/`edit-undone` on apply/undo
  success; `background.ts` handles the panel's `undo-specific` → `/api/git/undo`. Three message
  types added to the mirror union; `panelHistory.test.ts` (6) pins the contract. (The "undo
  last" caveat applies — per-edit undo is still future work.)
- **Export-mode streaming** — Edit mode streams via `/api/ai/edit/stream`; Export yields a
  single spec, so streaming adds little value. *Deferred, not pursued.*

#### P1-8: Testing stretch goals — mostly covered, one gap

| P1-8 checklist item | Status |
|----------------------------------|--------|
| Unit tests for `getRequirementsPrompt()` incl. priority + title | ✅ `PromptTemplates.requirements.test.ts` (12). |
| Integration tests for `/api/files/append-ideas` (idempotency, ID generation, path-safety traversal, GitManager commit) | ✅ `appendIdeas.test.ts` (15). |
| Integration tests for the project registry (P1-0) | ✅ `probeRoot.test.ts` (13) + `registryPlumbing.test.ts` (9) + ext `projectRegistry.test.ts` (30). |
| E2E: register project → right-click → export → verify `ideas.md` line + `requirements/ID/spec.md` created | ⏸️ **Not done.** No E2E harness exists; would require a running browser + a temp git project. Deferred until an E2E layer is added. |

### Test results (re-verified 2026-07-09)

> All green. **148 middleware + 83 extension = 231 tests passing.** Both packages
> `tsc --noEmit` clean. Extension `npm run build` succeeds (popup + both workers).
> (`docSync.test.ts` asserts the consolidated doc set rather than the pre-consolidation
> file list; its count — now pinned by the P1.5-4 count-guard assertion — is included in the
> middleware total. These totals are pinned by `docSync.test.ts`'s count-guard assertion —
> change the count, change the doc in the same commit.)

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
| Middleware | `docSync.test.ts` *(doc-consistency guard, re-pointed at consolidated set; +count pin P1.5-4)* | 19 | ✅ |
| Middleware | `typesMirror.test.ts` *(P1-7 lockstep guard)* | 4 | ✅ |
| **Middleware Total** | | **148** | ✅ |
| Extension | `apply.test.ts` | 10 | ✅ |
| Extension | `diff.test.ts` | 7 | ✅ |
| Extension | `popup.requirements.test.ts` | 17 | ✅ |
| Extension | `projectRegistry.test.ts` *(P1-0)* | 30 | ✅ |
| Extension | `sanitize.test.ts` | 13 | ✅ |
| Extension | `panelHistory.test.ts` *(P1.5-2)* | 6 | ✅ |
| **Extension Total** | | **83** | ✅ |
| **Grand Total** | | **231** | ✅ |

### How this audit changed

- **2026-07-04 (original):** identified 2 🔴 blockers (P1-0, P1-6) + 4 🟡 drift/minor items; 129 tests.
- **2026-07-05 (rewrite #1):** P1-0 + P1-6 shipped (+83 tests → 206); all 4 drift/minor items resolved with guard tests; `validateConfig()` wired into `server.ts` boot. **0 open code blockers.** Remaining gap: doc-sync (P1-7).
- **2026-07-05 (rewrite #2):** P1-7 doc-sync completed — all narrative docs reconciled to "shipped"; 6 stale-snapshot/legacy files deleted; dangling references cleaned; doc-consistency guard test added (+15 tests → 221). **0 open gaps in Phase 1.**
- **2026-07-05 (consolidation — this pass):** folded the remaining overlapping docs
  (`PROJECT_DETAILS.md`, `GAP_AUDIT.md`, `MVP_REQUIREMENTS.md`) into `PROJECT_BRIEF.md` /
  this `TODO.md` appendix set; renamed `VISION_REQUIREMENTS.md` → `VISION.md`; rewrote the
  `docSync.test.ts` assertions to pin the consolidated set (16 assertions). Test count
  unchanged at 221. Next milestone: Phase 2 + deferred enhancements.
- **2026-07-09 (P1.5 audit + cleanup):** requirements-vs-code audit re-verified Phase 1
  complete against the source (all 10 endpoints, registry, atomic export, `validateConfig`,
  type mirror). Test totals had grown since the consolidation but the docs still said "221"
  (the table rows summed to 145 while the cell said 144) — corrected prose + table to the
  live **148 middleware + 77 extension = 225**, and added a `docSync.test.ts` count-guard
  assertion (docSync 16 → 19) so a future test-add without a doc bump now auto-breaks the
  guard. Also fixed one real code defect: the `antikythera` cast at `App.tsx:417`. See the
  **Phase 1.5** section above.
- **2026-07-09 (P1.5-2 panel wiring):** chose **Option A** — wired the disconnected DevTools
  history panel rather than deleting it. Added `'edit-applied'`/`'edit-undone'`/`'undo-specific'`
  to the `ExtensionMessage` union in both mirrors; the popup broadcasts `edit-applied`/`edit-undone`
  on apply/undo success via new pure helpers in `extension/shared/editHistoryBroadcast.ts`;
  `background.ts` handles the panel's `undo-specific` → `/api/git/undo` ("undo last" semantics
  for now — per-edit undo is future work). New `panelHistory.test.ts` pins the payload contract
  (+6 → extension 77 → **83**, grand 225 → **231**; `docSync` count-guard bumped to match).
  Fixed a latent bug as a side effect: the popup's `server-response` handler previously
  mis-routed the `/api/files/write` response (it now intercepts it cleanly). Still open:
  **P1.5-3** (E2E harness). See the **Phase 1.5** section above.

---

## Appendix B — MVP spec of record (folded from `MVP_REQUIREMENTS.md`, 2026-07-05)

> ⚠️ **SUPERSEDED — kept for historical intent only.** The MVP described here (MVP-01…19)
> has **shipped**, and so has Requirements Bridge Phase 1 (Project Registry `e9d2b91` +
> File Export `acb45ab`). Do **not** treat the unchecked-looking boxes or the "Out of
> Scope" list below as a current to-do list — read it for *intent and acceptance criteria*,
> not status. The count is **19** MVP tasks (MVP-01…MVP-19); **19 is correct** (the stale
> celebratory doc that said "20" was removed in the P1-7 cleanup). The current roadmap is
> the body of this `TODO.md`; the single authoritative narrative is
> [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md).

### B.1 MVP Scope Statement

**Goal**: Enable a developer to right-click any UI element in their local dev server, describe a visual/CSS change in natural language, review AI-generated options, and have the selected change applied to their source code with instant live reload.

**Out of Scope for MVP** (historical — see `VISION.md` for the deferred north star):
- Adding new functional logic (API calls, event handlers)
- Creating new components/elements
- Backend/database changes
- Multi-file coordinated changes
- Production website editing
- Team collaboration features

### B.2 Core Features (Must Have) — acceptance criteria

#### B.2.1 Element Selection & Context Capture
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-01 | Right-click context menu on any element | Custom "Edit with AI" menu item appears on right-click |
| MVP-02 | Capture element HTML + computed styles | `outerHTML`, `getComputedStyle()`, all classNames, IDs |
| MVP-03 | Capture element hierarchy | Parent chain up to `<body>` with selectors |
| MVP-04 | Detect project framework | Read package.json, detect React/Vue/Svelte + version |
| MVP-05 | Resolve source file via sourcemaps | Map DOM element → source file:line (Vite/Webpack) |

#### B.2.2 Natural Language Input & AI Interaction
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-06 | Floating input panel | Appears near clicked element, accepts text input |
| MVP-07 | Pre-filled context hint | Shows "Editing: .card.primary (src/Card.tsx:42)" |
| MVP-08 | Send to AI with full context | POST to localhost:3000/api/ai/edit with element + instruction |
| MVP-09 | Receive structured AI response | JSON with `options[]` (description, diff, preview HTML) |
| MVP-10 | Display 2-3 visual options | Render each option in sandboxed iframe preview |

#### B.2.3 Review & Apply Workflow
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-11 | Side-by-side diff view | Original vs. proposed code for each option |
| MVP-12 | One-click apply | "Apply" button writes diff to source file |
| MVP-13 | Validation before write | Run eslint + tsc --noEmit on modified file |
| MVP-14 | Git commit on apply | Auto-commit with message "AI: [instruction]" |
| MVP-15 | Live reload verification | Browser updates via HMR within 2 seconds |

#### B.2.4 Error Handling & Feedback
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-16 | AI failure handling | Show error, allow retry with modified instruction |
| MVP-17 | Validation failure | Show lint/type errors, allow manual fix or retry |
| MVP-18 | Sourcemap failure fallback | "Could not locate source. Select file manually?" |
| MVP-19 | Undo last change | "Undo" button reverts last git commit |

### B.3 Technical Stack (MVP)

| Layer | Technology | Version |
|-------|------------|---------|
| Extension | Chrome Extension Manifest V3 | - |
| Content Script | TypeScript + vanilla DOM APIs | - |
| Popup UI | React 18 + Tailwind CSS | - |
| Middleware | Node.js 20 + Fastify | - |
| AI Client | NVIDIA NIM (OpenAI-compatible SDK) | meta/llama-3.1-70b-instruct (default) |
| AI Fallback | Mock responses (when API key unset) | Built-in mock |
| File Ops | Node.js fs/promises + simple-git | - |
| Validation | ESLint + TypeScript CLI (now TS programmatic API + oxlint, P6) | Project config |
| Sourcemaps | source-map package + custom resolver | Real Vite/Webpack sourcemap resolution (MVP-05/18) |

### B.4 MVP API Contracts

#### POST /api/ai/edit
**Request**:
```typescript
interface EditRequest {
  element: {
    html: string;
    computedStyles: Record<string, string>;
    classNames: string[];
    id?: string;
    hierarchy: string[];  // CSS selectors from element to body
    eventListeners: string[];  // e.g., ["click", "mouseenter"]
  };
  instruction: string;
  context: {
    url: string;
    framework: 'react' | 'vue' | 'svelte' | 'unknown';
    projectRoot: string;
    sourceFile?: string;  // If resolved via sourcemap
    sourceLine?: number;
    sourceCode?: string;  // Full file content
    packageJson: object;
    tailwindConfig?: object;
  };
}
```
**Response**:
```typescript
interface EditResponse {
  options: Array<{
    id: string;
    description: string;
    diff: string;  // Unified diff format
    previewHtml: string;  // Full component HTML for iframe
    file: string;  // Target file path
    type: 'css' | 'jsx' | 'template';
  }>;
  followUpQuestions?: string[];
  error?: string;
}
```

#### POST /api/files/validate
**Request**: `{ file: string; content: string }`
**Response**: `{ valid: boolean; errors: LintError[] }`

#### POST /api/files/write
**Request**: `{ file: string; content: string; commitMessage: string }`
**Response**: `{ success: boolean; commitHash?: string }`

### B.5 MVP Success Criteria (Definition of Done)

| Criterion | Metric | Verification |
|-----------|--------|--------------|
| **End-to-end flow works** | Right-click → instruction → preview → apply → see change | Manual test on sample React project |
| **Response time** | < 3s from instruction to options displayed | Stopwatch test (10 iterations) |
| **Diff accuracy** | > 90% of applied diffs compile without errors | Automated test suite |
| **Source mapping** | > 80% of elements resolve to correct file:line | Test on 5 components |
| **Framework support** | Works on React + Vite project | Test on created sample app |
| **No data loss** | Git history preserves all changes | Verify git log after 20 edits |
| **User experience** | Non-technical user can make 3 changes in 5 min | Usability test |

### B.6 Sample Test Project (MVP)

A minimal React + Vite + Tailwind project with `src/components/Card.tsx` (multiple card
variants), `src/components/Button.tsx` (button with variants), `src/pages/Integrations.tsx`
(list of integration cards), and `src/pages/AutomationStudio.tsx` (workflow buttons) — used
for all MVP development and testing (today this is `ai-ui-editor/sample-project/`).

---

*Last Updated: 2026-07-05*
