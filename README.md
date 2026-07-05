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
giving it that project's path on disk; wysiwyg learns its structure and conventions and
remembers the registry. One active project per session, used by both edit and export
modes. (Project registration by user-typed disk path is tracked in [`TODO.md`](TODO.md) →
P1-0; today the extension auto-detects a couple of built-in profiles by URL.)

> **antikythera** is the first concrete project profile wysiwyg was built against — an
> example, not the purpose of wysiwyg.

## Shared understanding (checkpoint 2026-07-04)

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
- **Post-MVP hardening** (`ai-ui-editor/POSTMVP_TODO.md` P1–P10): apply-flow fix (P3),
  Zod/path validation on `/write` `/validate` `/undo` (P4, commits `ab07b00`/`dcdf47b`),
  DiffValidator rewrite (P6, commit `dcdf47b`), sourcemaps (P7, `8dbb195`), real token
  streaming (P8, `dd97dee`), XSS sanitization (P9, `dd97dee`), docs sync (P10, `dd97dee`).
  ✅ P1–P10 done.
- **Requirements Bridge — Phase 1** (the *active* work, see `TODO.md`):
  - ✅ P1-1 Project profiles + URL detection — `middleware/src/config/project-profiles.ts`
    (built-in `antikythera` + `generic` profiles, `detectProfile`/`getProfile`).
  - ✅ P1-2 Extension context menu (second item, mode handling).
  - ✅ P1-3 Export endpoint `POST /api/ai/export-requirements` — `routes/ai.ts`.
  - ✅ P1-4 Requirements prompt template — `PromptTemplates.getRequirementsPrompt`.
  - ✅ P1-5 Popup export UI (spec preview, editable textarea, export button).
  - 🔴 **P1-0 (Project Registry — user-typed disk path)** is the genuinely missing prerequisite.
    Today `projectRoot = window.location.origin` (a URL, wrong for any file op); P1-0 makes
    the user-registered on-disk path authoritative for both edit and export.
  - 🔴 **P1-6 (File Export — write spec into the active project's backlog)** blocked on P1-0;
    new endpoint `POST /api/files/append-ideas` + ideas.md/spec.md writes via `PathSanitizer` +
    `GitManager`.
- **Confirmed endpoints** (code): `/api/ai/edit`, `/api/ai/edit/stream`, `/api/ai/export-requirements`,
  `/api/files/validate`, `/api/files/write`, `/api/git/undo`. (Note: `/api/files/append-ideas`
  is P1-6 — planned, **not yet built**.)

### Doc status map (which file is authoritative for what)

> Authoritative = treat as the source of truth for that topic. Superseded = kept for
> history only; do not act on its "to do" claims. Aspirational = north star, deliberately
> out of reach.

| Doc | Role | Status |
|-----|------|--------|
| `README.md` (this file) | Framing + shared understanding + index | **Authoritative** |
| `TODO.md` | Phase 1 Requirements Bridge roadmap (P1-0, P1-6 active) | **Authoritative** for the roadmap |
| `MVP_REQUIREMENTS.md` | The 2–3 week MVP spec (MVP-01…19) | **Superseded** — MVP shipped; read for *intent*, not as to-do |
| `VISION_REQUIREMENTS.md` | v2.0 north star (full-stack, voice, PRs, DB, monetization) | **Aspirational** — intentionally unreached |
| `ai-ui-editor/README.md` | Setup + build + API reference | **Updated (P1-7 partial)** — now has Export mode, `/edit/stream`, `/export-requirements`, `config/`, `ResponseParser.ts`, tests, `devtools/`, reconciled models table, MVP-scope limitations; *verify against current code on next pass* (a couple of paths were added from git-status, not `ls`) |
| `ai-ui-editor/POSTMVP_TODO.md` | P1–P10 completion log w/ commit hashes + Requirements Bridge section | Accurate to `dd97dee`; now supersedes its own stale "next" list (test counts flagged as stale) |
| `ai-ui-editor/PROJECT_PROFILE.md` | Project Profile System (antikythera/generic) | Accurate; P1-0 forward-pointer added; "legacy config.ts" row flagged for verification |
| `ai-ui-editor/PROJECT_STATUS.md` | Status snapshot | Stale (pre-P4/P6/P7/P10, missing Export/multi-project); stale-snapshot banner + "how to run" added; low-risk, fold into README eventually |
| `ai-ui-editor/MVP_COMPLETE.md` | "MVP complete" celebration doc | **Stale + self-contradictory** (says "20 MVP tasks" vs spec's 19; claims AI is real *and* mock); correction banner added; candidate for deletion after P1-7 |
| `ai-ui-editor/sample-project/README.md` | Vite scaffold boilerplate | 3-line pointer header added (now identifies as the wysiwyg target app); body is still the Vite scaffold README |
| `memory/antikythera-integration-vision.md` | Repo memory: how wysiwyg's capability applies to multi-project targets | **Rewritten** — now "antikythera = first example" (was "antikythera = purpose"); no longer conflicts |
| `TODO.proposed.md` | (was a near-duplicate of `TODO.md`) | **Deleted 2026-07-04** — only unique line was provably wrong ("root README is just `# wysiwyg`") |
| `PROJECT_DETAILS.md` | Pre-MVP feasibility draft (2026-07-02) | **Historical** — wrong about AI backend (Opencode/Claude/Ollama vs real NVIDIA NIM), endpoints, and scope; correction banner added; read for original intent/north-star use cases only |

### Known contradictions an AI must not propagate

1. **antikythera: example vs purpose.** `TODO.md` + this README say "example." The repo
   memory `antikythera-integration-vision.md` *used to* say "purpose" — **rewritten 2026-07-04**
   to "antikythera = first example"; it no longer conflicts. **Example is correct.**
2. **Task count.** `MVP_REQUIREMENTS.md` defines **19** MVP tasks; `MVP_COMPLETE.md` says
   "All 20." **19 is correct.** (MVP_COMPLETE's own banner now flags this.)
3. **Real AI vs mock.** `MVP_COMPLETE.md` line ~32 says "real AI (not mock)" but its own
   line ~157/169 says "needs Opencode SDK / Mock AI." **Real NVIDIA NIM is correct** (P10).
   (MVP_COMPLETE's banner flags this.)
4. **`/api/files/append-ideas`** — lives in `TODO.md` P1-6 as **planned**. Do not treat it
   as shipped until P1-6 lands in `routes/files.ts`. **Open question (unverified this
   session):** does `popup/App.tsx` already call it / does `routes/files.ts` already
   register it? If yes — drift to reconcile; if no — `TODO.md`'s "already targets
   `/api/files/append-ideas`" line (line ~334) is stale. Resolve before quoting.
5. **"Servers Running" tables** (`MVP_COMPLETE.md`, `PROJECT_STATUS.md`) presented live state
   as if servers are up now. `PROJECT_STATUS.md` is rephrased to "how to run";
   `MVP_COMPLETE.md`'s banner flags its table as non-live.

### Decision (checkpoint)

We are **on track** — the code advanced exactly as the roadmap said (MVP → P1–P10 hardening
→ Requirements Bridge Phase 1). The drift is in the *docs*, not the build: a few files
describe an older, antikythera-scoped, mock-AI, single-mode state. **No code rewrite. The
cleanup is doc-only:** reconcile the stale files per the map above, fix the contradictions,
keep `README.md` + `TODO.md` as the authoritative pair, salvage-then-delete the pure
historical duplicates. The first new work item is **P1-0 (Project Registry)**.

> **New here? Read [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) first** — it's the self-contained
> pitch (problem, both modes, multi-project, what's built, what's next, scope guardrails).
> This README is the index + shared-understanding checkpoint; `TODO.md` is the live roadmap.

---

## Docs

| Doc | What it is |
|-----|------------|
| [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) | **Read first.** Self-contained project pitch + brief (portable across sessions) |
| [`ai-ui-editor/README.md`](ai-ui-editor/README.md) | Setup, build, run, test, architecture, **API reference** — the source of truth for *how things are right now* |
| [`ai-ui-editor/PROJECT_STATUS.md`](ai-ui-editor/PROJECT_STATUS.md) | Short status snapshot: what's implemented, what's next |
| [`TODO.md`](TODO.md) | Roadmap / living task list (Phase 1: Requirements Bridge) |
| [`VISION_REQUIREMENTS.md`](VISION_REQUIREMENTS.md) | Historical v2.0 vision document (north star) |

## Quick start

See [`ai-ui-editor/README.md`](ai-ui-editor/README.md) for the full setup. In short:
start the middleware (`cd ai-ui-editor/middleware && npm run dev`, localhost:3000) and
a target dev server (e.g. `ai-ui-editor/sample-project`, localhost:5174), load the built
extension from `ai-ui-editor/extension/dist` in Chrome, then right-click any UI element.

## Status

The MVP (right-click → AI edit options → diff → validate → apply → git commit → HMR) is
complete, along with the Export-mode UI and endpoint. The active work is the
**Requirements Bridge** (Phase 1) — see [`TODO.md`](TODO.md) and
[`ai-ui-editor/POSTMVP_TODO.md`](ai-ui-editor/POSTMVP_TODO.md).

---

*Last updated: 2026-07-04*
