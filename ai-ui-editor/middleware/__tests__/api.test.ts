import { describe, it, expect } from 'vitest';

describe('Middleware API (Integration - requires running server)', () => {
  const BASE_URL = 'http://localhost:3000';

  // Helper to check if server is running
  async function isServerRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  it('should respond to health check', async () => {
    const running = await isServerRunning();
    if (!running) {
      console.log('SKIP: Server not running');
      return;
    }
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  it('should generate AI edit options', async () => {
    const running = await isServerRunning();
    if (!running) {
      console.log('SKIP: Server not running');
      return;
    }
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
  }, 10000);

  it('should validate files', async () => {
    const running = await isServerRunning();
    if (!running) {
      console.log('SKIP: Server not running');
      return;
    }
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
  }, 10000);
});
