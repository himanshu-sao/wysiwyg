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
  example: {
    name: 'example',
    urlPatterns: ['localhost:5173', 'localhost:8006'],
    techStack: ['React 19', 'Vite', 'Tailwind', 'TypeScript'],
    directories: {
      backend: 'api/',
      frontend: 'src/',
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