export interface FeishuTopicKeyInput {
  chatId: string;
  threadId?: string;
  rootMessageId?: string;
  requestId?: string;
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Compute a deterministic topic id for a Feishu conversation.
 *
 * Start strategy: strict-by-thread.
 * - Prefer `threadId` (if provided by upstream relay).
 * - Otherwise fall back to `rootMessageId` (Feishu `root_id`).
 * - Otherwise use `requestId` as a last resort (safe but granular).
 */
export function computeFeishuTopicId(input: FeishuTopicKeyInput): string {
  const chatId = normalize(input.chatId) ?? 'unknown-chat';
  const threadKey =
    normalize(input.threadId)
    ?? normalize(input.rootMessageId)
    ?? normalize(input.requestId)
    ?? 'unknown-thread';

  return `topic:feishu:${chatId}:${threadKey}`;
}

