/**
 * PipelineClient — P3-2: the generic, profile-driven HTTP intake caller.
 *
 * Phase 3 keeps wysiwyg decoupled from any specific target project: the
 * resolved `ProjectProfile` carries a declarative `intakeApi` adapter
 * descriptor (P3-1), and this service POSTs the export to
 * `intakeApi.baseUrl + intakeApi.upsertPath` with a body built from
 * `intakeApi.bodyTemplate` and the named secret attached as an
 * `Authorization: Bearer …` header. No target-specific code ships inside
 * wysiwyg — the profile *is* the adapter.
 *
 * The file-handoff path (Phase 1 `appendRequirements`) is untouched. When a
 * profile has no `intakeApi`, `submitIdea` returns a `mode: 'file-fallback'`
 * sentinel so the P3-3 route can delegate to the existing file branch rather
 * than calling out over the network.
 *
 * Security/SSRF rules (enforced here, at the call boundary — not at the route):
 *   - `baseUrl` scheme MUST be `http` or `https` (no `file:`/`data:`/`ftp:`).
 *     `http(s)://(localhost|127.0.0.1|0.0.0.0)` is allowed because the target
 *     typically runs on the user's own machine; forbidding loopback would break
 *     the realistic case. An optional `allowedHosts` list may restrict this
 *     later but is not required for Phase 3 (permissive by default, consistent
 *     with P1-0 trusting the user-registered disk path).
 *   - The auth value is injected as a header at call time and is NEVER written
 *     to a thrown error, a request log, or a git commit message. Any failure
 *     surfaces a redacted message instead. The trust boundary is: the user
 *     registered this project themselves — the same trust the file branch
 *     extends to the registered disk path.
 *
 * This module is deliberately fetch-injected so it can be unit-tested in node
 * against an in-memory `fetch` stub — no live network in unit tests (mirrors
 * the dependency-injection pattern `projectRegistry.ts` / `ProfileManager` use
 * for storage/fs).
 */

import type { ProjectProfile, IntakeApi } from '../config/project-profiles';

/**
 * The fields made available as `{wysiwygField}` tokens to `bodyTemplate`. These
 * are the `AppendIdeasRequest` / `RequirementsExportResponse` fields Phase 3
 * reuses (per the P3 design: no new request type for the upsert *fields* —
 * only a new response shape for the target's reply). Kept as a focused
 * interface here so the service doesn't import the cross-boundary
 * `AppendIdeasRequest` (the route assembles it; the caller stays decoupled).
 *
 * Fields the `example` profile's `bodyTemplate` already references: `title`,
 * `priority`, `spec`, `architectureHints`, `testScenarios`, `edgeCases`.
 * `architectureHints`/`testScenarios`/`edgeCases` are arrays; a template
 * token like `{architectureHints}` is stringified as a newline-joined list.
 */
export interface PipelineIdea {
  title?: string;
  priority?: string;
  spec?: string;
  architectureHints?: string[];
  testScenarios?: string[];
  edgeCases?: string[];
}

/**
 * `submitIdea` outcome. Discriminated by `mode`:
 *   - `api`         — the target's POST was made; `status`/`ok` reflect the
 *                     HTTP reply, with best-effort `id`/`url` extracted from the
 *                     response body (targets vary, so these are optional).
 *   - `file-fallback` — the profile carries no `intakeApi`; the caller must
 *                      fall back to the Phase 1 file-handoff path. Carries no
 *                      secret-bearing fields.
 */
export type SubmitIdeaResult =
  | { mode: 'api'; ok: boolean; status: number; id?: string; url?: string; body?: unknown }
  | { mode: 'file-fallback' };

/** A minimal `fetch`-shaped adapter so tests can inject an in-memory stub. */
export type FetchAdapter = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{
  status: number;
  ok: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export interface PipelineClientOptions {
  /** Injectable fetch (tests pass an in-memory stub). Defaults to global fetch. */
  fetch?: FetchAdapter;
  /**
   * Optional host allowlist. When set, a non-loopback `baseUrl` host MUST be
   * in this list or the call is rejected. Loopback is always allowed. Not
   * required for Phase 3 (permissive by default) — wired now so a stricter
   * mode is a config change, not a code change.
   */
  allowedHosts?: string[];
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

/**
 * SSRF guard: assert `baseUrl` is http(s) and (when an allowlist is set) that a
 * non-loopback host is on it. Throws a redacted Error (no secret is ever in
 * scope here, but the message never echoes request bodies/auth either).
 */
export function assertHttpUrl(
  baseUrl: string,
  allowedHosts?: string[]
): { origin: string; pathname: string; host: string } {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`PipelineClient: baseUrl "${baseUrl}" is not a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `PipelineClient: baseUrl must be http(s), got "${parsed.protocol}"`
    );
  }
  if (allowedHosts && allowedHosts.length > 0 && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    if (!allowedHosts.includes(parsed.hostname)) {
      throw new Error(
        `PipelineClient: host "${parsed.hostname}" is not in the allowedHosts list`
      );
    }
  }
  return { origin: parsed.origin, pathname: parsed.pathname, host: parsed.hostname };
}

/**
 * Substitute `{wysiwygField}` tokens in `bodyTemplate` with values from `idea`.
 *
 * Example: `{ targetField: "{title}", spec: "{spec}" }` + `{title:'Fix nav', spec:'…'}`
 * → `{ targetField: "Fix nav", spec: "…" }`.
 *
 * Templates are flat string values. Available tokens are the keys of
 * `PipelineIdea` (`title`, `priority`, `spec`, `architectureHints`,
 * `testScenarios`, `edgeCases`). Array fields stringify as newline-joined
 * lists; a missing token resolves to the empty string (a template that names
 * an absent field is the profile author's choice — we don't fail the whole call
 * over one blank field). An unknown `{token}` is left as-is so the profile
 * author can see the miss in the target's payload rather than silently blanking it.
 */
export function buildRequestBody(
  bodyTemplate: IntakeApi['bodyTemplate'],
  idea: PipelineIdea
): Record<string, unknown> {
  const tokenValues: Record<string, string> = {
    title: idea.title ?? '',
    priority: idea.priority ?? '',
    spec: idea.spec ?? '',
    architectureHints: idea.architectureHints ? idea.architectureHints.join('\n') : '',
    testScenarios: idea.testScenarios ? idea.testScenarios.join('\n') : '',
    edgeCases: idea.edgeCases ? idea.edgeCases.join('\n') : '',
  };

  const out: Record<string, unknown> = {};
  for (const [targetField, template] of Object.entries(bodyTemplate)) {
    out[targetField] = template.replace(/\{(\w+)\}/g, (m, key: string) => {
      if (key in tokenValues) return tokenValues[key];
      return m; // unknown token — leave as-is (see docstring)
    });
  }
  return out;
}

/** Redact a secret value anywhere it appears in a message. */
export function redactSecret(message: string, secret: string): string {
  if (!secret) return message;
  return message.split(secret).join('[REDACTED]');
}

export class PipelineClient {
  private readonly fetchAdapter: FetchAdapter;
  private readonly allowedHosts?: string[];

  constructor(options: PipelineClientOptions = {}) {
    this.fetchAdapter =
      options.fetch ?? ((globalThis as { fetch?: FetchAdapter }).fetch ?? defaultFetch);
    this.allowedHosts = options.allowedHosts;
  }

  /**
   * Submit an export idea to the resolved profile's intake API.
   *
   * If the profile has no `intakeApi`, returns `mode: 'file-fallback'` so the
   * caller can delegate to the Phase 1 file-handoff path — one button, one
   * route, transport decided by the profile (P3-3).
   *
   * `secret` is the looked-up value of the `intakeApi.auth` name (the registry
   * holds it under `wysiwyg:project-secrets:<projectId>`); it is attached as an
   * `Authorization: Bearer …` header at call time and redacted from any thrown
   * error before surfacing.
   */
  async submitIdea(
    profile: ProjectProfile,
    idea: PipelineIdea,
    secret: string
  ): Promise<SubmitIdeaResult> {
    const intakeApi = profile.intakeApi;
    if (!intakeApi) {
      return { mode: 'file-fallback' };
    }

    // SSRF + scheme guard first — before any secret touches a request.
    assertHttpUrl(intakeApi.baseUrl, this.allowedHosts);

    const url = joinUrl(intakeApi.baseUrl, intakeApi.upsertPath);
    const body = buildRequestBody(intakeApi.bodyTemplate, idea);
    const bodyStr = JSON.stringify(body);

    let response: Awaited<ReturnType<FetchAdapter>>;
    try {
      response = await this.fetchAdapter(url, {
        method: intakeApi.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: bodyStr,
      });
    } catch (err) {
      throw new Error(redactSecret(failureMessage(err), secret));
    }

    // Non-2xx: surface the status + a redacted body snippet without the key.
    if (!response.ok) {
      let snippet = '';
      try {
        if (response.text) {
          snippet = await response.text();
        } else {
          const j = await safeJson(response);
          snippet = j === undefined ? '' : JSON.stringify(j);
        }
      } catch {
        snippet = '';
      }
      throw new Error(
        redactSecret(
          `PipelineClient: intake API ${intakeApi.method} ${url} failed with status ${response.status}: ${truncate(snippet)}`,
          secret
        )
      );
    }

    // Best-effort reply parse. Targets vary, so `id`/`url` are optional and
    // extracted loosely from a parsed JSON body.
    const parsed = await safeJson(response);
    return {
      mode: 'api',
      ok: response.ok,
      status: response.status,
      id: extractString(parsed, ['id', 'ideaId', 'id_']),
      url: extractString(parsed, ['url', 'link', 'location']),
      body: parsed,
    };
  }
}

/** Join a baseUrl and an upsertPath that already starts with `/` (validated). */
function joinUrl(baseUrl: string, upsertPath: string): string {
  // `new URL(upsertPath, baseUrl)` handles trailing-slash differences; assertHttpUrl
  // already guaranteed baseUrl parses, so this won't throw.
  return new URL(upsertPath, baseUrl).href;
}

/** Pull a string field from a parsed body by trying a list of key names. */
function extractString(body: unknown, keys: string[]): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** Parse JSON if possible; tolerate bodies that aren't JSON (return undefined). */
async function safeJson(response: {
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Promise<unknown> {
  if (response.json) {
    try {
      return await response.json();
    } catch {
      // fall through to text
    }
  }
  if (response.text) {
    try {
      const t = await response.text();
      if (!t) return undefined;
      return JSON.parse(t);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function failureMessage(err: unknown): string {
  if (err instanceof Error) return `PipelineClient: network request failed — ${err.message}`;
  return `PipelineClient: network request failed — ${String(err)}`;
}

function truncate(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Fallback used only when no fetch is available at all (e.g. an environment
 * without a global `fetch`). Rejects so a misconfigured client fails loudly
 * rather than silently no-oping.
 */
async function defaultFetch(): Promise<{ status: number; ok: boolean }> {
  throw new Error('PipelineClient: no fetch implementation available (pass options.fetch)');
}
