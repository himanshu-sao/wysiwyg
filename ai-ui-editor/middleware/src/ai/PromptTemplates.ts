import { ElementContext, EditContext } from '../shared/types';
import type { ProjectProfile } from '../config/project-profiles';

/**
 * P2-4: The spec section set the AI must emit, in order. Driven by the active
 * profile's `artifactTemplates` `spec.md` entry; falls back to the legacy four
 * (`Overview`, `Requirements`, `Edge Cases`, `Acceptance Criteria`) when the
 * profile has no `spec.md` template (e.g. `artifactTemplates` omitted, or no
 * entry named `spec.md`, or an entry with an empty `sections` list). This is
 * the single source of truth — `routes/files.ts` reuses it for the spec.md
 * missing-section scaffold so the prompt and the writer can't drift apart.
 */
export const SPEC_SECTIONS_FALLBACK = [
  'Overview',
  'Requirements',
  'Edge Cases',
  'Acceptance Criteria',
];

export function specSectionsFor(profile: ProjectProfile): string[] {
  const specTemplate = profile.artifactTemplates?.find((t) => t.name === 'spec.md');
  return specTemplate && specTemplate.sections.length > 0
    ? specTemplate.sections
    : SPEC_SECTIONS_FALLBACK;
}

/**
 * P2-4: render the `spec` example string used in the requirements prompt's
 * Output Format block. Heading set + order come from `specSectionsFor(profile)`.
 * The first two sections get a small filled example; the rest are `_TBD._`
 * placeholders, so the model sees the exact structure it should produce.
 */
function exampleSpecString(profile: ProjectProfile): string {
  const sections = specSectionsFor(profile);
  const bodies: Record<string, string> = {
    Overview: 'Clear description of the change.',
    Requirements: '1. Functional requirement…\n2. Another requirement…',
  };
  const block = sections
    .map((s) => `## ${s}\n\n${bodies[s] ?? '_TBD.'}`)
    .join('\n\n');
  return `# Specification\n\n${block}`;
}

export function getEditPrompt(
  element: ElementContext,
  instruction: string,
  context: EditContext
): string {
  const htmlSnippet = element.html.length > 500 
    ? `${element.html.substring(0, 500)}...` 
    : element.html;
  
  const stylesSnippet = JSON.stringify(element.computedStyles, null, 2);
  const classes = element.classNames.join(' ');
  const hierarchy = element.hierarchy.join(' > ');

  return `
You are an expert frontend developer. The user wants to modify a UI element.

## Element Context
- HTML: ${htmlSnippet}
- Computed Styles: ${stylesSnippet}
- Classes: ${classes}
- Hierarchy: ${hierarchy}
- Framework: ${context.framework}
- Target File: ${context.sourceFile || 'unknown'} (line ${context.sourceLine || 'unknown'})

## Current Source Code
\`\`\`${context.framework || 'jsx'}
${context.sourceCode || ''}
\`\`\`
${
  context.sourceCode
    ? ''
    : '\n> NOTE: The source file could not be located via sourcemap, so no source code is provided. Infer the most likely target file path from the element context (framework + classes), produce a self-contained diff against a reasonable path, and keep changes minimal and valid.\n'
}
## User Instruction
"${instruction}"

## Task
Generate 2-3 distinct CSS/styling options that address the user's request. Each option must:
1. Be a valid unified diff for the target file
2. Include a complete preview HTML (with all styles inlined) for sandbox rendering
3. Follow the project's existing patterns (Tailwind, CSS modules, etc.)
4. Only modify visual/CSS properties - NO functional changes

## Output Format (JSON)
{
  "options": [
    {
      "id": "opt1",
      "description": "Brief description",
      "diff": "@@ -10,7 +10,7 @@\\n- className=\\\"card\\\"\\n+ className=\\\"card shadow-lg\\\"",
      "previewHtml": "<div class=\\\"card shadow-lg\\\">...</\\div>",
      "file": "src/components/Card.tsx",
      "type": "jsx"
    }
  ]
}
`;
}

/**
 * P1-3: Prompt template for requirements export
 * Generates a structured specification for the active project's pipeline
 */
export function getRequirementsPrompt(
  element: ElementContext,
  instruction: string,
  context: EditContext,
  profile: ProjectProfile
): string {
  const htmlSnippet = element.html.length > 500
    ? `${element.html.substring(0, 500)}...`
    : element.html;

  const classes = element.classNames.join(' ');
  const hierarchy = element.hierarchy.join(' > ');

  // P2-4: the spec section set comes from the profile's artifactTemplates
  // (spec.md entry), not a hardcoded four. The example + guideline below both
  // reflect it so the model's output structure matches the project's template.
  const specSections = specSectionsFor(profile);
  const specExample = exampleSpecString(profile).replace(/\n/g, '\\n');

  return `
You are a requirements engineer for the ${profile.name} project.

## Project Context
${profile.promptContext}

## Element Context
- HTML: ${htmlSnippet}
- Classes: ${classes}
- Hierarchy: ${hierarchy}
- Framework: ${context.framework}
- URL: ${context.url}
- Originating Script: ${context.scriptUrl || 'unknown'}

## User Instruction
"${instruction}"

## Task
Generate a structured specification for implementing this feature/requirement. The specification will be used by AI agents in a multi-agent pipeline to implement the change.

## Output Format (JSON)
{
  "title": "Short, imperative title for the requirement (3-8 words)",
  "priority": "High" | "Medium" | "Low",
  "spec": "${specExample}",
  "architectureHints": ["src/components/NewComponent.tsx", "api/routes/newRoute.ts"],
  "testScenarios": ["Should render correctly", "Should handle user input", "Should error gracefully"],
  "edgeCases": ["Empty state", "Network failure", "Invalid input"]
}

## Guidelines
1. **title**: A concise, human-readable title for this requirement. It will appear as the summary line in the project's backlog (e.g. \`- [ID-XXX] {title} | Priority: {priority}\`). Keep it short and imperative — no trailing period.
2. **priority**: One of "High", "Medium", or "Low". Judge by user impact, risk, and dependency: High for user-facing/blocking changes, Medium for normal features, Low for nice-to-haves.
3. **spec**: A complete markdown specification with these sections, in order: ${specSections.join(', ')}. Number the Requirements items and make them testable. Fill every section — if a section genuinely does not apply, write "_N/A — <reason>." under that heading so the downstream agent isn't guessing at the structure.
4. **architectureHints**: File paths that will likely need to be created or modified (use project's directory conventions: ${JSON.stringify(profile.directories)})
5. **testScenarios**: Specific test cases covering happy path, error cases, and edge cases
6. **edgeCases**: Unusual scenarios the implementation should handle

## Project-Specific Notes
- Artifact format: ${profile.artifactFormat.join(', ')}
- Backend directory: ${profile.directories.backend || 'N/A'}
- Frontend directory: ${profile.directories.frontend || 'N/A'}
- Requirements directory: ${profile.directories.requirements || 'N/A'}
${
  profile.agents && profile.agents.length > 0
    ? `- Agents involved: ${profile.agents.join(', ')}`
    : ''
}
`;
}
