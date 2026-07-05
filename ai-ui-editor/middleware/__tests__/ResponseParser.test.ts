import { describe, it, expect } from 'vitest';
import {
  parseEditResponse,
  extractJsonFromMarkdown,
  toEditOptions,
  sanitizeFilePath,
  ValidatedEditResponse,
} from '../src/ai/ResponseParser';

describe('ResponseParser', () => {
  describe('parseEditResponse', () => {
    it('should parse valid response', () => {
      const rawResponse = JSON.stringify({
        options: [
          {
            id: 'opt1',
            description: 'Change background to blue',
            diff: '@@ -1,1 +1,1 @@\n- className="bg-white"\n+ className="bg-blue-100"',
            previewHtml: '<div class="bg-blue-100">Test</div>',
            file: 'src/components/Card.tsx',
            type: 'jsx',
          },
        ],
      });

      const result = parseEditResponse(rawResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.options).toHaveLength(1);
        expect(result.data.options[0].id).toBe('opt1');
      }
    });

    it('should reject empty options array', () => {
      const rawResponse = JSON.stringify({
        options: [],
      });

      const result = parseEditResponse(rawResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        // The error could be from validation or parsing - just check it failed
        expect(result.error).toBeDefined();
      }
    });

    it('should reject invalid diff format', () => {
      const rawResponse = JSON.stringify({
        options: [
          {
            id: 'opt1',
            description: 'Test',
            diff: 'not a valid diff',
            previewHtml: '<div>Test</div>',
            file: 'src/test.tsx',
            type: 'jsx',
          },
        ],
      });

      const result = parseEditResponse(rawResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should handle JSON parse errors', () => {
      const rawResponse = 'not valid json';

      const result = parseEditResponse(rawResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('JSON parse failed');
      }
    });

    it('should accept optional followUpQuestions', () => {
      const rawResponse = JSON.stringify({
        options: [
          {
            id: 'opt1',
            description: 'Test',
            diff: '@@ -1,1 +1,1 @@\n- old\n+ new',
            previewHtml: '<div>New</div>',
            file: 'src/test.tsx',
            type: 'jsx',
          },
        ],
        followUpQuestions: ['Did you mean to also add hover state?'],
      });

      const result = parseEditResponse(rawResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.followUpQuestions).toEqual(['Did you mean to also add hover state?']);
      }
    });

    it('should handle incomplete option objects', () => {
      const rawResponse = JSON.stringify({
        options: [
          {
            id: 'opt1',
            // missing required fields
          },
        ],
      });

      const result = parseEditResponse(rawResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Error could be validation or parsing - just check it failed
        expect(result.success).toBe(false);
      }
    });
  });

  describe('extractJsonFromMarkdown', () => {
    it('should extract JSON from ```json code block', () => {
      const content = `Here's the response:
\`\`\`json
{"options": [{"id": "opt1", "description": "Test", "diff": "@@ -1 +1 @@", "previewHtml": "<div/>", "file": "test.tsx", "type": "jsx"}]}
\`\`\``;

      const result = extractJsonFromMarkdown(content);
      expect(result).toContain('"options"');
      expect(result).not.toContain('```');
    });

    it('should extract JSON from ``` code block', () => {
      const content = `\`\`\`
{"options": [{"id": "opt1", "description": "Test", "diff": "@@ -1 +1 @@", "previewHtml": "<div/>", "file": "test.tsx", "type": "jsx"}]}
\`\`\``;

      const result = extractJsonFromMarkdown(content);
      expect(result).toContain('"options"');
    });

    it('should find JSON object in plain text', () => {
      const content = 'Some text before {"options": [{"id": "opt1", "description": "Test", "diff": "@@ -1 +1 @@", "previewHtml": "<div/>", "file": "test.tsx", "type": "jsx"}]} and after';

      const result = extractJsonFromMarkdown(content);
      expect(result).toContain('"options"');
    });

    it('should return content as-is if no extraction needed', () => {
      const content = '{"options": [{"id": "opt1"}]}';
      const result = extractJsonFromMarkdown(content);
      expect(result).toBe('{"options": [{"id": "opt1"}]}');
    });
  });

  describe('toEditOptions', () => {
    it('should convert validated response to EditOption[]', () => {
      const response: ValidatedEditResponse = {
        options: [
          {
            id: 'opt1',
            description: 'Blue background',
            diff: '@@ -1 +1 @@',
            previewHtml: '<div class="bg-blue"/>',
            file: 'src/test.tsx',
            type: 'jsx',
          },
          {
            id: 'opt2',
            description: 'Green background',
            diff: '@@ -1 +1 @@',
            previewHtml: '<div class="bg-green"/>',
            file: 'src/test.tsx',
            type: 'css',
          },
        ],
      };

      const result = toEditOptions(response);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('opt1');
      expect(result[1].type).toBe('css');
    });
  });

  describe('sanitizeFilePath', () => {
    it('should allow normal paths', () => {
      expect(sanitizeFilePath('src/components/Card.tsx')).toBe('src/components/Card.tsx');
      expect(sanitizeFilePath('pages/index.tsx')).toBe('pages/index.tsx');
    });

    it('should prevent directory traversal by removing ../', () => {
      // The current implementation removes ../ but keeps the rest
      expect(sanitizeFilePath('../../../etc/passwd')).toBe('src/etc/passwd');
      expect(sanitizeFilePath('src/../../../etc/passwd')).toBe('src/etc/passwd');
    });

    it('should handle absolute paths', () => {
      // Absolute paths get leading slash removed, then default to src/
      expect(sanitizeFilePath('/etc/passwd')).toBe('src/etc/passwd');
    });

    it('should default unknown paths to src/', () => {
      expect(sanitizeFilePath('weird/path/file.ts')).toBe('src/weird/path/file.ts');
    });

    it('should keep allowed prefixes', () => {
      expect(sanitizeFilePath('components/Button.tsx')).toBe('components/Button.tsx');
      expect(sanitizeFilePath('pages/Home.tsx')).toBe('pages/Home.tsx');
      expect(sanitizeFilePath('utils/helpers.ts')).toBe('utils/helpers.ts');
      expect(sanitizeFilePath('lib/api.ts')).toBe('lib/api.ts');
    });

    // P1-7 / GAP_AUDIT "Dual Sanitization Approaches": the hardened
    // sanitizeFilePath must remove obfuscated traversal the old single-regex
    // `replace(/\.\.\//g, '')` missed, and must collapse to a safe default for
    // degenerate inputs. These pin the contract; the real security boundary is
    // PathSanitizer.safeFilePath in routes/files.ts (defense in depth).
    it('strips Windows-style backslash traversal (..\\)', () => {
      // `..\..\etc\passwd` normalized to `/`-separated, '..' segments dropped.
      expect(sanitizeFilePath('..\\..\\etc\\passwd')).toBe('src/etc/passwd');
      expect(sanitizeFilePath('src\\..\\..\\etc\\passwd')).toBe('src/etc/passwd');
    });

    it('strips repeated/obfuscated dot-dot-segment traversal', () => {
      // Real '..' segments are dropped (not resolved backward — same
      // semantics as the old `replace(/\.\.\//g, '')`, just robust to
      // obfuscation). '.' segments are dropped too. Empty segments collapse.
      //   'src/..//../etc/x' -> 'src/etc/x.ts'
      //   'a/./b/../c.ts'     -> 'a/b/c.ts'   (b is NOT cancelled by '..')
      expect(sanitizeFilePath('src/..//../etc/x.ts')).toBe('src/etc/x.ts');
      expect(sanitizeFilePath('a/./b/../c.ts')).toBe('src/a/b/c.ts');
      // A literal '....' (four dots) is NOT a traversal segment — it's a
      // harmless literal directory name — so it is kept (empty segments around
      // it dropped) as a clean path under src/.
      // (Pinning this so a future "tighter" rewrite doesn't drop real names.)
      expect(sanitizeFilePath('....//')).toBe('src/....');
    });

    it('drops null bytes entirely to a safe default', () => {
      expect(sanitizeFilePath('src/x.ts\0/../../etc/passwd')).toBe('src/');
      expect(sanitizeFilePath('\0')).toBe('src/');
    });

    it('collapses empty / non-string inputs to a safe default', () => {
      // Non-string is guarded off at runtime; cast to satisfy TS.
      expect(sanitizeFilePath('')).toBe('src/');
      expect(sanitizeFilePath(null as unknown as string)).toBe('src/');
      expect(sanitizeFilePath(undefined as unknown as string)).toBe('src/');
    });

    it('does not let an absolute filesystem path smuggle past as absolute', () => {
      // Even a real absolute path is reduced to a project-relative path; the
      // popup/apply flow never receives an absolute path here.
      expect(sanitizeFilePath('/Users/secret/src/App.tsx')).toBe(
        'src/Users/secret/src/App.tsx'
      );
      // Multiple leading slashes treated the same as one.
      expect(sanitizeFilePath('///etc/passwd')).toBe('src/etc/passwd');
    });
  });
});
