/**
 * Dialog Loop Runner — multi-iteration self-healing loop.
 *
 * Runs tests, parses results, applies controlled fixes, and reruns
 * until all tests pass or the maximum iteration count is reached.
 * Tracks error history to avoid infinite loops on recurring failures.
 */

import type {
  DialogLoopConfig,
  TestFailureInfo,
  IterationResult,
  DialogLoopSummary,
  ControlledFixOutcome,
} from '../types.js';

// ===== Abstractions for testability =====

export interface TestRunner {
  run(): Promise<{ stdout: string; exitCode: number }>;
}

export interface ResultParser {
  parse(stdout: string): TestFailureInfo[];
  countTotal(stdout: string): number;
}

export interface FixApplier {
  apply(failure: TestFailureInfo): Promise<ControlledFixOutcome>;
}

// ===== Defaults =====

const DEFAULTS: Required<DialogLoopConfig> = {
  maxIterations: 3,
  pollIntervalMs: 10_000,
  sameErrorThreshold: 2,
  autoRerunOnFix: true,
};

// ===== JSON result parser (reads Playwright JSON output) =====

export function createJsonResultParser(): ResultParser {
  return {
    parse(stdout: string): TestFailureInfo[] {
      const failures: TestFailureInfo[] = [];
      // Match pass/fail summary from Playwright output
      const lines = stdout.split('\n');
      for (const line of lines) {
        // Playwright format: "  ✘  [chromium] › test.spec.ts:10:5 › suite › title"
        // or stderr lines with "Error:" prefix
        const failMatch = line.match(/[✘✗×]\s+.*?›\s+(.+)/);
        if (failMatch) {
          failures.push({
            title: failMatch[1].trim(),
            error: failMatch[1].trim(),
          });
        }
      }
      return failures;
    },
    countTotal(stdout: string): number {
      // Match "X passed" or "X failed" from Playwright summary
      let total = 0;
      const passMatch = stdout.match(/(\d+)\s+passed/);
      const failMatch = stdout.match(/(\d+)\s+failed/);
      if (passMatch) total += parseInt(passMatch[1], 10);
      if (failMatch) total += parseInt(failMatch[1], 10);
      return total || 1; // at least 1 to avoid division by zero
    },
  };
}

// ===== Dialog Loop =====

export interface DialogLoopOptions {
  runner: TestRunner;
  parser: ResultParser;
  fixer: FixApplier;
  config?: DialogLoopConfig;
  onIteration?: (result: IterationResult) => void;
}

export async function runDialogLoop(options: DialogLoopOptions): Promise<DialogLoopSummary> {
  const cfg = { ...DEFAULTS, ...options.config };
  const { runner, parser, fixer } = options;

  const history: IterationResult[] = [];
  const errorTracker = new Map<string, number>();

  for (let iteration = 1; iteration <= cfg.maxIterations + 1; iteration++) {
    const iterStart = Date.now();

    // Step 1: Run tests
    const { stdout } = await runner.run();

    // Step 2: Parse results
    const failures = parser.parse(stdout);
    const totalTests = parser.countTotal(stdout);
    const passed = totalTests - failures.length;

    const iterResult: IterationResult = {
      iteration,
      totalTests,
      passed,
      failed: failures.length,
      failedTests: failures.map(f => f.title),
      fixesApplied: [],
      durationMs: 0,
    };

    // Step 3: All passed → success
    if (failures.length === 0) {
      iterResult.durationMs = Date.now() - iterStart;
      history.push(iterResult);
      options.onIteration?.(iterResult);
      break;
    }

    // Step 4: Max iterations exceeded
    if (iteration > cfg.maxIterations) {
      iterResult.durationMs = Date.now() - iterStart;
      history.push(iterResult);
      options.onIteration?.(iterResult);
      break;
    }

    // Step 5: Filter out repeated errors beyond threshold
    const newFailures = failures.filter(f => {
      const key = `${f.title}::${f.error}`;
      const count = (errorTracker.get(key) ?? 0) + 1;
      errorTracker.set(key, count);
      return count <= cfg.sameErrorThreshold;
    });

    if (newFailures.length === 0) {
      iterResult.durationMs = Date.now() - iterStart;
      history.push(iterResult);
      options.onIteration?.(iterResult);
      break;
    }

    // Step 6: Apply controlled fixes
    for (const failure of newFailures) {
      const outcome = await fixer.apply(failure);
      if (outcome.success) {
        iterResult.fixesApplied.push(failure.title);
      }
    }

    iterResult.durationMs = Date.now() - iterStart;
    history.push(iterResult);
    options.onIteration?.(iterResult);

    // Step 7: If any fixes applied and autoRerun, continue loop
    if (iterResult.fixesApplied.length === 0 || !cfg.autoRerunOnFix) {
      break;
    }
  }

  const final = history[history.length - 1];
  const totalFixesApplied = history.reduce((sum, h) => sum + h.fixesApplied.length, 0);

  return {
    iterations: history,
    finalPassed: final?.passed ?? 0,
    finalFailed: final?.failed ?? 0,
    totalFixesApplied,
    success: (final?.failed ?? 1) === 0,
  };
}
