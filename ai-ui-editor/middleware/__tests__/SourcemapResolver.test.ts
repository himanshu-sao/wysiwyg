import { describe, it, expect, afterEach } from 'vitest';
import { resolveSource, setFetchForTesting } from '../src/services/SourcemapResolver';

// Build an inline data: sourcemap as a served script's trailing comment.
function inlineScript(map: object, extra = ''): string {
  const json = JSON.stringify(map);
  const b64 = Buffer.from(json, 'utf-8').toString('base64');
  return `${extra}//# sourceMappingURL=data:application/json;base64,${b64}\n`;
}

// Minimal valid map. Vite dev packs sourcesContent + a per-component single source.
function makeMap(opts: { sources: string[]; sourcesContent?: (string | null)[] }) {
  return {
    version: 3,
    sources: opts.sources,
    sourcesContent: opts.sourcesContent,
    names: [],
    mappings: '', // we don't exercise originalPositionFor here (no generatedLine)
  };
}

const PROJECT_ROOT = '/home/user/project';

describe('SourcemapResolver', () => {
  afterEach(() => setFetchForTesting(null));

  it('resolves sourceFile + sourceCode from an inline map (sourcesContent)', async () => {
    const sourceCode = 'export function Card() { return null; }\n';
    const map = makeMap({ sources: ['Card.tsx'], sourcesContent: [sourceCode] });
    const script = inlineScript(map);

    setFetchForTesting(async () => new Response(script, { status: 200 }));

    const res = await resolveSource('/src/components/Card.tsx', undefined, undefined, undefined, {
      pageUrl: 'http://localhost:5174/integrations',
      projectRoot: PROJECT_ROOT,
    });

    expect(res.sourceFile).toBe('src/components/Card.tsx');
    expect(res.sourceCode).toBe(sourceCode);
  });

  it('pins sourceLine by searching sourcesContent for the element text', async () => {
    const sourceCodeLines = [
      'export function Card() {',
      '  return (',
      '    <div className="p-6 rounded-lg shadow-md transition-shadow">hello</div>',
      '  );',
      '}',
    ];
    const sourceCode = sourceCodeLines.join('\n');
    const map = makeMap({ sources: ['Card.tsx'], sourcesContent: [sourceCode] });
    const script = inlineScript(map);

    setFetchForTesting(async () => new Response(script, { status: 200 }));

    const res = await resolveSource(
      '/src/components/Card.tsx',
      undefined,
      undefined,
      '<div className="p-6 rounded-lg shadow-md transition-shadow">hello</div>',
      { pageUrl: 'http://localhost:5174/', projectRoot: PROJECT_ROOT }
    );

    expect(res.sourceFile).toBe('src/components/Card.tsx');
    expect(res.sourceCode).toBe(sourceCode);
    // The className lives on line 3 of the synthetic source.
    expect(res.sourceLine).toBe(3);
  });

  it('returns nulls when the sourcemap source escapes the project root', async () => {
    const map = {
      version: 3,
      sources: ['../../etc/passwd'],
      sourcesContent: ['secret'],
      names: [],
      mappings: '',
    };
    const script = inlineScript(map);
    setFetchForTesting(async () => new Response(script, { status: 200 }));

    const res = await resolveSource('/src/x.tsx', undefined, undefined, undefined, {
      pageUrl: 'http://localhost:5174/',
      projectRoot: PROJECT_ROOT,
    });

    // normalizeSourcePath strips leading ../ but safeFilePath then rejects the
    // path that escapes; we expect sourceFile null (refused).
    expect(res.sourceFile).toBeNull();
    expect(res.sourceCode).toBeNull();
  });

  it('returns nulls when there is no sourcemap and the URL is not a source file', async () => {
    setFetchForTesting(async () => new Response('console.log(1)\n', { status: 200 }));

    const res = await resolveSource('/assets/bundle.js', undefined, undefined, undefined, {
      pageUrl: 'http://localhost:5174/',
      projectRoot: PROJECT_ROOT,
    });

    expect(res.sourceFile).toBeNull();
    expect(res.sourceLine).toBeNull();
    expect(res.sourceCode).toBeNull();
  });

  it('returns empty when scriptUrl is absent', async () => {
    const res = await resolveSource(undefined, undefined, undefined, undefined, {
      pageUrl: 'http://localhost:5174/',
      projectRoot: PROJECT_ROOT,
    });
    expect(res.sourceFile).toBeNull();
    expect(res.sourceCode).toBeNull();
  });

  it('falls back to the script URL when it looks like a source file and there is no map', async () => {
    setFetchForTesting(async () => new Response('export const x = 1;\n', { status: 200 }));

    // No sourceMappingURL in the served text, but URL ends in .tsx.
    const res = await resolveSource('/src/components/Card.tsx', undefined, undefined, undefined, {
      pageUrl: 'http://localhost:5174/',
      projectRoot: PROJECT_ROOT,
    });

    // resolveFromUrl reads from disk; this path won't exist under PROJECT_ROOT
    // (synthetic), so sourceCode is null but sourceFile is set.
    expect(res.sourceFile).toBe('src/components/Card.tsx');
    expect(res.sourceCode).toBeNull();
  });

  it('fetches an external .map when sourceMappingURL is a URL', async () => {
    const sourceCode = 'export const Button = () => null;\n';
    const map = makeMap({ sources: ['Button.tsx'], sourcesContent: [sourceCode] });
    const script = 'export const X = 1;\n//# sourceMappingURL=/src/Button.tsx.map\n';
    const mapJson = JSON.stringify(map);

    setFetchForTesting(async (url: string) => {
      if (url.endsWith('/src/components/Button.tsx')) {
        return new Response(script, { status: 200 });
      }
      if (url.endsWith('/src/Button.tsx.map')) {
        return new Response(mapJson, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const res = await resolveSource('/src/components/Button.tsx', undefined, undefined, undefined, {
      pageUrl: 'http://localhost:5174/',
      projectRoot: PROJECT_ROOT,
    });

    // The map's lone source is Button.tsx; scriptUrl is .../Button.tsx so we
    // reconstruct src/components/Button.tsx.
    expect(res.sourceFile).toBe('src/components/Button.tsx');
    expect(res.sourceCode).toBe(sourceCode);
  });
});
