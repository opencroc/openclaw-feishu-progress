/**
 * AI Insight Engine
 *
 * Multi-perspective analysis powered by LLM. Generates:
 *  - Risk reports (security, performance, data integrity, logic)
 *  - Impact analysis (change blast radius)
 *  - Multi-role reports (developer, architect, tester, product, student, executive)
 *  - Digital twin simulation (AI-predicted test outcomes)
 */

import type {
  KnowledgeGraph,
  RiskAnnotation,
  RiskCategory,
  RiskSeverity,
  ImpactAnalysis,
  PerspectiveReport,
  ReportPerspective,
  ReportSection,
  SimulationScenario,
  SimulationResult,
} from '../graph/types.js';
import { bfsTraversal, getNeighbors, toMermaid } from '../graph/index.js';
import type { LlmProvider } from '../types.js';

export interface InsightOptions {
  /** LLM provider for AI-enhanced analysis */
  llm?: LlmProvider;
  /** Enable LLM-based analysis (requires llm provider) */
  useLlm?: boolean;
  /** Progress callback */
  onProgress?: (phase: string, percent: number, detail?: string) => void;
}

// ===================================================================
// Risk Analysis
// ===================================================================

/**
 * Analyze a knowledge graph for risks across all categories.
 * Combines rule-based static analysis with optional LLM enhancement.
 */
export async function analyzeRisks(
  graph: KnowledgeGraph,
  options?: InsightOptions,
): Promise<RiskAnnotation[]> {
  const risks: RiskAnnotation[] = [];
  let riskCounter = 0;

  options?.onProgress?.('risk-analysis', 0, 'Starting risk analysis...');

  // --- Rule-based risk detection ---

  // 1. Security: Unprotected API endpoints
  const apis = graph.nodes.filter(n => n.type === 'api');
  const middlewares = graph.nodes.filter(n => n.type === 'middleware');
  const hasAuthMiddleware = middlewares.some(m =>
    m.label.toLowerCase().includes('auth') || m.label.toLowerCase().includes('jwt') || m.label.toLowerCase().includes('session')
  );

  for (const api of apis) {
    const incoming = graph.edges.filter(e => e.target === api.id);
    const hasAuth = incoming.some(e => {
      const sourceNode = graph.nodes.find(n => n.id === e.source);
      return sourceNode?.type === 'middleware' &&
        (sourceNode.label.toLowerCase().includes('auth') || e.relation === 'middleware-of');
    });

    if (!hasAuth && !hasAuthMiddleware) {
      const apiPath = (api.metadata.path as string) || api.label;
      const isSensitive = /user|admin|password|token|secret|key|delete|payment/i.test(apiPath);
      if (isSensitive) {
        risks.push({
          id: `risk-${++riskCounter}`,
          category: 'security',
          severity: 'high',
          title: `Potentially unprotected sensitive endpoint: ${api.label}`,
          description: `The endpoint ${api.label} appears to handle sensitive data but no authentication middleware was detected in the graph.`,
          affectedNodes: [api.id],
          suggestion: 'Add authentication middleware to protect this endpoint.',
          confidence: 0.6,
        });
      }
    }
  }

  options?.onProgress?.('risk-analysis', 20, 'Checking data integrity...');

  // 2. Data Integrity: Models without validation
  const models = graph.nodes.filter(n => n.type === 'model');
  for (const model of models) {
    const writeEdges = graph.edges.filter(e => e.target === model.id && e.relation === 'writes');
    if (writeEdges.length > 3) {
      risks.push({
        id: `risk-${++riskCounter}`,
        category: 'data-integrity',
        severity: 'medium',
        title: `High write fan-in on model: ${model.label}`,
        description: `Model "${model.label}" is written to by ${writeEdges.length} different endpoints. This increases risk of data conflicts and race conditions.`,
        affectedNodes: [model.id, ...writeEdges.map(e => e.source)],
        suggestion: 'Consider adding transaction boundaries or an optimistic locking strategy.',
        confidence: 0.7,
      });
    }
  }

  // 3. Data Integrity: Cascade delete risk
  const foreignKeyEdges = graph.edges.filter(e => e.relation === 'foreign-key' || e.relation === 'cascade-delete');
  for (const fk of foreignKeyEdges) {
    const sourceNode = graph.nodes.find(n => n.id === fk.source);
    const targetNode = graph.nodes.find(n => n.id === fk.target);
    if (sourceNode && targetNode) {
      // Check how many other tables reference the target
      const dependents = graph.edges.filter(e =>
        (e.relation === 'foreign-key' || e.relation === 'cascade-delete') && e.target === fk.target
      );
      if (dependents.length >= 3) {
        risks.push({
          id: `risk-${++riskCounter}`,
          category: 'data-integrity',
          severity: 'high',
          title: `Cascade risk: ${targetNode.label} has ${dependents.length} dependent tables`,
          description: `Deleting records from "${targetNode.label}" could cascade to ${dependents.length} other tables.`,
          affectedNodes: [fk.target, ...dependents.map(d => d.source)],
          suggestion: 'Implement soft deletes or add cascade protection.',
          confidence: 0.85,
        });
      }
    }
  }

  options?.onProgress?.('risk-analysis', 40, 'Checking performance...');

  // 4. Performance: Large modules (God-module smell)
  const moduleNodes = graph.nodes.filter(n => n.type === 'module');
  for (const mod of moduleNodes) {
    const children = graph.edges.filter(e => e.target === mod.id && e.relation === 'belongs-to');
    if (children.length > 50) {
      risks.push({
        id: `risk-${++riskCounter}`,
        category: 'maintainability',
        severity: 'medium',
        title: `Large module: ${mod.label} (${children.length} entities)`,
        description: `Module "${mod.label}" contains ${children.length} entities. Consider splitting for better maintainability.`,
        affectedNodes: [mod.id],
        suggestion: 'Split into smaller, focused sub-modules.',
        confidence: 0.75,
      });
    }
  }

  // 5. Reliability: Circular dependencies
  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    risks.push({
      id: `risk-${++riskCounter}`,
      category: 'logic',
      severity: 'high',
      title: `Circular dependency detected: ${cycle.map(id => graph.nodes.find(n => n.id === id)?.label || id).join(' → ')}`,
      description: `A circular dependency was found involving ${cycle.length} entities. This can cause initialization issues and makes testing harder.`,
      affectedNodes: cycle,
      suggestion: 'Break the cycle by introducing an interface or Event-based decoupling.',
      confidence: 0.9,
    });
  }

  options?.onProgress?.('risk-analysis', 60, 'Checking maintainability...');

  // 6. Maintainability: High coupling
  for (const node of graph.nodes) {
    if (node.type === 'file' || node.type === 'dependency') continue;
    const outgoing = graph.edges.filter(e => e.source === node.id);
    const incoming = graph.edges.filter(e => e.target === node.id);
    const coupling = outgoing.length + incoming.length;
    if (coupling > 15) {
      risks.push({
        id: `risk-${++riskCounter}`,
        category: 'maintainability',
        severity: 'medium',
        title: `High coupling: ${node.label} (${coupling} connections)`,
        description: `"${node.label}" has ${coupling} connections (${outgoing.length} outgoing, ${incoming.length} incoming). Changes here will have wide impact.`,
        affectedNodes: [node.id],
        suggestion: 'Consider extracting shared logic or adding an abstraction layer.',
        confidence: 0.7,
      });
    }
  }

  // 7. Security: Potential injection points (APIs with dynamic path params)
  for (const api of apis) {
    const apiPath = (api.metadata.path as string) || api.label;
    if (apiPath.includes(':') || apiPath.includes('{')) {
      const method = (api.metadata.method as string) || '';
      if (['DELETE', 'PUT', 'PATCH'].includes(method)) {
        risks.push({
          id: `risk-${++riskCounter}`,
          category: 'security',
          severity: 'low',
          title: `Verify input validation: ${api.label}`,
          description: `Endpoint ${api.label} accepts path parameters. Ensure proper input validation and authorization checks.`,
          affectedNodes: [api.id],
          suggestion: 'Add input validation middleware and verify the user has permission to modify the specified resource.',
          confidence: 0.5,
        });
      }
    }
  }

  options?.onProgress?.('risk-analysis', 80, `Found ${risks.length} risks`);

  // --- LLM-enhanced risk detection (optional) ---
  if (options?.useLlm && options.llm) {
    try {
      const llmRisks = await getLlmRisks(graph, risks, options.llm);
      risks.push(...llmRisks);
    } catch {
      // LLM enhancement failed — rule-based results are still valid
    }
  }

  // Sort by severity
  const severityOrder: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  options?.onProgress?.('risk-analysis', 100, `Analysis complete: ${risks.length} risks found`);

  return risks;
}

// ===================================================================
// Impact Analysis
// ===================================================================

/**
 * Analyze the impact of changing a specific node.
 */
export function analyzeImpact(graph: KnowledgeGraph, nodeId: string): ImpactAnalysis {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) {
    return {
      sourceNode: nodeId,
      directImpact: [],
      transitiveImpact: [],
      riskLevel: 'low',
      summary: `Node "${nodeId}" not found in the graph.`,
      mermaidText: '',
    };
  }

  // Direct neighbors
  const { incoming, outgoing } = getNeighbors(graph, nodeId);
  const directNodes = new Set([
    ...incoming.map(e => e.source),
    ...outgoing.map(e => e.target),
  ]);
  directNodes.delete(nodeId);

  // Transitive impact (BFS depth 3)
  const transitiveNodes = bfsTraversal(graph, nodeId, 3);

  // Calculate risk level
  const totalImpact = transitiveNodes.length;
  let riskLevel: RiskSeverity;
  if (totalImpact > 20) riskLevel = 'critical';
  else if (totalImpact > 10) riskLevel = 'high';
  else if (totalImpact > 5) riskLevel = 'medium';
  else riskLevel = 'low';

  // Generate summary
  const summary = `Changing "${node.label}" directly affects ${directNodes.size} entities and transitively impacts ${transitiveNodes.length} entities (risk: ${riskLevel}).`;

  // Generate Mermaid diagram
  const impactNodeIds = new Set([nodeId, ...directNodes, ...transitiveNodes.slice(0, 20)]);
  const impactNodes = graph.nodes.filter(n => impactNodeIds.has(n.id));
  const impactEdges = graph.edges.filter(e => impactNodeIds.has(e.source) && impactNodeIds.has(e.target));

  let mermaidText = 'graph TD\n';
  mermaidText += `  style ${sanitizeId(nodeId)} fill:#e94560,color:#fff\n`;
  for (const dn of directNodes) {
    mermaidText += `  style ${sanitizeId(dn)} fill:#f39c12,color:#000\n`;
  }
  for (const n of impactNodes) {
    mermaidText += `  ${sanitizeId(n.id)}["${n.label.replace(/"/g, "'")}"]\n`;
  }
  for (const e of impactEdges) {
    mermaidText += `  ${sanitizeId(e.source)} -->|${e.relation}| ${sanitizeId(e.target)}\n`;
  }

  return {
    sourceNode: nodeId,
    directImpact: [...directNodes],
    transitiveImpact: transitiveNodes,
    riskLevel,
    summary,
    mermaidText,
  };
}

// ===================================================================
// Multi-Perspective Reports
// ===================================================================

/**
 * Generate a report from a specific perspective.
 */
export async function generateReport(
  graph: KnowledgeGraph,
  perspective: ReportPerspective,
  risks: RiskAnnotation[],
  options?: InsightOptions,
): Promise<PerspectiveReport> {
  // If LLM available, use it for rich narrative
  if (options?.useLlm && options.llm) {
    return generateLlmReport(graph, perspective, risks, options.llm);
  }

  // Fallback: rule-based report generation
  switch (perspective) {
    case 'developer':
      return buildDeveloperReport(graph, risks);
    case 'architect':
      return buildArchitectReport(graph, risks);
    case 'tester':
      return buildTesterReport(graph, risks);
    case 'product':
      return buildProductReport(graph, risks);
    case 'student':
      return buildStudentReport(graph, risks);
    case 'executive':
      return buildExecutiveReport(graph, risks);
    default:
      return buildDeveloperReport(graph, risks);
  }
}

function buildDeveloperReport(graph: KnowledgeGraph, risks: RiskAnnotation[]): PerspectiveReport {
  const { projectInfo } = graph;
  const stats = projectInfo.stats;

  const sections: ReportSection[] = [
    {
      heading: 'Project Overview',
      content: `**${projectInfo.name}** is a ${projectInfo.projectType} project using ${projectInfo.frameworks.join(', ') || 'unknown frameworks'}.\n\n` +
        `- **Files**: ${stats.totalFiles} | **Lines**: ${stats.totalLines.toLocaleString()}\n` +
        `- **Languages**: ${Object.entries(projectInfo.languages).map(([k, v]) => `${k}(${v})`).join(', ')}\n` +
        `- **APIs**: ${stats.apiEndpoints} | **Models**: ${stats.dataModels} | **Functions**: ${stats.functions}`,
    },
    {
      heading: 'Architecture Map',
      content: 'Module-level dependency graph:',
      visualization: {
        type: 'mermaid',
        data: toMermaid(graph, { nodeTypes: ['module', 'model', 'api'], maxNodes: 30 }),
      },
    },
    {
      heading: 'API Endpoints',
      content: graph.nodes
        .filter(n => n.type === 'api')
        .map(a => `- \`${a.label}\` (${a.filePath || 'unknown'})`)
        .join('\n') || 'No API endpoints detected.',
    },
    {
      heading: 'Data Models',
      content: graph.nodes
        .filter(n => n.type === 'model')
        .map(m => `- **${m.label}** (${m.filePath || 'unknown'})`)
        .join('\n') || 'No data models detected.',
    },
    {
      heading: 'Risk Report',
      content: risks.length === 0
        ? 'No significant risks detected.'
        : risks.slice(0, 10).map(r =>
            `- **[${r.severity.toUpperCase()}]** ${r.title}\n  ${r.description}`
          ).join('\n\n'),
    },
  ];

  return {
    perspective: 'developer',
    title: `Developer Report: ${projectInfo.name}`,
    summary: `${projectInfo.name} — ${stats.apiEndpoints} APIs, ${stats.dataModels} models, ${risks.length} risks detected.`,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

function buildArchitectReport(graph: KnowledgeGraph, risks: RiskAnnotation[]): PerspectiveReport {
  const { projectInfo } = graph;
  const modules = graph.nodes.filter(n => n.type === 'module');
  const criticalRisks = risks.filter(r => r.severity === 'critical' || r.severity === 'high');

  const sections: ReportSection[] = [
    {
      heading: 'System Architecture',
      content: `**Type**: ${projectInfo.projectType}\n**Frameworks**: ${projectInfo.frameworks.join(', ')}\n**Modules**: ${modules.length}\n\n` +
        `The system is organized into ${modules.length} modules with ${graph.edges.length} relationships.`,
      visualization: {
        type: 'mermaid',
        data: toMermaid(graph, { nodeTypes: ['module'], maxNodes: 20 }),
      },
    },
    {
      heading: 'Module Coupling Analysis',
      content: modules.map(m => {
        const edges = graph.edges.filter(e => e.source === m.id || e.target === m.id);
        return `- **${m.label}**: ${edges.length} connections`;
      }).join('\n'),
    },
    {
      heading: 'Technical Debt & Risk',
      content: criticalRisks.length === 0
        ? 'No critical or high-severity risks.'
        : criticalRisks.map(r => `- **[${r.severity}]** ${r.title}\n  _Suggestion_: ${r.suggestion || 'N/A'}`).join('\n\n'),
    },
    {
      heading: 'Recommendations',
      content: generateArchitectRecommendations(graph, risks),
    },
  ];

  return {
    perspective: 'architect',
    title: `Architecture Report: ${projectInfo.name}`,
    summary: `${modules.length} modules, ${graph.edges.length} relationships, ${criticalRisks.length} critical/high risks.`,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

function buildTesterReport(graph: KnowledgeGraph, risks: RiskAnnotation[]): PerspectiveReport {
  const apis = graph.nodes.filter(n => n.type === 'api');
  const tests = graph.nodes.filter(n => n.type === 'test');
  const riskyApis = risks.filter(r => r.category === 'security' || r.category === 'data-integrity');

  const sections: ReportSection[] = [
    {
      heading: 'Test Coverage Overview',
      content: `- **API Endpoints**: ${apis.length}\n- **Test Files Found**: ${tests.length}\n- **Estimated Coverage**: ${tests.length > 0 ? Math.min(Math.round(tests.length / Math.max(apis.length, 1) * 100), 100) : 0}%`,
    },
    {
      heading: 'Priority Test Targets',
      content: 'Endpoints with highest risk that need testing first:\n\n' +
        riskyApis.slice(0, 10).map((r, i) => `${i + 1}. **${r.title}** (${r.severity})\n   ${r.description}`).join('\n\n'),
    },
    {
      heading: 'Edge Cases to Consider',
      content: apis.slice(0, 10).map(api => {
        const method = (api.metadata.method as string) || 'ANY';
        const suggestions: string[] = [];
        if (method === 'POST' || method === 'PUT') suggestions.push('Empty body', 'Invalid types', 'Missing required fields', 'Extremely long strings');
        if (method === 'DELETE') suggestions.push('Non-existent ID', 'Already deleted', 'ID with dependencies');
        if (method === 'GET') suggestions.push('Invalid query params', 'Large pagination', 'Non-existent ID');
        return `- **${api.label}**: ${suggestions.join(', ')}`;
      }).join('\n'),
    },
  ];

  return {
    perspective: 'tester',
    title: `Testing Report: ${graph.projectInfo.name}`,
    summary: `${apis.length} endpoints to test, ${riskyApis.length} high-risk areas identified.`,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

function buildProductReport(graph: KnowledgeGraph, risks: RiskAnnotation[]): PerspectiveReport {
  const { projectInfo } = graph;
  const modules = graph.nodes.filter(n => n.type === 'module');

  const sections: ReportSection[] = [
    {
      heading: 'What Does This System Do?',
      content: `This is a **${projectInfo.projectType}** system built with ${projectInfo.frameworks.join(', ')}. ` +
        `It contains ${modules.length} functional modules and ${projectInfo.stats.apiEndpoints} service interfaces.`,
    },
    {
      heading: 'Feature Map',
      content: modules.map(m => {
        const children = graph.edges.filter(e => e.target === m.id).length;
        return `- **${m.label}** — ${children} components`;
      }).join('\n'),
    },
    {
      heading: 'Health Status',
      content: (() => {
        const critical = risks.filter(r => r.severity === 'critical').length;
        const high = risks.filter(r => r.severity === 'high').length;
        if (critical > 0) return `⚠️ **Needs Attention**: ${critical} critical issues found that could affect users.`;
        if (high > 3) return `⚡ **Minor Concerns**: ${high} areas that should be improved.`;
        return '✅ **Healthy**: No critical issues detected. System is in good shape.';
      })(),
    },
  ];

  return {
    perspective: 'product',
    title: `Product Overview: ${projectInfo.name}`,
    summary: `${modules.length} feature modules, ${risks.filter(r => r.severity === 'critical').length} critical issues.`,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

function buildStudentReport(graph: KnowledgeGraph, risks: RiskAnnotation[]): PerspectiveReport {
  const { projectInfo } = graph;

  const sections: ReportSection[] = [
    {
      heading: 'What is this project?',
      content: `This is a **${projectInfo.projectType}** project. Let\'s break it down step by step!\n\n` +
        `**Languages used**: ${Object.keys(projectInfo.languages).join(', ')}\n` +
        `**Frameworks**: ${projectInfo.frameworks.join(', ') || 'None detected'}\n\n` +
        `Think of this project like a building:\n` +
        `- The **frameworks** are the building\'s foundation\n` +
        `- The **modules** are different rooms\n` +
        `- The **APIs** are the doors and windows (interfaces to the outside world)\n` +
        `- The **models** are the furniture and storage (data structures)`,
    },
    {
      heading: 'How is it organized?',
      content: `The project has **${projectInfo.stats.modules}** modules (think: folders of related code).\n\n` +
        `Each module typically contains:\n` +
        `1. **Controllers/Routes** — Handle incoming requests (like a receptionist)\n` +
        `2. **Services** — Business logic (like the workers)\n` +
        `3. **Models** — Data structures (like forms and documents)\n\n` +
        'Here\'s a simplified view:',
      visualization: {
        type: 'mermaid',
        data: toMermaid(graph, { nodeTypes: ['module', 'model'], maxNodes: 15 }),
      },
    },
    {
      heading: 'Key Concepts to Learn',
      content: `Based on this project, you should study:\n\n` +
        (projectInfo.frameworks.includes('Express') ? '- **Express.js** — Node.js web framework for building APIs\n' : '') +
        (projectInfo.frameworks.includes('React') ? '- **React** — Frontend UI library for building user interfaces\n' : '') +
        (projectInfo.frameworks.includes('Sequelize') ? '- **Sequelize** — ORM for database operations\n' : '') +
        `- **REST APIs** — How the frontend talks to the backend\n` +
        `- **MVC Pattern** — Model-View-Controller architecture\n` +
        `- **Authentication** — How users log in and stay logged in`,
    },
    {
      heading: 'Things to Watch Out For',
      content: risks.length > 0
        ? `Here are ${Math.min(risks.length, 5)} interesting issues found:\n\n` +
          risks.slice(0, 5).map((r, i) => `${i + 1}. **${r.title}**\n   _Why it matters_: ${r.description}\n   _How to fix_: ${r.suggestion || 'Research this topic!'}`).join('\n\n')
        : 'This project looks clean! No major issues found.',
    },
  ];

  return {
    perspective: 'student',
    title: `Learning Guide: ${projectInfo.name}`,
    summary: `A ${projectInfo.projectType} project — great for learning ${Object.keys(projectInfo.languages).join(', ')}!`,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

function buildExecutiveReport(graph: KnowledgeGraph, risks: RiskAnnotation[]): PerspectiveReport {
  const { projectInfo } = graph;
  const critical = risks.filter(r => r.severity === 'critical').length;
  const high = risks.filter(r => r.severity === 'high').length;

  // Health score: 100 - (critical * 20 + high * 10 + medium * 3)
  const medium = risks.filter(r => r.severity === 'medium').length;
  const healthScore = Math.max(0, 100 - (critical * 20 + high * 10 + medium * 3));

  const sections: ReportSection[] = [
    {
      heading: 'Health Score',
      content: `# ${healthScore}/100\n\n` +
        (healthScore >= 80 ? '✅ System is healthy and well-maintained.' :
         healthScore >= 60 ? '⚡ System needs some attention. Address high-priority items.' :
         '⚠️ System has significant issues that need immediate attention.'),
    },
    {
      heading: 'Key Metrics',
      content: `| Metric | Value |\n|--------|-------|\n` +
        `| Codebase Size | ${projectInfo.stats.totalLines.toLocaleString()} lines |\n` +
        `| Technologies | ${projectInfo.frameworks.length} frameworks |\n` +
        `| API Surface | ${projectInfo.stats.apiEndpoints} endpoints |\n` +
        `| Data Models | ${projectInfo.stats.dataModels} tables |\n` +
        `| Critical Issues | ${critical} |\n` +
        `| High Issues | ${high} |`,
    },
    {
      heading: 'Top 3 Risks Needing Action',
      content: risks.slice(0, 3).map((r, i) =>
        `${i + 1}. **${r.title}** (${r.severity})`
      ).join('\n') || 'No significant risks.',
    },
  ];

  return {
    perspective: 'executive',
    title: `Executive Summary: ${projectInfo.name}`,
    summary: `Health: ${healthScore}/100 | ${critical} critical, ${high} high risks | ${projectInfo.stats.apiEndpoints} APIs`,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

// ===================================================================
// Digital Twin Simulation
// ===================================================================

/**
 * Run AI-powered simulation on a scenario (requires LLM).
 */
export async function simulateScenario(
  graph: KnowledgeGraph,
  scenario: SimulationScenario,
  llm: LlmProvider,
): Promise<SimulationResult> {
  // Build context from graph
  const relatedNodes = scenario.steps
    .map(s => s.endpoint)
    .filter(Boolean)
    .flatMap(endpoint => graph.nodes.filter(n => n.type === 'api' && n.label.includes(endpoint!)))
    .map(n => n.id);

  const context = relatedNodes.flatMap(nodeId => {
    const neighbors = getNeighbors(graph, nodeId);
    return [
      ...neighbors.outgoing.map(e => {
        const target = graph.nodes.find(n => n.id === e.target);
        return `${e.relation}: ${target?.label || e.target}`;
      }),
    ];
  });

  const prompt = `You are an expert software engineer analyzing a system.

Project: ${graph.projectInfo.name}
Frameworks: ${graph.projectInfo.frameworks.join(', ')}

Scenario: ${scenario.name}
Description: ${scenario.description}

Steps:
${scenario.steps.map((s, i) => `${i + 1}. ${s.action} — ${s.endpoint || 'N/A'}`).join('\n')}

Related context from knowledge graph:
${context.join('\n')}

Predict:
1. What would happen when executing this scenario?
2. What anomalies or edge cases could occur?
3. Rate the risk (0-100) of this scenario failing in production.

Respond in JSON: { "prediction": "...", "anomalies": ["..."], "riskScore": N, "confidence": 0.X }`;

  const response = await llm.chat([{ role: 'user', content: prompt }]);

  try {
    const parsed = JSON.parse(cleanJsonResponse(response));
    return {
      scenario,
      prediction: parsed.prediction || 'Unable to predict.',
      anomalies: parsed.anomalies || [],
      riskScore: parsed.riskScore || 50,
      confidence: parsed.confidence || 0.5,
    };
  } catch {
    return {
      scenario,
      prediction: response,
      anomalies: [],
      riskScore: 50,
      confidence: 0.3,
    };
  }
}

// ===================================================================
// Helpers
// ===================================================================

function detectCycles(graph: KnowledgeGraph): string[][] {
  const cycles: string[][] = [];
  const adjacency = new Map<string, string[]>();

  // Build adjacency (only import/depends-on edges for cycle detection)
  for (const edge of graph.edges) {
    if (edge.relation !== 'imports' && edge.relation !== 'depends-on' && edge.relation !== 'calls') continue;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    if (cycles.length >= 5) return; // Limit cycle count
    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of adjacency.get(node) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        // Found cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart >= 0) {
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

function generateArchitectRecommendations(_graph: KnowledgeGraph, risks: RiskAnnotation[]): string {
  const items: string[] = [];

  const securityRisks = risks.filter(r => r.category === 'security');
  if (securityRisks.length > 0) {
    items.push(`1. **Security Hardening**: Address ${securityRisks.length} security findings before next release.`);
  }

  const couplingRisks = risks.filter(r => r.category === 'maintainability');
  if (couplingRisks.length > 2) {
    items.push(`2. **Reduce Coupling**: ${couplingRisks.length} modules show high coupling. Consider introducing service boundaries.`);
  }

  const dataRisks = risks.filter(r => r.category === 'data-integrity');
  if (dataRisks.length > 0) {
    items.push(`3. **Data Protection**: ${dataRisks.length} data integrity concerns. Add transaction boundaries and cascade protections.`);
  }

  if (items.length === 0) {
    items.push('Architecture looks solid. Continue monitoring coupling metrics as the system grows.');
  }

  return items.join('\n\n');
}

async function getLlmRisks(graph: KnowledgeGraph, existingRisks: RiskAnnotation[], llm: LlmProvider): Promise<RiskAnnotation[]> {
  const prompt = `Analyze this project knowledge graph for additional risks not already identified.

Project: ${graph.projectInfo.name}
Type: ${graph.projectInfo.projectType}
Frameworks: ${graph.projectInfo.frameworks.join(', ')}
Stats: ${graph.projectInfo.stats.apiEndpoints} APIs, ${graph.projectInfo.stats.dataModels} models

Already identified risks (${existingRisks.length}):
${existingRisks.slice(0, 5).map(r => `- [${r.severity}] ${r.title}`).join('\n')}

API Endpoints: ${graph.nodes.filter(n => n.type === 'api').slice(0, 20).map(n => n.label).join(', ')}
Models: ${graph.nodes.filter(n => n.type === 'model').slice(0, 20).map(n => n.label).join(', ')}

Return up to 3 additional risks in JSON array format:
[{ "category": "security|performance|data-integrity|logic|maintainability|reliability", "severity": "critical|high|medium|low", "title": "...", "description": "...", "suggestion": "..." }]`;

  const response = await llm.chat([{ role: 'user', content: prompt }]);

  try {
    const parsed = JSON.parse(cleanJsonResponse(response));
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 3).map((r: Record<string, string>, i: number) => ({
      id: `risk-llm-${i}`,
      category: (r.category || 'logic') as RiskCategory,
      severity: (r.severity || 'medium') as RiskSeverity,
      title: r.title || 'LLM-detected risk',
      description: r.description || '',
      affectedNodes: [],
      suggestion: r.suggestion,
      confidence: 0.6,
    }));
  } catch {
    return [];
  }
}

async function generateLlmReport(
  graph: KnowledgeGraph,
  perspective: ReportPerspective,
  risks: RiskAnnotation[],
  llm: LlmProvider,
): Promise<PerspectiveReport> {
  const perspectiveDescriptions: Record<ReportPerspective, string> = {
    developer: 'a software developer who wants technical details, code patterns, and API documentation',
    architect: 'a software architect who cares about modularity, coupling, tech debt, and system design',
    tester: 'a QA engineer who wants to know what to test, edge cases, and risk areas',
    product: 'a product manager who wants to understand features in business terms, not code',
    student: 'a computer science student learning from this codebase, explain concepts step by step',
    executive: 'a CTO/VP who wants a one-page health summary with actionable insights',
  };

  const prompt = `Generate a project analysis report for ${graph.projectInfo.name} from the perspective of ${perspectiveDescriptions[perspective]}.

Project Info:
- Type: ${graph.projectInfo.projectType}
- Frameworks: ${graph.projectInfo.frameworks.join(', ')}
- Stats: ${graph.projectInfo.stats.totalFiles} files, ${graph.projectInfo.stats.apiEndpoints} APIs, ${graph.projectInfo.stats.dataModels} models
- Languages: ${Object.entries(graph.projectInfo.languages).map(([k, v]) => `${k}(${v} files)`).join(', ')}

Top risks:
${risks.slice(0, 5).map(r => `- [${r.severity}] ${r.title}`).join('\n')}

Generate 3-5 report sections with clear headings and content. Use markdown formatting.
Respond in JSON: { "title": "...", "summary": "...", "sections": [{ "heading": "...", "content": "..." }] }`;

  const response = await llm.chat([{ role: 'user', content: prompt }]);

  try {
    const parsed = JSON.parse(cleanJsonResponse(response));
    return {
      perspective,
      title: parsed.title || `${perspective} Report`,
      summary: parsed.summary || '',
      sections: (parsed.sections || []).map((s: Record<string, string>) => ({
        heading: s.heading || 'Section',
        content: s.content || '',
      })),
      generatedAt: new Date().toISOString(),
    };
  } catch {
    // Fallback to rule-based
    return buildDeveloperReport(graph, risks);
  }
}

function cleanJsonResponse(response: string): string {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}
