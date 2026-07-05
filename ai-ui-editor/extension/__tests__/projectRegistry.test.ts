import { describe, it, expect } from 'vitest';
import {
  createRegistry,
  normalizeState,
  pathToId,
  defaultDisplayName,
} from '../shared/projectRegistry';
import type { ProjectRegistryState, RegistryStorage } from '../shared/types';

// P1-0: in-memory RegistryStorage so the pure registry logic can be exercised
// without chrome.storage. Mirrors the chrome.storage.local adapter's contract.
function memoryStorage(initial: ProjectRegistryState | null = null): RegistryStorage & {
  snapshot(): ProjectRegistryState | null;
  writes: number;
} {
  let store: ProjectRegistryState | null = initial;
  let writes = 0;
  return {
    async get() {
      return store;
    },
    async set(state) {
      store = state;
      writes += 1;
    },
    snapshot() {
      return store;
    },
    get writes() {
      return writes;
    },
  };
}

// A marker validator stub that accepts a controlled set of "valid" roots.
function markerValidator(
  validPaths: string[]
): (p: string) => Promise<{ valid: boolean; marker: string | null }> {
  return async (p) =>
    validPaths.includes(p)
      ? { valid: true, marker: 'package.json' }
      : { valid: false, marker: null };
}

const ABS = '/home/u/projects/my-app';
const ABS2 = '/home/u/projects/other';

describe('projectRegistry — pure registry logic (P1-0)', () => {
  describe('pathToId', () => {
    it('strips a trailing slash so the same root is idempotent', () => {
      expect(pathToId('/foo/bar')).toBe(pathToId('/foo/bar/'));
    });
    it('strips a trailing backslash', () => {
      expect(pathToId('/foo/bar')).toBe(pathToId('/foo/bar\\'));
    });
    it('prefixes ids for namespace clarity', () => {
      expect(pathToId(ABS)).toBe(`proj:${ABS}`);
    });
  });

  describe('defaultDisplayName', () => {
    it('uses the last path segment', () => {
      expect(defaultDisplayName('/home/u/projects/my-app')).toBe('my-app');
    });
    it('falls back to the raw path for "/"', () => {
      expect(defaultDisplayName('/')).toBe('/');
    });
    it('ignores a trailing slash', () => {
      expect(defaultDisplayName('/home/u/projects/my-app/')).toBe('my-app');
    });
  });

  describe('normalizeState — defensive against bad storage', () => {
    it('returns an empty registry for null/undefined', () => {
      expect(normalizeState(null)).toEqual({ projects: [], activeByOrigin: {} });
      expect(normalizeState(undefined)).toEqual({ projects: [], activeByOrigin: {} });
    });
    it('drops structurally-invalid projects', () => {
      const raw = {
        projects: [
          { id: 'x', path: '/x', profileName: 'generic', displayName: 'x', registeredAt: 1 },
          { id: 'nope' }, // missing fields
          null,
        ],
        activeByOrigin: {},
      };
      expect(normalizeState(raw).projects).toHaveLength(1);
      expect(normalizeState(raw).projects[0].id).toBe('x');
    });
    it('coerces a non-object activeByOrigin to {}', () => {
      const out = normalizeState({ projects: [], activeByOrigin: 'oops' });
      expect(out.activeByOrigin).toEqual({});
    });
    it('drops a non-string globalActiveId', () => {
      const out = normalizeState({ projects: [], activeByOrigin: {}, globalActiveId: 42 });
      expect(out.globalActiveId).toBeUndefined();
    });
  });

  describe('add — registration + validation', () => {
    it('registers a valid project and persists it', async () => {
      const store = memoryStorage();
      const reg = createRegistry(store);
      await reg.load();
      const proj = await reg.add(
        { path: ABS, profileName: 'generic', registeredAt: 100 },
        { validatePath: markerValidator([ABS]) }
      );
      expect(proj.id).toBe(pathToId(ABS));
      expect(proj.displayName).toBe('my-app');
      const persisted = store.snapshot();
      expect(persisted?.projects).toHaveLength(1);
      expect(persisted?.projects[0].path).toBe(ABS);
      expect(store.writes).toBe(1);
    });

    it('is idempotent on an already-registered path (no new slot, registeredAt unchanged)', async () => {
      const store = memoryStorage();
      const reg = createRegistry(store);
      await reg.load();
      await reg.add({ path: ABS, registeredAt: 100 }, { validatePath: markerValidator([ABS]) });
      await reg.add({ path: ABS, registeredAt: 999 }, { validatePath: markerValidator([ABS]) });
      expect(reg.list()).toHaveLength(1);
      expect(reg.list()[0].registeredAt).toBe(100);
    });

    it('rejects a relative path', async () => {
      const reg = createRegistry(memoryStorage());
      await reg.load();
      await expect(
        reg.add({ path: 'relative/path' }, { validatePath: markerValidator(['relative/path']) })
      ).rejects.toThrow(/absolute/i);
    });

    it('rejects a path containing ".."', async () => {
      const reg = createRegistry(memoryStorage());
      await reg.load();
      await expect(
        reg.add({ path: '/home/u/../other' }, { validatePath: markerValidator(['/home/u/../other']) })
      ).rejects.toThrow(/\.\./);
    });

    it('rejects an empty path', async () => {
      const reg = createRegistry(memoryStorage());
      await reg.load();
      await expect(reg.add({ path: '   ' })).rejects.toThrow(/required/i);
    });

    it('rejects a path that fails the marker validator', async () => {
      const reg = createRegistry(memoryStorage());
      await reg.load();
      await expect(
        reg.add({ path: ABS }, { validatePath: markerValidator([]) })
      ).rejects.toThrow(/not a project root/i);
    });

    it('defaults profileName to generic when omitted', async () => {
      const reg = createRegistry(memoryStorage());
      await reg.load();
      const proj = await reg.add({ path: ABS }, { validatePath: markerValidator([ABS]) });
      expect(proj.profileName).toBe('generic');
    });

    it('accepts a Windows drive-absolute path', async () => {
      const reg = createRegistry(memoryStorage());
      await reg.load();
      const winPath = 'C:\\Users\\u\\my-app';
      const proj = await reg.add({ path: winPath }, { validatePath: markerValidator([winPath]) });
      expect(proj.id).toBe(pathToId(winPath));
    });

    it('does not require a validator (skips marker check when absent)', async () => {
      // Without a validator hook, add() skips the marker check. The background
      // always supplies one; this test pins the fallback contract.
      const reg = createRegistry(memoryStorage());
      await reg.load();
      const proj = await reg.add({ path: ABS }); // no validatePath
      expect(proj.path).toBe(ABS);
    });
  });

  describe('selectActive + getActive — per-origin and global override', () => {
    async function setup() {
      const store = memoryStorage();
      const reg = createRegistry(store);
      await reg.load();
      await reg.add({ path: ABS, registeredAt: 100 }, { validatePath: markerValidator([ABS]) });
      await reg.add({ path: ABS2, registeredAt: 200 }, { validatePath: markerValidator([ABS2]) });
      return reg;
    }

    it('returns undefined when no project is active for an origin', async () => {
      const reg = await setup();
      expect(reg.getActive('http://localhost:5173')).toBeUndefined();
    });

    it('selects a per-origin active project', async () => {
      const reg = await setup();
      await reg.selectActive(pathToId(ABS), 'http://localhost:5173');
      expect(reg.getActive('http://localhost:5173')?.path).toBe(ABS);
    });

    it('keeps per-origin selections independent across origins', async () => {
      const reg = await setup();
      await reg.selectActive(pathToId(ABS), 'http://localhost:5173');
      await reg.selectActive(pathToId(ABS2), 'http://localhost:5174');
      expect(reg.getActive('http://localhost:5173')?.path).toBe(ABS);
      expect(reg.getActive('http://localhost:5174')?.path).toBe(ABS2);
    });

    it('global override wins over per-origin selection', async () => {
      const reg = await setup();
      await reg.selectActive(pathToId(ABS), 'http://localhost:5173'); // per-origin
      await reg.selectActive(pathToId(ABS2), undefined); // global override
      expect(reg.getActive('http://localhost:5173')?.path).toBe(ABS2);
      expect(reg.getActive('http://localhost:5174')?.path).toBe(ABS2);
    });

    it('clearOverride restores per-origin selection behavior', async () => {
      const reg = await setup();
      await reg.selectActive(pathToId(ABS), 'http://localhost:5173');
      await reg.selectActive(pathToId(ABS2), undefined);
      await reg.clearOverride();
      expect(reg.getState().globalActiveId).toBeUndefined();
      expect(reg.getActive('http://localhost:5173')?.path).toBe(ABS);
    });

    it('setOverride(undefined) clears the override', async () => {
      const reg = await setup();
      await reg.setOverride(pathToId(ABS));
      await reg.setOverride(undefined);
      expect(reg.getState().globalActiveId).toBeUndefined();
    });

    it('selectActive throws on an unknown project id', async () => {
      const reg = await setup();
      await expect(reg.selectActive('does-not-exist', 'http://localhost:5173')).rejects.toThrow(
        /unknown project id/i
      );
    });

    it('setOverride throws on an unknown project id', async () => {
      const reg = await setup();
      await expect(reg.setOverride('does-not-exist')).rejects.toThrow(/unknown project id/i);
    });
  });

  describe('load + getState — persistence round-trip', () => {
    it('a fresh registry loads as empty', async () => {
      const reg = createRegistry(memoryStorage());
      const state = await reg.load();
      expect(state.projects).toEqual([]);
    });

    it('a second createRegistry() sees previously-persisted state', async () => {
      const store = memoryStorage();
      const reg1 = createRegistry(store);
      await reg1.load();
      await reg1.add({ path: ABS }, { validatePath: markerValidator([ABS]) });
      await reg1.selectActive(pathToId(ABS), 'http://localhost:5173');

      const reg2 = createRegistry(store); // same store, fresh instance
      const state = await reg2.load();
      expect(state.projects).toHaveLength(1);
      expect(state.activeByOrigin['http://localhost:5173']).toBe(pathToId(ABS));
      expect(reg2.getActive('http://localhost:5173')?.path).toBe(ABS);
    });
  });

  describe('list', () => {
    it('lists all registered projects in insertion order', async () => {
      const reg = createRegistry(memoryStorage());
      await reg.load();
      await reg.add({ path: ABS, registeredAt: 100 }, { validatePath: markerValidator([ABS]) });
      await reg.add({ path: ABS2, registeredAt: 200 }, { validatePath: markerValidator([ABS2]) });
      expect(reg.list().map((p) => p.path)).toEqual([ABS, ABS2]);
    });
  });
});
