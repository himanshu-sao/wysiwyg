---
name: antikythera-integration-vision
description: How wysiwyg's prompt-generator capability applies to multi-project targets, using antikythera as the first example profile (NOT the purpose)
metadata:
  type: project
---

> **Reframed 2026-07-04.** This memory originally framed wysiwyg as "built for antikythera"
> (antikythera = the *purpose*). That framing is a **regression** — corrected here and in
> [[README.md](../README.md)] / [[TODO.md](../TODO.md)] / [[PROJECT_BRIEF.md](../PROJECT_BRIEF.md)].
> **antikythera is project #1 — the first example profile, not the purpose of wysiwyg.**
> Read "antikythera" below as "the first registered example project"; generalise to any
> user-registered project. See the authoritative trio for the current framing.

## User's Goal

The user wants wysiwyg to help them iterate on **any** project by capturing exactly what
should change in the running UI and producing a high-quality instruction. antikythera is
the first concrete project this was validated against: when working on it, it was hard to
tell an AI precisely what needed to change and where — so it became the first instance of
the general "project bridge" capability.

## Current State (as of 2026-07-05 — Phase 1 shipped; see [[TODO.md](../TODO.md)] for the roadmap and live audit appendix)

### wysiwyg capabilities (ai-ui-editor)
- **Right-click UI editing**: Chrome extension captures DOM + context, sends to AI, applies CSS/visual edits (Edit mode).
- **Real sourcemap resolution**: element → source file:line (P7, commit `8dbb195`).
- **Token streaming** (P8), **XSS sanitization** (P9), **TypeScript-API + oxlint diff validation** (P6).
- **Auto-commit + one-click undo**, HMR.
- **NVIDIA NIM** AI (`meta/llama-3.1-70b-instruct` default — **real, not mock**; P10).
- **Middleware**: Fastify on `localhost:3000`.
- **Project Profile System** (P1-1): built-in `example` + `generic` profiles in `middleware/src/config/project-profiles.ts`.
- **Export mode** (P1-3): `POST /api/ai/export-requirements` generates a structured spec.

### antikythera (the first example target project)
- **Cognitive Orchestration System**: multi-agent pipeline (INTAKE → DISCOVERY → BLUEPRINT → IMPLEMENTATION → UNIT_VERIFY → INTEGRATION → SYSTEM_VAL → HANDOVER → DONE).
- **Agent Roster**: Orchestrator, Refiner, Architect, Tester, Executor, Audit, Memory.
- **Artifact-driven**: `spec.md`, `architecture.md`, `tests.md`, `execution_report.md`, `audit_report.md`.
- **Intake file**: `automation-ideas/ideas.md` (lines like `- [ID-XXX] {title} | Priority: {Priority}`; IDs `ID-001`…`ID-999`, then `ID-1000`).
- Python 3.9 + FastAPI backend on `:8006`; React 19 + Vite frontend on `:5173`.

## Gap Analysis (the still-valid part of the original)

| wysiwyg strength | target-project need | gap / status |
|------------------|---------------------|---------------|
| Right-click element editing | requirements → TODO generation | ✅ Export mode (`/export-requirements`) generates the spec |
| Single-file CSS/visual edits | multi-file coordinated changes | 🟡 Deferred (vision) — Edit mode is deliberately single-file CSS/visual today |
| `projectRoot` = `window.location.origin` (URL) | needs the on-disk repo path | ✅ **P1-0 (Project Registry)** shipped (`e9d2b91`) — registered on-disk path is authoritative |
| AI prompts for visual edits | architectural/functional prompts | ✅ `getRequirementsPrompt()` added (P1-4); visual-only is an Edit-mode scope choice |
| One-click apply with validation | target project's own verification loop | 🟡 Phase 3 (live API bridge) — Phase 1 is file handoff only |

## The track: Requirements Bridge — Phase 1 ✅ shipped

See [[TODO.md](../TODO.md)] for the authoritative roadmap. Summary:

- **P1-0 (Project Registry — user-typed disk path)** ✅ shipped `e9d2b91`. User types an
  on-disk path; wysiwyg validates a project marker on disk (`/api/files/probe-root`),
  persists a registry in `chrome.storage.local` (per-origin active project + global
  override), and that path is the authoritative `projectRoot` for both Edit and Export.
- **P1-6 (File Export — write spec into the active project's backlog)** ✅ shipped `acb45ab`.
  `POST /api/files/append-ideas` appends the `ideas.md` line + creates
  `requirements/{ID-XXX}/spec.md` per the active profile, via `PathSanitizer` + `GitManager`,
  atomic + idempotent (one atomic git commit, undoable via `/api/git/undo`). Does **not**
  touch `pipeline-state.json` (live pipeline coupling = Phase 3).

## Recommended Enhancement Path (general framing)

### Phase 1: Project Bridge (file handoff) — ✅ shipped
Captures UI + intent → generates a structured spec → writes it into the target project's own backlog files (a human could paste by hand). No live coupling to the target's internal API. **antikythera = the first profile this is exercised against.**

### Phase 2: Project Profiles + Multi-Project Support — *next*
Matures the P1-0 registry into a richer profile system (`ProfileManager`, profile dropdown in popup, per-profile artifact templates). Built on user-registered projects, not provider-side-only config.

### Phase 3: API Bridge (Full Integration) — *future, deferred*
Direct, live handoff to a target project's pipeline (e.g. a `POST /api/ideas/upsert` **in the target project**, using its own `StateManager` — never writing its internal state files directly). Live pipeline coupling begins here; Phase 1 deliberately avoids it.

## "Files to Modify for MVP" — ✅ DONE (Phase 1 shipped end-to-end)

This table was the original to-do list for the Requirements Bridge. All items have shipped
(P1-1…P1-5 + P1-0 `e9d2b91` + P1-6 `acb45ab`). Phase 1 is feature-complete; see [[TODO.md](../TODO.md)]
for the Phase 2 roadmap. The folded audit appendix in TODO.md records the P1-7 doc-sync
consolidation; the folded MVP spec-of-record appendix preserves the original MVP-01…19
acceptance criteria (formerly `MVP_REQUIREMENTS.md`).

| File (original plan) | Status | Note |
|----------------------|--------|------|
| `ai-ui-editor/extension/content-script.ts` context menu | ✅ | Export context-menu item added (P1-2); `projectRoot` is now the registered on-disk path (P1-0) |
| `ai-ui-editor/middleware/src/routes/ai.ts` `/export-requirements` | ✅ | P1-3, `ai.ts` |
| `ai-ui-editor/middleware/src/ai/PromptTemplates.ts` `getRequirementsPrompt()` | ✅ | P1-4 (priority + title flow included) |
| `extension/shared/types.ts` ↔ `middleware/src/shared/types.ts` mirrored `RequirementsExport` type | ✅ | Mirrored across both (A stray `ai-ui-editor/shared/types.ts` copy was removed in P1-7 cleanup; the live pair is intact.) |

---

*Reframed 2026-07-04 from the original "build wysiwyg for antikythera" vision to "wysiwyg multi-project tool — antikythera = first example." Updated 2026-07-05 to reflect shipped Phase 1 (P1-0/P1-6). The live audit and MVP spec-of-record now live as appendices in `TODO.md` (folded from the former `GAP_AUDIT.md` and `MVP_REQUIREMENTS.md`).*
