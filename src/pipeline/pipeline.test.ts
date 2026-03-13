import { describe, it, expect } from 'vitest';
import { createPipeline } from './index.js';
import type { OpenCrocConfig } from '../types.js';

describe('createPipeline', () => {
  const config: OpenCrocConfig = { backendRoot: './backend' };

  it('returns an object with a run method', () => {
    const pipeline = createPipeline(config);
    expect(pipeline).toBeDefined();
    expect(typeof pipeline.run).toBe('function');
  });

  it('run() rejects with "not yet implemented"', async () => {
    const pipeline = createPipeline(config);
    await expect(pipeline.run()).rejects.toThrow('Pipeline not yet implemented');
  });

  it('run() rejects even when steps are provided', async () => {
    const pipeline = createPipeline(config);
    await expect(pipeline.run(['scan'])).rejects.toThrow(
      'Pipeline not yet implemented',
    );
  });
});
