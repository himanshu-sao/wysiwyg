# wysiwyg

wysiwyg is an **AI-driven prompt generator that has access to the running UI.**
You right-click the element you're looking at, say "make this better," and get a
high-quality, well-targeted instruction for an AI — instead of spending ten minutes
figuring out what prompt to type.

It has two modes:

- **Edit mode** — generates a code diff (CSS/visual today) and applies it to source
  with validate-before-write, git auto-commit, and one-click undo.
- **Export mode** — generates a structured spec and writes it back into the target
  project's own backlog conventions (e.g. `ideas.md` + `requirements/ID-XXX/spec.md`)
  for a downstream AI/human to act on.

**Multi-project is core, not Phase 2:** you register a project by its on-disk path;
wysiwyg validates it, learns its conventions via a Project Profile System, and
persists the registry.

---

## Docs

The full project story — what's built, what's shipped, scope guardrails, the known
doc-contradictions an AI must not propagate, and the live code-vs-roadmap status —
lives in **[`PROJECT_BRIEF.md`](PROJECT_BRIEF.md)**. Read that first.

| Doc | What it is |
|-----|------------|
| [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) | **Read first.** Self-contained pitch + authoritative narrative (state, shipped markers, contradictions, scope guardrails). |
| [`TODO.md`](TODO.md) | Roadmap / living task list (Phase 1 shipped; Phase 2 next) — **plus** the folded audit + MVP-spec-of-record appendices. |
| [`VISION.md`](VISION.md) | v2.0 north-star vision (deliberately aspirational). |
| [`ai-ui-editor/README.md`](ai-ui-editor/README.md) | Setup, build, run, test, architecture, **API reference** — the source of truth for *how things are right now*. |
| [`ai-ui-editor/PROJECT_PROFILE.md`](ai-ui-editor/PROJECT_PROFILE.md) | The Project Profile System (`example` + `generic` profiles). |

## Quick start

See [`ai-ui-editor/README.md`](ai-ui-editor/README.md) for the full setup. In short:
start the middleware (`cd ai-ui-editor/middleware && npm run dev`, localhost:3000) and
a target dev server (e.g. `ai-ui-editor/sample-project`, localhost:5174), load the
built extension from `ai-ui-editor/extension/dist` in Chrome, register/open a project,
then right-click any UI element.

## Status

The MVP shipped, post-MVP hardening (P1–P10) shipped, and **Requirements Bridge Phase 1
is feature-complete and test-pinned** (221 tests) — including the two former blockers
P1-0 (Project Registry, `e9d2b91`) and P1-6 (File Export, `acb45ab`). The next milestone
is **Phase 2** (richer profile system on the P1-0 registry). See
[`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) and [`TODO.md`](TODO.md) for detail.

---

*Last updated: 2026-07-05*
