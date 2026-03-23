import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from './croc-office.js';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerFeishuSmokeRoutes(app: FastifyInstance, office: CrocOffice): void {
  app.post<{
    Body: {
      chatId: string;
      requestId?: string;
      title?: string;
      mode?: 'text' | 'card';
      outcome?: 'done' | 'failed';
      failureMessage?: string;
    };
  }>('/api/feishu/smoke/progress', async (req, reply) => {
    const title = req.body.title || 'Feishu progress smoke test';
    const outcome = req.body.outcome === 'failed' ? 'failed' : 'done';
    const failureMessage = req.body.failureMessage || 'Smoke progress flow failed after staged updates';
    const task = office.createChatTask(title, title);

    office.bindTaskToFeishu(task.id, {
      chatId: req.body.chatId,
      requestId: req.body.requestId,
      replyToMessageId: req.body.requestId,
      rootMessageId: req.body.requestId,
      source: 'feishu',
    });

    office.activateTask(task.id);
    try {
      await office.markTaskRunningAndWait('receive', 'Smoke task accepted', 8);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      office.unbindTaskFromFeishu(task.id);
      office.failTask(`Failed to send initial Feishu ACK: ${detail}`);
      office.activateTask(null);
      return reply.code(502).send({
        ok: false,
        taskId: task.id,
        error: 'Failed to send initial Feishu ACK',
        detail,
      });
    }

    void (async () => {
      try {
        await wait(1200);
        office.markTaskRunning('understand', 'Verifying Feishu delivery path', 22);
        await wait(1200);
        office.markTaskRunning('gather', 'Sending staged progress updates', 48);
        await wait(1200);
        office.markTaskRunning('generate', 'Preparing final confirmation', 76);
        await wait(1200);
        office.markTaskRunning('finalize', 'Closing smoke task and flushing final update', 92);
        await wait(1200);
        if (outcome === 'failed') {
          office.failTask(failureMessage);
          return;
        }
        office.finishTask('Smoke progress flow completed successfully');
      } finally {
        office.activateTask(null);
      }
    })().catch((error) => {
      office.activateTask(task.id);
      office.failTask(error instanceof Error ? error.message : String(error));
      office.activateTask(null);
    });

    return {
      ok: true,
      taskId: task.id,
      message: outcome === 'failed'
        ? 'Feishu smoke progress failure task started'
        : 'Feishu smoke progress task started',
    };
  });
}
