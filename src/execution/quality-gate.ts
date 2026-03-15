import type { ExecutionMetrics } from '../types.js';
import type { AuthStatus, BackendStatus, ExecutionQualityGateResult } from './types.js';

export interface BuildQualityGateInput {
  metrics?: ExecutionMetrics | null;
  authStatus: AuthStatus;
  backendStatus: BackendStatus;
}

export function buildExecutionQualityGate(input: BuildQualityGateInput): ExecutionQualityGateResult {
  const metrics = input.metrics ?? { passed: 0, failed: 0, skipped: 0, timedOut: 0 };
  const total = metrics.passed + metrics.failed + metrics.skipped + metrics.timedOut;
  const skipRatio = total > 0 ? metrics.skipped / total : 0;
  const effectiveExecutionRate = total > 0 ? metrics.passed / total : 0;
  const authFailRatio = input.authStatus === 'failed' ? 1 : 0;
  const setupFail =
    input.authStatus === 'failed' ||
    input.backendStatus === 'failed' ||
    (total === 0 && (input.authStatus !== 'skipped' || input.backendStatus !== 'skipped'));

  const reasons: string[] = [];
  if (setupFail) reasons.push('setup-failed');
  if (skipRatio >= 0.5) reasons.push('high-skip-ratio');
  if (metrics.failed > 0) reasons.push('tests-failed');
  if (metrics.timedOut > 0) reasons.push('tests-timeout');

  let level: ExecutionQualityGateResult['level'] = 'pass';
  if (setupFail || metrics.failed > 0) level = 'fail';
  else if (skipRatio >= 0.5 || metrics.timedOut > 0) level = 'warn';

  return {
    setupFail,
    skipRatio,
    authFailRatio,
    effectiveExecutionRate,
    level,
    reasons,
    authStatus: input.authStatus,
    backendStatus: input.backendStatus,
  };
}
