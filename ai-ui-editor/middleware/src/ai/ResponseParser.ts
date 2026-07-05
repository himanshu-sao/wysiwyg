import { z } from 'zod';
import { EditOption } from '../shared/types';

// Zod schema for validating AI response structure
const EditOptionSchema = z.object({
  id: z.string().min(1, 'Option ID must not be empty'),
  description: z.string().min(1, 'Description must not be empty'),
  diff: z.string().refine(
    (val) => val.includes('@@') || val.includes('-') || val.includes('+'),
    'Diff must contain unified diff markers (@@, -, or +)'
  ),
  previewHtml: z.string().min(1, 'Preview HTML must not be empty'),
  file: z.string().min(1, 'File path must not be empty'),
  type: z.enum(['css', 'jsx', 'template']),
});

const EditResponseSchema = z.object({
  options: z.array(EditOptionSchema).min(1, 'At least one option must be provided'),
  followUpQuestions: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type ValidatedEditResponse = z.infer<typeof EditResponseSchema>;

/**
 * Validates and parses AI response into structured EditOption[]
 * @param rawResponse - Raw JSON string from AI
 * @returns Validated response or error details
 */
export function parseEditResponse(rawResponse: string):
  | { success: true; data: ValidatedEditResponse }
  | { success: false; error: string; details?: any } {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(rawResponse);

    // Validate against schema
    const result = EditResponseSchema.safeParse(parsed);

    if (!result.success) {
      const errorMessages = result.error.issues
        .map((e: any) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');

      return {
        success: false,
        error: `Validation failed: ${errorMessages}`,
        details: parsed,
      };
    }

    return { success: true, data: result.data };
  } catch (parseError: any) {
    return {
      success: false,
      error: `JSON parse failed: ${parseError.message}`,
      details: rawResponse.substring(0, 500),
    };
  }
}

/**
 * Extracts code block from markdown if AI wraps response in ```json
 * @param content - Raw AI response content
 * @returns Cleaned JSON string
 */
export function extractJsonFromMarkdown(content: string): string {
  // Match ```json ... ``` or ``` ... ```
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object anywhere in the content
  const jsonMatch = content.match(/\{[\s\S]*"options"[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Return as-is if no extraction needed
  return content.trim();
}

/**
 * Converts validated response to EditOption[] for the API
 */
export function toEditOptions(response: ValidatedEditResponse): EditOption[] {
  return response.options.map(opt => ({
    id: opt.id,
    description: opt.description,
    diff: normalizeDiff(opt.diff),
    previewHtml: opt.previewHtml,
    file: opt.file,
    type: opt.type,
  }));
}

/**
 * Normalizes diff format to ensure unified diff compatibility
 */
function normalizeDiff(diff: string): string {
  // Ensure diff starts with @@ marker if it doesn't
  if (!diff.startsWith('@@')) {
    const lines = diff.split('\n');
    let hasContent = false;

    // Check if it's a simple replacement format
    if (lines.some(l => l.startsWith('-') || l.startsWith('+'))) {
      // Add a header if missing
      return `@@ -1,1 +1,1 @@\n${diff}`;
    }
  }

  return diff;
}

/**
 * Sanitize an AI-returned file path into a safe *project-relative* path.
 *
 * THREAT MODEL (GAP_AUDIT "Dual Sanitization Approaches"):
 * This is a COHERENCE HEURISTIC, NOT a security boundary. Its job is to take
 * whatever path the AI puts in `EditOption.file` and coerce it into a clean
 * project-relative path the popup/apply flow can display and later send to
 * /api/files/write. It is NOT trusted to authorize a write — every write goes
 * through `PathSanitizer.safeFilePath(projectRoot, file)` in routes/files.ts,
 * which does the real `path.resolve()`-based traversal guard against the
 * user-registered project root. Defense in depth: even if sanitizeFilePath is
 * bypassed, safeFilePath rejects the path server-side before any disk write.
 *
 * Why this still matters: a malformed AI path (`../../etc/passwd`, an absolute
 * path, Windows-style backslashes, null bytes) should not silently become a
 * confusing value in the popup, and should not be able to smuggle an absolute
 * or escaped path into the request body at all. The old implementation used a
 * single `replace(/\.\.\//g, '')` regex, which missed obfuscated variants
 * (`....//`, `..\`) — this hardened version uses segment-wise normalization so
 * traversal is removed regardless of how it's spelled.
 *
 * Behavior contract (pinned by ResponseParser.test.ts):
 *  - `../` and `..\` traversal segments are stripped (kept-vs-default path
 *    unchanged from the old impl).
 *  - A leading `/` is removed (the popup wants a project-relative path).
 *  - A path under one of the allowed prefixes (src/, components/, pages/,
 *    utils/, lib/) is returned as-is.
 *  - Any other path is prefixed with `src/` so it lands in the source tree.
 */
export function sanitizeFilePath(filePath: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return 'src/';
  }

  // Null bytes have no legitimate place in a file path — drop the path entirely.
  if (filePath.includes('\0')) {
    return 'src/';
  }

  // Normalize Windows-style backslashes to forward slashes so `..\` is treated
  // as traversal just like `../`.
  let normalized = filePath.replace(/\\/g, '/');

  // Strip leading slashes so absolute-looking paths become relative.
  normalized = normalized.replace(/^\/+/, '');

  // Segment-wise traversal removal. Splitting on '/' and filtering out '..',
  // '.', and empty segments (empty segments only create doubled slashes and
  // have no meaning) handles obfuscated forms the old single-regex missed:
  //   'src/..//../etc' -> ['src','','','etc'] after dropping '..','.' and the
  //   empty segments, joined back to 'src/etc' — clean, traversal-free.
  const segments = normalized.split('/');
  const kept = segments.filter((seg) => seg !== '' && seg !== '..' && seg !== '.');

  let sanitized = kept.join('/');

  // Ensure it's within the expected source-tree prefixes. If the AI gave us a
  // path already under one of these, keep it; otherwise default to src/ so the
  // diff targets the source tree (the popup can still manually pick a file).
  const allowedPrefixes = ['src/', 'components/', 'pages/', 'utils/', 'lib/'];
  for (const prefix of allowedPrefixes) {
    if (sanitized === prefix.slice(0, -1) || sanitized.startsWith(prefix)) {
      return sanitized;
    }
  }

  // Default to src/ for unknown paths. Avoid a doubled slash when sanitized is
  // empty or already slashy.
  if (sanitized.length === 0) {
    return 'src/';
  }
  return `src/${sanitized.replace(/^\/+/, '')}`;
}