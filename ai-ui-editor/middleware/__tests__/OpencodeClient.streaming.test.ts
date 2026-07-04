import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateEditOptionsStream } from '../src/ai/OpencodeClient';
import { ElementContext, EditContext } from '../src/shared/types';

// Mock the OpenAI SDK - required to prevent "Missing credentials" error
// when OpencodeClient.ts instantiates new OpenAI() at module load time
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
    __testMockCreate: mockCreate,
  };
});

describe('OpencodeClient streaming (P8)', () => {
  const mockElement: ElementContext = {
    html: '<div class="card">Test</div>',
    computedStyles: { color: 'rgb(0, 0, 0)', 'background-color': 'rgb(255, 255, 255)' },
    classNames: ['card'],
    hierarchy: ['div.card', 'body'],
    eventListeners: ['click'],
  };

  const mockContext: EditContext = {
    url: 'http://localhost:5174',
    framework: 'react',
    projectRoot: '/tmp/test',
    sourceFile: 'src/components/Card.tsx',
    sourceCode: 'export const Card = () => <div class="card">Test</div>;',
  };

  beforeEach(() => {
    // No API key set = mock fallback path
    vi.stubEnv('NVIDIA_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to mock response when no API key is set ( streaming disabled gracefully)', async () => {
    const mod = await import('../src/ai/OpencodeClient');
    const onProgress = vi.fn();

    const options = await mod.generateEditOptionsStream(mockElement, 'Make it blue', mockContext, onProgress);

    // Should return mock options (non-empty array)
    expect(Array.isArray(options)).toBe(true);
    expect(options.length).toBeGreaterThan(0);

    // Should emit mock stage to indicate fallback was used
    const mockCalls = onProgress.mock.calls.filter((c) => c[0] === 'mock');
    expect(mockCalls.length).toBe(1);
    expect(mockCalls[0][1]).toContain('mock');
  });

  it('emits progress stages even with mock fallback', async () => {
    const mod = await import('../src/ai/OpencodeClient');
    const onProgress = vi.fn();

    await mod.generateEditOptionsStream(mockElement, 'test', mockContext, onProgress);

    // Mock path emits 'mock' stage
    const stages = onProgress.mock.calls.map((c) => c[0]);
    expect(stages).toContain('mock');
  });

  it('generates options for different visual instructions (mock path)', async () => {
    const mod = await import('../src/ai/OpencodeClient');
    const onProgress = vi.fn();

    const colorResult = await mod.generateEditOptionsStream(mockElement, 'Make it blue', mockContext, onProgress);
    const paddingResult = await mod.generateEditOptionsStream(mockElement, 'Add padding', mockContext, onProgress);

    expect(colorResult.length).toBeGreaterThan(0);
    expect(paddingResult.length).toBeGreaterThan(0);
    // Different instructions may produce different mock descriptions
  });
});