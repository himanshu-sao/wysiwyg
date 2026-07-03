import { FastifyPluginAsync } from 'fastify';
import { EditRequest, EditResponse } from '../shared/types';
import { generateEditOptions, generateEditOptionsStream } from '../ai/OpencodeClient';

const aiRoutes: FastifyPluginAsync = async (app) => {
  // Standard POST endpoint (non-streaming)
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

  // Streaming SSE endpoint
  app.post<{ Body: EditRequest }>('/edit/stream', async (request, reply) => {
    try {
      const { element, instruction, context } = request.body;

      // Set SSE headers
      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');
      reply.header('X-Accel-Buffering', 'no');

      // Send progress updates
      const sendProgress = (stage: string, message: string, data?: any) => {
        const event = JSON.stringify({
          type: 'progress',
          stage,
          message,
          data,
          timestamp: Date.now(),
        });
        reply.raw.write(`data: ${event}\n\n`);
      };

      // Send final result
      const sendResult = (options: any[]) => {
        const event = JSON.stringify({
          type: 'result',
          options,
          timestamp: Date.now(),
        });
        reply.raw.write(`data: ${event}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      };

      // Send error
      const sendError = (error: string) => {
        const event = JSON.stringify({
          type: 'error',
          error,
          timestamp: Date.now(),
        });
        reply.raw.write(`data: ${event}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      };

      // Start processing
      sendProgress('init', 'Initializing AI request...');

      try {
        const options = await generateEditOptionsStream(
          element,
          instruction,
          context,
          (stage, message, data) => sendProgress(stage, message, data)
        );
        sendResult(options);
      } catch (error: any) {
        console.error('Streaming error:', error);
        sendError(error.message || 'Failed to generate edit options');
      }
    } catch (error: any) {
      console.error('Route error:', error);
      return reply.status(500).send({
        error: error.message || 'Failed to generate edit options',
        options: [],
      });
    }
  });
};

export default aiRoutes;