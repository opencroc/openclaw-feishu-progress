import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { OpenCrocConfig } from '../types.js';
import { generatePlaywrightConfig } from '../runtime/playwright-config-generator.js';
import { generateGlobalSetup } from '../runtime/global-setup-generator.js';
import { generateGlobalTeardown } from '../runtime/global-teardown-generator.js';
import { generateAuthSetup } from '../runtime/auth-setup-generator.js';
import type { RuntimeBootstrap, RuntimeBootstrapRequest, RuntimeBootstrapResult } from './types.js';

function ensureFile(filePath: string, content: string, force: boolean): boolean {
  if (existsSync(filePath) && !force) {
    return false;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

export function createRuntimeBootstrap(config: OpenCrocConfig): RuntimeBootstrap {
  return {
    async ensure(request: RuntimeBootstrapRequest): Promise<RuntimeBootstrapResult> {
      const force = request.force ?? false;
      const files = [
        {
          name: 'playwright.config.ts',
          content: generatePlaywrightConfig(config),
        },
        {
          name: 'global-setup.ts',
          content: generateGlobalSetup(config),
        },
        {
          name: 'global-teardown.ts',
          content: generateGlobalTeardown(config),
        },
      ];

      if (request.hasAuth) {
        files.push({
          name: 'auth.setup.ts',
          content: generateAuthSetup(config),
        });
      }

      const writtenFiles: string[] = [];
      const skippedFiles: string[] = [];
      for (const file of files) {
        const filePath = join(request.cwd, file.name);
        const written = ensureFile(filePath, file.content, force);
        if (written) writtenFiles.push(file.name);
        else skippedFiles.push(file.name);
      }

      return {
        writtenFiles,
        skippedFiles,
      };
    },
  };
}
