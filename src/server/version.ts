import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface RuntimeVersionInfo {
  name: string;
  version: string;
  commit?: string;
  shortCommit?: string;
  builtAt?: string;
  startedAt: string;
}

interface PackageMetadata {
  name?: string;
  version?: string;
}

function normalizeCommit(value?: string | null): string | undefined {
  const commit = value?.trim();
  if (!commit || !/^[0-9a-f]{7,40}$/i.test(commit)) {
    return undefined;
  }
  return commit.toLowerCase();
}

function normalizeIsoDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readPackageMetadata(cwd: string): PackageMetadata {
  try {
    const file = readFileSync(resolve(cwd, 'package.json'), 'utf-8');
    const parsed = JSON.parse(file) as PackageMetadata;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      version: typeof parsed.version === 'string' ? parsed.version : undefined,
    };
  } catch {
    return {};
  }
}

function resolveGitDir(cwd: string): string | undefined {
  const gitPath = resolve(cwd, '.git');
  if (!existsSync(gitPath)) return undefined;

  try {
    const content = readFileSync(gitPath, 'utf-8').trim();
    const match = /^gitdir:\s*(.+)$/i.exec(content);
    if (!match?.[1]) {
      return gitPath;
    }
    return resolve(cwd, match[1]);
  } catch {
    return gitPath;
  }
}

function readPackedRef(gitDir: string, ref: string): string | undefined {
  const packedRefsPath = join(gitDir, 'packed-refs');
  if (!existsSync(packedRefsPath)) return undefined;

  try {
    const lines = readFileSync(packedRefsPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith('#') || line.startsWith('^')) continue;
      const [commit, packedRef] = line.trim().split(/\s+/, 2);
      if (packedRef === ref) {
        return normalizeCommit(commit);
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readGitCommit(cwd: string): string | undefined {
  const gitDir = resolveGitDir(cwd);
  if (!gitDir) return undefined;

  const headPath = join(gitDir, 'HEAD');
  if (!existsSync(headPath)) return undefined;

  try {
    const head = readFileSync(headPath, 'utf-8').trim();
    const directCommit = normalizeCommit(head);
    if (directCommit) return directCommit;

    const refMatch = /^ref:\s*(.+)$/i.exec(head);
    const ref = refMatch?.[1]?.trim();
    if (!ref) return undefined;

    const refPath = join(gitDir, ...ref.split('/'));
    if (existsSync(refPath)) {
      const refCommit = normalizeCommit(readFileSync(refPath, 'utf-8'));
      if (refCommit) return refCommit;
    }

    return readPackedRef(gitDir, ref);
  } catch {
    return undefined;
  }
}

export function resolveRuntimeVersionInfo(cwd: string, startedAt = new Date()): RuntimeVersionInfo {
  const metadata = readPackageMetadata(cwd);
  const commit = normalizeCommit(process.env.OPENCROC_GIT_COMMIT) ?? readGitCommit(cwd);

  return {
    name: metadata.name ?? 'opencroc',
    version: metadata.version ?? '0.0.0',
    commit,
    shortCommit: commit?.slice(0, 7),
    builtAt: normalizeIsoDate(process.env.OPENCROC_BUILD_TIME),
    startedAt: startedAt.toISOString(),
  };
}
