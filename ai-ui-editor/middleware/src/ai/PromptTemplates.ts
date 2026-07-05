import { ElementContext, EditContext } from '../shared/types';
import type { ProjectProfile } from '../config/project-profiles';

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
 * Generates a structured specification for antikythera-style pipelines
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
  "spec": "# Specification\\n\\n## Overview\\nClear description...\\n\\n## Requirements\\n1. Functional requirements...\\n\\n## Edge Cases\\nEdge cases...\\n\\n## Acceptance Criteria\\nCriteria...",
  "architectureHints": ["src/components/NewComponent.tsx", "api/routes/newRoute.ts"],
  "testScenarios": ["Should render correctly", "Should handle user input", "Should error gracefully"],
  "edgeCases": ["Empty state", "Network failure", "Invalid input"]
}

## Guidelines
1. **spec**: A complete markdown specification with Overview, Requirements (numbered, testable), Edge Cases, and Acceptance Criteria
2. **architectureHints**: File paths that will likely need to be created or modified (use project's directory conventions: ${JSON.stringify(profile.directories)})
3. **testScenarios**: Specific test cases covering happy path, error cases, and edge cases
4. **edgeCases**: Unusual scenarios the implementation should handle

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
