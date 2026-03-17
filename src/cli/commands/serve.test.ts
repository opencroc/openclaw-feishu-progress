import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('serve command', () => {
  it('should export serve function', async () => {
    const mod = await import('./serve.js');
    expect(typeof mod.serve).toBe('function');
  });

  it('should fall back to defaults without config', async () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('./serve.js');

    // serve will try to load config from cwd — without config it should fall back gracefully
    // It will attempt to start server which may fail on port binding, but should not set exitCode=1
    try {
      await mod.serve({ port: '0', open: false });
    } catch {
      // Server start may fail in test environment — that's fine
    }

    // Should NOT set exitCode=1 (no longer errors on missing config)
    expect(process.exitCode).not.toBe(1);
    warnSpy.mockRestore();
  });

  it('should use a single SPA entry with route-based views', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/web/index.html'), 'utf-8');
    const routes = readFileSync(resolve(process.cwd(), 'src/web/src/app/routes.tsx'), 'utf-8');

    expect(html).toContain('src="/src/main.tsx"');
    expect(routes).toContain("path: '/studio'");
    expect(routes).toContain("path: '/pixel'");
  });
});
