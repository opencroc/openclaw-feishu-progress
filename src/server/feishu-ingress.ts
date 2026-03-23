import type { FastifyInstance } from 'fastify';
import type { CrocOffice } from './croc-office.js';
import type { FeishuBridgeConfig, FeishuProgressBridge } from './feishu-bridge.js';
import type { FeishuWebhookDedupStore } from './feishu-webhook-dedup-store.js';
import {
  isComplexRequest,
  startComplexFeishuChatTask,
} from './feishu-task-start.js';
import { InMemoryFeishuWebhookDedupStore } from './feishu-webhook-dedup-store.js';
import { createFeishuWebhookSecurity } from './feishu-webhook-security.js';

interface FeishuChallengeBody {
  type?: string;
  challenge?: string;
  token?: string;
  encrypt?: string;
}

interface FeishuEventSender {
  sender_id?: { open_id?: string; union_id?: string; user_id?: string };
  sender_type?: string;
}

interface FeishuEventMessage {
  message_id?: string;
  chat_id?: string;
  message_type?: string;
  content?: string;
}

interface FeishuEventBody {
  type?: string;
  token?: string;
  encrypt?: string;
  header?: {
    event_type?: string;
    event_id?: string;
    create_time?: string;
    token?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event?: {
    sender?: FeishuEventSender;
    message?: FeishuEventMessage;
  };
}

interface DuplicateResult {
  ok: true;
  ignored: true;
  reason: string;
}

interface PassThroughResult {
  kind: 'pass-through';
  reason: string;
}

interface RegisterFeishuIngressOptions {
  config?: FeishuBridgeConfig;
  dedupStore?: FeishuWebhookDedupStore;
}

function parseTextContent(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.text === 'string') return parsed.text.trim();
  } catch {
    return raw.trim();
  }
  return '';
}

function createDedupKey(body: FeishuEventBody): string | undefined {
  const eventId = body.header?.event_id?.trim();
  if (eventId) return `event:${eventId}`;

  const messageId = body.event?.message?.message_id?.trim();
  if (messageId) return `message:${messageId}`;

  return undefined;
}

export function registerFeishuIngressRoutes(
  app: FastifyInstance,
  office: CrocOffice,
  feishuBridge: FeishuProgressBridge,
  options: RegisterFeishuIngressOptions = {},
): void {
  const dedupStore = options.dedupStore ?? new InMemoryFeishuWebhookDedupStore();
  const dedupTtlMs = Math.max(1, options.config?.webhookDedupTtlSeconds ?? 600) * 1000;
  const webhookSecurity = createFeishuWebhookSecurity(options.config ?? {});

  app.post<{ Body: FeishuChallengeBody | FeishuEventBody }>('/api/feishu/webhook', async (req, reply) => {
    const body = webhookSecurity.resolveBody(req, reply) as FeishuChallengeBody | FeishuEventBody | undefined;
    if (!body) return;

    console.log('[feishu:webhook]', JSON.stringify({
      type: body?.type,
      eventType: 'header' in body ? body.header?.event_type : undefined,
      eventId: 'header' in body ? body.header?.event_id : undefined,
      chatId: 'event' in body ? body.event?.message?.chat_id : undefined,
      messageId: 'event' in body ? body.event?.message?.message_id : undefined,
      senderOpenId: 'event' in body ? body.event?.sender?.sender_id?.open_id : undefined,
    }));

    if (body?.type === 'url_verification' && 'challenge' in body) {
      return { challenge: body.challenge };
    }

    const eventType = 'header' in body ? body.header?.event_type : undefined;
    if (eventType !== 'im.message.receive_v1') {
      return {
        ok: true,
        ignored: true,
        reason: `Unsupported event type: ${eventType || 'unknown'}`,
      };
    }

    const dedupKey = createDedupKey(body as FeishuEventBody);
    if (dedupKey) {
      const now = Date.now();
      if (dedupStore.has(dedupKey, now)) {
        const result: DuplicateResult = {
          ok: true,
          ignored: true,
          reason: `Duplicate Feishu delivery ignored: ${dedupKey}`,
        };
        return result;
      }
      dedupStore.remember(dedupKey, now + dedupTtlMs, now);
    }

    const event = (body as FeishuEventBody).event;
    const message = event?.message;
    const text = parseTextContent(message?.content);

    if (!isComplexRequest(text)) {
      const result: PassThroughResult = {
        kind: 'pass-through',
        reason: 'Message does not look like a complex request that should enter task mode.',
      };
      return { ok: true, result };
    }

    const outcome = await startComplexFeishuChatTask(office, feishuBridge, {
      text,
      chatId: message?.chat_id || 'unknown-chat',
      requestId: message?.message_id,
      replyToMessageId: message?.message_id,
      rootMessageId: message?.message_id,
      receiveDetail: 'Task accepted from Feishu webhook',
      understandDetail: 'Understanding request context',
    });

    if (!outcome.ok) {
      return reply.code(502).send({
        ok: false,
        taskId: outcome.taskId,
        error: outcome.error,
        detail: outcome.detail,
      });
    }

    return { ok: true, result: outcome.result };
  });
}
