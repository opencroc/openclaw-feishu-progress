import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveRuntimeVersionInfo } from './version.js';

const tempDirs: string[] = [];

function createTempRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'opencroc-version-'));
  tempDirs.push(cwd);
  return cwd;
}

describe('resolveRuntimeVersionInfo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads package metadata and git commit from the repository', () => {
    const cwd = createTempRepo();
    const commit = 'e6e7d5f1234567890abcdef1234567890abcde';

    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'opencroc', version: '9.9.9' }));
    mkdirSync(join(cwd, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(cwd, '.git', 'refs', 'heads', 'main'), `${commit}\n`);

    const info = resolveRuntimeVersionInfo(cwd, new Date('2026-03-22T07:15:00.000Z'));

    expect(info).toMatchObject({
      name: 'opencroc',
      version: '9.9.9',
      commit,
      shortCommit: 'e6e7d5f',
      startedAt: '2026-03-22T07:15:00.000Z',
    });
  });

  it('prefers explicit environment metadata when provided', () => {
    const cwd = createTempRepo();

    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'opencroc', version: '1.8.6' }));
    vi.stubEnv('OPENCROC_GIT_COMMIT', 'abc1234def5678abc1234def5678abc1234def5');
    vi.stubEnv('OPENCROC_BUILD_TIME', '2026-03-22T07:30:00+08:00');

    const info = resolveRuntimeVersionInfo(cwd, new Date('2026-03-22T00:05:00.000Z'));

    expect(info).toMatchObject({
      version: '1.8.6',
      commit: 'abc1234def5678abc1234def5678abc1234def5',
      shortCommit: 'abc1234',
      builtAt: '2026-03-21T23:30:00.000Z',
      startedAt: '2026-03-22T00:05:00.000Z',
    });
  });
});
