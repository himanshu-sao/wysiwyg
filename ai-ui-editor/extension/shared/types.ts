// Shared types for the Chrome extension.
//
// NOTE: This is a deliberate copy of the canonical types in
// ../../middleware/src/shared/types.ts. The extension cannot import across
// the package boundary (it lives in extension/, the middleware in
// middleware/), and a shared workspace package wasn't set up. Keep these two
// files in sync when you change message/type contracts — they MUST export the
// same set of types. There is a lockstep test in
// middleware/__tests__/typesMirror.test.ts that asserts the exported type-name
// sets match; keep it green when you add/remove a type.

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
  // P7: sourcemap-resolution inputs sent to the middleware. Set the originating
  // <script> src here; the middleware resolves sourceFile/sourceLine/sourceCode.
  scriptUrl?: string; // e.g. "/src/components/Card.tsx"
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
  // P3/P7: when sourcemap resolution succeeds, include the resolved source code
  // so the popup can apply diffs correctly. If absent, popup should fetch via
  // /api/files/read using option.file before applying.
  resolvedSourceCode?: string;
  resolvedFilePath?: string;
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

// P1-6: Response from /api/files/write. Mirrors the middleware WriteResponse
// (keep the two shared/types.ts files in sync).
export interface WriteResponse {
  success: boolean;
  commitHash?: string;
  error?: string;
}

// P7 / MVP-18: Request to read a file (so the popup can offer manual
// file-selection when sourcemap resolution fails). Mirrors the middleware
// ReadRequest.
export interface ReadRequest {
  file: string;
  projectRoot?: string;
}

// P7 / MVP-18: Response from /api/files/read. Mirrors the middleware ReadResponse.
export interface ReadResponse {
  content: string;
  file: string;
  error?: string;
}

// P1-3: Request to /api/ai/export-requirements. Mirrors the middleware
// RequirementsExportRequest so the popup can build a type-safe request body.
export interface RequirementsExportRequest {
  element: ElementContext;
  instruction: string;
  context: EditContext;
  projectProfile?: 'example' | 'generic';
}

// Message types for Chrome extension messaging.
// Synced with actual usage in background.ts / popup / content-script (P9).
// Incoming (popup → background): get-current-element, send-to-server, send-streaming-to-server, ws-send,
//   registry-add, registry-list, registry-select-active, registry-clear-override
// Outgoing (background → popup): show-popup, server-response, server-error, stream-progress, ws-message,
//   capture-element, registry-state, registry-error
// P1-2: Added mode field for distinguishing css-edit vs requirements-export
// P1-0: Added registry-* message types for the project registry handshake.
export interface ExtensionMessage {
  type:
    | 'show-popup'
    | 'get-current-element'
    | 'send-to-server'
    | 'send-streaming-to-server'
    | 'server-response'
    | 'server-error'
    | 'stream-progress'
    | 'ws-message'
    | 'ws-send'
    | 'capture-element'
    | 'mode-changed'
    | 'registry-add'
    | 'registry-list'
    | 'registry-select-active'
    | 'registry-clear-override'
    | 'registry-state'
    | 'registry-error';
  data?: any;
  error?: string;
  mode?: 'css-edit' | 'requirements-export';
  // P1-0: registry payloads. `origin` is the page origin to key an active project
  // against; `path`/`profileName`/`displayName` describe a project to register.
  origin?: string;
  path?: string;
  profileName?: string;
  displayName?: string;
}

// P1-2: Mode type for distinguishing edit vs export flows
export type ExtensionMode = 'css-edit' | 'requirements-export';

// P1-6: AI-suggested priority for an exported requirement (user-overridable).
export type RequirementPriority = 'High' | 'Medium' | 'Low';

// P1-6: Request to POST /api/files/append-ideas — write the AI-generated spec
// into the active project's backlog per its profile conventions. Mirrors the
// middleware AppendIdeasRequest (keep the two shared/types.ts files in sync).
export interface AppendIdeasRequest {
  spec: string;
  title?: string;
  priority: RequirementPriority;
  architectureHints: string[];
  testScenarios: string[];
  edgeCases: string[];
  element?: ElementContext;
  instruction: string;
  projectRoot: string;
  projectProfile?: 'example' | 'generic';
}

// P1-6: Response from POST /api/files/append-ideas.
export interface AppendIdeasResponse {
  success: boolean;
  id?: string;
  ideasLine?: string;
  specPath?: string;
  error?: string;
}

// P1-3/P1-6: Response from /api/ai/export-requirements. Mirrors the middleware
// RequirementsExportResponse so the popup can read title/priority/type safely.
export interface RequirementsExportResponse {
  spec: string;
  architectureHints: string[];
  testScenarios: string[];
  edgeCases: string[];
  title?: string;
  priority?: RequirementPriority;
  error?: string;
}

// P1-0: Project Registry — the user-registered on-disk project paths.
//
// wysiwyg works across multiple projects. The user registers a project by its
// absolute on-disk path; that path becomes the authoritative `projectRoot` for
// both edit and export modes (replacing the `window.location.origin` placeholder).
//
// The registry is keyed by page origin (per-origin active project) with an optional
// global override that forces one project active across all origins.

// P1-0: Response from /api/files/probe-root. The extension calls this during
// "Add project" to validate an on-disk path looks like a project root before
// accepting it into the registry (the extension cannot read disk itself).
// Mirrors the middleware ProbeRootResponse (keep the two shared/types.ts in sync).
export interface ProbeRootResponse {
  valid: boolean;            // true iff a project marker was found at/under the path
  exists: boolean;           // true iff the path itself exists on disk
  marker: string | null;     // which marker file was found, e.g. "package.json"
  isAbsolute: boolean;       // echo of the input check
  error?: string;
}

// A single registered project. Persisted in chrome.storage.local.
export interface RegisteredProject {
  id: string;            // stable id (origin/path-derived), for selection
  path: string;          // absolute on-disk path — the projectRoot sent to middleware
  profileName: string;   // built-in profile hint ('example' | 'generic' | '<name>')
  displayName: string;   // user-facing label (defaults to basename of path)
  registeredAt: number;  // unix ms
}

// Shape persisted in chrome.storage.local under the registry key.
export interface ProjectRegistryState {
  projects: RegisteredProject[];   // all registrations (stable list)
  activeByOrigin: Record<string, string>;  // origin -> project id
  globalActiveId?: string;         // when set, overrides activeByOrigin for all origins
}

// Storage adapter contract — injected so the pure registry logic is testable
// without chrome.storage. background.ts supplies a chrome.storage.local adapter.
export interface RegistryStorage {
  get(): Promise<ProjectRegistryState | null>;
  set(state: ProjectRegistryState): Promise<void>;
}

