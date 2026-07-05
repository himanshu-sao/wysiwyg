import { describe, it, expect } from 'vitest';
import { detectProfile, getProfile, PROFILES } from '../src/config/project-profiles';

describe('ProjectProfiles', () => {
  describe('PROFILES constant', () => {
    it('should have example profile', () => {
      expect(PROFILES.example).toBeDefined();
      expect(PROFILES.example.name).toBe('example');
    });

    it('should have generic profile', () => {
      expect(PROFILES.generic).toBeDefined();
      expect(PROFILES.generic.name).toBe('generic');
    });

    it('should have correct example configuration', () => {
      const profile = PROFILES.example;
      expect(profile.urlPatterns).toContain('localhost:5173');
      expect(profile.urlPatterns).toContain('localhost:8006');
      expect(profile.techStack).toContain('React 19');
      expect(profile.techStack).toContain('TypeScript');
      expect(profile.directories.backend).toBe('api/');
      expect(profile.directories.frontend).toBe('src/');
      expect(profile.directories.requirements).toBeUndefined();
      expect(profile.intakeFile).toBe('.wysiwyg/ideas.md');
      expect(profile.agents).toContain('Architect');
      expect(profile.agents).toContain('Executor');
    });

    it('should have correct generic configuration', () => {
      const profile = PROFILES.generic;
      expect(profile.urlPatterns).toContain('localhost:*');
      expect(profile.techStack).toContain('React');
      expect(profile.directories.frontend).toBe('src/');
      expect(profile.intakeFile).toBe('TODO.md');
    });
  });

  describe('detectProfile', () => {
    it('should detect example from localhost:5173', () => {
      const profile = detectProfile('http://localhost:5173');
      expect(profile.name).toBe('example');
    });

    it('should detect example from localhost:8006', () => {
      const profile = detectProfile('http://localhost:8006');
      expect(profile.name).toBe('example');
    });

    it('should detect generic from other localhost ports', () => {
      const profile = detectProfile('http://localhost:3000');
      expect(profile.name).toBe('generic');
    });

    it('should detect generic from any localhost URL', () => {
      const profile = detectProfile('http://localhost:8080/path/to/page');
      expect(profile.name).toBe('generic');
    });

    it('should fall back to generic for unknown URLs', () => {
      const profile = detectProfile('http://example.com');
      expect(profile.name).toBe('generic');
    });

    it('should match exact host patterns', () => {
      const profile = detectProfile('http://localhost:5173');
      expect(profile.name).toBe('example');
      expect(profile.urlPatterns).toContain('localhost:5173');
    });

    it('should match glob patterns for generic profile', () => {
      const profile = detectProfile('http://localhost:9999');
      expect(profile.name).toBe('generic');
      // Generic matches localhost:* pattern
      expect(profile.urlPatterns).toContain('localhost:*');
    });
  });

  describe('getProfile', () => {
    it('should return example profile by name', () => {
      const profile = getProfile('example');
      expect(profile.name).toBe('example');
      expect(profile.directories.backend).toBe('api/');
    });

    it('should return generic profile by name', () => {
      const profile = getProfile('generic');
      expect(profile.name).toBe('generic');
    });

    it('should fall back to generic for unknown profile names', () => {
      const profile = getProfile('nonexistent');
      expect(profile.name).toBe('generic');
    });

    it('should return promptContext for example', () => {
      const profile = getProfile('example');
      expect(profile.promptContext).toContain('REST API');
      expect(profile.promptContext).toContain('React 19');
      expect(profile.promptContext).toContain('Pipeline');
    });

    it('should return promptContext for generic', () => {
      const profile = getProfile('generic');
      expect(profile.promptContext).toContain('React');
      expect(profile.promptContext).toContain('Vite');
    });
  });

  describe('ProjectProfile schema', () => {
    it('example should have all required fields', () => {
      const profile = PROFILES.example;
      // Required fields
      expect(profile.name).toBeDefined();
      expect(profile.urlPatterns).toBeDefined();
      expect(profile.techStack).toBeDefined();
      expect(profile.directories).toBeDefined();
      expect(profile.artifactFormat).toBeDefined();
      expect(profile.promptContext).toBeDefined();
      // Optional fields that example has
      expect(profile.intakeFile).toBeDefined();
      expect(profile.agents).toBeDefined();
    });

    it('generic should have all required fields', () => {
      const profile = PROFILES.generic;
      // Required fields
      expect(profile.name).toBeDefined();
      expect(profile.urlPatterns).toBeDefined();
      expect(profile.techStack).toBeDefined();
      expect(profile.directories).toBeDefined();
      expect(profile.artifactFormat).toBeDefined();
      expect(profile.promptContext).toBeDefined();
    });

    it('artifactFormat should be an array of markdown files', () => {
      expect(PROFILES.example.artifactFormat).toEqual(
        expect.arrayContaining(['spec.md', 'architecture.md', 'tests.md'])
      );
      expect(PROFILES.generic.artifactFormat).toEqual(
        expect.arrayContaining(['spec.md'])
      );
    });
  });
});