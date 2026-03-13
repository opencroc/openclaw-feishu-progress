import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../load-config.js', () => ({
  loadConfig: vi.fn(),
}));

// Mock child_process to avoid actually running Playwright
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { runTests } from './test.js';
import { loadConfig } from '../load-config.js';
import { execFileSync } from 'node:child_process';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedExecFileSync = vi.mocked(execFileSync);

const TMP = join(__dirname, '..', '..', '..', '.test-tmp-runner');

function cleanup(): void {
  rmSync(TMP, { recursive: true, force: true });
}

describe('test command', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedLoadConfig.mockResolvedValue({
      config: { backendRoot: './backend', outDir: TMP },
      filepath: '/fake/config.json',
    });
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reports no test files when outDir is empty', async () => {
    mkdirSync(TMP, { recursive: true });

    await runTests({});

    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('discovers and runs .spec.ts files', async () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'auth.spec.ts'), '// test', 'utf-8');

    await runTests({});

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      expect.stringContaining('npx'),
      expect.arrayContaining(['playwright', 'test']),
      expect.any(Object),
    );
  });

  it('passes --headed flag to Playwright', async () => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'crud.spec.ts'), '// test', 'utf-8');

    await runTests({ headed: true });

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['--headed']),
      expect.any(Object),
    );
  });

  it('filters test files by module name', async () => {
    mkdirSync(join(TMP, 'users'), { recursive: true });
    mkdirSync(join(TMP, 'orders'), { recursive: true });
    writeFileSync(join(TMP, 'users', 'user.spec.ts'), '// test', 'utf-8');
    writeFileSync(join(TMP, 'orders', 'order.spec.ts'), '// test', 'utf-8');

    await runTests({ module: 'users' });

    const callArgs = mockedExecFileSync.mock.calls[0][1] as string[];
    const testFiles = callArgs.filter((a) => a.endsWith('.spec.ts'));
    expect(testFiles).toHaveLength(1);
    expect(testFiles[0]).toContain('users');
  });
});
