/**
 * Language Detector
 *
 * Detects programming languages, frameworks, and project type
 * from a project directory without reading source code ASTs.
 * Uses file extensions, config files, and package manifests.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectType, FrameworkDetection } from '../graph/types.js';

// ===== Language Detection by File Extension =====

const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyw': 'python', '.pyi': 'python',
  '.go': 'go',
  '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c': 'c', '.h': 'c',
  '.swift': 'swift',
  '.dart': 'dart',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.sql': 'sql',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.proto': 'protobuf',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.json': 'json',
  '.toml': 'toml',
  '.md': 'markdown',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.less': 'less', '.sass': 'sass',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.ps1': 'powershell',
  '.dockerfile': 'docker',
  '.tf': 'terraform',
  '.lua': 'lua',
  '.r': 'r', '.R': 'r',
  '.scala': 'scala',
  '.ex': 'elixir', '.exs': 'elixir',
  '.erl': 'erlang',
  '.zig': 'zig',
};

/** Directories to skip during scanning */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'target',
  '__pycache__', '.cache', '.next', '.nuxt', '.output', 'vendor', 'venv',
  '.venv', 'env', '.env', 'coverage', '.idea', '.vscode', '.vs',
  '.turbo', '.nx', 'bower_components', 'jspm_packages',
]);

/** Max depth to scan */
const MAX_DEPTH = 8;

/** Max files to scan for detection (avoid huge repos) */
const MAX_FILES = 10000;

export interface LanguageDetectionResult {
  /** Language → file count */
  languages: Record<string, number>;
  /** Language → total line count */
  linesByLanguage: Record<string, number>;
  /** Total files found */
  totalFiles: number;
  /** Total lines of code */
  totalLines: number;
  /** Primary language */
  primaryLanguage: string;
  /** Detected frameworks */
  frameworks: FrameworkDetection[];
  /** Detected project type */
  projectType: ProjectType;
  /** Package manager */
  packageManager?: string;
  /** All discovered source files */
  files: Array<{ path: string; language: string; lines: number; size: number }>;
}

/**
 * Detect languages, frameworks, and project type from a directory.
 */
export function detectProject(rootDir: string): LanguageDetectionResult {
  const absRoot = path.resolve(rootDir);
  const languages: Record<string, number> = {};
  const linesByLanguage: Record<string, number> = {};
  const files: Array<{ path: string; language: string; lines: number; size: number }> = [];
  let totalFiles = 0;
  let totalLines = 0;

  // Recursive file scan
  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH || totalFiles > MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (totalFiles > MAX_FILES) break;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(fullPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      // Special file name detection
      const lang = detectLanguageByFile(entry.name, ext);
      if (!lang) continue;

      let lineCount = 0;
      let fileSize = 0;
      try {
        const stat = fs.statSync(fullPath);
        fileSize = stat.size;
        // Only count lines for reasonable files (< 1MB)
        if (fileSize < 1_048_576) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          lineCount = content.split('\n').length;
        }
      } catch {
        continue;
      }

      languages[lang] = (languages[lang] || 0) + 1;
      linesByLanguage[lang] = (linesByLanguage[lang] || 0) + lineCount;
      totalFiles++;
      totalLines += lineCount;

      const relPath = path.relative(absRoot, fullPath).replace(/\\/g, '/');
      files.push({ path: relPath, language: lang, lines: lineCount, size: fileSize });
    }
  }

  walk(absRoot, 0);

  // Determine primary language (by file count, ignoring config-only languages)
  const codeLangs = Object.entries(languages)
    .filter(([k]) => !['json', 'yaml', 'toml', 'markdown', 'html', 'css', 'scss', 'less', 'sass'].includes(k))
    .sort((a, b) => b[1] - a[1]);
  const primaryLanguage = codeLangs[0]?.[0] || 'unknown';

  // Detect frameworks
  const frameworks = detectFrameworks(absRoot, languages, files);

  // Detect project type
  const projectType = detectProjectType(absRoot, languages, frameworks);

  // Detect package manager
  const packageManager = detectPackageManager(absRoot);

  return {
    languages,
    linesByLanguage,
    totalFiles,
    totalLines,
    primaryLanguage,
    frameworks,
    projectType,
    packageManager,
    files,
  };
}

function detectLanguageByFile(fileName: string, ext: string): string | null {
  // Special file names
  if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) return 'docker';
  if (fileName === 'Makefile') return 'makefile';
  if (fileName === 'CMakeLists.txt') return 'cmake';
  if (fileName === 'Vagrantfile') return 'ruby';
  if (fileName === 'Gemfile') return 'ruby';
  if (fileName === 'Rakefile') return 'ruby';
  if (fileName === 'Cargo.toml') return 'rust';
  if (fileName === 'go.mod' || fileName === 'go.sum') return 'go';

  return EXTENSION_MAP[ext] || null;
}

// ===== Framework Detection =====

interface FrameworkRule {
  name: string;
  detect: (root: string, langs: Record<string, number>, files: Array<{ path: string }>) => FrameworkDetection | null;
}

const FRAMEWORK_RULES: FrameworkRule[] = [
  // --- Node.js / JavaScript ---
  {
    name: 'express',
    detect: (root) => detectFromPackageJson(root, 'express', 'Express'),
  },
  {
    name: 'nestjs',
    detect: (root) => detectFromPackageJson(root, '@nestjs/core', 'NestJS'),
  },
  {
    name: 'fastify',
    detect: (root) => detectFromPackageJson(root, 'fastify', 'Fastify'),
  },
  {
    name: 'koa',
    detect: (root) => detectFromPackageJson(root, 'koa', 'Koa'),
  },
  {
    name: 'hapi',
    detect: (root) => detectFromPackageJson(root, '@hapi/hapi', 'Hapi'),
  },
  {
    name: 'nextjs',
    detect: (root) => detectFromPackageJson(root, 'next', 'Next.js'),
  },
  {
    name: 'nuxtjs',
    detect: (root) => detectFromPackageJson(root, 'nuxt', 'Nuxt.js'),
  },
  {
    name: 'react',
    detect: (root) => detectFromPackageJson(root, 'react', 'React'),
  },
  {
    name: 'vue',
    detect: (root) => detectFromPackageJson(root, 'vue', 'Vue'),
  },
  {
    name: 'angular',
    detect: (root) => detectFromPackageJson(root, '@angular/core', 'Angular'),
  },
  {
    name: 'svelte',
    detect: (root) => detectFromPackageJson(root, 'svelte', 'Svelte'),
  },
  {
    name: 'electron',
    detect: (root) => detectFromPackageJson(root, 'electron', 'Electron'),
  },
  {
    name: 'sequelize',
    detect: (root) => detectFromPackageJson(root, 'sequelize', 'Sequelize'),
  },
  {
    name: 'typeorm',
    detect: (root) => detectFromPackageJson(root, 'typeorm', 'TypeORM'),
  },
  {
    name: 'prisma',
    detect: (root) => detectFromPackageJson(root, 'prisma', 'Prisma') || detectFromPackageJson(root, '@prisma/client', 'Prisma'),
  },
  {
    name: 'mongoose',
    detect: (root) => detectFromPackageJson(root, 'mongoose', 'Mongoose'),
  },
  {
    name: 'playwright',
    detect: (root) => detectFromPackageJson(root, '@playwright/test', 'Playwright'),
  },
  // --- Python ---
  {
    name: 'django',
    detect: (root) => detectFromRequirements(root, 'django', 'Django') || detectFromFile(root, 'manage.py', 'Django'),
  },
  {
    name: 'flask',
    detect: (root) => detectFromRequirements(root, 'flask', 'Flask'),
  },
  {
    name: 'fastapi',
    detect: (root) => detectFromRequirements(root, 'fastapi', 'FastAPI'),
  },
  {
    name: 'pytorch',
    detect: (root) => detectFromRequirements(root, 'torch', 'PyTorch'),
  },
  {
    name: 'tensorflow',
    detect: (root) => detectFromRequirements(root, 'tensorflow', 'TensorFlow'),
  },
  // --- Go ---
  {
    name: 'gin',
    detect: (root) => detectFromGoMod(root, 'github.com/gin-gonic/gin', 'Gin'),
  },
  {
    name: 'echo',
    detect: (root) => detectFromGoMod(root, 'github.com/labstack/echo', 'Echo'),
  },
  {
    name: 'fiber',
    detect: (root) => detectFromGoMod(root, 'github.com/gofiber/fiber', 'Fiber'),
  },
  // --- Java ---
  {
    name: 'spring-boot',
    detect: (root) => detectFromFile(root, 'pom.xml', 'Spring Boot', 'spring-boot') || detectFromFile(root, 'build.gradle', 'Spring Boot', 'spring-boot'),
  },
  // --- Rust ---
  {
    name: 'actix-web',
    detect: (root) => detectFromCargoToml(root, 'actix-web', 'Actix Web'),
  },
  {
    name: 'axum',
    detect: (root) => detectFromCargoToml(root, 'axum', 'Axum'),
  },
  // --- Ruby ---
  {
    name: 'rails',
    detect: (root) => detectFromFile(root, 'Gemfile', 'Ruby on Rails', 'rails'),
  },
  // --- PHP ---
  {
    name: 'laravel',
    detect: (root) => detectFromFile(root, 'artisan', 'Laravel'),
  },
];

function detectFromPackageJson(root: string, dep: string, name: string): FrameworkDetection | null {
  // Search in root and common subdirs
  const candidates = [
    path.join(root, 'package.json'),
    path.join(root, 'backend', 'package.json'),
    path.join(root, 'server', 'package.json'),
    path.join(root, 'api', 'package.json'),
    path.join(root, 'frontend', 'package.json'),
    path.join(root, 'web', 'package.json'),
    path.join(root, 'client', 'package.json'),
  ];

  for (const pkgPath of candidates) {
    try {
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
      if (dep in allDeps) {
        return {
          name,
          version: allDeps[dep]?.replace(/[\^~>=<]*/g, ''),
          confidence: 0.95,
          evidence: `Found "${dep}" in ${path.relative(root, pkgPath)}`,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function detectFromRequirements(root: string, dep: string, name: string): FrameworkDetection | null {
  const candidates = [
    path.join(root, 'requirements.txt'),
    path.join(root, 'Pipfile'),
    path.join(root, 'pyproject.toml'),
    path.join(root, 'setup.py'),
    path.join(root, 'setup.cfg'),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      const pattern = new RegExp(`^${dep}([>=<~!\\s]|$)`, 'im');
      if (pattern.test(content)) {
        return {
          name,
          confidence: 0.9,
          evidence: `Found "${dep}" in ${path.basename(filePath)}`,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function detectFromGoMod(root: string, module: string, name: string): FrameworkDetection | null {
  const goModPath = path.join(root, 'go.mod');
  try {
    if (!fs.existsSync(goModPath)) return null;
    const content = fs.readFileSync(goModPath, 'utf-8');
    if (content.includes(module)) {
      return {
        name,
        confidence: 0.95,
        evidence: `Found "${module}" in go.mod`,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function detectFromCargoToml(root: string, crate: string, name: string): FrameworkDetection | null {
  const cargoPath = path.join(root, 'Cargo.toml');
  try {
    if (!fs.existsSync(cargoPath)) return null;
    const content = fs.readFileSync(cargoPath, 'utf-8');
    if (content.includes(crate)) {
      return {
        name,
        confidence: 0.9,
        evidence: `Found "${crate}" in Cargo.toml`,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function detectFromFile(root: string, fileName: string, name: string, searchTerm?: string): FrameworkDetection | null {
  const filePath = path.join(root, fileName);
  try {
    if (!fs.existsSync(filePath)) return null;
    if (searchTerm) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.toLowerCase().includes(searchTerm.toLowerCase())) return null;
    }
    return {
      name,
      confidence: 0.8,
      evidence: `Found ${fileName}${searchTerm ? ` containing "${searchTerm}"` : ''}`,
    };
  } catch {
    return null;
  }
}

function detectFrameworks(root: string, langs: Record<string, number>, files: Array<{ path: string }>): FrameworkDetection[] {
  const detected: FrameworkDetection[] = [];
  for (const rule of FRAMEWORK_RULES) {
    const result = rule.detect(root, langs, files);
    if (result) detected.push(result);
  }
  return detected;
}

// ===== Project Type Detection =====

function detectProjectType(root: string, langs: Record<string, number>, frameworks: FrameworkDetection[]): ProjectType {
  const frameworkNames = new Set(frameworks.map(f => f.name.toLowerCase()));

  // Monorepo detection
  const hasLerna = fs.existsSync(path.join(root, 'lerna.json'));
  const hasPnpmWorkspace = fs.existsSync(path.join(root, 'pnpm-workspace.yaml'));
  const hasNxJson = fs.existsSync(path.join(root, 'nx.json'));
  const hasTurboJson = fs.existsSync(path.join(root, 'turbo.json'));
  let hasWorkspaces = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    hasWorkspaces = Array.isArray(pkg.workspaces) || typeof pkg.workspaces === 'object';
  } catch {
    // ignore
  }
  if (hasLerna || hasPnpmWorkspace || hasNxJson || hasTurboJson || hasWorkspaces) {
    return 'monorepo';
  }

  // Library detection
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    if (pkg.main || pkg.exports || pkg.module) {
      const hasNoServer = !frameworkNames.has('express') && !frameworkNames.has('fastify') &&
                         !frameworkNames.has('koa') && !frameworkNames.has('nestjs');
      const hasNoFrontend = !frameworkNames.has('react') && !frameworkNames.has('vue') &&
                           !frameworkNames.has('angular') && !frameworkNames.has('svelte');
      if (hasNoServer && hasNoFrontend && pkg.keywords) return 'library';
    }
    if (pkg.bin) return 'cli-tool';
  } catch {
    // ignore
  }

  // SSR frameworks
  if (frameworkNames.has('next.js') || frameworkNames.has('nuxt.js')) return 'frontend-ssr';

  // Mobile
  if (frameworkNames.has('electron')) return 'fullstack';
  if (langs['dart']) return 'mobile';
  if (langs['swift'] && !langs['typescript'] && !langs['python']) return 'mobile';

  // Fullstack detection (has both frontend and backend frameworks)
  const hasBackend = frameworkNames.has('express') || frameworkNames.has('fastify') ||
                     frameworkNames.has('nestjs') || frameworkNames.has('koa') ||
                     frameworkNames.has('django') || frameworkNames.has('flask') ||
                     frameworkNames.has('fastapi') || frameworkNames.has('gin') ||
                     frameworkNames.has('spring boot') || frameworkNames.has('rails') ||
                     frameworkNames.has('laravel');
  const hasFrontend = frameworkNames.has('react') || frameworkNames.has('vue') ||
                      frameworkNames.has('angular') || frameworkNames.has('svelte');

  if (hasBackend && hasFrontend) return 'fullstack';
  if (hasBackend) return 'backend-api';
  if (hasFrontend) return 'frontend-spa';

  // Rust/Go API
  if (frameworkNames.has('actix web') || frameworkNames.has('axum') ||
      frameworkNames.has('gin') || frameworkNames.has('echo') || frameworkNames.has('fiber')) {
    return 'backend-api';
  }

  return 'unknown';
}

// ===== Package Manager Detection =====

function detectPackageManager(root: string): string | undefined {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(root, 'Pipfile.lock'))) return 'pipenv';
  if (fs.existsSync(path.join(root, 'poetry.lock'))) return 'poetry';
  if (fs.existsSync(path.join(root, 'go.sum'))) return 'go-modules';
  if (fs.existsSync(path.join(root, 'Cargo.lock'))) return 'cargo';
  if (fs.existsSync(path.join(root, 'Gemfile.lock'))) return 'bundler';
  if (fs.existsSync(path.join(root, 'composer.lock'))) return 'composer';
  return undefined;
}
