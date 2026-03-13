import { describe, it, expect } from 'vitest';
import * as api from '../index.js';

describe('public API exports', () => {
  it('exports defineConfig', () => {
    expect(typeof api.defineConfig).toBe('function');
  });

  it('exports createPipeline', () => {
    expect(typeof api.createPipeline).toBe('function');
  });

  it('exports parser factories', () => {
    expect(typeof api.createModelParser).toBe('function');
    expect(typeof api.createControllerParser).toBe('function');
    expect(typeof api.createAssociationParser).toBe('function');
  });

  it('exports generator factories', () => {
    expect(typeof api.createTestCodeGenerator).toBe('function');
    expect(typeof api.createMockDataGenerator).toBe('function');
    expect(typeof api.createERDiagramGenerator).toBe('function');
  });

  it('exports analyzer factories', () => {
    expect(typeof api.createApiChainAnalyzer).toBe('function');
    expect(typeof api.createImpactReporter).toBe('function');
  });

  it('exports validateConfig', () => {
    expect(typeof api.validateConfig).toBe('function');
  });

  it('exports createSelfHealingLoop', () => {
    expect(typeof api.createSelfHealingLoop).toBe('function');
  });
});
