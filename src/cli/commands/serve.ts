import chalk from 'chalk';
import { loadConfig } from '../load-config.js';
import type { OpenCrocConfig } from '../../types.js';

export interface ServeCommandOptions {
  port?: string;
  host?: string;
  open?: boolean;
}

export async function serve(opts: ServeCommandOptions): Promise<void> {
  let config: OpenCrocConfig;
  let configPath: string;

  try {
    const loaded = await loadConfig();
    config = loaded.config;
    configPath = loaded.filepath;
  } catch {
    // No config file — use sensible defaults based on cwd
    config = { backendRoot: '.' };
    configPath = '(auto-detected)';
    console.log(chalk.yellow('⚠ No project config found, using current directory as backend root.'));
    console.log(chalk.gray('  Tip: create `openclaw-feishu-progress.config.*` or keep using the legacy `opencroc.config.*` name.\n'));
  }

  const port = parseInt(opts.port || '8765', 10);
  const host = opts.host || 'localhost';

  console.log(chalk.cyan('🐊 Starting OpenClaw Feishu Progress...'));
  console.log(chalk.gray(`   Config: ${configPath}`));
  console.log(chalk.gray(`   Backend: ${config.backendRoot}`));

  const { startServer } = await import('../../server/index.js');
  await startServer({
    port,
    host,
    open: opts.open ?? true,
    config,
    cwd: process.cwd(),
  });
}
