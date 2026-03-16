/**
 * CLI Command: analyze
 *
 * Deep analysis of a scanned project — risks, impact, multi-perspective reports.
 *
 * Usage:
 *   opencroc analyze ./my-project
 *   opencroc analyze --perspective architect --risks
 *   opencroc analyze --impact "api:GET:/users"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { scanProject } from '../../scanner/project-scanner.js';
import { buildKnowledgeGraph } from '../../graph/index.js';
import { analyzeRisks, analyzeImpact, generateReport } from '../../insight/index.js';
import type { ReportPerspective } from '../../graph/types.js';

interface AnalyzeOptions {
  perspective: string;
  risks: boolean;
  impact?: string;
  output: string;
}

export async function analyze(target: string, opts: AnalyzeOptions): Promise<void> {
  console.log('');
  console.log(chalk.green('🐊 OpenCroc Studio — Project Analysis'));
  console.log('');

  const absTarget = path.resolve(target);

  // Check for existing graph first
  const graphPath = path.join(opts.output, 'knowledge-graph.json');
  let graph;

  if (fs.existsSync(graphPath)) {
    console.log(chalk.gray(`   Loading cached graph from ${graphPath}...`));
    // Need to re-scan for full graph (cached is simplified)
  }

  // Scan
  console.log(chalk.cyan('📡 Scanning project...'));
  const scanResult = await scanProject({
    rootDir: absTarget,
    onProgress: (phase, percent, detail) => {
      if (percent === 100) console.log(chalk.gray(`   [${phase}] ${detail || 'done'}`));
    },
  });

  const projectName = path.basename(absTarget);
  graph = buildKnowledgeGraph(scanResult, {
    projectName,
    source: 'local',
    rootPath: absTarget,
  });

  console.log(chalk.green(`   ✅ ${graph.nodes.length} nodes, ${graph.edges.length} edges`));
  console.log('');

  // Risk analysis
  if (opts.risks) {
    console.log(chalk.cyan('⚠️  Risk Analysis'));
    const risks = await analyzeRisks(graph);

    if (risks.length === 0) {
      console.log(chalk.green('   ✅ No significant risks detected.'));
    } else {
      for (const r of risks) {
        const icon = r.severity === 'critical' ? '🔴' : r.severity === 'high' ? '🟠' : r.severity === 'medium' ? '🟡' : '🔵';
        console.log(`   ${icon} [${r.severity.toUpperCase()}] ${r.title}`);
        console.log(chalk.gray(`      ${r.description}`));
        if (r.suggestion) {
          console.log(chalk.green(`      💡 ${r.suggestion}`));
        }
        console.log('');
      }
    }
  }

  // Impact analysis
  if (opts.impact) {
    console.log(chalk.cyan(`🎯 Impact Analysis: ${opts.impact}`));
    const impact = analyzeImpact(graph, opts.impact);
    console.log(`   ${impact.summary}`);
    console.log(`   Direct impact: ${impact.directImpact.length} entities`);
    console.log(`   Transitive impact: ${impact.transitiveImpact.length} entities`);
    console.log(`   Risk level: ${impact.riskLevel}`);
    console.log('');

    if (impact.mermaidText) {
      const mermaidPath = path.join(opts.output, 'impact.mmd');
      fs.mkdirSync(opts.output, { recursive: true });
      fs.writeFileSync(mermaidPath, impact.mermaidText);
      console.log(chalk.gray(`   📁 Impact diagram saved: ${mermaidPath}`));
    }
  }

  // Perspective report
  const perspective = opts.perspective as ReportPerspective;
  console.log(chalk.cyan(`📋 ${perspective.charAt(0).toUpperCase() + perspective.slice(1)} Report`));
  console.log('');

  const risks = await analyzeRisks(graph);
  const report = await generateReport(graph, perspective, risks);

  console.log(chalk.bold.green(`   ${report.title}`));
  console.log(chalk.gray(`   ${report.summary}`));
  console.log('');

  for (const section of report.sections) {
    console.log(chalk.cyan(`   ━━ ${section.heading} ━━`));
    const lines = section.content.split('\n');
    for (const line of lines) {
      console.log(`   ${line}`);
    }
    console.log('');
  }

  // Save report
  fs.mkdirSync(opts.output, { recursive: true });
  const reportPath = path.join(opts.output, `report-${perspective}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(chalk.gray(`   📁 Report saved: ${reportPath}`));
  console.log('');
}
