import { describe, it, expect } from 'vitest';
import {
  generateGitHubActionsTemplate,
  generateGitLabCITemplate,
  generateCiTemplate,
  listCiPlatforms,
} from './index.js';

describe('CI Templates', () => {
  describe('listCiPlatforms', () => {
    it('should return github and gitlab', () => {
      const platforms = listCiPlatforms();
      expect(platforms).toContain('github');
      expect(platforms).toContain('gitlab');
    });
  });

  describe('generateCiTemplate', () => {
    it('should throw on unknown platform', () => {
      expect(() => generateCiTemplate('jenkins')).toThrow('Unknown CI platform');
    });

    it('should dispatch to github generator', () => {
      const result = generateCiTemplate('github');
      expect(result).toContain('actions/checkout@v4');
      expect(result).toContain('opencroc generate');
    });

    it('should dispatch to gitlab generator', () => {
      const result = generateCiTemplate('gitlab');
      expect(result).toContain('stages:');
      expect(result).toContain('opencroc generate');
    });
  });

  describe('generateGitHubActionsTemplate', () => {
    it('should generate valid YAML structure', () => {
      const yaml = generateGitHubActionsTemplate();
      expect(yaml).toContain('name: OpenCroc E2E');
      expect(yaml).toContain('npx playwright install');
      expect(yaml).toContain('npx opencroc generate --all');
      expect(yaml).toContain('npx opencroc test');
      expect(yaml).toContain('upload-artifact@v4');
    });

    it('should include self-heal step when enabled', () => {
      const yaml = generateGitHubActionsTemplate({ selfHeal: true });
      expect(yaml).toContain('npx opencroc heal');
    });

    it('should not include self-heal step by default', () => {
      const yaml = generateGitHubActionsTemplate();
      expect(yaml).not.toContain('opencroc heal');
    });

    it('should use custom node versions', () => {
      const yaml = generateGitHubActionsTemplate({ nodeVersions: ['18.x', '20.x'] });
      expect(yaml).toContain('18.x');
      expect(yaml).toContain('20.x');
    });

    it('should use custom install command', () => {
      const yaml = generateGitHubActionsTemplate({ installCommand: 'pnpm install' });
      expect(yaml).toContain('pnpm install');
    });
  });

  describe('generateGitLabCITemplate', () => {
    it('should generate valid YAML structure', () => {
      const yaml = generateGitLabCITemplate();
      expect(yaml).toContain('image: node:20');
      expect(yaml).toContain('stages:');
      expect(yaml).toContain('generate:');
      expect(yaml).toContain('e2e:');
      expect(yaml).toContain('npx playwright install');
    });

    it('should use custom node version', () => {
      const yaml = generateGitLabCITemplate({ nodeVersions: ['22'] });
      expect(yaml).toContain('image: node:22');
    });
  });
});
