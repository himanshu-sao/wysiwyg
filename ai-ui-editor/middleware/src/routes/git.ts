import { FastifyPluginAsync } from 'fastify';
import { undoLastCommit } from '../services/GitManager';

const gitRoutes: FastifyPluginAsync = async (app) => {
  app.post('/undo', async (request, reply) => {
    try {
      // Get project root from request or use current directory
      const projectRoot = process.cwd();
      const result = await undoLastCommit(projectRoot);
      
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
