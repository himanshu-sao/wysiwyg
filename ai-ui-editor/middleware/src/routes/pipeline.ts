import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { UpsertRequest, UpsertResponse } from '../shared/types';
import { ProfileManager } from '../services/ProfileManager';
import { PipelineClient } from '../services/PipelineClient';
import { getProfile } from '../config/project-profiles';
import { appendRequirements } from './files';

/**
 * Injectable dependencies for the pipeline routes. Both services are
 * seam-injected (mirroring `ProfileManager`'s / `PipelineClient`'s own
 * ctor-injection pattern) so `pipeline.test.ts` can drive the route's
 * transport branching through Fastify's `app.inject` with a fake `fetch` and
 * a temp-dir-backed file branch — no live network, no real disk outside tmpdir.
 *
 * `server.ts` imports the default export, which builds these with the real
 * singletons; tests call `makePipelineRoutes(deps)` with fakes instead.
 */
export interface PipelineRouteDeps {
  profileManager?: ProfileManager;
  pipelineClient?: PipelineClient;
}

/**
 * P3-3: Pipeline routes — the single "Export" handoff whose transport is
 * decided by the resolved profile at call time.
 *
 * One endpoint, one button in the popup: `POST /api/pipeline/upsert`. The route
 * resolves the profile via `ProfileManager` (just like the AI + files routes),
 * then branches on whether the profile carries an `intakeApi` adapter (P3-1):
 *
 *   - `intakeApi` present → call `PipelineClient.submitIdea()` with the named
 *     `auth` secret the popup relayed in `req.secret` (read from
 *     `chrome.storage.local` keyed `wysiwyg:project-secrets:<projectId>`). The
 *     middleware attaches it as `Authorization: Bearer …` and never persists
 *     it; `PipelineClient` already redacts it from any thrown error. Returns
 *     `mode: 'api'` with the target's best-effort `remoteId`/`remoteUrl`.
 *
 *   - `intakeApi` absent → delegate to the Phase 1 file-handoff path
 *     (`appendRequirements`, unchanged). Returns `mode: 'file'` with the
 *     generated `ID-XXX` + `specPath`. This keeps a profile with no adapter on
 *     the exact Phase 1 behavior — one button for both transports.
 *
 * This is decoupled by design (the locked P3 architecture): wysiwyg knows
 * nothing about any specific target — the profile *is* the adapter.
 */
// P3-3: Zod schema for the upsert request. Matches the mirrored UpsertRequest
// (shared/types.ts). `secret` is optional and only meaningful when the
// resolved profile has `intakeApi`; the route still accepts it unconditionally
// so the popup's body shape is independent of which transport runs. The
// `passthrough` on `element` mirrors the AppendIdeasRequest schema (files.ts).
const UpsertRequestSchema = z.object({
  spec: z.string().min(1),
  title: z.string().optional(),
  priority: z.enum(['High', 'Medium', 'Low']),
  architectureHints: z.array(z.string()).default([]),
  testScenarios: z.array(z.string()).default([]),
  edgeCases: z.array(z.string()).default([]),
  element: z.object({}).passthrough().optional(),
  instruction: z.string(),
  projectRoot: z.string(),
  projectProfile: z.string().optional(),
  registeredProject: z.object({
    path: z.string(),
    profileName: z.string(),
  }).optional(),
  secret: z.string().optional(),
});

/**
 * Build the pipeline routes with optional injected dependencies. `server.ts`
 * imports the default export (which calls this with no deps → real singletons);
 * tests pass fakes to drive the transport branching without network.
 */
export function makePipelineRoutes(deps: PipelineRouteDeps = {}): FastifyPluginAsync {
  const profileManager = deps.profileManager ?? new ProfileManager();
  const pipelineClient = deps.pipelineClient ?? new PipelineClient();

  const pipelineRoutes: FastifyPluginAsync = async (app) => {
    app.post('/upsert', async (request, reply) => {
      const parsed = UpsertRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const resp: UpsertResponse = {
          success: false,
          mode: 'file',
          error: `Invalid request: ${parsed.error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`,
        };
        return reply.status(400).send(resp);
      }

      const req = parsed.data as UpsertRequest;

      // P2-2 / P3-3: registry-aware profile resolution. Same precedence as the AI
      // + files routes: registered override → projectProfile name → generic.
      let profile;
      try {
        if (req.registeredProject || req.projectProfile) {
          profile = await profileManager.resolve({
            registered: req.registeredProject ?? null,
            projectProfile: req.projectProfile,
          });
        } else {
          profile = getProfile('generic');
        }
      } catch (err: unknown) {
        const resp: UpsertResponse = {
          success: false,
          mode: 'file',
          error: `Failed to resolve profile: ${(err as Error).message}`,
        };
        return reply.status(500).send(resp);
      }

      // Branch on transport: HTTP intake adapter (Phase 3) vs file handoff (Phase 1).
      if (profile.intakeApi) {
        // Phase 3 HTTP handoff. `req.secret` is the resolved value of
        // `intakeApi.auth` (a NAME). The popup read it from chrome.storage.local
        // and relayed it here; we attach it as a Bearer header and never persist
        // it. An empty/absent secret is a configuration error — surface it
        // clearly rather than send an unauthenticated POST the target would
        // likely reject with a confusing 401 we'd then redact.
        const secret = (req.secret ?? '').trim();
        if (!secret) {
          const resp: UpsertResponse = {
            success: false,
            mode: 'api',
            error: `Profile "${profile.name}" has an intakeApi adapter but no secret was supplied for auth "${profile.intakeApi.auth}". Set the key in the extension registry before exporting.`,
          };
          return reply.status(400).send(resp);
        }

        try {
          const result = await pipelineClient.submitIdea(profile, req, secret);
          if (result.mode === 'file-fallback') {
            // Defensive: submitIdea returns file-fallback only when intakeApi is
            // absent, which we already checked. Treat as an internal error —
            // never silently switch transports from under the user.
            const resp: UpsertResponse = {
              success: false,
              mode: 'api',
              error: 'PipelineClient returned file-fallback despite intakeApi being present',
            };
            return reply.status(500).send(resp);
          }
          const resp: UpsertResponse = result.ok
            ? {
                success: true,
                mode: 'api',
                id: result.id,
                remoteId: result.id,
                remoteUrl: result.url,
              }
            : {
                success: false,
                mode: 'api',
                error: `Intake API returned status ${result.status}`,
                remoteId: result.id,
                remoteUrl: result.url,
              };
          return reply.send(resp);
        } catch (err: unknown) {
          // PipelineClient redacts the secret from the message before throwing.
          const resp: UpsertResponse = {
            success: false,
            mode: 'api',
            error: (err as Error).message,
          };
          // 502 = bad gateway: we acted as a proxy to an upstream that failed
          // (network error / non-2xx). Keeps the 5xx family for true middleware
          // faults and 4xx for the client's request — consistent with git.ts.
          return reply.status(502).send(resp);
        }
      }

      // Phase 1 file handoff — delegate to appendRequirements (unchanged). Path
      // safety + atomic GitManager commit + idempotency all stay there; this
      // route performs no file/git write of its own. The cast bridges the typed
      // UpsertRequest to appendRequirements' Zod-inferred param shape — the only
      // divergence is `element` (ElementContext vs the passthrough object schema),
      // which appendRequirements treats as an opaque passthrough anyway, so the
      // cast is a no-op at runtime.
      try {
        const fileResp = await appendRequirements(req as Parameters<typeof appendRequirements>[0]);
        const resp: UpsertResponse = {
          success: fileResp.success,
          mode: 'file',
          id: fileResp.id,
          specPath: fileResp.specPath,
          error: fileResp.error,
        };
        // appendRequirements uses 200 with success:false for an idempotent
        // "already exists" conflict (not a server error); preserve that signal
        // rather than turning it into a 4xx/5xx.
        return reply.send(resp);
      } catch (err: unknown) {
        const msg = (err as Error).message || 'Failed to write export via file handoff';
        const status = /PathSanitizer/.test(msg) ? 400 : 500;
        const resp: UpsertResponse = {
          success: false,
          mode: 'file',
          error: msg,
        };
        return reply.status(status).send(resp);
      }
    });
  };

  return pipelineRoutes;
}

// Default plugin: real singletons (server.ts registers this at /api/pipeline).
const pipelineRoutes: FastifyPluginAsync = makePipelineRoutes();
export default pipelineRoutes;
