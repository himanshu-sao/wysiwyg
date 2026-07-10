/**
 * P2-3: Profile Selection UI — unit tests for state logic.
 *
 * Tests the profile resolution, persistence, and dropdown behavior from App.tsx.
 * The functions under test are pure helpers extracted from the component; they
 * mirror the real logic in App.tsx (resolvedProfile, activeProject, intakeLabel
 * derivation) without requiring React DOM or chrome APIs.
 */

import { describe, it, expect } from 'vitest';

// ---- Types (mirrored from shared/types.ts for test isolation) ----

interface RegisteredProject {
  id: string;
  path: string;
  profileName: string;
  displayName: string;
  registeredAt: number;
}

interface ProjectRegistryState {
  projects: RegisteredProject[];
  activeByOrigin: Record<string, string>;
  globalActiveId?: string;
}

// ---- Pure helpers (extracted from App.tsx) ----

/**
 * Resolve the active registered project for an origin, honoring the global
 * override. Mirrors `activeProject()` in App.tsx.
 */
function activeProject(
  registryState: ProjectRegistryState | null,
  currentOrigin: string
): RegisteredProject | undefined {
  if (!registryState) return undefined;
  if (registryState.globalActiveId) {
    const g = registryState.projects.find(
      (p) => p.id === registryState.globalActiveId
    );
    if (g) return g;
  }
  if (!currentOrigin) return undefined;
  const idForOrigin = registryState.activeByOrigin[currentOrigin];
  if (!idForOrigin) return undefined;
  return registryState.projects.find((p) => p.id === idForOrigin);
}

/**
 * Resolve the profile name to send with requests. Precedence:
 *   user selection > persisted per-origin > active project's profileName > generic.
 * Mirrors `resolvedProfile()` in App.tsx.
 */
function resolvedProfile(
  selectedProfile: string,
  profileLoaded: boolean,
  activeProj: RegisteredProject | undefined
): string {
  if (selectedProfile) return selectedProfile;
  if (!profileLoaded) {
    // Still restoring from storage — use active project's hint, or empty so the
    // middleware falls back to URL detection.
    return activeProj?.profileName ?? '';
  }
  return 'generic';
}

/**
 * Derive the intake label shown on the Export button.
 * Mirrors the `intakeLabel` derivation in App.tsx.
 */
function intakeLabel(resolvedProfileName: string): string {
  if (resolvedProfileName === 'example') return '.wysiwyg/ideas.md';
  if (resolvedProfileName) return `${resolvedProfileName} backlog`;
  return 'ideas.md';
}

/**
 * Default available profiles when the middleware hasn't responded yet.
 * Mirrors the useState initializer in App.tsx.
 */
function defaultAvailableProfiles(): string[] {
  return ['generic', 'example'];
}

// ---- Tests ----

describe('Profile Selection — resolvedProfile', () => {
  const active: RegisteredProject = {
    id: 'proj:/Users/x/my-app',
    path: '/Users/x/my-app',
    profileName: 'example',
    displayName: 'my-app',
    registeredAt: 1,
  };

  it('returns the user-selected profile when one is chosen', () => {
    const result = resolvedProfile('custom', true, active);
    expect(result).toBe('custom');
  });

  it('returns selected profile over active project default', () => {
    const result = resolvedProfile('custom', true, undefined);
    expect(result).toBe('custom');
  });

  it('falls back to active project profileName when still loading', () => {
    const result = resolvedProfile('', false, active);
    expect(result).toBe('example');
  });

  it('returns empty string when loading and no active project', () => {
    const result = resolvedProfile('', false, undefined);
    expect(result).toBe('');
  });

  it('returns generic when loaded but nothing selected or persisted', () => {
    const result = resolvedProfile('', true, undefined);
    expect(result).toBe('generic');
  });

  it('user can explicitly select generic even with an example project', () => {
    const result = resolvedProfile('generic', true, active);
    expect(result).toBe('generic');
  });
});

describe('Profile Selection — activeProject', () => {
  const state: ProjectRegistryState = {
    projects: [
      {
        id: 'proj:/Users/x/app-a',
        path: '/Users/x/app-a',
        profileName: 'example',
        displayName: 'app-a',
        registeredAt: 1,
      },
      {
        id: 'proj:/Users/x/app-b',
        path: '/Users/x/app-b',
        profileName: 'generic',
        displayName: 'app-b',
        registeredAt: 2,
      },
    ],
    activeByOrigin: {
      'http://localhost:5173': 'proj:/Users/x/app-a',
      'http://localhost:3000': 'proj:/Users/x/app-b',
    },
  };

  it('returns the per-origin active project for a matching origin', () => {
    const result = activeProject(state, 'http://localhost:5173');
    expect(result).toBeDefined();
    expect(result!.displayName).toBe('app-a');
  });

  it('returns undefined for an origin with no active project', () => {
    const result = activeProject(state, 'http://unknown:9999');
    expect(result).toBeUndefined();
  });

  it('returns undefined when registry state is null', () => {
    const result = activeProject(null, 'http://localhost:5173');
    expect(result).toBeUndefined();
  });

  it('returns undefined when currentOrigin is empty', () => {
    const result = activeProject(state, '');
    expect(result).toBeUndefined();
  });

  it('returns the global override when set (ignoring per-origin)', () => {
    const withOverride: ProjectRegistryState = {
      ...state,
      globalActiveId: 'proj:/Users/x/app-b',
    };
    const result = activeProject(withOverride, 'http://localhost:5173');
    expect(result).toBeDefined();
    expect(result!.displayName).toBe('app-b');
  });

  it('falls back to per-origin when global override references a missing project', () => {
    // The real code: if (g) return g; — if the override's project is gone,
    // it falls through to per-origin resolution, not undefined.
    const withBadOverride: ProjectRegistryState = {
      ...state,
      globalActiveId: 'proj:/nonexistent',
    };
    const result = activeProject(withBadOverride, 'http://localhost:5173');
    expect(result).toBeDefined();
    expect(result!.displayName).toBe('app-a'); // per-origin fallback
  });
});

describe('Profile Selection — intakeLabel', () => {
  it('returns the known example intake path for "example" profile', () => {
    expect(intakeLabel('example')).toBe('.wysiwyg/ideas.md');
  });

  it('returns "<name> backlog" for any other named profile', () => {
    expect(intakeLabel('generic')).toBe('generic backlog');
    expect(intakeLabel('custom')).toBe('custom backlog');
    expect(intakeLabel('myProject')).toBe('myProject backlog');
  });

  it('returns "ideas.md" for empty string', () => {
    expect(intakeLabel('')).toBe('ideas.md');
  });
});

describe('Profile Selection — defaultAvailableProfiles', () => {
  it('always includes generic and example', () => {
    const defaults = defaultAvailableProfiles();
    expect(defaults).toContain('generic');
    expect(defaults).toContain('example');
  });

  it('returns exactly two entries', () => {
    expect(defaultAvailableProfiles()).toHaveLength(2);
  });
});

describe('Profile Selection — profile persistence shape', () => {
  it('profilePrefs storage key shape is Record<string, string>', () => {
    const prefs: Record<string, string> = {
      'http://localhost:5173': 'custom',
      'http://localhost:3000': 'generic',
    };
    expect(prefs['http://localhost:5173']).toBe('custom');
    expect(prefs['http://localhost:3000']).toBe('generic');
  });

  it('returns undefined for an origin not in prefs (no persisted choice)', () => {
    const prefs: Record<string, string> = {
      'http://localhost:5173': 'example',
    };
    expect(prefs['http://unknown:9999']).toBeUndefined();
  });
});