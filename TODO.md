# wysiwyg TODO

**Created**: 2026-07-04
**Last revised**: 2026-07-04 (framing rewrite — see "What changed in this revision")

---

## What wysiwyg is

wysiwyg is an **AI-driven prompt generator that has access to the running UI.**

The problem it solves: once an app is built by AI, the hardest part of iterating is
**knowing what prompt to give the AI next**. wysiwyg gives the AI access to the actual
UI (DOM, computed styles, hierarchy, resolved source) and, with per-project context,
turns a vague user intent into a high-quality instruction.

Two output *shapes* of that same prompt-generation capability:
- **Edit mode** — generate a code diff and apply it to the running project (already
  implemented for CSS/visual edits; see `ai-ui-editor/POSTMVP_TODO.md` for the MVP baseline).
- **Export mode** — generate a structured spec/TODO and write it back into *that
  project's own* backlog conventions, so a downstream AI agent (or human) can act on it.

**Multi-project is core, not a Phase-2 add-on.** wysiwyg works across multiple projects.
The user tells wysiwyg **which project** they're in by typing that project's **on-disk
path**; wysiwyg learns its structure/conventions and persists the registry. **One
registered project per session, used by both modes.**

> **antikythera is project #1** — the concrete example profile we built first. It is
> *not* the purpose of wysiwyg; it's the first instance of the general capability.
> Anything below that says "antikythera" means "the example project/profile" and should
> generalise to any user-registered project.

---

## What changed in this revision

- **Framing**: rewritten from "wire wysiwyg to antikythera" to "AI-driven prompt
  generator with UI access; multi-project via user-registered disk paths." antikythera
  demoted from purpose → example project.
- **New task P1-0 (Project Registration)**: captures the genuinely missing capability —
  user types a disk path, wysiwyg inspects it, persists a project registry, and that
  registered path becomes the authoritative `projectRoot` for both edit *and* export.
  Today `projectRoot` is `window.location.origin` (a URL), which is wrong for any file op.
  **P1-0 is a prerequisite for P1-6's path safety** (and arguably for the existing
  edit flow to work against a real repo).
- **P1-6 enriched** with the antikythera profile's `ideas.md` intake format (defined in
  `middleware/src/config/project-profiles.ts`), request/response schema, ID rule, and the
  `PathSanitizer` + `GitManager` reuse requirement. Priority becomes AI-suggested +
  user-overridable (reopens P1-3/P1-4/P1-5 slightly). Destination root = the user-registered
  disk path, **not** the dev-server `projectRoot`.
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
- **ID format** (antikythera profile, verified): `ID-XXX` where `XXX` is **3-digit
  zero-padded, uppercase** (`ID-001`, `ID-002`). Above 999, use 4 digits (`ID-1000`).
  Next available ID = scan `ideas.md` + `requirements/` for the max numeric ID, +1.

---

## Phase 1: Requirements Bridge (MVP)

**Goal**: wysiwyg captures UI context + user intent → understands the target project →
generates a structured spec → writes a TODO item back into that project's own backlog.

### Foundation (done — removed from active list; see git history)

- ✅ P1-1 Project profiles (definitions + URL detection) — `middleware/src/config/project-profiles.ts`, 19 tests.
- ✅ P1-2 Extension context menu (second item, mode handling) — `background.ts` + `shared/types.ts` + popup.
- ✅ P1-3 Export endpoint `POST /api/ai/export-requirements` — `routes/ai.ts` + `OpencodeClient.generateRequirementsExport`, 10 tests.
- ✅ P1-4 Requirements prompt template — `PromptTemplates.getRequirementsPrompt` (folded into P1-3).
- ✅ P1-5 Popup export UI — spec preview, editable textarea, hints/scenarios/edge-cases sections, export button, 17 tests.

### P1-0: Project Registry (user-typed disk path) 🔴 NEW — prerequisite for P1-6

**Why**: wysiwyg must "store/know/work with the path for multiple projects." Today the
only "project root" is `window.location.origin` (a URL), so file/git operations can't
target a real repo. The user must be able to register a project by its on-disk path, and
that path becomes the authoritative `projectRoot` for both edit and export modes.

**Blocked by**: nothing. **Blocks**: P1-6 (path safety), and the existing edit flow's
ability to operate against a real repo (currently only works via the
`DEFAULT_PROJECT_ROOT` fallback in `routes/files.ts`).

**Design**:
- [ ] **Popup: "Add project" affordance.** User types an absolute on-disk path
      (e.g. `/Users/.../my-project`). Pre-fill with the detected profile's suggested
      root when available; editable. Validate the path looks like a project root
      (has `package.json`, `pyproject.toml`, or a recognizable marker) before accepting.
- [ ] **Inspect on register.** Reuse `detectProfile(url)` + a lightweight on-disk scan
      (read `package.json`/`pyproject.toml`, list top-level dirs) to extend/build a
      `ProjectProfile` for that path. If the URL matches an existing profile
      (`antikythera`), use it; otherwise fall back to `generic` and let the user override.
- [ ] **Persist the registry** in `chrome.storage.local` (manifest already has the
      `storage` permission). Key by page origin/project id; store `{ path, profileName,
      displayName, registeredAt }`. Support **multiple** projects.
- [ ] **Select active project per session.** When the popup opens on a given URL,
      look up the registered project for that origin (or prompt "which project?").
      The selected project's `path` becomes `projectRoot` everywhere the popup currently
      uses `elementContext.context.projectRoot`.
- [ ] **Plumb the real path through the middleware.** Replace
      `projectRoot = window.location.origin` in `content-script.ts` with the registered
      on-disk path (sent via the capture message from the popup/background, since the
      content script can't read chrome.storage synchronously — background passes it down).
- [ ] **Tests**: unit tests for the registry (add/list/select/persist), and a test that
      the registered path — not `window.location.origin` — reaches `/api/files/write`.

**Open question to resolve during design**: does the user pick the active project once
globally (one active project at a time across all tabs) or per-origin (each localhost
port maps to its own registered project)? Default: **per-origin**, override globally.

### P1-6: File Export (write spec into the active project's backlog)

**Blocked by**: P1-0 (needs the registered on-disk path as the write root).

**What it does**: takes the AI-generated spec (from `/api/ai/export-requirements`) plus
a priority, and appends a TODO line + writes a `spec.md` into the active project per its
profile's conventions. For the `antikythera` profile that means:

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

**Done when**:
- [ ] `POST /api/files/append-ideas` implemented with schema above, PathSanitizer + GitManager.
- [ ] ID generation correct against the real antikythera repo (verified: next ID after
      `ID-999` → `ID-1000`; respects 3-digit zero-padding).
- [ ] Priority + title flow from export response → popup override → endpoint.
- [ ] Types mirrored in both `shared/types.ts` files.
- [ ] Undo (`POST /api/git/undo`) reverts the export commit cleanly.

### P1-7: Documentation
- [ ] Keep `ai-ui-editor/README.md` as the setup + API source of truth — ensure it
      documents export mode + project registration (P1-0) once those land.
- [ ] Keep root `README.md` as framing + index (links README + this TODO + vision).
- [ ] Update `ai-ui-editor/PROJECT_PROFILE.md` to reflect user-registered paths (P1-0).
- [ ] Keep `ai-ui-editor/PROJECT_STATUS.md` in sync as P1-0/P1-6 land.

### P1-8: Testing
- [ ] Unit tests for `getRequirementsPrompt()` (already 10 — extend to cover priority + title).
- [ ] Integration tests for `/api/files/append-ideas` (idempotency, ID generation, path safety rejects traversal, GitManager commit).
- [ ] Integration tests for the project registry (P1-0).
- [ ] E2E: register project → right-click → export → verify ideas.md line + requirements/ID/spec.md created.

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
      antikythera's Overview/Requirements/Scope/Edge Cases/Constraints/PII-Secret Handling).

---

## Phase 3: API Bridge (Full Integration)

**Goal**: Direct, live handoff from wysiwyg to a target project's pipeline (antikythera
being the first). This is where coupling to the target project's *internal* API begins —
Phase 1 deliberately avoids it (file handoff only).

### P3-1: Antikythera API Endpoint
- [ ] Add `POST /api/ideas/upsert` **in antikythera** (uses its `StateManager` API;
      **never** write `pipeline-state.json` directly — per `antikythera/AI.md`).
- [ ] Accepts: `{ spec, architectureHints, testScenarios, title, priority }`.
- [ ] Creates a new item in the pipeline at stage=INTAKE/REVIEW_SPEC.

### P3-2: wysiwyg → antikythera HTTP Client
- [ ] Add `antikytheraClient` in `middleware/src/services/` (or a generic `pipelineClient`).
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
| ideas.md format drifts | Validate against the target project's actual ideas.md format (verified for antikythera in P1-6) |
| User bypasses review | Make review mandatory; no auto-export |
| Path traversal via projectRoot | Route every write through `PathSanitizer.safeFilePath` (Conventions) |

---

## Related Files

| File | Purpose |
|------|---------|
| `ai-ui-editor/extension/content-script.ts` | Context menu, DOM capture, **`projectRoot` placeholder to fix in P1-0** |
| `ai-ui-editor/extension/popup/App.tsx` | Popup UI; `handleExport` already targets `/api/files/append-ideas` (P1-6 endpoint) |
| `ai-ui-editor/extension/background.ts` | Service worker, messaging relay; will carry registered projectRoot to content script (P1-0) |
| `ai-ui-editor/middleware/src/routes/ai.ts` | AI endpoints incl. `/export-requirements` |
| `ai-ui-editor/middleware/src/routes/files.ts` | File routes; P1-6 adds `/append-ideas` here |
| `ai-ui-editor/middleware/src/ai/PromptTemplates.ts` | Prompt generation; P1-6 adds priority + title |
| `ai-ui-editor/middleware/src/config/project-profiles.ts` | Profile defs + URL detection; P1-0 extends with registered paths |
| `ai-ui-editor/middleware/src/services/PathSanitizer.ts` | Path-traversal guard; P1-6 must use it |
| `ai-ui-editor/middleware/src/services/GitManager.ts` | Git write/undo; P1-6 must use it |
| `ai-ui-editor/shared/types.ts` ↔ `ai-ui-editor/middleware/src/shared/types.ts` | **Mirrored — keep in sync** (Conventions) |

---

*Last Updated: 2026-07-04*
