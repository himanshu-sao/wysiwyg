import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import aiRoutes from './routes/ai';
import filesRoutes from './routes/files';
import wsRoutes from './routes/ws';
import gitRoutes from './routes/git';

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

// Health check
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Middleware server is running on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;
