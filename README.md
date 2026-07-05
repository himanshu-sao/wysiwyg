# wysiwyg

wysiwyg is an **AI-driven prompt generator that has access to the running UI.**

After an app is built by AI, the hardest part of iterating on it is knowing *what prompt
to give the AI next*. wysiwyg fixes that: it captures the actual UI element you're looking
at (DOM, computed styles, hierarchy, resolved source), combines it with the conventions of
the **project** you're working in, and turns a vague "make this better" into a
high-quality, well-targeted instruction for an AI.

That instruction can take two shapes:

- **Edit mode** — wysiwyg generates a code diff and applies it to your source (currently
  CSS/visual edits), with validate-before-write, git auto-commit, and one-click undo.
- **Export mode** — wysiwyg generates a structured spec/TODO and writes it back into your
  project's own backlog conventions (e.g. `ideas.md` + `requirements/ID-XXX/spec.md`) so a
  downstream AI agent (or a human) can act on it.

## Multi-project is core

wysiwyg works across **multiple projects**. You tell wysiwyg which project you're in by
giving it that project's path on disk; wysiwyg validates it (a project marker on disk),
learns its structure and conventions, and remembers the registry. One active project per
session, used by both edit and export modes. (This Project Registry — P1-0 — shipped in
`e9d2b91`; before it, the extension auto-detected a couple of built-in profiles by URL and
used `window.location.origin` as the project root.)

> **antikythera** is the first concrete project profile wysiwyg was built against — an
> example, not the purpose of wysiwyg.

## Shared understanding (checkpoint 2026-07-05)

This section is the single place where our reviewed, agreed understanding of the
project lives — so anyone (human or AI) landing here knows what's true, what's stale,
and what's in conflict. It was written after sequentially reviewing every `.md` in the
repo against the framing above. **If a doc below contradicts this section, this section
wins.**

### What wysiwyg is (the load-bearing facts)

- **One product, two modes.** wysiwyg is an **AI-driven prompt generator that has access
  to the running UI.** It captures a UI element (DOM, computed styles, hierarchy, resolved
  source) + the target project's conventions, and turns vague intent into a high-quality
  instruction. That instruction takes one of two shapes:
  - **Edit mode** — a code diff applied to source (currently CSS/visual only), with
    validate-before-write, git auto-commit, and one-click undo.
  - **Export mode** — a structured spec written back into the target project's own backlog
    conventions (e.g. `ideas.md` + `requirements/ID-XXX/spec.md`) for a downstream AI/human.
- **Multi-project is core, not Phase 2.** The user tells wysiwyg which project they're in
  by typing its **on-disk path**; wysiwyg persists a registry and uses that path as the
  authoritative `projectRoot` for both modes. **One registered project per session.**
- **`antikythera` is project #1 — a concrete example, NOT the purpose of wysiwyg.** It is
  the first profile we built against. Anywhere a doc says "antikythera," read "the first
  registered example project/profile" and generalise to any user-registered project.

### What's actually implemented (verified against code)

- **MVP** (MVP-01…MVP-19 in `MVP_REQUIREMENTS.md`): right-click context menu, element/HTML
  capture, sourcemap resolution (commit `8dbb195`), NVIDIA NIM AI
  (`meta/llama-3.1-70b-instruct` default, **real AI — not mock**), validate-before-write,
  git auto-commit, one-click undo, HMR. ✅ Done.
- **Post-MVP hardening** (P1–P10): apply-flow fix (P3),
  Zod/path validation on `/write` `/validate` `/undo` (P4, commits `ab07b00`/`dcdf47b`),
  DiffValidator rewrite (P6, commit `dcdf47b`), sourcemaps (P7, `8dbb195`), real token
  streaming (P8, `dd97dee`), XSS sanitization (P9, `dd97dee`), docs sync (P10, `dd97dee`).
  ✅ P1–P10 done.
- **Requirements Bridge — Phase 1** (see `TODO.md`): shipped end-to-end — foundation *and*
  the two capstones that were once blockers.
  - ✅ P1-1 Project profiles + URL detection — `middleware/src/config/project-profiles.ts`
    (built-in `antikythera` + `generic` profiles, `detectProfile`/`getProfile`).
  - ✅ P1-2 Extension context menu (second item, mode handling).
  - ✅ P1-3 Export endpoint `POST /api/ai/export-requirements` — `routes/ai.ts`.
  - ✅ P1-4 Requirements prompt template — `PromptTemplates.getRequirementsPrompt`
    (priority + title flow, AI-suggested and user-overridable).
  - ✅ P1-5 Popup export UI (spec preview, editable textarea, priority + title, export button).
  - ✅ **P1-0 (Project Registry — user-typed disk path)** — shipped (`e9d2b91`). The
    user-registered on-disk path is now the authoritative `projectRoot` for both edit and
    export (per-origin active project + global override, persisted in `chrome.storage.local`;
    the `window.location.origin` URL placeholder is gone). Registration is gated by a project
    marker on disk, validated by `GET /api/files/probe-root`.
  - ✅ **P1-6 (File Export — write spec into the active project's backlog)** — shipped
    (`acb45ab`). `POST /api/files/append-ideas` appends the profile intake line + creates
    `requirements/{ID-XXX}/spec.md` as one atomic git commit (undoable via `/api/git/undo`),
    routed through `PathSanitizer` + `GitManager`. ID format `ID-001`…`ID-999`, then `ID-1000`.
- **Confirmed endpoints** (code): `/api/ai/edit`, `/api/ai/edit/stream`,
  `/api/ai/export-requirements`, `/api/files/validate`, `/api/files/write`,
  `/api/files/probe-root` (P1-0), `/api/files/append-ideas` (P1-6), `/api/git/undo`,
  `WS /ws/connect`.

### Doc status map (which file is authoritative for what)

> Authoritative = treat as the source of truth for that topic. Superseded = kept for
> history only; do not act on its "to do" claims. Aspirational = north star, deliberately
> out of reach.

| Doc | Role | Status |
|-----|------|--------|
| `README.md` (this file) | Framing + shared understanding + index | **Authoritative** |
| `TODO.md` | Phase 1 Requirements Bridge roadmap | **Authoritative** for the roadmap (Phase 1 shipped; active = none in Phase 1) |
| `MVP_REQUIREMENTS.md` | The 2–3 week MVP spec (MVP-01…19) | **Superseded** — MVP shipped; read for *intent*, not as to-do |
| `VISION_REQUIREMENTS.md` | v2.0 north star (full-stack, voice, PRs, DB, monetization) | **Aspirational** — intentionally unreached |
| `ai-ui-editor/README.md` | Setup + build + API reference | **Authoritative** for setup + API — Export mode, `/edit/stream`, `/export-requirements`, `/probe-root` (P1-0), `/append-ideas` (P1-6), reconciled models table, MVP-scope limitations; updated to shipped state. |
| `ai-ui-editor/PROJECT_PROFILE.md` | Project Profile System (antikythera/generic) | Accurate; updated to reflect that user-registered paths are selectable now (P1-0 shipped). |
| `ai-ui-editor/sample-project/README.md` | Vite scaffold boilerplate | 3-line pointer header (identifies as the wysiwyg target app); body is the Vite scaffold README |
| `memory/antikythera-integration-vision.md` | Repo memory: how wysiwyg's capability applies to multi-project targets | **Rewritten** — now "antikythera = first example" (was "antikythera = purpose"); no longer conflicts |
| `TODO.proposed.md` | (was a near-duplicate of `TODO.md`) | **Deleted 2026-07-04** — only unique line was provably wrong ("root README is just `# wysiwyg`") |
| `PROJECT_DETAILS.md` | Pre-MVP feasibility draft (2026-07-02) | **Historical** — wrong about AI backend (Opencode/Claude/Ollama vs real NVIDIA NIM), endpoints, and scope; correction banner added; read for original intent/north-star use cases only |

### Known contradictions an AI must not propagate

1. **antikythera: example vs purpose.** `TODO.md` + this README say "example." The repo
   memory `antikythera-integration-vision.md` *used to* say "purpose" — **rewritten 2026-07-04**
   to "antikythera = first example"; it no longer conflicts. **Example is correct.**
2. **Task count.** `MVP_REQUIREMENTS.md` defines **19** MVP tasks. **19 is correct.** (The
   stale `MVP_COMPLETE.md` that said "All 20" was deleted 2026-07-05.)
3. **Real AI vs mock.** **Real NVIDIA NIM is correct** (`meta/llama-3.1-70b-instruct`,
   P10). The mock is only the no-API-key fallback for testing. (The stale `MVP_COMPLETE.md`
   that contradicted itself on this was deleted 2026-07-05.)
4. **`/api/files/append-ideas`** — **shipped** (`acb45ab`, P1-6), registered in
   `routes/files.ts`. Treat it as a live endpoint, not "planned." (`/api/files/probe-root`
   likewise shipped with P1-0, `e9d2b91`.)
5. **"Servers Running" tables** — the two docs that presented live server state as if
   always up (`MVP_COMPLETE.md`, `PROJECT_STATUS.md`) were deleted 2026-07-05 (snapshot docs
   that aged into contradiction). For how to run, use `ai-ui-editor/README.md` → Setup.

> **Deleted docs (2026-07-05).** `ai-ui-editor/MVP_COMPLETE.md`,
> `ai-ui-editor/POSTMVP_TODO.md`, `ai-ui-editor/PROJECT_STATUS.md`, and the legacy
> `ai-ui-editor/middleware/src/config.ts` + `ai-ui-editor/shared/types.ts` were removed as
> part of the P1-7 doc-sync — they were snapshot/legacy artifacts that had drifted into
> contradiction. Their roles are covered by `ai-ui-editor/README.md` (setup + API),
> `TODO.md` (roadmap), and the surviving `shared/types.ts` mirror. Do not reintroduce them.

### Decision (checkpoint)

We are **on track** — the code advanced exactly as the roadmap said (MVP → P1–P10 hardening
→ Requirements Bridge Phase 1, including the two former blockers P1-0 + P1-6, which shipped
in `e9d2b91` + `acb45ab`). The doc drift that the 2026-07-04 checkpoint flagged is now
reconciled: the narrative docs describe what shipped, the deleted snapshot/legacy docs are
gone, and `README.md` + `TODO.md` remain the authoritative pair. **Phase 1 is feature-complete
and test-pinned (221 tests).** The next milestone is Phase 2 — a richer profile system on top
of the P1-0 registry (see `TODO.md`).

> **New here? Read [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) first** — it's the self-contained
> pitch (problem, both modes, multi-project, what's built, what's next, scope guardrails).
> This README is the index + shared-understanding checkpoint; `TODO.md` is the live roadmap.

---

## Docs

| Doc | What it is |
|-----|------------|
| [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) | **Read first.** Self-contained project pitch + brief (portable across sessions) |
| [`ai-ui-editor/README.md`](ai-ui-editor/README.md) | Setup, build, run, test, architecture, **API reference** — the source of truth for *how things are right now* |
| [`TODO.md`](TODO.md) | Roadmap / living task list (Phase 1 shipped; Phase 2 next) |
| [`GAP_AUDIT.md`](GAP_AUDIT.md) | Live code-vs-roadmap audit + pending work |
| [`VISION_REQUIREMENTS.md`](VISION_REQUIREMENTS.md) | Historical v2.0 vision document (north star) |

## Quick start

See [`ai-ui-editor/README.md`](ai-ui-editor/README.md) for the full setup. In short:
start the middleware (`cd ai-ui-editor/middleware && npm run dev`, localhost:3000) and
a target dev server (e.g. `ai-ui-editor/sample-project`, localhost:5174), load the built
extension from `ai-ui-editor/extension/dist` in Chrome, register/open a project, then
right-click any UI element.

## Status

The MVP (right-click → AI edit options → diff → validate → apply → git commit → HMR) is
complete, along with Export mode end-to-end: project registry (P1-0, `e9d2b91`), structured
spec generation (`/export-requirements`), and writing the spec into the active project's
backlog (P1-6, `acb45ab`). **Requirements Bridge Phase 1 is feature-complete and test-pinned**
(221 tests). The next milestone is **Phase 2** (richer profile system on the registry) — see
[`TODO.md`](TODO.md) and [`GAP_AUDIT.md`](GAP_AUDIT.md).

---

*Last updated: 2026-07-05*
