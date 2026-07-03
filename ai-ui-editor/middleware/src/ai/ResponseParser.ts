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
 * Sanitizes file paths to prevent directory traversal
 */
export function sanitizeFilePath(filePath: string): string {
  // Remove any ../ or absolute path attempts
  const sanitized = filePath.replace(/\.\.\//g, '').replace(/^\//, '');

  // Ensure it's within expected directories
  const allowedPrefixes = ['src/', 'components/', 'pages/', 'utils/', 'lib/'];
  for (const prefix of allowedPrefixes) {
    if (sanitized.startsWith(prefix)) {
      return sanitized;
    }
  }

  // Default to src/ for unknown paths
  return `src/${sanitized}`;
}