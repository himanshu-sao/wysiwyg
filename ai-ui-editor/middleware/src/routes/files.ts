import { FastifyPluginAsync } from 'fastify';
import { WriteRequest, WriteResponse, ValidateRequest, ValidateResponse } from '../shared/types';
import { validateDiff } from '../services/DiffValidator';
import { writeFileWithGit } from '../services/GitManager';
import { safeFilePath, resolveProjectRoot } from '../services/PathSanitizer';

// Default project root if the client doesn't supply one. Falls back to the
// shared/sample repo so edits have somewhere to land in local dev.
const DEFAULT_PROJECT_ROOT =
  process.env.PROJECT_ROOT ||
  '/Users/himanshusao/Work/src/extra/himanshu-sao/wysiwyg/ai-ui-editor/sample-project';

const filesRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ValidateRequest }>('/validate', async (request, reply) => {
    try {
      const { file, content, projectRoot } = request.body as ValidateRequest & { projectRoot?: string };
      if (!file)
        return reply.status(400).send({
          valid: false,
          errors: [{ file: '', line: 0, column: 0, message: 'file is required', severity: 'error', rule: 'request' }],
        });

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

  app.post<{ Body: WriteRequest }>('/write', async (request, reply) => {
    try {
      const { file, content, commitMessage, projectRoot } = request.body as WriteRequest & { projectRoot?: string };
      if (!file) return reply.status(400).send({ success: false, error: 'file is required' });
      if (typeof content !== 'string') return reply.status(400).send({ success: false, error: 'content is required' });

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
};

export default filesRoutes;
