# wysiwyg TODO

**Created**: 2026-07-04
**Last revised**: 2026-07-10 (Phase 2 + P2.5 complete — P2-1…P2-4 + A1…A10 all shipped; 297 tests (104 ext + 193 mw); see Audit appendix)

> **Status:** **Phase 1 (Requirements Bridge), Phase 2 (Project Profiles), and
> Phase 2.5 (Popup Accessibility/UX Polish) are feature-complete and test-pinned**
> (297 tests passing — 104 extension + 193 middleware). Phase 1's two former
> blockers shipped: **P1-0 Project Registry** (`e9d2b91`) and **P1-6 File Export**
> (`acb45ab`). Phase 2 shipped P2-1 (profile JSON schema) → P2-2
> (`ProfileManager`) → P2-3 (profile-selection UI, `e79432c`) → P2-4 (per-profile
> artifact templates). Phase 2.5 (popup UX/accessibility polish) shipped all 10
> A-items (A1–A10) across 7 commits on branch `phase-2` (see the Phase 2.5
> section below for the commit log and patterns established). The Phase 1 + Phase 2
> + Phase 2.5 sections below are kept as a record of what was specified and what
> shipped; nothing in them is active. **The next real milestone is Phase 3** (API
> Bridge — direct live handoff to a target project's pipeline) — see the **Audit
> appendix** at the end of this file for the live code-vs-roadmap status (formerly
> a standalone `GAP_AUDIT.md`, now folded in here). The single authoritative
> narrative (pitch + live status + scope)
> lives in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md).

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

## Phase 2: Project Profiles + Multi-Project Support ✅ complete (2026-07-10)

> All four P2 tasks shipped: P2-1 (profile schema) → P2-2 (`ProfileManager`) →
> P2-3 (profile-selection UI, `e79432c`) → P2-4 (per-profile artifact templates).
> Commits on `phase-2`. 297 tests green (104 ext + 193 mw). Nothing in Phase 2 is
> active. P2.5 (popup a11y/UX polish) is also done — see below.

(**Reframed** under the new model: Phase 2 matures the registry from Phase 1's
manual/origin-based selection into a richer profile system. Most of this stays as
written; the "Profile Loader" now channels the *user-registered* projects from P1-0,
not only provider-side config.)

**Goal**: Richer per-project context and selection UX on top of the P1-0 registry.

### P2-1: Profile Schema ✅ shipped (2026-07-10)
- [x] Define profile JSON schema (extends `ProjectProfile`; now includes registered path + markers).
  - `ProjectProfile` extended with `rootPath` (runtime-only), `markers`, `intakeLineFormat`,
    `artifactTemplates`. `ProfileEntry` = on-disk subset (`Omit<ProjectProfile, 'rootPath'>`).
  - `validateProfileEntry()` validates JSON files at load boundary — rejects missing required
    fields, wrong types, and stray `rootPath`. Pure (no fs); used by `ProfileManager` (P2-2).
  - Two JSON profiles on disk: `config/profiles/example.json` + `config/profiles/generic.json`,
    kept in lockstep with the in-code `PROFILES` table.
- [x] Document profile format (update `PROJECT_PROFILE.md`).
  - Schema Reference section (§Schema) covers `ProfileEntry`, `validateProfileEntry`, the
    on-disk vs. in-code split, and P2-1 extension fields.

### P2-2: Profile Loader ✅ shipped (2026-07-10)
- [x] Add `ProfileManager` service in `middleware/src/services/` that reads from the
      **registered project registry** (P1-0) plus built-in profiles.
  - `ProfileManager` (262 lines): composes in-code `PROFILES` (P1-1) + on-disk JSON profiles
    (P2-1) + user-registered override (`RegisteredProjectRef` from the P1-0 registry).
    Resolution order: registered override → JSON file → in-code built-in → `generic` fallback.
    `rootPath` is layered only from the registered path; a relative path is rejected.
    `resolve()` replaces `getProfile` for registry-aware callers; `getProfile`/`detectProfile`
    stay for URL-only paths.
- [x] Load profiles from `config/profiles/*.json` (provider-side known projects).
  - Lazy-loaded once, cached; malformed files skipped with logged warning; non-.json files ignored.
    `lastLoadError()` surfaces diagnostics. `listProfileNames()` returns deduped union of
    built-ins + loaded JSON profiles.
- [x] Prompt template uses profile context (already true for built-ins; extend to registry).
  - `routes/ai.ts` (`/export-requirements`) resolves profile via `ProfileManager.resolve()`
    when `registeredProject` or `projectProfile` is sent; falls back to `detectProfile(url)`
    otherwise. `routes/files.ts` (`/append-ideas`) likewise uses `ProfileManager` when a
    registered project is present, preserving the old `getProfile('generic')` fallback.
  - `RegisteredProjectRef` type mirrored in both `shared/types.ts`; `projectProfile` widened
    from `'example' | 'generic'` to `string` so JSON-loaded profiles can be referenced.
  - Tests: `ProfileManager.test.ts` (35 tests, all passing).

### P2-3: UI for Profile Selection ✅ shipped (2026-07-10)
- [x] Profile/project dropdown in popup (first-class UI in header bar, visible at all
      times — not buried in `<details>`). Fetches available profiles from
      `GET /api/files/profiles` (built-in + JSON-loaded).
- [x] Persist last-used profile per origin (`profilePrefs` in `chrome.storage.local`,
      restored via `useEffect` keyed on `currentOrigin` — race condition fixed).
- [x] Tests: `popup.profileSelection.test.ts` (19) + `api.test.ts` (+1 profiles endpoint).
  - Commit `e79432c`.

### P2-4: Output Customization ✅ shipped (2026-07-10)
- [x] Per-profile output paths (already in `ProjectProfile.directories`).
  - Verified, not extended: `appendRequirements` already reads `intakeFile` +
    `directories.requirements` from the resolved profile (`files.ts`), so each
    profile's write lands in its own paths. (Writing secondary artifacts —
    `architecture.md`/`tests.md` from `architectureHints`/`testScenarios` — is
    deferred; only `spec.md` is written today. That's a deliberate scope hold,
    noted here so it isn't a silent gap.)
- [x] Per-profile artifact templates: inject `artifactTemplates` sections into
      the requirements prompt (replace hardcoded Overview/Requirements/Edge
      Cases/Acceptance Criteria) and into the `spec.md` scaffold (supplement
      missing sections so output always matches the profile's expected structure).
  - `PromptTemplates.specSectionsFor(profile)` is now the single source of truth
    for the spec section set: it reads the profile's `artifactTemplates` `spec.md`
    entry and falls back to the legacy four (`Overview`/`Requirements`/`Edge Cases`/
    `Acceptance Criteria`) when the profile has no template. `getRequirementsPrompt`
    uses it for both the `spec` JSON example and the `**spec**` guideline — the
    hardcoded four are gone.
  - `files.ts.supplementSpecSections(spec, profile)` is wired into `appendRequirements`:
    any expected section missing from the AI's spec is appended as
    `## <Section>\n\n_TBD.` so the written `spec.md` always matches the profile's
    structure, while AI-authored content is kept verbatim. Heading-based presence
    detection (case-insensitive, tolerant of trailing `:`/parenthetical/numbering).
  - Tests: `PromptTemplates.requirements.test.ts` (+7) + `appendIdeas.test.ts`
    (+6 incl. a scaffolded-spec integration case). 180 → 193 middleware tests.

---

## Phase 2.5: Extension UI/UX Polish (audit-driven) ✅ complete (2026-07-10)

**Added**: 2026-07-10, from a `ui-ux-pro-max` skill review of the popup
(`extension/popup/App.tsx` — React + Tailwind, Chrome extension). The skill is
app-platform-oriented, so only its stack-agnostic Quick Reference checklist
(§1–§8: accessibility, interaction, forms, feedback, layout, typography/consistency)
applies; the RN-specific touch-gesture/safe-area rules were skipped for this web popup.
Findings below are anchored to the skill's named rules; severities are the skill's.

> ✅ **P2.5 complete — all 10 A-items shipped across 7 commits on `phase-2`,
> 297 tests green (104 ext + 193 mw), `tsc --noEmit` clean.**
>
> **Commit log (ordered A1–A10):**
> - `385f255` "P2.5 — popup polish": A1 (role=alert on error), A2 (Modal replaces
>   `window.confirm()`, `components/Modal.tsx`), A3 (Feather SVG icons replace emoji
>   headers), A8 (stable keys — `key={hint}`/`{scenario}`/`{edgeCase}`), A10
>   (`cursor-pointer` + `focus-visible:ring` on buttons/selects).
> - `9d81ca7` "P2.5 A5": A5 (success channel — green `role="status"` `aria-live="polite"`
>   banner + `showSuccess()` with 4 s auto-dismiss, separate from red error channel).
> - `a0f82cb`: A4 (visible `<label>` + `sr-only` spans for the four placeholder-only
>   inputs: Add-project path, instruction textarea, manual source-pick).
> - `7a6c964`: A6 (stable loading region — `min-h-[7rem]` outer block + always-mounted
>   `<pre>` with `min-h-[4rem]` + "streaming…" placeholder; eliminates CLS).
> - `6f1e5f4`: doc-only — flipped the six stale checkboxes (A1/A2/A3/A5/A8/A10) that
>   had been committed-but-unchecked in the earlier commits.
> - `8ab6ebb`: A9 (Undo Last Change gated behind the Modal — `showModal()` with
>   "reverts the most recent git commit" confirmation; green "Undid last change."
>   success toast; button demoted to muted gray `text-xs text-gray-500`).
> - `63c8ac1`: A7 (Project promoted to header — `<label>Project</label><select>` peer
>   of Profile; `<details>` repurposed to "Manage projects" with SVG chevron disclosure
>   affordance, `aria-expanded` native to `<details>`).
>
> **UX/accessibility patterns established** (baseline for future popup work):
> - **Destructive actions** → confirm Modal (`showModal()`) with what-will-happen text.
>   The Modal is focus-trapped, Esc-cancellable (`components/Modal.tsx`).
> - **Success** → `showSuccess(msg)` (green `role="status"` `aria-live="polite"`,
>   4 s auto-dismiss).
> - **Errors** → `setError(msg)` (red `role="alert"`, persisted until dismissed).
> - **Loading** → `min-h` skeleton + always-mounted `<pre>` to prevent CLS.
> - **Inputs** → `<label>` wrapping with visible text or `sr-only` span; never
>   placeholder-only.
> - **Icons** → inline Feather SVG, no emoji as structural icons (`aria-hidden`).
> - **Keys** → stable identifiers (item text), never array index.
> - **Focus** → `focus-visible:ring-2 ring-blue-400 outline-none` on all custom
>   controls; `cursor-pointer` on clickable non-links.
> - **Layout** → sibling controls in `<label className="flex items-center gap-1">`
>   groups; `ml-auto` for right-side header items.
>
> **How to pick this up in a new session:**
> - Branch: `phase-2` (checkout `phase-2` — the seven P2.5 commits are on it).
> - Verify gate: `npm run typecheck` clean + `npm test` in both `extension/` and
>   `middleware/` → 104 ext + 193 mw = 297 must be green before any commit.
> - Code: all P2.5 work is in `ai-ui-editor/extension/popup/App.tsx` +
>   `components/Modal.tsx` (one component).
> - Tests: `__tests__/popup.modal.test.ts` (85), `popup.profileSelection` (19),
>   `popup.requirements` (17), `apply` (10), `diff` (7), `projectRegistry` (30),
>   `sanitize` (13).
> - Next steps: see Phase 3 (API Bridge) in this file; or address the Phase 1.5
>   cleanup items (P1.5-1…P1.5-4) if they remain open.

### 🔴 Critical

- [x] **A1 — Announce errors to assistive tech.** The error banner (`App.tsx`:-22ish,
      the `<div className="… text-red-700 whitespace-pre-wrap">`) is visual-only.
      Add `role="alert"` (or `aria-live="polite"`). Skill: Quick Reference §1
      `aria-live-errors`; `ux` domain "Error Messages must be announced" (High).
- [x] **A2 — Replace native `confirm()` with an in-app modal.** `handleApply`
      (`confirm("Apply this change…")`) and `handleExport`
      (`confirm("Export this specification…")`) both use the browser dialog.
      Build a styled, Esc-to-cancel, focus-trapped confirmation modal in the popup
      consistent with the rest of the UI. Skill: §1 `escape-routes`, §8
      `confirmation-dialogs`, Common Rules "Modal/Sheet".
- [x] **A3 — Drop emoji structural icons; use inline SVG.** `📁 Files to Modify`,
      `✅ Test Scenarios`, `⚠️ Edge Cases` (the three spec-section header emojis)
      don't theme, render inconsistently, and can't be controlled by tokens.
      Replace with Lucide (`file-pen` / `circle-check` / `triangle-alert`) plus
      `aria-hidden`, or remove. Skill: §4 `no-emoji-icons`; Common Rules
      "No Emoji as Structural Icons".

### 🟡 High

- [x] **A4 — Visible labels, not placeholder-only.** The instruction `<textarea>`,
      the "Add project" path `<input>`, the manual-pick `<input>`, and the export
      `<input>` title rely on `placeholder`. Wrap each in a `<label>` with visible
      text (the `Title`/`Priority` fields already do — match them; for the textarea
      an `sr-only` label works). Skill: §8 `input-labels`; `ux` "Form Labels"
      (High).
- [x] **A5 — Separate the success channel from `error`.** Today `error` carries
      *both* failures (`App.tsx:131 setError("Export conflict…")`) and successes
      (`:131 setError("Exported as ${id}…")`), so a successful export renders in a
      red banner. Add a `success`/`toast` state (green, aria-live, auto-dismiss
      3–5s) and keep `error` for failures. Skill: §8 `success-feedback`,
      `toast-dismiss`, `toast-accessibility`; `ux` "Submit Feedback" / "Error
      Feedback" (High).
- [x] **A6 — Reserve a stable loading region (no layout jump).** When `loading`
      flips, a spinner block renders in/instead of content and the token-stream
      `<pre>` pops in/out → CLS. Give the loading area a `min-height`/skeleton so
      the panel doesn't shift as streaming starts. Skill: §3 `content-jumping`,
      §7 `loading-states`.

### 🟢 Medium / polish

- [x] **A7 — Promote Project to the header row (next to Profile), or add a
      disclosure affordance.** After P2-3, Profile is a header first-class
      control but the Project registry (which sets the write root) is still buried
      in `<details>` with no chevron or `aria-expanded`. Skill: §9
      `destructive-nav-separation` is N/A, but the consistency/`nav-hierarchy`
      argument applies. (Lower priority: this is partly a product call.)
- [x] **A8 — Stable list keys (not array index).** `key={i}` on the
      architecture-hints / test-scenarios / edge-cases lists. Use the item text
      or a generated id. Skill: `react` stack "Use stable IDs as keys; Don't:
      array index as key for dynamic lists".
- [x] **A9 — Rethink the destructive-action confirm weighting.** Apply and Export
      both `confirm()`, but `Undo Last Change` (reverts a git commit) is one unguarded
      click. Either confirm undo, or keep it clickable but show a brief
      "Undid: …" success feedback and make it visually subordinate. Skill: §8
      `confirmation-dialogs`, `destructive-emphasis`; §9 `destructive-nav-separation`.
- [x] **A10 — `cursor-pointer` + visible focus-visible rings on custom buttons
      and the profile/project selects.** Tailwind preflight can suppress UA focus
      rings; add a `focus-visible:ring` utility. Skill: §1 `focus-states`, §2
      `cursor-pointer`.

**Out of scope for this pass** (skill flagged but not worth touching now):
- The skill's App-UI/Common-Rules (touch 44pt, safe areas, haptics) — this is a
  desktop Chrome extension, not iOS/Android; rules are §2-`touch-target-size`-style
  mobile guidance and don't apply to a pointer-driven 384px popup.
- A repo-wide design-system (`--persist` MASTER.md) — the popup is one screen; a
  full design-system is Phase-4-shaped work, not a polish item.

---

## Phase 3: API Bridge (live handoff)

> **Reframed 2026-07-11** (from the Phase 3 design discussion): the original Phase 3
> wording was **tightly coupled to one "target project"** — the old P3-1 literally said
> "add `POST /api/ideas/upsert` *in the target project*." That violates the core guardrail:
> wysiwyg is a **multi-project tool** and the built-in `example` profile is a demo, **not
> the purpose** (see the `antikythera-is-example` memory). Phase 3 must not bake in any one
> target's API. The design below is **decoupled**: wysiwyg knows nothing about a specific
> target — the registered project's **profile** carries a declarative intake *adapter
> descriptor*, and wysiwyg's `PipelineClient` is a generic HTTP caller configured entirely
> from that descriptor. This mirrors how P1-0 already decoupled `projectRoot` (a
> registered-per-profile value rather than a hardcoded `window.location.origin`): the
> file-based `intakeFile`/`intakeLineFormat` fields describe file intake; the new `intakeApi`
> field is their HTTP analogue.

**Goal**: A single Export button that delivers the spec either as a file write (Phase 1,
when no API adapter is configured) **or** as a live HTTP POST to the active project's own
intake API (Phase 3, when `intakeApi` is present on the resolved profile). Which path runs is
**decided by the profile, at call time** — the popup, the button, and the request payload
stay identical. read / board / sync (the former P3-3/P3-4) become **additive** behind a
second optional descriptor, sequenced after submit.

**Design decisions (locked from the 2026-07-11 design discussion):**
- **Declarative adapter (Option A), not per-project code adapters.** The profile carries a
  flat `{ targetField: "{wysiwygField}" }` body mapping + endpoint path + auth-name. No
  project-specific code ships inside wysiwyg. Code-adapter plugins (custom signing,
  retries, multi-step intake) are **explicitly deferred** to a later "custom adapter"
  escape hatch — a Phase 3+ signal, not a Phase 3 blocker.
- **Auth is named, never embedded.** The profile stores `"auth": "bearerKey"` (a *name*);
  the actual secret lives in the **registry** alongside the registered project entry
  (`chrome.storage.local`, keyed `wysiwyg:project-secrets:<projectId>`) — **never** in the
  profile JSON on disk (committed secrets = bad). `validateProfileEntry()` (P2-1) is
  extended to **reject** a raw `apiKey`/`token` string field should one ever appear in a
  profile.
- **`PipelineClient` SSRF/auth rules.** Reject any `baseUrl` whose scheme isn't `http` or
  `https` (no `file:`/`data:`/`ftp:`). **localhost / 127.0.0.1 / 0.0.0.0 are allowed** —
  the target typically runs on the user's own machine; forbidding loopback would break the
  realistic case. An optional `allowedHosts` list may restrict later but is **not required**
  for Phase 3 (permissive-by-default is consistent with P1-0, which already trusts the
  registered disk path). The auth key is injected as a header at call time and is
  **redacted from any thrown error, request log, and commit message**. The trust boundary
  is: *the user registered this project themselves* — the same trust extended to the
  registered disk path for file writes.
- **Shared types already carry the payload.** `RequirementsExportResponse` /
  `AppendIdeasRequest` already expose `spec, architectureHints, testScenarios, edgeCases,
  title, priority` (mirrored in both `shared/types.ts`). Phase 3 reuses these as the
  `bodyTemplate`'s available `{wysiwygField}` tokens — no new request/response type for the
  upsert *fields* themselves (only a new `UpsertResponse` for the target's reply).

### P3-1: Intake adapter descriptor on the profile ✅ shipped (2026-07-11)
- [x] Extend `ProjectProfile` (`config/project-profiles.ts` + the P2-1 schema) with an
      **optional** `intakeApi` field — present ⇒ Phase 3 HTTP handoff; absent ⇒ Phase 1
      file handoff (`appendRequirements`, unchanged). Keep `intakeFile`/`intakeLineFormat`
      as the unchanged file-handoff path.
- [x] `intakeApi` shape:
      ```ts
      interface IntakeApi {
        baseUrl: string;            // http(s):// only (PipelineClient rejects other schemes)
        upsertPath: string;         // e.g. "/api/ideas"
        method: 'POST';             // POST only for Phase 3
        auth: string;               // NAMES a key stored in the registry, never a raw secret
        bodyTemplate: Record<string, string>;  // { targetField: "{wysiwygField}" }
      }
      ```
- [x] Extend `validateProfileEntry()` (P2-1) to validate `intakeApi` when present (scheme
      check, required `upsertPath`/`auth`/`bodyTemplate`) and to **reject** any raw
      `apiKey`/`api_key`/`token`/`secret` string field. Pure (no fs); covered by a
      profile-schema guard test (`ProjectProfiles.test.ts` +17).
- [x] Add an `intakeApi` block to the `example.json` built-in profile (pointing at the demo
      target's intake endpoint `http://localhost:8006/api/ideas` with placeholder auth-name
      `exampleIntakeKey`) so the built-in demo shows the Phase 3 shape just as it already
      shows the file-intake shape. `generic.json` stays without `intakeApi` (file-handoff
      fallback remains the default for unknown projects). In-code `PROFILES.example` and
      on-disk `example.json` kept in lockstep (pinned by the shipped-JSON test).
- [x] Test: `ProfileManager.test.ts` (+6) asserts `resolve()` surfaces `intakeApi` when
      present (built-in `example` + JSON-loaded profile + registered-override layering) and
      omits it when absent (`generic`); `cloneProfile` deep-clones `intakeApi.bodyTemplate`
      so caller mutation can't poison `PROFILES` or the JSON cache. `ProjectProfiles.test.ts`
      (+17) covers each malformed `intakeApi` subfield rejection + the raw-secret backstop
      (`apiKey`/`api_key`/`token`/`secret`) + the shipped-JSON lockstep for `intakeApi`.
      193 → 216 mw tests (104 ext unchanged → **320 total**). `tsc --noEmit` clean both pkgs.

### P3-2: `PipelineClient` service (the generic caller)
- [ ] Add `middleware/src/services/PipelineClient.ts` following the one-service-per-file
      pattern already used by `GitManager`/`PathSanitizer`/`ProfileManager`.
- [ ] Single method: `submitIdea(profile, idea, secret)` — builds the request body from
      `bodyTemplate` (substituting `{wysiwygField}` tokens from `idea`), injects the named
      auth value as an `Authorization: Bearer …` header, and POSTs to
      `baseUrl + upsertPath`. Returns the target's reply (best-effort `{ id, url, status }`).
- [ ] **SSRF/auth rules from the design are enforced here, not at the route:** reject
      non-http(s) `baseUrl`; allow `http(s)://(localhost|127.0.0.1|0.0.0.0)`; redact the auth
      value from any thrown `Error` / request log before surfacing. No auth value is ever
      written to a git commit message or a stored log line.
- [ ] **Pure + injectable:** no hardcoded target URLs, no project-specific branches.
      Constructable with a fetch adapter (mirror the `projectRegistry.ts` dependency-injection
      pattern) so `PipelineClient.test.ts` runs against an in-memory `fetch` stub — no live
      network in unit tests.
- [ ] Test: `PipelineClient.test.ts` — body mapping, scheme rejection, localhost allowed,
      secret redaction in errors, 4xx/5xx surfacing (without leaking the key), and the
      no-`intakeApi` branch returning a sentinel so the route falls back to file handoff.

### P3-3: Upsert route + popup wiring (file-vs-API decided by the profile)
- [ ] Add `POST /api/pipeline/upsert` in a new `middleware/src/routes/pipeline.ts`
      (registered at `/api/pipeline` in `server.ts`, peer of `/api/ai`/`/api/files`/`/api/git`).
      Resolves the profile via `ProfileManager.resolve()`; if the profile has `intakeApi`,
      looks up the named secret in the registry and calls `PipelineClient.submitIdea()`;
      if not, **delegates to the existing `appendRequirements`** file path (Phase 1) — so one
      endpoint, one button, profile-decided transport.
- [ ] **Path safety unchanged for the file branch** (still routes through `PathSanitizer` +
      `GitManager` per Conventions). The API branch performs **no** file/git write.
- [ ] Type-mirror note: the request type is the existing `AppendIdeasRequest` (already
      carries the same fields); the upsert *response* (`UpsertResponse`) is new and goes in
      **both** `shared/types.ts` in lockstep (Conventions' mirror rule).
- [ ] Popup: `handleExport` is retargeted from `/api/files/append-ideas` to
      `/api/pipeline/upsert`. The success banner already in place (P2.5 A5) shows whichever
      confirmation the route returns (file-based "Exported as {id}" *or* API-based "Sent to
      {project} as {remoteId}"). No new popup surface for submit.
- [ ] Test: `pipeline.test.ts` — file-fallback when `intakeApi` absent; HTTP POST when
      present; auth-key lookup from the registry; secret never in the recorded request or
      error. `api.test.ts` gains +1 route-registration assertion.

### P3-4: Status descriptor + pipeline panel (additive, optional) — sequenced after P3-1/P3-2/P3-3
> Under a **declarative** adapter, a read contract ("fetch the board", "poll status") is a
> meaningfully richer thing than a single upsert POST. Forcing it into the same flat
> `intakeApi` descriptor would over-scope Phase 3. Instead it is a **second optional
> descriptor** a project *may* provide — so a profile can be submit-only (`intakeApi`) or
> full-board (`intakeApi` + `statusApi`). The panel renders only when `statusApi` exists.
> **P3-4 ships only after P3-1/P3-2/P3-3 land and stand alone.**
- [ ] Extend the profile schema with an **optional** `statusApi` descriptor
      (a `{ boardPath, itemPath, statusField, pollMs }` analogue to `intakeApi`) validated
      by `validateProfileEntry()` when present.
- [ ] Add `PipelineClient.listBoard()` / `.getItemStatus()` (read side of the same service).
- [ ] Add `GET /api/pipeline/board` (in `pipeline.ts`) that proxies the board fetch through
      `PipelineClient`; never exposes the target's auth to the extension directly.
- [ ] New panel in the extension that shows the active project's board **only when
      `statusApi` is present on its profile**; click item → full spec + artifacts. (The
      DevTools panel already had a list/detail/search UI shape from P1.5-2 — candidate
      surface; the popup's 384px width is too narrow for a board — confirm the UI surface
      during P3-4 planning.)
- [ ] **Polling, not realtime-sync** (the Out-of-Scope list keeps "real-time sync" deferred).
      `pollMs` from the descriptor drives a periodic `GET /api/pipeline/board/...` refresh
      and updates the panel: "In Progress → Review → Complete".
- [ ] Test: `statusApi.test.ts` — board fetch + redaction; panel shows/hides on `statusApi`
      presence; polling cadence respects `pollMs`.

### Phase 3 build order
P3-1 (descriptor) → P3-2 (`PipelineClient` + SSRF/auth rules) → P3-3 (route + popup, with
file fallback) lands as a **standalone, testable submit capability**. P3-4 (status/board)
is **additive** and only starts once P3-3 is green. A project with `intakeApi` only is a
valid Phase 3 endpoint; `statusApi` is a power-up, not a requirement.

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

- [ ] wysiwyg directly modifying a registered project's pipeline state (bypasses that
      project's own loop). Phase 3 only mutates intake **via that project's own API**, and
      then only through the **per-profile `intakeApi` descriptor** — never by wysiwyg
      writing the target's internal state files itself. See Phase 3 above.
- [ ] Running a registered project's tests from wysiwyg.
- [ ] Real-time sync between wysiwyg and a registered project's UIs. (Phase 3's P3-4 uses
      **polling** via an optional `statusApi` descriptor; push-based realtime stays deferred.)
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

Phase 2 (richer profile system on top of the P1-0 registry) is **complete** — see above.

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

- **DevTools panel wiring** — ✅ **shipped** `b0d3196` (P1.5-2, 2026-07-10). Added
  `edit-applied`/`edit-undone`/`undo-specific` to `ExtensionMessage` union (both mirrored
  `shared/types.ts`); popup broadcasts `edit-applied` after successful write (distinguished
  from undo by `commitHash`); `undo-specific` handler in background.ts routes to
  `/api/git/undo`; DevToolsPanel.tsx needed no changes — already handled the messages
  correctly. Also fixed silent write-success fallthrough bug.
- **Export-mode streaming** — Edit mode streams via `/api/ai/edit/stream`; Export yields a
  single spec, so streaming adds little value. *Deferred, not pursued.*

#### P1-8: Testing stretch goals — mostly covered, one gap

| P1-8 checklist item | Status |
|----------------------------------|--------|
| Unit tests for `getRequirementsPrompt()` incl. priority + title | ✅ `PromptTemplates.requirements.test.ts` (12). |
| Integration tests for `/api/files/append-ideas` (idempotency, ID generation, path-safety traversal, GitManager commit) | ✅ `appendIdeas.test.ts` (15). |
| Integration tests for the project registry (P1-0) | ✅ `probeRoot.test.ts` (13) + `registryPlumbing.test.ts` (9) + ext `projectRegistry.test.ts` (30). |
| E2E: register project → right-click → export → verify `ideas.md` line + `requirements/ID/spec.md` created | ⏸️ **Not done.** No E2E harness exists; would require a running browser + a temp git project. Deferred until an E2E layer is added. |

### Test results (re-verified 2026-07-10)

> All green. **216 middleware + 104 extension = 320 tests passing.** Both packages
> `tsc --noEmit` clean. Extension `npm run build` succeeds (popup + both workers).
> (`docSync.test.ts` asserts the consolidated doc set rather than the pre-consolidation
> file list; its count is included in the middleware total.)
>
> *(The pre-P2-4 table had drifted — `ProfileManager.test.ts` and
> `ProjectProfiles.test.ts` row counts were off; corrected here against the live
> `vitest` reporter. P2-4 added `PromptTemplates.requirements.test.ts` +5 and
> `appendIdeas.test.ts` +8.)*

| Project | File | Tests | Status |
|---------|------|-------|--------|
| Middleware | `api.test.ts` *(P2-3: +1 profiles endpoint)* | 4 | ✅ |
| Middleware | `appendIdeas.test.ts` *(P1-6 + P2-4 supplement)* | 23 | ✅ |
| Middleware | `OpencodeClient.models.test.ts` *(P1-7)* | 9 | ✅ |
| Middleware | `OpencodeClient.normalizePriority.test.ts` *(P1-6)* | 6 | ✅ |
| Middleware | `OpencodeClient.streaming.test.ts` | 3 | ✅ |
| Middleware | `OpencodeClient.test.ts` | 8 | ✅ |
| Middleware | `ProfileManager.test.ts` *(P2-2 + P3-1 +6)* | 25 | ✅ |
| Middleware | `probeRoot.test.ts` *(P1-0)* | 13 | ✅ |
| Middleware | `ProjectProfiles.test.ts` *(P3-1 +17)* | 49 | ✅ |
| Middleware | `PromptTemplates.requirements.test.ts` *(P2-4 +5)* | 17 | ✅ |
| Middleware | `registryPlumbing.test.ts` *(P1-0)* | 9 | ✅ |
| Middleware | `ResponseParser.test.ts` | 21 | ✅ |
| Middleware | `SourcemapResolver.test.ts` | 7 | ✅ |
| Middleware | `docSync.test.ts` *(doc-consistency guard)* | 18 | ✅ |
| Middleware | `typesMirror.test.ts` *(P1-7 lockstep guard)* | 4 | ✅ |
| **Middleware Total** | | **216** | ✅ |
| Extension | `apply.test.ts` | 10 | ✅ |
| Extension | `diff.test.ts` | 7 | ✅ |
| Extension | `popup.profileSelection.test.ts` *(P2-3)* | 19 | ✅ |
| Extension | `popup.requirements.test.ts` | 17 | ✅ |
| Extension | `projectRegistry.test.ts` *(P1-0)* | 30 | ✅ |
| Extension | `sanitize.test.ts` | 13 | ✅ |
| **Extension Total** | | **104** | ✅ |
| **Grand Total** | | **320** | ✅ |

### How this audit changed

- **2026-07-04 (original):** identified 2 🔴 blockers (P1-0, P1-6) + 4 🟡 drift/minor items; 129 tests.
- **2026-07-05 (rewrite #1):** P1-0 + P1-6 shipped (+83 tests → 206); all 4 drift/minor items resolved with guard tests; `validateConfig()` wired into `server.ts` boot. **0 open code blockers.** Remaining gap: doc-sync (P1-7).
- **2026-07-05 (rewrite #2):** P1-7 doc-sync completed — all narrative docs reconciled to "shipped"; 6 stale-snapshot/legacy files deleted; dangling references cleaned; doc-consistency guard test added (+15 tests → 221). **0 open gaps in Phase 1.**
- **2026-07-05 (consolidation — this pass):** folded the remaining overlapping docs
  (`PROJECT_DETAILS.md`, `GAP_AUDIT.md`, `MVP_REQUIREMENTS.md`) into `PROJECT_BRIEF.md` /
  this `TODO.md` appendix set; renamed `VISION_REQUIREMENTS.md` → `VISION.md`; rewrote the
  `docSync.test.ts` assertions to pin the consolidated set (16 assertions). Test count
  unchanged at 221. Next milestone: Phase 2 + deferred enhancements.
- **2026-07-10 (P2-1/P2-2):** Profile Schema + Profile Loader shipped. `ProjectProfile`
  extended with P2-1 fields; `validateProfileEntry()` validates on-disk JSON profiles;
  `config/profiles/example.json` + `generic.json` on disk. `ProfileManager` service
  (262 lines) composes in-code built-ins + JSON profiles + P1-0 registry overrides;
  routes `ai.ts` and `files.ts` wired to `ProfileManager.resolve()`. `RegisteredProjectRef`
  type mirrored. `ProfileManager.test.ts` (+35 tests → 256). **P2-1/P2-2 complete.**
  Next: P2-3 (profile dropdown UI) + P2-4 (artifact template injection).
- **2026-07-10 (P2-3):** Profile Selection UI shipped (`e79432c`). Profile dropdown moved
  from hidden `<details>` to header bar (first-class control, visible at all times). Label
  "Profile" (was "Profile template"); title shows profile name in Export mode. Race condition
  fixed: `profilePrefs` restores in `useEffect` keyed on `[currentOrigin]` with one-shot
  `profilePrefsLoadedRef` — no more reading storage before async `get-current-element` sets
  the origin. `popup.profileSelection.test.ts` (+19 tests) + `api.test.ts` (+1 profiles
  endpoint test) → **276 tests**. **P2-3 complete.** Next: P2-4 (artifact template injection).
- **2026-07-10 (P2-4):** Output Customization shipped. The spec section set is now
  profile-driven end-to-end: `PromptTemplates.specSectionsFor(profile)` (single source of
  truth) reads the profile's `artifactTemplates` `spec.md` entry and falls back to the
  legacy four (`Overview`/`Requirements`/`Edge Cases`/`Acceptance Criteria`) when absent.
  `getRequirementsPrompt` uses it for both the `spec` JSON example + the `**spec**`
  guideline (hardcoded four removed). `files.ts.supplementSpecSections(spec, profile)` is
  wired into `appendRequirements`: any expected section the AI omitted is appended as
  `## <Section>\n\n_TBD.` so the written `spec.md` always matches the profile's structure
  while AI content is kept verbatim — heading-based presence detection (case-insensitive,
  tolerant of trailing `:`/parenthetical/numbering). Part 1 (per-profile output paths)
  was already wired; verified, not extended (secondary-artifact writing deferred).
  Tests: `PromptTemplates.requirements.test.ts` (+5 → 17) + `appendIdeas.test.ts` (+8 → 23,
  incl. a scaffolded-spec integration case against the example profile). Drifted pre-P2-4
  row counts (`ProfileManager` 35→19, `ProjectProfiles` 19→32) corrected against the live
  reporter. → **193 middleware + 104 extension = 297 tests**. **P2-4 + P2.5 complete → Phase 2
  done.** DevTools panel wired (P1.5-2, `b0d3196`). Next: Phase 3 (API Bridge) or the deferred E2E harness (P1.5-3).
- **2026-07-11 (P3-1):** Intake adapter descriptor shipped. `ProjectProfile` gains the
  optional `IntakeApi` block (`baseUrl`/`upsertPath`/`method: POST`/`auth` (a NAME)/
  `bodyTemplate` flat map); `validateProfileEntry()` validates it when present (http(s)
  scheme, leading-slash `upsertPath`, non-empty `auth`, string-valued `bodyTemplate`) and
  **rejects** raw `apiKey`/`api_key`/`token`/`secret` fields at the load boundary (committed
  profiles name the secret via `intakeApi.auth`; the real key lives in the registry). The
  `example` built-in profile (in-code + on-disk `example.json`, kept in lockstep) ships an
  `intakeApi` demo (`http://localhost:8006/api/ideas`, auth `exampleIntakeKey`); `generic`
  stays without it (file-handoff default). `ProfileManager.cloneProfile` deep-clones
  `intakeApi` + its nested `bodyTemplate`. Tests: `ProjectProfiles.test.ts` (+17 → 49) +
  `ProfileManager.test.ts` (+6 → 25). → **216 middleware + 104 extension = 320 tests**.
  `tsc --noEmit` clean both pkgs. **P3-1 complete.** Next: P3-2 (`PipelineClient` +
  SSRF/auth rules) → P3-3 (route + popup, file fallback) → P3-4 (additive `statusApi`).

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
