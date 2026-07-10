import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  detectProfile,
  getProfile,
  PROFILES,
  validateProfileEntry,
} from '../src/config/project-profiles';

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
      // P2-1: requirements dir is now explicit ('.wysiwyg'); before it relied on
      // the route's fallback. The route still falls back to '.wysiwyg', so this is
      // behavior-neutral.
      expect(profile.directories.requirements).toBe('.wysiwyg');
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

  // ---------------------------------------------------------------------------
  // P2-1: profile schema extensions + on-disk JSON validation. The
  // validateProfileEntry() boundary is what P2-2's ProfileManager uses to load
  // config/profiles/*.json safely; these tests pin both the validator and the
  // shipped JSON files (which must pass it, and stay in lockstep with the
  // in-code PROFILES table).
  // ---------------------------------------------------------------------------

  describe('P2-1 profile schema extensions', () => {
    it('example profile exercises the new optional fields', () => {
      const p = PROFILES.example;
      // Built-in profiles never set rootPath (runtime-only, layered on register).
      expect(p.rootPath).toBeUndefined();
      // markers narrow the root check; example is a Node project so package.json.
      expect(p.markers).toEqual(['package.json']);
      expect(p.intakeLineFormat?.template).toBe('- [${id}] ${title} | Priority: ${priority}');
      // One template per artifact, names matching artifactFormat.
      const names = p.artifactTemplates?.map((t) => t.name) ?? [];
      expect(names).toEqual(p.artifactFormat);
      for (const t of p.artifactTemplates ?? []) {
        expect(t.sections.length).toBeGreaterThan(0);
      }
    });

    it('generic profile has the verified default intake line + a spec.md template', () => {
      const p = PROFILES.generic;
      expect(p.rootPath).toBeUndefined();
      expect(p.intakeLineFormat?.template).toBe('- [${id}] ${title} | Priority: ${priority}');
      expect(p.artifactTemplates?.map((t) => t.name)).toEqual(['spec.md']);
    });
  });

  describe('validateProfileEntry', () => {
    const valid = {
      name: 'demo',
      urlPatterns: ['localhost:3000'],
      techStack: ['React'],
      directories: { frontend: 'src/' },
      artifactFormat: ['spec.md'],
      promptContext: 'demo project',
    };

    it('accepts a minimal profile with only required fields', () => {
      const r = validateProfileEntry(valid);
      expect(r.valid).toBe(true);
      if (r.valid) expect(r.entry.name).toBe('demo');
    });

    it('accepts a full profile with all P2-1 extensions', () => {
      const r = validateProfileEntry({
        ...valid,
        intakeFile: 'TODO.md',
        agents: ['Architect'],
        markers: ['package.json'],
        intakeLineFormat: { template: '- [${id}] ${title}' },
        artifactTemplates: [{ name: 'spec.md', sections: ['Overview', 'Requirements'] }],
      });
      expect(r.valid).toBe(true);
    });

    it('rejects a non-object', () => {
      expect(validateProfileEntry(null).valid).toBe(false);
      expect(validateProfileEntry('x').valid).toBe(false);
      expect(validateProfileEntry([]).valid).toBe(false);
    });

    it('rejects each missing/empty required field', () => {
      for (const key of ['name', 'urlPatterns', 'techStack', 'artifactFormat', 'promptContext', 'directories'] as const) {
        const bad: any = { ...valid };
        delete bad[key];
        const r = validateProfileEntry(bad);
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain(key);
      }
      // empty-string name / empty artifactFormat are also rejected
      expect(validateProfileEntry({ ...valid, name: '' }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, artifactFormat: [] }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, promptContext: '' }).valid).toBe(false);
    });

    it('rejects wrong-typed directories subfields', () => {
      const r = validateProfileEntry({ ...valid, directories: { frontend: 123 } });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('directories.frontend');
    });

    it('rejects a rootPath set on disk (runtime-only field)', () => {
      const r = validateProfileEntry({ ...valid, rootPath: '/Users/x/demo' });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('rootPath');
    });

    it('rejects malformed intakeLineFormat / artifactTemplates', () => {
      expect(validateProfileEntry({ ...valid, intakeLineFormat: { template: 5 } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, intakeLineFormat: { template: '' } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, artifactTemplates: [{ name: 'spec.md' }] as any }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, artifactTemplates: [{ name: '', sections: ['x'] }] }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, artifactTemplates: 'nope' }).valid).toBe(false);
    });

    it('rejects non-array agents / markers', () => {
      expect(validateProfileEntry({ ...valid, agents: 'Architect' }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, markers: 'package.json' }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, intakeFile: 5 }).valid).toBe(false);
    });
  });

  describe('shipped config/profiles/*.json', () => {
    const PROFILES_DIR = path.resolve(__dirname, '..', 'src', 'config', 'profiles');

    it('both built-in JSON files pass validateProfileEntry', async () => {
      for (const name of ['example.json', 'generic.json']) {
        const raw = await fs.readFile(path.join(PROFILES_DIR, name), 'utf8');
        const r = validateProfileEntry(JSON.parse(raw));
        expect(r.valid).toBe(true);
      }
    });

    it('JSON example stays in lockstep with the in-code PROFILES.example', async () => {
      const json = JSON.parse(await fs.readFile(path.join(PROFILES_DIR, 'example.json'), 'utf8'));
      const code = PROFILES.example;
      expect(json.name).toBe(code.name);
      expect(json.urlPatterns).toEqual(code.urlPatterns);
      expect(json.techStack).toEqual(code.techStack);
      expect(json.directories).toEqual(code.directories);
      expect(json.artifactFormat).toEqual(code.artifactFormat);
      expect(json.intakeFile).toBe(code.intakeFile);
      expect(json.agents).toEqual(code.agents);
      expect(json.promptContext).toBe(code.promptContext);
    });

    it('JSON generic stays in lockstep with the in-code PROFILES.generic', async () => {
      const json = JSON.parse(await fs.readFile(path.join(PROFILES_DIR, 'generic.json'), 'utf8'));
      const code = PROFILES.generic;
      expect(json.name).toBe(code.name);
      expect(json.urlPatterns).toEqual(code.urlPatterns);
      expect(json.techStack).toEqual(code.techStack);
      expect(json.directories).toEqual(code.directories);
      expect(json.artifactFormat).toEqual(code.artifactFormat);
      expect(json.intakeFile).toBe(code.intakeFile);
      expect(json.promptContext).toBe(code.promptContext);
    });
  });
});