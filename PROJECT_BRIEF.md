# wysiwyg — Project Brief

> **This is the single, self-contained description of what wysiwyg is, why it exists,
> how it works, what's built, what's next, the current code-vs-roadmap status, the
> scope lines we hold, and the known doc-contradictions an AI must not propagate.**
> Read this first in any new session. It is the durable "pitch" *and* the consolidated
> authoritative narrative — it absorbed the framing that previously lived separately in
> `README.md` (shared understanding, doc-map, contradictions) and `GAP_AUDIT.md` (live
> status + pending + endpoints).
>
> For the live roadmap + the folded audit/MVP appendices see
> [`TODO.md`](TODO.md); for setup + API reference see
> [`ai-ui-editor/README.md`](ai-ui-editor/README.md); for the v2.0 north star see
> [`VISION.md`](VISION.md).
>
> *Last updated: 2026-07-05. If this file and another doc disagree, this file +
> `TODO.md` are the authoritative pair; the other doc is stale.*

---

## 1. One-sentence pitch

**wysiwyg is an AI-driven prompt generator that has access to the running UI.** You
right-click the element you're looking at, say "make this better," and get a high-quality,
well-targeted instruction for an AI — instead of spending ten minutes figuring out what
prompt to type.

---

## 2. The problem

Once an app is built by AI, iterating is harder than building. The bottleneck isn't the
AI's *ability* — it's **knowing what to ask it to do next**. To get an AI to fix a UI
element, you have to know which file it lives in, describe the element precisely, explain
the project's conventions, and frame the intent. That's a prompt-engineering tax on every
edit. **wysiwyg kills that tax** by giving the AI direct access to the element (DOM,
computed styles, hierarchy, resolved source) and the project's conventions, so a vague
intent becomes a precise instruction.

---

## 3. The product, precisely

A **Chrome extension + a local middleware server** (Fastify, `localhost:3000`). Two
output modes — **both are the same capability** ("capture UI context + project
conventions, turn vague intent into a precise instruction"), with two delivery surfaces:

### Edit mode — "fix it now"
- Right-click → natural-language instruction → AI generates a **code diff** → review → apply.
- Currently scoped to **CSS/visual edits, single-file** — a deliberate scope choice, not
  an oversight. Validate-before-write (lint + typecheck) → git auto-commit → one-click undo.
- You never get a half-applied broken change.

### Export mode — "write it down for later"
- Right-click → describe what *should* change → AI generates a **structured spec**
  (overview, functional/non-functional requirements, files to modify, test scenarios, edge
  cases, acceptance criteria).
- The spec is written back **into the target project's own backlog conventions** (e.g.
  append a line to `ideas.md` + create `requirements/ID-XXX/spec.md`).
- It feeds a **downstream AI agent or human** that already knows how to process that
  backlog. wysiwyg hands off; it does not apply the change itself.

### The three north-star use cases (the original intent)
1. **UI critique & iteration** — right-click a card/component → "this doesn't look good,
   suggest options" → multiple design options → pick one → applied.
2. **Add functionality (described as a spec)** — right-click a button → "this should call
   an API to get the result" → Export mode captures *what* should change, not the diff.
3. **Add new UI (described as a spec)** — right-click empty space → "add a button here
   that exports the view as PDF" → Export mode writes the spec for later.

> Use cases 2 and 3 are **Export-mode** in the built system: wysiwyg captures intent and
> writes a structured spec into the project's backlog, rather than generating functional
> code (which is **Edit-mode scope today: CSS/visual single-file only**). Functional /
> multi-file / new-component generation is deferred to the vision ([`VISION.md`](VISION.md)).

---

## 4. Multi-project is core — not a Phase 2 add-on

wysiwyg is a general-purpose, multi-project tool — not tied to any one target project.

- You tell wysiwyg which project you're in by **typing that project's on-disk path.**
- wysiwyg inspects it (`package.json`/`pyproject.toml`, directory scan), learns its
  structure/conventions, and **persists a registry entry** (`chrome.storage.local`).
- **One registered project per session**, used by *both* modes.
- That registered disk path is the **authoritative `projectRoot`** for every file/git op.
  (Shipped in P1-0, `e9d2b91` — the `window.location.origin` URL placeholder is gone. Routes
  fall back to `DEFAULT_PROJECT_ROOT` when no project is registered for the origin.)

The `example` profile is the first concrete profile shipped alongside `generic` — it demonstrates a real project configuration with backend/frontend directories, agents, and pipeline stages. It is **not** the purpose of wysiwyg; it's a template to show what a profile can describe.

Built-in profiles today (both real, in `middleware/src/config/project-profiles.ts`):
- **`example`** — React 19 + Vite + Tailwind + TypeScript; URLs `localhost:5173`/`:8006`;
  backend `api/`, frontend `src/`; intake `.wysiwyg/ideas.md`; artifacts `spec.md`/`architecture.md`/`tests.md`;
  agents `Architect`/`Tester`/`Executor`; pipeline `INTAKE → DISCOVERY → BLUEPRINT → IMPLEMENTATION → VERIFY → DONE`.
- **`generic`** — React + Vite; `localhost:*`; frontend `src/`; intake `TODO.md`; artifact `spec.md`.

A profile defines: tech stack, directory structure, artifact format, intake file, known
agent roles (for multi-agent target projects), and a `promptContext` string injected into
prompts. See [`ai-ui-editor/PROJECT_PROFILE.md`](ai-ui-editor/PROJECT_PROFILE.md).

---

## 5. Session flow & the non-obvious engineering details

```
App running on a dev server (e.g. localhost:5174)
  → right-click element → context menu → "Edit with AI" (or the Export item)
  → content script captures: outerHTML, getComputedStyle(), classNames, IDs,
    parent hierarchy → <body>, event listeners
  → middleware receives capture:
      • resolves DOM element → source file:line via REAL sourcemap parsing
        (Vite/Webpack .map files — genuinely works, not a stub)
      • detects framework + version from package.json
      • loads active project profile → injects promptContext
      • builds prompt, calls the AI
  → AI (NVIDIA NIM, real, OpenAI-compatible) returns structured JSON:
      options[] { description, diff, previewHtml, file, type } + followUpQuestions[]
      • Zod validation enforces the shape
      • retry w/ exponential backoff on 429/503/408
      • real token streaming (options render progressively)
      • previewHtml sanitized + sandboxed iframe (empty sandbox = most restrictive)
  → you see side-by-side diff + live preview per option
  → Apply (Edit): validate-before-write → git auto-commit → HMR
     OR Export (Export): spec written into that project's backlog
  → Undo (POST /api/git/undo) reverts the last commit in one click
```

The details that make this not-toy:
- **Sourcemap resolution is real** (commit `8dbb195`) — parses actual `.map` files, not heuristic grep.
- **DiffValidator** rewritten (P6, commit `dcdf47b`) to use the **TypeScript programmatic API + oxlint**, not a shell-out — proper error surfacing.
- **Path safety** (P4, commits `ab07b00`/`dcdf47b`): every write endpoint routes through `PathSanitizer.safeFilePath(projectRoot, file)` + `GitManager` — no raw `fs` to user-supplied paths.
- **XSS sanitization** (P9, commit `dd97dee`) — the preview iframe can't run AI-injected scripts.
- **Type mirror**: `extension/shared/types.ts` ↔ `middleware/src/shared/types.ts` are *manually mirrored* (extension can't import across the package boundary). Adding a type in one **must** add it to the other in the same change. It's drifted once; never again.

---

## 6. What's built vs. what's next

### ✅ Done and verified against code
- **MVP (MVP-01…19):** right-click menu, element capture, sourcemap resolution, NVIDIA NIM
  AI (`meta/llama-3.1-70b-instruct` default — **real, not mock**), validate-before-write,
  git auto-commit, one-click undo, HMR. (Acceptance criteria for each MVP-XX are preserved
  in the "MVP spec of record" appendix of [`TODO.md`](TODO.md).)
- **Post-MVP hardening (P1–P10):** apply-flow fix (P3), Zod/path validation + git/undo
  `projectRoot` fix (P4), DiffValidator TypeScript-API rewrite (P6), real sourcemaps (P7),
  real token streaming (P8), XSS sanitization (P9), docs sync (P10).
- **Requirements Bridge Phase 1, foundation (P1-1…P1-5):** project profiles + URL detection,
  the Export context-menu item, `POST /api/ai/export-requirements`, the requirements prompt
  template, and the Popup export UI.

### ✅ Requirements Bridge Phase 1 — shipped (incl. the two former blockers)
- **P1-0 — Project Registry (user-typed disk path)** — shipped `e9d2b91`. The user types an
  absolute on-disk path; wysiwyg validates a project marker on disk (`GET /api/files/probe-root`),
  persists the registry in `chrome.storage.local` keyed by origin (per-origin active project +
  global override), and that path is the authoritative `projectRoot` everywhere it used to
  `window.location.origin`. Plumbed popup → background → content script. Tested that the
  registered path — not the origin URL — reaches `/api/files/write`.
- **P1-6 — File Export (write spec into the active project's backlog)** — shipped `acb45ab`.
  `POST /api/files/append-ideas` appends the profile intake line (e.g. `ideas.md`
  `- [ID-XXX] {title} | Priority: {Priority}`) + creates `requirements/{ID-XXX}/spec.md`,
  per the active profile's conventions, via `PathSanitizer` + `GitManager` as one atomic git
  commit (undoable via `/api/git/undo`). ID format: `ID-001`…`ID-999`, then `ID-1000`
  (3-digit zero-padded, verified against the example profile). Priority + title:
  AI-suggested, user-overridable in popup.

### Confirmed HTTP endpoints (code, today)
`/api/ai/edit` · `/api/ai/edit/stream` · `/api/ai/export-requirements` · `/api/files/validate` ·
`/api/files/write` · `/api/files/read` · `/api/files/probe-root` (P1-0) ·
`/api/files/append-ideas` (P1-6) · `/api/git/undo` · (WS `/ws/connect`). All shipped.

---

## 7. Current code-vs-roadmap status

**Phase 1 (Requirements Bridge) is feature-complete and test-pinned** — **221 tests
passing** (144 middleware + 77 extension), both packages `tsc --noEmit` clean, the
extension builds. **There are 0 open code blockers.**

The follow-up fixes that prior audits flagged as drift/minor are all resolved with guard
tests, and a doc-consistency guard (`docSync.test.ts`) pins the consolidated doc set so
the narrative can't silently re-drift to describe shipped work as future:

- **Type-mirror drift** — both `shared/types.ts` reconciled to lockstep; `typesMirror.test.ts` (4) pins it.
- **Hardcoded project-label strings** — popup/background labels are dynamic (`${projectLabel}`, `${intakeLabel}`); no hardcoded project-specific strings in user-facing labels.
- **Model list proliferation** — consolidated into `AVAILABLE_MODELS` (single `readonly string[]` in `OpencodeClient.ts`); `validateConfig()` rejects an unknown `NVIDIA_MODEL` at boot (fail-fast); `OpencodeClient.models.test.ts` (9) keeps the `ai-ui-editor/README.md` table in lockstep.
- **Dual sanitization approaches** — `sanitizeFilePath` hardened to segment-wise traversal removal and documented as a *coherence heuristic*; `PathSanitizer.safeFilePath` remains the authoritative `path.resolve()`-based security boundary (defense in depth). `ResponseParser.test.ts` (+6) pins it.

### Explicitly deferred (non-blocking, not required for Phase 1)
- **DevTools panel wiring** — `extension/devtools/` has a full React panel that listens for
  `edit-applied` / `edit-undone` messages, but the popup doesn't broadcast them, so the
  panel never receives history. *Not blocking; consider wiring in Phase 2.*
- **Export-mode streaming** — Edit mode streams via `/api/ai/edit/stream`; Export yields a
  single spec, so streaming adds little value. *Deferred, not pursued.*
- **E2E test** — no E2E harness exists yet (would need a running browser + a temp git project). The unit/integration coverage for P1-0/P1-6 + the prompt/registry paths is complete.

**Next milestone: Phase 2** — a richer profile system on top of the P1-0 registry
(`P2-1` schema, `P2-2` loader driven by the registry, `P2-3` selection UX, `P2-4`
per-profile output customization). See [`TODO.md`](TODO.md).

---

## 8. The north star (what "diverting" would mean)

The v2.0 vision — *deliberately aspirational*, intentionally unreached, kept as a screen to
reach toward (full text in [`VISION.md`](VISION.md)): framework-agnostic functional diffs,
new component creation, backend integration, multi-file coordination, test generation;
human-in-the-loop refinement, real-time preview, confidence scoring, branch-based testing;
multi-modal (voice, screenshot→code, markup); collaboration (PR-style approvals, shared
sessions, change history); deployment (staging deploys, A/B, canaries, rollback); multiple
AI backends; security/compliance scanning; ecosystem (plugin marketplace, IDE integration,
CLI companion).

**Why keep it:** it tells us *why* we're doing Phase 1. **Why not chase it:** functional /
multi-file / backend / voice are all explicitly out of MVP scope. If in doubt about scope,
the answer is almost always "not yet — that's vision."

---

## 9. Scope guardrails — lines we hold (regressions to push back on)

1. **Edit mode = CSS/visual only, single-file.** Functional/multi-file/new-components = future.
2. **Multi-project via user-registered disk path.** Not auto-wire-to-one-project;
   not provider-side-only profiles. The user registers; that path is authoritative.
3. **Built-in profiles are examples, not the purpose.** Any framing that ties wysiwyg to a single specific target project is a regression.
4. **No live coupling to a target project's internal pipeline in Phase 1.** Export writes
   *files a human could paste by hand* (an `ideas.md` line + a `spec.md`). We deliberately do
   **not** touch `pipeline-state.json` or call the target's internal API. That's Phase 3.
5. **Path safety is non-negotiable.** Every write → `PathSanitizer.safeFilePath` + `GitManager`.
6. **Type mirror stays in lockstep.** New type in one `shared/types.ts` → same change adds it
   to the other.
7. **Undo must work.** Git auto-commit + `/api/git/undo` is a product promise, not a convenience.
8. **Real AI, not mock.** NVIDIA NIM is live (P10 corrected older "mock AI" docs). Mock is only
   the no-API-key fallback for testing.

---

## 10. Known contradictions an AI must not propagate

1. **Built-in profiles: examples, not the purpose** — The built-in profiles (`example`, `generic`)
   are templates demonstrated in `ai-ui-editor/PROJECT_PROFILE.md` and `project-profiles.ts`.
   Any framing that treats a specific built-in profile as wysiwyg's sole raison d'être is wrong.
   wysiwyg is a general-purpose multi-project tool.
2. **Task count** — the original MVP spec defined **19** MVP tasks (MVP-01…19). **19 is correct.**
   (A stale celebratory doc that said "20" was deleted in the P1-7 cleanup.)
3. **Real AI vs mock** — **Real NVIDIA NIM is correct** (`meta/llama-3.1-70b-instruct`, P10);
   the mock is only the no-API-key fallback.
4. **`/api/files/append-ideas`** — **shipped** (`acb45ab`, P1-6), registered in `routes/files.ts`.
   Treat it as a live endpoint. (`/api/files/probe-root` likewise shipped with P1-0, `e9d2b91`.)
5. **"Servers Running" tables** — two docs that once presented live server state as if always up
   were deleted (snapshot docs that aged into contradiction). For how to run, use
   [`ai-ui-editor/README.md`](ai-ui-editor/README.md) → Setup.

---

## 11. Doc map (which file is authoritative for what)

| Doc | Role | Status |
|-----|------|--------|
| `PROJECT_BRIEF.md` (this file) | Self-contained pitch + authoritative narrative + live status | **Authoritative** |
| `README.md` | Slim front-door index | **Authoritative** (index) |
| `TODO.md` | Phase 1 record + Phase 2–4 roadmap **+ folded audit + MVP-spec-of-record appendices** | **Authoritative** for the roadmap |
| `VISION.md` | v2.0 north star | **Aspirational** |
| `ai-ui-editor/README.md` | Setup + build + API reference | **Authoritative** for setup + API |
| `ai-ui-editor/PROJECT_PROFILE.md` | Project Profile System (`example` + `generic` profiles) | **Authoritative** for profiles |
| `ai-ui-editor/sample-project/README.md` | Vite scaffold boilerplate | 3-line pointer header identifies it as the wysiwyg target app |
| *Folded (2026-07-05 consolidation)* | `PROJECT_DETAILS.md` (pre-MVP draft, wrong on load-bearing points; its 3 use cases already lived here in §3), `GAP_AUDIT.md` (live status folded into §7 here; audit detail into the `TODO.md` audit appendix), `MVP_REQUIREMENTS.md` (MVP-01…19 + API contracts folded into the `TODO.md` MVP appendix), `VISION_REQUIREMENTS.md` (→ renamed `VISION.md`) | Snapshot/legacy/duplicate artifacts whose roles are now covered by the surviving docs. Do not reintroduce. |

---

## 12. In one breath

An **AI prompt generator that can see your running UI and knows your project's conventions**,
with two outputs — apply a diff now (Edit) or write a structured spec into your project's
backlog for later (Export) — generalized across any project you register by disk path.
MVP shipped, post-MVP hardening (P1–P10) shipped, Requirements Bridge Phase 1 shipped
end-to-end (foundation P1-1…P1-5 + the Project Registry P1-0 `e9d2b91` + the File Export
P1-6 `acb45ab`), test-pinned at 221 tests. **Phase 1 is feature-complete.** The next
milestone is **Phase 2** — a richer profile system on top of the P1-0 registry (see `TODO.md`).
Everything beyond that is deliberately deferred.

---

*Authored 2026-07-04; updated 2026-07-05 (consolidation: absorbed README framing + GAP_AUDIT live status + PROJECT_DETAILS use cases). Keep in sync with `TODO.md`; the live roadmap + folded appendices live there.*
