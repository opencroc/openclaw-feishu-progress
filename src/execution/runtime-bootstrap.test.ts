import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { OpenCrocConfig } from '../types.js';
import { createRuntimeBootstrap } from './runtime-bootstrap.js';

function createTempDir(name: string): string {
  const dir = join(tmpdir(), name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('createRuntimeBootstrap', () => {
  const config: OpenCrocConfig = {
    backendRoot: './backend',
    playwright: {
      baseURL: 'http://localhost:4000',
    },
  };

  it('writes base runtime files when missing', async () => {
    const cwd = createTempDir('opencroc-runtime-bootstrap-1');
    const bootstrap = createRuntimeBootstrap(config);

    const result = await bootstrap.ensure({ cwd, hasAuth: false });

    expect(result.writtenFiles).toContain('playwright.config.ts');
    expect(result.writtenFiles).toContain('global-setup.ts');
    expect(result.writtenFiles).toContain('global-teardown.ts');
    expect(result.writtenFiles).not.toContain('auth.setup.ts');
    expect(existsSync(join(cwd, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'global-setup.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'global-teardown.ts'))).toBe(true);
  });

  it('writes auth setup file when auth is enabled', async () => {
    const cwd = createTempDir('opencroc-runtime-bootstrap-2');
    const bootstrap = createRuntimeBootstrap(config);

    const result = await bootstrap.ensure({ cwd, hasAuth: true });

    expect(result.writtenFiles).toContain('auth.setup.ts');
    expect(existsSync(join(cwd, 'auth.setup.ts'))).toBe(true);
  });

  it('does not overwrite existing files without force', async () => {
    const cwd = createTempDir('opencroc-runtime-bootstrap-3');
    const target = join(cwd, 'playwright.config.ts');
    writeFileSync(target, 'custom-content', 'utf-8');
    const bootstrap = createRuntimeBootstrap(config);

    const result = await bootstrap.ensure({ cwd, hasAuth: false, force: false });

    expect(result.skippedFiles).toContain('playwright.config.ts');
    expect(readFileSync(target, 'utf-8')).toBe('custom-content');
  });

  it('overwrites existing files when force=true', async () => {
    const cwd = createTempDir('opencroc-runtime-bootstrap-4');
    const target = join(cwd, 'playwright.config.ts');
    writeFileSync(target, 'custom-content', 'utf-8');
    const bootstrap = createRuntimeBootstrap(config);

    const result = await bootstrap.ensure({ cwd, hasAuth: false, force: true });

    expect(result.writtenFiles).toContain('playwright.config.ts');
    expect(readFileSync(target, 'utf-8')).not.toBe('custom-content');
  });
});
