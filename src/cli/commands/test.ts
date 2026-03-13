import chalk from 'chalk';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../load-config.js';

export interface TestOptions {
  module?: string;
  headed?: boolean;
}

function discoverTestFiles(outDir: string, moduleFilter?: string): string[] {
  const absDir = resolve(outDir);
  if (!existsSync(absDir)) return [];

  const files: string[] = [];
  const entries = readdirSync(absDir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.test.ts')) continue;
    const fullPath = join(entry.parentPath || (entry as unknown as { path: string }).path || absDir, entry.name);
    if (moduleFilter && !fullPath.includes(moduleFilter)) continue;
    files.push(fullPath);
  }
  return files;
}

export async function runTests(opts: TestOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n  🐊 OpenCroc — Run E2E Tests\n'));

  const { config, filepath } = await loadConfig();
  console.log(chalk.gray(`  Config: ${filepath}`));

  const outDir = config.outDir || './opencroc-output';
  const testFiles = discoverTestFiles(outDir, opts.module);

  if (testFiles.length === 0) {
    console.log(chalk.yellow('  No test files found. Run `opencroc generate` first.\n'));
    return;
  }

  console.log(`  Found ${testFiles.length} test file(s)`);
  for (const f of testFiles) {
    console.log(chalk.gray(`    ${f}`));
  }
  console.log('');

  // Build Playwright args
  const args = ['test', ...testFiles];
  if (!opts.headed) {
    args.push('--reporter=list');
  } else {
    args.push('--headed');
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  try {
    console.log(chalk.cyan('  Running Playwright...\n'));
    execFileSync(npxCmd, ['playwright', ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log(chalk.green('\n  ✓ All tests passed.\n'));
  } catch {
    console.log(chalk.red('\n  ✗ Some tests failed.\n'));
    process.exitCode = 1;
  }
}
