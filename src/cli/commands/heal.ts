import chalk from 'chalk';
import { loadConfig } from '../load-config.js';
import { createSelfHealingLoop } from '../../self-healing/index.js';
import type { SelfHealingConfig } from '../../types.js';

export interface HealOptions {
  module?: string;
  maxIterations?: string;
}

export async function heal(opts: HealOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n  🐊 OpenCroc — Self-Healing\n'));

  const { config, filepath } = await loadConfig();
  console.log(chalk.gray(`  Config: ${filepath}`));

  const outDir = config.outDir || './opencroc-output';
  const maxIterations = opts.maxIterations ? parseInt(opts.maxIterations, 10) : 3;

  const healingConfig: SelfHealingConfig = {
    enabled: true,
    maxIterations,
    mode: config.selfHealing?.mode || 'config-only',
  };

  console.log(chalk.gray(`  Mode: ${healingConfig.mode}`));
  console.log(chalk.gray(`  Max iterations: ${maxIterations}`));

  if (opts.module) {
    console.log(chalk.gray(`  Module: ${opts.module}`));
  }
  console.log('');

  const loop = createSelfHealingLoop(healingConfig);
  const result = await loop.run(outDir);

  // Report results
  console.log(chalk.cyan('  Results:'));
  console.log(`    Iterations   : ${result.iterations}`);
  console.log(`    Fixed        : ${result.fixed.length > 0 ? chalk.green(result.fixed.join(', ')) : chalk.gray('(none)')}`);
  console.log(`    Remaining    : ${result.remaining.length > 0 ? chalk.yellow(result.remaining.join(', ')) : chalk.gray('(none)')}`);
  if (result.totalTokensUsed > 0) {
    console.log(`    Tokens used  : ${result.totalTokensUsed}`);
  }

  console.log('');

  if (result.remaining.length > 0) {
    console.log(chalk.yellow('  Some issues could not be auto-fixed. Manual review needed.\n'));
  } else if (result.fixed.length > 0) {
    console.log(chalk.green('  ✓ All issues resolved.\n'));
  } else {
    console.log(chalk.gray('  No issues detected.\n'));
  }
}
