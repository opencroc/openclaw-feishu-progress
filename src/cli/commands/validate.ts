import chalk from 'chalk';
import { loadConfig } from '../load-config.js';
import { validateConfig } from '../../validators/config-validator.js';
import { createPipeline } from '../../pipeline/index.js';
import type { ValidationError } from '../../types.js';

export interface ValidateOptions {
  module?: string;
}

function printErrors(errors: ValidationError[]): void {
  for (const err of errors) {
    const icon = err.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
    const scope = err.module === 'config' ? '' : ` [${err.module}]`;
    console.log(`  ${icon}${scope} ${err.field}: ${err.message}`);
  }
}

export async function validate(opts: ValidateOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n  🐊 OpenCroc — Validate\n'));

  // Load and validate config
  const { config, filepath } = await loadConfig();
  console.log(chalk.gray(`  Config: ${filepath}`));

  const configErrors = validateConfig(config as unknown as Record<string, unknown>);

  // Apply module filter
  if (opts.module) {
    config.modules = [opts.module];
  }

  // Run pipeline in scan + validate mode to discover module-level issues
  const pipeline = createPipeline(config);
  const result = await pipeline.run(['scan', 'validate']);

  const allErrors = [...configErrors, ...result.validationErrors];
  const errors = allErrors.filter((e) => e.severity === 'error');
  const warnings = allErrors.filter((e) => e.severity === 'warning');

  if (allErrors.length === 0) {
    console.log(chalk.green('  ✓ Configuration is valid.'));
    console.log(chalk.gray(`    Modules: ${result.modules.join(', ') || '(none)'}\n`));
    return;
  }

  if (errors.length > 0) {
    console.log(chalk.red(`  ${errors.length} error(s):`));
    printErrors(errors);
  }
  if (warnings.length > 0) {
    console.log(chalk.yellow(`  ${warnings.length} warning(s):`));
    printErrors(warnings);
  }

  console.log('');

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}
