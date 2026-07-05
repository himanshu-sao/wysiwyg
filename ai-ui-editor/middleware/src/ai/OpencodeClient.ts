import OpenAI from 'openai';
import { ElementContext, EditContext, EditOption } from '../shared/types';
import { getEditPrompt, getRequirementsPrompt } from './PromptTemplates';
import { parseEditResponse, extractJsonFromMarkdown, toEditOptions, sanitizeFilePath } from './ResponseParser';
import type { ProjectProfile } from '../config/project-profiles';

/**
 * NVIDIA NIM API Configuration
 *
 * NVIDIA NIM provides OpenAI-compatible API access to various models.
 * Base URL: https://integrate.api.nvidia.com/v1
 *
 * The single source of truth for the model catalog is AVAILABLE_MODELS below.
 * Keep ai-ui-editor/README.md's "Available Models" table in lockstep with it.
 *
 * Get API key from: https://build.nvidia.com/
 */

// Initialize OpenAI client with NVIDIA NIM base URL
const nvidiaNim = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '',
});

// P1-7 / GAP_AUDIT "Model List Proliferation": the SINGLE source of truth for
// the NVIDIA NIM model catalog. Previously three divergent lists lived here
// (a header comment, the DEFAULT_MODEL comment, and listAvailableModels') plus
// a fourth in ai-ui-editor/README.md. All of them now derive from this one
// constant. To add/remove a model, edit AVAILABLE_MODELS here and the README
// table only — listAvailableModels() returns it and the header comment points
// at it. DEFAULT_MODEL is guaranteed to be a member of this list.
export const AVAILABLE_MODELS: readonly string[] = [
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-3.5-sonnet',
  'meta/llama-3.1-405b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-nemotron-70b-instruct',
  'google/gemma-2-9b-it',
  'mistralai/mistral-large-2-instruct',
  'microsoft/phi-3-medium-128k-instruct',
  'nvidia/nemotron-4-340b-instruct',
];

// Default model to use (can be overridden via env). Must be a member of
// AVAILABLE_MODELS; validated at startup in validateConfig().
const DEFAULT_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Generates edit options using NVIDIA NIM API
 * @param element - Element context from the browser
 * @param instruction - User's natural language instruction
 * @param context - Project and source code context
 * @returns Array of edit options
 */
export async function generateEditOptions(
  element: ElementContext,
  instruction: string,
  context: EditContext
): Promise<EditOption[]> {
  const prompt = getEditPrompt(element, instruction, context);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callNvidiaNim(prompt, instruction, element, context);
      return response;
    } catch (error: any) {
      const isRetryable =
        error.message?.includes('rate limit') ||
        error.message?.includes('overloaded') ||
        error.message?.includes('timeout') ||
        error.status === 429 ||
        error.status === 503 ||
        error.status === 408;

      if (isRetryable && attempt < MAX_RETRIES) {
        console.warn(`[Attempt ${attempt}/${MAX_RETRIES}] Retryable error, waiting ${RETRY_DELAY_MS}ms...`, error.message);
        await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
        continue;
      }

      // Final attempt failed - throw or return fallback
      if (attempt === MAX_RETRIES) {
        console.error(`[NvidiaNIM] All ${MAX_RETRIES} attempts failed:`, error.message);
        throw new Error(`Failed to generate edit options after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error('Failed to generate edit options');
}

/**
 * Calls NVIDIA NIM API and parses the response
 */
async function callNvidiaNim(
  prompt: string,
  instruction: string,
  element: ElementContext,
  context: EditContext
): Promise<EditOption[]> {
  // Check if API key is configured (empty string or missing = use mock)
  if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === '') {
    console.warn('[NvidiaNIM] NVIDIA_API_KEY not set, using mock responses');
    const { generateMockResponse } = await import('./OpencodeClient.mock');
    return generateMockResponse(element, instruction, context);
  }

  try {
    const completion = await nvidiaNim.chat.completions.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'You are an expert frontend developer. You respond with valid JSON only, no markdown formatting around the JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
    });

    // Extract text content from response
    const textContent = completion.choices[0]?.message?.content;

    if (!textContent || !textContent.trim()) {
      throw new Error('Empty response from NVIDIA NIM API');
    }

    // Extract JSON from markdown if needed (shouldn't be needed with json_object format)
    const jsonContent = extractJsonFromMarkdown(textContent);

    // Validate and parse response
    const parseResult = parseEditResponse(jsonContent);

    if (!parseResult.success) {
      console.error('[NvidiaNIM] Response validation failed:', parseResult.error);
      console.error('[NvidiaNIM] Raw response:', textContent.substring(0, 1000));

      // Try to recover with mock response on parse failure
      const { generateMockResponse } = await import('./OpencodeClient.mock');
      return generateMockResponse(element, instruction, context);
    }

    // Convert to EditOption[] and sanitize file paths
    const options = toEditOptions(parseResult.data);
    options.forEach(opt => {
      opt.file = sanitizeFilePath(opt.file);
    });

    return options;
  } catch (error: any) {
    console.error('[NvidiaNIM] API error:', error.message);
    if (error.status === 401) {
      console.error('[NvidiaNIM] Invalid API key - check your NVIDIA_API_KEY');
    } else if (error.status === 403) {
      console.error('[NvidiaNIM] Access denied - verify model access at https://build.nvidia.com/');
    }
    throw error;
  }
}

/**
 * Calls NVIDIA NIM API with streaming progress updates
 */
async function callNvidiaNimStream(
  prompt: string,
  instruction: string,
  element: ElementContext,
  context: EditContext,
  onProgress: ProgressCallback
): Promise<EditOption[]> {
  // Check if API key is configured (empty string or missing = use mock)
  if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === '') {
    onProgress('mock', 'Using mock responses (NVIDIA_API_KEY not set)');
    const { generateMockResponse } = await import('./OpencodeClient.mock');
    return generateMockResponse(element, instruction, context);
  }

  try {
    // Progress: Starting API call
    onProgress('prompt', 'Sending request to AI...', { model: DEFAULT_MODEL });

    // Real token streaming: ask the SDK for a stream and forward each delta
    // as a 'token' progress event so the popup can render the JSON as it
    // arrives. We still validate the full JSON at the end (json_object mode
    // means the concatenated deltas form valid JSON once the stream ends).
    const stream = await nvidiaNim.chat.completions.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      temperature: 0.7,
      stream: true,
      messages: [
        {
          role: 'system',
          content: 'You are an expert frontend developer. You respond with valid JSON only, no markdown formatting around the JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
    });

    let textContent = '';
    let tokenCount = 0;
    for await (const chunk of stream) {
      const delta: string | null | undefined = chunk.choices[0]?.delta?.content;
      if (delta) {
        textContent += delta;
        tokenCount++;
        // Forward the raw delta so the popup can append it to the live buffer.
        // Carrying `sofar` lets the UI show the accumulated string if it wants
        // to re-render from a known point (useful if events are coalesced).
        onProgress('token', delta, { sofar: textContent });
      }
    }

    // Progress: Got full response, now parsing
    onProgress('parse', 'Processing AI response...', { tokens: tokenCount });

    if (!textContent || !textContent.trim()) {
      throw new Error('Empty response from NVIDIA NIM API');
    }

    // Extract JSON from markdown if needed
    const jsonContent = extractJsonFromMarkdown(textContent);

    // Progress: Validating JSON
    onProgress('validate', 'Validating response format...');

    // Validate and parse response
    const parseResult = parseEditResponse(jsonContent);

    if (!parseResult.success) {
      console.error('[NvidiaNIM] Response validation failed:', parseResult.error);

      // Try to recover with mock response on parse failure
      onProgress('fallback', 'Using fallback mock response');
      const { generateMockResponse } = await import('./OpencodeClient.mock');
      return generateMockResponse(element, instruction, context);
    }

    // Progress: Generating edit options
    onProgress('generate', 'Generating final edit options...');

    // Convert to EditOption[] and sanitize file paths
    const options = toEditOptions(parseResult.data);
    options.forEach(opt => {
      opt.file = sanitizeFilePath(opt.file);
    });

    onProgress('complete', 'Edit options ready', { count: options.length });

    return options;
  } catch (error: any) {
    console.error('[NvidiaNIM] API error:', error.message);
    onProgress('error', `API error: ${error.message}`);
    if (error.status === 401) {
      console.error('[NvidiaNIM] Invalid API key - check your NVIDIA_API_KEY');
      onProgress('error', 'Invalid API key');
    } else if (error.status === 403) {
      console.error('[NvidiaNIM] Access denied - verify model access at https://build.nvidia.com/');
      onProgress('error', 'Access denied - check model permissions');
    }
    throw error;
  }
}

/**
 * Progress callback type for streaming
 */
export type ProgressCallback = (stage: string, message: string, data?: any) => void;

/**
 * Generates edit options using NVIDIA NIM API with streaming progress updates
 * @param element - Element context from the browser
 * @param instruction - User's natural language instruction
 * @param context - Project and source code context
 * @param onProgress - Callback for progress updates
 * @returns Array of edit options
 */
export async function generateEditOptionsStream(
  element: ElementContext,
  instruction: string,
  context: EditContext,
  onProgress: ProgressCallback
): Promise<EditOption[]> {
  const prompt = getEditPrompt(element, instruction, context);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callNvidiaNimStream(prompt, instruction, element, context, onProgress);
      return response;
    } catch (error: any) {
      const isRetryable =
        error.message?.includes('rate limit') ||
        error.message?.includes('overloaded') ||
        error.message?.includes('timeout') ||
        error.status === 429 ||
        error.status === 503 ||
        error.status === 408;

      if (isRetryable && attempt < MAX_RETRIES) {
        onProgress('retry', `Retry attempt ${attempt}/${MAX_RETRIES}`, { delay: RETRY_DELAY_MS * attempt });
        console.warn(`[Attempt ${attempt}/${MAX_RETRIES}] Retryable error, waiting ${RETRY_DELAY_MS}ms...`, error.message);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      // Final attempt failed
      if (attempt === MAX_RETRIES) {
        console.error(`[NvidiaNIM] All ${MAX_RETRIES} attempts failed:`, error.message);
        onProgress('error', `Failed after ${MAX_RETRIES} attempts: ${error.message}`);
        throw new Error(`Failed to generate edit options after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error('Failed to generate edit options');
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * P1-6: normalize the AI-returned priority to one of the allowed values.
 * Accepts any casing; defaults to 'Medium' when the model produces something
 * unexpected (or omits the field) so the popup always has a sane pre-fill.
 * Exported for unit testing.
 */
export function normalizePriority(raw: any): 'High' | 'Medium' | 'Low' {
  if (typeof raw === 'string') {
    const v = raw.trim();
    const lower = v.toLowerCase();
    if (lower === 'high') return 'High';
    if (lower === 'low') return 'Low';
    if (lower === 'medium') return 'Medium';
  }
  return 'Medium';
}

/**
 * Get API usage statistics from the last response
 * Note: This would need to be tracked per-request in production
 */
export async function getApiUsage(): Promise<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}> {
  // NVIDIA NIM returns usage in the completion response
  // This is a placeholder - in production, track per-request
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

/**
 * List available models on NVIDIA NIM
 * Useful for debugging and model selection
 *
 * P1-7 / GAP_AUDIT: returns AVAILABLE_MODELS (the single source of truth) so
 * the list can never drift from the constant. NVIDIA NIM has no models
 * endpoint, so this is the authoritative catalog.
 */
export async function listAvailableModels(): Promise<string[]> {
  try {
    // Note: NVIDIA NIM doesn't have a models endpoint yet
    // Return the list of known supported models (single source of truth).
    return [...AVAILABLE_MODELS];
  } catch (error: any) {
    console.error('[NvidiaNIM] Failed to list models:', error.message);
    return [];
  }
}

/**
 * P1-7 / GAP_AUDIT: validate the configured DEFAULT_MODEL against the catalog.
 * Asserts DEFAULT_MODEL is a member of AVAILABLE_MODELS — guards against an env
 * NVIDIA_MODEL value that's typo'd or stale. Returns the resolved model on
 * success; throws on mismatch. Safe to call at startup. Exported for tests.
 */
export function validateConfig(): { model: string } {
  if (!AVAILABLE_MODELS.includes(DEFAULT_MODEL)) {
    throw new Error(
      `OpencodeClient: DEFAULT_MODEL "${DEFAULT_MODEL}" is not in AVAILABLE_MODELS. ` +
        `Valid models: ${AVAILABLE_MODELS.join(', ')}`
    );
  }
  return { model: DEFAULT_MODEL };
}

/**
 * P1-3: Generate requirements export for antikythera integration
 * @param element - Element context from the browser
 * @param instruction - User's natural language instruction
 * @param context - Project and source code context
 * @param profile - Project profile for context-aware generation
 * @returns Requirements export with spec, architecture hints, test scenarios, edge cases
 */
export async function generateRequirementsExport(
  element: ElementContext,
  instruction: string,
  context: EditContext,
  profile: ProjectProfile
): Promise<{
  spec: string;
  architectureHints: string[];
  testScenarios: string[];
  edgeCases: string[];
  title?: string;
  priority?: 'High' | 'Medium' | 'Low';
}> {
  const prompt = getRequirementsPrompt(element, instruction, context, profile);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check if API key is configured
      if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === '') {
        console.warn('[NvidiaNIM] NVIDIA_API_KEY not set, using mock requirements');
        return {
          spec: `# Specification: ${instruction}\n\n## Overview\nMock specification for testing purposes.`,
          architectureHints: ['src/components/TodoComponent.tsx'],
          testScenarios: ['Should render component', 'Should handle user input'],
          edgeCases: ['Empty state handling', 'Error state display'],
          title: 'Implement the requested feature',
          priority: 'Medium',
        };
      }

      const completion = await nvidiaNim.chat.completions.create({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are a requirements engineer for software projects. You respond with structured JSON containing a title, priority, specification, architecture hints, test scenarios, and edge cases.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const textContent = completion.choices[0]?.message?.content;

      if (!textContent || !textContent.trim()) {
        throw new Error('Empty response from NVIDIA NIM API');
      }

      const jsonContent = extractJsonFromMarkdown(textContent);
      const parsed = JSON.parse(jsonContent);

      return {
        spec: parsed.spec || 'No specification generated',
        architectureHints: Array.isArray(parsed.architectureHints) ? parsed.architectureHints : [],
        testScenarios: Array.isArray(parsed.testScenarios) ? parsed.testScenarios : [],
        edgeCases: Array.isArray(parsed.edgeCases) ? parsed.edgeCases : [],
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
        priority: normalizePriority(parsed.priority),
      };
    } catch (error: any) {
      const isRetryable =
        error.message?.includes('rate limit') ||
        error.message?.includes('overloaded') ||
        error.message?.includes('timeout') ||
        error.status === 429 ||
        error.status === 503 ||
        error.status === 408;

      if (isRetryable && attempt < MAX_RETRIES) {
        console.warn(`[Attempt ${attempt}/${MAX_RETRIES}] Retryable error, waiting ${RETRY_DELAY_MS}ms...`, error.message);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      if (attempt === MAX_RETRIES) {
        console.error(`[NvidiaNIM] All ${MAX_RETRIES} attempts failed:`, error.message);
        throw new Error(`Failed to generate requirements after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error('Failed to generate requirements export');
}