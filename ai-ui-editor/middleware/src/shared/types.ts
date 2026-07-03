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
  // P7: sourcemap-resolution inputs sent by the content script. Middleware
  // resolves these to sourceFile/sourceLine/sourceCode before calling the AI.
  scriptUrl?: string; // originating <script src>, e.g. "/src/components/Card.tsx"
  generatedLine?: number; // 1-based line of the element in the served script
  generatedColumn?: number; // 1-based column in the served script
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
  // P7 / MVP-18: set when sourcemap resolution could NOT locate the source,
  // so the popup should prompt the user to pick a file manually.
  needsFileSelection?: boolean;
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
}

// Response from /api/files/write
export interface WriteResponse {
  success: boolean;
  commitHash?: string;
  error?: string;
}

// P7 / MVP-18: Request to read a file (so the popup can offer manual
// file-selection when sourcemap resolution fails).
export interface ReadRequest {
  file: string;
  projectRoot?: string;
}

// Response from /api/files/read
export interface ReadResponse {
  content: string;
  file: string;
  error?: string;
}

// Message types for Chrome extension messaging
export interface ExtensionMessage {
  type: 'element-selected' | 'show-popup' | 'hide-popup' | 'apply-diff' | 'undo';
  data?: any;
  error?: string;
}
