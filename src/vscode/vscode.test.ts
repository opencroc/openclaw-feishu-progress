import { describe, it, expect } from 'vitest';
import {
  EXTENSION_ID,
  COMMANDS,
  buildModuleTree,
  buildStatusTree,
  generateExtensionManifest,
  generateExtensionEntrypoint,
} from './index.js';

describe('VSCode Extension Scaffold', () => {
  describe('COMMANDS', () => {
    it('should define at least 5 commands', () => {
      expect(COMMANDS.length).toBeGreaterThanOrEqual(5);
    });

    it('should have unique command IDs', () => {
      const ids = COMMANDS.map((c) => c.command);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should use opencroc prefix', () => {
      for (const cmd of COMMANDS) {
        expect(cmd.command).toMatch(/^opencroc\./);
        expect(cmd.category).toBe('OpenCroc');
      }
    });
  });

  describe('EXTENSION_ID', () => {
    it('should be opencroc.opencroc', () => {
      expect(EXTENSION_ID).toBe('opencroc.opencroc');
    });
  });

  describe('buildModuleTree', () => {
    it('should create tree items for each module', () => {
      const tree = buildModuleTree(['auth', 'blog']);
      expect(tree).toHaveLength(2);
      expect(tree[0].label).toBe('auth');
      expect(tree[1].label).toBe('blog');
    });

    it('should include children commands', () => {
      const tree = buildModuleTree(['users']);
      expect(tree[0].children).toBeDefined();
      expect(tree[0].children!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('buildStatusTree', () => {
    it('should show stats as tree items', () => {
      const tree = buildStatusTree({
        modules: 3,
        tables: 50,
        relations: 20,
        generatedFiles: 10,
        errors: 0,
      });
      expect(tree.some((item) => item.label.includes('50'))).toBe(true);
      expect(tree.some((item) => item.label.includes('No errors'))).toBe(true);
    });

    it('should show error count when > 0', () => {
      const tree = buildStatusTree({
        modules: 1,
        tables: 5,
        relations: 2,
        generatedFiles: 3,
        errors: 2,
      });
      expect(tree.some((item) => item.label.includes('Errors: 2'))).toBe(true);
    });
  });

  describe('generateExtensionManifest', () => {
    it('should produce valid manifest structure', () => {
      const manifest = generateExtensionManifest();
      expect(manifest.name).toBe('opencroc');
      expect(manifest.displayName).toBe('OpenCroc');
      expect(manifest.engines).toHaveProperty('vscode');
      expect(manifest.main).toBe('./out/extension.js');
    });

    it('should include all commands in contributes', () => {
      const manifest = generateExtensionManifest();
      const contributes = manifest.contributes as Record<string, unknown>;
      const commands = contributes.commands as Array<{ command: string }>;
      expect(commands.length).toBe(COMMANDS.length);
    });

    it('should include views and configuration', () => {
      const manifest = generateExtensionManifest();
      const contributes = manifest.contributes as Record<string, unknown>;
      expect(contributes.views).toBeDefined();
      expect(contributes.configuration).toBeDefined();
    });
  });

  describe('generateExtensionEntrypoint', () => {
    it('should generate TypeScript source', () => {
      const source = generateExtensionEntrypoint();
      expect(source).toContain('export function activate');
      expect(source).toContain('export function deactivate');
      expect(source).toContain("import * as vscode from 'vscode'");
    });

    it('should register all core commands', () => {
      const source = generateExtensionEntrypoint();
      expect(source).toContain("'opencroc.init'");
      expect(source).toContain("'opencroc.generate'");
      expect(source).toContain("'opencroc.test'");
      expect(source).toContain("'opencroc.validate'");
      expect(source).toContain("'opencroc.heal'");
    });
  });
});
