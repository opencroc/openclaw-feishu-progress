import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { CrocOffice } from './croc-office.js';
import { FeishuProgressBridge, type FeishuOutboundMessage } from './feishu-bridge.js';
import { registerFeishuRelayRoutes } from './feishu-relay.js';

function createApp(send: (message: FeishuOutboundMessage) => Promise<unknown>) {
  const app = Fastify();
  const office = new CrocOffice({ backendRoot: '.', feishu: {} }, process.cwd());
  const feishuBridge = new FeishuProgressBridge({ send }, { baseTaskUrl: 'http://localhost:3333' });
  office.setFeishuBridge(feishuBridge);
  registerFeishuRelayRoutes(app, office, feishuBridge);
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
});
