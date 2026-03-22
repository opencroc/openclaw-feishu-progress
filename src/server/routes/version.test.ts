import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';

import { registerVersionRoutes } from './version.js';

describe('registerVersionRoutes', () => {
  it('returns runtime version metadata with no-store caching', async () => {
    const app = Fastify();
    registerVersionRoutes(app, {
      name: 'opencroc',
      version: '1.8.6',
      commit: 'e6e7d5f1234567890abcdef1234567890abcde',
      shortCommit: 'e6e7d5f',
      builtAt: '2026-03-22T07:30:00.000Z',
      startedAt: '2026-03-22T07:35:00.000Z',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/version',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({
      ok: true,
      name: 'opencroc',
      version: '1.8.6',
      commit: 'e6e7d5f1234567890abcdef1234567890abcde',
      shortCommit: 'e6e7d5f',
      builtAt: '2026-03-22T07:30:00.000Z',
      startedAt: '2026-03-22T07:35:00.000Z',
    });
  });
});
