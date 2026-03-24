import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { CrocOffice } from './croc-office.js';
import { FeishuProgressBridge, type FeishuBridgeConfig, type FeishuOutboundMessage } from './feishu-bridge.js';
import { registerFeishuRelayRoutes } from './feishu-relay.js';
import { buildFeishuRelayAuthHeaders } from './relay-auth.js';

function createApp(send: (message: FeishuOutboundMessage) => Promise<unknown>, feishuConfig: FeishuBridgeConfig = {}) {
  const app = Fastify();
  const office = new CrocOffice({ backendRoot: '.', feishu: feishuConfig }, process.cwd());
  const feishuBridge = new FeishuProgressBridge({ send }, { baseTaskUrl: 'http://localhost:3333', ...feishuConfig });
  office.setFeishuBridge(feishuBridge);
  registerFeishuRelayRoutes(app, office, feishuBridge, feishuConfig);
  return { app, office };
}

describe('registerFeishuRelayRoutes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands complex relayed messages to local task flow and returns handled=true', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app, office } = createApp(send);

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      payload: {
        chatId: 'oc_relay_1',
        requestId: 'om_relay_1',
        text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(send.mock.calls[0]?.[0].kind).toBe('task-ack');

    const payload = res.json();
    expect(payload).toMatchObject({
      ok: true,
      handled: true,
    });
    expect(payload.taskId).toBeTruthy();
    expect(payload.dispatch.intent).toBe('analysis');
    expect(payload.dispatch.action).toBe('started');

    const task = office.getTask(payload.taskId);
    expect(task?.kind).toBe('chat');
    expect(task).toBeTruthy();
  });

  it('starts a progress-only task when OpenClaw keeps ownership of the final answer', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app, office } = createApp(send);

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      payload: {
        chatId: 'oc_relay_3',
        requestId: 'om_relay_3',
        text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
        finalAnswerSource: 'openclaw',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(send.mock.calls[0]?.[0].kind).toBe('task-ack');
    expect(send.mock.calls.some((call) => call[0].kind === 'task-complete' && call[0].presentation === 'text')).toBe(false);

    const payload = res.json();
    expect(payload).toMatchObject({
      ok: true,
      handled: false,
      trackFinal: true,
    });
    expect(payload.taskId).toBeTruthy();

    const task = office.getTask(payload.taskId);
    expect(task?.status).toBe('running');
    expect(task?.currentStageKey).toBe('understand');
  });

  it('accepts OpenClaw relay events and completes the task without sending a duplicate final reply', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: `om_${send.mock.calls.length + 1}` }));
    const { app, office } = createApp(send);

    const start = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      payload: {
        chatId: 'oc_relay_4',
        requestId: 'om_relay_4',
        text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
        finalAnswerSource: 'openclaw',
      },
    });

    const taskId = start.json().taskId as string;

    const progress = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay/event',
      payload: {
        taskId,
        type: 'progress',
        stageKey: 'generate',
        detail: 'OpenClaw 正在组织回答内容',
        progress: 82,
      },
    });

    expect(progress.statusCode).toBe(200);

    const done = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay/event',
      payload: {
        taskId,
        type: 'done',
        detail: 'OpenClaw 已发送最终答案',
        summary: '原始最终答案',
      },
    });

    expect(done.statusCode).toBe(200);
    const task = office.getTask(taskId);
    expect(task?.status).toBe('done');
    expect(task?.summary).toBe('原始最终答案');
    expect(send.mock.calls.some((call) => call[0].kind === 'task-complete' && call[0].presentation === 'text')).toBe(false);
  });

  it('accepts OpenClaw relay decision events and resumes a waiting task', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: `om_${send.mock.calls.length + 1}` }));
    const { app, office } = createApp(send);
    const task = office.createChatTask('Relay decision task');

    office.bindTaskToFeishu(task.id, {
      chatId: 'oc_relay_decision_1',
      requestId: 'om_relay_decision_1',
      replyToMessageId: 'om_relay_decision_1',
      rootMessageId: 'om_relay_decision_1',
      source: 'feishu',
    });
    office.activateTask(task.id);
    await office.markTaskRunningAndWait('receive', 'Task accepted from OpenClaw relay', 8);
    office.waitOnTask('real smoke decision', 'Smoke waiting: please click one of the buttons in Feishu', 68, {
      prompt: '真实 smoke：请选择下一步',
      options: [
        { id: 'continue', label: '继续执行' },
        { id: 'report', label: '只生成报告' },
      ],
    });
    office.activateTask(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay/event',
      payload: {
        taskId: task.id,
        type: 'decision',
        optionId: 'continue',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      alreadyResolved: false,
      decision: {
        optionId: 'continue',
        optionLabel: '继续执行',
      },
    });

    const updated = office.getTask(task.id);
    expect(updated?.status).toBe('running');
    expect(updated?.waitingFor).toBeUndefined();
    expect(updated?.decision).toBeUndefined();
    expect(updated?.events.at(-1)?.message).toContain('Decision received: 继续执行');
  });

  it('returns 502 when the relayed request cannot send the first Feishu ack', async () => {
    const send = vi.fn(async (message: FeishuOutboundMessage) => {
      throw new Error(`delivery failed for ${message.kind}`);
    });
    const { app, office } = createApp(send);

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      payload: {
        chatId: 'oc_relay_2',
        requestId: 'om_relay_2',
        text: '请帮我设计 OpenCroc 的本地 relay 架构',
      },
    });

    expect(res.statusCode).toBe(502);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].kind).toBe('task-ack');

    const payload = res.json();
    expect(payload).toMatchObject({
      ok: false,
      handled: false,
      error: 'Failed to send initial Feishu ACK',
      detail: 'delivery failed for task-ack',
    });

    const task = office.getTask(payload.taskId);
    expect(task?.status).toBe('failed');
    expect(task?.currentStageKey).toBe('receive');
  });

  it('requires relay auth headers when relaySecret is configured', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app } = createApp(send, { relaySecret: 'relay-secret' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      payload: {
        chatId: 'oc_relay_auth_1',
        requestId: 'om_relay_auth_1',
        text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      ok: false,
      error: 'Missing relay auth headers',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('accepts signed relay requests when relaySecret is configured', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app, office } = createApp(send, { relaySecret: 'relay-secret' });
    const payload = {
      chatId: 'oc_relay_auth_2',
      requestId: 'om_relay_auth_2',
      text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      headers: buildFeishuRelayAuthHeaders({
        secret: 'relay-secret',
        method: 'POST',
        path: '/api/feishu/relay',
        body: payload,
      }),
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalled();
    const json = res.json();
    expect(json.ok).toBe(true);
    expect(office.getTask(json.taskId)).toBeTruthy();
  });

  it('rejects relay requests with an invalid signature', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app } = createApp(send, { relaySecret: 'relay-secret' });
    const payload = {
      chatId: 'oc_relay_auth_3',
      requestId: 'om_relay_auth_3',
      text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
    };
    const headers = buildFeishuRelayAuthHeaders({
      secret: 'wrong-secret',
      method: 'POST',
      path: '/api/feishu/relay',
      body: payload,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      headers,
      payload,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      ok: false,
      error: 'Relay request signature mismatch',
    });
  });

  it('rejects relay requests with an expired timestamp', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app } = createApp(send, { relaySecret: 'relay-secret', relayMaxSkewSeconds: 60 });
    const payload = {
      chatId: 'oc_relay_auth_4',
      requestId: 'om_relay_auth_4',
      text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      headers: buildFeishuRelayAuthHeaders({
        secret: 'relay-secret',
        method: 'POST',
        path: '/api/feishu/relay',
        body: payload,
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      }),
      payload,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      ok: false,
      error: 'Relay request timestamp is invalid or expired',
    });
  });

  it('rejects replayed relay requests with the same timestamp and nonce', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app } = createApp(send, { relaySecret: 'relay-secret' });
    const payload = {
      chatId: 'oc_relay_auth_5',
      requestId: 'om_relay_auth_5',
      text: '帮我分析 OpenCroc 的平台定位和下一步 roadmap',
    };
    const headers = buildFeishuRelayAuthHeaders({
      secret: 'relay-secret',
      method: 'POST',
      path: '/api/feishu/relay',
      body: payload,
      nonce: 'fixed-nonce',
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      headers,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay',
      headers,
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      ok: false,
      error: 'Relay request replay detected',
    });
  });

  it('enforces relay auth on relay event updates too', async () => {
    const send = vi.fn(async (_message: FeishuOutboundMessage) => ({ messageId: 'om_ack_1' }));
    const { app } = createApp(send, { relaySecret: 'relay-secret' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/relay/event',
      payload: {
        taskId: 'task_missing_headers',
        type: 'failed',
        detail: 'OpenClaw 处理失败',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      ok: false,
      error: 'Missing relay auth headers',
    });
  });
});
