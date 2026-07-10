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

  describe('real config/profiles/ dir (default constructor)', () => {
    it('loads the shipped example.json + generic.json', async () => {
      const pm = new ProfileManager(); // default dir
      const loaded = await pm.loadJsonProfiles();
      expect(loaded.get('example')?.techStack).toContain('React 19');
      expect(loaded.get('generic')?.name).toBe('generic');
    });
  });
});
