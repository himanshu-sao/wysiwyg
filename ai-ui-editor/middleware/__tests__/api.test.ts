import { describe, it, expect } from 'vitest';

describe('Middleware API', () => {
  const BASE_URL = 'http://localhost:3000';

  it('should respond to health check', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  it('should generate AI edit options', async () => {
    const response = await fetch(`${BASE_URL}/api/ai/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        element: {
          html: '<div class="card">Test</div>',
          computedStyles: {},
          classNames: ['card'],
          hierarchy: ['div.card', 'body'],
          eventListeners: [],
        },
        instruction: 'Make it blue',
        context: {
          url: 'http://localhost:5174',
          framework: 'react',
          projectRoot: '/tmp',
        },
      }),
    });
    const data = await response.json();
    expect(data.options).toBeDefined();
    expect(Array.isArray(data.options)).toBe(true);
    expect(data.options.length).toBeGreaterThan(0);
  });

  it('should validate files', async () => {
    const response = await fetch(`${BASE_URL}/api/files/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: 'test.ts',
        content: 'const x: number = 1;',
      }),
    });
    const data = await response.json();
    expect(data.valid).toBeDefined();
    expect(data.errors).toBeDefined();
  });
});
