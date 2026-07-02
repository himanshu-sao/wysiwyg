import { FastifyPluginAsync } from 'fastify';
import { EditRequest, EditResponse } from '../../shared/types';
import { generateEditOptions } from '../ai/OpencodeClient';

const aiRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: EditRequest }>('/edit', async (request, reply) => {
    try {
      const { element, instruction, context } = request.body;
      const options = await generateEditOptions(element, instruction, context);
      const response: EditResponse = {
        options,
      };
      return reply.send(response);
    } catch (error: any) {
      return reply.status(500).send({
        error: error.message || 'Failed to generate edit options',
        options: [],
      });
    }
  });
};

export default aiRoutes;
