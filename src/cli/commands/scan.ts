/**
 * CLI Command: scan
 *
 * Scan any project (local, GitHub URL, user/repo) and build knowledge graph.
 *
 * Usage:
 *   opencroc scan ./my-project
 *   opencroc scan https://github.com/expressjs/express
 *   opencroc scan facebook/react
 *   opencroc scan ./backend --risks --report developer --json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { cloneAndScan } from '../../scanner/github-cloner.js';
import { buildKnowledgeGraph, getGraphStats, toMermaid } from '../../graph/index.js';
import { analyzeRisks, generateReport } from '../../insight/index.js';
import type { ReportPerspective, RiskAnnotation } from '../../graph/types.js';

interface ScanOptions {
  branch?: string;
  output: string;
  json?: boolean;
  mermaid?: boolean;
  risks?: boolean;
  report?: string;
}

export async function scan(target: string, opts: ScanOptions): Promise<void> {
  console.log('');
  console.log(chalk.green('🐊 OpenCroc Studio — Universal Project Scanner'));
  console.log(chalk.gray(`   Target: ${target}`));
  console.log('');

  const startTime = Date.now();

  // Phase 1: Scan
  console.log(chalk.cyan('📡 Phase 1: Scanning project...'));

  const scanResult = await cloneAndScan({
    target,
    branch: opts.branch,
    keepClone: true,
    onProgress: (phase, percent, detail) => {
      if (percent % 25 === 0 || phase === 'clone') {
        console.log(chalk.gray(`   [${phase}] ${percent}% ${detail || ''}`));
      }
    },
  });

  console.log(chalk.green(`   ✅ Found ${scanResult.entities.length} entities, ${scanResult.relationships.length} relationships`));
  console.log(chalk.gray(`   Languages: ${Object.entries(scanResult.languages).filter(([k]) => !['json','yaml','markdown'].includes(k)).map(([k, v]) => `${k}(${v})`).join(', ')}`));
  console.log(chalk.gray(`   Frameworks: ${scanResult.frameworks.map(f => f.name).join(', ') || 'none detected'}`));
  console.log('');

  // Phase 2: Build knowledge graph
  console.log(chalk.cyan('🧠 Phase 2: Building knowledge graph...'));

  const projectName = target.includes('/') ? target.split('/').pop()!.replace('.git', '') : path.basename(path.resolve(target));
  const isRemote = target.startsWith('http') || /^[\w.-]+\/[\w.-]+$/.test(target);

  const graph = buildKnowledgeGraph(scanResult, {
    projectName,
    source: isRemote ? 'github' : 'local',
    sourceUrl: target,
    rootPath: target,
  });

  const stats = getGraphStats(graph);
  console.log(chalk.green(`   ✅ ${graph.nodes.length} nodes, ${graph.edges.length} edges`));
  printStats(stats);
  console.log('');

  // Phase 3: Risk analysis (optional)
  let risks: RiskAnnotation[] = [];
  if (opts.risks) {
    console.log(chalk.cyan('⚠️  Phase 3: Analyzing risks...'));
    risks = await analyzeRisks(graph);
    printRisks(risks);
    console.log('');
  }

  // Phase 4: Generate report (optional)
  if (opts.report) {
    console.log(chalk.cyan(`📋 Phase 4: Generating ${opts.report} report...`));
    const report = await generateReport(graph, opts.report as ReportPerspective, risks);
    printReport(report);
    console.log('');
  }

  // Phase 5: Output
  fs.mkdirSync(opts.output, { recursive: true });

  // Always save graph JSON
  const graphPath = path.join(opts.output, 'knowledge-graph.json');
  fs.writeFileSync(graphPath, JSON.stringify({
    projectInfo: graph.projectInfo,
    stats: getGraphStats(graph),
    nodes: graph.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, module: n.module, filePath: n.filePath })),
    edges: graph.edges.map(e => ({ source: e.source, target: e.target, relation: e.relation })),
    risks: risks.length > 0 ? risks : undefined,
    builtAt: graph.builtAt,
  }, null, 2));
  console.log(chalk.gray(`   📁 Graph saved: ${graphPath}`));

  if (opts.json) {
    const jsonPath = path.join(opts.output, 'scan-result.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      project: graph.projectInfo,
      stats,
      risks: risks.length > 0 ? risks : undefined,
    }, null, 2));
    console.log(chalk.gray(`   📁 JSON saved: ${jsonPath}`));
  }

  if (opts.mermaid) {
    const mermaidPath = path.join(opts.output, 'graph.mmd');
    const mermaidText = toMermaid(graph, { nodeTypes: ['module', 'model', 'api', 'service'], maxNodes: 40 });
    fs.writeFileSync(mermaidPath, mermaidText);
    console.log(chalk.gray(`   📁 Mermaid saved: ${mermaidPath}`));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(chalk.green(`🐊 Done in ${duration}s`));
  console.log(chalk.gray(`   Run ${chalk.white('opencroc serve')} to explore the knowledge graph in Studio UI`));
  console.log('');
}

function printStats(stats: Record<string, number>): void {
  const items: string[] = [];
  if (stats.moduleCount) items.push(`${stats.moduleCount} modules`);
  if (stats.apiCount) items.push(`${stats.apiCount} APIs`);
  if (stats.modelCount) items.push(`${stats.modelCount} models`);
  if (stats.classCount) items.push(`${stats.classCount} classes`);
  if (stats.functionCount) items.push(`${stats.functionCount} functions`);
  if (stats.dependencyCount) items.push(`${stats.dependencyCount} dependencies`);
  if (items.length > 0) {
    console.log(chalk.gray(`   ${items.join(' | ')}`));
  }
}

function printRisks(risks: RiskAnnotation[]): void {
  if (risks.length === 0) {
    console.log(chalk.green('   ✅ No significant risks detected.'));
    return;
  }

  const critical = risks.filter(r => r.severity === 'critical').length;
  const high = risks.filter(r => r.severity === 'high').length;
  const medium = risks.filter(r => r.severity === 'medium').length;
  const low = risks.filter(r => r.severity === 'low').length;

  console.log(chalk.yellow(`   Found ${risks.length} risks:`));
  if (critical) console.log(chalk.red(`     🔴 Critical: ${critical}`));
  if (high) console.log(chalk.hex('#e67e22')(`     🟠 High: ${high}`));
  if (medium) console.log(chalk.yellow(`     🟡 Medium: ${medium}`));
  if (low) console.log(chalk.blue(`     🔵 Low: ${low}`));

  console.log('');
  console.log(chalk.white('   Top risks:'));
  for (const r of risks.slice(0, 5)) {
    const color = r.severity === 'critical' ? chalk.red :
                  r.severity === 'high' ? chalk.hex('#e67e22') :
                  r.severity === 'medium' ? chalk.yellow : chalk.blue;
    console.log(`     ${color(`[${r.severity.toUpperCase()}]`)} ${r.title}`);
  }
}

function printReport(report: { title: string; summary: string; sections: Array<{ heading: string; content: string }> }): void {
  console.log(chalk.green(`   ✅ ${report.title}`));
  console.log(chalk.gray(`   ${report.summary}`));
  for (const section of report.sections) {
    console.log(chalk.cyan(`\n   ── ${section.heading} ──`));
    // Print first 3 lines of content
    const lines = section.content.split('\n').slice(0, 3);
    for (const line of lines) {
      console.log(chalk.gray(`   ${line}`));
    }
    if (section.content.split('\n').length > 3) {
      console.log(chalk.gray('   ...'));
    }
  }
}
