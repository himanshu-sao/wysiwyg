import { FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { AppendIdeasRequest, AppendIdeasResponse, RequirementPriority } from '../shared/types';
import { WriteResponse, ValidateResponse, ReadResponse, ProbeRootResponse } from '../shared/types';
import { validateDiff } from '../services/DiffValidator';
import { writeFileWithGit, writeFilesWithGit, type FileEntry } from '../services/GitManager';
import { safeFilePath, resolveProjectRoot } from '../services/PathSanitizer';
import { getProfile } from '../config/project-profiles';

// P4: Zod schemas for request validation (standalone, not extending TS interfaces)
const ValidateRequestSchema = z.object({
  file: z.string(),
  content: z.string(),
  projectRoot: z.string().optional(),
});

const WriteRequestSchema = z.object({
  file: z.string(),
  content: z.string(),
  commitMessage: z.string().optional(),
  projectRoot: z.string().optional(),
});

const ReadRequestQuerySchema = z.object({
  file: z.string(),
  projectRoot: z.string().optional(),
});

// P1-0: query schema for probe-root. `path` is an absolute on-disk path the
// extension wants to register as a project root; we validate it before accepting.
const ProbeRootQuerySchema = z.object({
  path: z.string(),
});

// Default project root if the client doesn't supply one. Falls back to the
// shared/sample repo so edits have somewhere to land in local dev.
const DEFAULT_PROJECT_ROOT =
  process.env.PROJECT_ROOT ||
  '/Users/himanshusao/Work/src/extra/himanshu-sao/wysiwyg/ai-ui-editor/sample-project';

// P1-0: project-marker files that signal "this is a project root." The probe-root
// endpoint checks these (at the root itself, not recursively) so the extension can
// reject on-disk paths that aren't project roots before registering them.
const PROJECT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  '.git',
] as const;

// P1-6: Zod schema for POST /api/files/append-ideas. `projectRoot` is required
// (P1-0 unblocked it — the extension now sends the registered on-disk path).
// `projectProfile` is optional; absent → the endpoint profiles by projectRoot.
const AppendIdeasRequestSchema = z.object({
  spec: z.string().min(1),
  title: z.string().optional(),
  priority: z.enum(['High', 'Medium', 'Low']),
  architectureHints: z.array(z.string()).default([]),
  testScenarios: z.array(z.string()).default([]),
  edgeCases: z.array(z.string()).default([]),
  element: z.object({}).passthrough().optional(),
  instruction: z.string(),
  projectRoot: z.string(),
  projectProfile: z.enum(['example', 'generic']).optional(),
});

/** P1-6: regex that matches `ID-(\d+)` in any context (intake file line or dir name). */
const ID_RE = /ID-(\d+)/g;

/**
 * P1-6: scan the active project for the highest existing requirement ID.
 * Checks the intake file's `ID-XXX` occurrences + any `ID-XXX` subdirectories
 * in the requirements dir. Returns 1 when nothing exists (first export).
 *
 * Stale ID check: if an ID appears only in the intake file but not as a
 * requirements dir, it may represent a deleted/superseded requirement —
 * we skip it so wysiwyg doesn't reuse an orphan ID. Otherwise (if both exist,
 * or only the dir exists) we count it toward the max.
 *
 * Exported for unit testing.
 */
export async function generateNextId(
  projectRoot: string,
  intakeRelPath: string,
  requirementsDir: string
): Promise<string> {
  const intakeAbs = path.resolve(projectRoot, intakeRelPath);
  const reqDirAbs = path.resolve(projectRoot, requirementsDir);

  // Collect IDs from the intake file (if it exists).
  let intakeIds: string[] = [];
  try {
    const content = await fs.readFile(intakeAbs, 'utf-8');
    intakeIds = [...content.matchAll(ID_RE)].map((m) => m[1]!);
  } catch {
    // Intake file may not exist yet — fine.
  }

  // Collect IDs from the requirements directory subdirs.
  let dirIds: string[] = [];
  try {
    const entries = await fs.readdir(reqDirAbs, { withFileTypes: true });
    dirIds = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name.match(/^ID-(\d+)$/))
      .filter(Boolean)
      .map((m) => m![1]!);
  } catch {
    // Requirements dir may not exist yet — fine.
  }

  // Take the max numeric ID known; only count dir IDs and intake IDs where the
  // corresponding dir exists (stable pairing).
  const known = new Set<number>();
  const dirIdSet = new Set(dirIds.map((s) => parseInt(s, 10)));
  for (const s of dirIds) known.add(parseInt(s, 10));
  for (const s of intakeIds) {
    const n = parseInt(s, 10);
    if (dirIdSet.has(n)) known.add(n);
  }

  const max = known.size > 0 ? Math.max(...known) : 0;
  const next = max + 1;

  // Format: ID-001…ID-999 (3-digit zero-padded), then ID-1000+ (no padding).
  if (next <= 999) {
    return `ID-${String(next).padStart(3, '0')}`;
  }
  return `ID-${next}`;
}

/**
 * P1-6: the core export logic — atomic. Takes the AI spec + priority/title,
 * resolves paths from the project profile, generates the next ID, and writes
 * the intake-file TODO line + `requirements/{ID}/spec.md` in a SINGLE git
 * commit. Everything happens inside one try/catch so a failure between the
 * intake write and spec write never persists (lean on writeFilesWithGit).
 *
 * Exported for unit testing (roughly against a temp dir).
 */
export async function appendRequirements(
  req: z.infer<typeof AppendIdeasRequestSchema>
): Promise<AppendIdeasResponse> {
  const projectRoot = path.resolve(req.projectRoot);
  const profile = getProfile(req.projectProfile || 'generic');
  const priority: RequirementPriority = req.priority || 'Medium';
  const title = req.title?.trim() || req.instruction.slice(0, 80);

  // Resolve the intake file path relative to projectRoot.
  const intakeRel = profile.intakeFile || 'TODO.md';
  const intakeAbs = safeFilePath(projectRoot, intakeRel);

  // Resolve the requirements directory relative path.
  const reqDirRel = profile.directories.requirements || '.wysiwyg';
  const reqBaseDir = safeFilePath(projectRoot, reqDirRel);

  // Generate next ID by scanning both the intake file and the requirements directory.
  const id = await generateNextId(projectRoot, intakeRel, `${reqDirRel}/requirements`);
  const specDirRel = `${reqDirRel}/requirements/${id}`;
  const specDirAbs = path.resolve(projectRoot, specDirRel);
  const specPathAbs = path.resolve(specDirAbs, 'spec.md');

  // Build the intake line.
  const ideasLine = `- [${id}] ${title} | Priority: ${priority}`;

  // Build the spec body: a header insertion that adds the ID and metadata
  // at the top of the spec, then the body.
  const specBody = `# ${title} (${id})\n\n> Priority: ${priority} | Exported by wysiwyg\n\n${req.spec}`;

  // Read the current ideas.md content, append the line, and write both files
  // in a single atomic commit.
  let existingIdeas = '';
  try {
    existingIdeas = await fs.readFile(intakeAbs, 'utf-8');
  } catch {
    // file may not exist — first export into this project.
  }

  // Idempotent: if the same ID line is already present, bail.
  if (existingIdeas.includes(`[${id}]`)) {
    return {
      success: false,
      id,
      error: `Requirement ${id} already exists in ${intakeRel} — please re-export with a new spec to overwrite`,
    };
  }

  const newIdeasContent = existingIdeas
    ? existingIdeas.replace(/\n?$/, '\n') + ideasLine + '\n'
    : '# WYSIWYG Requirements\n\n' + ideasLine + '\n';

  const files: FileEntry[] = [
    { path: intakeAbs, content: newIdeasContent },
    { path: specPathAbs, content: specBody },
  ];

  const commitMessage = `AI export: ${title} (${id})`;
  const result = await writeFilesWithGit(files, commitMessage, projectRoot);

  if (!result.success) {
    return { success: false, id, error: result.error || 'Failed to commit export' };
  }

  return {
    success: true,
    id,
    ideasLine,
    specPath: specPathAbs,
  };
}

const filesRoutes: FastifyPluginAsync = async (app) => {
  app.post('/validate', async (request, reply) => {
    try {
      // P4: Zod validation on request body
      const parsed = ValidateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          valid: false,
          errors: [{ file: '', line: 0, column: 0, message: `Invalid request: ${parsed.error.issues.map((e: any) => e.message).join(', ')}`, severity: 'error', rule: 'request' }],
        });
      }

      const { file, content, projectRoot } = parsed.data;

      const root = resolveProjectRoot(projectRoot, DEFAULT_PROJECT_ROOT);
      const absPath = safeFilePath(root, file);
      const errors = await validateDiff(absPath, content, root);
      const response: ValidateResponse = {
        valid: errors.length === 0,
        errors,
      };
      return reply.send(response);
    } catch (error: any) {
      // Path-traversal rejection -> 400; other errors -> 500.
      const status = /PathSanitizer/.test(error.message) ? 400 : 500;
      return reply.status(status).send({
        valid: false,
        errors: [{ file: '', line: 0, column: 0, message: error.message, severity: 'error', rule: '' }],
      });
    }
  });

  app.post('/write', async (request, reply) => {
    try {
      // P4: Zod validation on request body
      const parsed = WriteRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: `Invalid request: ${parsed.error.issues.map((e: any) => e.message).join(', ')}`,
        });
      }

      const { file, content, commitMessage, projectRoot } = parsed.data;

      // P4: sanitize BEFORE writing — reject path traversal / out-of-root writes.
      const root = resolveProjectRoot(projectRoot, DEFAULT_PROJECT_ROOT);
      const absPath = safeFilePath(root, file);

      const result = await writeFileWithGit(absPath, content, commitMessage || 'AI: edit', root);
      const response: WriteResponse = {
        success: result.success,
        commitHash: result.commitHash,
        error: result.error,
      };
      return reply.send(response);
    } catch (error: any) {
      const status = /PathSanitizer/.test(error.message) ? 400 : 500;
      return reply.status(status).send({
        success: false,
        error: error.message || 'Failed to write file',
      });
    }
  });

  // P7 / MVP-18: read a source file so the popup can let the user browse + select
  // the actual file when sourcemap resolution fails.
  app.get('/read', async (request, reply) => {
    // Capture raw file for error responses before parsing
    const rawFile = (request.query as Record<string, unknown>)?.file as string | undefined;

    try {
      // P4: Zod validation on query string
      const parsed = ReadRequestQuerySchema.safeParse(request.query as Record<string, unknown>);
      if (!parsed.success) {
        return reply.status(400).send({
          content: '',
          file: '',
          error: `Invalid query: ${parsed.error.issues.map((e: any) => e.message).join(', ')}`,
        });
      }

      const { file, projectRoot } = parsed.data;

      const root = resolveProjectRoot(projectRoot, DEFAULT_PROJECT_ROOT);
      const absPath = safeFilePath(root, file);

      const content = await fs.readFile(absPath, 'utf-8');
      const response: ReadResponse = {
        content,
        file,
      };
      return reply.send(response);
    } catch (error: any) {
      const status = /PathSanitizer/.test(error.message) ? 400 : 500;
      return reply.status(status).send({
        content: '',
        file: rawFile ?? '',
        error: error.message || 'Failed to read file',
      });
    }
  });

  // P1-6: append a requirement to the active project's backlog.
  // The popup's handleExport already targets this URL; this endpoint makes it
  // real: ID generation, atomic intake-line + spec.md write, git commit,
  // one-click undo via /api/git/undo.
  app.post('/append-ideas', async (request, reply) => {
    try {
      const parsed = AppendIdeasRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: `Invalid request: ${parsed.error.issues.map((e: any) => e.message).join(', ')}`,
        } satisfies AppendIdeasResponse);
      }

      const result = await appendRequirements(parsed.data);
      const status = result.success ? 201 : 409;
      return reply.status(status).send(result);
    } catch (error: any) {
      if (/PathSanitizer/.test(error.message)) {
        return reply.status(400).send({ success: false, error: error.message });
      }
      return reply.status(500).send({ success: false, error: error.message || 'Failed to export requirement' });
    }
  });

  // P1-0: probe an on-disk path to see if it looks like a project root.
  // The extension calls this during "Add project" to validate before accepting
  // a path into the registry. It reads disk (the extension cannot) but writes
  // nothing. A path is valid iff a PROJECT_MARKERS file exists at the root.
  // Implemented as a pure helper (probeProjectRoot, exported for tests) so the
  // route handler stays thin.
  app.get('/probe-root', async (request, reply) => {
    try {
      const parsed = ProbeRootQuerySchema.safeParse(request.query as Record<string, unknown>);
      if (!parsed.success) {
        return reply.status(400).send({
          valid: false,
          exists: false,
          marker: null,
          isAbsolute: false,
          error: `Invalid query: ${parsed.error.issues.map((e: any) => e.message).join(', ')}`,
        } satisfies ProbeRootResponse);
      }

      const result = await probeProjectRoot(parsed.data.path);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({
        valid: false,
        exists: false,
        marker: null,
        isAbsolute: false,
        error: error.message || 'Failed to probe path',
      } satisfies ProbeRootResponse);
    }
  });
};

/**
 * P1-0: check an on-disk path for a project marker. Pure (no request context),
 * exported so it can be unit-tested directly.
 *
 * Rules:
 * - Must be an absolute path (reject relative). The extension is registering a
 *   real on-disk root; relative paths are meaningless across the extension/middleware
 *   boundary.
 * - Must NOT contain ".." (defense in depth — PathSanitizer will re-check on write).
 * - Must exist on disk.
 * - Must contain one of PROJECT_MARKERS at the root (not recursively).
 *
 * Returns a ProbeRootResponse (no throws on the "invalid" path — that's a valid
 * "no" answer; throws only on unexpected FS errors, surfaced by the caller).
 */
export async function probeProjectRoot(rawPath: string): Promise<ProbeRootResponse> {
  const isAbsolute = path.isAbsolute(rawPath);
  if (!isAbsolute) {
    return { valid: false, exists: false, marker: null, isAbsolute: false };
  }
  if (rawPath.includes('..')) {
    return { valid: false, exists: false, marker: null, isAbsolute: true };
  }

  const resolved = path.resolve(rawPath);
  let exists = false;
  try {
    const stat = await fs.stat(resolved);
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) {
    return { valid: false, exists: false, marker: null, isAbsolute: true };
  }

  // Look for a marker at the root itself.
  for (const marker of PROJECT_MARKERS) {
    try {
      await fs.access(path.join(resolved, marker));
      return { valid: true, exists: true, marker, isAbsolute: true };
    } catch {
      // try next marker
    }
  }

  return { valid: false, exists: true, marker: null, isAbsolute: true };
}

export default filesRoutes;
