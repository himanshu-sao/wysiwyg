import { ElementContext, EditContext, EditOption } from '../../shared/types';
import { getEditPrompt } from './PromptTemplates';

export async function generateEditOptions(
  element: ElementContext,
  instruction: string,
  context: EditContext
): Promise<EditOption[]> {
  try {
    // In MVP, use a mock implementation
    // TODO: Replace with actual Opencode SDK call
    const prompt = getEditPrompt(element, instruction, context);
    const mockResponse = generateMockResponse(element, instruction, context);
    return mockResponse.options;
  } catch (error: any) {
    console.error('Opencode error:', error);
    throw new Error('Failed to generate edit options');
  }
}

function generateMockResponse(
  element: ElementContext,
  instruction: string,
  context: EditContext
): { options: EditOption[] } {
  const { sourceFile = 'src/components/Card.tsx' } = context;
  const options: EditOption[] = [];

  // Generate mock options based on common instructions
  if (instruction.toLowerCase().includes('blue') || instruction.toLowerCase().includes('color')) {
    options.push({
      id: 'color-blue',
      description: 'Change background color to blue',
      diff: '@@ -1,7 +1,7 @@\n' +
        ' <div class="p-6 rounded-lg shadow-md transition-shadow bg-white border border-gray-200 hover:shadow-lg">\n' +
        '- <div class="p-6 rounded-lg shadow-md transition-shadow bg-white border border-gray-200 hover:shadow-lg">\n' +
        '+ <div class="p-6 rounded-lg shadow-md transition-shadow bg-blue-100 border border-gray-200 hover:shadow-lg">\n' +
        '   <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '   <p class="text-gray-600">Card description</p>\n' +
        ' </div>\n',
      previewHtml: '<div class="p-6 rounded-lg shadow-md bg-blue-100 border border-gray-200">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  if (instruction.toLowerCase().includes('padding') || instruction.toLowerCase().includes('spacing')) {
    options.push({
      id: 'spacing-lg',
      description: 'Increase padding to lg',
      diff: '@@ -1,7 +1,7 @@\n' +
        ' <div class="p-6 rounded-lg shadow-md transition-shadow bg-white border border-gray-200 hover:shadow-lg">\n' +
        '- <div class="p-6 rounded-lg shadow-md transition-shadow bg-white border border-gray-200 hover:shadow-lg">\n' +
        '+ <div class="p-8 rounded-lg shadow-md transition-shadow bg-white border border-gray-200 hover:shadow-lg">\n' +
        '   <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '   <p class="text-gray-600">Card description</p>\n' +
        ' </div>\n',
      previewHtml: '<div class="p-8 rounded-lg shadow-md bg-white border border-gray-200">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  if (instruction.toLowerCase().includes('shadow') || instruction.toLowerCase().includes('depth')) {
    options.push({
      id: 'shadow-xl',
      description: 'Add extra large shadow',
      diff: '@@ -1,7 +1,7 @@\n' +
        ' <div class="p-6 rounded-lg shadow-md transition-shadow bg-white border border-gray-200 hover:shadow-lg">\n' +
        '- <div class="p-6 rounded-lg shadow-md transition-shadow bg-white border border-gray-200 hover:shadow-lg">\n' +
        '+ <div class="p-6 rounded-lg shadow-xl transition-shadow bg-white border border-gray-200 hover:shadow-2xl">\n' +
        '   <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '   <p class="text-gray-600">Card description</p>\n' +
        ' </div>\n',
      previewHtml: '<div class="p-6 rounded-lg shadow-xl bg-white border border-gray-200">\n' +
        '  <h3 class="text-xl font-semibold mb-2">Card Title</h3>\n' +
        '  <p class="text-gray-600">Card description</p>\n' +
        '</div>\n',
      file: sourceFile,
      type: 'jsx',
    });
  }

  // If no specific matches, generate a default option
  if (options.length === 0) {
    options.push({
      id: 'default',
      description: `Apply: ${instruction}`,
      diff: `// Applied: ${instruction}\n${element.html}`,
      previewHtml: element.html,
      file: sourceFile,
      type: 'jsx',
    });
  }

  return { options: options.slice(0, 3) }; // Limit to 3 options
}
