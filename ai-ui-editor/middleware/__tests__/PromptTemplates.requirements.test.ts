import { describe, it, expect, vi } from 'vitest';
import { getRequirementsPrompt } from '../src/ai/PromptTemplates';
import { ElementContext, EditContext } from '../shared/types';
import { PROFILES } from '../src/config/project-profiles';

describe('PromptTemplates - Requirements Export', () => {
  const mockElement: ElementContext = {
    html: '<button class="btn-primary">Click me</button>',
    computedStyles: { color: 'rgb(255, 255, 255)', 'background-color': 'rgb(0, 123, 255)' },
    classNames: ['btn-primary'],
    hierarchy: ['button.btn-primary', 'div.container', 'body'],
    eventListeners: ['click'],
  };

  const mockContext: EditContext = {
    url: 'http://localhost:5173',
    framework: 'react',
    projectRoot: '/Users/test/example',
    sourceFile: 'ui/src/components/Button.tsx',
    sourceCode: 'export const Button = () => <button className="btn-primary">Click me</button>;',
    scriptUrl: '/src/components/Button.tsx',
  };

  describe('getRequirementsPrompt', () => {
    it('should include project context for example profile', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Add a refresh button that polls Jira every 5 minutes',
        mockContext,
        PROFILES.example
      );

      expect(prompt).toContain('example');
      expect(prompt).toContain('REST API');
      expect(prompt).toContain('React 19');
      expect(prompt).toContain('Pipeline');
    });

    it('should include element context', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Add functionality',
        mockContext,
        PROFILES.generic
      );

      expect(prompt).toContain('<button class="btn-primary">Click me</button>');
      expect(prompt).toContain('btn-primary');
      expect(prompt).toContain('button.btn-primary > div.container > body');
    });

    it('should include user instruction', () => {
      const instruction = 'Add a refresh button that polls Jira every 5 minutes';
      const prompt = getRequirementsPrompt(
        mockElement,
        instruction,
        mockContext,
        PROFILES.example
      );

      expect(prompt).toContain(instruction);
    });

    it('should include output format specification', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Test instruction',
        mockContext,
        PROFILES.example
      );

      expect(prompt).toContain('"spec":');
      expect(prompt).toContain('"architectureHints":');
      expect(prompt).toContain('"testScenarios":');
      expect(prompt).toContain('"edgeCases":');
    });

    it('should include project-specific directory info', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Test instruction',
        mockContext,
        PROFILES.example
      );

      expect(prompt).toContain('api/');
      expect(prompt).toContain('src/');
      expect(prompt).toContain('.wysiwyg/');
    });

    it('should include agent list for example', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Test instruction',
        mockContext,
        PROFILES.example
      );

      expect(prompt).toContain('Architect');
      expect(prompt).toContain('Executor');
    });

    it('should use generic profile context for generic profile', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Test instruction',
        mockContext,
        PROFILES.generic
      );

      expect(prompt).toContain('A generic React/Vue/Svelte project');
      expect(prompt).toContain('src/');
    });

    it('should truncate long HTML snippets', () => {
      const longHtmlElement: ElementContext = {
        ...mockElement,
        html: '<div>'.repeat(100) + '</div>' + '<span>'.repeat(100),
      };

      const prompt = getRequirementsPrompt(
        longHtmlElement,
        'Test',
        mockContext,
        PROFILES.generic
      );

      // Should be truncated to 500 chars + "..."
      expect(prompt).toContain('...');
    });

    it('should handle missing script URL gracefully', () => {
      const contextWithoutScript: EditContext = {
        ...mockContext,
        scriptUrl: undefined,
      };

      const prompt = getRequirementsPrompt(
        mockElement,
        'Test',
        contextWithoutScript,
        PROFILES.generic
      );

      expect(prompt).toContain('unknown'); // For originating script
    });

    it('should include guidelines section', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Test',
        mockContext,
        PROFILES.example
      );

      expect(prompt).toContain('## Guidelines');
      expect(prompt).toContain('**spec**:');
      expect(prompt).toContain('**architectureHints**:');
      expect(prompt).toContain('**testScenarios**:');
      expect(prompt).toContain('**edgeCases**:');
    });

    // P1-6: the prompt must ask the AI for a title + priority so the popup can
    // pre-fill them before the spec is written to the project's backlog.
    it('should request a title in the output format', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Test',
        mockContext,
        PROFILES.example
      );
      expect(prompt).toContain('"title"');
      expect(prompt).toContain('**title**');
      expect(prompt).toContain('ID-XXX');
      expect(prompt).toContain('{title}');
    });

    it('should request a priority with the three allowed values', () => {
      const prompt = getRequirementsPrompt(
        mockElement,
        'Test',
        mockContext,
        PROFILES.generic
      );
      expect(prompt).toContain('"priority"');
      expect(prompt).toContain('"High"');
      expect(prompt).toContain('"Medium"');
      expect(prompt).toContain('"Low"');
      expect(prompt).toContain('**priority**');
    });
  });
});