import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { CrocOffice } from './croc-office.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FeishuProgressBridge, type FeishuBridgeConfig } from './feishu-bridge.js';
import { registerFeishuIngressRoutes } from './feishu-ingress.js';
import { FileFeishuWebhookDedupStore } from './feishu-webhook-dedup-store.js';
import { buildFeishuWebhookSignatureHeaders, encryptFeishuWebhookPayload } from './feishu-webhook-security.js';
import * as dispatcher from './chat-task-dispatcher.js';

function createApp(feishuConfig: FeishuBridgeConfig = {}, dedupStore?: FileFeishuWebhookDedupStore) {
  const app = Fastify();
  const office = new CrocOffice({ backendRoot: '.', feishu: feishuConfig }, process.cwd());
  const feishuBridge = new FeishuProgressBridge({ send: async () => {} }, { baseTaskUrl: 'http://localhost:3333', ...feishuConfig });
  office.setFeishuBridge(feishuBridge);
  registerFeishuIngressRoutes(app, office, feishuBridge, { config: feishuConfig, dedupStore });
  return { app, office };
}

describe('registerFeishuIngressRoutes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responds to Feishu url verification challenge', async () => {
    const { app } = createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: { type: 'url_verification', challenge: 'hello-challenge' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ challenge: 'hello-challenge' });
  });

  it('creates a chat task and returns ack payload for complex Feishu message', async () => {
    const { app, office } = createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: {
        schema: '2.0',
        header: { event_type: 'im.message.receive_v1' },
        event: {
          sender: { sender_id: { open_id: 'ou_xxx' } },
          message: {
            message_id: 'om_123',
            chat_id: 'oc_456',
            message_type: 'text',
            content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.result.kind).toBe('task-start');
    expect(payload.result.taskId).toBeTruthy();
    expect(payload.result.ack.message.text).toContain('taskId');
    expect(payload.result.dispatch.intent).toBe('analysis');
    expect(payload.result.dispatch.action).toBe('started');

    const task = office.getTask(payload.result.taskId);
    expect(task?.kind).toBe('chat');
    expect(task).toBeTruthy();
  });

  it('passes through simple short messages', async () => {
    const { app } = createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: {
        schema: '2.0',
        header: { event_type: 'im.message.receive_v1' },
        event: {
          message: {
            message_id: 'om_short',
            chat_id: 'oc_456',
            message_type: 'text',
            content: JSON.stringify({ text: '你好' }),
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.result.kind).toBe('pass-through');
  });

  it('ignores duplicate Feishu deliveries by event id', async () => {
    const { app, office } = createApp();
    const payload = {
      schema: '2.0',
      header: { event_type: 'im.message.receive_v1', event_id: 'evt_dup_1' },
      event: {
        sender: { sender_id: { open_id: 'ou_dup' } },
        message: {
          message_id: 'om_dup_1',
          chat_id: 'oc_dup_1',
          message_type: 'text',
          content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
        },
      },
    };

    const first = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().result.kind).toBe('task-start');

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      ok: true,
      ignored: true,
    });
    expect(second.json().reason).toContain('Duplicate Feishu delivery ignored');
    expect(office.listTasks(10)).toHaveLength(1);
  });

  it('returns immediately for pipeline-style requests instead of waiting for background execution', async () => {
    const dispatchSpy = vi.spyOn(dispatcher, 'dispatchChatTask').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        ok: true,
        taskId: 'task_delayed',
        plan: {
          intent: 'pipeline',
          confidence: 0.88,
          reason: 'delayed mock',
        },
        action: 'started',
      };
    });

    const { app } = createApp();
    const start = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: {
        schema: '2.0',
        header: { event_type: 'im.message.receive_v1' },
        event: {
          message: {
            message_id: 'om_pipeline',
            chat_id: 'oc_pipeline',
            message_type: 'text',
            content: JSON.stringify({ text: '请帮我生成测试链路并跑 pipeline' }),
          },
        },
      },
    });
    const duration = Date.now() - start;

    expect(res.statusCode).toBe(200);
    expect(duration).toBeLessThan(180);

    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.result.kind).toBe('task-start');
    expect(payload.result.dispatch.intent).toBe('pipeline');
    expect(payload.result.dispatch.action).toBe('started');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts signed webhook events when encrypt key and verification token are configured', async () => {
    const feishuConfig: FeishuBridgeConfig = {
      webhookEncryptKey: 'webhook-encrypt-key',
      webhookVerificationToken: 'verification-token',
    };
    const { app, office } = createApp(feishuConfig);
    const payload = {
      schema: '2.0',
      header: { event_type: 'im.message.receive_v1', token: 'verification-token' },
      event: {
        sender: { sender_id: { open_id: 'ou_signed' } },
        message: {
          message_id: 'om_signed',
          chat_id: 'oc_signed',
          message_type: 'text',
          content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
        },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      headers: buildFeishuWebhookSignatureHeaders({
        encryptKey: feishuConfig.webhookEncryptKey!,
        body: payload,
      }),
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(office.listTasks(10)).toHaveLength(1);
  });

  it('rejects webhook events with an invalid verification token', async () => {
    const feishuConfig: FeishuBridgeConfig = {
      webhookVerificationToken: 'expected-token',
    };
    const { app } = createApp(feishuConfig);

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      payload: {
        schema: '2.0',
        header: { event_type: 'im.message.receive_v1', token: 'wrong-token' },
        event: {
          message: {
            message_id: 'om_bad_token',
            chat_id: 'oc_bad_token',
            message_type: 'text',
            content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
          },
        },
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      ok: false,
      error: 'Feishu webhook verification token mismatch',
    });
  });

  it('rejects webhook events with an invalid signature', async () => {
    const feishuConfig: FeishuBridgeConfig = {
      webhookEncryptKey: 'expected-encrypt-key',
    };
    const { app } = createApp(feishuConfig);
    const payload = {
      schema: '2.0',
      header: { event_type: 'im.message.receive_v1' },
      event: {
        message: {
          message_id: 'om_bad_sig',
          chat_id: 'oc_bad_sig',
          message_type: 'text',
          content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
        },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      headers: buildFeishuWebhookSignatureHeaders({
        encryptKey: 'wrong-encrypt-key',
        body: payload,
      }),
      payload,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      ok: false,
      error: 'Feishu webhook signature mismatch',
    });
  });

  it('rejects webhook events with an expired timestamp', async () => {
    const feishuConfig: FeishuBridgeConfig = {
      webhookEncryptKey: 'expected-encrypt-key',
      webhookMaxSkewSeconds: 60,
    };
    const { app } = createApp(feishuConfig);
    const payload = {
      schema: '2.0',
      header: { event_type: 'im.message.receive_v1' },
      event: {
        message: {
          message_id: 'om_stale_sig',
          chat_id: 'oc_stale_sig',
          message_type: 'text',
          content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
        },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      headers: buildFeishuWebhookSignatureHeaders({
        encryptKey: feishuConfig.webhookEncryptKey!,
        body: payload,
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      }),
      payload,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      ok: false,
      error: 'Feishu webhook timestamp is invalid or expired',
    });
  });

  it('decrypts encrypted webhook payloads before processing', async () => {
    const feishuConfig: FeishuBridgeConfig = {
      webhookEncryptKey: 'webhook-encrypt-key',
      webhookVerificationToken: 'verification-token',
    };
    const { app, office } = createApp(feishuConfig);
    const decryptedPayload = {
      schema: '2.0',
      header: { event_type: 'im.message.receive_v1', token: 'verification-token' },
      event: {
        sender: { sender_id: { open_id: 'ou_encrypted' } },
        message: {
          message_id: 'om_encrypted',
          chat_id: 'oc_encrypted',
          message_type: 'text',
          content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
        },
      },
    };
    const rawPayload = {
      encrypt: encryptFeishuWebhookPayload(feishuConfig.webhookEncryptKey!, decryptedPayload),
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/webhook',
      headers: buildFeishuWebhookSignatureHeaders({
        encryptKey: feishuConfig.webhookEncryptKey!,
        body: rawPayload,
      }),
      payload: rawPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(office.listTasks(10)).toHaveLength(1);
  });

  it('persists dedup state across app restarts within ttl', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'feishu-webhook-dedup-'));
    try {
      const storePath = join(tempDir, 'dedup.json');
      const storeA = new FileFeishuWebhookDedupStore(storePath);
      const firstApp = createApp({}, storeA);
      const payload = {
        schema: '2.0',
        header: { event_type: 'im.message.receive_v1', event_id: 'evt_persist_1' },
        event: {
          sender: { sender_id: { open_id: 'ou_persist' } },
          message: {
            message_id: 'om_persist_1',
            chat_id: 'oc_persist_1',
            message_type: 'text',
            content: JSON.stringify({ text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap' }),
          },
        },
      };

      const first = await firstApp.app.inject({
        method: 'POST',
        url: '/api/feishu/webhook',
        payload,
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().result.kind).toBe('task-start');

      const secondApp = createApp({}, new FileFeishuWebhookDedupStore(storePath));
      const second = await secondApp.app.inject({
        method: 'POST',
        url: '/api/feishu/webhook',
        payload,
      });

      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({
        ok: true,
        ignored: true,
      });
      expect(second.json().reason).toContain('Duplicate Feishu delivery ignored');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
