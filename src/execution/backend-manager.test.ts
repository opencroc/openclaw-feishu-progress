import { describe, expect, it, vi } from 'vitest';
import { createBackendManager } from './backend-manager.js';

describe('createBackendManager', () => {
  it('reuses existing backend in reuse mode', async () => {
    const waitForBackend = vi.fn().mockResolvedValue(undefined);
    const spawn = vi.fn();
    const manager = createBackendManager({ waitForBackend, spawn });

    const result = await manager.ensureReady({
      mode: 'reuse',
      cwd: '/tmp',
      server: { healthUrl: 'http://localhost:3010/health' },
    });

    expect(result.status).toBe('reused');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('throws HEALTH_FAIL in reuse mode when backend unavailable', async () => {
    const waitForBackend = vi.fn().mockRejectedValue(new Error('down'));
    const manager = createBackendManager({ waitForBackend });

    await expect(
      manager.ensureReady({
        mode: 'reuse',
        cwd: '/tmp',
        server: { healthUrl: 'http://localhost:3010/health' },
      }),
    ).rejects.toThrow('HEALTH_FAIL');
  });

  it('starts managed backend when not reusable', async () => {
    const waitForBackend = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(undefined);
    const kill = vi.fn().mockReturnValue(true);
    const spawn = vi.fn().mockReturnValue({ kill, exitCode: null, pid: 1234 });
    const manager = createBackendManager({ waitForBackend, spawn });

    const result = await manager.ensureReady({
      mode: 'managed',
      cwd: '/tmp',
      server: {
        command: 'npm',
        args: ['run', 'dev'],
        healthUrl: 'http://localhost:3010/health',
      },
    });

    expect(result.status).toBe('started');
    expect(spawn).toHaveBeenCalledTimes(1);
    await result.cleanup();
    expect(kill).toHaveBeenCalled();
  });

  it('returns skipped in auto mode when command is missing', async () => {
    const waitForBackend = vi.fn().mockRejectedValue(new Error('down'));
    const spawn = vi.fn();
    const manager = createBackendManager({ waitForBackend, spawn });

    const result = await manager.ensureReady({
      mode: 'auto',
      cwd: '/tmp',
      server: { healthUrl: 'http://localhost:3010/health' },
    });

    expect(result.status).toBe('skipped');
    expect(spawn).not.toHaveBeenCalled();
  });
});
