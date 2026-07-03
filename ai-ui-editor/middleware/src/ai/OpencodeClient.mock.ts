import { ElementContext, EditContext, EditOption } from '../shared/types';

/**
 * Mock response generator for when API is unavailable
 * This is used as a fallback during development and testing
 */
export function generateMockResponse(
  element: ElementContext,
  instruction: string,
  context: EditContext
): EditOption[] {
  const { sourceFile = 'src/components/Card.tsx', sourceCode = '' } = context;
  const options: EditOption[] = [];

  // Generate mock options based on common instructions
  const lowerInstruction = instruction.toLowerCase();

  if (lowerInstruction.includes('blue') || lowerInstruction.includes('color')) {
    options.push({
      id: 'color-blue',
      description: 'Change background color to blue',
      diff: '@@ -1,7 +1,7 @@\n' +
        '- <div className="p-6 rounded-lg shadow-md bg-white border border-gray-200">\n' +
        '+ <div className="p-6 rounded-lg shadow-md bg-blue-100 border border-gray-200">\n',
      previewHtml: '<div class="p-6 rounded-lg shadow-md bg-blue-100 border border-gray-200">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  if (lowerInstruction.includes('padding') || lowerInstruction.includes('spacing')) {
    options.push({
      id: 'spacing-lg',
      description: 'Increase padding to lg',
      diff: '@@ -1,7 +1,7 @@\n' +
        '- <div className="p-6 rounded-lg shadow-md">\n' +
        '+ <div className="p-8 rounded-lg shadow-md">\n',
      previewHtml: '<div class="p-8 rounded-lg shadow-md bg-white border border-gray-200">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  if (lowerInstruction.includes('shadow') || lowerInstruction.includes('depth')) {
    options.push({
      id: 'shadow-xl',
      description: 'Add extra large shadow',
      diff: '@@ -1,7 +1,7 @@\n' +
        '- <div className="p-6 rounded-lg shadow-md">\n' +
        '+ <div className="p-6 rounded-lg shadow-xl">\n',
      previewHtml: '<div class="p-6 rounded-lg shadow-xl bg-white border border-gray-200">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  if (lowerInstruction.includes('border') || lowerInstruction.includes('outline')) {
    options.push({
      id: 'border-2',
      description: 'Add thicker border',
      diff: '@@ -1,7 +1,7 @@\n' +
        '- <div className="p-6 rounded-lg border border-gray-200">\n' +
        '+ <div className="p-6 rounded-lg border-2 border-gray-300">\n',
      previewHtml: '<div class="p-6 rounded-lg border-2 border-gray-300 bg-white">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  if (lowerInstruction.includes('round') || lowerInstruction.includes('corner')) {
    options.push({
      id: 'rounded-xl',
      description: 'Make corners more rounded',
      diff: '@@ -1,7 +1,7 @@\n' +
        '- <div className="p-6 rounded-lg">\n' +
        '+ <div className="p-6 rounded-xl">\n',
      previewHtml: '<div class="p-6 rounded-xl bg-white border border-gray-200">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  // If no specific matches, generate a default option based on instruction
  if (options.length === 0) {
    options.push({
      id: 'default',
      description: `Apply: ${instruction}`,
      diff: `@@ -1,1 +1,1 @@\n- ${element.html.substring(0, 50)}...\n+ ${element.html.substring(0, 50)}... // ${instruction}`,
      previewHtml: element.html,
      file: sourceFile,
      type: 'jsx',
    });
  }

  return options.slice(0, 3); // Limit to 3 options
}
