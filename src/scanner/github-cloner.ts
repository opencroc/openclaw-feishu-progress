/**
 * GitHub Cloner
 *
 * Clone a GitHub/GitLab/any git repository and scan it.
 * Supports: HTTPS URLs, shorthand (user/repo), and local paths.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { scanProject, type ScanOptions } from './project-scanner.js';
import type { ScanResult } from '../graph/types.js';

export interface CloneOptions extends Omit<ScanOptions, 'rootDir'> {
  /** GitHub URL, shorthand (user/repo), or local path */
  target: string;
  /** Where to clone into (default: os temp dir) */
  cloneDir?: string;
  /** Branch/tag to clone (default: default branch) */
  branch?: string;
  /** Shallow clone depth (default: 1) */
  depth?: number;
  /** Keep cloned repo after scan (default: false for remote, true for local) */
  keepClone?: boolean;
}

interface ResolvedTarget {
  type: 'local' | 'git';
  path: string;
  url?: string;
  repoName: string;
}

/**
 * Clone (if needed) and scan a project.
 */
export async function cloneAndScan(options: CloneOptions): Promise<ScanResult & { clonedPath?: string }> {
  const { target, cloneDir, branch, depth = 1, keepClone, onProgress, ...scanOpts } = options;

  const resolved = resolveTarget(target);

  let projectDir: string;

  if (resolved.type === 'local') {
    // Local path — scan directly
    projectDir = resolved.path;
    onProgress?.('clone', 100, `Using local directory: ${projectDir}`);
  } else {
    // Git URL — clone first
    const tempBase = cloneDir || path.join(os.tmpdir(), 'opencroc-scan');
    fs.mkdirSync(tempBase, { recursive: true });
    projectDir = path.join(tempBase, resolved.repoName);

    // Clean previous clone
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }

    onProgress?.('clone', 10, `Cloning ${resolved.url}...`);

    const branchArg = branch ? `--branch ${branch}` : '';
    const depthArg = depth > 0 ? `--depth ${depth}` : '';
    const cmd = `git clone ${branchArg} ${depthArg} --single-branch ${resolved.url} "${projectDir}"`;

    try {
      execSync(cmd, {
        stdio: 'pipe',
        timeout: 120_000, // 2 minutes max
      });
    } catch (err) {
      throw new Error(`Failed to clone repository: ${(err as Error).message}`);
    }

    onProgress?.('clone', 100, `Cloned to ${projectDir}`);
  }

  // Scan the project
  const scanResult = await scanProject({
    rootDir: projectDir,
    ...scanOpts,
    onProgress,
  });

  // Cleanup if remote and not keeping
  if (resolved.type === 'git' && !keepClone) {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }

  return {
    ...scanResult,
    clonedPath: resolved.type === 'git' ? projectDir : undefined,
  };
}

/**
 * Resolve a target string into a local path or git URL.
 */
function resolveTarget(target: string): ResolvedTarget {
  // Local path — resolve first so relative paths work correctly
  const resolved = path.resolve(target);
  if (fs.existsSync(resolved)) {
    return {
      type: 'local',
      path: resolved,
      repoName: path.basename(resolved),
    };
  }

  // Full git URL (https://github.com/user/repo, git@github.com:user/repo.git)
  if (target.startsWith('https://') || target.startsWith('http://') || target.startsWith('git@')) {
    let url = target;
    // Ensure .git suffix
    if (!url.endsWith('.git')) url += '.git';
    const repoName = path.basename(url, '.git');
    return { type: 'git', path: '', url, repoName };
  }

  // Shorthand: user/repo → https://github.com/user/repo.git
  if (/^[\w.-]+\/[\w.-]+$/.test(target)) {
    const url = `https://github.com/${target}.git`;
    const repoName = target.split('/')[1]!;
    return { type: 'git', path: '', url, repoName };
  }

  throw new Error(
    `Cannot resolve target "${target}". Expected: local path, GitHub URL, or shorthand (user/repo).`
  );
}
