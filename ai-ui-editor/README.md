# AI UI Editor

A Chrome extension that enables developers to right-click any UI element, describe a visual/CSS change in natural language, and have AI-generated options applied to their source code with instant live reload.

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
- **Mock AI**: Currently uses mock responses; Opencode SDK integration pending
- **Manual extension reload**: Extension requires rebuild after code changes

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
