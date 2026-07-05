---
name: antikythera-integration-vision
description: How wysiwyg's prompt-generator capability applies to multi-project targets, using antikythera as the first example profile (NOT the purpose)
metadata:
  type: project
---

> **Reframed 2026-07-04.** This memory originally framed wysiwyg as "built for antikythera"
> (antikythera = the *purpose*). That framing is a **regression** — corrected here and in
> [`README.md`](README.md) / [`TODO.md`](TODO.md) / [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md).
> **antikythera is project #1 — the first example profile, not the purpose of wysiwyg.**
> Read "antikythera" below as "the first registered example project"; generalise to any
> user-registered project. See the authoritative trio for the current framing.

## User's Goal

The user wants wysiwyg to help them iterate on **any** project by capturing exactly what
should change in the running UI and producing a high-quality instruction. antikythera is
the first concrete project this was validated against: when working on it, it was hard to
tell an AI precisely what needed to change and where — so it became the first instance of
the general "project bridge" capability.

## Current State (as of 2026-07-04, see [`ai-ui-editor/POSTMVP_TODO.md`](ai-ui-editor/POSTMVP_TODO.md) for the commit-grounded log)

### wysiwyg capabilities (ai-ui-editor)
- **Right-click UI editing**: Chrome extension captures DOM + context, sends to AI, applies CSS/visual edits (Edit mode).
- **Real sourcemap resolution**: element → source file:line (P7, commit `8dbb195`).
- **Token streaming** (P8), **XSS sanitization** (P9), **TypeScript-API + oxlint diff validation** (P6).
- **Auto-commit + one-click undo**, HMR.
- **NVIDIA NIM** AI (`meta/llama-3.1-70b-instruct` default — **real, not mock**; P10).
- **Middleware**: Fastify on `localhost:3000`.
- **Project Profile System** (P1-1): built-in `antikythera` + `generic` profiles in `middleware/src/config/project-profiles.ts`.
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
| `projectRoot` = `window.location.origin` (URL) | needs the on-disk repo path | 🔴 **P1-0 (Project Registry)** fixes this — the active work item |
| AI prompts for visual edits | architectural/functional prompts | ✅ `getRequirementsPrompt()` added (P1-4); visual-only is an Edit-mode scope choice |
| One-click apply with validation | target project's own verification loop | 🟡 Phase 3 (live API bridge) — Phase 1 is file handoff only |

## The active track: Requirements Bridge (Phase 1)

See [`TODO.md`](TODO.md) for the authoritative roadmap. Summary:

- **P1-0 (Project Registry — user-typed disk path)** 🔴 — the genuinely missing capability.
  User types an on-disk path; wysiwyg inspects it, persists a registry in
  `chrome.storage.local`, and that path becomes the authoritative `projectRoot` for
  both Edit and Export modes. **Prerequisite for P1-6.**
- **P1-6 (File Export — write spec into the active project's backlog)** 🔴 — blocked on
  P1-0. New `POST /api/files/append-ideas` appends the `ideas.md` line + creates
  `requirements/{ID-XXX}/spec.md` per the active profile, via `PathSanitizer` + `GitManager`,
  atomic + idempotent. Does **not** touch `pipeline-state.json` (live pipeline coupling = Phase 3).

## Recommended Enhancement Path (general framing)

### Phase 1: Project Bridge (file handoff) — *active*
Captures UI + intent → generates a structured spec → writes it into the target project's own backlog files (a human could paste by hand). No live coupling to the target's internal API. **antikythera = the first profile this is exercised against.**

### Phase 2: Project Profiles + Multi-Project Support — *next*
Matures the P1-0 registry into a richer profile system (`ProfileManager`, profile dropdown in popup, per-profile artifact templates). Built on user-registered projects, not provider-side-only config.

### Phase 3: API Bridge (Full Integration) — *future, deferred*
Direct, live handoff to a target project's pipeline (e.g. a `POST /api/ideas/upsert` **in the target project**, using its own `StateManager` — never writing its internal state files directly). Live pipeline coupling begins here; Phase 1 deliberately avoids it.

## "Files to Modify for MVP" — ✅ DONE (was the original Phase 1 plan)

This table was the original to-do list for the Requirements Bridge. All items below have shipped
(P1-1…P1-5); the remaining work is P1-0 (registry) and P1-6 (file write), tracked in [`TODO.md`](TODO.md).

| File (original plan) | Status | Note |
|----------------------|--------|------|
| `ai-ui-editor/extension/content-script.ts` context menu | ✅ + 🔴 | Export context-menu item added (P1-2); `projectRoot = window.location.origin` placeholder still to be replaced by P1-0 |
| `ai-ui-editor/middleware/src/routes/ai.ts` `/export-requirements` | ✅ | P1-3, `ai.ts` |
| `ai-ui-editor/middleware/src/ai/PromptTemplates.ts` `getRequirementsPrompt()` | ✅ | P1-4 |
| `ai-ui-editor/MVP_REQUIREMENTS.md` Phase 1 requirements | ➖ | `MVP_REQUIREMENTS.md` is now superseded (MVP shipped); Phase 1 lives in `TODO.md` instead |
| `shared/types.ts` `RequirementsExport` type | ✅ | Added ( mirrored across both `shared/types.ts` files) |

---

*Reframed 2026-07-04 from the original "build wysiwyg for antikythera" vision to "wysiwyg project-profile / requirements bridge — antikythera = first example." See [[antikythera-is-example]] harness memory.*
