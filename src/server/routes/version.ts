import type { FastifyInstance } from 'fastify';

import type { RuntimeVersionInfo } from '../version.js';

export function registerVersionRoutes(app: FastifyInstance, versionInfo: RuntimeVersionInfo): void {
  app.get('/api/version', async (_req, reply) => {
    reply.header('cache-control', 'no-store');

    return {
      ok: true,
      ...versionInfo,
    };
  });
}
