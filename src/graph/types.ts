/**
 * OpenCroc Studio — Universal Knowledge Graph Types
 *
 * Multi-layer knowledge graph for any project type and language.
 */

// ===== Node Types =====

/** All possible node types in the knowledge graph */
export type GraphNodeType =
  | 'module'         // High-level module/package
  | 'file'           // Source file
  | 'class'          // Class definition
  | 'function'       // Function/method
  | 'api'            // API endpoint (REST/GraphQL/RPC)
  | 'model'          // Data model (ORM table, schema)
  | 'field'          // Model field/column
  | 'route'          // Route definition
  | 'middleware'      // Middleware/interceptor
  | 'service'        // Service/business logic layer
  | 'config'         // Configuration file
  | 'dependency'     // External dependency (npm package, pip package)
  | 'database'       // Database connection
  | 'queue'          // Message queue
  | 'cache'          // Cache layer (Redis, etc.)
  | 'external-api'   // External API call
  | 'event'          // Event emitter/listener
  | 'permission'     // Permission/role
  | 'component'      // UI component (frontend)
  | 'page'           // Page/view (frontend)
  | 'store'          // State store (Redux, Vuex, etc.)
  | 'test'           // Test file
  | 'unknown';

/** All possible edge relation types */
export type GraphEdgeRelation =
  | 'imports'         // A imports B
  | 'exports'         // A exports B
  | 'calls'           // A calls B (function invocation)
  | 'extends'         // A extends B (inheritance)
  | 'implements'      // A implements B
  | 'reads'           // A reads from B (data model)
  | 'writes'          // A writes to B (data model)
  | 'depends-on'      // A depends on B
  | 'has-field'       // Model A has field B
  | 'foreign-key'     // Field A references table B
  | 'middleware-of'   // Middleware A guards route B
  | 'belongs-to'      // A belongs to module B
  | 'triggers'        // A triggers event B
  | 'listens-to'      // A listens to event B
  | 'renders'         // Component A renders Component B
  | 'routes-to'       // Route A routes to handler B
  | 'publishes'       // A publishes to queue B
  | 'consumes'        // A consumes from queue B
  | 'caches'          // A caches via B
  | 'requires-permission' // A requires permission B
  | 'cascade-delete'  // Deleting A cascades to B
  | 'associated-with'; // Generic association

// ===== Core Graph Structures =====

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  /** File path relative to project root */
  filePath?: string;
  /** Line number in source file */
  line?: number;
  /** Which module/package this belongs to */
  module?: string;
  /** Language of the source */
  language?: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Risk annotations attached by analysis */
  risks?: RiskAnnotation[];
  /** Status for visualization */
  status?: 'idle' | 'scanning' | 'analyzed' | 'at-risk';
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: GraphEdgeRelation;
  /** Weight/strength of the relationship (0-1) */
  weight?: number;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Project-level metadata */
  projectInfo: ProjectMetadata;
  /** Timestamp of last build */
  builtAt: string;
  /** Build duration in ms */
  buildDuration: number;
}

// ===== Project Metadata =====

export interface ProjectMetadata {
  name: string;
  description?: string;
  /** Source: 'local' | 'github' | 'gitlab' | 'url' */
  source: 'local' | 'github' | 'gitlab' | 'url';
  sourceUrl?: string;
  rootPath: string;
  /** Detected languages and their file counts */
  languages: Record<string, number>;
  /** Detected frameworks */
  frameworks: string[];
  /** Detected package manager */
  packageManager?: string;
  /** Project type classification */
  projectType: ProjectType;
  /** Statistics */
  stats: ProjectStats;
}

export type ProjectType =
  | 'backend-api'
  | 'frontend-spa'
  | 'frontend-ssr'
  | 'fullstack'
  | 'monorepo'
  | 'library'
  | 'cli-tool'
  | 'mobile'
  | 'microservice'
  | 'unknown';

export interface ProjectStats {
  totalFiles: number;
  totalLines: number;
  modules: number;
  classes: number;
  functions: number;
  apiEndpoints: number;
  dataModels: number;
  dependencies: number;
  /** Per-language line counts */
  linesByLanguage: Record<string, number>;
}

// ===== Risk & Insight Types =====

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type RiskCategory =
  | 'security'       // Auth bypass, injection, SSRF, etc.
  | 'performance'    // N+1, missing index, large payload
  | 'data-integrity' // Missing transaction, cascade risk
  | 'logic'          // Circular dependency, deadlock, state gap
  | 'maintainability' // God class, high coupling, code smell
  | 'reliability'    // No error handling, no retry, single point of failure
  | 'compliance';    // Missing audit log, GDPR risk

export interface RiskAnnotation {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  description: string;
  /** Affected node IDs */
  affectedNodes: string[];
  /** Suggested fix */
  suggestion?: string;
  /** Confidence score 0-1 */
  confidence: number;
}

// ===== Impact Analysis =====

export interface ImpactAnalysis {
  /** The changed node */
  sourceNode: string;
  /** Directly affected nodes */
  directImpact: string[];
  /** Transitively affected nodes (BFS from direct) */
  transitiveImpact: string[];
  /** Risk level of the change */
  riskLevel: RiskSeverity;
  /** Human-readable summary */
  summary: string;
  /** Mermaid diagram of impact */
  mermaidText: string;
}

// ===== Multi-Perspective Report =====

export type ReportPerspective =
  | 'developer'    // Technical details, call graphs, code patterns
  | 'architect'    // High-level modules, coupling, tech debt
  | 'tester'       // Test coverage gaps, risk endpoints, edge cases
  | 'product'      // Business flows, feature map, non-technical language
  | 'student'      // Learning-oriented, "why" explanations, step-by-step
  | 'executive';   // Health score, risks, one-page summary

export interface PerspectiveReport {
  perspective: ReportPerspective;
  title: string;
  summary: string;
  sections: ReportSection[];
  generatedAt: string;
}

export interface ReportSection {
  heading: string;
  content: string;
  /** Optional visualization (mermaid, chart data) */
  visualization?: {
    type: 'mermaid' | 'chart' | 'table' | 'tree';
    data: string;
  };
}

// ===== Digital Twin Simulation =====

export interface SimulationScenario {
  name: string;
  description: string;
  /** API call sequence to simulate */
  steps: SimulationStep[];
  /** Expected state changes */
  expectedOutcome: string;
}

export interface SimulationStep {
  order: number;
  action: string;
  endpoint?: string;
  input?: Record<string, unknown>;
  /** AI-predicted response */
  predictedResponse?: {
    status: number;
    body: Record<string, unknown>;
  };
  /** AI-predicted side effects */
  predictedSideEffects?: string[];
}

export interface SimulationResult {
  scenario: SimulationScenario;
  /** AI-predicted outcome */
  prediction: string;
  /** Detected anomalies */
  anomalies: string[];
  /** Risk score 0-100 */
  riskScore: number;
  confidence: number;
}

// ===== Scanner Types =====

export interface ScanResult {
  /** Detected language breakdown */
  languages: Record<string, number>;
  /** Detected frameworks */
  frameworks: FrameworkDetection[];
  /** Discovered files by category */
  files: DiscoveredFile[];
  /** Extracted entities (pre-graph) */
  entities: ExtractedEntity[];
  /** Extracted relationships (pre-graph) */
  relationships: ExtractedRelationship[];
  /** Scan duration in ms */
  duration: number;
}

export interface FrameworkDetection {
  name: string;
  version?: string;
  confidence: number;
  evidence: string;
}

export interface DiscoveredFile {
  path: string;
  language: string;
  category: 'source' | 'config' | 'test' | 'docs' | 'build' | 'asset' | 'other';
  lines: number;
  size: number;
}

export interface ExtractedEntity {
  id: string;
  name: string;
  type: GraphNodeType;
  filePath: string;
  line?: number;
  language: string;
  metadata: Record<string, unknown>;
}

export interface ExtractedRelationship {
  sourceId: string;
  targetId: string;
  relation: GraphEdgeRelation;
  metadata?: Record<string, unknown>;
}
