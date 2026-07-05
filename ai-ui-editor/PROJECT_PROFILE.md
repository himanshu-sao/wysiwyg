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

### antikythera

| Field | Value |
|-------|-------|
| **URLs** | `localhost:5173`, `localhost:8006` |
| **Tech Stack** | FastAPI, React 19, Vite, Tailwind, Python 3.9 |
| **Backend** | `api/` |
| **Frontend** | `ui/src/` |
| **Requirements** | `automation-ideas/` |
| **Artifacts** | `spec.md`, `architecture.md`, `tests.md`, `execution_report.md` |
| **Intake File** | `automation-ideas/ideas.md` |
| **Agents** | Orchestrator, Refiner, Architect, Tester, Executor, Audit, Memory |

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
// Returns: antikythera profile
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

const profile = getProfile('antikythera');
const prompt = `
${profile.promptContext}

## Element Context
...
`;
```

### 3. File Path Resolution

When exporting requirements, the profile tells wysiwyg where to write:

```typescript
const profile = getProfile('antikythera');
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

```typescript
interface ProjectProfile {
  // Unique identifier
  name: string;
  
  // URL patterns for auto-detection (glob-style)
  urlPatterns: string[];
  
  // Human-readable tech stack
  techStack: string[];
  
  // Directory mappings
  directories: {
    backend?: string;      // e.g., 'api/'
    frontend?: string;     // e.g., 'ui/src/'
    requirements?: string; // e.g., 'automation-ideas/'
  };
  
  // Expected artifact files for requirements
  artifactFormat: string[];
  
  // Where new TODOs are appended
  intakeFile?: string;
  
  // Known agent roles (for multi-agent projects)
  agents?: string[];
  
  // Project description for AI prompts
  promptContext: string;
}
```

---

## Usage in AI Prompts

### Requirements Export Prompt

```typescript
import { getProfile } from './config/project-profiles';
import { getRequirementsPrompt } from './ai/PromptTemplates';

const profile = getProfile('antikythera');

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