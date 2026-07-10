/**
 * Project Profiles Configuration
 *
 * Defines target projects that wysiwyg can work with.
 * Each profile includes tech stack, directory structure, and AI context.
 *
 * P2-1: the profile schema is now JSON-loadable (see `validateProfileEntry` /
 * `ProfileManager` in services). The fields below are the on-disk JSON shape:
 * `config/profiles/<name>.json` holds one `ProfileEntry` each. The in-code
 * `ProjectProfile` adds two runtime-only fields (`rootPath`, `markers`) that a
 * user-registered project layers on top of the JSON template — see
 * `PROJECT_PROFILE.md §Schema`.
 */

/**
 * The intake-line format for the backlog. `id`/`title`/`priority` are
 * interpolated by `appendRequirements`. Defaults to the verified
 * `- [${id}] ${title} | Priority: ${priority}` shape kept in code today, so
 * profiles that omit this field behave exactly as before (no behavior change).
 */
export interface IntakeLineFormat {
  template: string; // e.g. `- [${id}] ${title} | Priority: ${priority}`
}

/**
 * A per-profile artifact template. `name` is the file written under the
 * requirements dir (e.g. `spec.md`); `sections` is the ordered markdown heading
 * list P2-4 injects into the requirements prompt + the `spec.md` scaffold.
 * Backward compatible: absent → the hardcoded Overview/Requirements/Edge
 * Cases/Acceptance Criteria prompt is used.
 */
export interface ArtifactTemplate {
  name: string;        // e.g. 'spec.md' — should match an entry in artifactFormat
  sections: string[];   // e.g. ['Overview', 'Requirements', 'Edge Cases', 'Acceptance Criteria']
}

export interface ProjectProfile {
  name: string;
  urlPatterns: string[];           // Auto-detect by URL match
  techStack: string[];
  directories: {
    backend?: string;
    frontend?: string;
    requirements?: string;
  };
  artifactFormat: string[];        // e.g., ['spec.md', 'architecture.md', 'tests.md']
  intakeFile?: string;             // Where to append new TODOs
  agents?: string[];               // Known agent roles
  promptContext: string;           // Project description for AI prompts

  // P2-1 schema extensions (all optional → backward compatible):

  rootPath?: string;              // Runtime-only: the user-registered on-disk
                                  // path that becomes projectRoot (P1-0). Built-in
                                  // JSON templates never set this; a registered
                                  // project layers it on at resolve time. Not
                                  // serialized to config/profiles/*.json.

  markers?: string[];            // Project-root marker files used to validate a
                                  // registered path looks like a repo before it
                                  // enters the registry (default: the set
                                  // /api/files/probe-root already checks —
                                  // package.json, pyproject.toml, Cargo.toml,
                                  // go.mod, .git). Lets a profile narrow this
                                  // (e.g. a Python-only profile: ['pyproject.toml']).

  intakeLineFormat?: IntakeLineFormat; // Override the verified backlog line shape.
                                       // Defaults to `- [${id}] ${title} | Priority: ${priority}`.

  artifactTemplates?: ArtifactTemplate[]; // Per-artifact section lists P2-4 uses to
                                          // drive the prompt + spec.md scaffold.
                                          // Matches entries in `artifactFormat`.
}

/**
 * Built-in project profiles
 */
export const PROFILES: Record<string, ProjectProfile> = {
  example: {
    name: 'example',
    urlPatterns: ['localhost:5173', 'localhost:8006'],
    techStack: ['React 19', 'Vite', 'Tailwind', 'TypeScript'],
    directories: {
      backend: 'api/',
      frontend: 'src/',
      requirements: '.wysiwyg',
    },
    artifactFormat: ['spec.md', 'architecture.md', 'tests.md'],
    intakeFile: '.wysiwyg/ideas.md',
    agents: ['Architect', 'Tester', 'Executor'],
    promptContext: `This project is a modern web application with:
- Backend: api/ (REST API server)
- Frontend: src/ (React 19, Vite, Tailwind)
- Requirements: .wysiwyg/ (spec artifacts, ideas backlog)
- Agents: Architect, Tester, Executor
- Pipeline: INTAKE → DISCOVERY → BLUEPRINT → IMPLEMENTATION → VERIFY → DONE`,
    // P2-1: example is a Node project, so narrow the root marker to package.json.
    markers: ['package.json'],
    intakeLineFormat: { template: '- [${id}] ${title} | Priority: ${priority}' },
    artifactTemplates: [
      {
        name: 'spec.md',
        sections: ['Overview', 'Requirements', 'Scope', 'Edge Cases', 'Constraints', 'PII-Secret Handling', 'Acceptance Criteria'],
      },
      {
        name: 'architecture.md',
        sections: ['Context', 'Decision', 'Alternatives', 'Consequences'],
      },
      {
        name: 'tests.md',
        sections: ['Unit', 'Integration', 'E2E'],
      },
    ],
  },
  generic: {
    name: 'generic',
    urlPatterns: ['localhost:*'],
    techStack: ['React', 'Vite'],
    directories: {
      frontend: 'src/',
      requirements: '.wysiwyg',
    },
    artifactFormat: ['spec.md'],
    intakeFile: 'TODO.md',
    promptContext: `A generic React/Vue/Svelte project with:
- Frontend: src/ directory
- Standard build tooling (Vite/Webpack)
- CSS/styling support`,
    // P2-1: generic accepts any of the standard project markers (the probe-root
    // default set), and documents the verified default intake-line shape.
    markers: ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', '.git'],
    intakeLineFormat: { template: '- [${id}] ${title} | Priority: ${priority}' },
    artifactTemplates: [
      {
        name: 'spec.md',
        sections: ['Overview', 'Requirements', 'Edge Cases', 'Acceptance Criteria'],
      },
    ],
  },
};

/**
 * Detect project profile from URL
 */
export function detectProfile(url: string): ProjectProfile {
  const urlObj = new URL(url);
  const host = urlObj.host; // e.g., "localhost:5173"

  for (const [key, profile] of Object.entries(PROFILES)) {
    for (const pattern of profile.urlPatterns) {
      if (pattern === '*' || pattern === host ||
          (pattern.endsWith(':*') && host.startsWith(pattern.slice(0, -2)))) {
        return profile;
      }
    }
  }

  return PROFILES.generic;
}

/**
 * Get profile by name
 */
export function getProfile(name: string): ProjectProfile {
  return PROFILES[name] || PROFILES.generic;
}

/**
 * The on-disk JSON shape for a single `config/profiles/<name>.json` file.
 * It is `ProjectProfile` minus the runtime-only `rootPath` (a registered
 * project layers that on at resolve time, never serializes it).
 */
export type ProfileEntry = Omit<ProjectProfile, 'rootPath'>;

export type ProfileValidationResult =
  | { valid: true; entry: ProfileEntry }
  | { valid: false; error: string };

/**
 * P2-1: validate a parsed JSON object against the profile schema. This is the
 * boundary P2-2's `ProfileManager` uses when loading `config/profiles/*.json`,
 * so a malformed/unknown profile file can't poison the prompt builder with a
 * missing-or-wrong-typed field. Pure (no fs); throws on nothing.
 *
 * The P2-1 spec only requires `name`, `urlPatterns`, `techStack`, `directories`,
 * `artifactFormat`, `promptContext`. Everything else (`intakeFile`, `agents`,
 * `markers`, `intakeLineFormat`, `artifactTemplates`) is optional. We do NOT
 * accept `rootPath` from disk (it is runtime-only — see the type above); a
 * profile file that sets it is rejected loudly so a stale template can't
 * silently pin a write root.
 */
export function validateProfileEntry(raw: unknown): ProfileValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'profile must be a JSON object' };
  }
  const p = raw as Record<string, unknown>;

  const mustBe = <K extends string>(
    key: K,
    check: (v: unknown) => boolean,
    what: string
  ): string | null => {
    if (p[key] === undefined) return `missing required field "${key}"`;
    if (!check(p[key])) return `"${key}" must be ${what}`;
    return null;
  };

  const required = [
    mustBe('name', (v) => typeof v === 'string' && (v as string).length > 0, 'a non-empty string'),
    mustBe('urlPatterns', (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'), 'an array of strings'),
    mustBe('techStack', (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'), 'an array of strings'),
    mustBe('artifactFormat', (v) => Array.isArray(v) && (v as string[]).length > 0 && v.every((x) => typeof x === 'string'), 'a non-empty array of strings'),
    mustBe('promptContext', (v) => typeof v === 'string' && (v as string).length > 0, 'a non-empty string'),
  ];
  const reqErr = required.find((e) => e !== null);
  if (reqErr) return { valid: false, error: reqErr };

  // directories: required object; nested dirs optional strings.
  if (typeof p.directories !== 'object' || p.directories === null) {
    return { valid: false, error: '"directories" must be an object' };
  }
  const dirs = p.directories as Record<string, unknown>;
  for (const k of ['backend', 'frontend', 'requirements']) {
    if (dirs[k] !== undefined && typeof dirs[k] !== 'string') {
      return { valid: false, error: `"directories.${k}" must be a string` };
    }
  }

  // Optional-string-or-array fields.
  if (p.intakeFile !== undefined && typeof p.intakeFile !== 'string') {
    return { valid: false, error: '"intakeFile" must be a string' };
  }
  if (p.agents !== undefined && !(Array.isArray(p.agents) && p.agents.every((a) => typeof a === 'string'))) {
    return { valid: false, error: '"agents" must be an array of strings' };
  }
  if (p.markers !== undefined && !(Array.isArray(p.markers) && p.markers.every((m) => typeof m === 'string'))) {
    return { valid: false, error: '"markers" must be an array of strings' };
  }

  // intakeLineFormat: { template: string }.
  if (p.intakeLineFormat !== undefined) {
    if (typeof p.intakeLineFormat !== 'object' || p.intakeLineFormat === null) {
      return { valid: false, error: '"intakeLineFormat" must be an object' };
    }
    const ilf = p.intakeLineFormat as Record<string, unknown>;
    if (typeof ilf.template !== 'string' || (ilf.template as string).length === 0) {
      return { valid: false, error: '"intakeLineFormat.template" must be a non-empty string' };
    }
  }

  // artifactTemplates: name + sections[].
  if (p.artifactTemplates !== undefined) {
    if (!Array.isArray(p.artifactTemplates)) {
      return { valid: false, error: '"artifactTemplates" must be an array' };
    }
    for (const at of p.artifactTemplates as unknown[]) {
      if (typeof at !== 'object' || at === null) {
        return { valid: false, error: 'each "artifactTemplates" entry must be an object' };
      }
      const a = at as Record<string, unknown>;
      if (typeof a.name !== 'string' || (a.name as string).length === 0) {
        return { valid: false, error: '"artifactTemplates[].name" must be a non-empty string' };
      }
      if (!Array.isArray(a.sections) || !(a.sections as unknown[]).every((s) => typeof s === 'string')) {
        return { valid: false, error: '"artifactTemplates[].sections" must be an array of strings' };
      }
    }
  }

  // Reject rootPath on disk — runtime-only field.
  if (p.rootPath !== undefined) {
    return { valid: false, error: '"rootPath" is runtime-only and must not be set in a profile file' };
  }

  // Name claim: the file's `name` should be present; we don't cross-check the
  // filename here (that's ProfileManager's job in P2-2).
  return { valid: true, entry: p as unknown as ProfileEntry };
}