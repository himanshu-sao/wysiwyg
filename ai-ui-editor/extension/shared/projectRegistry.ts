// P1-0: Project Registry — pure logic for the user-registered on-disk project
// paths. The extension persists these in chrome.storage.local and uses the active
// project's `path` as the authoritative `projectRoot` for edit/export modes
// (replacing the `window.location.origin` placeholder).
//
// This module is deliberately chrome-free so it can be unit-tested in node.
// The chrome.storage.local adapter is injected via the RegistryStorage contract
// from `./types`. `background.ts` supplies that adapter; tests supply an in-memory
// one. Path validation (does the dir look like a project root?) is delegated to
// the middleware's /api/files/probe-root endpoint and is required BEFORE a path
// enters the registry — see `add({ validatePath })`.

import type { ProjectRegistryState, RegisteredProject, RegistryStorage } from './types';

// A registry entry collects a registered project's stable fields. The optional
// `oraclingProfile` lets the caller defer profile detection to background.ts
// (which already imports project-profiles / detectProfile).
export interface AddProjectInput {
  path: string;        // absolute on-disk path the user typed
  displayName?: string; // optional user override; defaults to path basename
  profileName?: string; // optional; defaults to 'generic'
  registeredAt?: number; // injectable for deterministic tests (unix ms)
}

// Profile-detector hook — background supplies detectProfile(url). Kept as a
// function prop so the pure module has no import-time coupling to chrome or
// the middleware profile table.
export type ProfileDetector = (url: string) => { name: string };

// Marker-probe hook — background calls the middleware /api/files/probe-root
// endpoint and returns { valid, marker } so the registry can refuse non-roots.
// Tests inject a synchronous stub.
export type MarkerValidator = (rawPath: string) => Promise<{ valid: boolean; marker: string | null }>;

// Indexed lookups by both origin (per-origin active) and global override.
export interface RegistrySnapshot {
  state: ProjectRegistryState;
}

export interface Registry {
  // Load state from storage (idempotent; safe to call repeatedly).
  load(): Promise<ProjectRegistryState>;
  // Return the current state (must load() first).
  getState(): ProjectRegistryState;
  // Register a project. Validates the path via the injected marker validator
  // before accepting. Throws if the path is invalid (relative, missing, no marker).
  // Returns the newly-registered project. If the same path is already registered,
  // returns the existing entry unchanged (idempotent on path).
  add(input: AddProjectInput, hooks?: { validatePath?: MarkerValidator }): Promise<RegisteredProject>;
  // List all registered projects.
  list(): RegisteredProject[];
  // Set the active project for a given origin (per-origin), or set the global
  // override when `origin` is undefined. `projectId` must reference a registered
  // project. Throws if unknown.
  selectActive(projectId: string, origin?: string): Promise<void>;
  // Clear the global override so per-origin selection takes over again.
  clearOverride(): Promise<void>;
  // Resolve the active project for a given origin, honoring the global override
  // when set. Returns undefined when nothing is registered/active for it.
  getActive(origin: string): RegisteredProject | undefined;
  // Set the global override to a specific project id (`undefined` clears it).
  setOverride(projectId: string | undefined): Promise<void>;
}

const STORAGE_KEY = 'wysiwyg:project-registry:v1';

// Defensive shape so a corrupt/cross-version storage blob can't crash the UI.
// Returns an empty registry if anything is structurally wrong.
export function normalizeState(raw: any): ProjectRegistryState {
  if (!raw || typeof raw !== 'object') {
    return emptyState();
  }
  const projects = Array.isArray(raw.projects) ? raw.projects.filter(isRegisteredProject) : [];
  const activeByOrigin =
    raw.activeByOrigin && typeof raw.activeByOrigin === 'object' ? raw.activeByOrigin : {};
  const globalActiveId =
    typeof raw.globalActiveId === 'string' ? raw.globalActiveId : undefined;
  return { projects, activeByOrigin, globalActiveId };
}

function emptyState(): ProjectRegistryState {
  return { projects: [], activeByOrigin: {} };
}

// Structural check for a single RegisteredProject pulled from untrusted storage.
function isRegisteredProject(p: any): p is RegisteredProject {
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.id === 'string' &&
    typeof p.path === 'string' &&
    typeof p.profileName === 'string' &&
    typeof p.displayName === 'string' &&
    typeof p.registeredAt === 'number'
  );
}

// Derive a stable id from a path so re-registering the same path is idempotent
// (same id → same registry slot) regardless of trailing slashes or casing quirks.
// We do NOT lowercase (paths are case-significant on *nix) — we just strip a
// trailing separator.
export function pathToId(rawPath: string): string {
  const trimmed = rawPath.replace(/[\\/]+$/, '');
  return `proj:${trimmed}`;
}

// Default display name = last path segment, falling back to the raw path for
// roots like "/".
export function defaultDisplayName(rawPath: string): string {
  const trimmed = rawPath.replace(/[\\/]+$/, '');
  const base = trimmed.split(/[\\/]/).pop();
  return base && base.length > 0 ? base : rawPath;
}

export function createRegistry(storage: RegistryStorage): Registry {
  let state: ProjectRegistryState = emptyState();
  let loaded = false;

  async function load(): Promise<ProjectRegistryState> {
    const raw = await storage.get();
    state = normalizeState(raw);
    loaded = true;
    return state;
  }

  function ensureLoaded(): ProjectRegistryState {
    if (!loaded) {
      // Callers should load() first; if they didn't, surface an empty state
      // rather than silently operating on stale memory.
      state = emptyState();
    }
    return state;
  }

  async function persist(next: ProjectRegistryState): Promise<void> {
    state = next;
    await storage.set(next);
  }

  async function add(
    input: AddProjectInput,
    hooks?: { validatePath?: MarkerValidator }
  ): Promise<RegisteredProject> {
    const cleanPath = input.path?.trim();
    if (!cleanPath) {
      throw new Error('Registry: path is required');
    }
    // Absolute-only — a relative path is meaningless across the extension/
    // middleware boundary (the middleware writes against it).
    if (!isAbsolute(cleanPath)) {
      throw new Error(`Registry: path must be absolute, got "${cleanPath}"`);
    }
    if (cleanPath.includes('..')) {
      throw new Error('Registry: path must not contain ".."');
    }

    // Require a marker on disk before accepting (P1-0 design: reject without marker).
    const validatePath = hooks?.validatePath;
    if (validatePath) {
      const probe = await validatePath(cleanPath);
      if (!probe.valid) {
        throw new Error(
          `Registry: "${cleanPath}" is not a project root (no package.json/pyproject.toml/Cargo.toml/go.mod/.git found)`
        );
      }
    }

    const snapshot = ensureLoaded();
    const id = pathToId(cleanPath);
    const existing = snapshot.projects.find((p) => p.id === id);
    if (existing) {
      // Idempotent: re-registering the same path returns the existing entry.
      return existing;
    }

    const project: RegisteredProject = {
      id,
      path: cleanPath,
      profileName: input.profileName?.trim() || 'generic',
      displayName: input.displayName?.trim() || defaultDisplayName(cleanPath),
      registeredAt: typeof input.registeredAt === 'number' ? input.registeredAt : 0,
    };

    await persist({
      ...snapshot,
      projects: [...snapshot.projects, project],
    });
    return project;
  }

  function list(): RegisteredProject[] {
    return ensureLoaded().projects;
  }

  async function selectActive(projectId: string, origin?: string): Promise<void> {
    const snapshot = ensureLoaded();
    const known = snapshot.projects.some((p) => p.id === projectId);
    if (!known) {
      throw new Error(`Registry: unknown project id "${projectId}"`);
    }
    if (origin === undefined) {
      // No origin → set the global override.
      await persist({ ...snapshot, globalActiveId: projectId });
      return;
    }
    const nextByOrigin = { ...snapshot.activeByOrigin, [origin]: projectId };
    await persist({ ...snapshot, activeByOrigin: nextByOrigin });
  }

  async function setOverride(projectId: string | undefined): Promise<void> {
    const snapshot = ensureLoaded();
    if (projectId !== undefined) {
      const known = snapshot.projects.some((p) => p.id === projectId);
      if (!known) {
        throw new Error(`Registry: unknown project id "${projectId}"`);
      }
    }
    await persist({ ...snapshot, globalActiveId: projectId });
  }

  async function clearOverride(): Promise<void> {
    const snapshot = ensureLoaded();
    const { globalActiveId: _drop, ...rest } = snapshot;
    await persist(rest);
  }

  function getActive(origin: string): RegisteredProject | undefined {
    const snapshot = ensureLoaded();
    // Global override wins over per-origin selection.
    if (snapshot.globalActiveId) {
      const g = snapshot.projects.find((p) => p.id === snapshot.globalActiveId);
      if (g) return g;
    }
    const idForOrigin = snapshot.activeByOrigin[origin];
    if (!idForOrigin) return undefined;
    return snapshot.projects.find((p) => p.id === idForOrigin);
  }

  function getState(): ProjectRegistryState {
    return ensureLoaded();
  }

  return {
    load,
    getState,
    add,
    list,
    selectActive,
    clearOverride,
    getActive,
    setOverride,
  };
}

// isAbsolute — minimal cross-platform check without importing 'path' (extension
// bundle is browser-targeted; keep node deps out). A leading '/' on *nix or a
// drive letter ("<X>:" or "<X>\\") on Windows counts as absolute.
function isAbsolute(p: string): boolean {
  if (p.startsWith('/')) return true;
  // Windows drive absolute: C:\ or C:/ (case-insensitive on the letter).
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  return false;
}

export { STORAGE_KEY };
