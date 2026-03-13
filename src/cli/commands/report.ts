import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../load-config.js';
import { createPipeline } from '../../pipeline/index.js';
import { generateReports } from '../../reporters/index.js';

export interface ReportCommandOptions {
  format?: string;
  output?: string;
}

export async function report(opts: ReportCommandOptions): Promise<void> {
  let loaded;
  try {
    loaded = await loadConfig();
  } catch {
    console.error(chalk.red('No opencroc config found. Run `opencroc init` first.'));
    process.exitCode = 1;
    return;
  }

  const { config } = loaded;

  console.log(chalk.cyan('Running pipeline to generate report...'));
  const pipeline = createPipeline(config);
  const result = await pipeline.run();

  const formats = (opts.format ?? 'html').split(',').map((s) => s.trim()) as ('html' | 'json' | 'markdown')[];
  const reports = generateReports(result, formats);

  const outDir = opts.output ?? config.outDir ?? './opencroc-output';
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const r of reports) {
    const filePath = path.join(outDir, r.filename);
    fs.writeFileSync(filePath, r.content, 'utf-8');
    console.log(chalk.green(`✔ ${r.format} report → ${filePath}`));
  }

  console.log(chalk.dim(`  ${result.modules.length} modules, ${result.generatedFiles.length} files, ${result.duration}ms`));
}
