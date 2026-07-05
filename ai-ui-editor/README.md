# AI UI Editor

A Chrome extension + local middleware that serves as an **AI-driven prompt generator with access to the running UI.** You right-click any UI element, describe a change in natural language, and wysiwyg turns the captured UI context + the target project's conventions into a high-quality instruction. It has **two modes**:

- **Edit mode** — AI generates a code diff (CSS/visual today) and applies it to source with validate-before-write, git auto-commit, and one-click undo.
- **Export mode** — AI generates a structured spec and writes it back into the target project's own backlog conventions (e.g. `ideas.md` + `requirements/ID-XXX/spec.md`) for a downstream AI/human to act on.

**Multi-project is core:** the user registers a project by its on-disk path; wysiwyg learns its structure/conventions (via a Project Profile System) and persists it. `antikythera` is the first example profile — not the purpose of wysiwyg. See the root [`README.md`](README.md) and [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) for the full framing, and [`TODO.md`](TODO.md) for the active roadmap (Requirements Bridge Phase 1).

## AI Integration

The middleware uses **NVIDIA NIM API** to generate AI-powered edit options:

- **API**: NVIDIA NIM (OpenAI-compatible)
- **Base URL**: `https://integrate.api.nvidia.com/v1`
- **Model**: `meta/llama-3.1-70b-instruct` by default (change via `NVIDIA_MODEL`)
- **Response Validation**: Zod schema validation ensures structured JSON output
- **Retry Logic**: Automatic retries with exponential backoff on rate limits (429) or server errors (503, 408)
- **Fallback**: Mock responses when API key is not configured (for testing)

### Available Models

NVIDIA NIM provides access to multiple models. This list mirrors `middleware/src/ai/OpencodeClient.ts` (the file is named `OpencodeClient.ts` historically but wraps NVIDIA NIM via the OpenAI-compatible SDK):

| Model | Description |
|-------|-------------|
| `meta/llama-3.1-70b-instruct` | **Default** (set via `NVIDIA_MODEL`; balanced performance/cost) |
| `anthropic/claude-sonnet-4-20250514` | Claude Sonnet 4 (via NIM) |
| `meta/llama-3.1-405b-instruct` | Meta Llama 3.1 405B (highest quality) |
| `google/gemma-2-9b-it` | Google Gemma 2 |
| `mistralai/mistral-large-2-instruct` | Mistral Large 2 |

Change the model via the `NVIDIA_MODEL` environment variable. (If you add a row here, add it in `OpencodeClient.ts` too — keep the doc and the code's model list in lockstep.)

### AI Response Format

The AI returns structured JSON with:

```json
{
  "options": [
    {
      "id": "opt1",
      "description": "Change background color to blue",
      "diff": "@@ -1,7 +1,7 @@\n- className=\"bg-white\"\n+ className=\"bg-blue-100\"",
      "previewHtml": "<div class=\"bg-blue-100\">...</div>",
      "file": "src/components/Card.tsx",
      "type": "jsx"
    }
  ],
  "followUpQuestions": ["Did you mean to also add hover state?"]
}
```

### Error Handling

- **Rate Limits**: Retries up to 3 times with 1s, 2s, 3s delays
- **Parse Failures**: Falls back to mock responses
- **API Errors**: Returns user-friendly error messages to the extension
- **Invalid Key**: Logs error and falls back to mock responses

## Features

- **Right-click to edit**: Context menu on any DOM element (Edit mode) **or to export** a structured spec (Export mode)
- **Two output modes**: Edit (apply a code diff) and Export (write a spec into the target project's backlog)
- **Natural language input**: Describe changes in plain English
- **AI-generated options**: Get 2-3 distinct options (Edit) or a structured spec overview/requirements/test-scenarios/edge-cases (Export)
- **Side-by-side diff**: Review changes before applying
- **Real token streaming**: Options render progressively as the AI streams
- **Sandboxed previews**: `previewHtml` is sanitized (scripts/event-handlers/dangerous URLs stripped) and rendered in a locked-down iframe
- **Project Profile System**: built-in `antikythera` + `generic` profiles; more profiles via the registry (P1-0, in progress)
- **Auto-commit**: Git integration with automatic commits
- **Undo support**: Revert last change with one click
- **Live reload**: Changes appear instantly via HMR

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Chrome         │     │  Middleware     │     │  Sample         │
│  Extension      │────▶│  Server         │────▶│  Project        │
│                 │◀────│  (Fastify)      │◀────│  (Vite)         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Project Structure

```
ai-ui-editor/
├── extension/                 # Chrome Extension
│   ├── manifest.json          # Extension manifest (storage permission for the registry)
│   ├── content-script.ts      # DOM capture, context menu (projectRoot placeholder → P1-0)
│   ├── background.ts          # Service worker, message handling
│   ├── popup/                 # React UI
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── styles.css
│   ├── devtools/              # DevTools panel (in progress — see TODO.md Phase 2-3)
│   ├── __tests__/             # Vitest tests (e.g. popup.requirements.test.ts)
│   └── dist/                  # Built extension
│
├── middleware/                # Local Dev Server
│   ├── src/
│   │   ├── server.ts          # Fastify server
│   │   ├── routes/            # API routes
│   │   │   ├── ai.ts          # /api/ai/edit, /api/ai/edit/stream, /api/ai/export-requirements
│   │   │   ├── files.ts       # /api/files/{validate,write}  (P1-6 will add /append-ideas here)
│   │   │   ├── ws.ts          # WebSocket (/ws/connect)
│   │   │   └── git.ts         # /api/git/undo
│   │   ├── services/          # Business logic
│   │   │   ├── DiffValidator.ts   # TypeScript programmatic API + oxlint (P6)
│   │   │   ├── GitManager.ts
│   │   │   ├── SourcemapResolver.ts    # real Vite/Webpack .map parsing (P7)
│   │   │   └── (PathSanitizer.ts) # path-traversal guard for write endpoints (P4)
│   │   ├── ai/                # AI integration
│   │   │   ├── OpencodeClient.ts      # wraps NVIDIA NIM (OpenAI-compatible) — name is historical
│   │   │   ├── PromptTemplates.ts     # edit + requirements (getRequirementsPrompt) prompts
│   │   │   └── ResponseParser.ts
│   │   ├── config/            # Project Profile System (P1-1)
│   │   │   └── project-profiles.ts    # built-in antikythera + generic profiles, detect/getProfile
│   │   └── shared/types.ts    # mirrored with extension/shared/types.ts — keep in lockstep
│   ├── __tests__/             # Vitest tests (e.g. ProjectProfiles.test.ts, PromptTemplates.requirements.test.ts)
│   └── package.json
│
├── shared/                    # Shared types (also mirrored at extension/shared/types.ts)
│   └── types.ts
│
└── sample-project/            # Test target app (the thing you right-click into) — React + Vite + Tailwind on :5174
    ├── src/
    │   ├── components/        # Card, Button
    │   └── pages/             # Integrations, AutomationStudio
    └── package.json
```

> Note: `extension/shared/types.ts` and `middleware/src/shared/types.ts` are **manually
> mirrored** — the extension can't import across the package boundary. Any new request/response
> type added in one must be added to the other in the same change. (See `TODO.md` Conventions.)

## Setup

### Prerequisites

- Node.js 20+
- Chrome/Chromium browser
- Git
- NVIDIA NIM API Key (get from https://build.nvidia.com/ - free tier available)

### Install Dependencies

```bash
# Root
cd ai-ui-editor
npm install

# Middleware
cd middleware
npm install

# Extension
cd extension
npm install

# Sample project
cd sample-project
npm install
```

### Configure Environment Variables

Create a `.env` file in the `middleware` directory:

```bash
cd middleware
cp .env.example .env
```

Edit `.env` and add your NVIDIA NIM API key:

```
NVIDIA_API_KEY=nvapi-your_api_key_here
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

> **Note**: Without an API key, the system will fall back to mock responses for testing.

**Get API Key**: Visit https://build.nvidia.com/ to get your free API key. NVIDIA NIM provides generous free tier limits for development.

### Start Development Servers

You can use the provided shell scripts to manage the servers:

```bash
# Start both servers
./start.sh

# Stop both servers
./stop.sh

# Restart both servers
./restart.sh

# Validate setup and server health
./validate.sh
```

Or start them manually:

```bash
# Terminal 1: Middleware server
cd middleware
npm run dev

# Terminal 2: Sample project
cd sample-project
npm run dev
```

### Load Extension in Chrome

1. Build the extension:
   ```bash
   cd extension
   npm run build
   ```

2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `ai-ui-editor/extension/dist` folder
6. The extension icon should appear in your toolbar

## Usage

1. **Navigate to a local development server** (e.g., http://localhost:5174)
2. **Right-click any UI element** to open the context menu
3. **Select "Edit with AI"**
4. **Enter your instruction** (e.g., "Make the button blue", "Add more padding", "Increase shadow")
5. **Review the AI-generated options** with diff previews
6. **Click "Apply"** to write the change to source
7. **See the change live** via hot module reload
8. **Use "Undo"** to revert the last change if needed

### Example Instructions

- "Make the background blue"
- "Add more padding"
- "Increase the shadow"
- "Make the text larger"
- "Round the corners more"
- "Add a border"

## API Reference

### POST /api/ai/edit

Generate AI-powered edit options for a UI element.

**Request:**
```typescript
{
  element: {
    html: string;
    computedStyles: Record<string, string>;
    classNames: string[];
    hierarchy: string[];
    eventListeners: string[];
  };
  instruction: string;
  context: {
    url: string;
    framework: 'react' | 'vue' | 'svelte';
    projectRoot: string;
    sourceFile?: string;
    sourceCode?: string;
  };
}
```

**Response:**
```typescript
{
  options: Array<{
    id: string;
    description: string;
    diff: string;
    previewHtml: string;
    file: string;
    type: 'css' | 'jsx' | 'template';
  }>;
}
```

### POST /api/ai/edit/stream

Like `/api/ai/edit`, but streams options to the client token-by-token as the AI generates them (real token streaming, P8). The popup renders the live token buffer. Same request/response shape as `/edit`; transport is the WebSocket at `/ws/connect` (the client posts the EditRequest and receives incremental `token` → `options` messages with an `onProgress` callback).

### POST /api/ai/export-requirements

**Export mode.** Generate a structured spec from a captured element + a user instruction describing *what should change*, for a downstream agent/human to act on. Auto-detects the project profile if not specified (`P1-3`).

**Request (sketch — see `ai.ts` + `shared/types.ts` for the canonical schema):**
```typescript
{
  element: ElementContext;      // same capture shape as /edit
  instruction: string;          // what should this element/screen do, and why it's wrong now
  context: { url: string; framework: string; projectRoot: string; /* profile, source... */ };
}
```
**Response (sketch):**
```typescript
{
  spec: string;                 // structured markdown: overview, functional/non-functional reqs,
                                // files to modify, test scenarios, edge cases, acceptance criteria
  architectureHints?: string[];
  testScenarios?: string[];
  edgeCases?: string[];
  error?: string;
}
```
> The `append-ideas` step — writing `spec` into the project's `ideas.md` + `requirements/ID-XXX/spec.md` — is **P1-6**, blocked on P1-0 (project registry); see [`TODO.md`](TODO.md). Not yet built.

### POST /api/files/validate

Validate a file for lint/type errors.

### POST /api/files/write

Write changes to a file and auto-commit.

### POST /api/git/undo

Revert the last git commit.

## Current scope (MVP, deliberate — not permanent limitations)

These are scope *choices* for the current phase (see [`TODO.md`](TODO.md) Phase 1 and [`VISION_REQUIREMENTS.md`](VISION_REQUIREMENTS.md) for the deferred north star):

- **Edit mode is CSS/visual only**: no functional code modifications (event handlers, API calls, new components) in Edit mode. (Export mode *describes* functional intent as a spec instead.)
- **Single-file edits**: each Edit-mode change modifies one file (multi-file coordination is deferred).
- **Best support is React + Vite**: other frameworks detected but less exercised (`generic` profile).
- **Manual extension rebuild**: extension requires `npm run build` after code changes.
- **`projectRoot` is currently `window.location.origin`** (a URL placeholder): real on-disk project registration is **P1-0**, the active work item.

## Troubleshooting

### Extension doesn't appear in Chrome
- Ensure you built the extension: `npm run build`
- Check `chrome://extensions/` for errors
- Reload the extension if needed

### No AI options generated
- Verify middleware server is running on port 3000
- Check browser console for errors
- Review middleware logs

### Changes don't apply
- Ensure the sample project is in a git repository
- Verify file paths are correct
- Check for lint/type errors in the diff

## Development

### Build All

```bash
# Build extension
cd extension && npm run build

# Build middleware
cd middleware && npm run build
```

### Test End-to-End

1. Start middleware: `cd middleware && npm run dev`
2. Start sample: `cd sample-project && npm run dev`
3. Load extension in Chrome
4. Navigate to http://localhost:5174
5. Right-click an element and test the flow

## License

MIT
