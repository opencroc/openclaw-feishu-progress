import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../load-config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../self-healing/index.js', () => ({
  createSelfHealingLoop: vi.fn(),
}));

import { heal } from './heal.js';
import { loadConfig } from '../load-config.js';
import { createSelfHealingLoop } from '../../self-healing/index.js';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedCreateLoop = vi.mocked(createSelfHealingLoop);

describe('heal command', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedLoadConfig.mockResolvedValue({
      config: { backendRoot: './backend' },
      filepath: '/fake/opencroc.config.json',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs self-healing loop with default iterations', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      iterations: 3,
      fixed: [],
      remaining: ['iteration-1: no fix applied'],
      totalTokensUsed: 0,
    });
    mockedCreateLoop.mockReturnValue({ run: mockRun });

    await heal({});

    expect(mockedCreateLoop).toHaveBeenCalledWith(
      expect.objectContaining({ maxIterations: 3, mode: 'config-only' }),
    );
    expect(mockRun).toHaveBeenCalled();
  });

  it('respects --max-iterations flag', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      iterations: 5,
      fixed: [],
      remaining: [],
      totalTokensUsed: 0,
    });
    mockedCreateLoop.mockReturnValue({ run: mockRun });

    await heal({ maxIterations: '5' });

    expect(mockedCreateLoop).toHaveBeenCalledWith(
      expect.objectContaining({ maxIterations: 5 }),
    );
  });

  it('uses selfHealing.mode from config', async () => {
    mockedLoadConfig.mockResolvedValue({
      config: { backendRoot: './backend', selfHealing: { mode: 'config-and-source' } },
      filepath: '/fake/config.json',
    });
    const mockRun = vi.fn().mockResolvedValue({
      iterations: 1,
      fixed: ['issue-1'],
      remaining: [],
      totalTokensUsed: 150,
    });
    mockedCreateLoop.mockReturnValue({ run: mockRun });

    await heal({});

    expect(mockedCreateLoop).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'config-and-source' }),
    );
  });
});
