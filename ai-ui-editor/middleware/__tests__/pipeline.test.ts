import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import Fastify from 'fastify';
import { makePipelineRoutes } from '../src/routes/pipeline';
import { PipelineClient, type FetchAdapter } from '../src/services/PipelineClient';
import { ProfileManager } from '../src/services/ProfileManager';

// P3-3: hermetic pipeline-route tests. The route's job is to BRANCH on the
// resolved profile's transport (HTTP intake adapter vs Phase 1 file handoff)
// and wire the secret through correctly. We exercise it through Fastify's
// `app.inject` with:
//   - the file branch backed by a real temp-dir + git init (appendRequirements
//     is unchanged; a registered projectRoot points at tmpdir), and
//   - the API branch backed by a fake `fetch` (in-memory) injected into a real
//     PipelineClient, so the request the route assembles is the one we assert
//     against — no live network.
//
// What this file pins (the P3-3 TODO checklist):
//   - file-fallback when `intakeApi` absent (generic profile → mode='file').
//   - HTTP POST when `intakeApi` present (example profile → mode='api').
//   - the secret is relayed as `Authorization: Bearer …` and never persists
//     (the recorded request carries it only in the header; the recorded body
//     and any error surfaced to the popup do NOT contain the raw secret).
//   - an empty/absent secret for an intakeApi profile is a clear 400 (we refuse
//     to send an unauthenticated POST the target would reject with a confusing 401).
//   - a non-2xx upstream surfaces as 502 (bad-gateway) with a redacted message.

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop()!;
    await fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

async function mkdtemp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wysiwyg-pipeline-'));
  dirs.push(dir);
  // Init a git repo so appendRequirements' atomic commit can run.
  await simpleGit({ baseDir: dir }).init();
  return dir;
}

/** A recorded in-memory fetch stub (mirrors PipelineClient.test.ts' stubFetch). */
function makeFetchStub(response: {
  status: number;
  ok: boolean;
  body?: unknown;
  rawText?: string;
}): { fetch: FetchAdapter; calls: { url: string; init?: Parameters<FetchAdapter>[1] }[] } {
  const calls: { url: string; init?: Parameters<FetchAdapter>[1] }[] = [];
  const fetch: FetchAdapter = async (url, init) => {
    calls.push({ url, init });
    return {
      status: response.status,
      ok: response.ok,
      json:
        response.rawText === undefined
          ? async () => (response.body ?? null)
          : async () => { throw new Error('not json'); },
      text: async () =>
        response.rawText ?? (response.body === undefined ? '' : JSON.stringify(response.body)),
    };
  };
  return { fetch, calls };
}

/**
 * Build a Fastify app with the pipeline routes under `/api/pipeline`, injecting
 * a fake-fetch-backed PipelineClient (for the API branch) and a real
 * ProfileManager (resolution is a pure in-memory template lookup — no disk).
 * `calls` holds every fetch invocation so tests assert the URL/headers/body the
 * route assembled.
 */
async function buildApp(opts: {
  fetch?: FetchAdapter;
}): Promise<{
  app: ReturnType<typeof Fastify>;
  calls: { url: string; init?: Parameters<FetchAdapter>[1] }[];
}> {
  const profileManager = new ProfileManager();
  let calls: { url: string; init?: Parameters<FetchAdapter>[1] }[] = [];
  let injectedFetch: FetchAdapter | undefined;
  if (opts.fetch) {
    // Wrap so the throwing-fetch path is also recorded.
    calls = [];
    const inner = opts.fetch;
    injectedFetch = async (url, init) => {
      calls.push({ url, init });
      return inner(url, init);
    };
  }
  const pipelineClient = new PipelineClient({ fetch: injectedFetch });
  const app = Fastify();
  await app.register(makePipelineRoutes({ profileManager, pipelineClient }), {
    prefix: '/api/pipeline',
  });
  return { app, calls };
}

/** Minimal valid upsert body; callers override individual fields. */
function baseBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    spec: '# My Feature\n\n## Overview\nFix the nav.\n',
    priority: 'Medium',
    architectureHints: ['src/Nav.tsx'],
    testScenarios: ['renders'],
    edgeCases: ['empty menu'],
    instruction: 'Fix the broken nav',
    // projectRoot is required by the Zod schema even on the API branch (which
    // never uses it) — supply a tmpdir by default so the API tests don't need
    // to set it. The file branch overrides with a real dir.
    projectRoot: '/tmp/wysiwyg-pipeline-unused-root',
    ...overrides,
  };
}

describe('POST /api/pipeline/upsert (P3-3)', () => {
  describe('file-fallback branch — profile with no intakeApi', () => {
    it('delegates to appendRequirements and returns mode="file" with ID + specPath', async () => {
      const dir = await mkdtemp();
      const { app } = await buildApp({}); // no fetch → file branch only

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: baseBody({
            projectRoot: dir,
            // generic profile has NO intakeApi → file handoff (Phase 1 path).
            projectProfile: 'generic',
          }),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(true);
        expect(body.mode).toBe('file');
        expect(body.id).toBe('ID-001');
        expect(body.specPath).toBe(path.resolve(dir, '.wysiwyg/requirements/ID-001/spec.md'));
        // The spec file actually landed on disk (proves delegation ran).
        const spec = await fs.readFile(body.specPath, 'utf-8');
        expect(spec).toContain('ID-001');
      } finally {
        await app.close();
      }
    });

    it('uses a registered project path as the write root (registry-aware resolution)', async () => {
      const dir = await mkdtemp();
      const { app } = await buildApp({});

      try {
        // The route delegates to appendRequirements, which writes against
        // `req.projectRoot` (the registered path is what the popup sends). With
        // a registeredProject override + projectRoot pointing at the tmpdir,
        // the spec lands under that dir.
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: baseBody({
            projectRoot: dir,
            registeredProject: { path: dir, profileName: 'generic' },
          }),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(true);
        expect(body.mode).toBe('file');
        expect(body.specPath).toContain(dir);
      } finally {
        await app.close();
      }
    });
  });

  describe('API branch — profile with intakeApi', () => {
    it('POSTs to the intake endpoint with Bearer auth and returns mode="api" with remote id/url', async () => {
      // The example profile ships an intakeApi (baseUrl http://localhost:8006,
      // upsertPath /api/ideas). Use a registeredProject so the resolver layers
      // the path; profile name 'example' → intakeApi present → API branch.
      const dir = await mkdtemp();
      const { fetch, calls } = makeFetchStub({
        status: 201,
        ok: true,
        body: { id: 'idea-42', url: 'http://localhost:8006/ideas/42' },
      });
      const { app } = await buildApp({ fetch });

      try {
        const secret = 'bearer-token-do-not-leak';
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: baseBody({
            registeredProject: { path: dir, profileName: 'example' },
            secret,
          }),
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(true);
        expect(body.mode).toBe('api');
        expect(body.remoteId).toBe('idea-42');
        expect(body.remoteUrl).toBe('http://localhost:8006/ideas/42');
        // `id` mirrors remoteId for the popup's "Sent as {id}" banner path.
        expect(body.id).toBe('idea-42');
        expect(body.specPath).toBeUndefined(); // no file write on the API branch

        // The recorded request: POST to baseUrl+upsertPath, Bearer header set.
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://localhost:8006/api/ideas');
        expect(calls[0].init?.method).toBe('POST');
        expect(calls[0].init?.headers?.Authorization).toBe(`Bearer ${secret}`);
        expect(calls[0].init?.headers?.['Content-Type']).toBe('application/json');
        // The secret appears ONLY in the Authorization header — never in the body.
        const sentBody = JSON.parse(calls[0].init?.body ?? '{}');
        expect(JSON.stringify(sentBody)).not.toContain(secret);
      } finally {
        await app.close();
      }
    });

    it('surfaces a clear 400 when an intakeApi profile is exported with no secret', async () => {
      // The popup relayed an empty secret — a configuration error. Surface it
      // clearly rather than sending an unauthenticated POST the target would
      // likely reject with a confusing 401 we'd then have to redact.
      const dir = await mkdtemp();
      const { fetch, calls } = makeFetchStub({ status: 200, ok: true, body: { id: 'x' } });
      const { app } = await buildApp({ fetch });

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: baseBody({
            registeredProject: { path: dir, profileName: 'example' },
            // no secret field → empty → 400 before any network call
          }),
        });
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.mode).toBe('api');
        expect(body.error).toMatch(/no secret was supplied/);
        expect(body.error).toContain('exampleIntakeKey'); // names the auth, not its value
        // No call reached the target.
        expect(calls).toHaveLength(0);
      } finally {
        await app.close();
      }
    });

    it('surfaces a 502 (bad gateway) for a non-2xx upstream and does NOT leak the secret', async () => {
      const dir = await mkdtemp();
      const secret = 'sk-upstream-rejects-this';
      // A 401 from the target echoes the secret back in the body — PipelineClient
      // redacts it before throwing; the route must preserve that redaction in the
      // 502 error message it returns to the popup.
      const { fetch } = makeFetchStub({
        status: 401,
        ok: false,
        rawText: `Unauthorized — bad token ${secret}`,
      });
      const { app } = await buildApp({ fetch });

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: baseBody({
            registeredProject: { path: dir, profileName: 'example' },
            secret,
          }),
        });
        expect(res.statusCode).toBe(502);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.mode).toBe('api');
        // The status the target returned is surfaced (auditability)…
        expect(body.error).toMatch(/status 401/);
        // …but the raw secret is redacted out of the message → never reaches the popup.
        expect(body.error).not.toContain(secret);
        expect(res.body).not.toContain(secret);
      } finally {
        await app.close();
      }
    });

    it('surfaces a 502 for a network-layer fetch failure with the secret redacted', async () => {
      const dir = await mkdtemp();
      const secret = 'sk-network-fails';
      const { app } = await buildApp({
        fetch: async () => {
          throw new Error(`ECONNREFUSED token=${secret}`);
        },
      });

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: baseBody({
            registeredProject: { path: dir, profileName: 'example' },
            secret,
          }),
        });
        expect(res.statusCode).toBe(502);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.mode).toBe('api');
        expect(body.error).toMatch(/network request failed/);
        expect(body.error).not.toContain(secret);
        expect(res.body).not.toContain(secret);
      } finally {
        await app.close();
      }
    });
  });

  describe('request validation + route registration', () => {
    it('returns 400 for an invalid body (missing required fields)', async () => {
      const { app } = await buildApp({});
      try {
        // priority is required (enum) and omitted here → Zod rejects → 400.
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: {
            spec: '# hi',
            instruction: 'x',
            projectRoot: '/tmp/x',
          },
        });
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/Invalid request/i);
      } finally {
        await app.close();
      }
    });

    it('registers POST /upsert under the /api/pipeline prefix (route exists, not 404)', async () => {
      // P3-3 TODO: "+1 route-registration assertion." A POST with an empty body
      // must hit the route (400 from Zod) rather than 404 — proves server.ts
      // registered the plugin at /api/pipeline.
      const { app } = await buildApp({});
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/pipeline/upsert',
          payload: {},
        });
        expect(res.statusCode).not.toBe(404);
        expect(res.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });
  });
});
