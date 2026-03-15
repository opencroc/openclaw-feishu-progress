import type { OpenCrocConfig } from '../types.js';
import type { AuthProvisionResult, AuthProvisioner, AuthProvisionerDeps } from './types.js';

function selectBaseUrl(configBaseUrl?: string): string {
  if (configBaseUrl && /^https?:\/\//i.test(configBaseUrl)) return configBaseUrl;
  const envBaseUrl = process.env.BASE_URL || '';
  if (/^https?:\/\//i.test(envBaseUrl)) return envBaseUrl;
  return '';
}

function resolveLoginUrl(loginUrl: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(loginUrl)) return loginUrl;
  if (!baseUrl) {
    throw new Error('AUTH_FAIL: playwright.baseURL or BASE_URL is required for relative runtime.auth.loginUrl');
  }
  try {
    return new URL(loginUrl, baseUrl).href;
  } catch {
    throw new Error('AUTH_FAIL: invalid login URL or base URL');
  }
}

export function createAuthProvisioner(config: OpenCrocConfig, deps: AuthProvisionerDeps = {}): AuthProvisioner {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    async provision(): Promise<AuthProvisionResult> {
      const auth = config.runtime?.auth;
      const loginUrl = auth?.loginUrl;
      const baseURL = selectBaseUrl(config.playwright?.baseURL);

      if (!loginUrl) {
        return { status: 'skipped', env: {} };
      }

      const username = process.env.AUTH_USERNAME || auth?.username || 'admin';
      const password = process.env.AUTH_PASSWORD || auth?.password || '';
      if (!password) {
        throw new Error('AUTH_FAIL: runtime.auth.password or AUTH_PASSWORD is required');
      }

      const resolvedLoginUrl = resolveLoginUrl(loginUrl, baseURL);
      const response = await fetchFn(resolvedLoginUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        throw new Error(`AUTH_FAIL: login request failed with status ${response.status}`);
      }

      const env: NodeJS.ProcessEnv = {
        AUTH_LOGIN_URL: resolvedLoginUrl,
        AUTH_USERNAME: username,
        AUTH_PASSWORD: password,
      };
      if (baseURL) env.BASE_URL = baseURL;

      return {
        status: 'ready',
        env,
      };
    },
  };
}
