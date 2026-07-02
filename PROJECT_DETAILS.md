# Project Details: AI-Powered UI Editing Browser Extension

## Executive Summary
This document captures the detailed requirements, feasibility analysis, and technical architecture for an AI-powered browser extension that enables developers to make UI changes (cosmetic and functional) by right-clicking elements in their running web application and describing changes in natural language. The AI translates these instructions into code diffs that are applied to the source codebase.

---

## 1. User's Envisioned Requirements

### Core Vision
> "When the app is running, I want a Figma-type interface via browser where I can right-click on an element and say 'change the color to black' or 'add email validation to this text field' and all that information should be made available to the AI to fix."

### Specific Use Cases (from User)

#### Use Case 1: UI Critique & Iterative Improvement
- **Trigger**: Right-click on an integration card (e.g., "bob-pr-reviewer" card in Integrations Hub)
- **Input**: "This card does not look good, suggest me some options"
- **AI Response**: Multiple design options (CSS/layout variations)
- **User Action**: Select preferred option → "This looks good"
- **Result**: Changes applied to source code (CSS/React component)

#### Use Case 2: Add Functionality to Existing UI
- **Trigger**: Right-click on "Refine and Confirm" button in Automation Studio
- **Input**: "This button should call an API to get the result"
- **AI Response**: Generates event handler with fetch/axios call, loading states, error handling
- **Result**: Functional code added to the component

#### Use Case 3: Add New UI Elements with Behavior
- **Trigger**: Right-click anywhere in UI
- **Input**: "Add a button here that does XYZ" (e.g., "exports current view as PDF")
- **AI Response**: Generates new component + integrates into parent + adds functionality
- **Result**: New button appears in UI with working behavior

---

## 2. Feasibility Analysis

### What's Achievable (High Confidence)
| Capability | Confidence | Notes |
|------------|------------|-------|
| Right-click element capture | ✅ High | Standard browser extension APIs |
| Natural language → CSS diffs | ✅ High | LLMs excel at CSS/HTML generation |
| Natural language → JS event handlers | ✅ High | Well-established patterns |
| User approval workflow | ✅ High | Standard diff review pattern |
| Source file mapping (sourcemaps) | ✅ Medium | Requires dev server cooperation |
| Framework detection (React/Vue/Svelte) | ✅ Medium | Heuristics + package.json analysis |

### Challenging but Possible (Medium Confidence)
| Capability | Confidence | Challenges |
|------------|------------|------------|
| Multi-file coordinated changes | ⚠️ Medium | Frontend + backend sync, atomic commits |
| Accurate source location mapping | ⚠️ Medium | Minified prod builds lack sourcemaps |
| Complex state management changes | ⚠️ Medium | Redux/Zustand/context propagation |
| Cross-browser extension compatibility | ⚠️ Medium | Manifest V3 differences |

### Currently Unrealistic (Low Confidence)
| Capability | Reason |
|------------|--------|
| Fully autonomous (no user approval) | Safety/liability concerns |
| Database schema modifications | Requires migration tooling, ORM knowledge |
| Production website editing (Gmail, etc.) | Cross-origin restrictions, CSP |
| 100% accurate code generation | LLM hallucination risk |
| Real-time collaborative editing | Complex sync/conflict resolution |

---

## 3. Technical Architecture

### High-Level System Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER EXTENSION                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │  Content    │  │   Popup     │  │  Background │  │  DevTools │  │
│  │  Script     │  │   UI        │  │  Service    │  │  Panel    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │
│         │                │                │                │         │
└─────────┼────────────────┼────────────────┼────────────────┼─────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MIDDLEWARE LAYER                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Local Dev Server (Node.js) / Opencode CLI                  │   │
│  │  - Receives extension requests                              │   │
│  │  - Manages AI API communication                             │   │
│  │  - Handles file system operations (read/write diffs)        │   │
│  │  - Provides sourcemap resolution                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        AI LAYER                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Opencode   │  │   Claude    │  │  Local LLM  │                │
│  │  (Primary)  │  │   (Backup)  │  │  (Ollama)   │                │
│  └─────────────┘  └─────────────┘  └─────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SOURCE CODEBASE                                │
│  - React/Vue/Svelte components                                      │
│  - CSS/SCSS/Tailwind styles                                         │
│  - API routes / backend logic                                       │
│  - Configuration files                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Right-Click to Code Change

```
1. USER RIGHT-CLICKS ELEMENT
   │
   ▼
2. CONTENT SCRIPT CAPTURES:
   - DOM node (outerHTML, computed styles)
   - Element hierarchy (parent selectors)
   - Event listeners attached
   - Sourcemap data (if available)
   - Page URL + timestamp
   │
   ▼
3. POPUP UI OPENS:
   - Shows element preview
   - Text input: "What would you like to change?"
   - Pre-filled context (element type, classes, id)
   │
   ▼
4. USER SUBMITS INSTRUCTION:
   "Make this card look more modern with better spacing"
   │
   ▼
5. EXTENSION SENDS TO MIDDLEWARE:
   POST http://localhost:3000/api/ai/edit
   {
     "element": { html, styles, hierarchy, selectors },
     "instruction": "Make this card look more modern...",
     "context": {
       "url": "http://localhost:5174/integrations",
       "framework": "react",
       "projectRoot": "/Users/.../project",
       "sourcemaps": true
     }
   }
   │
   ▼
6. MIDDLEWARE:
   a) Resolves source file(s) via sourcemaps/grep
   b) Reads source file content
   c) Constructs AI prompt with full context
   d) Calls AI API
   │
   ▼
7. AI RETURNS STRUCTURED RESPONSE:
   {
     "changes": [
       {
         "file": "src/components/IntegrationCard.tsx",
         "type": "css",
         "diff": "...",
         "description": "Updated padding, border-radius, shadow"
       }
     ],
     "options": [
       { "id": "opt1", "description": "Modern card with subtle shadow", "preview": "..." },
       { "id": "opt2", "description": "Minimal card with border only", "preview": "..." }
     ],
     "followUpQuestions": []
   }
   │
   ▼
8. EXTENSION DISPLAYS OPTIONS:
   - Visual previews (iframe sandbox)
   - Code diffs for each option
   - "Apply" / "Modify" / "Reject" buttons
   │
   ▼
9. USER SELECTS OPTION → CONFIRMS
   │
   ▼
10. MIDDLEWARE APPLIES DIFF:
    - Validates diff (eslint, typescript check)
    - Writes to source file
    - Triggers HMR / live reload
    │
   ▼
11. USER SEES CHANGES INSTANTLY IN BROWSER
```

---

## 4. Key Technical Components

### 4.1 Browser Extension (Manifest V3)
- **Content Script**: Injected into all pages, captures right-click events, extracts DOM context
- **Popup UI**: Floating panel for user input, option selection, diff preview
- **Background Service Worker**: Manages WebSocket connection to middleware, handles auth
- **DevTools Panel** (optional): Advanced debugging, element inspection history

### 4.2 Middleware Server (Node.js/TypeScript)
- **Express/Fastify server** on localhost:3000
- **Endpoints**:
  - `POST /api/ai/edit` - Main edit request
  - `POST /api/ai/suggest` - Get multiple options
  - `POST /api/files/read` - Read source file
  - `POST /api/files/write` - Write diff (with validation)
  - `WS /api/live` - Real-time updates
- **Services**:
  - `SourcemapResolver`: Maps DOM elements → source files
  - `FrameworkDetector`: Identifies React/Vue/Svelte + version
  - `DiffValidator`: Runs eslint, prettier, tsc on proposed changes
  - `GitManager`: Creates commits, handles rollback

### 4.3 AI Integration Layer
- **Primary**: Opencode SDK / Claude API
- **Fallback**: Local Ollama (Llama 3.1, CodeLlama)
- **Prompt Templates**:
  - `UI_CRITIQUE`: "Analyze this component and suggest improvements"
  - `ADD_FUNCTIONALITY`: "Add event handler for [action]"
  - `ADD_ELEMENT`: "Create new component [description] and integrate at [location]"
- **Structured Output**: JSON with diffs, options, metadata

### 4.4 Source Code Operations
- **Read**: Full file content for context
- **Diff Generation**: Unified diff format
- **Validation Pipeline**:
  1. Syntax check (TypeScript/Babel parse)
  2. Lint (ESLint with project config)
  3. Type check (tsc --noEmit)
  4. Test run (optional, vitest/jest)
- **Apply**: Atomic write with backup + git commit

---

## 5. Example Workflows (Detailed)

### Workflow A: UI Critique & Iteration (Integrations Hub Card)
```
User: Right-clicks "bob-pr-reviewer" card → "This doesn't look good, suggest options"

System:
1. Captures: <div class="integration-card"> with Tailwind classes
2. Resolves: src/components/IntegrationCard.tsx (line 45-89)
3. AI Prompt includes: Full component code, Tailwind config, design system tokens
4. AI Returns 3 options:
   - Option A: "Elevated card with hover lift" (shadow-lg, transition-shadow)
   - Option B: "Bordered minimal card" (border, border-gray-200)
   - Option C: "Gradient accent card" (bg-gradient-to-r, from-blue-500)
5. User previews in sandbox iframe → Selects Option A
6. Diff applied → HMR updates browser → Card now has elevation
```

### Workflow B: Add API Call to Button (Automation Studio)
```
User: Right-clicks "Refine and Confirm" → "Call /api/refine on click, show loading state"

System:
1. Captures: <button class="btn-primary">Refine and Confirm</button>
2. Resolves: src/studio/RefineWorkflow.tsx (button at line 127)
3. Detects: React + React Query + existing API pattern
4. AI Generates:
   - New handler: handleRefine = async () => { setLoading(true); await api.refine(); }
   - Loading state: <Button disabled={loading}>...</Button>
   - Error toast integration
4. User reviews diff → Approves
5. Changes written → Button now functional
```

### Workflow C: Add New Button with Behavior
```
User: Right-clicks empty space in header → "Add 'Export PDF' button that downloads current view"

System:
1. Captures: Header container <header class="flex items-center gap-4">
2. Resolves: src/layout/Header.tsx
3. AI Generates:
   - New component: ExportButton.tsx (with pdf generation logic)
   - Import + integration in Header.tsx
   - Dependencies: @react-pdf/renderer or html2canvas
4. User approves → Files created/modified → Button appears in header
```

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AI generates invalid/broken code | High | High | Multi-stage validation (syntax → lint → type → test) |
| Sourcemaps unavailable (prod builds) | Medium | High | Fallback: grep for className/id, user manual selection |
| Framework detection fails | Medium | Medium | User override in settings, project config file |
| Cross-origin blocks extension | Low | High | Only enable on localhost/dev domains |
| Diff conflicts with concurrent edits | Medium | Medium | Git-based, show conflict resolution UI |
| AI suggests security vulnerabilities | Low | Critical | Blocklist dangerous patterns, security lint rules |
| Performance: slow AI responses | Medium | Medium | Streaming responses, caching, local LLM option |
| User loses trust after bad suggestions | Medium | High | Feedback loop, "thumbs down" trains better prompts |

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Time from right-click to diff preview | < 3 seconds |
| Diff application success rate | > 95% |
| User approval rate for AI suggestions | > 70% |
| False positive element selection | < 5% |
| Supported frameworks (Phase 1) | React, Vue 3, Svelte 4 |
| File types supported | .tsx, .vue, .svelte, .css, .scss, .ts |

---

## 8. Dependencies & Prerequisites

### User Environment
- Node.js 18+ project with dev server (Vite/Webpack/Next.js)
- Source maps enabled in development
- Git repository (for version control)
- Opencode/Claude API access (or local Ollama)

### Extension Permissions
- `activeTab` - Current page access
- `scripting` - Content script injection
- `nativeMessaging` - Optional, for local server communication
- Host permissions: `http://localhost:*`, `https://localhost:*`

---

*Document Version: 1.0*  
*Created: 2026-07-02*  
*Status: Draft for Review*