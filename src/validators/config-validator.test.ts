import { describe, it, expect } from 'vitest';
import { validateConfig } from './config-validator.js';

describe('validateConfig', () => {
  it('returns an empty array for any input (stub)', () => {
    const result = validateConfig({});
    expect(result).toEqual([]);
  });

  it('returns an array', () => {
    const result = validateConfig({ backendRoot: './backend' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('accepts arbitrary keys without throwing', () => {
    expect(() =>
      validateConfig({ unknown: true, nested: { deep: 1 } }),
    ).not.toThrow();
  });
});
