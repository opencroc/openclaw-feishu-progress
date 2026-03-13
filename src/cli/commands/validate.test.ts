import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../load-config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../validators/config-validator.js', () => ({
  validateConfig: vi.fn(),
}));

vi.mock('../../pipeline/index.js', () => ({
  createPipeline: vi.fn(),
}));

import { validate } from './validate.js';
import { loadConfig } from '../load-config.js';
import { validateConfig } from '../../validators/config-validator.js';
import { createPipeline } from '../../pipeline/index.js';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedValidateConfig = vi.mocked(validateConfig);
const mockedCreatePipeline = vi.mocked(createPipeline);

describe('validate command', () => {
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

  it('reports valid config with no errors', async () => {
    mockedValidateConfig.mockReturnValue([]);
    const mockRun = vi.fn().mockResolvedValue({
      modules: ['auth'],
      validationErrors: [],
    });
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await validate({});

    expect(mockedValidateConfig).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith(['scan', 'validate']);
  });

  it('reports config errors', async () => {
    mockedValidateConfig.mockReturnValue([
      { module: 'config', field: 'adapter', message: 'Invalid adapter', severity: 'error' },
    ]);
    const mockRun = vi.fn().mockResolvedValue({
      modules: [],
      validationErrors: [],
    });
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await validate({});

    expect(process.exitCode).toBe(1);
    // Reset for other tests
    process.exitCode = undefined;
  });

  it('applies module filter', async () => {
    mockedValidateConfig.mockReturnValue([]);
    const mockRun = vi.fn().mockResolvedValue({
      modules: ['users'],
      validationErrors: [],
    });
    mockedCreatePipeline.mockReturnValue({ run: mockRun });

    await validate({ module: 'users' });

    const configArg = mockedCreatePipeline.mock.calls[0][0];
    expect(configArg.modules).toEqual(['users']);
  });
});
