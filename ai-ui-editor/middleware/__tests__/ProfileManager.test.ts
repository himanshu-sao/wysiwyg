import { describe, it, expect } from 'vitest';
import {
  ProfileManager,
  RegisteredProjectOverride,
} from '../src/services/ProfileManager';
import { PROFILES, ProfileEntry } from '../src/config/project-profiles';

// An in-memory profiles "dir" fixture for the fs-injected ProfileManager.
// Maps filename -> file contents. The injected readDir returns Object.keys;
// readFile returns the stored string. Lets us test load/validation without
// touching the real config/profiles dir.
function fixture(files: Record<string, string>) {
  const readDir = async (_dir: string): Promise<string[]> => Object.keys(files);
  const readFile = async (full: string): Promise<string> => {
    const base = full.split(/[\\/]/).pop()!;
    if (!(base in files)) throw new Error(`ENOENT: ${full}`);
    return files[base];
  };
  return { readDir, readFile };
}

const validExample: ProfileEntry = {
  name: 'example',
  urlPatterns: ['localhost:5173'],
  techStack: ['React 19'],
  directories: { frontend: 'src/' },
  artifactFormat: ['spec.md'],
  promptContext: 'example project',
};

const validCustom: ProfileEntry = {
  name: 'custom',
  urlPatterns: ['localhost:4000'],
  techStack: ['Next.js'],
  directories: { frontend: 'app/' },
  artifactFormat: ['spec.md'],
  promptContext: 'custom project',
  intakeLineFormat: { template: '- [${id}] ${title}' },
};

describe('ProfileManager — P2-2 loader', () => {
  describe('loadJsonProfiles', () => {
    it('loads valid JSON profiles by their `name` field', async () => {
      const { readDir, readFile } = fixture({
        'custom.json': JSON.stringify(validCustom),
        'example.json': JSON.stringify(validExample),
      });
      const pm = new ProfileManager({ readDir, readFile });
      const loaded = await pm.loadJsonProfiles();
      expect(loaded.get('custom')).toBeDefined();
      expect(loaded.get('example')).toBeDefined();
      // Stored as the full entry (with optional fields).
      expect(loaded.get('custom')?.intakeLineFormat?.template).toBe('- [${id}] ${title}');
    });

    it('skips a malformed JSON profile and logs a warning, keeps valid ones', async () => {
      const { readDir, readFile } = fixture({
        'custom.json': JSON.stringify(validCustom),
        'broken.json': JSON.stringify({ name: 'broken', urlPatterns: 'not-an-array' }),
        'alsoBroken.json': JSON.stringify({ name: '', urlPatterns: [] }),
      });
      const pm = new ProfileManager({ readDir, readFile });
      const loaded = await pm.loadJsonProfiles();
      expect(loaded.get('custom')).toBeDefined();
      expect(loaded.get('broken')).toBeUndefined();
      expect(loaded.get('alsoBroken')).toBeUndefined();
    });

    it('skips non-.json files in the dir', async () => {
      const { readDir, readFile } = fixture({
        'custom.json': JSON.stringify(validCustom),
        'README.md': '# not a profile',
        'example.txt': 'ignore me',
      });
      const pm = new ProfileManager({ readDir, readFile });
      const loaded = await pm.loadJsonProfiles();
      expect(loaded.size).toBe(1);
      expect(loaded.get('custom')).toBeDefined();
    });

    it('falls back to empty (no throw) when the profiles dir is missing', async () => {
      const readDir = async (_d: string): Promise<string[]> => {
        throw new Error('ENOENT');
      };
      const pm = new ProfileManager({ readDir, readFile: async () => '' });
      const loaded = await pm.loadJsonProfiles();
      expect(loaded.size).toBe(0);
      expect(pm.lastLoadError()).toContain('could not read profiles dir');
    });

    it('caches the load — repeated calls do not re-read the dir', async () => {
      let reads = 0;
      const readDir = async (_d: string): Promise<string[]> => {
        reads++;
        return ['custom.json'];
      };
      const readFile = async (_f: string): Promise<string> => JSON.stringify(validCustom);
      const pm = new ProfileManager({ readDir, readFile });
      await pm.loadJsonProfiles();
      await pm.loadJsonProfiles();
      await pm.loadJsonProfiles();
      expect(reads).toBe(1);
      pm.invalidateCache();
      await pm.loadJsonProfiles();
      expect(reads).toBe(2);
    });

    it('skips a file whose JSON file read throws (keeps others)', async () => {
      const { readDir } = fixture({
        'custom.json': JSON.stringify(validCustom),
        'unreadable.json': '{}',
      });
      const readFile = async (full: string): Promise<string> => {
        const base = full.split(/[\\/]/).pop()!;
        if (base === 'unreadable.json') {
          throw new Error('permission denied');
        }
        return JSON.stringify(validCustom);
      };
      const pm = new ProfileManager({ readDir, readFile });
      const loaded = await pm.loadJsonProfiles();
      expect(loaded.get('custom')).toBeDefined();
      expect(pm.lastLoadError()).toContain('failed to read unreadable.json');
    });
  });

  describe('listProfileNames', () => {
    it('lists built-in names + JSON-loaded names, deduped', async () => {
      const { readDir, readFile } = fixture({
        'custom.json': JSON.stringify(validCustom),
        'example.json': JSON.stringify(validExample), // shadows built-in by name
      });
      const pm = new ProfileManager({ readDir, readFile });
      const names = await pm.listProfileNames();
      // built-ins present
      expect(names).toContain('example');
      expect(names).toContain('generic');
      // JSON-only profile present
      expect(names).toContain('custom');
      // deduped (example appears once despite JSON + built-in)
      expect(names.filter((n) => n === 'example').length).toBe(1);
    });
  });

  describe('getTemplate', () => {
    it('returns a JSON-loaded template when present', async () => {
      const { readDir, readFile } = fixture({ 'custom.json': JSON.stringify(validCustom) });
      const pm = new ProfileManager({ readDir, readFile });
      const t = await pm.getTemplate('custom');
      expect(t.name).toBe('custom');
      expect(t.techStack).toContain('Next.js');
    });

    it('falls back to the in-code built-in for built-in names', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const t = await pm.getTemplate('example');
      expect(t.name).toBe('example');
      expect(t.directories.backend).toBe('api/');
    });

    it('falls back to generic for unknown names', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const t = await pm.getTemplate('nonexistent');
      expect(t.name).toBe('generic');
    });

    it('returns a fresh copy, not the shared PROFILES entry', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const t = await pm.getTemplate('example');
      t.artifactFormat.push('mutated.md');
      // The shared table must not be mutated.
      expect(PROFILES.example.artifactFormat).not.toContain('mutated.md');
    });
  });

  describe('resolve', () => {
    it('layers the registered on-disk path onto the template as rootPath', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const registered: RegisteredProjectOverride = {
        path: '/Users/x/my-project',
        profileName: 'example',
      };
      const profile = await pm.resolve({ registered });
      expect(profile.name).toBe('example');
      expect(profile.rootPath).toBe('/Users/x/my-project');
    });

    it('rejects a relative registered path (does not set rootPath)', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({
        registered: { path: 'relative/./path', profileName: 'example' },
      });
      // Root path authoritative promise: a relative path is NOT honored.
      expect(profile.rootPath).toBeUndefined();
      expect(profile.name).toBe('example'); // template still resolved
    });

    it('request projectProfile can re-point the template for a registered project', async () => {
      const { readDir, readFile } = fixture({ 'custom.json': JSON.stringify(validCustom) });
      const pm = new ProfileManager({ readDir, readFile });
      // Registered says example, but the request overrides to custom.
      const profile = await pm.resolve({
        registered: { path: '/Users/x/p', profileName: 'example' },
        projectProfile: 'custom',
      });
      expect(profile.name).toBe('custom');
      expect(profile.rootPath).toBe('/Users/x/p'); // path still layered on
    });

    it('uses request projectProfile when no registered project is given', async () => {
      const { readDir, readFile } = fixture({ 'custom.json': JSON.stringify(validCustom) });
      const pm = new ProfileManager({ readDir, readFile });
      const profile = await pm.resolve({ projectProfile: 'custom' });
      expect(profile.name).toBe('custom');
      expect(profile.rootPath).toBeUndefined();
    });

    it('falls back to URL detection when neither registered nor projectProfile', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ url: 'http://localhost:5173' });
      expect(profile.name).toBe('example'); // detectProfile matches example
    });

    it('returns generic when nothing is supplied', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({});
      expect(profile.name).toBe('generic');
    });

    it('returns a fresh object (caller may mutate without touching PROFILES)', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ projectProfile: 'example' });
      profile.rootPath = '/tmp/x';
      expect(PROFILES.example.rootPath).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // P3-1: resolve() surfaces the profile's optional intakeApi adapter (so a
  // future route can pick the Phase 3 HTTP path vs the Phase 1 file path at call
  // time), and cloneProfile deep-clones intakeApi + its nested bodyTemplate so
  // caller mutation of a resolved profile can't poison the shared PROFILES table
  // or the JSON-profile cache (same invariant as intakeLineFormat).
  // -------------------------------------------------------------------------
  describe('P3-1 intakeApi resolve + clone', () => {
    const customWithApi: ProfileEntry = {
      name: 'api-profile',
      urlPatterns: ['localhost:4000'],
      techStack: ['Next.js'],
      directories: { frontend: 'app/' },
      artifactFormat: ['spec.md'],
      promptContext: 'api project',
      intakeApi: {
        baseUrl: 'http://localhost:9999',
        upsertPath: '/api/ideas',
        method: 'POST',
        auth: 'demoIntakeKey',
        bodyTemplate: { title: '{title}', spec: '{spec}' },
      },
    };

    it('resolve() surfaces intakeApi on the built-in example profile', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ projectProfile: 'example' });
      expect(profile.intakeApi).toBeDefined();
      expect(profile.intakeApi?.upsertPath).toBe('/api/ideas');
      expect(profile.intakeApi?.auth).toBe('exampleIntakeKey');
    });

    it('resolve() omits intakeApi on the generic profile (file-handoff default)', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ projectProfile: 'generic' });
      expect(profile.intakeApi).toBeUndefined();
    });

    it('resolve() surfaces intakeApi on a JSON-loaded profile', async () => {
      const { readDir, readFile } = fixture({ 'api-profile.json': JSON.stringify(customWithApi) });
      const pm = new ProfileManager({ readDir, readFile });
      const profile = await pm.resolve({ projectProfile: 'api-profile' });
      expect(profile.intakeApi).toBeDefined();
      expect(profile.intakeApi?.baseUrl).toBe('http://localhost:9999');
      expect(profile.intakeApi?.bodyTemplate.title).toBe('{title}');
    });

    it('resolve() layers rootPath onto a profile that also carries intakeApi', async () => {
      const { readDir, readFile } = fixture({ 'api-profile.json': JSON.stringify(customWithApi) });
      const pm = new ProfileManager({ readDir, readFile });
      const profile = await pm.resolve({
        registered: { path: '/Users/x/p', profileName: 'api-profile' },
      });
      expect(profile.rootPath).toBe('/Users/x/p');
      expect(profile.intakeApi?.upsertPath).toBe('/api/ideas'); // adapter preserved through the layer
    });

    it('cloneProfile deep-clones intakeApi — mutating it never touches PROFILES', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ projectProfile: 'example' });
      expect(profile.intakeApi).toBeDefined();
      // Mutate the resolved profile's adapter body + nested map.
      profile.intakeApi!.upsertPath = '/api/tampered';
      profile.intakeApi!.bodyTemplate.title = '{tampered}';
      profile.intakeApi!.bodyTemplate.injected = '{x}';
      // The shared PROFILES table must NOT be mutated.
      expect(PROFILES.example.intakeApi?.upsertPath).toBe('/api/ideas');
      expect(PROFILES.example.intakeApi?.bodyTemplate.title).toBe('{title}');
      expect(PROFILES.example.intakeApi?.bodyTemplate.injected).toBeUndefined();
    });

    it('cloneProfile deep-clones intakeApi — a JSON-loaded profile never poisons its cache', async () => {
      const { readDir, readFile } = fixture({ 'api-profile.json': JSON.stringify(customWithApi) });
      const pm = new ProfileManager({ readDir, readFile });
      const a = await pm.getTemplate('api-profile');
      a.intakeApi!.bodyTemplate.title = '{tampered}';
      a.intakeApi!.upsertPath = '/api/tampered';
      // A second fetch returns an un-mutated copy.
      const b = await pm.getTemplate('api-profile');
      expect(b.intakeApi?.upsertPath).toBe('/api/ideas');
      expect(b.intakeApi?.bodyTemplate.title).toBe('{title}');
    });
  });

  // -------------------------------------------------------------------------
  // P3-4: resolve() surfaces the profile's optional statusApi board adapter,
  // and cloneProfile deep-clones statusApi + its nested itemFieldMappings so
  // caller mutation of a resolved profile can't poison the shared PROFILES table
  // or the JSON-profile cache (same invariant as intakeApi/intakeLineFormat).
  // -------------------------------------------------------------------------
  describe('P3-4 statusApi resolve + clone', () => {
    const customWithStatusApi: ProfileEntry = {
      name: 'board-profile',
      urlPatterns: ['localhost:4000'],
      techStack: ['Next.js'],
      directories: { frontend: 'app/' },
      artifactFormat: ['spec.md'],
      promptContext: 'board project',
      statusApi: {
        baseUrl: 'http://localhost:9999',
        boardPath: '/api/items',
        itemPath: '/api/items/{id}',
        auth: 'demoIntakeKey',
        pollMs: 7000,
        itemFieldMappings: { id: 'ideaId', title: 'name', status: 'state', url: 'link' },
      },
    };

    it('resolve() surfaces statusApi on the built-in example profile', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ projectProfile: 'example' });
      expect(profile.statusApi).toBeDefined();
      expect(profile.statusApi?.boardPath).toBe('/api/ideas');
      expect(profile.statusApi?.itemPath).toBe('/api/ideas/{id}');
      expect(profile.statusApi?.auth).toBe('exampleIntakeKey');
      expect(profile.statusApi?.pollMs).toBe(5000);
    });

    it('resolve() omits statusApi on the generic profile (no board tab for unknown projects)', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ projectProfile: 'generic' });
      expect(profile.statusApi).toBeUndefined();
    });

    it('resolve() surfaces statusApi on a JSON-loaded profile', async () => {
      const { readDir, readFile } = fixture({ 'board-profile.json': JSON.stringify(customWithStatusApi) });
      const pm = new ProfileManager({ readDir, readFile });
      const profile = await pm.resolve({ projectProfile: 'board-profile' });
      expect(profile.statusApi).toBeDefined();
      expect(profile.statusApi?.baseUrl).toBe('http://localhost:9999');
      expect(profile.statusApi?.itemFieldMappings.id).toBe('ideaId');
      expect(profile.statusApi?.itemFieldMappings.url).toBe('link');
    });

    it('resolve() layers rootPath onto a profile that also carries statusApi', async () => {
      const { readDir, readFile } = fixture({ 'board-profile.json': JSON.stringify(customWithStatusApi) });
      const pm = new ProfileManager({ readDir, readFile });
      const profile = await pm.resolve({
        registered: { path: '/Users/x/p', profileName: 'board-profile' },
      });
      expect(profile.rootPath).toBe('/Users/x/p');
      expect(profile.statusApi?.boardPath).toBe('/api/items'); // adapter preserved through the layer
    });

    it('cloneProfile deep-clones statusApi — mutating it never touches PROFILES', async () => {
      const pm = new ProfileManager({ readDir: async () => [], readFile: async () => '' });
      const profile = await pm.resolve({ projectProfile: 'example' });
      expect(profile.statusApi).toBeDefined();
      // Mutate the resolved profile's adapter scalars + nested mappings map. The
      // itemFieldMappings clone is the critical guard — without it a caller adding
      // a mapping key would write through to the shared PROFILES.example entry.
      profile.statusApi!.boardPath = '/api/tampered';
      profile.statusApi!.pollMs = 1;
      profile.statusApi!.itemFieldMappings.id = 'tamperedId';
      profile.statusApi!.itemFieldMappings.injected = 'x';
      // The shared PROFILES table must NOT be mutated.
      expect(PROFILES.example.statusApi?.boardPath).toBe('/api/ideas');
      expect(PROFILES.example.statusApi?.pollMs).toBe(5000);
      expect(PROFILES.example.statusApi?.itemFieldMappings.id).toBe('id');
      expect(PROFILES.example.statusApi?.itemFieldMappings.injected).toBeUndefined();
    });

    it('cloneProfile deep-clones statusApi — a JSON-loaded profile never poisons its cache', async () => {
      const { readDir, readFile } = fixture({ 'board-profile.json': JSON.stringify(customWithStatusApi) });
      const pm = new ProfileManager({ readDir, readFile });
      const a = await pm.getTemplate('board-profile');
      a.statusApi!.boardPath = '/api/tampered';
      a.statusApi!.itemFieldMappings.id = 'tamperedId';
      a.statusApi!.itemFieldMappings.injected = 'x';
      // A second fetch returns an un-mutated copy.
      const b = await pm.getTemplate('board-profile');
      expect(b.statusApi?.boardPath).toBe('/api/items');
      expect(b.statusApi?.itemFieldMappings.id).toBe('ideaId');
      expect(b.statusApi?.itemFieldMappings.injected).toBeUndefined();
    });
  });

  describe('real config/profiles/ dir (default constructor)', () => {
    it('loads the shipped example.json + generic.json', async () => {
      const pm = new ProfileManager(); // default dir
      const loaded = await pm.loadJsonProfiles();
      expect(loaded.get('example')?.techStack).toContain('React 19');
      expect(loaded.get('generic')?.name).toBe('generic');
    });
  });
});
