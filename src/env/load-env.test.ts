import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFiles } from './load-env.js';

const TMP = join(__dirname, '..', '..', '.test-tmp-env');
const KEYS = [
  'TEST_ENV_BASIC',
  'TEST_ENV_LOCAL_ONLY',
  'TEST_ENV_SHARED',
  'TEST_ENV_SHELL_WINS',
] as const;

function setup(filename: string, content: string): void {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, filename), content, 'utf8');
}

afterEach(() => {
  for (const key of KEYS) {
    delete process.env[key];
  }
  rmSync(TMP, { recursive: true, force: true });
});

describe('loadEnvFiles', () => {
  it('loads variables from .env and .env.local', () => {
    setup('.env', 'TEST_ENV_BASIC=from-env\nTEST_ENV_SHARED=base');
    setup('.env.local', 'TEST_ENV_LOCAL_ONLY=from-local\nTEST_ENV_SHARED=local');

    loadEnvFiles(TMP);

    expect(process.env.TEST_ENV_BASIC).toBe('from-env');
    expect(process.env.TEST_ENV_LOCAL_ONLY).toBe('from-local');
    expect(process.env.TEST_ENV_SHARED).toBe('local');
  });

  it('does not override variables already provided by the shell', () => {
    process.env.TEST_ENV_SHELL_WINS = 'shell';
    setup('.env', 'TEST_ENV_SHELL_WINS=file');

    loadEnvFiles(TMP);

    expect(process.env.TEST_ENV_SHELL_WINS).toBe('shell');
  });
});
