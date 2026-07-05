# AI UI Editor

A Chrome extension that enables developers to right-click any UI element, describe a visual/CSS change in natural language, and have AI-generated options applied to their source code with instant live reload.

## AI Integration

The middleware uses **NVIDIA NIM API** to generate AI-powered edit options:

- **API**: NVIDIA NIM (OpenAI-compatible)
- **Base URL**: `https://integrate.api.nvidia.com/v1`
- **Model**: `meta/llama-3.1-70b-instruct` by default (change via `NVIDIA_MODEL`)
- **Response Validation**: Zod schema validation ensures structured JSON output
- **Retry Logic**: Automatic retries with exponential backoff on rate limits (429) or server errors (503, 408)
- **Fallback**: Mock responses when API key is not configured (for testing)

### Available Models

NVIDIA NIM provides access to multiple models:

| Model | Description |
|-------|-------------|
| `meta/llama-3.1-70b-instruct` | Default model (balanced performance/cost) |
| `meta/llama-3.1-405b-instruct` | Meta Llama 3.1 405B (highest quality) |
| `anthropic/claude-sonnet-4-20250514` | Claude Sonnet 4 |
| `anthropic/claude-3.5-sonnet` | Claude 3.5 Sonnet |
| `mistralai/mistral-large-2-instruct` | Mistral Large 2 |
| `google/gemma-2-9b-it` | Google Gemma 2 |

Change the model via `NVIDIA_MODEL` environment variable.

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

- **Right-click to edit**: Context menu on any DOM element
- **Natural language input**: Describe visual changes in plain English
- **AI-generated options**: Get 2-3 distinct CSS/styling options
- **Side-by-side diff**: Review changes before applying
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
│   ├── manifest.json          # Extension manifest
│   ├── content-script.ts      # DOM capture, context menu
│   ├── background.ts          # Service worker, message handling
│   ├── popup/                 # React UI
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── styles.css
│   └── dist/                  # Built extension
│
├── middleware/                # Local Dev Server
│   ├── src/
│   │   ├── server.ts          # Fastify server
│   │   ├── routes/            # API routes
│   │   │   ├── ai.ts          # /api/ai/edit
│   │   │   ├── files.ts       # /api/files/*
│   │   │   ├── ws.ts          # WebSocket
│   │   │   └── git.ts         # /api/git/undo
│   │   ├── services/          # Business logic
│   │   │   ├── DiffValidator.ts
│   │   │   ├── GitManager.ts
│   │   │   └── FrameworkDetector.ts
│   │   └── ai/                # AI integration
│   │       ├── OpencodeClient.ts
│   │       └── PromptTemplates.ts
│   └── package.json
│
├── shared/                    # Shared types
│   └── types.ts
│
└── sample-project/            # Test React app
    ├── src/
    │   ├── components/        # Card, Button
    │   └── pages/             # Integrations, AutomationStudio
    └── package.json
```

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

### POST /api/files/validate

Validate a file for lint/type errors.

### POST /api/files/write

Write changes to a file and auto-commit.

### POST /api/git/undo

Revert the last git commit.

## Limitations (MVP)

- **CSS/Visual changes only**: No functional code modifications
- **Single-file changes**: Each edit modifies one file
- **React focus**: Best support for React + Vite projects
- **Manual extension rebuild**: Extension requires `npm run build` after code changes

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
