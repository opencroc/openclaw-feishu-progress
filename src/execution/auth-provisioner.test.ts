import { describe, expect, it, vi } from 'vitest';
import type { OpenCrocConfig } from '../types.js';
import { createAuthProvisioner } from './auth-provisioner.js';

describe('createAuthProvisioner', () => {
  it('returns skipped when loginUrl is not configured', async () => {
    const config: OpenCrocConfig = { backendRoot: './backend' };
    const provisioner = createAuthProvisioner(config);

    const result = await provisioner.provision();

    expect(result.status).toBe('skipped');
    expect(result.env).toEqual({});
  });

  it('throws AUTH_FAIL when password is missing', async () => {
    const config: OpenCrocConfig = {
      backendRoot: './backend',
      runtime: { auth: { loginUrl: '/api/auth/login', username: 'admin' } },
      playwright: { baseURL: 'http://localhost:3000' },
    };
    const provisioner = createAuthProvisioner(config);

    await expect(provisioner.provision()).rejects.toThrow('AUTH_FAIL');
  });

  it('throws AUTH_FAIL when login endpoint returns non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const config: OpenCrocConfig = {
      backendRoot: './backend',
      runtime: { auth: { loginUrl: '/api/auth/login', username: 'admin', password: 'bad' } },
      playwright: { baseURL: 'http://localhost:3000' },
    };
    const provisioner = createAuthProvisioner(config, { fetchFn: fetchFn as typeof fetch });

    await expect(provisioner.provision()).rejects.toThrow('AUTH_FAIL');
  });

  it('returns env when auth preflight succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const config: OpenCrocConfig = {
      backendRoot: './backend',
      runtime: { auth: { loginUrl: '/api/auth/login', username: 'admin', password: 'secret' } },
      playwright: { baseURL: 'http://localhost:3000' },
    };
    const provisioner = createAuthProvisioner(config, { fetchFn: fetchFn as typeof fetch });

    const result = await provisioner.provision();

    expect(result.status).toBe('ready');
    expect(result.env.AUTH_LOGIN_URL).toBe('http://localhost:3000/api/auth/login');
    expect(result.env.AUTH_USERNAME).toBe('admin');
    expect(result.env.AUTH_PASSWORD).toBe('secret');
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
