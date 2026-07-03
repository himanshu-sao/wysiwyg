import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { undoLastCommit } from '../services/GitManager';

const UndoRequestSchema = z.object({
  // P4: scope undo to a specific user project, not the middleware dir.
  projectRoot: z.string().optional(),
});

// Default project root if the client doesn't supply one.
const DEFAULT_PROJECT_ROOT =
  process.env.PROJECT_ROOT ||
  '/Users/himanshusao/Work/src/extra/himanshu-sao/wysiwyg/ai-ui-editor/sample-project';

const gitRoutes: FastifyPluginAsync = async (app) => {
  app.post('/undo', async (request, reply) => {
    try {
      // P4: Zod validation on request body
      const parsed = UndoRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: `Invalid request body: ${parsed.error.issues.map((e: any) => e.message).join(', ')}`,
        });
      }

      const { projectRoot } = parsed.data;
      const root = projectRoot || DEFAULT_PROJECT_ROOT;
      const result = await undoLastCommit(root);
      
      if (result.success) {
        return reply.send({
          success: true,
          message: 'Last change undone successfully',
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: result.error || 'Failed to undo last change',
        });
      }
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to undo last change',
      });
    }
  });
};

export default gitRoutes;
