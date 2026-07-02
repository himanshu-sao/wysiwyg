import { FastifyPluginAsync } from 'fastify';

const wsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/connect', { websocket: true }, (connection, request) => {
    console.log('WebSocket client connected');

    connection.socket.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log('WebSocket message:', data);
        // Broadcast to all connected clients (for multi-extension support)
        app.websocketServer?.clients.forEach((client) => {
          if (client !== connection.socket) {
            client.send(JSON.stringify({ type: 'broadcast', data }));
          }
        });
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    connection.socket.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    connection.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
};

export default wsRoutes;
