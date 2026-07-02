""" Shared types for the middleware server """

// EditRequest: Sent by the Chrome extension to request an AI-powered edit
export interface EditRequest {
    domElementId: string; // ID of the DOM element to edit
    userPrompt: string; // User's edit request (e.g., "Make this button larger")
    framework?: string; // Optional framework hint (React/Vue/Svelte)
    filePath?: string; // Optional file path hint
    lineNumber?: number; // Optional line number hint
}

// EditResponse: Sent by the server in response to an EditRequest
export interface EditResponse {
    success: boolean;
    message: string;
    edits: FileEdit[]; // List of edits to apply
    options?: EditOption[]; // Optional: Alternative edits to suggest
}

// FileEdit: Represents a single edit to a file
export interface FileEdit {
    filePath: string;
    lineNumber: number;
    oldContent: string;
    newContent: string;
    description: string; // Description of the change
}

// EditOption: Alternative edit suggestions
export interface EditOption {
    title: string;
    description: string;
    edits: FileEdit[];
}

// ValidationRequest: Sent to validate edits before applying
export interface ValidationRequest {
    edits: FileEdit[];
}

// ValidationResponse: Response from the validation service
export interface ValidationResponse {
    success: boolean;
    message: string;
    errors: ValidationError[];
}

// ValidationError: Represents a validation error
export interface ValidationError {
    filePath: string;
    lineNumber: number;
    message: string;
    severity: 'error' | 'warning';
}

// WriteRequest: Sent to apply validated edits to files
export interface WriteRequest {
    edits: FileEdit[];
    commitMessage: string; // Git commit message
}

// WriteResponse: Response from the write service
export interface WriteResponse {
    success: boolean;
    message: string;
    commitHash?: string; // Git commit hash if successful
}