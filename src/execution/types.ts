import type { ExecutionMetrics } from '../types.js';

export type ExecutionRunMode = 'auto' | 'reuse' | 'managed';

export interface FailureHint {
  line: string;
  category: string;
  confidence: number;
}

export interface ExecutionRunRequest {
  cwd: string;
  testFiles: string[];
  mode?: ExecutionRunMode;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface ExecutionRunResult {
  mode: ExecutionRunMode;
  metrics: ExecutionMetrics;
  output: string;
  failureHints: FailureHint[];
}

export interface ExecutionCoordinator {
  run(request: ExecutionRunRequest): Promise<ExecutionRunResult>;
}

export interface ExecutionCoordinatorDeps {
  execSync?: (
    command: string,
    options: { cwd: string; encoding: 'utf-8'; timeout: number; stdio: 'pipe'; env?: NodeJS.ProcessEnv },
  ) => string;
  categorizeFailure?: (line: string) => { category: string; confidence: number };
}

export interface BackendServerConfig {
  command?: string;
  args?: string[];
  cwd?: string;
  healthUrl?: string;
  startTimeoutMs?: number;
  pollIntervalMs?: number;
  reuseExisting?: boolean;
}

export interface BackendEnsureRequest {
  mode: ExecutionRunMode;
  cwd: string;
  server?: BackendServerConfig;
  baseURL?: string;
}

export interface BackendEnsureResult {
  mode: ExecutionRunMode;
  status: 'reused' | 'started' | 'skipped';
  healthUrl: string;
  cleanup: () => Promise<void>;
}

export interface BackendManager {
  ensureReady(request: BackendEnsureRequest): Promise<BackendEnsureResult>;
}

export interface BackendManagerDeps {
  waitForBackend?: (
    baseUrl: string,
    options: { timeoutMs?: number; intervalMs?: number; healthPath?: string },
  ) => Promise<void>;
  spawn?: (
    command: string,
    args: string[],
    options: { cwd: string; shell: boolean; stdio: 'ignore' | 'pipe'; env: NodeJS.ProcessEnv },
  ) => {
    kill: (signal?: NodeJS.Signals | number) => boolean;
    exitCode: number | null;
    pid?: number;
  };
}

export interface RuntimeBootstrapRequest {
  cwd: string;
  hasAuth: boolean;
  force?: boolean;
}

export interface RuntimeBootstrapResult {
  writtenFiles: string[];
  skippedFiles: string[];
}

export interface RuntimeBootstrap {
  ensure(request: RuntimeBootstrapRequest): Promise<RuntimeBootstrapResult>;
}

export interface AuthProvisionResult {
  status: 'skipped' | 'ready';
  env: NodeJS.ProcessEnv;
}

export interface AuthProvisioner {
  provision(): Promise<AuthProvisionResult>;
}

export interface AuthProvisionerDeps {
  fetchFn?: typeof fetch;
}

export type AuthStatus = 'skipped' | 'ready' | 'failed';
export type BackendStatus = 'reused' | 'started' | 'skipped' | 'failed';

export interface ExecutionQualityGateResult {
  setupFail: boolean;
  skipRatio: number;
  authFailRatio: number;
  effectiveExecutionRate: number;
  level: 'pass' | 'warn' | 'fail';
  reasons: string[];
  authStatus: AuthStatus;
  backendStatus: BackendStatus;
}
