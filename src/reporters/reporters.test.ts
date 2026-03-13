import { describe, it, expect } from 'vitest';
import type { PipelineRunResult } from '../types.js';
import {
  generateJsonReport,
  generateMarkdownReport,
  generateHtmlReport,
  generateReports,
} from './index.js';

function makeMockResult(): PipelineRunResult {
  const erDiagrams = new Map();
  erDiagrams.set('default', {
    tables: [{ tableName: 'users', fields: [] }, { tableName: 'roles', fields: [] }],
    relations: [{ sourceTable: 'users', sourceField: 'role_id', targetTable: 'roles', targetField: 'id', cardinality: '1:N' as const }],
    mermaidText: 'erDiagram\n  users ||--o{ roles : has',
  });

  const chainPlans = new Map();
  chainPlans.set('default', {
    chains: [
      { name: 'user-crud', module: 'default', steps: [{ order: 1, action: 'POST', endpoint: {} as never, description: 'Create user', assertions: [] }] },
    ],
    totalSteps: 1,
  });

  return {
    modules: ['default'],
    erDiagrams,
    chainPlans,
    generatedFiles: [
      { filePath: 'tests/user-crud.spec.ts', content: '', module: 'default', chain: 'user-crud' },
    ],
    validationErrors: [
      { module: 'default', field: 'backendRoot', message: 'Path not found', severity: 'error' },
      { module: 'default', field: 'api-chain', message: 'Cycle detected', severity: 'warning' },
    ],
    duration: 500,
  };
}

describe('Reporters', () => {
  const result = makeMockResult();

  describe('generateJsonReport', () => {
    it('should generate valid JSON', () => {
      const report = generateJsonReport(result);
      expect(report.format).toBe('json');
      expect(report.filename).toBe('opencroc-report.json');
      const parsed = JSON.parse(report.content);
      expect(parsed.modules).toEqual(['default']);
      expect(parsed.duration).toBe(500);
      expect(parsed.erDiagrams.default.tables).toBe(2);
      expect(parsed.erDiagrams.default.relations).toBe(1);
      expect(parsed.chainPlans.default.chains).toBe(1);
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate markdown with sections', () => {
      const report = generateMarkdownReport(result);
      expect(report.format).toBe('markdown');
      expect(report.filename).toBe('opencroc-report.md');
      expect(report.content).toContain('# OpenCroc Report');
      expect(report.content).toContain('## ER Diagrams');
      expect(report.content).toContain('## Chain Plans');
      expect(report.content).toContain('## Generated Files');
      expect(report.content).toContain('## Validation Issues');
      expect(report.content).toContain('Path not found');
    });
  });

  describe('generateHtmlReport', () => {
    it('should generate valid HTML document', () => {
      const report = generateHtmlReport(result);
      expect(report.format).toBe('html');
      expect(report.filename).toBe('opencroc-report.html');
      expect(report.content).toContain('<!DOCTYPE html>');
      expect(report.content).toContain('<title>OpenCroc Report</title>');
      expect(report.content).toContain('500ms');
    });

    it('should include summary cards', () => {
      const report = generateHtmlReport(result);
      expect(report.content).toContain('Tables');
      expect(report.content).toContain('Relations');
      expect(report.content).toContain('Chains');
      expect(report.content).toContain('Files');
    });

    it('should include ER diagram table', () => {
      const report = generateHtmlReport(result);
      expect(report.content).toContain('default');
      expect(report.content).toContain('ER Diagrams');
    });

    it('should include validation errors when present', () => {
      const report = generateHtmlReport(result);
      expect(report.content).toContain('Validation Issues');
      expect(report.content).toContain('Path not found');
    });

    it('should omit validation section when no errors', () => {
      const cleanResult = { ...result, validationErrors: [] };
      const report = generateHtmlReport(cleanResult);
      expect(report.content).not.toContain('Validation Issues');
    });

    it('should escape HTML in module names', () => {
      const erDiagrams = new Map();
      erDiagrams.set('<script>alert(1)</script>', {
        tables: [],
        relations: [],
        mermaidText: '',
      });
      const xssResult = { ...result, erDiagrams, modules: ['<script>'] };
      const report = generateHtmlReport(xssResult);
      expect(report.content).not.toContain('<script>alert(1)</script>');
      expect(report.content).toContain('&lt;script&gt;');
    });
  });

  describe('generateReports', () => {
    it('should generate multiple formats', () => {
      const reports = generateReports(result, ['html', 'json', 'markdown']);
      expect(reports).toHaveLength(3);
      expect(reports.map((r) => r.format)).toEqual(['html', 'json', 'markdown']);
    });

    it('should default to html', () => {
      const reports = generateReports(result);
      expect(reports).toHaveLength(1);
      expect(reports[0].format).toBe('html');
    });

    it('should throw on unknown format', () => {
      expect(() => generateReports(result, ['csv' as 'html'])).toThrow('Unknown report format');
    });
  });
});
