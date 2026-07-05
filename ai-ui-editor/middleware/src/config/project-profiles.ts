/**
 * Project Profiles Configuration
 *
 * Defines target projects that wysiwyg can work with.
 * Each profile includes tech stack, directory structure, and AI context.
 */

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
}

/**
 * Built-in project profiles
 */
export const PROFILES: Record<string, ProjectProfile> = {
  antikythera: {
    name: 'antikythera',
    urlPatterns: ['localhost:5173', 'localhost:8006'],
    techStack: ['FastAPI', 'React 19', 'Vite', 'Tailwind', 'Python 3.9'],
    directories: {
      backend: 'api/',
      frontend: 'ui/src/',
      requirements: 'automation-ideas/',
    },
    artifactFormat: ['spec.md', 'architecture.md', 'tests.md', 'execution_report.md'],
    intakeFile: 'automation-ideas/ideas.md',
    agents: ['Orchestrator', 'Refiner', 'Architect', 'Tester', 'Executor', 'Audit', 'Memory'],
    promptContext: `antikythera is a FastAPI + React multi-agent automation platform with:
- Backend: api/ (FastAPI, state managers, integration adapters)
- Frontend: ui/src/ (React 19, Vite, Tailwind)
- Data: automation-ideas/ (JSON state, requirements artifacts)
- Agents: Orchestrator, Refiner, Architect, Tester, Executor, Audit, Memory
- Pipeline: INTAKE → DISCOVERY → BLUEPRINT → IMPLEMENTATION → UNIT_VERIFY → INTEGRATION → SYSTEM_VAL → HANDOVER → DONE`,
  },
  generic: {
    name: 'generic',
    urlPatterns: ['localhost:*'],
    techStack: ['React', 'Vite'],
    directories: {
      frontend: 'src/',
    },
    artifactFormat: ['spec.md'],
    intakeFile: 'TODO.md',
    promptContext: `A generic React/Vue/Svelte project with:
- Frontend: src/ directory
- Standard build tooling (Vite/Webpack)
- CSS/styling support`,
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