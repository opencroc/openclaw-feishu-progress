import { describe, expect, it, vi } from 'vitest';
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
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); return { messageId: 'om_ack_1' }; } }, { baseTaskUrl: 'https://demo.opencroc.ai' });
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
    expect(bridge.getTaskBinding('task_early_ack')?.firstMessageId).toBe('om_ack_1');
  });

  it('sends ack on first task update', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); return { messageId: `om_${sent.length}` }; } }, { baseTaskUrl: 'https://demo.opencroc.ai' });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu' });

    await bridge.handleTaskUpdate(makeTask({ progress: 12 }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('task-ack');
    expect(sent[0]?.text).toContain('任务已开始');
    expect(sent[0]?.link).toBe('https://demo.opencroc.ai/tasks/task_123');
    expect(bridge.getTaskBinding('task_123')?.firstMessageId).toBe('om_1');
    expect(bridge.getTaskBinding('task_123')?.lastMessageId).toBe('om_1');
  });

  it('does not deliver the pre-bind queued task snapshot after a later bind', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({
      send: async (message) => {
        sent.push(message);
        return { messageId: `om_${sent.length}` };
      },
    });

    const queuedUpdate = bridge.handleTaskUpdate(makeTask({
      status: 'queued',
      progress: 0,
      currentStageKey: undefined,
      stages: [
        { key: 'receive', label: 'Receive task', status: 'pending' },
        { key: 'scan', label: 'Scan codebase', status: 'pending' },
      ],
      events: [{ type: 'created', message: 'Task created', time: Date.now() }],
    }));

    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu' });
    await queuedUpdate;

    expect(sent).toHaveLength(0);

    await bridge.handleTaskUpdate(makeTask({
      progress: 8,
      currentStageKey: 'receive',
      stages: [
        { key: 'receive', label: 'Receive task', status: 'running', detail: 'Task accepted' },
        { key: 'scan', label: 'Scan codebase', status: 'pending' },
      ],
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'progress', message: 'Task accepted', progress: 8, stageKey: 'receive', time: Date.now() },
      ],
    }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('task-ack');
    expect(sent[0]?.progress).toBe(8);
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

  it('sends waiting update with decision options', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); return { messageId: `om_${sent.length}` }; } });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu', requestId: 'om_user_1', replyToMessageId: 'om_user_1', rootMessageId: 'om_user_1' });

    await bridge.handleTaskUpdate(makeTask({ progress: 10 }));
    await bridge.handleTaskUpdate(makeTask({
      status: 'waiting',
      progress: 68,
      waitingFor: 'product direction decision',
      decision: {
        prompt: '请选择接下来的方向',
        options: [
          { id: '1', label: '继续按 A 展开' },
          { id: '2', label: '继续按 B 展开' },
        ],
      },
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'waiting', message: 'Need product direction decision', time: Date.now() },
      ],
    }));

    expect(sent).toHaveLength(2);
    expect(sent[1]?.kind).toBe('task-waiting');
    expect(sent[1]?.decision?.options).toHaveLength(2);
    expect(sent[1]?.text).toContain('请选择接下来的方向');
    expect(sent[0]?.target.replyToMessageId).toBe('om_user_1');
    expect(sent[1]?.target.replyToMessageId).toBe('om_1');
    expect(sent[1]?.target.rootMessageId).toBe('om_user_1');
  });

  it('creates cards for ack/waiting/complete in card mode', async () => {
    const sent: FeishuOutboundMessage[] = [];
    const bridge = new FeishuProgressBridge({ send: async (message) => { sent.push(message); return { messageId: `om_${sent.length}` }; } }, { messageFormat: 'card', baseTaskUrl: 'https://demo.opencroc.ai' });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu', requestId: 'om_user_1', replyToMessageId: 'om_user_1', rootMessageId: 'om_user_1' });

    await bridge.handleTaskUpdate(makeTask({ progress: 10 }));
    await bridge.handleTaskUpdate(makeTask({
      status: 'waiting',
      progress: 66,
      waitingFor: 'direction choice',
      decision: {
        prompt: '请选择下一步',
        options: [{ id: '1', label: '继续分析' }],
      },
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'waiting', message: 'Need user decision', time: Date.now() },
      ],
    }));
    await bridge.handleTaskUpdate(makeTask({
      status: 'done',
      progress: 100,
      summary: 'Done summary',
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'done', message: 'Task done', time: Date.now() },
      ],
    }));

    expect(sent[0]?.card).toBeDefined();
    expect(sent[1]?.card).toBeDefined();
    expect(sent[2]?.card).toBeDefined();
    expect((sent[0]?.card as any).header.title.content).toContain('任务已开始');
    expect((sent[1]?.card as any).header.title.content).toContain('任务等待确认');
    expect((sent[2]?.card as any).header.title.content).toContain('任务已完成');
    expect((sent[0]?.card as any).body.elements.some((element: any) => element.tag === 'button')).toBe(true);
    const decisionButton = (sent[1]?.card as any).body.elements.find((element: any) => element.behaviors?.[0]?.type === 'callback');
    expect(decisionButton).toBeDefined();
    expect(decisionButton.behaviors[0].value).toEqual({
      kind: 'task-decision',
      taskId: 'task_123',
      optionId: '1',
      optionLabel: '继续分析',
    });
    expect((sent[1]?.card as any).body.elements.some((element: any) => String(element.text?.content || '').includes('如果飞书按钮无响应'))).toBe(true);
    expect((sent[1]?.card as any).body.elements.some((element: any) => {
      const behavior = element.behaviors?.[0];
      return behavior?.type === 'open_url' && behavior?.default_url === 'https://demo.opencroc.ai/tasks/task_123';
    })).toBe(true);
    expect((sent[2]?.card as any).body.elements.some((element: any) => String(element.text?.content || '').includes('结果摘要'))).toBe(true);
  });

  it('updates the same card for progress in card-live mode', async () => {
    const send = vi.fn(async (message: FeishuOutboundMessage) => {
      expect(message.card).toBeDefined();
      return { messageId: 'om_live_card_1', rootId: 'om_live_card_1' };
    });
    const update = vi.fn(async () => ({ messageId: 'om_live_card_1', rootId: 'om_live_card_1' }));
    const bridge = new FeishuProgressBridge({ send, update }, { messageFormat: 'card-live', finalSummaryMode: 'none', baseTaskUrl: 'https://demo.opencroc.ai' });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu', requestId: 'om_user_1', replyToMessageId: 'om_user_1', rootMessageId: 'om_user_1' });

    await bridge.handleTaskUpdate(makeTask({ progress: 10 }));
    await bridge.handleTaskUpdate(makeTask({
      progress: 30,
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'progress', message: 'Gathering context', progress: 30, stageKey: 'scan', time: Date.now() },
      ],
    }));

    expect(send).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].kind).toBe('task-ack');
    expect(send.mock.calls[0]?.[0].card).toBeDefined();
    expect(update.mock.calls[0]?.[1].kind).toBe('task-progress');
    expect(update.mock.calls[0]?.[1].card).toBeDefined();
    expect((update.mock.calls[0]?.[1].card as any).header.title.content).toContain('任务进度更新');
    expect((send.mock.calls[0]?.[0].card as any).body.elements.some((element: any) => element.tag === 'button')).toBe(true);
  });

  it('can send one extra completion summary after the live card is updated', async () => {
    const send = vi.fn(async (message: FeishuOutboundMessage) => ({ messageId: `om_${send.mock.calls.length + 1}`, rootId: 'om_live_card_1' }));
    const update = vi.fn(async () => ({ messageId: 'om_live_card_1', rootId: 'om_live_card_1' }));
    const bridge = new FeishuProgressBridge({ send, update }, { messageFormat: 'card-live', finalSummaryMode: 'complete', baseTaskUrl: 'https://demo.opencroc.ai' });
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

    expect(send).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].kind).toBe('task-ack');
    expect(send.mock.calls[1]?.[0].kind).toBe('task-complete');
    expect(send.mock.calls[1]?.[0].card).toBeUndefined();
    expect(send.mock.calls[1]?.[0].presentation).toBe('text');
    expect(send.mock.calls[1]?.[0].text).toContain('Pipeline complete');
    expect(update.mock.calls[0]?.[1].kind).toBe('task-complete');
    expect(update.mock.calls[0]?.[1].card).toBeDefined();
    expect(update.mock.calls[0]?.[1].detail).toBe('任务已完成，最终答案已单独发送');
    expect((update.mock.calls[0]?.[1].card as any).body.elements.some((element: any) => String(element.text?.content || '').includes('结果摘要'))).toBe(false);
    expect(JSON.stringify(update.mock.calls[0]?.[1].card)).not.toContain('Pipeline complete');
  });

  it('sends one extra failure summary after the live card is updated', async () => {
    const send = vi.fn(async (message: FeishuOutboundMessage) => ({ messageId: `om_${send.mock.calls.length + 1}`, rootId: 'om_live_card_1' }));
    const update = vi.fn(async () => ({ messageId: 'om_live_card_1', rootId: 'om_live_card_1' }));
    const bridge = new FeishuProgressBridge({ send, update }, { messageFormat: 'card-live', finalSummaryMode: 'failed', baseTaskUrl: 'https://demo.opencroc.ai' });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu' });

    await bridge.handleTaskUpdate(makeTask({ progress: 10 }));
    await bridge.handleTaskUpdate(makeTask({
      status: 'failed',
      progress: 90,
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'failed', message: 'Pipeline failed because of bad config', level: 'error', time: Date.now() },
      ],
    }));

    expect(send).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[1]?.[0].kind).toBe('task-failed');
    expect(send.mock.calls[1]?.[0].card).toBeUndefined();
    expect(send.mock.calls[1]?.[0].presentation).toBe('text');
    expect(send.mock.calls[1]?.[0].text).toContain('Pipeline failed because of bad config');
    expect(update.mock.calls[0]?.[1].kind).toBe('task-failed');
    expect(update.mock.calls[0]?.[1].detail).toBe('任务执行失败，错误摘要已单独发送');
    expect((update.mock.calls[0]?.[1].card as any).body.elements.some((element: any) => String(element.text?.content || '').includes('结果摘要'))).toBe(false);
    expect(JSON.stringify(update.mock.calls[0]?.[1].card)).not.toContain('Pipeline failed because of bad config');
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

  it('serializes progress delivery for the same task', async () => {
    vi.useFakeTimers();
    const sent: Array<{ kind: string; progress: number }> = [];
    const bridge = new FeishuProgressBridge({
      send: async (message) => {
        const delay = message.progress === 10 ? 30 : message.progress === 18 ? 20 : 10;
        await new Promise((resolve) => setTimeout(resolve, delay));
        sent.push({ kind: message.kind, progress: message.progress });
        return { messageId: `om_${sent.length + 1}` };
      },
    });
    bridge.bindTask('task_123', { chatId: 'chat_123', source: 'feishu' });

    const first = bridge.handleTaskUpdate(makeTask({ progress: 10 }));
    const second = bridge.handleTaskUpdate(makeTask({
      progress: 18,
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'progress', message: 'Classified request', progress: 18, stageKey: 'scan', time: Date.now() },
      ],
    }));
    const third = bridge.handleTaskUpdate(makeTask({
      progress: 30,
      events: [
        { type: 'created', message: 'Task created', time: Date.now() },
        { type: 'progress', message: 'Gathering context', progress: 30, stageKey: 'scan', time: Date.now() },
      ],
    }));

    await vi.runAllTimersAsync();
    await Promise.all([first, second, third]);

    expect(sent).toEqual([
      { kind: 'task-ack', progress: 10 },
      { kind: 'task-progress', progress: 18 },
      { kind: 'task-progress', progress: 30 },
    ]);
    vi.useRealTimers();
  });
});
