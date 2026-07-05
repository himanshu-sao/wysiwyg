import { describe, it, expect } from 'vitest';
import { detectProfile, getProfile, PROFILES } from '../src/config/project-profiles';

describe('ProjectProfiles', () => {
  describe('PROFILES constant', () => {
    it('should have antikythera profile', () => {
      expect(PROFILES.antikythera).toBeDefined();
      expect(PROFILES.antikythera.name).toBe('antikythera');
    });

    it('should have generic profile', () => {
      expect(PROFILES.generic).toBeDefined();
      expect(PROFILES.generic.name).toBe('generic');
    });

    it('should have correct antikythera configuration', () => {
      const profile = PROFILES.antikythera;
      expect(profile.urlPatterns).toContain('localhost:5173');
      expect(profile.urlPatterns).toContain('localhost:8006');
      expect(profile.techStack).toContain('FastAPI');
      expect(profile.techStack).toContain('React 19');
      expect(profile.directories.backend).toBe('api/');
      expect(profile.directories.frontend).toBe('ui/src/');
      expect(profile.directories.requirements).toBe('automation-ideas/');
      expect(profile.intakeFile).toBe('automation-ideas/ideas.md');
      expect(profile.agents).toContain('Orchestrator');
      expect(profile.agents).toContain('Memory');
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
    it('should detect antikythera from localhost:5173', () => {
      const profile = detectProfile('http://localhost:5173');
      expect(profile.name).toBe('antikythera');
    });

    it('should detect antikythera from localhost:8006', () => {
      const profile = detectProfile('http://localhost:8006');
      expect(profile.name).toBe('antikythera');
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
      expect(profile.name).toBe('antikythera');
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
    it('should return antikythera profile by name', () => {
      const profile = getProfile('antikythera');
      expect(profile.name).toBe('antikythera');
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

    it('should return promptContext for antikythera', () => {
      const profile = getProfile('antikythera');
      expect(profile.promptContext).toContain('FastAPI');
      expect(profile.promptContext).toContain('multi-agent');
      expect(profile.promptContext).toContain('Pipeline');
    });

    it('should return promptContext for generic', () => {
      const profile = getProfile('generic');
      expect(profile.promptContext).toContain('React');
      expect(profile.promptContext).toContain('Vite');
    });
  });

  describe('ProjectProfile schema', () => {
    it('antikythera should have all required fields', () => {
      const profile = PROFILES.antikythera;
      // Required fields
      expect(profile.name).toBeDefined();
      expect(profile.urlPatterns).toBeDefined();
      expect(profile.techStack).toBeDefined();
      expect(profile.directories).toBeDefined();
      expect(profile.artifactFormat).toBeDefined();
      expect(profile.promptContext).toBeDefined();
      // Optional fields that antikythera has
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
      expect(PROFILES.antikythera.artifactFormat).toEqual(
        expect.arrayContaining(['spec.md', 'architecture.md', 'tests.md'])
      );
      expect(PROFILES.generic.artifactFormat).toEqual(
        expect.arrayContaining(['spec.md'])
      );
    });
  });
});