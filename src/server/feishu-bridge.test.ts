import { describe, expect, it } from 'vitest';
import { FeishuProgressBridge, type FeishuOutboundMessage, type FeishuTaskRequest } from './feishu-bridge.js';
import type { TaskRecord } from './task-store.js';

function makeTask(partial: Partial<TaskRecord>): TaskRecord {
  return {
    id: 'task_123',
    kind: 'pipeline',
    title: 'Run source-aware pipeline',
    status: 'running',
    progress: 10,
    currentStageKey: 'scan',
    stages: [
      { key: 'receive', label: 'Receive task', status: 'done' },
      { key: 'scan', label: 'Scan codebase', status: 'running', detail: 'Scanning modules' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [{ type: 'created', message: 'Task created', time: Date.now() }],
    ...partial,
  };
}

describe('FeishuProgressBridge', () => {
  it('creates and sends request ack with taskId before execution updates', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); } }, { baseTaskUrl: 'https://demo.opencroc.ai' });
    const request: FeishuTaskRequest = {
      title: 'Analyze repository and report progress',
      target: { chatId: 'chat_123', source: 'feishu' },
      stage: 'Receive task',
      detail: 'Task accepted from Feishu',
    };

    const ack = await bridge.sendRequestAck('task_early_ack', request);

    expect(ack.ok).toBe(true);
    expect(ack.taskId).toBe('task_early_ack');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('task-ack');
    expect(sent[0]?.text).toContain('已收到复杂请求');
    expect(sent[0]?.text).toContain('taskId：task_early_ack');
    expect(sent[0]?.link).toBe('https://demo.opencroc.ai/tasks/task_early_ack');
  });

  it('sends ack on first task update', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); } }, { baseTaskUrl: 'https://demo.opencroc.ai' });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu' });

    await bridge.handleTaskUpdate(makeTask({ progress: 12 }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('task-ack');
    expect(sent[0]?.text).toContain('任务已开始');
    expect(sent[0]?.link).toBe('https://demo.opencroc.ai/tasks/task_123');
  });

  it('throttles low-signal log updates', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); } }, { progressThrottlePercent: 20 });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu' });

    await bridge.handleTaskUpdate(makeTask({ progress: 10 }));
    await bridge.handleTaskUpdate(makeTask({
      progress: 15,
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'log', message: 'Minor log update', time: Date.now() },
      ],
    }));

    expect(sent).toHaveLength(1);
  });

  it('sends completion update when task is done', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); } });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu' });

    await bridge.handleTaskUpdate(makeTask({ progress: 10 }));
    await bridge.handleTaskUpdate(makeTask({
      status: 'done',
      progress: 100,
      summary: 'Pipeline complete',
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'done', message: 'Pipeline complete', time: Date.now() },
      ],
    }));

    expect(sent).toHaveLength(2);
    expect(sent[1]?.kind).toBe('task-complete');
    expect(sent[1]?.text).toContain('任务已完成');
  });
});
