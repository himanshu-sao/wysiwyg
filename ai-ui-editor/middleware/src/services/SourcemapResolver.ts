import { promises as fs } from 'fs';
import * as path from 'path';
import { SourceMapConsumer } from 'source-map';
import { safeFilePath } from './PathSanitizer';

/**
 * SourcemapResolver — maps a DOM element back to its original source file +
 * line + source text, using the sourcemap of the <script> that produced it.
 *
 * Flow (P7 / MVP-05 / MVP-18):
 *   1. The content script sends the element's originating `scriptUrl` (e.g.
 *      "/src/components/Card.tsx" in Vite dev) plus, optionally, a generated
 *      line:column within that script.
 *   2. We fetch the served script text from the dev server (pageUrl as base).
 *   3. We find its sourcemap — inline (`//# sourceMappingURL=data:...base64`)
 *      or external (`foo.js.map`) — and parse it.
 *   4. `source-map`'s `originalPositionFor` maps the generated line:col to an
 *      original `source:line:column`.
 *   5. The source file path is normalized against projectRoot (and rejected by
 *      `safeFilePath` if it tries to escape it — defense vs. malicious maps).
 *   6. `sourceCode` is taken from the map's `sourcesContent` when present
 *      (Vite packs the original text inline, so no disk read needed);
 *      otherwise read from disk.
 *   7. If generated line:col is missing (we rarely can pin an exact DOM node's
 *      position in browser-only context), we search `sourcesContent` for the
 *      element's distinctive outerHTML to pin `sourceLine` heuristically.
 *
 * If anything fails (no map, prod build, traversal), we return nulls and the
 * caller falls back to MVP-18 manual file-selection.
 */

export interface ResolvedSource {
  sourceFile: string | null; // project-relative, e.g. "src/components/Card.tsx"
  sourceLine: number | null;
  sourceCode: string | null;
}

export interface ResolveOptions {
  pageUrl: string; // the page URL, used as base for resolving relative scriptUrl
  projectRoot: string;
}

// Injectable so tests can avoid a real dev server. Node 20 ships a global
// fetch; we fall back to it when no override is supplied.
type FetchLike = (url: string) => Promise<Response>;
let fetchOverride: FetchLike | null = null;
export function setFetchForTesting(f: FetchLike | null) {
  fetchOverride = f;
}
async function doFetch(url: string): Promise<Response> {
  const f = fetchOverride ?? (globalThis.fetch as FetchLike);
  if (!f) throw new Error('fetch is not available in this environment');
  return f(url);
}

/**
 * Resolve a clicked element back to its source file, line, and text.
 *
 * @param scriptUrl     the <script src> that originated the element
 *                      (may be relative like "/src/Card.tsx", or absolute)
 * @param generatedLine 1-based line of the element within the served script
 *                      (optional — when absent we search by elementText)
 * @param generatedColumn 1-based column within the served script (optional)
 * @param elementText   the element's outerHTML, used to locate the line
 *                      inside sourcesContent when generatedLine is unknown
 * @param opts           pageUrl (base) + projectRoot
 */
export async function resolveSource(
  scriptUrl: string | undefined,
  generatedLine: number | undefined,
  generatedColumn: number | undefined,
  elementText: string | undefined,
  opts: ResolveOptions
): Promise<ResolvedSource> {
  const empty: ResolvedSource = { sourceFile: null, sourceLine: null, sourceCode: null };

  if (!scriptUrl || !scriptUrl.trim()) {
    return empty;
  }

  try {
    const scriptAbsUrl = resolveScriptUrl(scriptUrl, opts.pageUrl);
    const scriptText = await fetchText(scriptAbsUrl);
    if (!scriptText) return empty;

    const map = await extractSourcemap(scriptText, scriptAbsUrl);
    if (!map) {
      // Last-resort: the script URL itself looks like a source file.
      return resolveFromUrl(scriptUrl, opts.projectRoot);
    }

    const consumer = await new SourceMapConsumer(map as any);

    let original: { source: string | null; line: number | null; column: number | null } = {
      source: null,
      line: null,
      column: null,
    };

    if (generatedLine && generatedLine > 0) {
      const pos = consumer.originalPositionFor({
        line: generatedLine,
        column: Math.max(0, generatedColumn ?? 0),
      });
      original = { source: pos.source, line: pos.line, column: pos.column };
    }

    // No usable line:col → try to pin via elementText in sourcesContent.
    if (!original.source && elementText) {
      original = locateByElementText(map as any, elementText);
    }

    // Fallback: if the map has exactly one source (common per-component Vite
    // build), attribute the element to that source even without a line.
    if (!original.source) {
      const sources = (map as any).sources as string[] | undefined;
      if (sources && sources.length === 1) {
        original = { source: sources[0], line: original.line, column: original.column };
      }
    }

    if (!original.source) {
      consumer.destroy();
      return empty;
    }

    const sourceFile = normalizeSourcePath(original.source, scriptUrl);
    let absPath: string;
    try {
      absPath = safeFilePath(opts.projectRoot, sourceFile);
    } catch {
      // Malicious/escaped path in the map — refuse.
      consumer.destroy();
      return empty;
    }

    let sourceCode: string | null = null;
    const sourcesContent = (map as any).sourcesContent as (string | null)[] | undefined;
    if (sourcesContent) {
      const idx = indexOfSource(map as any, original.source as string);
      if (idx != null && sourcesContent[idx] != null) {
        sourceCode = sourcesContent[idx]!;
      }
    }
    if (sourceCode == null) {
      try {
        sourceCode = await fs.readFile(absPath, 'utf-8');
      } catch {
        sourceCode = null;
      }
    }

    consumer.destroy();
    return {
      sourceFile,
      sourceLine: original.line,
      sourceCode,
    };
  } catch (error) {
    console.error('[SourcemapResolver] resolution failed:', error);
    return empty;
  }
}

/** Turn a possibly-relative script URL into an absolute fetch URL. */
function resolveScriptUrl(scriptUrl: string, pageUrl: string): string {
  try {
    return new URL(scriptUrl, pageUrl).href;
  } catch {
    return scriptUrl;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await doFetch(url);
    if (!res.ok) {
      console.warn(`[SourcemapResolver] fetch ${url} returned ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (error) {
    console.warn('[SourcemapResolver] fetch failed:', error);
    return null;
  }
}

/**
 * Pull the sourcemap out of a script's trailing `//# sourceMappingURL=...`
 * comment. Handles inline `data:application/json;base64,...` and external
 * `foo.js.map` URLs (the latter triggers one extra fetch).
 */
async function extractSourcemap(
  scriptText: string,
  scriptAbsUrl: string
): Promise<Record<string, unknown> | null> {
  const match = scriptText.match(/\/\/[#@]\s*sourceMappingURL=(.+)$/m);
  if (!match) return null;

  const rawUrl = match[1].trim();

  // Inline data URI: data:application/json;base64,XXXX
  const dataMatch = rawUrl.match(/^data:(?:application\/[^;,]+)?;base64,(.+)$/);
  if (dataMatch) {
    try {
      const json = Buffer.from(dataMatch[1], 'base64').toString('utf-8');
      return JSON.parse(json);
    } catch (error) {
      console.warn('[SourcemapResolver] bad inline sourcemap:', error);
      return null;
    }
  }

  // External .map file
  try {
    const mapUrl = new URL(rawUrl, scriptAbsUrl).href;
    const mapText = await fetchText(mapUrl);
    if (!mapText) return null;
    return JSON.parse(mapText);
  } catch (error) {
    console.warn('[SourcemapResolver] bad external sourcemap URL:', error);
    return null;
  }
}

/**
 * When we have no generated line:col, search sourcesContent for a distinctive
 * snippet of the element's outerHTML and report its line in that source.
 */
function locateByElementText(
  map: { sources?: string[]; sourcesContent?: (string | null)[] },
  elementText: string
): { source: string | null; line: number | null; column: number | null } {
  const snippet = distinctiveSnippet(elementText);
  if (!snippet) return { source: null, line: null, column: null };

  const sources = map.sources ?? [];
  const contents = map.sourcesContent ?? [];
  for (let i = 0; i < sources.length; i++) {
    const content = contents[i];
    if (!content) continue;
    const idx = content.indexOf(snippet);
    if (idx >= 0) {
      // Convert character offset to 1-based line within the original source.
      const line = content.slice(0, idx).split('\n').length;
      return { source: sources[i], line, column: 0 };
    }
  }
  return { source: null, line: null, column: null };
}

/** Pick a short, stable substring of outerHTML to search for (no whitespace). */
function distinctiveSnippet(elementText: string): string | null {
  const classMatch = elementText.match(/className="([^"]{4,})"/);
  if (classMatch && classMatch[1]) {
    return classMatch[1].split(/\s+/)[0];
  }
  const idMatch = elementText.match(/id="([^"]{2,})"/);
  if (idMatch && idMatch[1]) return idMatch[1];
  const tagMatch = elementText.match(/^<([a-zA-Z][a-zA-Z0-9]*)[^>]{0,40}/);
  return tagMatch ? tagMatch[0] : null;
}

/** Normalize a `source` entry from a sourcemap to a project-relative path. */
function normalizeSourcePath(source: string, scriptUrl: string): string {
  let s = source.replace(/\\/g, '/');

  // Vite dev: source is often just "Card.tsx" (basename) while the script URL
  // already encodes the full path "/src/components/Card.tsx". Reconstruct.
  if (!s.includes('/') && scriptUrl) {
    const fromUrl = path.posix.normalize(scriptUrl).replace(/^\//, '');
    if (fromUrl.endsWith(s)) return fromUrl;
    const dir = path.posix.dirname(fromUrl);
    return path.posix.join(dir, s);
  }

  // Strip a webpack:// scheme / leading "./" / leading "/".
  s = s.replace(/^[a-z]+:\/\/[^/]*\//, ''); // "webpack://./src/..." -> "src/..."
  s = s.replace(/^\.\//, '').replace(/^\//, '');
  return s;
}

/** Index of a `source` entry, accounting for basename differences (Vite). */
function indexOfSource(map: { sources?: string[] }, source: string): number | null {
  const sources = map.sources;
  if (!sources) return null;
  const exact = sources.indexOf(source);
  if (exact >= 0) return exact;
  const base = path.basename(source);
  for (let i = 0; i < sources.length; i++) {
    if (sources[i] === base || path.basename(sources[i]) === base) return i;
  }
  return null;
}

/**
 * Best-effort fallback when there's no sourcemap at all but the script URL
 * itself looks like a source file path (Vite dev form "/src/...").
 */
async function resolveFromUrl(
  scriptUrl: string,
  projectRoot: string
): Promise<ResolvedSource> {
  const cleaned = scriptUrl.replace(/\\/g, '/').replace(/^\//, '');
  // NOTE: intentionally exclude '.js'/'.css' from this fallback — a bundled .js
  // with no sourcemap is NOT a source file. Only directly-served source
  // extensions (Vite dev form /src/*.tsx) qualify here.
  const looksLikeSource = /\.(tsx|ts|jsx|vue|svelte)$/.test(cleaned);
  if (!looksLikeSource) {
    return { sourceFile: null, sourceLine: null, sourceCode: null };
  }
  let absPath: string;
  try {
    absPath = safeFilePath(projectRoot, cleaned);
  } catch {
    return { sourceFile: null, sourceLine: null, sourceCode: null };
  }
  try {
    const sourceCode = await fs.readFile(absPath, 'utf-8');
    return { sourceFile: cleaned, sourceLine: null, sourceCode };
  } catch {
    return { sourceFile: cleaned, sourceLine: null, sourceCode: null };
  }
}
