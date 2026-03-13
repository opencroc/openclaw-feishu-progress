import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runDialogLoop,
  createJsonResultParser,
} from './dialog-loop-runner.js';
import type { TestRunner, ResultParser, FixApplier } from './dialog-loop-runner.js';
import { applyControlledFix } from './controlled-fixer.js';
import type { FsOps, ConfigValidator, ConfigFixer, PRGenerator } from './controlled-fixer.js';
import { generateFixPR } from './auto-fix-generator.js';
import type { GitExecutor, PatchWriter } from './auto-fix-generator.js';
import type { AIAttributionResult } from '../types.js';

// ============================================================
// Shared fixtures
// ============================================================

function makeAttribution(overrides?: Partial<AIAttributionResult>): AIAttributionResult {
  return {
    testName: 'login test',
    rootCause: 'Selector changed',
    category: 'frontend',
    severity: 'medium',
    fixSuggestion: { description: 'Update selector', filePath: 'test.ts', codePatch: 'diff --git...' },
    confidence: 0.85,
    ...overrides,
  };
}

// ============================================================
// Dialog Loop Runner
// ============================================================

describe('runDialogLoop', () => {
  let runner: TestRunner;
  let parser: ResultParser;
  let fixer: FixApplier;

  beforeEach(() => {
    runner = { run: vi.fn() };
    parser = { parse: vi.fn(), countTotal: vi.fn() };
    fixer = { apply: vi.fn() };
  });

  it('returns success when first run has no failures', async () => {
    vi.mocked(runner.run).mockResolvedValue({ stdout: '', exitCode: 0 });
    vi.mocked(parser.parse).mockReturnValue([]);
    vi.mocked(parser.countTotal).mockReturnValue(5);

    const result = await runDialogLoop({ runner, parser, fixer });

    expect(result.success).toBe(true);
    expect(result.finalFailed).toBe(0);
    expect(result.finalPassed).toBe(5);
    expect(result.iterations).toHaveLength(1);
  });

  it('applies fixes and reruns on failure', async () => {
    const runFn = vi.mocked(runner.run);
    const parseFn = vi.mocked(parser.parse);
    const countFn = vi.mocked(parser.countTotal);
    const fixFn = vi.mocked(fixer.apply);

    // Iteration 1: 1 failure
    runFn.mockResolvedValueOnce({ stdout: 'run1', exitCode: 1 });
    parseFn.mockReturnValueOnce([{ title: 'test A', error: 'boom' }]);
    countFn.mockReturnValueOnce(3);
    fixFn.mockResolvedValueOnce({ success: true, scope: 'config-only', fixedItems: ['x'], rolledBack: false });

    // Iteration 2: all pass
    runFn.mockResolvedValueOnce({ stdout: 'run2', exitCode: 0 });
    parseFn.mockReturnValueOnce([]);
    countFn.mockReturnValueOnce(3);

    const result = await runDialogLoop({ runner, parser, fixer, config: { maxIterations: 3 } });

    expect(result.success).toBe(true);
    expect(result.iterations).toHaveLength(2);
    expect(result.totalFixesApplied).toBe(1);
    expect(fixFn).toHaveBeenCalledTimes(1);
  });

  it('stops after maxIterations', async () => {
    vi.mocked(runner.run).mockResolvedValue({ stdout: '', exitCode: 1 });
    vi.mocked(parser.parse).mockReturnValue([{ title: 'fail', error: 'err' }]);
    vi.mocked(parser.countTotal).mockReturnValue(2);
    vi.mocked(fixer.apply).mockResolvedValue({ success: true, scope: 'config-only', fixedItems: ['f'], rolledBack: false });

    const result = await runDialogLoop({ runner, parser, fixer, config: { maxIterations: 2 } });

    // 2 iterations with fixes + 1 final check = 3 total runs, but stops at maxIterations+1
    expect(result.success).toBe(false);
    expect(result.iterations.length).toBeLessThanOrEqual(3);
  });

  it('stops when all errors exceed same-error threshold', async () => {
    vi.mocked(runner.run).mockResolvedValue({ stdout: '', exitCode: 1 });
    vi.mocked(parser.parse).mockReturnValue([{ title: 'flaky', error: 'same error' }]);
    vi.mocked(parser.countTotal).mockReturnValue(2);
    vi.mocked(fixer.apply).mockResolvedValue({ success: true, scope: 'config-only', fixedItems: ['f'], rolledBack: false });

    const result = await runDialogLoop({
      runner, parser, fixer,
      config: { maxIterations: 10, sameErrorThreshold: 1 },
    });

    // Should stop after 2 iterations (threshold=1 means allow once, then block)
    expect(result.iterations.length).toBeLessThanOrEqual(2);
  });

  it('stops when no fixes are applied', async () => {
    vi.mocked(runner.run).mockResolvedValue({ stdout: '', exitCode: 1 });
    vi.mocked(parser.parse).mockReturnValue([{ title: 'broken', error: 'err' }]);
    vi.mocked(parser.countTotal).mockReturnValue(1);
    vi.mocked(fixer.apply).mockResolvedValue({ success: false, scope: 'config-only', fixedItems: [], rolledBack: false });

    const result = await runDialogLoop({ runner, parser, fixer, config: { maxIterations: 5 } });

    expect(result.success).toBe(false);
    expect(result.iterations).toHaveLength(1);
    expect(result.totalFixesApplied).toBe(0);
  });

  it('calls onIteration callback', async () => {
    vi.mocked(runner.run).mockResolvedValue({ stdout: '', exitCode: 0 });
    vi.mocked(parser.parse).mockReturnValue([]);
    vi.mocked(parser.countTotal).mockReturnValue(1);

    const onIteration = vi.fn();
    await runDialogLoop({ runner, parser, fixer, onIteration });

    expect(onIteration).toHaveBeenCalledTimes(1);
    expect(onIteration.mock.calls[0][0]).toHaveProperty('iteration', 1);
  });

  it('does not rerun when autoRerunOnFix is false', async () => {
    vi.mocked(runner.run).mockResolvedValue({ stdout: '', exitCode: 1 });
    vi.mocked(parser.parse).mockReturnValue([{ title: 'x', error: 'e' }]);
    vi.mocked(parser.countTotal).mockReturnValue(2);
    vi.mocked(fixer.apply).mockResolvedValue({ success: true, scope: 'config-only', fixedItems: ['a'], rolledBack: false });

    const result = await runDialogLoop({
      runner, parser, fixer,
      config: { maxIterations: 5, autoRerunOnFix: false },
    });

    expect(result.iterations).toHaveLength(1);
    expect(runner.run).toHaveBeenCalledTimes(1);
  });
});

describe('createJsonResultParser', () => {
  const parser = createJsonResultParser();

  it('parses Playwright fail lines', () => {
    const output = [
      '  ✘  [chromium] › login.spec.ts:5:3 › auth › should login',
      '  ✓  [chromium] › home.spec.ts:10:3 › nav › should load',
    ].join('\n');

    const failures = parser.parse(output);
    expect(failures).toHaveLength(1);
    expect(failures[0].title).toContain('should login');
  });

  it('counts total from summary', () => {
    const output = '  3 passed\n  1 failed\n';
    expect(parser.countTotal(output)).toBe(4);
  });

  it('returns at least 1 for empty output', () => {
    expect(parser.countTotal('')).toBe(1);
  });
});

// ============================================================
// Controlled Fixer
// ============================================================

describe('applyControlledFix', () => {
  let mockFs: FsOps;
  let validator: ConfigValidator;
  let fixer: ConfigFixer;
  let fileStore: Map<string, string>;

  beforeEach(() => {
    fileStore = new Map();
    fileStore.set('/cfg.json', '{"broken": true}');

    mockFs = {
      exists: (p) => fileStore.has(p),
      read: (p) => fileStore.get(p) ?? '',
      write: (p, c) => { fileStore.set(p, c); },
      copy: (s, d) => { fileStore.set(d, fileStore.get(s) ?? ''); },
      remove: (p) => { fileStore.delete(p); },
      mkdirp: () => {},
    };

    validator = {
      validate: vi.fn((content: string) => {
        if (content.includes('"fixed"')) return { passed: true, errors: [] };
        return { passed: false, errors: ['field X is invalid'] };
      }),
    };

    fixer = {
      fix: vi.fn(() => ({
        success: true,
        fixedContent: '{"fixed": true}',
        fixedItems: ['field X'],
        remainingErrors: [],
      })),
    };
  });

  it('succeeds for a simple config-only fix cycle', async () => {
    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      fs: mockFs,
    });

    expect(result.success).toBe(true);
    expect(result.scope).toBe('config-only');
    expect(result.fixedItems).toContain('field X');
    expect(result.rolledBack).toBe(false);
    expect(fileStore.get('/cfg.json')).toBe('{"fixed": true}');
    expect(fileStore.has('/cfg.json.backup')).toBe(false); // cleaned up
  });

  it('returns success without fixing when config is already valid', async () => {
    fileStore.set('/cfg.json', '{"fixed": true}');

    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      fs: mockFs,
    });

    expect(result.success).toBe(true);
    expect(result.fixedItems).toEqual([]);
    expect(fixer.fix).not.toHaveBeenCalled();
  });

  it('returns error when config file is missing', async () => {
    const result = await applyControlledFix({
      configPath: '/missing.json',
      validator,
      fixer,
      fs: mockFs,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rolls back when fixer throws', async () => {
    vi.mocked(fixer.fix).mockImplementation(() => { throw new Error('boom'); });

    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      fs: mockFs,
    });

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(fileStore.get('/cfg.json')).toBe('{"broken": true}'); // restored
  });

  it('rolls back when fixer cannot fully fix', async () => {
    vi.mocked(fixer.fix).mockReturnValue({
      success: false,
      fixedContent: '{"partial": true}',
      fixedItems: [],
      remainingErrors: ['field Y still broken'],
    });

    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      fs: mockFs,
    });

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.error).toContain('Remaining errors');
  });

  it('rolls back when dry-run validation fails', async () => {
    // Fixer says success, but validated fixed content is still broken
    vi.mocked(fixer.fix).mockReturnValue({
      success: true,
      fixedContent: '{"still-broken": true}',
      fixedItems: ['X'],
      remainingErrors: [],
    });

    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      fs: mockFs,
      options: { dryRun: true },
    });

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.error).toContain('Dry-run');
  });

  it('rolls back when post-write verification fails', async () => {
    // DryRun passes but after write the content reads back differently
    let writeCount = 0;
    const specialFs: FsOps = {
      ...mockFs,
      write: (p, c) => {
        writeCount++;
        // On the third write (the actual config write), corrupt the content
        fileStore.set(p, writeCount === 2 ? '{"corrupted": true}' : c);
      },
    };

    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      fs: specialFs,
      options: { verify: true, dryRun: false },
    });

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.error).toContain('Post-write');
  });

  it('skips dryRun when option is false', async () => {
    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      fs: mockFs,
      options: { dryRun: false, verify: false },
    });

    expect(result.success).toBe(true);
    // Validator should only be called once (initial validation), not for dry-run
    expect(validator.validate).toHaveBeenCalledTimes(1);
  });

  it('generates PR in config-and-source scope', async () => {
    const prGenerator: PRGenerator = {
      generate: vi.fn().mockResolvedValue('https://github.com/pr/1'),
    };
    const attribution = makeAttribution();

    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      prGenerator,
      attribution,
      fs: mockFs,
      options: { scope: 'config-and-source' },
    });

    expect(result.success).toBe(true);
    expect(result.prUrl).toBe('https://github.com/pr/1');
    expect(prGenerator.generate).toHaveBeenCalledWith(attribution);
  });

  it('succeeds even if PR generation fails (non-fatal)', async () => {
    const prGenerator: PRGenerator = {
      generate: vi.fn().mockRejectedValue(new Error('gh not found')),
    };

    const result = await applyControlledFix({
      configPath: '/cfg.json',
      validator,
      fixer,
      prGenerator,
      attribution: makeAttribution(),
      fs: mockFs,
      options: { scope: 'config-and-source' },
    });

    expect(result.success).toBe(true);
    expect(result.prUrl).toBeUndefined();
  });
});

// ============================================================
// Auto-Fix PR Generator
// ============================================================

describe('generateFixPR', () => {
  let git: GitExecutor;
  let patchWriter: PatchWriter;

  beforeEach(() => {
    git = { exec: vi.fn().mockResolvedValue({ stdout: '', exitCode: 0 }) };
    patchWriter = { write: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn().mockResolvedValue(undefined) };
  });

  it('creates branch, applies patch, commits, pushes, and creates draft PR', async () => {
    vi.mocked(git.exec).mockImplementation(async (cmd, _args) => {
      if (cmd === 'gh') return { stdout: 'https://github.com/org/repo/pull/42\n', exitCode: 0 };
      return { stdout: '', exitCode: 0 };
    });

    const attribution = makeAttribution({ testName: 'dashboard test' });
    const result = await generateFixPR(attribution, git, patchWriter);

    expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
    expect(result.branch).toMatch(/^autofix\//);
    expect(result.patchFile).toMatch(/patch-.*\.patch$/);

    const calls = vi.mocked(git.exec).mock.calls;
    // checkout -b, git apply, git add, git commit, git push, gh pr create, git checkout main
    expect(calls.length).toBe(7);
    expect(calls[0][1]).toContain('-b');
    expect(calls[5][0]).toBe('gh');
    expect(calls[5][1]).toContain('--draft');
    expect(calls[6][1]).toContain('main');
  });

  it('uses custom branch prefix and base branch', async () => {
    vi.mocked(git.exec).mockResolvedValue({ stdout: 'https://github.com/pr/1', exitCode: 0 });

    const result = await generateFixPR(
      makeAttribution(),
      git,
      patchWriter,
      { branchPrefix: 'fix/', baseBranch: 'develop' },
    );

    expect(result.branch).toMatch(/^fix\//);
    const lastCall = vi.mocked(git.exec).mock.calls.at(-1);
    expect(lastCall?.[1]).toContain('develop');
  });

  it('continues even if git apply fails', async () => {
    vi.mocked(git.exec).mockImplementation(async (cmd, args) => {
      if (args?.[0] === 'apply') throw new Error('patch failed');
      if (cmd === 'gh') return { stdout: 'https://github.com/pr/99', exitCode: 0 };
      return { stdout: '', exitCode: 0 };
    });

    const result = await generateFixPR(makeAttribution(), git, patchWriter);
    expect(result.prUrl).toBe('https://github.com/pr/99');
  });

  it('writes patch file via patchWriter', async () => {
    vi.mocked(git.exec).mockResolvedValue({ stdout: 'https://url', exitCode: 0 });

    const attr = makeAttribution({ fixSuggestion: { description: 'fix', filePath: 'f.ts', codePatch: 'my-patch-content' } });
    await generateFixPR(attr, git, patchWriter);

    expect(patchWriter.mkdir).toHaveBeenCalledWith('report');
    expect(patchWriter.write).toHaveBeenCalledWith(
      expect.stringMatching(/patch-.*\.patch$/),
      'my-patch-content',
    );
  });

  it('PR body includes attribution details', async () => {
    vi.mocked(git.exec).mockImplementation(async (cmd, _args) => {
      if (cmd === 'gh') {
        const bodyIdx = _args.indexOf('--body');
        const body = _args[bodyIdx + 1];
        expect(body).toContain('login test');
        expect(body).toContain('frontend');
        expect(body).toContain('85%');
        expect(body).toContain('must be reviewed');
        return { stdout: 'https://url', exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    });

    await generateFixPR(makeAttribution(), git, patchWriter);
    expect(git.exec).toHaveBeenCalled();
  });
});
