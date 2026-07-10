# Project Profile System

**Created**: 2026-07-04  
**Status**: ✅ Implemented (P1-1)

---

## Overview

The Project Profile System allows wysiwyg to understand and work with different target projects. Each profile defines:

- **Tech stack** — Frameworks, languages, build tools
- **Directory structure** — Where backend, frontend, and requirements live
- **Artifact format** — What files the AI should generate
- **Intake file** — Where new TODOs/requirements are appended
- **Agent roles** — Known agent types for task routing
- **AI prompt context** — Project description injected into AI prompts

---

## Built-in Profiles

### example

| Field | Value |
|-------|-------|
| **URLs** | `localhost:5173`, `localhost:8006` |
| **Tech Stack** | React 19, Vite, Tailwind, TypeScript |
| **Backend** | `api/` |
| **Frontend** | `src/` |
| **Requirements** | `.wysiwyg/` |
| **Artifacts** | `spec.md`, `architecture.md`, `tests.md` |
| **Intake File** | `.wysiwyg/ideas.md` |
| **Agents** | Architect, Tester, Executor |

### generic

| Field | Value |
|-------|-------|
| **URLs** | `localhost:*` (any localhost port) |
| **Tech Stack** | React, Vite |
| **Frontend** | `src/` |
| **Artifacts** | `spec.md` |
| **Intake File** | `TODO.md` |

---

## How It Works

### 1. Auto-Detection

When you right-click a UI element, wysiwyg automatically detects the project profile by matching the page URL against profile patterns:

```typescript
import { detectProfile } from './config/project-profiles';

const profile = detectProfile('http://localhost:5173');
// Returns: example profile
```

> ✅ **Auto-detection by URL is one input; the registered disk path is authoritative.**
> The mechanism is **user-typed disk-path registration** (P1-0, shipped `e9d2b91` — see
> [`TODO.md`](TODO.md)): the user points wysiwyg at a project's on-disk path; wysiwyg
> validates it via `/api/files/probe-root` (a project marker on disk), persists a registry
> (`chrome.storage.local`, per-origin active project + global override), and that path
> becomes the authoritative `projectRoot` for both edit and export modes (the
> `window.location.origin` placeholder is gone). URL detection still picks the *built-in*
> profile match; the registered path is what file/git operations target.

### 2. AI Prompt Enhancement

The profile's `promptContext` is injected into AI prompts:

```typescript
import { getProfile } from './config/project-profiles';

const profile = getProfile('example');
const prompt = `
${profile.promptContext}

## Element Context
...
`;
```

### 3. File Path Resolution

When exporting requirements, the profile tells wysiwyg where to write:

```typescript
const profile = getProfile('example');
const outputPath = `${projectRoot}/${profile.directories.requirements}/spec.md`;
```

---

## Adding a New Profile

### Step 1: Define the Profile

Edit `middleware/src/config/project-profiles.ts`:

```typescript
export const PROFILES: Record<string, ProjectProfile> = {
  // ... existing profiles
  myProject: {
    name: 'myProject',
    urlPatterns: ['localhost:3000'],
    techStack: ['Next.js', 'TypeScript', 'Tailwind'],
    directories: {
      frontend: 'app/',
      requirements: 'docs/requirements/',
    },
    artifactFormat: ['spec.md', 'tests.md'],
    intakeFile: 'docs/requirements/backlog.md',
    promptContext: `myProject is a Next.js application with:
- App Router structure in app/
- TypeScript throughout
- Tailwind CSS for styling`,
  },
};
```

### Step 2: Rebuild Middleware

```bash
cd ai-ui-editor/middleware
npm run build
```

### Step 3: Test Detection

Navigate to your project and verify the profile is detected:

```bash
# In Chrome console
console.log(detectProfile('http://localhost:3000'))
```

---

## Profile Schema Reference

Profiles live in two places:

- **On disk as JSON** — one file per built-in profile in
  `middleware/src/config/profiles/<name>.json` (P2-1). This is the source of
  truth loaded by `ProfileManager` (P2-2). Each file is one `ProfileEntry`
  object validated on load by `validateProfileEntry()`.
- **In code** — `PROFILES` in `project-profiles.ts` holds the same two built-ins
  (kept in lockstep with the JSON for now); `detectProfile` / `getProfile`
  consume the in-code table.

```typescript
interface ProjectProfile {
  // ── Required (P1-1) ──────────────────────────────────────────────
  name: string;                       // Unique identifier
  urlPatterns: string[];              // URL patterns for auto-detection (glob-style)
  techStack: string[];                // Human-readable tech stack
  directories: {                      // Directory mappings
    backend?: string;                 // e.g. 'api/'
    frontend?: string;                // e.g. 'ui/src/'
    requirements?: string;           // e.g. '.wysiwyg/'
  };
  artifactFormat: string[];          // Expected artifact files, e.g. ['spec.md']
  promptContext: string;              // Project description for AI prompts

  // ── Optional (P1-1) ─────────────────────────────────────────────
  intakeFile?: string;                // Where new TODOs are appended
  agents?: string[];                  // Known agent roles (multi-agent projects)

  // ── P2-1 extensions (all optional → backward compatible) ────────
  rootPath?: string;                  // RUNTIME-ONLY: the user-registered on-disk
                                      // path (P1-0) that becomes projectRoot. Built-in
                                      // JSON templates never set this; a registered
                                      // project layers it on at resolve time. NEVER
                                      // serialized to config/profiles/*.json —
                                      // validateProfileEntry() rejects it on disk.

  markers?: string[];                 // Project-root marker files used to validate a
                                      // registered path before it enters the registry.
                                      // Default = the set /api/files/probe-root checks
                                      // (package.json, pyproject.toml, Cargo.toml, go.mod,
                                      // .git). A profile may narrow it (e.g. Python-only:
                                      // ['pyproject.toml']).

  intakeLineFormat?: {                // Override the verified backlog line shape. The
    template: string;                 // `${id}` / `${title}` / `${priority}` are
                                      // interpolated by appendRequirements(). Default:
  };                                  // `- [${id}] ${title} | Priority: ${priority}`.

  artifactTemplates?: Array<{         // Per-artifact section lists. `name` should match
    name: string;                     // an entry in artifactFormat. `sections` is the
    sections: string[];               // ordered markdown heading list P2-4 injects into
  }>;                                 // the requirements prompt + spec.md scaffold. Absent
                                      // → the hardcoded Overview/Requirements/Edge
                                      // Cases/Acceptance Criteria prompt is used.
}
```

> **The on-disk JSON shape** is `ProfileEntry` = `ProjectProfile` without
> `rootPath`. `validateProfileEntry(raw)` (in `project-profiles.ts`) is the load
> boundary: it checks required fields, types, and rejects a stray `rootPath` so
> a stale template can't silently pin a write root. See the example +
> `generic.json` files for full-field examples.

### ID + intake-line format (example profile, verified)

- **ID format**: `ID-001`…`ID-999` (3-digit zero-padded, uppercase), then `ID-1000`.
  Next ID = scan the intake file + `requirements/` dir for the max numeric ID, +1.
- **Intake line** (default `intakeLineFormat.template`):
  `- [${id}] ${title} | Priority: ${priority}` — appended to the `intakeFile`.
- A matching `requirements/${id}/spec.md` is written with the spec body in the
  same atomic git commit (undoable via `/api/git/undo`). **P2-4**: the spec
  section set is profile-driven end-to-end. `PromptTemplates.specSectionsFor(profile)`
  reads `artifactTemplates[spec.md].sections` (falling back to Overview/
  Requirements/Edge Cases/Acceptance Criteria when the profile has no template);
  `getRequirementsPrompt` uses it for the `spec` example + the `**spec**`
  guideline, and `files.ts` `supplementSpecSections` appends any section the AI
  omitted as `## <Section>\n\n_TBD.` when writing `spec.md`. (Secondary artifacts —
  `architecture.md`/`tests.md` from `architectureHints`/`testScenarios` — are
  **not** written yet; only `spec.md` is committed. That's a deferred extension,
  tracked in `TODO.md` P2-4.)

---

## Usage in AI Prompts

### Requirements Export Prompt

```typescript
import { getProfile } from './config/project-profiles';
import { getRequirementsPrompt } from './ai/PromptTemplates';

const profile = getProfile('example');

const prompt = `
You are a requirements engineer for the ${profile.name} project.

## Project Context
${profile.promptContext}

## Element Context
...

## User Instruction
"${instruction}"

## Task
Generate a structured specification including:
1. Overview (1-2 sentences)
2. Functional Requirements (numbered, testable)
3. Non-Functional Requirements (performance, security)
4. Files to Modify (with rationale)
5. Test Scenarios (unit, integration, E2E)
6. Edge Cases
7. Acceptance Criteria

## Output Format
Return JSON: { spec, architectureHints, testScenarios, edgeCases }
`;
```

---

## Future Enhancements (Deferred)

- [x] **P1-0: user-registered disk-path projects** — shipped (`e9d2b91`); see [`TODO.md`](TODO.md). Registered paths are selectable now; the active project per origin (with global override) drives both edit and export.
- [ ] User-editable profiles via UI
- [ ] Profile inheritance (extend base React profile)
- [ ] RAG over codebase for smarter file suggestions
- [ ] Profile-specific validation rules
- [ ] Export/import profiles as JSON

---

## Related Files

| File | Purpose |
|------|---------|
| `middleware/src/config/project-profiles.ts` | Profile definitions + detection logic |
| `extension/shared/projectRegistry.ts` | On-disk path registry (P1-0): per-origin active project + global override |
| `extension/shared/types.ts` ↔ `middleware/src/shared/types.ts` | Shared TypeScript types (manually mirrored — keep in lockstep) |

---

*Last Updated: 2026-07-05*