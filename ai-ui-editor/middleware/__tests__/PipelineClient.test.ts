import { describe, it, expect } from 'vitest';
import {
  PipelineClient,
  assertHttpUrl,
  buildRequestBody,
  redactSecret,
  type FetchAdapter,
  type PipelineIdea,
} from '../src/services/PipelineClient';
import type { IntakeApi, ProjectProfile } from '../src/config/project-profiles';

// A minimal `ProjectProfile` carrying only the fields submitIdea reads. The
// service touches `profile.intakeApi` and nothing else, so the rest of the
// ProjectProfile shape isn't needed for these unit tests.
function profileWith(intakeApi: IntakeApi | undefined): ProjectProfile {
  return {
    name: 'test',
    urlPatterns: ['localhost:*'],
    techStack: ['React'],
    directories: { frontend: 'src/' },
    artifactFormat: ['spec.md'],
    promptContext: 'test project',
    intakeApi,
  } as unknown as ProjectProfile;
}

const exampleIntake: IntakeApi = {
  baseUrl: 'http://localhost:8006',
  upsertPath: '/api/ideas',
  method: 'POST',
  auth: 'exampleIntakeKey',
  bodyTemplate: {
    title: '{title}',
    priority: '{priority}',
    spec: '{spec}',
    architectureHints: '{architectureHints}',
    testScenarios: '{testScenarios}',
    edgeCases: '{edgeCases}',
  },
};

const exampleIdea: PipelineIdea = {
  title: 'Fix nav layout',
  priority: 'High',
  spec: '## Overview\nFix the broken nav.',
  architectureHints: ['src/Nav.tsx', 'src/Header.tsx'],
  testScenarios: ['renders on mobile', 'renders on desktop'],
  edgeCases: ['empty menu'],
};

// Builds an in-memory fetch stub that records the call and returns a preset
// response. Tests assert against the recorded request (URL, headers, body).
function stubFetch(
  response: { status: number; ok: boolean; body?: unknown; rawText?: string }
): { fetch: FetchAdapter; calls: { url: string; init?: Parameters<FetchAdapter>[1] }[] } {
  const calls: { url: string; init?: Parameters<FetchAdapter>[1] }[] = [];
  const fetch: FetchAdapter = async (url, init) => {
    calls.push({ url, init });
    const isJson = response.rawText === undefined;
    return {
      status: response.status,
      ok: response.ok,
      json: isJson
        ? async () => (response.body ?? null)
        : async () => { throw new Error('not json'); },
      text: async () =>
        response.rawText ?? (response.body === undefined ? '' : JSON.stringify(response.body)),
    };
  };
  return { fetch, calls };
}

describe('PipelineClient (P3-2)', () => {
  describe('buildRequestBody — token substitution', () => {
    it('substitutes scalar {wysiwygField} tokens from idea', () => {
      const body = buildRequestBody(exampleIntake.bodyTemplate, exampleIdea);
      expect(body.title).toBe('Fix nav layout');
      expect(body.priority).toBe('High');
      expect(body.spec).toBe('## Overview\nFix the broken nav.');
    });

    it('joins array tokens as newline-separated lists', () => {
      const body = buildRequestBody(exampleIntake.bodyTemplate, exampleIdea);
      expect(body.architectureHints).toBe('src/Nav.tsx\nsrc/Header.tsx');
      expect(body.testScenarios).toBe('renders on mobile\nrenders on desktop');
      expect(body.edgeCases).toBe('empty menu');
    });

    it('resolves a missing field to empty string rather than failing', () => {
      const body = buildRequestBody(exampleIntake.bodyTemplate, { title: 'only title' });
      expect(body.title).toBe('only title');
      expect(body.priority).toBe('');
      expect(body.spec).toBe('');
      expect(body.architectureHints).toBe('');
    });

    it('leaves an unknown {token} as-is so the miss is visible at the target', () => {
      const body = buildRequestBody({ target: '{unknownField}' }, exampleIdea);
      expect(body.target).toBe('{unknownField}');
    });

    it('preserves literal braces around non-token text', () => {
      const body = buildRequestBody({ note: 'see {title} (ref #{id})' }, { title: 'X' });
      // {title} substitutes; {id} is unknown → left as-is
      expect(body.note).toBe('see X (ref #{id})');
    });
  });

  describe('assertHttpUrl — SSRF guard', () => {
    it('accepts http and https', () => {
      expect(assertHttpUrl('http://localhost:8006').host).toBe('localhost');
      expect(assertHttpUrl('https://example.com').host).toBe('example.com');
    });

    it('rejects non-http(s) schemes', () => {
      expect(() => assertHttpUrl('file:///etc/passwd')).toThrow(/must be http\(s\)/);
      expect(() => assertHttpUrl('ftp://x/y')).toThrow(/must be http\(s\)/);
      expect(() => assertHttpUrl('data:text/plain,hi')).toThrow(/must be http\(s\)/);
    });

    it('rejects an unparseable baseUrl', () => {
      expect(() => assertHttpUrl('not a url')).toThrow(/is not a valid URL/);
    });

    it('allows loopback hosts regardless of an allowlist', () => {
      for (const host of ['localhost', '127.0.0.1', '0.0.0.0']) {
        assertHttpUrl(`http://${host}:8006`, ['some-other-host']);
        // no throw
      }
    });

    it('rejects a non-loopback host not on the allowlist', () => {
      expect(() => assertHttpUrl('https://evil.example', ['allowed.example'])).toThrow(
        /not in the allowedHosts list/
      );
    });

    it('accepts a non-loopback host that is on the allowlist', () => {
      expect(assertHttpUrl('https://allowed.example', ['allowed.example']).host).toBe(
        'allowed.example'
      );
    });

    it('skips the allowlist check when no allowlist is provided', () => {
      expect(() => assertHttpUrl('https://anything.example')).not.toThrow();
    });
  });

  describe('redactSecret', () => {
    it('strips the secret value from a message', () => {
      const secret = 'sk-super-secret-123';
      const msg = `Authorization failed for ${secret} on ${secret}`;
      expect(redactSecret(msg, secret)).toBe(
        'Authorization failed for [REDACTED] on [REDACTED]'
      );
    });

    it('is a no-op for an empty secret', () => {
      expect(redactSecret('nothing to redact', '')).toBe('nothing to redact');
    });
  });

  describe('submitIdea — no intakeApi (file-handoff default)', () => {
    it('returns a file-fallback sentinel when the profile has no intakeApi', async () => {
      const { fetch, calls } = stubFetch({ status: 200, ok: true, body: { id: 'X' } });
      const client = new PipelineClient({ fetch });
      const res = await client.submitIdea(profileWith(undefined), exampleIdea, 'unused');
      expect(res).toEqual({ mode: 'file-fallback' });
      expect(calls).toHaveLength(0); // never touches the network
    });
  });

  describe('submitIdea — happy path', () => {
    it('POSTs to baseUrl+upsertPath with the mapped body + Bearer auth', async () => {
      const { fetch, calls } = stubFetch({
        status: 201,
        ok: true,
        body: { id: 'idea-7', url: 'https://target/ideas/7' },
      });
      const client = new PipelineClient({ fetch });
      const res = await client.submitIdea(profileWith(exampleIntake), exampleIdea, 'tok-abc');

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('http://localhost:8006/api/ideas');
      expect(calls[0].init?.method).toBe('POST');
      expect(calls[0].init?.headers?.Authorization).toBe('Bearer tok-abc');
      expect(calls[0].init?.headers?.['Content-Type']).toBe('application/json');

      const sentBody = JSON.parse(calls[0].init?.body ?? '{}');
      expect(sentBody.title).toBe('Fix nav layout');
      expect(sentBody.priority).toBe('High');
      expect(sentBody.architectureHints).toBe('src/Nav.tsx\nsrc/Header.tsx');

      expect(res).toEqual({
        mode: 'api',
        ok: true,
        status: 201,
        id: 'idea-7',
        url: 'https://target/ideas/7',
        body: { id: 'idea-7', url: 'https://target/ideas/7' },
      });
    });

    it('extracts id/url under alternative key names', async () => {
      const { fetch } = stubFetch({
        status: 200,
        ok: true,
        body: { ideaId: 'alt-1', link: 'https://x/y' },
      });
      const client = new PipelineClient({ fetch });
      const res = await client.submitIdea(profileWith(exampleIntake), exampleIdea, 'tok-abc');
      if (res.mode === 'api') {
        expect(res.id).toBe('alt-1');
        expect(res.url).toBe('https://x/y');
      } else {
        throw new Error('expected api mode');
      }
    });

    it('tolerates a 2xx with no JSON body', async () => {
      const { fetch, calls } = stubFetch({ status: 204, ok: true, rawText: '' });
      const client = new PipelineClient({ fetch });
      const res = await client.submitIdea(profileWith(exampleIntake), exampleIdea, 'tok-abc');
      if (res.mode === 'api') {
        expect(res.status).toBe(204);
        expect(res.id).toBeUndefined();
        expect(res.url).toBeUndefined();
      } else {
        throw new Error('expected api mode');
      }
      expect(calls).toHaveLength(1);
    });

    it('resolves a loopback http baseUrl (localhost allowed)', async () => {
      const { fetch, calls } = stubFetch({ status: 200, ok: true, body: { id: 'z' } });
      const client = new PipelineClient({ fetch });
      await client.submitIdea(profileWith(exampleIntake), exampleIdea, 'tok-abc');
      expect(calls[0].url).toBe('http://localhost:8006/api/ideas');
    });
  });

  describe('submitIdea — error surfacing without leaking the secret', () => {
    it('throws a 4xx failure message that does NOT contain the secret', async () => {
      const secret = 'sk-leakme-4xx';
      const { fetch } = stubFetch({
        status: 401,
        ok: false,
        rawText: 'Unauthorized — bad token ' + secret,
      });
      const client = new PipelineClient({ fetch });
      await expect(
        client.submitIdea(profileWith(exampleIntake), exampleIdea, secret)
      ).rejects.toThrow(/status 401/);
      // And the rejection message must not contain the raw secret anywhere.
      // (vitest 1.x hands the Error object to toSatisfy, not the message string.)
      const assertNoSecret = (e: unknown) => {
        const m = e instanceof Error ? e.message : String(e);
        return !m.includes(secret);
      };
      await expect(
        client.submitIdea(profileWith(exampleIntake), exampleIdea, secret)
      ).rejects.toSatisfy(assertNoSecret);
    });

    it('throws a 5xx failure message that does NOT contain the secret', async () => {
      const secret = 'sk-leakme-5xx';
      const { fetch } = stubFetch({
        status: 500,
        ok: false,
        body: { error: 'upstream broke, token=' + secret },
      });
      const client = new PipelineClient({ fetch });
      await expect(
        client.submitIdea(profileWith(exampleIntake), exampleIdea, secret)
      ).rejects.toThrow(/status 500/);
      const assertNoSecret = (e: unknown) => {
        const m = e instanceof Error ? e.message : String(e);
        return !m.includes(secret);
      };
      await expect(
        client.submitIdea(profileWith(exampleIntake), exampleIdea, secret)
      ).rejects.toSatisfy(assertNoSecret);
    });

    it('redacts the secret from a network-layer fetch failure', async () => {
      const secret = 'sk-network-fail';
      const fetch: FetchAdapter = async () => {
        throw new Error('ECONNREFUSED ' + secret + ' in flight');
      };
      const client = new PipelineClient({ fetch });
      await expect(
        client.submitIdea(profileWith(exampleIntake), exampleIdea, secret)
      ).rejects.toThrow(/network request failed/);
      const assertRedacted = (e: unknown) => {
        const m = e instanceof Error ? e.message : String(e);
        return !m.includes(secret) && m.includes('[REDACTED]');
      };
      await expect(
        client.submitIdea(profileWith(exampleIntake), exampleIdea, secret)
      ).rejects.toSatisfy(assertRedacted);
    });

    it('fails loudly when no fetch implementation is available', async () => {
      // With no fetch injected and no global fetch, the client fails loudly
      // rather than silently no-oping (and never reaches the secret).
      const original = (globalThis as { fetch?: FetchAdapter }).fetch;
      (globalThis as { fetch?: FetchAdapter }).fetch = undefined;
      try {
        const client = new PipelineClient();
        await expect(
          client.submitIdea(profileWith(exampleIntake), exampleIdea, 'tok-abc')
        ).rejects.toThrow(/no fetch implementation available/);
      } finally {
        (globalThis as { fetch?: FetchAdapter }).fetch = original;
      }
    });
  });

  describe('submitIdea — SSRF before the call', () => {
    it('rejects a non-http(s) baseUrl before any network call', async () => {
      const { fetch, calls } = stubFetch({ status: 200, ok: true, body: { id: 'x' } });
      const client = new PipelineClient({ fetch });
      await expect(
        client.submitIdea(
          profileWith({ ...exampleIntake, baseUrl: 'file:///etc/passwd' }),
          exampleIdea,
          'tok-abc'
        )
      ).rejects.toThrow(/must be http\(s\)/);
      expect(calls).toHaveLength(0); // the guard runs before fetch
    });

    it('rejects a disallowed non-loopback host before any network call', async () => {
      const { fetch, calls } = stubFetch({ status: 200, ok: true, body: { id: 'x' } });
      const client = new PipelineClient({ fetch, allowedHosts: ['allowed.example'] });
      await expect(
        client.submitIdea(
          profileWith({ ...exampleIntake, baseUrl: 'https://evil.example' }),
          exampleIdea,
          'tok-abc'
        )
      ).rejects.toThrow(/not in the allowedHosts list/);
      expect(calls).toHaveLength(0);
    });
  });
});
