import OpenAI from 'openai';
import { ElementContext, EditContext, EditOption } from '../shared/types';
import { getEditPrompt } from './PromptTemplates';
import { parseEditResponse, extractJsonFromMarkdown, toEditOptions, sanitizeFilePath } from './ResponseParser';

/**
 * NVIDIA NIM API Configuration
 *
 * NVIDIA NIM provides OpenAI-compatible API access to various models.
 * Base URL: https://integrate.api.nvidia.com/v1
 *
 * Available models for coding tasks:
 * - anthropic/claude-sonnet-4-20250514
 * - meta/llama-3.1-405b-instruct
 * - google/gemma-2-9b-it
 * - mistralai/mistral-large-2-instruct
 *
 * Get API key from: https://build.nvidia.com/
 */

// Initialize OpenAI client with NVIDIA NIM base URL
const nvidiaNim = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '',
});

// Default model to use (can be overridden via env)
// Available models: meta/llama-3.1-70b-instruct, mistralai/mistral-large-2-instruct, nvidia/llama-3.1-nemotron-70b-instruct
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
 */
export async function listAvailableModels(): Promise<string[]> {
  try {
    // Note: NVIDIA NIM doesn't have a models endpoint yet
    // Return the list of known supported models
    return [
      'anthropic/claude-sonnet-4-20250514',
      'anthropic/claude-3.5-sonnet',
      'meta/llama-3.1-405b-instruct',
      'meta/llama-3.1-70b-instruct',
      'google/gemma-2-9b-it',
      'mistralai/mistral-large-2-instruct',
      'microsoft/phi-3-medium-128k-instruct',
      'nvidia/nemotron-4-340b-instruct',
    ];
  } catch (error: any) {
    console.error('[NvidiaNIM] Failed to list models:', error.message);
    return [];
  }
}