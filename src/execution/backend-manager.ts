import { resolve } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { waitForBackend as runtimeWaitForBackend } from '../runtime/resilient-fetch.js';
import type {
  BackendEnsureRequest,
  BackendEnsureResult,
  BackendManager,
  BackendManagerDeps,
  BackendServerConfig,
} from './types.js';

function normalizeHealthUrl(server?: BackendServerConfig, baseURL?: string): string {
  if (server?.healthUrl) return server.healthUrl;
  if (baseURL) return new URL('/health', baseURL).href;
  return 'http://localhost:3000/health';
}

function splitHealthUrl(healthUrl: string): { baseUrl: string; healthPath: string } {
  const parsed = new URL(healthUrl);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const healthPath = `${parsed.pathname}${parsed.search}`;
  return { baseUrl, healthPath };
}

async function waitReady(
  waitForBackend: NonNullable<BackendManagerDeps['waitForBackend']>,
  healthUrl: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<void> {
  const { baseUrl, healthPath } = splitHealthUrl(healthUrl);
  await waitForBackend(baseUrl, {
    timeoutMs,
    intervalMs,
    healthPath,
  });
}

export function createBackendManager(deps: BackendManagerDeps = {}): BackendManager {
  const waitForBackend = deps.waitForBackend ?? runtimeWaitForBackend;
  const spawn = deps.spawn ?? nodeSpawn;

  return {
    async ensureReady(request: BackendEnsureRequest): Promise<BackendEnsureResult> {
      const server = request.server ?? {};
      const healthUrl = normalizeHealthUrl(server, request.baseURL);
      const quickTimeoutMs = 1_500;
      const startTimeoutMs = server.startTimeoutMs ?? 30_000;
      const pollIntervalMs = server.pollIntervalMs ?? 800;
      const tryReuse = request.mode !== 'managed' || server.reuseExisting !== false;

      if (tryReuse) {
        try {
          await waitReady(waitForBackend, healthUrl, quickTimeoutMs, 300);
          return {
            mode: request.mode,
            status: 'reused',
            healthUrl,
            cleanup: async () => {},
          };
        } catch (err) {
          void err;
        }
      }

      if (request.mode === 'reuse') {
        throw new Error(`HEALTH_FAIL: backend is not reachable at ${healthUrl} in reuse mode`);
      }

      if (!server.command) {
        if (request.mode === 'auto') {
          return {
            mode: request.mode,
            status: 'skipped',
            healthUrl,
            cleanup: async () => {},
          };
        }
        throw new Error('BOOT_CONFIG_MISSING: runtime.server.command is required for managed mode');
      }

      const child = spawn(server.command, server.args ?? [], {
        cwd: resolve(request.cwd, server.cwd ?? '.'),
        shell: true,
        stdio: 'pipe',
        env: process.env,
      });

      try {
        await waitReady(waitForBackend, healthUrl, startTimeoutMs, pollIntervalMs);
      } catch {
        if (child.exitCode === null) child.kill();
        throw new Error(`BOOT_TIMEOUT: backend did not become healthy at ${healthUrl}`);
      }

      return {
        mode: request.mode,
        status: 'started',
        healthUrl,
        cleanup: async () => {
          if (child.exitCode === null) child.kill();
        },
      };
    },
  };
}
