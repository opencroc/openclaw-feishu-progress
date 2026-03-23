import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { CrocOffice } from '../croc-office.js';
import { FeishuProgressBridge } from '../feishu-bridge.js';
import { registerAgentRoutes } from './agents.js';

function createApp(withBridge = true) {
  const app = Fastify();
  const office = new CrocOffice({ backendRoot: '.', feishu: {} }, process.cwd());
  const feishuBridge = withBridge
    ? new FeishuProgressBridge({ send: async () => ({ messageId: 'om_ack_1' }) }, { baseTaskUrl: 'http://localhost:3333' })
    : null;
  office.setFeishuBridge(feishuBridge);
  registerAgentRoutes(app, office, feishuBridge);
  return { app, office };
}

describe('registerAgentRoutes', () => {
  it('submits a waiting decision and resumes the task', async () => {
    const { app, office } = createApp();
    const task = office.createChatTask('Decision task');

    office.activateTask(task.id);
    office.markTaskRunning('receive', 'Task accepted', 10);
    office.waitOnTask('product direction', 'Need a direction choice', 42, {
      prompt: 'Choose a path',
      options: [
        { id: 'continue', label: '继续执行' },
        { id: 'report', label: '只生成报告' },
      ],
    });
    office.activateTask(null);

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/decision`,
      payload: {
        optionId: 'continue',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
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

  it('rejects invalid decision options', async () => {
    const { app, office } = createApp();
    const task = office.createChatTask('Decision task');

    office.activateTask(task.id);
    office.waitOnTask('product direction', 'Need a direction choice', 42, {
      prompt: 'Choose a path',
      options: [{ id: 'continue', label: '继续执行' }],
    });
    office.activateTask(null);

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/decision`,
      payload: {
        optionId: 'stop',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Invalid decision option' });
  });

  it('rejects free-text-only submissions when the prompt does not allow them', async () => {
    const { app, office } = createApp();
    const task = office.createChatTask('Decision task');

    office.activateTask(task.id);
    office.waitOnTask('product direction', 'Need a direction choice', 42, {
      prompt: 'Choose a path',
      options: [{ id: 'continue', label: '继续执行' }],
      allowFreeText: false,
    });
    office.activateTask(null);

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/decision`,
      payload: {
        freeText: '我想先讨论一下',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'This decision does not allow free text only submissions' });
  });

  it('returns 503 for Feishu task ack routes when bridge is missing', async () => {
    const { app } = createApp(false);

    const res = await app.inject({
      method: 'POST',
      url: '/api/feishu/tasks/ack',
      payload: {
        taskId: 'task_missing',
        chatId: 'oc_123',
      },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'Feishu bridge is not configured' });
  });
});
