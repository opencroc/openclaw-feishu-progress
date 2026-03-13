/**
 * Controlled Fixer — two-phase fix engine with safety guarantees.
 *
 * Phase A (config-only): backup → validate → fix → dry-run → write → verify → cleanup.
 * Phase B (config-and-source): generates a draft PR with the AI-suggested code patch.
 *
 * All mutations are reversible — failures trigger automatic rollback.
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  FixScope,
  ControlledFixOptions,
  ControlledFixOutcome,
  AIAttributionResult,
} from '../types.js';

// ===== Abstractions for testability =====

export interface ConfigValidator {
  validate(configContent: string): { passed: boolean; errors: string[] };
}

export interface ConfigFixer {
  fix(configContent: string, errors: string[]): { success: boolean; fixedContent: string; fixedItems: string[]; remainingErrors: string[] };
}

export interface PRGenerator {
  generate(attribution: AIAttributionResult): Promise<string>;
}

// ===== FS abstraction (injectable for tests) =====

export interface FsOps {
  exists(path: string): boolean;
  read(path: string): string;
  write(path: string, content: string): void;
  copy(src: string, dest: string): void;
  remove(path: string): void;
  mkdirp(dir: string): void;
}

const defaultFs: FsOps = {
  exists: existsSync,
  read: (p) => readFileSync(p, 'utf-8'),
  write: (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c, 'utf-8'); },
  copy: copyFileSync,
  remove: unlinkSync,
  mkdirp: (d) => mkdirSync(d, { recursive: true }),
};

// ===== Core =====

export interface ControlledFixerOptions {
  configPath: string;
  validator: ConfigValidator;
  fixer: ConfigFixer;
  prGenerator?: PRGenerator;
  attribution?: AIAttributionResult;
  fs?: FsOps;
  options?: ControlledFixOptions;
}

export async function applyControlledFix(opts: ControlledFixerOptions): Promise<ControlledFixOutcome> {
  const fs = opts.fs ?? defaultFs;
  const scope: FixScope = opts.options?.scope ?? 'config-only';
  const dryRun = opts.options?.dryRun ?? true;
  const verify = opts.options?.verify ?? true;
  const configPath = opts.configPath;
  const backupPath = configPath + '.backup';

  // --- Phase A: Config-only fix ---

  // Load config
  if (!fs.exists(configPath)) {
    return { success: false, scope, fixedItems: [], rolledBack: false, error: `Config file not found: ${configPath}` };
  }

  const originalContent = fs.read(configPath);

  // Backup before mutation
  fs.write(backupPath, originalContent);

  // Validate current config
  const validation = opts.validator.validate(originalContent);

  if (validation.passed) {
    // No errors to fix
    cleanup(fs, backupPath);
    return { success: true, scope, fixedItems: [], rolledBack: false };
  }

  // Attempt fix
  let fixResult: ReturnType<ConfigFixer['fix']>;
  try {
    fixResult = opts.fixer.fix(originalContent, validation.errors);
  } catch (err) {
    rollback(fs, backupPath, configPath);
    return { success: false, scope, fixedItems: [], rolledBack: true, error: `Fix threw: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!fixResult.success) {
    rollback(fs, backupPath, configPath);
    return { success: false, scope, fixedItems: fixResult.fixedItems, rolledBack: true, error: `Remaining errors: ${fixResult.remainingErrors.join('; ')}` };
  }

  // Dry-run: validate fixed content before writing
  if (dryRun) {
    const dryValidation = opts.validator.validate(fixResult.fixedContent);
    if (!dryValidation.passed) {
      rollback(fs, backupPath, configPath);
      return { success: false, scope, fixedItems: fixResult.fixedItems, rolledBack: true, error: `Dry-run validation failed: ${dryValidation.errors.join('; ')}` };
    }
  }

  // Write fixed content
  fs.write(configPath, fixResult.fixedContent);

  // Verify after write
  if (verify) {
    const reloaded = fs.read(configPath);
    const postValidation = opts.validator.validate(reloaded);
    if (!postValidation.passed) {
      rollback(fs, backupPath, configPath);
      return { success: false, scope, fixedItems: fixResult.fixedItems, rolledBack: true, error: `Post-write verification failed: ${postValidation.errors.join('; ')}` };
    }
  }

  // Phase A success — clean up backup
  cleanup(fs, backupPath);

  // --- Phase B: Config-and-source (optional) ---
  let prUrl: string | undefined;
  if (scope === 'config-and-source' && opts.attribution && opts.prGenerator) {
    try {
      prUrl = await opts.prGenerator.generate(opts.attribution);
    } catch {
      // PR generation failure is non-fatal; config fix already succeeded
    }
  }

  return { success: true, scope, fixedItems: fixResult.fixedItems, rolledBack: false, prUrl };
}

function rollback(fs: FsOps, backupPath: string, configPath: string): void {
  if (fs.exists(backupPath)) {
    const backup = fs.read(backupPath);
    fs.write(configPath, backup);
    fs.remove(backupPath);
  }
}

function cleanup(fs: FsOps, backupPath: string): void {
  if (fs.exists(backupPath)) {
    fs.remove(backupPath);
  }
}
