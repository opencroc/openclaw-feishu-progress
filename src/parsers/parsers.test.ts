import { describe, it, expect } from 'vitest';
import { createModelParser } from './model-parser.js';
import { createControllerParser } from './controller-parser.js';
import { createAssociationParser } from './association-parser.js';

describe('createModelParser', () => {
  it('returns a parser with parseFile and parseDirectory', () => {
    const parser = createModelParser();
    expect(typeof parser.parseFile).toBe('function');
    expect(typeof parser.parseDirectory).toBe('function');
  });

  it('parseFile rejects with not implemented', async () => {
    const parser = createModelParser();
    await expect(parser.parseFile('test.ts')).rejects.toThrow('not yet implemented');
  });
});

describe('createControllerParser', () => {
  it('returns a parser with parseFile and parseDirectory', () => {
    const parser = createControllerParser();
    expect(typeof parser.parseFile).toBe('function');
    expect(typeof parser.parseDirectory).toBe('function');
  });

  it('parseFile rejects with not implemented', async () => {
    const parser = createControllerParser();
    await expect(parser.parseFile('test.ts')).rejects.toThrow('not yet implemented');
  });
});

describe('createAssociationParser', () => {
  it('returns a parser with parseFile', () => {
    const parser = createAssociationParser();
    expect(typeof parser.parseFile).toBe('function');
  });

  it('parseFile rejects with not implemented', async () => {
    const parser = createAssociationParser();
    await expect(parser.parseFile('test.ts')).rejects.toThrow('not yet implemented');
  });
});
