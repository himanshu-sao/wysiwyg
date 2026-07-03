// Shared types for the Chrome extension.
//
// NOTE: This is a deliberate copy of the canonical types in
// ../../middleware/src/shared/types.ts. The extension cannot import across
// the package boundary (it lives in extension/, the middleware in
// middleware/), and a shared workspace package wasn't set up. Keep these two
// files in sync when you change message/type contracts.

// Element context captured from the DOM
export interface ElementContext {
  html: string;
  computedStyles: Record<string, string>;
  classNames: string[];
  id?: string;
  hierarchy: string[]; // CSS selectors from element to body
  eventListeners: string[]; // e.g., ["click", "mouseenter"]
}

// Context sent with the edit request
export interface EditContext {
  url: string;
  framework: 'react' | 'vue' | 'svelte' | 'unknown';
  projectRoot: string;
  sourceFile?: string; // If resolved via sourcemap
  sourceLine?: number;
  sourceCode?: string; // Full file content
  packageJson?: any;
  tailwindConfig?: any;
}

// Request sent to /api/ai/edit
export interface EditRequest {
  element: ElementContext;
  instruction: string;
  context: EditContext;
}

// AI-generated option for a diff
export interface EditOption {
  id: string;
  description: string;
  diff: string; // Unified diff format
  previewHtml: string; // Full component HTML for iframe
  file: string; // Target file path
  type: 'css' | 'jsx' | 'template';
}

// Response from /api/ai/edit
export interface EditResponse {
  options: EditOption[];
  followUpQuestions?: string[];
  error?: string;
}

// Request to validate a modified file
export interface ValidateRequest {
  file: string;
  content: string;
}

// Lint/type error
export interface LintError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  rule: string;
}

// Response from /api/files/validate
export interface ValidateResponse {
  valid: boolean;
  errors: LintError[];
}

// Request to write a file
export interface WriteRequest {
  file: string;
  content: string;
  commitMessage: string;
  projectRoot?: string; // Optional: scope git ops to a specific project
}

// Message types for Chrome extension messaging.
// Synced with background.ts / popup / content-script — see POSTMVP_TODO.md P9.
export interface ExtensionMessage {
  type:
    | 'element-selected'
    | 'show-popup'
    | 'hide-popup'
    | 'get-current-element'
    | 'send-to-server'
    | 'send-streaming-to-server'
    | 'server-response'
    | 'server-error'
    | 'stream-progress'
    | 'ws-message'
    | 'ws-send'
    | 'apply-diff'
    | 'undo';
  data?: any;
  error?: string;
}
