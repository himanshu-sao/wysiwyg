import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import aiRoutes from './routes/ai';
import filesRoutes from './routes/files';
import wsRoutes from './routes/ws';
import gitRoutes from './routes/git';
// P3-3: pipeline route — the single Export handoff endpoint
// (POST /api/pipeline/upsert) whose transport (HTTP vs file) is decided by
// the resolved profile at call time. See routes/pipeline.ts.
import pipelineRoutes from './routes/pipeline';
// P1-7 / GAP_AUDIT "Model List Proliferation": validate the configured model
// against AVAILABLE_MODELS at startup so a typo'd/stale NVIDIA_MODEL env var
// fails fast with a clear message instead of silently using a wrong model at
// the first AI request. Exported so the startup guard is testable.
import { validateConfig } from './ai/OpencodeClient';

const app = fastify({ logger: true });

// Register CORS
app.register(fastifyCors, {
  origin: ['http://localhost:*', 'chrome-extension://*']
});

// Register WebSocket
app.register(fastifyWebsocket);

// Register routes
app.register(aiRoutes, { prefix: '/api/ai' });
app.register(filesRoutes, { prefix: '/api/files' });
app.register(wsRoutes, { prefix: '/ws' });
app.register(gitRoutes, { prefix: '/api/git' });
app.register(pipelineRoutes, { prefix: '/api/pipeline' });

// Health check
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    // P1-7: fail fast if NVIDIA_MODEL is set to something not in the catalog.
    // validateConfig() is exported from OpencodeClient so the guard itself is
    // unit-tested, and OpencodeClient.models.test.ts asserts this boot call exists
    // and runs before app.listen.
    validateConfig();
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Middleware server is running on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;
