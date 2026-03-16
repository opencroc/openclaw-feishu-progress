/**
 * Universal Project Scanner
 *
 * Scans any project directory and extracts entities (modules, classes,
 * functions, APIs, models) and relationships. Works with any language
 * by combining:
 *   1. Static analysis (ts-morph for TS/JS)
 *   2. Pattern matching (regex for Python/Go/Java/etc.)
 *   3. Config file parsing (package.json, OpenAPI, etc.)
 *   4. LLM fallback (for unknown patterns)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ScanResult,
  ExtractedEntity,
  ExtractedRelationship,
  GraphNodeType,
  GraphEdgeRelation,
  DiscoveredFile,
} from '../graph/types.js';
import { detectProject, type LanguageDetectionResult } from './language-detector.js';

export interface ScanOptions {
  /** Project root directory */
  rootDir: string;
  /** Max files to deeply analyze (default: 500) */
  maxDeepScan?: number;
  /** Enable LLM fallback for unknown patterns */
  useLlm?: boolean;
  /** Progress callback */
  onProgress?: (phase: string, percent: number, detail?: string) => void;
}

/**
 * Scan a project and extract all entities and relationships.
 */
export async function scanProject(options: ScanOptions): Promise<ScanResult> {
  const { rootDir, maxDeepScan = 500, onProgress } = options;
  const startTime = Date.now();

  onProgress?.('detecting', 0, 'Detecting languages and frameworks...');

  // Phase 1: Language detection
  const detection = detectProject(rootDir);

  onProgress?.('detecting', 100, `Found ${detection.totalFiles} files, primary: ${detection.primaryLanguage}`);

  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  // Phase 2: Extract entities by language
  const sourceFiles = detection.files.filter(f => {
    const lang = f.language;
    return !['json', 'yaml', 'toml', 'markdown', 'html', 'css', 'scss', 'less', 'sass', 'docker', 'shell', 'powershell'].includes(lang);
  });

  const filesToAnalyze = sourceFiles.slice(0, maxDeepScan);

  for (let i = 0; i < filesToAnalyze.length; i++) {
    const file = filesToAnalyze[i]!;
    const percent = Math.round((i / filesToAnalyze.length) * 100);
    if (i % 20 === 0) {
      onProgress?.('scanning', percent, `Scanning ${file.path}...`);
    }

    const fullPath = path.join(rootDir, file.path);
    try {
      const extracted = extractEntitiesFromFile(fullPath, file.path, file.language);
      entities.push(...extracted.entities);
      relationships.push(...extracted.relationships);
    } catch {
      // Skip files that fail to parse
    }
  }

  onProgress?.('scanning', 100, `Extracted ${entities.length} entities`);

  // Phase 3: Extract from config files
  onProgress?.('configs', 0, 'Parsing config files...');
  const configEntities = extractFromConfigs(rootDir, detection);
  entities.push(...configEntities.entities);
  relationships.push(...configEntities.relationships);
  onProgress?.('configs', 100, 'Config parsing complete');

  // Phase 4: Infer cross-file relationships
  onProgress?.('relations', 0, 'Building relationships...');
  const inferredRelations = inferRelationships(entities, rootDir);
  relationships.push(...inferredRelations);
  onProgress?.('relations', 100, `${relationships.length} total relationships`);

  // Convert detection files to DiscoveredFile format
  const discoveredFiles: DiscoveredFile[] = detection.files.map(f => ({
    path: f.path,
    language: f.language,
    category: categorizeFile(f.path, f.language),
    lines: f.lines,
    size: f.size,
  }));

  return {
    languages: detection.languages,
    frameworks: detection.frameworks,
    files: discoveredFiles,
    entities,
    relationships,
    duration: Date.now() - startTime,
  };
}

// ===== File Entity Extraction =====

interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

function extractEntitiesFromFile(fullPath: string, relPath: string, language: string): ExtractionResult {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return extractFromTsJs(fullPath, relPath, language);
    case 'python':
      return extractFromPython(fullPath, relPath);
    case 'go':
      return extractFromGo(fullPath, relPath);
    case 'java':
    case 'kotlin':
      return extractFromJavaKotlin(fullPath, relPath, language);
    case 'rust':
      return extractFromRust(fullPath, relPath);
    case 'ruby':
      return extractFromRuby(fullPath, relPath);
    case 'php':
      return extractFromPHP(fullPath, relPath);
    case 'vue':
    case 'svelte':
      return extractFromTsJs(fullPath, relPath, 'typescript'); // Extract script section
    default:
      return { entities: [], relationships: [] };
  }
}

// ===== TypeScript / JavaScript Extraction =====

function extractFromTsJs(fullPath: string, relPath: string, language: string): ExtractionResult {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  const fileId = `file:${relPath}`;
  entities.push({
    id: fileId,
    name: path.basename(relPath),
    type: 'file',
    filePath: relPath,
    language,
    metadata: {},
  });

  // Extract classes
  const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1]!;
    const extendsClass = match[2];
    const classId = `class:${relPath}:${className}`;

    entities.push({
      id: classId,
      name: className,
      type: detectClassType(className, content),
      filePath: relPath,
      line: getLineNumber(content, match.index),
      language,
      metadata: { extends: extendsClass },
    });

    relationships.push({ sourceId: classId, targetId: fileId, relation: 'belongs-to' });

    if (extendsClass) {
      relationships.push({
        sourceId: classId,
        targetId: `class:*:${extendsClass}`,
        relation: 'extends',
      });
    }
  }

  // Extract functions (top-level and exported)
  const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1]!;
    const funcId = `func:${relPath}:${funcName}`;
    entities.push({
      id: funcId,
      name: funcName,
      type: 'function',
      filePath: relPath,
      line: getLineNumber(content, match.index),
      language,
      metadata: {},
    });
    relationships.push({ sourceId: funcId, targetId: fileId, relation: 'belongs-to' });
  }

  // Extract arrow function exports
  const arrowFuncRegex = /export\s+(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
  while ((match = arrowFuncRegex.exec(content)) !== null) {
    const funcName = match[1]!;
    const funcId = `func:${relPath}:${funcName}`;
    entities.push({
      id: funcId,
      name: funcName,
      type: 'function',
      filePath: relPath,
      line: getLineNumber(content, match.index),
      language,
      metadata: { arrow: true },
    });
    relationships.push({ sourceId: funcId, targetId: fileId, relation: 'belongs-to' });
  }

  // Extract Express/Fastify routes
  const routeRegex = /(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1]!.toUpperCase();
    const routePath = match[2]!;
    const apiId = `api:${method}:${routePath}`;
    entities.push({
      id: apiId,
      name: `${method} ${routePath}`,
      type: 'api',
      filePath: relPath,
      line: getLineNumber(content, match.index),
      language,
      metadata: { method, path: routePath },
    });
    relationships.push({ sourceId: apiId, targetId: fileId, relation: 'belongs-to' });
  }

  // Extract imports
  const importRegex = /(?:import\s+.*from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2]!;
    if (importPath.startsWith('.')) {
      // Relative import → file dependency
      const resolved = resolveRelativeImport(relPath, importPath);
      relationships.push({
        sourceId: fileId,
        targetId: `file:${resolved}`,
        relation: 'imports',
      });
    } else {
      // External dependency
      const depName = importPath.startsWith('@') ? importPath.split('/').slice(0, 2).join('/') : importPath.split('/')[0]!;
      const depId = `dep:${depName}`;
      entities.push({
        id: depId,
        name: depName,
        type: 'dependency',
        filePath: '',
        language: 'external',
        metadata: { external: true },
      });
      relationships.push({ sourceId: fileId, targetId: depId, relation: 'depends-on' });
    }
  }

  // Extract Sequelize/TypeORM model definitions
  if (content.includes('.init(') || content.includes('Model.init') || content.includes('@Entity') || content.includes('defineModel')) {
    const tableMatch = content.match(/tableName:\s*['"`](\w+)['"`]/);
    if (tableMatch) {
      const tableName = tableMatch[1]!;
      const modelId = `model:${tableName}`;
      entities.push({
        id: modelId,
        name: tableName,
        type: 'model',
        filePath: relPath,
        language,
        metadata: { orm: 'sequelize' },
      });
      relationships.push({ sourceId: modelId, targetId: fileId, relation: 'belongs-to' });
    }
  }

  return { entities, relationships };
}

// ===== Python Extraction =====

function extractFromPython(fullPath: string, relPath: string): ExtractionResult {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  const fileId = `file:${relPath}`;
  entities.push({ id: fileId, name: path.basename(relPath), type: 'file', filePath: relPath, language: 'python', metadata: {} });

  // Classes
  const classRegex = /^class\s+(\w+)(?:\(([^)]*)\))?\s*:/gm;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1]!;
    const bases = match[2];
    const classId = `class:${relPath}:${className}`;
    entities.push({
      id: classId, name: className,
      type: detectPythonClassType(className, bases || '', content),
      filePath: relPath, line: getLineNumber(content, match.index),
      language: 'python', metadata: { bases },
    });
    relationships.push({ sourceId: classId, targetId: fileId, relation: 'belongs-to' });
  }

  // Functions
  const funcRegex = /^(?:async\s+)?def\s+(\w+)\s*\(/gm;
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1]!;
    if (funcName.startsWith('_') && funcName !== '__init__') continue;
    const funcId = `func:${relPath}:${funcName}`;
    entities.push({
      id: funcId, name: funcName, type: 'function',
      filePath: relPath, line: getLineNumber(content, match.index),
      language: 'python', metadata: {},
    });
    relationships.push({ sourceId: funcId, targetId: fileId, relation: 'belongs-to' });
  }

  // FastAPI/Flask routes
  const routeRegex = /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1]!.toUpperCase();
    const routePath = match[2]!;
    const apiId = `api:${method}:${routePath}`;
    entities.push({
      id: apiId, name: `${method} ${routePath}`, type: 'api',
      filePath: relPath, line: getLineNumber(content, match.index),
      language: 'python', metadata: { method, path: routePath },
    });
    relationships.push({ sourceId: apiId, targetId: fileId, relation: 'belongs-to' });
  }

  // Django URL patterns
  const djangoUrlRegex = /path\s*\(\s*['"]([^'"]+)['"],\s*(\w+)/g;
  while ((match = djangoUrlRegex.exec(content)) !== null) {
    const routePath = match[1]!;
    const apiId = `api:ANY:${routePath}`;
    entities.push({
      id: apiId, name: routePath, type: 'route',
      filePath: relPath, line: getLineNumber(content, match.index),
      language: 'python', metadata: { handler: match[2] },
    });
    relationships.push({ sourceId: apiId, targetId: fileId, relation: 'belongs-to' });
  }

  // Django models
  const djangoModelRegex = /class\s+(\w+)\((?:models\.)?Model\)/g;
  while ((match = djangoModelRegex.exec(content)) !== null) {
    const modelName = match[1]!;
    const modelId = `model:${modelName}`;
    entities.push({
      id: modelId, name: modelName, type: 'model',
      filePath: relPath, language: 'python', metadata: { orm: 'django' },
    });
    relationships.push({ sourceId: modelId, targetId: fileId, relation: 'belongs-to' });
  }

  // SQLAlchemy models
  const sqlalchemyRegex = /class\s+(\w+)\(.*(?:Base|DeclarativeBase|db\.Model)\)/g;
  while ((match = sqlalchemyRegex.exec(content)) !== null) {
    const modelName = match[1]!;
    const modelId = `model:${modelName}`;
    entities.push({
      id: modelId, name: modelName, type: 'model',
      filePath: relPath, language: 'python', metadata: { orm: 'sqlalchemy' },
    });
    relationships.push({ sourceId: modelId, targetId: fileId, relation: 'belongs-to' });
  }

  // Imports
  const importRegex = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
  while ((match = importRegex.exec(content)) !== null) {
    const mod = match[1] || match[2]!;
    if (mod.startsWith('.')) {
      relationships.push({ sourceId: fileId, targetId: `file:${mod}`, relation: 'imports' });
    } else {
      const depName = mod.split('.')[0]!;
      entities.push({ id: `dep:${depName}`, name: depName, type: 'dependency', filePath: '', language: 'external', metadata: { external: true } });
      relationships.push({ sourceId: fileId, targetId: `dep:${depName}`, relation: 'depends-on' });
    }
  }

  return { entities, relationships };
}

// ===== Go Extraction =====

function extractFromGo(fullPath: string, relPath: string): ExtractionResult {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  const fileId = `file:${relPath}`;
  entities.push({ id: fileId, name: path.basename(relPath), type: 'file', filePath: relPath, language: 'go', metadata: {} });

  // Structs
  const structRegex = /type\s+(\w+)\s+struct\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = structRegex.exec(content)) !== null) {
    const structName = match[1]!;
    const structId = `class:${relPath}:${structName}`;
    entities.push({
      id: structId, name: structName,
      type: structName.endsWith('Model') || structName.endsWith('Entity') ? 'model' : 'class',
      filePath: relPath, line: getLineNumber(content, match.index),
      language: 'go', metadata: {},
    });
    relationships.push({ sourceId: structId, targetId: fileId, relation: 'belongs-to' });
  }

  // Functions
  const funcRegex = /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/g;
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1]!;
    if (funcName[0] !== funcName[0]!.toUpperCase()) continue; // Skip unexported
    const funcId = `func:${relPath}:${funcName}`;
    entities.push({
      id: funcId, name: funcName, type: 'function',
      filePath: relPath, line: getLineNumber(content, match.index),
      language: 'go', metadata: {},
    });
    relationships.push({ sourceId: funcId, targetId: fileId, relation: 'belongs-to' });
  }

  // Gin/Echo routes
  const ginRouteRegex = /\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*"([^"]+)"/gi;
  while ((match = ginRouteRegex.exec(content)) !== null) {
    const method = match[1]!.toUpperCase();
    const routePath = match[2]!;
    const apiId = `api:${method}:${routePath}`;
    entities.push({
      id: apiId, name: `${method} ${routePath}`, type: 'api',
      filePath: relPath, line: getLineNumber(content, match.index),
      language: 'go', metadata: { method, path: routePath },
    });
    relationships.push({ sourceId: apiId, targetId: fileId, relation: 'belongs-to' });
  }

  return { entities, relationships };
}

// ===== Java/Kotlin Extraction =====

function extractFromJavaKotlin(fullPath: string, relPath: string, language: string): ExtractionResult {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  const fileId = `file:${relPath}`;
  entities.push({ id: fileId, name: path.basename(relPath), type: 'file', filePath: relPath, language, metadata: {} });

  // Classes
  const classRegex = /(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)(?:\s+extends\s+(\w+))?/g;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1]!;
    const classId = `class:${relPath}:${className}`;
    entities.push({
      id: classId, name: className,
      type: content.includes('@Entity') || content.includes('@Table') ? 'model' : 'class',
      filePath: relPath, line: getLineNumber(content, match.index),
      language, metadata: {},
    });
    relationships.push({ sourceId: classId, targetId: fileId, relation: 'belongs-to' });
  }

  // Spring Boot endpoints
  const springRegex = /@(?:Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g;
  while ((match = springRegex.exec(content)) !== null) {
    const routePath = match[1]!;
    const apiId = `api:ANY:${routePath}`;
    entities.push({
      id: apiId, name: routePath, type: 'api',
      filePath: relPath, line: getLineNumber(content, match.index),
      language, metadata: { path: routePath },
    });
    relationships.push({ sourceId: apiId, targetId: fileId, relation: 'belongs-to' });
  }

  return { entities, relationships };
}

// ===== Rust Extraction =====

function extractFromRust(fullPath: string, relPath: string): ExtractionResult {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  const fileId = `file:${relPath}`;
  entities.push({ id: fileId, name: path.basename(relPath), type: 'file', filePath: relPath, language: 'rust', metadata: {} });

  // Structs
  const structRegex = /pub\s+struct\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = structRegex.exec(content)) !== null) {
    const structName = match[1]!;
    const structId = `class:${relPath}:${structName}`;
    entities.push({ id: structId, name: structName, type: 'class', filePath: relPath, line: getLineNumber(content, match.index), language: 'rust', metadata: {} });
    relationships.push({ sourceId: structId, targetId: fileId, relation: 'belongs-to' });
  }

  // Functions
  const funcRegex = /pub\s+(?:async\s+)?fn\s+(\w+)/g;
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1]!;
    const funcId = `func:${relPath}:${funcName}`;
    entities.push({ id: funcId, name: funcName, type: 'function', filePath: relPath, line: getLineNumber(content, match.index), language: 'rust', metadata: {} });
    relationships.push({ sourceId: funcId, targetId: fileId, relation: 'belongs-to' });
  }

  return { entities, relationships };
}

// ===== Ruby Extraction =====

function extractFromRuby(fullPath: string, relPath: string): ExtractionResult {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  const fileId = `file:${relPath}`;
  entities.push({ id: fileId, name: path.basename(relPath), type: 'file', filePath: relPath, language: 'ruby', metadata: {} });

  // Classes
  const classRegex = /class\s+(\w+)(?:\s*<\s*(\w+))?/g;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1]!;
    const base = match[2];
    const classId = `class:${relPath}:${className}`;
    const type: GraphNodeType = base === 'ApplicationRecord' || base === 'ActiveRecord::Base' ? 'model' : 'class';
    entities.push({ id: classId, name: className, type, filePath: relPath, line: getLineNumber(content, match.index), language: 'ruby', metadata: { extends: base } });
    relationships.push({ sourceId: classId, targetId: fileId, relation: 'belongs-to' });
  }

  // Methods
  const defRegex = /def\s+(?:self\.)?(\w+)/g;
  while ((match = defRegex.exec(content)) !== null) {
    const funcName = match[1]!;
    if (funcName.startsWith('_')) continue;
    const funcId = `func:${relPath}:${funcName}`;
    entities.push({ id: funcId, name: funcName, type: 'function', filePath: relPath, line: getLineNumber(content, match.index), language: 'ruby', metadata: {} });
    relationships.push({ sourceId: funcId, targetId: fileId, relation: 'belongs-to' });
  }

  return { entities, relationships };
}

// ===== PHP Extraction =====

function extractFromPHP(fullPath: string, relPath: string): ExtractionResult {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  const fileId = `file:${relPath}`;
  entities.push({ id: fileId, name: path.basename(relPath), type: 'file', filePath: relPath, language: 'php', metadata: {} });

  // Classes
  const classRegex = /(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1]!;
    const base = match[2];
    const classId = `class:${relPath}:${className}`;
    const type: GraphNodeType = base === 'Model' || base === 'Eloquent' ? 'model' : 'class';
    entities.push({ id: classId, name: className, type, filePath: relPath, line: getLineNumber(content, match.index), language: 'php', metadata: {} });
    relationships.push({ sourceId: classId, targetId: fileId, relation: 'belongs-to' });
  }

  // Laravel routes
  const laravelRouteRegex = /Route::(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((match = laravelRouteRegex.exec(content)) !== null) {
    const method = match[1]!.toUpperCase();
    const routePath = match[2]!;
    const apiId = `api:${method}:${routePath}`;
    entities.push({ id: apiId, name: `${method} ${routePath}`, type: 'api', filePath: relPath, line: getLineNumber(content, match.index), language: 'php', metadata: { method, path: routePath } });
    relationships.push({ sourceId: apiId, targetId: fileId, relation: 'belongs-to' });
  }

  return { entities, relationships };
}

// ===== Config File Extraction =====

function extractFromConfigs(rootDir: string, _detection: LanguageDetectionResult): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  // Extract dependencies from package.json
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies };
      for (const [name, version] of Object.entries(allDeps)) {
        const depId = `dep:${name}`;
        entities.push({
          id: depId, name, type: 'dependency',
          filePath: 'package.json', language: 'external',
          metadata: { version, source: 'npm', external: true },
        });
      }
    } catch {
      // ignore
    }
  }

  // Extract from OpenAPI/Swagger spec
  const openAPIFiles = ['openapi.json', 'openapi.yaml', 'openapi.yml', 'swagger.json', 'swagger.yaml'];
  for (const apiFile of openAPIFiles) {
    const apiPath = path.join(rootDir, apiFile);
    if (fs.existsSync(apiPath)) {
      try {
        const content = fs.readFileSync(apiPath, 'utf-8');
        // Simple path extraction from OpenAPI
        const pathRegex = /"(\/[^"]+)":\s*\{/g;
        let match: RegExpExecArray | null;
        while ((match = pathRegex.exec(content)) !== null) {
          const routePath = match[1]!;
          const apiId = `api:ANY:${routePath}`;
          entities.push({
            id: apiId, name: routePath, type: 'api',
            filePath: apiFile, language: 'openapi',
            metadata: { source: 'openapi' },
          });
        }
      } catch {
        // ignore
      }
    }
  }

  // Extract Docker services
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  for (const composeFile of composeFiles) {
    const composePath = path.join(rootDir, composeFile);
    if (fs.existsSync(composePath)) {
      try {
        const content = fs.readFileSync(composePath, 'utf-8');
        // Simple service extraction
        const serviceRegex = /^\s{2}(\w[\w-]*):\s*$/gm;
        let match: RegExpExecArray | null;
        while ((match = serviceRegex.exec(content)) !== null) {
          const serviceName = match[1]!;
          if (serviceName === 'services' || serviceName === 'volumes' || serviceName === 'networks') continue;
          entities.push({
            id: `service:${serviceName}`, name: serviceName,
            type: detectServiceType(serviceName),
            filePath: composeFile, language: 'docker',
            metadata: { source: 'docker-compose' },
          });
        }
      } catch {
        // ignore
      }
    }
  }

  return { entities, relationships };
}

// ===== Relationship Inference =====

function inferRelationships(entities: ExtractedEntity[], _rootDir: string): ExtractedRelationship[] {
  const relationships: ExtractedRelationship[] = [];

  // Group entities by type
  const models = entities.filter(e => e.type === 'model');
  const apis = entities.filter(e => e.type === 'api');
  // const classes = entities.filter(e => e.type === 'class' || e.type === 'service');

  // Infer API → Model relationships by path patterns
  for (const api of apis) {
    const apiPath = (api.metadata.path as string) || api.name;
    for (const model of models) {
      const modelName = model.name.toLowerCase().replace(/_/g, '');
      const pathLower = apiPath.toLowerCase().replace(/[/-]/g, '');
      if (pathLower.includes(modelName) || modelName.includes(pathLower.split('/').pop() || '')) {
        const method = (api.metadata.method as string) || 'ANY';
        const relation: GraphEdgeRelation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 'writes' : 'reads';
        relationships.push({ sourceId: api.id, targetId: model.id, relation });
      }
    }
  }

  // Infer module groupings from directory structure
  const fileEntities = entities.filter(e => e.type === 'file');
  for (const file of fileEntities) {
    const dir = path.dirname(file.filePath).split('/')[0];
    if (dir && dir !== '.') {
      const moduleId = `module:${dir}`;
      // Only add module entity if not already exists
      if (!entities.some(e => e.id === moduleId)) {
        entities.push({
          id: moduleId, name: dir, type: 'module',
          filePath: dir, language: 'directory',
          metadata: {},
        });
      }
      relationships.push({ sourceId: file.id, targetId: moduleId, relation: 'belongs-to' });
    }
  }

  return relationships;
}

// ===== Helpers =====

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function resolveRelativeImport(currentFile: string, importPath: string): string {
  const dir = path.dirname(currentFile);
  let resolved = path.posix.join(dir, importPath);
  // Normalize: add .ts extension if missing
  if (!path.extname(resolved)) {
    resolved += '.ts';
  }
  return resolved;
}

function categorizeFile(filePath: string, language: string): 'source' | 'config' | 'test' | 'docs' | 'build' | 'asset' | 'other' {
  const lower = filePath.toLowerCase();
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__') || lower.includes('/test/') || lower.includes('/tests/')) return 'test';
  if (['json', 'yaml', 'toml'].includes(language) || lower.includes('config') || lower.includes('.env')) return 'config';
  if (language === 'markdown' || lower.includes('/docs/') || lower.includes('/doc/')) return 'docs';
  if (language === 'docker' || lower.includes('makefile') || lower.includes('webpack') || lower.includes('rollup') || lower.includes('vite')) return 'build';
  if (['html', 'css', 'scss', 'less'].includes(language)) return 'asset';
  return 'source';
}

function detectClassType(name: string, content: string): GraphNodeType {
  if (content.includes('.init(') || content.includes('@Entity') || content.includes('tableName')) return 'model';
  if (name.includes('Controller') || name.includes('Handler')) return 'service';
  if (name.includes('Service') || name.includes('Provider')) return 'service';
  if (name.includes('Middleware')) return 'middleware';
  if (name.includes('Component') || name.includes('Widget')) return 'component';
  return 'class';
}

function detectPythonClassType(name: string, bases: string, _content: string): GraphNodeType {
  if (bases.includes('Model') || bases.includes('Base') || bases.includes('db.Model')) return 'model';
  if (name.includes('View') || name.includes('ViewSet') || bases.includes('APIView')) return 'service';
  if (name.includes('Serializer')) return 'class';
  return 'class';
}

function detectServiceType(name: string): GraphNodeType {
  const lower = name.toLowerCase();
  if (lower.includes('redis') || lower.includes('memcache')) return 'cache';
  if (lower.includes('rabbit') || lower.includes('kafka') || lower.includes('nats')) return 'queue';
  if (lower.includes('postgres') || lower.includes('mysql') || lower.includes('mongo') || lower.includes('db')) return 'database';
  return 'external-api';
}
