/**
 * Knowledge Graph Builder
 *
 * Transforms raw ScanResult entities and relationships into a
 * fully connected KnowledgeGraph with deduplication, wildcard
 * resolution, module grouping, and statistics.
 */

import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  ProjectMetadata,
  ProjectStats,
  ScanResult,
  ExtractedEntity,
} from './types.js';

export interface GraphBuildOptions {
  /** Project name (from package.json or dir name) */
  projectName: string;
  /** Source type */
  source: 'local' | 'github' | 'gitlab' | 'url';
  sourceUrl?: string;
  /** Project root path */
  rootPath: string;
}

/**
 * Build a KnowledgeGraph from scan results.
 */
export function buildKnowledgeGraph(scanResult: ScanResult, options: GraphBuildOptions): KnowledgeGraph {
  const startTime = Date.now();

  // Deduplicate entities by ID
  const entityMap = new Map<string, ExtractedEntity>();
  for (const entity of scanResult.entities) {
    if (!entityMap.has(entity.id)) {
      entityMap.set(entity.id, entity);
    }
  }

  // Convert entities to graph nodes
  const nodes: GraphNode[] = [];
  for (const entity of entityMap.values()) {
    nodes.push({
      id: entity.id,
      label: entity.name,
      type: entity.type,
      filePath: entity.filePath || undefined,
      line: entity.line,
      module: inferModule(entity),
      language: entity.language,
      metadata: entity.metadata,
      status: 'idle',
    });
  }

  // Resolve wildcard references and build edges
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const rel of scanResult.relationships) {
    let targetId = rel.targetId;

    // Resolve wildcard references (e.g., class:*:ClassName)
    if (targetId.includes(':*:')) {
      const suffix = targetId.split(':*:')[1]!;
      const resolved = findMatchingEntity(entityMap, targetId.split(':')[0]!, suffix);
      if (resolved) {
        targetId = resolved;
      } else {
        continue; // Can't resolve — skip
      }
    }

    // Skip self-references
    if (rel.sourceId === targetId) continue;

    // Skip if either node doesn't exist
    if (!entityMap.has(rel.sourceId) && !entityMap.has(targetId)) continue;

    // Deduplicate edges
    const edgeKey = `${rel.sourceId}->${targetId}:${rel.relation}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);

    edges.push({
      id: `edge-${edges.length}`,
      source: rel.sourceId,
      target: targetId,
      relation: rel.relation,
      metadata: rel.metadata,
    });
  }

  // Build project metadata
  const projectInfo = buildProjectMetadata(scanResult, options, nodes);

  return {
    nodes,
    edges,
    projectInfo,
    builtAt: new Date().toISOString(),
    buildDuration: Date.now() - startTime,
  };
}

/**
 * Query the knowledge graph for nodes matching criteria.
 */
export function queryNodes(graph: KnowledgeGraph, filter: Partial<Pick<GraphNode, 'type' | 'language' | 'module'>>): GraphNode[] {
  return graph.nodes.filter(n => {
    if (filter.type && n.type !== filter.type) return false;
    if (filter.language && n.language !== filter.language) return false;
    if (filter.module && n.module !== filter.module) return false;
    return true;
  });
}

/**
 * Get all neighbors of a node (incoming + outgoing).
 */
export function getNeighbors(graph: KnowledgeGraph, nodeId: string): { incoming: GraphEdge[]; outgoing: GraphEdge[] } {
  return {
    incoming: graph.edges.filter(e => e.target === nodeId),
    outgoing: graph.edges.filter(e => e.source === nodeId),
  };
}

/**
 * BFS traversal from a node, returning all reachable nodes within maxDepth.
 */
export function bfsTraversal(graph: KnowledgeGraph, startNodeId: string, maxDepth = 3): string[] {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
  visited.add(startNodeId);

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
    // Bidirectional for impact analysis
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.target)!.push(edge.source);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const neighbors = adjacency.get(current.id) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: current.depth + 1 });
      }
    }
  }

  visited.delete(startNodeId);
  return [...visited];
}

/**
 * Find all paths between two nodes (up to maxPaths).
 */
export function findPaths(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string,
  maxPaths = 5,
  maxDepth = 6,
): string[][] {
  const paths: string[][] = [];

  // Build directed adjacency
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  function dfs(current: string, target: string, path: string[], visited: Set<string>): void {
    if (paths.length >= maxPaths) return;
    if (path.length > maxDepth) return;

    if (current === target) {
      paths.push([...path]);
      return;
    }

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, target, path, visited);
        path.pop();
        visited.delete(neighbor);
      }
    }
  }

  const visited = new Set([fromId]);
  dfs(fromId, toId, [fromId], visited);
  return paths;
}

/**
 * Generate a Mermaid diagram from the knowledge graph.
 */
export function toMermaid(graph: KnowledgeGraph, options?: { maxNodes?: number; nodeTypes?: string[] }): string {
  const maxNodes = options?.maxNodes || 50;
  const nodeTypes = options?.nodeTypes;

  let filteredNodes = graph.nodes;
  if (nodeTypes) {
    filteredNodes = filteredNodes.filter(n => nodeTypes.includes(n.type));
  }
  filteredNodes = filteredNodes.slice(0, maxNodes);

  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  const lines: string[] = ['graph TD'];

  // Style definitions
  lines.push('  classDef model fill:#4ecca3,color:#000,stroke:#2d9970');
  lines.push('  classDef api fill:#e94560,color:#fff,stroke:#c23049');
  lines.push('  classDef service fill:#3498db,color:#fff,stroke:#2378b8');
  lines.push('  classDef module fill:#f39c12,color:#000,stroke:#c27d0e');
  lines.push('  classDef component fill:#9b59b6,color:#fff,stroke:#7d3c98');
  lines.push('  classDef file fill:#555,color:#fff,stroke:#333');

  // Nodes
  for (const node of filteredNodes) {
    const safeId = sanitizeMermaidId(node.id);
    const safeLabel = node.label.replace(/"/g, "'");
    lines.push(`  ${safeId}["${safeLabel}"]:::${node.type}`);
  }

  // Edges
  for (const edge of filteredEdges) {
    const safeSource = sanitizeMermaidId(edge.source);
    const safeTarget = sanitizeMermaidId(edge.target);
    const label = edge.relation;
    lines.push(`  ${safeSource} -->|${label}| ${safeTarget}`);
  }

  return lines.join('\n');
}

/**
 * Get graph statistics summary.
 */
export function getGraphStats(graph: KnowledgeGraph): Record<string, number> {
  const stats: Record<string, number> = {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
  };

  // Count by node type
  for (const node of graph.nodes) {
    const key = `${node.type}Count`;
    stats[key] = (stats[key] || 0) + 1;
  }

  // Count by edge relation
  for (const edge of graph.edges) {
    const key = `${edge.relation}Count`;
    stats[key] = (stats[key] || 0) + 1;
  }

  return stats;
}

// ===== Helpers =====

function inferModule(entity: ExtractedEntity): string | undefined {
  if (!entity.filePath) return undefined;
  const parts = entity.filePath.split('/');
  if (parts.length > 1) {
    // Use first meaningful directory as module
    const dir = parts[0]!;
    if (dir === 'src' && parts.length > 2) return parts[1];
    return dir;
  }
  return undefined;
}

function findMatchingEntity(entityMap: Map<string, ExtractedEntity>, typePrefix: string, nameSuffix: string): string | null {
  for (const [id, entity] of entityMap) {
    if (id.startsWith(`${typePrefix}:`) && entity.name === nameSuffix) {
      return id;
    }
  }
  return null;
}

function buildProjectMetadata(scanResult: ScanResult, options: GraphBuildOptions, nodes: GraphNode[]): ProjectMetadata {
  const stats: ProjectStats = {
    totalFiles: scanResult.files.length,
    totalLines: scanResult.files.reduce((sum, f) => sum + f.lines, 0),
    modules: nodes.filter(n => n.type === 'module').length,
    classes: nodes.filter(n => n.type === 'class').length,
    functions: nodes.filter(n => n.type === 'function').length,
    apiEndpoints: nodes.filter(n => n.type === 'api').length,
    dataModels: nodes.filter(n => n.type === 'model').length,
    dependencies: nodes.filter(n => n.type === 'dependency').length,
    linesByLanguage: scanResult.languages,
  };

  return {
    name: options.projectName,
    source: options.source,
    sourceUrl: options.sourceUrl,
    rootPath: options.rootPath,
    languages: scanResult.languages,
    frameworks: scanResult.frameworks.map(f => f.name),
    packageManager: undefined,
    projectType: 'unknown',
    stats,
  };
}

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}
