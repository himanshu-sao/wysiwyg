import { FastifyPluginAsync } from 'fastify';
import { EditRequest, EditResponse, EditContext, ElementContext } from '../shared/types';
import { generateEditOptions, generateEditOptionsStream } from '../ai/OpencodeClient';
import { resolveSource } from '../services/SourcemapResolver';

const aiRoutes: FastifyPluginAsync = async (app) => {
  // Standard POST endpoint (non-streaming)
  app.post<{ Body: EditRequest }>('/edit', async (request, reply) => {
    try {
      const { element, instruction, context } = request.body;

      // P7: resolve the element's source via sourcemap before calling the AI,
      // so the AI prompt includes the real sourceFile/sourceLine/sourceCode.
      const { context: resolvedContext, needsFileSelection, resolvedFilePath, resolvedSourceCode } = await resolveContextSource(element, context);

      const options = await generateEditOptions(element, instruction, resolvedContext);
      const response: EditResponse = {
        options,
        needsFileSelection,
        resolvedFilePath,
        resolvedSourceCode,
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

      // Send final result (EditResponse-shaped: options + needsFileSelection + resolved source)
      const sendResult = (payload: { options: any[]; needsFileSelection?: boolean; resolvedFilePath?: string; resolvedSourceCode?: string }) => {
        const event = JSON.stringify({
          type: 'result',
          options: payload.options,
          needsFileSelection: payload.needsFileSelection,
          resolvedFilePath: payload.resolvedFilePath,
          resolvedSourceCode: payload.resolvedSourceCode,
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
        // P7: resolve source first (may set needsFileSelection on the result).
        const { context: resolvedContext, needsFileSelection, resolvedFilePath, resolvedSourceCode } = await resolveContextSource(element, context);
        if (needsFileSelection) {
          sendProgress('sourcemap', 'Could not locate source — manual file selection available');
        }

        const options = await generateEditOptionsStream(
          element,
          instruction,
          resolvedContext,
          (stage, message, data) => sendProgress(stage, message, data)
        );
        // sendResult carries the EditResponse-shaped payload; include needsFileSelection
        // and resolved source info so the popup can apply diffs correctly (P3).
        sendResult({ options, needsFileSelection, resolvedFilePath, resolvedSourceCode });
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

/**
 * P7: enrich the edit context with the element's resolved source file/line/code
 * via sourcemap. Returns the (possibly updated) context, a `needsFileSelection`
 * flag, and the resolved source details for the popup.
 * - needsFileSelection: true ONLY when resolution was attempted (scriptUrl present)
 *   but failed, so the popup can offer MVP-18 manual file selection.
 * - resolvedFilePath/resolvedSourceCode: populated when resolution succeeds, so
 *   the popup can apply diffs correctly (P3 fix).
 */
async function resolveContextSource(
  element: ElementContext,
  context: EditContext
): Promise<{ context: EditContext; needsFileSelection: boolean; resolvedFilePath?: string; resolvedSourceCode?: string }> {
  const attempted = !!context.scriptUrl && context.scriptUrl.trim().length > 0;
  if (!attempted) {
    return { context, needsFileSelection: false };
  }

  const resolved = await resolveSource(
    context.scriptUrl,
    context.generatedLine,
    context.generatedColumn,
    element.html,
    { pageUrl: context.url, projectRoot: context.projectRoot }
  );

  const merged: EditContext = {
    ...context,
    sourceFile: resolved.sourceFile ?? context.sourceFile,
    sourceLine: resolved.sourceLine ?? context.sourceLine,
    sourceCode: resolved.sourceCode ?? context.sourceCode,
  };

  return {
    context: merged,
    needsFileSelection: !merged.sourceFile,
    resolvedFilePath: resolved.sourceFile ?? undefined,
    resolvedSourceCode: resolved.sourceCode ?? undefined,
  };
}

export default aiRoutes;