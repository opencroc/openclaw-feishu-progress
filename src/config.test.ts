import { describe, it, expect } from 'vitest';
import { defineConfig } from './config.js';
import type { OpenCrocConfig } from './types.js';

describe('defineConfig', () => {
  it('returns the same config object', () => {
    const input: OpenCrocConfig = { backendRoot: './backend' };
    const result = defineConfig(input);
    expect(result).toBe(input);
  });

  it('preserves all config fields', () => {
    const input: OpenCrocConfig = {
      backendRoot: './backend',
      outDir: './output',
      adapter: 'sequelize',
      modules: ['user', 'order'],
      steps: ['scan', 'codegen'],
      llm: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-key',
      },
      playwright: {
        baseURL: 'http://localhost:3000',
        headless: true,
      },
      selfHealing: {
        enabled: true,
        maxIterations: 5,
      },
      report: {
        format: ['html', 'json'],
        outputDir: './reports',
      },
    };
    const result = defineConfig(input);
    expect(result).toEqual(input);
  });

  it('works with minimal config', () => {
    const result = defineConfig({ backendRoot: '.' });
    expect(result.backendRoot).toBe('.');
    expect(result.outDir).toBeUndefined();
  });
});
