import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateEditOptions } from '../src/ai/OpencodeClient';
import { ElementContext, EditContext } from '../src/shared/types';

// Mock the OpenAI SDK (used by NVIDIA NIM)
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
    __mockCreate: mockCreate,
  };
});

describe('OpencodeClient', () => {
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
    // Clear environment variable for testing
    vi.stubEnv('NVIDIA_API_KEY', '');
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  describe('generateEditOptions', () => {
    it('should use mock response when API key is not set', async () => {
      // No API key set - should fall back to mock
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Make it blue',
        mockContext
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBeDefined();
    });

    it('should generate multiple options for color requests', async () => {
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Change the color to blue',
        mockContext
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].description).toContain('blue');
    });

    it('should generate options for padding requests', async () => {
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Add more padding',
        mockContext
      );

      expect(result.some(opt => opt.description.toLowerCase().includes('padding'))).toBe(true);
    });

    it('should generate options for shadow requests', async () => {
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Increase the shadow',
        mockContext
      );

      expect(result.some(opt => opt.description.toLowerCase().includes('shadow'))).toBe(true);
    });

    it('should provide fallback for unknown instructions', async () => {
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Some random instruction xyz123',
        mockContext
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].description).toContain('Some random instruction xyz123');
    });

    it('should include valid diff format in all options', async () => {
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Make it blue',
        mockContext
      );

      result.forEach(opt => {
        expect(opt.diff).toMatch(/@@.*@@/);
      });
    });

    it('should include preview HTML for all options', async () => {
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Make it blue',
        mockContext
      );

      result.forEach(opt => {
        expect(opt.previewHtml).toBeDefined();
        expect(opt.previewHtml.length).toBeGreaterThan(0);
      });
    });

    it('should specify correct file path', async () => {
      vi.stubEnv('NVIDIA_API_KEY', '');

      const result = await generateEditOptions(
        mockElement,
        'Make it blue',
        mockContext
      );

      result.forEach(opt => {
        expect(opt.file).toBe('src/components/Card.tsx');
      });
    });
  });
});