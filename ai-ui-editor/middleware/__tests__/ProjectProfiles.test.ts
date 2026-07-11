import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  detectProfile,
  getProfile,
  PROFILES,
  validateProfileEntry,
  type IntakeApi,
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

  // ---------------------------------------------------------------------------
  // P3-1: intakeApi (Phase 3 HTTP intake adapter) validation. The optional
  // `intakeApi` block is what a future PipelineClient (P3-2) reads to POST the
  // export; validateProfileEntry() is the load boundary that keeps a malformed
  // descriptor out of the route, and the raw-secret backstop keeps a pasted-in
  // secret out of a committed profile file. The shipped example.json exercises
  // a valid block; generic.json omits it (file-handoff default).
  // ---------------------------------------------------------------------------

  describe('validateProfileEntry — P3-1 intakeApi', () => {
    // Local base (the `valid` in the sibling validateProfileEntry describe is
    // out of scope here): a minimal profile with only the required fields, used
    // as the spread target for intakeApi-mutation cases below.
    const valid = {
      name: 'demo',
      urlPatterns: ['localhost:3000'],
      techStack: ['React'],
      directories: { frontend: 'src/' },
      artifactFormat: ['spec.md'],
      promptContext: 'demo project',
    };
    const validIntakeApi: IntakeApi = {
      baseUrl: 'http://localhost:9999',
      upsertPath: '/api/ideas',
      method: 'POST',
      auth: 'demoIntakeKey',
      bodyTemplate: { title: '{title}', spec: '{spec}' },
    };

    it('accepts a profile with a valid intakeApi block', () => {
      const r = validateProfileEntry({ ...valid, intakeApi: validIntakeApi });
      expect(r.valid).toBe(true);
      if (r.valid) expect(r.entry.intakeApi?.upsertPath).toBe('/api/ideas');
    });

    it('accepts a profile with intakeApi absent (file-handoff default)', () => {
      expect(validateProfileEntry(valid).valid).toBe(true);
    });

    it('rejects a non-object intakeApi', () => {
      expect(validateProfileEntry({ ...valid, intakeApi: 'nope' }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, intakeApi: null }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, intakeApi: [] }).valid).toBe(false);
    });

    it('rejects a baseUrl that is not http(s)', () => {
      const r = validateProfileEntry({
        ...valid,
        intakeApi: { ...validIntakeApi, baseUrl: 'file:///etc/passwd' },
      });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('http(s)');
      const ftp = validateProfileEntry({
        ...valid,
        intakeApi: { ...validIntakeApi, baseUrl: 'ftp://x/y' },
      });
      expect(ftp.valid).toBe(false);
    });

    it('rejects an empty / unparseable baseUrl', () => {
      expect(validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, baseUrl: '' } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, baseUrl: 'not a url' } }).valid).toBe(false);
    });

    it('allows http and https loopback baseUrls (realistic target runs locally)', () => {
      expect(
        validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, baseUrl: 'http://127.0.0.1:8006' } }).valid,
      ).toBe(true);
      expect(
        validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, baseUrl: 'https://localhost:8006' } }).valid,
      ).toBe(true);
    });

    it('rejects an upsertPath that does not start with "/"', () => {
      const r = validateProfileEntry({
        ...valid,
        intakeApi: { ...validIntakeApi, upsertPath: 'api/ideas' },
      });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('upsertPath');
    });

    it('rejects a method other than POST', () => {
      const r = validateProfileEntry({
        ...valid,
        intakeApi: { ...validIntakeApi, method: 'PUT' as any },
      });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('POST');
    });

    it('rejects an empty auth name', () => {
      const r = validateProfileEntry({
        ...valid,
        intakeApi: { ...validIntakeApi, auth: '' },
      });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('auth');
    });

    it('rejects a non-object / array bodyTemplate', () => {
      expect(
        validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, bodyTemplate: 'nope' as any } }).valid,
      ).toBe(false);
      expect(
        validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, bodyTemplate: [] as any } }).valid,
      ).toBe(false);
      expect(
        validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, bodyTemplate: null as any } }).valid,
      ).toBe(false);
    });

    it('rejects a bodyTemplate with non-string values', () => {
      const r = validateProfileEntry({
        ...valid,
        intakeApi: { ...validIntakeApi, bodyTemplate: { title: '{title}', spec: 42 as any } },
      });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('bodyTemplate');
    });

    it('accepts an empty bodyTemplate (no body fields mapped — a no-op upsert)', () => {
      expect(
        validateProfileEntry({ ...valid, intakeApi: { ...validIntakeApi, bodyTemplate: {} } }).valid,
      ).toBe(true);
    });
  });

  // P3-4: statusApi is validated with the same http(s)/path/auth rules as
  // intakeApi, plus pollMs (positive integer), itemFieldMappings (object with
  // string id/title/status), and itemPath must contain {id}.
  describe('validateProfileEntry — P3-4 statusApi validation', () => {
    // Local base (the `valid` in the sibling validateProfileEntry describe is
    // out of scope here, same as the P3-1 block): a minimal profile with only
    // the required fields, used as the spread target for statusApi cases below.
    const valid = {
      name: 'demo',
      urlPatterns: ['localhost:3000'],
      techStack: ['React'],
      directories: { frontend: 'src/' },
      artifactFormat: ['spec.md'],
      promptContext: 'demo project',
    };
    const validStatusApi: Record<string, unknown> = {
      baseUrl: 'http://localhost:8006',
      boardPath: '/api/ideas',
      itemPath: '/api/ideas/{id}',
      auth: 'exampleIntakeKey',
      pollMs: 5000,
      itemFieldMappings: { id: 'id', title: 'title', status: 'status', url: 'url' },
    };

    it('accepts a profile with a valid statusApi', () => {
      const r = validateProfileEntry({ ...valid, statusApi: validStatusApi });
      expect(r.valid).toBe(true);
    });

    it('rejects statusApi that is not an object', () => {
      expect(validateProfileEntry({ ...valid, statusApi: 'nope' as any }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: [] as any }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: null as any }).valid).toBe(false);
    });

    it('rejects a non-http(s) / invalid baseUrl', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, baseUrl: 'file:///etc' } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, baseUrl: '' } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, baseUrl: 'not-a-url' } }).valid).toBe(false);
    });

    it('rejects a boardPath that does not start with "/"', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, boardPath: 'api/ideas' } }).valid).toBe(false);
    });

    it('rejects an itemPath that does not contain "{id}"', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemPath: '/api/ideas' } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemPath: '/api/ideas/:id' } }).valid).toBe(false);
    });

    it('rejects an empty auth name', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, auth: '' } }).valid).toBe(false);
    });

    it('rejects pollMs that is not a positive integer', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, pollMs: 0 } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, pollMs: -5000 } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, pollMs: 1000.5 } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, pollMs: '5000' as any } }).valid).toBe(false);
    });

    it('rejects itemFieldMappings that is not an object', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: 'nope' as any } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: [] as any } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: null as any } }).valid).toBe(false);
    });

    it('rejects itemFieldMappings with missing/empty required fields (id, title, status)', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: { title: 'title', status: 'status' } } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: { id: '', title: 'title', status: 'status' } } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: { id: 'id', title: '', status: 'status' } } }).valid).toBe(false);
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: { id: 'id', title: 'title', status: '' } } }).valid).toBe(false);
    });

    it('accepts itemFieldMappings without an optional url field', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: { id: 'id', title: 'title', status: 'status' } } }).valid).toBe(true);
    });

    it('rejects itemFieldMappings.url that is present but not a string', () => {
      expect(validateProfileEntry({ ...valid, statusApi: { ...validStatusApi, itemFieldMappings: { id: 'id', title: 'title', status: 'status', url: 42 as any } } }).valid).toBe(false);
    });
  });

  describe('validateProfileEntry — P3-1 raw-secret backstop', () => {
    // The profile JSON is committed to the repo; a raw secret must never ride
    // it in. validateProfileEntry rejects the conventional raw-secret field
    // names so a pasted-in key is caught at the load boundary, directing the
    // author to name the secret via intakeApi.auth + store it in the registry.
    const secretFields = ['apiKey', 'api_key', 'token', 'secret'] as const;

    for (const field of secretFields) {
      it(`rejects a raw "${field}" string field at the load boundary`, () => {
        const r = validateProfileEntry({
          name: 'demo',
          urlPatterns: ['localhost:3000'],
          techStack: ['React'],
          directories: { frontend: 'src/' },
          artifactFormat: ['spec.md'],
          promptContext: 'demo project',
          [field]: 'sk-live-REDACTED',
        });
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain(field);
        if (!r.valid) expect(r.error).toContain('intakeApi.auth');
      });
    }

    it('rejects a raw secret even when a valid intakeApi is also present', () => {
      const r = validateProfileEntry({
        name: 'demo',
        urlPatterns: ['localhost:3000'],
        techStack: ['React'],
        directories: { frontend: 'src/' },
        artifactFormat: ['spec.md'],
        promptContext: 'demo project',
        intakeApi: {
          baseUrl: 'http://localhost:9999',
          upsertPath: '/api/ideas',
          method: 'POST',
          auth: 'demoIntakeKey',
          bodyTemplate: { title: '{title}' },
        },
        token: 'sk-live-REDACTED',
      });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.error).toContain('token');
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
      // P3-1 / P3-4: the shipped example.json carries intakeApi + statusApi blocks
      // (Phase 3 HTTP handoff + board demos) and they must stay in lockstep with the
      // in-code profile.
      expect(json.intakeApi).toEqual(code.intakeApi);
      expect(json.intakeApi).toEqual({
        baseUrl: 'http://localhost:8006',
        upsertPath: '/api/ideas',
        method: 'POST',
        auth: 'exampleIntakeKey',
        bodyTemplate: {
          title: '{title}',
          priority: '{priority}',
          spec: '{spec}',
          architectureHints: '{architectureHints}',
          testScenarios: '{testScenarios}',
          edgeCases: '{edgeCases}',
        },
      });
      expect(json.statusApi).toEqual(code.statusApi);
      expect(json.statusApi).toEqual({
        baseUrl: 'http://localhost:8006',
        boardPath: '/api/ideas',
        itemPath: '/api/ideas/{id}',
        auth: 'exampleIntakeKey',
        pollMs: 5000,
        itemFieldMappings: { id: 'id', title: 'title', status: 'status', url: 'url' },
      });
      // `auth` is a NAME, never a raw secret — no conventional secret fields.
      for (const secretField of ['apiKey', 'api_key', 'token', 'secret']) {
        expect(json[secretField]).toBeUndefined();
      }
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
      // P3-1 / P3-4: generic has NO intakeApi or statusApi — unknown projects keep
      // the Phase 1 file-handoff default and have no board tab. Both the JSON and
      // the in-code profile must agree.
      expect(json.intakeApi).toBeUndefined();
      expect(code.intakeApi).toBeUndefined();
      expect(json.statusApi).toBeUndefined();
      expect(code.statusApi).toBeUndefined();
    });
  });
});