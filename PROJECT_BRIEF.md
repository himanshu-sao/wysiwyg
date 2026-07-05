# wysiwyg — Project Brief

> **This is the single, self-contained description of what wysiwyg is, why it exists,
> how it works, what's built, what's next, and the scope lines we hold.** Read this first
> in any new session. It is the durable "pitch"; for live status/roadmap see
> [`README.md`](README.md) (shared understanding + doc-map) and [`TODO.md`](TODO.md)
> (the active roadmap with P1-0 / P1-6).
>
> *Last updated: 2026-07-04. If this file and another doc disagree, this file +
> `README.md` + `TODO.md` are the authoritative trio; the other doc is stale.*

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

---

## 4. Multi-project is core — not a Phase 2 add-on

wysiwyg is **not "the antikythera tool."** It is a general-purpose, multi-project tool.

- You tell wysiwyg which project you're in by **typing that project's on-disk path.**
- wysiwyg inspects it (`package.json`/`pyproject.toml`, directory scan), learns its
  structure/conventions, and **persists a registry entry** (`chrome.storage.local`).
- **One registered project per session**, used by *both* modes.
- That registered disk path is the **authoritative `projectRoot`** for every file/git op.
  (Today this is a placeholder — `window.location.origin`, a URL — wrong for any file op.
  Replacing it is the #1 work item; see §6.)

**`antikythera` is the first concrete profile we built against — an *example*, the first
instance, NOT the purpose.** Anywhere a doc says "antikythera," read "the first registered
example project." If wysiwyg ever becomes wysiwyg-for-antikythera-only, the vision failed.

Built-in profiles today (both real, in `middleware/src/config/project-profiles.ts`):
- **`antikythera`** — FastAPI + React 19 + Vite + Tailwind + Python 3.9; URLs `localhost:5173`/`:8006`;
  backend `api/`, frontend `ui/src/`, requirements `automation-ideas/`; intake
  `automation-ideas/ideas.md`; artifacts `spec.md`/`architecture.md`/`tests.md`/`execution_report.md`.
- **`generic`** — React + Vite; `localhost:*`; frontend `src/`; intake `TODO.md`; artifact `spec.md`.

A profile defines: tech stack, directory structure, artifact format, intake file, known
agent roles (for multi-agent target projects), and a `promptContext` string injected into
prompts.

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
  git auto-commit, one-click undo, HMR.
- **Post-MVP hardening (P1–P10):** apply-flow fix (P3), Zod/path validation + git/undo
  `projectRoot` fix (P4), DiffValidator TypeScript-API rewrite (P6), real sourcemaps (P7),
  real token streaming (P8), XSS sanitization (P9), docs sync (P10).
- **Requirements Bridge Phase 1, foundation (P1-1…P1-5):** project profiles + URL detection,
  the Export context-menu item, `POST /api/ai/export-requirements`, the requirements prompt
  template, and the Popup export UI.

### 🔴 Active work — Phase 1 Requirements Bridge (the rest)
- **P1-0 — Project Registry (user-typed disk path).** *The genuinely missing capability and
  the prerequisite for everything else.* User types an absolute on-disk path; validate it
  looks like a project root; inspect (reuse `detectProfile` + lightweight scan); persist in
  `chrome.storage.local` keyed by origin; make that path authoritative `projectRoot`
  everywhere it currently uses `window.location.origin`. Plumb popup → background → content
  script (content scripts can't read `chrome.storage` synchronously). Test that the
  registered path — not the origin URL — reaches `/api/files/write`.
- **P1-6 — File Export (write spec into the active project's backlog).** *Blocked on P1-0.*
  New endpoint `POST /api/files/append-ideas`: append a TODO line to `ideas.md`
  (`- [ID-XXX] {title} | Priority: {Priority}`) + create `requirements/{ID-XXX}/spec.md`,
  per the active profile's conventions, via `PathSanitizer` + `GitManager`, atomic and
  idempotent. ID format: `ID-001`…`ID-999`, then `ID-1000` (3-digit zero-padded, verified
  against the real antikythera repo). Priority + title: AI-suggested, user-overridable in popup.

### Confirmed HTTP endpoints (code, today)
`/api/ai/edit` · `/api/ai/edit/stream` · `/api/ai/export-requirements` · `/api/files/validate` ·
`/api/files/write` · `/api/git/undo` · (WS `/ws/connect`).
> `/api/files/append-ideas` is **planned (P1-6), not yet built** — do not treat as shipped.

---

## 7. The north star (what "diverting" would mean)

The v2.0 vision — *deliberately aspirational*, intentionally unreached, kept as a screen to
reach toward (full text in [`VISION_REQUIREMENTS.md`](VISION_REQUIREMENTS.md)):
framework-agnostic functional diffs, new component creation, backend integration,
multi-file coordination, test generation; human-in-the-loop refinement, real-time preview,
confidence scoring, branch-based testing; multi-modal (voice, screenshot→code, markup);
collaboration (PR-style approvals, shared sessions, change history); deployment (staging
deploys, A/B, canaries, rollback); multiple AI backends; security/compliance scanning;
ecosystem (plugin marketplace, IDE integration, CLI companion).

**Why keep it:** it tells us *why* we're doing Phase 1. **Why not chase it:** functional /
multi-file / backend / voice are all explicitly out of MVP scope. If in doubt about scope,
the answer is almost always "not yet — that's vision."

---

## 8. Scope guardrails — lines we hold (regressions to push back on)

1. **Edit mode = CSS/visual only, single-file.** Functional/multi-file/new-components = future.
2. **Multi-project via user-registered disk path.** Not auto-wire-to-antikythera-forever;
   not provider-side-only profiles. The user registers; that path is authoritative.
3. **antikythera = example, always.** Any "build wysiwyg for antikythera" framing is a regression.
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

## 9. Known contradictions an AI must not propagate

1. **antikythera: example vs purpose** — `memory/antikythera-integration-vision.md` frames it
   as the *purpose*; this brief + `TODO.md` + `README.md` say *example*. **Example is correct.**
2. **Task count** — `MVP_REQUIREMENTS.md` defines 19 MVP tasks; `MVP_COMPLETE.md` says "20."
   **19 is correct.**
3. **Real AI vs mock** — `MVP_COMPLETE.md` says both "real AI (not mock)" and "needs Opencode
   SDK / Mock AI." **Real NVIDIA NIM is correct** (P10).
4. **`/api/files/append-ideas`** — listed in `TODO.md` P1-6 as **planned**. Not shipped until
   P1-6 lands in `routes/files.ts`.
5. **"Servers Running" tables** (`MVP_COMPLETE.md`, `PROJECT_STATUS.md`) present live state as
   if servers are up now — they are not a runtime status.

---

## 10. Doc map (which file is authoritative for what)

| Doc | Role | Status |
|-----|------|--------|
| `PROJECT_BRIEF.md` (this file) | Self-contained pitch/brief | **Authoritative** |
| `README.md` | Framing + shared understanding + index | **Authoritative** |
| `TODO.md` | Phase 1 Requirements Bridge roadmap (P1-0, P1-6 active) | **Authoritative** for the roadmap |
| `MVP_REQUIREMENTS.md` | The 2–3 week MVP spec (MVP-01…19) | **Superseded** — MVP shipped; intent only |
| `VISION_REQUIREMENTS.md` | v2.0 north star | **Aspirational** |
| `ai-ui-editor/README.md` | Setup + build + API reference | **Stale** — needs P1-7 update |
| `ai-ui-editor/POSTMVP_TODO.md` | P1–P10 completion log w/ commit hashes | Accurate to `dd97dee`; "next" list predates Requirements Bridge |
| `ai-ui-editor/PROJECT_PROFILE.md` | Project Profile System (antikythera/generic) | Accurate; needs P1-0 forward-pointer |
| `ai-ui-editor/PROJECT_STATUS.md` | Status snapshot | Stale; fold or date |
| `ai-ui-editor/MVP_COMPLETE.md` | "MVP complete" doc | **Stale + self-contradictory**; salvage then delete |
| `ai-ui-editor/sample-project/README.md` | Vite scaffold boilerplate | Orphan — prepend a 3-line pointer or delete |
| `memory/antikythera-integration-vision.md` | Original "build wysiwyg for antikythera" vision | **CONFLICTS** — needs rewrite to "antikythera = first example" |
| `TODO.proposed.md` | Near-duplicate of `TODO.md` | **Delete** — only unique line is provably wrong |
| `PROJECT_DETAILS.md` | Pre-MVP feasibility draft | **Historical** — wrong about AI backend/endpoints/scope; relabel or retire |

---

## 11. In one breath

An **AI prompt generator that can see your running UI and knows your project's conventions**,
with two outputs — apply a diff now (Edit) or write a structured spec into your project's
backlog for later (Export) — generalized across any project you register by disk path.
MVP shipped, post-MVP hardening (P1–P10) shipped, Requirements Bridge Phase 1 foundation
(P1-1…P1-5) shipped. **Immediate next step: P1-0 (project registry via disk path), which
unblocks P1-6 (writing specs into a registered project's backlog).** Everything else is
deliberately deferred.

---

*Authored 2026-07-04. Keep in sync with `README.md` + `TODO.md`; the live roadmap lives there.*
