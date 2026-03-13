import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { generateCiTemplate, listCiPlatforms } from '../../ci/index.js';
import type { CiTemplateOptions } from '../../ci/index.js';

export interface CiCommandOptions {
  platform?: string;
  selfHeal?: boolean;
  node?: string;
}

export async function ci(opts: CiCommandOptions): Promise<void> {
  const platform = opts.platform ?? 'github';
  const available = listCiPlatforms();

  if (!available.includes(platform)) {
    console.error(chalk.red(`Unknown platform: "${platform}". Available: ${available.join(', ')}`));
    process.exitCode = 1;
    return;
  }

  const templateOpts: CiTemplateOptions = {
    selfHeal: opts.selfHeal ?? false,
  };
  if (opts.node) {
    templateOpts.nodeVersions = opts.node.split(',').map((s) => s.trim());
  }

  const content = generateCiTemplate(platform, templateOpts);

  let outputPath: string;
  if (platform === 'github') {
    outputPath = path.join('.github', 'workflows', 'opencroc.yml');
  } else if (platform === 'gitlab') {
    outputPath = '.gitlab-ci.yml';
  } else {
    outputPath = `opencroc-ci-${platform}.yml`;
  }

  const dir = path.dirname(outputPath);
  if (dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(chalk.green(`✔ CI template written to ${outputPath}`));
  console.log(chalk.dim(`  Platform: ${platform}`));
}
