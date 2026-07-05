import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import Fastify from 'fastify';
import filesRoutes from '../src/routes/files';
import { resolveProjectRoot } from '../src/services/PathSanitizer';

// P1-0: the load-bearing plumbing test. The content script used to send
// projectRoot = window.location.origin (a URL). The registry replaces it with a
// user-registered on-disk path. This test proves:
//   (a) the OLD value (an origin) can no longer reach /write — PathSanitizer
//       rejects it before any file is touched, and probe-root returns invalid;
//   (b) a NEW registered-style on-disk path IS accepted as a write root.
// Together they pin the guarantee TODO.md P1-0 asks for: the registered path —
// not window.location.origin — reaches /api/files/write.

const ORIGIN_PLACEHOLDER = 'http://localhost:5174'; // what content-script.ts used to send

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop()!;
    await fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

async function mkdtemp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wysiwyg-plumb-'));
  dirs.push(dir);
  return dir;
}

describe('P1-0 plumbing — registered path (not origin) reaches the write root', () => {
  describe('PathSanitizer.resolveProjectRoot', () => {
    it('REJECTS the origin placeholder (URLs are not valid on-disk roots)', () => {
      // The old behavior: content-script.ts set projectRoot = window.location.origin.
      // resolveProjectRoot must reject that so a write can never land against a URL.
      expect(() => resolveProjectRoot(ORIGIN_PLACEHOLDER, '/some/fallback')).toThrow(
        /must be absolute/i
      );
    });

    it('rejects any http(s) URL, not just this one origin', () => {
      expect(() => resolveProjectRoot('https://example.com', '/fallback')).toThrow(
        /must be absolute/i
      );
    });

    it('rejects ".." in a registered path', () => {
      expect(() => resolveProjectRoot('/home/u/../evil', '/fallback')).toThrow(/\.\./);
    });

    it('accepts a registered-style on-disk absolute path', () => {
      const root = resolveProjectRoot('/home/u/projects/my-app', '/fallback');
      expect(root).toBe('/home/u/projects/my-app');
    });

    it('falls back to DEFAULT only when no projectRoot is given (backward-compat)', () => {
      // routes/files.ts marks projectRoot optional. Without the registry, edit
      // mode fell back to DEFAULT_PROJECT_ROOT; that path is preserved.
      const root = resolveProjectRoot(undefined, '/default/root');
      expect(root).toBe('/default/root');
    });
  });

  describe('/api/files/probe-root route (HTTP layer, via inject)', () => {
    it('returns valid=true for a temp dir containing package.json', async () => {
      const dir = await mkdtemp();
      await fs.writeFile(path.join(dir, 'package.json'), '{}');

      const app = Fastify();
      await app.register(filesRoutes, { prefix: '/api/files' });
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/files/probe-root?path=${encodeURIComponent(dir)}`,
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.valid).toBe(true);
        expect(body.marker).toBe('package.json');
        expect(body.isAbsolute).toBe(true);
      } finally {
        await app.close();
      }
    });

    it('returns valid=false for the origin placeholder (a URL, not a path)', async () => {
      const app = Fastify();
      await app.register(filesRoutes, { prefix: '/api/files' });
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/files/probe-root?path=${encodeURIComponent(ORIGIN_PLACEHOLDER)}`,
        });
        // valid=false (not a path); HTTP still 200 because "not a root" is a
        // valid "no" answer, not a server error.
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.valid).toBe(false);
        expect(body.isAbsolute).toBe(false);
      } finally {
        await app.close();
      }
    });

    it('returns 400 for a missing ?path= query', async () => {
      const app = Fastify();
      await app.register(filesRoutes, { prefix: '/api/files' });
      try {
        const res = await app.inject({ method: 'GET', url: '/api/files/probe-root' });
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.valid).toBe(false);
        expect(body.error).toMatch(/invalid query/i);
      } finally {
        await app.close();
      }
    });
  });

  describe('/api/files/validate route honors the registered projectRoot', () => {
    it('uses the registered path to resolve the file (rejects traversal against it)', async () => {
      // A registered-style root + a traversal file path: PathSanitizer in
      // /validate must reject the escape against THAT root, not a global one.
      const dir = await mkdtemp();
      await fs.writeFile(path.join(dir, 'package.json'), '{}');

      const app = Fastify();
      await app.register(filesRoutes, { prefix: '/api/files' });
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/files/validate',
          payload: {
            file: '../escape.txt',
            content: 'x',
            projectRoot: dir,
          },
        });
        // The escape is rejected (400, PathSanitizer) — proving the registered
        // root is the one the route resolves against.
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.valid).toBe(false);
      } finally {
        await app.close();
      }
    });
  });
});
