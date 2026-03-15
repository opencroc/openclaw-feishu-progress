import { execSync as nodeExecSync } from 'node:child_process';
import type { ExecutionMetrics } from '../types.js';
import type {
  ExecutionCoordinator,
  ExecutionCoordinatorDeps,
  ExecutionRunMode,
  ExecutionRunRequest,
  ExecutionRunResult,
} from './types.js';

function parseMetrics(output: string): ExecutionMetrics {
  const metrics: ExecutionMetrics = { passed: 0, failed: 0, skipped: 0, timedOut: 0 };
  const passedMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const skippedMatch = output.match(/(\d+)\s+skipped/);
  const timedOutMatch = output.match(/(\d+)\s+timed?\s*out/i);
  if (passedMatch) metrics.passed = parseInt(passedMatch[1], 10);
  if (failedMatch) metrics.failed = parseInt(failedMatch[1], 10);
  if (skippedMatch) metrics.skipped = parseInt(skippedMatch[1], 10);
  if (timedOutMatch) metrics.timedOut = parseInt(timedOutMatch[1], 10);
  return metrics;
}

function getFailureLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => /fail|error|timeout/i.test(line))
    .slice(0, 5);
}

export function createExecutionCoordinator(deps: ExecutionCoordinatorDeps = {}): ExecutionCoordinator {
  const execSync = deps.execSync ?? nodeExecSync;
  const categorizeFailure = deps.categorizeFailure;

  return {
    async run(request: ExecutionRunRequest): Promise<ExecutionRunResult> {
      const mode: ExecutionRunMode = request.mode ?? 'auto';
      const timeoutMs = request.timeoutMs ?? 300_000;
      const command = `npx playwright test ${request.testFiles.map((file) => `"${file}"`).join(' ')} --reporter=line 2>&1`;

      let output: string;
      try {
        output = String(execSync(command, {
          cwd: request.cwd,
          encoding: 'utf-8',
          timeout: timeoutMs,
          stdio: 'pipe',
          env: request.env,
        }));
      } catch (err: unknown) {
        const execErr = err as { stdout?: string; stderr?: string };
        output = `${execErr.stdout || ''}\n${execErr.stderr || ''}`;
      }

      output = output.trim();
      const metrics = parseMetrics(output);
      if (metrics.passed === 0 && metrics.failed === 0 && metrics.skipped === 0 && metrics.timedOut === 0) {
        metrics.failed = request.testFiles.length;
      }

      const failureHints = getFailureLines(output).map((line) => {
        const analyzed = categorizeFailure ? categorizeFailure(line) : { category: 'unknown', confidence: 0.5 };
        return {
          line,
          category: analyzed.category,
          confidence: analyzed.confidence,
        };
      });

      return {
        mode,
        metrics,
        output,
        failureHints,
      };
    },
  };
}
