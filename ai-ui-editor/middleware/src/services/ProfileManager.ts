/**
 * ProfileManager — P2-2: the Profile Loader.
 *
 * Composes three sources of per-project context into one resolved `ProjectProfile`:
 *
 *   1. The in-code built-in `PROFILES` table (P1-1).
 *   2. On-disk JSON profiles under `config/profiles/*.json` (P2-1) — loaded
 *      lazily and validated by `validateProfileEntry`, so a malformed file is
 *      skipped (with a logged warning) rather than poisoning the prompt builder.
 *   3. A **user-registered project** passed by the extension (the P1-0 registry
 *      entry: `{ path, profileName }`). The registry itself lives in
 *      chrome.storage.local on the extension side; the middleware never reads
 *      it directly. Instead the extension sends the *active* registered
 *      project's `path` + `profileName` with each request, and `ProfileManager`
 *      layers that onto the matching template:
 *        - `rootPath` ← the registered on-disk path (the authoritative `projectRoot`)
 *        - `markers`  ← narrowed/kept per the template
 *
 * Resolution order (highest precedence wins):
 *   a registered override (`profileName` + `path`) → a JSON file → the in-code
 *   `PROFILES` table → `PROFILES.generic` as the final fallback.
 *
 * This module is deliberately fs-injected so it can be unit-tested in node
 * without a real `config/profiles/` dir: the directory path is a ctor arg
 * (default resolves to this package's real `config/profiles/`), and the FS
 * read is done through `fs/promises`.
 *
 * It does NOT replace `getProfile`/`detectProfile` wholesale — those stay for
 * the URL-only path. `ProfileManager.resolve()` is the registry-aware upgrade
 * callers migrate to as they learn the active registered project (P2-3).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  PROFILES,
  ProfileEntry,
  ProjectProfile,
  validateProfileEntry,
  detectProfile,
} from '../config/project-profiles';

/**
 * A user-registered project as the middleware sees it. The extension sends the
 * active entry's stable fields with each request; we don't need the full
 * `RegisteredProject` (no id/registeredAt for resolution).
 */
export interface RegisteredProjectOverride {
  path: string;          // absolute on-disk path → becomes profile.rootPath
  profileName: string;   // which built-in/JSON template to layer onto
}

export interface ProfileManagerOptions {
  /** Directory holding `<name>.json` profile files. Default: this package's
   *  `src/config/profiles/` (resolved from this file's location). */
  profilesDir?: string;
  /** Inject the fs reader (tests use an in-memory stub). Defaults to real fs. */
  readDir?: (dir: string) => Promise<string[]>;
  readFile?: (file: string) => Promise<string>;
}

export class ProfileManager {
  private readonly profilesDir: string;
  private readonly readDir: (dir: string) => Promise<string[]>;
  private readonly readFile: (file: string) => Promise<string>;

  // Lazily loaded JSON profiles (valid only), keyed by entry.name.
  private jsonProfiles: Map<string, ProfileEntry> | null = null;
  private loadError: string | null = null;

  constructor(opts: ProfileManagerOptions = {}) {
    this.profilesDir = opts.profilesDir ?? defaultProfilesDir();
    this.readDir = opts.readDir ?? ((d) => fs.readdir(d));
    this.readFile = opts.readFile ?? ((f) => fs.readFile(f, 'utf8'));
  }

  /**
   * Load + validate every `*.json` under `profilesDir`. Safe to call
   * repeatedly; caches the result. A directory read failure (missing dir,
   * permissions) is not fatal — we log once and return an empty map, falling
   * back to the in-code `PROFILES` table for resolution.
   */
  async loadJsonProfiles(): Promise<Map<string, ProfileEntry>> {
    if (this.jsonProfiles !== null) return this.jsonProfiles;
    const out = new Map<string, ProfileEntry>();
    try {
      const entries = await this.readDir(this.profilesDir);
      for (const file of entries) {
        if (!file.endsWith('.json')) continue;
        const full = path.join(this.profilesDir, file);
        let raw: string;
        try {
          raw = await this.readFile(full);
        } catch (e) {
          this.loadError = `failed to read ${file}: ${(e as Error).message}`;
          // eslint-disable-next-line no-console
          console.warn(`[ProfileManager] ${this.loadError} — skipping`);
          continue;
        }
        const result = validateProfileEntry(JSON.parse(raw));
        if (!result.valid) {
          // eslint-disable-next-line no-console
          console.warn(`[ProfileManager] invalid profile ${file}: ${result.error} — skipping`);
          continue;
        }
        // Pin by the file's `name` field (not the filename) so a mis-named
        // file can't shadow silently.
        out.set(result.entry.name, result.entry);
      }
    } catch (e) {
      this.loadError = `could not read profiles dir "${this.profilesDir}": ${(e as Error).message}`;
      // eslint-disable-next-line no-console
      console.warn(`[ProfileManager] ${this.loadError} — using in-code PROFILES only`);
    }
    this.jsonProfiles = out;
    return out;
  }

  /** Surface the last load warning (or null). For diagnostics/tests. */
  lastLoadError(): string | null {
    return this.loadError;
  }

  /**
   * List every known profile name (in-code built-ins + JSON-loaded), built-ins
   * first so `generic`/`example` keep stable ordering. JSON entries that share
   * a name with a built-in are reported once (dedup by name).
   */
  async listProfileNames(): Promise<string[]> {
    const json = await this.loadJsonProfiles();
    const names = new Set<string>(Object.keys(PROFILES));
    for (const n of json.keys()) names.add(n);
    return Array.from(names);
  }

  /**
   * Get a profile template by name *without* a registered override — i.e. the
   * raw built-in/JSON entry. Falls back to `generic` for unknown names (same
   * contract as the legacy `getProfile`). Returns a deep copy (nested arrays/
   * objects cloned) so callers may mutate freely without poisoning the
   * shared `PROFILES` table or the JSON cache.
   */
  async getTemplate(name: string | undefined): Promise<ProjectProfile> {
    if (!name) return cloneProfile(PROFILES.generic);
    const json = await this.loadJsonProfiles();
    if (json.has(name)) return cloneProfile(json.get(name)!);
    if (PROFILES[name]) return cloneProfile(PROFILES[name]);
    return cloneProfile(PROFILES.generic);
  }

  /**
   * The registry-aware resolver. Given an optional registered project (from the
   * extension's P1-0 registry) and/or a request's `projectProfile` name +
   * `url`, return the resolved `ProjectProfile` with `rootPath` layered on when
   * a registered path is present.
   *
   * Precedence:
   *   1. `registered` override (layer `path` → `rootPath` onto its `profileName`
   *      template), if present.
   *   2. `projectProfile` name (request-supplied) → its template.
   *   3. `url` → `detectProfile(url)` (legacy URL auto-detect; built-in only).
   *   4. `generic`.
   *
   * The returned object is always a fresh copy (never the shared `PROFILES`
   * entry), so callers may safely set runtime-only fields without mutating state.
   */
  async resolve(params: {
    registered?: RegisteredProjectOverride | null;
    projectProfile?: string;
    url?: string;
  }): Promise<ProjectProfile> {
    const { registered, projectProfile, url } = params;

    if (registered) {
      // Allow the request-supplied name to re-point the template for a
      // registered project (e.g. the user overrode the detected profile in the
      // popup); the registered path still wins as rootPath.
      const template =
        projectProfile && projectProfile !== registered.profileName
          ? await this.getTemplate(projectProfile)
          : await this.getTemplate(registered.profileName);
      // Layer the registered on-disk path as rootPath. Never accept a relative
      // path here — it would defeat P1-0's authoritative-on-disk-root promise.
      const rootPath = isAbsolute(registered.path) ? registered.path : undefined;
      return { ...template, ...(rootPath ? { rootPath } : {}) };
    }

    if (projectProfile) {
      return this.getTemplate(projectProfile);
    }

    if (url) {
      return cloneProfile(detectProfile(url));
    }

    return cloneProfile(PROFILES.generic);
  }

  /** Reset the JSON-profile cache. Exposed for tests that swap the profiles dir. */
  invalidateCache(): void {
    this.jsonProfiles = null;
    this.loadError = null;
  }
}

/**
 * Default `config/profiles/` dir = this package's `src/config/profiles/`,
 * resolved from this file so it's correct whether run from `src/` (vitest) or
 * `dist/` (built server). `import.meta.url` is the ESM-safe equivalent of
 * `__dirname`.
 */
function defaultProfilesDir(): string {
  const here = path.dirname(thisFileDir());
  return path.resolve(here, '..', 'config', 'profiles');
}

/**
 * Deep-enough copy of a ProjectProfile: top-level fields are copied, and the
 * mutable nested ones (arrays: urlPatterns/techStack/artifactFormat/agents/
 * markers/artifactTemplates; objects: directories/intakeLineFormat/intakeApi)
 * are cloned one level down so caller mutation can't reach the shared `PROFILES`
 * table or the JSON-profile cache. (`promptContext` is an immutable string;
 * copying it is a plain assignment.)
 */
function cloneProfile(p: ProjectProfile): ProjectProfile {
  return {
    ...p,
    urlPatterns: [...p.urlPatterns],
    techStack: [...p.techStack],
    directories: { ...p.directories },
    artifactFormat: [...p.artifactFormat],
    ...(p.agents ? { agents: [...p.agents] } : {}),
    ...(p.markers ? { markers: [...p.markers] } : {}),
    ...(p.intakeLineFormat ? { intakeLineFormat: { ...p.intakeLineFormat } } : {}),
    ...(p.artifactTemplates
      ? { artifactTemplates: p.artifactTemplates.map((t) => ({ name: t.name, sections: [...t.sections] })) }
      : {}),
    // Phase 3: deep-clone intakeApi + its nested bodyTemplate record so a caller
    // mutating a resolved profile's adapter can't poison the shared PROFILES table or
    // the JSON-profile cache (same reason intakeLineFormat is cloned above).
    ...(p.intakeApi
      ? { intakeApi: { ...p.intakeApi, bodyTemplate: { ...p.intakeApi.bodyTemplate } } }
      : {}),
    // Phase 3-4: deep-clone statusApi + its nested itemFieldMappings record (same
    // safety reasoning as intakeApi above — mutation guard for the shared table).
    ...(p.statusApi
      ? { statusApi: { ...p.statusApi, itemFieldMappings: { ...p.statusApi.itemFieldMappings } } }
      : {}),
  };
}

// ESM-aware dirname-of-this-file. Falls back to process.cwd() when
// `import.meta.url` is unavailable (defensive; should not happen under our
// tsconfig). Kept in a function so the fallback is isolated.
function thisFileDir(): string {
  try {
    // @ts-ignore — import.meta is available at runtime under ESM.
    const url: string = import.meta.url;
    return url.startsWith('file:') ? fileURLToPath(url) : url;
  } catch {
    return process.cwd();
  }
}

// isAbsolute — minimal cross-platform check (mirrors the one in
// projectRegistry.ts; kept local so ProfileManager has no cross-package import).
function isAbsolute(p: string): boolean {
  if (p.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  return false;
}
