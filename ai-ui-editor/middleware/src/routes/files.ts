import { FastifyPluginAsync } from 'fastify';
import { WriteRequest, WriteResponse, ValidateRequest, ValidateResponse } from '../../shared/types';
import { validateDiff } from '../services/DiffValidator';
import { writeFileWithGit } from '../services/GitManager';
import { promises as fs } from 'fs';
import * as path from 'path';

const filesRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ValidateRequest }>('/validate', async (request, reply) => {
    try {
      const { file, content } = request.body;
      const errors = await validateDiff(file, content);
      const response: ValidateResponse = {
        valid: errors.length === 0,
        errors,
      };
      return reply.send(response);
    } catch (error: any) {
      return reply.status(500).send({
        valid: false,
        errors: [{ file: '', line: 0, column: 0, message: error.message, severity: 'error', rule: '' }],
      });
    }
  });

  app.post<{ Body: WriteRequest }>('/write', async (request, reply) => {
    try {
      const { file, content, commitMessage } = request.body;
      const result = await writeFileWithGit(file, content, commitMessage);
      const response: WriteResponse = {
        success: result.success,
        commitHash: result.commitHash,
      };
      return reply.send(response);
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to write file',
      });
    }
  });
};

export default filesRoutes;
