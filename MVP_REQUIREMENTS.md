# MVP Requirements: AI-Powered UI Editing Browser Extension

## Version: 1.0 (Phase 1)
## Target: Working end-to-end prototype in 2-3 weeks

---

## 1. MVP Scope Statement

**Goal**: Enable a developer to right-click any UI element in their local dev server, describe a visual/CSS change in natural language, review AI-generated options, and have the selected change applied to their source code with instant live reload.

**Out of Scope for MVP**:
- Adding new functional logic (API calls, event handlers)
- Creating new components/elements
- Backend/database changes
- Multi-file coordinated changes
- Production website editing
- Team collaboration features

---

## 2. Core Features (Must Have)

### 2.1 Element Selection & Context Capture
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-01 | Right-click context menu on any element | Custom "Edit with AI" menu item appears on right-click |
| MVP-02 | Capture element HTML + computed styles | `outerHTML`, `getComputedStyle()`, all classNames, IDs |
| MVP-03 | Capture element hierarchy | Parent chain up to `<body>` with selectors |
| MVP-04 | Detect project framework | Read package.json, detect React/Vue/Svelte + version |
| MVP-05 | Resolve source file via sourcemaps | Map DOM element → source file:line (Vite/Webpack) |

### 2.2 Natural Language Input & AI Interaction
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-06 | Floating input panel | Appears near clicked element, accepts text input |
| MVP-07 | Pre-filled context hint | Shows "Editing: .card.primary (src/Card.tsx:42)" |
| MVP-08 | Send to AI with full context | POST to localhost:3000/api/ai/edit with element + instruction |
| MVP-09 | Receive structured AI response | JSON with `options[]` (description, diff, preview HTML) |
| MVP-10 | Display 2-3 visual options | Render each option in sandboxed iframe preview |

### 2.3 Review & Apply Workflow
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-11 | Side-by-side diff view | Original vs. proposed code for each option |
| MVP-12 | One-click apply | "Apply" button writes diff to source file |
| MVP-13 | Validation before write | Run eslint + tsc --noEmit on modified file |
| MVP-14 | Git commit on apply | Auto-commit with message "AI: [instruction]" |
| MVP-15 | Live reload verification | Browser updates via HMR within 2 seconds |

### 2.4 Error Handling & Feedback
| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| MVP-16 | AI failure handling | Show error, allow retry with modified instruction |
| MVP-17 | Validation failure | Show lint/type errors, allow manual fix or retry |
| MVP-18 | Sourcemap failure fallback | "Could not locate source. Select file manually?" |
| MVP-19 | Undo last change | "Undo" button reverts last git commit |

---

## 3. Technical Stack (MVP)

| Layer | Technology | Version |
|-------|------------|---------|
| Extension | Chrome Extension Manifest V3 | - |
| Content Script | TypeScript + vanilla DOM APIs | - |
| Popup UI | React 18 + Tailwind CSS | - |
| Middleware | Node.js 20 + Fastify | - |
| AI Client | NVIDIA NIM (OpenAI-compatible SDK) | meta/llama-3.1-70b-instruct (default) |
| AI Fallback | Mock responses (when API key unset) | Built-in mock |
| File Ops | Node.js fs/promises + simple-git | - |
| Validation | ESLint + TypeScript CLI | Project config |
| Sourcemaps | source-map package + custom resolver | Real Vite/Webpack sourcemap resolution (MVP-05/18) |

---

## 4. Project Structure (MVP)

```
ai-ui-editor/
├── extension/                 # Chrome Extension
│   ├── manifest.json
│   ├── content-script.ts      # DOM capture, right-click handler
│   ├── popup/                 # React UI for input/options
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── styles.css
│   ├── background.ts          # Service worker, WS connection
│   └── devtools/              # Optional panel
│
├── middleware/                # Local Dev Server
│   ├── package.json
│   ├── src/
│   │   ├── server.ts          # Fastify server
│   │   ├── routes/
│   │   │   ├── ai.ts          # /api/ai/*
│   │   │   ├── files.ts       # /api/files/*
│   │   │   └── ws.ts          # WebSocket
│   │   ├── services/
│   │   │   ├── SourcemapResolver.ts
│   │   │   ├── FrameworkDetector.ts
│   │   │   ├── DiffValidator.ts
│   │   │   └── GitManager.ts
│   │   ├── ai/
│   │   │   ├── OpencodeClient.ts
│   │   │   ├── PromptTemplates.ts
│   │   │   └── ResponseParser.ts
│   │   └── config.ts
│   └── tsconfig.json
│
├── shared/                    # Shared types
│   └── types.ts
│
└── package.json               # Root workspace
```

---

## 5. API Contracts (MVP)

### POST /api/ai/edit
**Request**:
```typescript
interface EditRequest {
  element: {
    html: string;
    computedStyles: Record<string, string>;
    classNames: string[];
    id?: string;
    hierarchy: string[];  // CSS selectors from element to body
    eventListeners: string[];  // e.g., ["click", "mouseenter"]
  };
  instruction: string;
  context: {
    url: string;
    framework: 'react' | 'vue' | 'svelte' | 'unknown';
    projectRoot: string;
    sourceFile?: string;  // If resolved via sourcemap
    sourceLine?: number;
    sourceCode?: string;  // Full file content
    packageJson: object;
    tailwindConfig?: object;
  };
}
```

**Response**:
```typescript
interface EditResponse {
  options: Array<{
    id: string;
    description: string;
    diff: string;  // Unified diff format
    previewHtml: string;  // Full component HTML for iframe
    file: string;  // Target file path
    type: 'css' | 'jsx' | 'template';
  }>;
  followUpQuestions?: string[];
  error?: string;
}
```

### POST /api/files/validate
**Request**: `{ file: string; content: string }`
**Response**: `{ valid: boolean; errors: LintError[] }`

### POST /api/files/write
**Request**: `{ file: string; content: string; commitMessage: string }`
**Response**: `{ success: boolean; commitHash?: string }`

---

## 6. AI Prompt Template (MVP)

```markdown
You are an expert frontend developer. The user wants to modify a UI element.

## Element Context
- HTML: {{element.html}}
- Computed Styles: {{element.computedStyles}}
- Classes: {{element.classNames}}
- Hierarchy: {{element.hierarchy}}
- Framework: {{context.framework}}
- Target File: {{context.sourceFile}} (line {{context.sourceLine}})

## Current Source Code
```{{context.framework}}
{{context.sourceCode}}
```

## User Instruction
"{{instruction}}"

## Task
Generate 2-3 distinct CSS/styling options that address the user's request. Each option must:
1. Be a valid unified diff for the target file
2. Include a complete preview HTML (with all styles inlined) for sandbox rendering
3. Follow the project's existing patterns (Tailwind, CSS modules, etc.)
4. Only modify visual/CSS properties - NO functional changes

## Output Format (JSON)
{
  "options": [
    {
      "id": "opt1",
      "description": "Brief description",
      "diff": "@@ -10,7 +10,7 @@\n- className=\"card\"\n+ className=\"card shadow-lg hover:shadow-xl transition-shadow\"",
      "previewHtml": "<div class=\"card shadow-lg...\">...</div>",
      "file": "src/components/Card.tsx",
      "type": "jsx"
    }
  ]
}
```

---

## 7. Success Criteria (Definition of Done)

| Criterion | Metric | Verification |
|-----------|--------|--------------|
| **End-to-end flow works** | Right-click → instruction → preview → apply → see change | Manual test on sample React project |
| **Response time** | < 3s from instruction to options displayed | Stopwatch test (10 iterations) |
| **Diff accuracy** | > 90% of applied diffs compile without errors | Automated test suite |
| **Source mapping** | > 80% of elements resolve to correct file:line | Test on 5 components |
| **Framework support** | Works on React + Vite project | Test on created sample app |
| **No data loss** | Git history preserves all changes | Verify git log after 20 edits |
| **User experience** | Non-technical user can make 3 changes in 5 min | Usability test |

---

## 8. Sample Test Project

Create a minimal React + Vite + Tailwind project with:
- `src/components/Card.tsx` - Multiple card variants
- `src/components/Button.tsx` - Button with variants
- `src/pages/Integrations.tsx` - List of integration cards
- `src/pages/AutomationStudio.tsx` - Workflow buttons

Use this for all MVP development and testing.

---

## 9. Timeline (Estimated)

| Week | Milestone |
|------|-----------|
| 1 | Extension skeleton + content script + middleware server |
| 2 | AI integration + prompt engineering + diff validation |
| 3 | Popup UI + preview iframes + apply workflow + git integration |
| 3-4 | Testing on sample project + bug fixes + documentation |

---

## 10. Out of Scope (Explicitly Deferred)

- [ ] Adding new functional code (event handlers, API calls)
- [ ] Creating new components/files
- [ ] Multi-file changes (e.g., component + CSS file)
- [ ] Backend/API route modifications
- [ ] Database/schema changes
- [ ] Production website support
- [ ] Team/sharing features
- [ ] Local LLM as primary (only fallback)
- [ ] DevTools panel
- [ ] Keyboard shortcuts
- [ ] History/timeline UI
- [ ] Export/import of edit sessions

---

*Document Version: 1.0*  
*Created: 2026-07-02*  
*Status: Approved for Implementation*