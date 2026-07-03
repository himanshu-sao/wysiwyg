import { FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'fs';
import { z } from 'zod';
import { WriteResponse, ValidateResponse, ReadResponse } from '../shared/types';
import { validateDiff } from '../services/DiffValidator';
import { writeFileWithGit } from '../services/GitManager';
import { safeFilePath, resolveProjectRoot } from '../services/PathSanitizer';

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

// Default project root if the client doesn't supply one. Falls back to the
// shared/sample repo so edits have somewhere to land in local dev.
const DEFAULT_PROJECT_ROOT =
  process.env.PROJECT_ROOT ||
  '/Users/himanshusao/Work/src/extra/himanshu-sao/wysiwyg/ai-ui-editor/sample-project';

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
      const errors = await validateDiff(absPath, content);
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
};

export default filesRoutes;
