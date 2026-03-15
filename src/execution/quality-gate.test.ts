import { describe, expect, it } from 'vitest';
import { buildExecutionQualityGate } from './quality-gate.js';

describe('buildExecutionQualityGate', () => {
  it('returns pass when execution is healthy', () => {
    const result = buildExecutionQualityGate({
      metrics: { passed: 8, failed: 0, skipped: 0, timedOut: 0 },
      authStatus: 'ready',
      backendStatus: 'reused',
    });

    expect(result.level).toBe('pass');
    expect(result.setupFail).toBe(false);
    expect(result.effectiveExecutionRate).toBe(1);
    expect(result.skipRatio).toBe(0);
  });

  it('returns warn for high skip ratio', () => {
    const result = buildExecutionQualityGate({
      metrics: { passed: 1, failed: 0, skipped: 5, timedOut: 0 },
      authStatus: 'skipped',
      backendStatus: 'reused',
    });

    expect(result.level).toBe('warn');
    expect(result.skipRatio).toBeGreaterThanOrEqual(0.5);
    expect(result.reasons).toContain('high-skip-ratio');
  });

  it('returns fail for auth/setup failure without metrics', () => {
    const result = buildExecutionQualityGate({
      metrics: null,
      authStatus: 'failed',
      backendStatus: 'started',
    });

    expect(result.level).toBe('fail');
    expect(result.setupFail).toBe(true);
    expect(result.authFailRatio).toBe(1);
    expect(result.reasons).toContain('setup-failed');
  });
});
