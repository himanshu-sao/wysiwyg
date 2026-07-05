import { ElementContext, EditContext } from '../shared/types';

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
