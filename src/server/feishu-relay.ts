import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from './croc-office.js';
import type { FeishuProgressBridge } from './feishu-bridge.js';
import { isComplexRequest, startComplexFeishuChatTask } from './feishu-task-start.js';

interface FeishuRelayBody {
  chatId?: string;
  text?: string;
  requestId?: string;
  messageId?: string;
  threadId?: string;
  replyToMessageId?: string;
  rootMessageId?: string;
  senderId?: string;
  senderName?: string;
  finalAnswerSource?: 'opencroc' | 'openclaw';
}

interface FeishuRelayEventBody {
  taskId?: string;
  type?: 'progress' | 'done' | 'failed';
  stageKey?: 'receive' | 'understand' | 'gather' | 'generate' | 'finalize';
  detail?: string;
  progress?: number;
  summary?: string;
}

export function registerFeishuRelayRoutes(app: FastifyInstance, office: CrocOffice, feishuBridge: FeishuProgressBridge): void {
  app.post<{ Body: FeishuRelayBody }>('/api/feishu/relay', async (req, reply) => {
    const chatId = req.body.chatId?.trim();
    const text = req.body.text?.trim() || '';
    const requestId = req.body.requestId?.trim() || req.body.messageId?.trim();
    const replyToMessageId = req.body.replyToMessageId?.trim() || requestId;
    const rootMessageId = req.body.rootMessageId?.trim() || requestId;
    const finalAnswerSource = req.body.finalAnswerSource === 'openclaw' ? 'openclaw' : 'opencroc';

    if (!chatId) {
      return reply.code(400).send({
        ok: false,
        handled: false,
        error: 'chatId is required',
      });
    }

    if (!isComplexRequest(text)) {
      return {
        ok: true,
        handled: false,
        reason: 'Message does not look like a complex request that should enter task mode.',
      };
    }

    const outcome = await startComplexFeishuChatTask(office, feishuBridge, {
      text,
      chatId,
      threadId: req.body.threadId?.trim(),
      requestId,
      replyToMessageId,
      rootMessageId,
      receiveDetail: 'Task accepted from OpenClaw relay',
      understandDetail: 'Understanding relayed OpenClaw request context',
      autoDispatch: finalAnswerSource !== 'openclaw',
      suppressFinalSummary: finalAnswerSource === 'openclaw',
    });

    if (!outcome.ok) {
      return reply.code(502).send({
        ok: false,
        handled: false,
        taskId: outcome.taskId,
        error: outcome.error,
        detail: outcome.detail,
      });
    }

    return {
      ok: true,
      handled: finalAnswerSource !== 'openclaw',
      taskId: outcome.result.taskId,
      trackFinal: finalAnswerSource === 'openclaw',
      dispatch: outcome.result.dispatch,
      suggestedExecution: outcome.result.suggestedExecution,
    };
  });

  app.post<{ Body: FeishuRelayEventBody }>('/api/feishu/relay/event', async (req, reply) => {
    const taskId = req.body.taskId?.trim();
    if (!taskId) {
      return reply.code(400).send({ ok: false, error: 'taskId is required' });
    }

    const task = office.getTask(taskId);
    if (!task) {
      return reply.code(404).send({ ok: false, error: 'Task not found' });
    }

    const type = req.body.type;
    if (type === 'progress') {
      const stageKey = req.body.stageKey;
      if (!stageKey) {
        return reply.code(400).send({ ok: false, error: 'stageKey is required for progress updates' });
      }
      const detail = req.body.detail?.trim() || 'OpenClaw is processing the request';
      const progress = typeof req.body.progress === 'number' ? req.body.progress : task.progress;
      const updated = await office.relayTaskProgress(taskId, stageKey, detail, progress, true);
      return { ok: true, task: updated };
    }

    if (type === 'done') {
      const detail = req.body.detail?.trim() || 'OpenClaw 已发送最终答案';
      await office.relayTaskProgress(taskId, 'finalize', detail, 96, true);
      const updated = await office.relayTaskDone(taskId, req.body.summary?.trim() || detail, true);
      return { ok: true, task: updated };
    }

    if (type === 'failed') {
      const detail = req.body.detail?.trim() || 'OpenClaw 处理失败';
      const updated = await office.relayTaskFailed(taskId, detail, true);
      return { ok: true, task: updated };
    }

    return reply.code(400).send({ ok: false, error: 'Unsupported relay event type' });
  });
}
