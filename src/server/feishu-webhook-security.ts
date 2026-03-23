import { createCipheriv, createHash, createDecipheriv, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FeishuBridgeConfig } from './feishu-bridge.js';

export const FEISHU_WEBHOOK_TIMESTAMP_HEADER = 'x-lark-request-timestamp';
export const FEISHU_WEBHOOK_NONCE_HEADER = 'x-lark-request-nonce';
export const FEISHU_WEBHOOK_SIGNATURE_HEADER = 'x-lark-signature';

interface BuildWebhookHeadersInput {
  encryptKey: string;
  body: unknown;
  timestamp?: number;
  nonce?: string;
}

interface EncryptedWebhookPayload {
  encrypt?: string;
  token?: string;
  type?: string;
}

function readHeader(headers: Record<string, unknown>, key: string): string | undefined {
  const raw = headers[key];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0].trim() : undefined;
  return undefined;
}

function parseTimestamp(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const numeric = Number.parseInt(raw, 10);
  if (!Number.isFinite(numeric)) return null;
  return raw.length <= 10 ? numeric * 1000 : numeric;
}

function parseSignature(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  if (!/^[a-f0-9]{64}$/i.test(raw)) return null;
  return Buffer.from(raw.toLowerCase(), 'hex');
}

function stringifyBody(body: unknown): string {
  return JSON.stringify(body ?? {});
}

function createWebhookSignature(encryptKey: string, timestamp: string, nonce: string, body: unknown): string {
  return createHash('sha256')
    .update(`${timestamp}${nonce}${encryptKey}${stringifyBody(body)}`)
    .digest('hex');
}

function decryptWebhookPayload(encryptKey: string, encrypted: string): unknown {
  const key = createHash('sha256').update(encryptKey).digest();
  const encryptedBuffer = Buffer.from(encrypted, 'base64');
  const iv = encryptedBuffer.subarray(0, 16);
  const cipherText = encryptedBuffer.subarray(16);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf-8');
  return JSON.parse(decrypted);
}

function extractVerificationToken(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const candidate = body as {
    token?: unknown;
    header?: { token?: unknown };
  };
  if (typeof candidate.header?.token === 'string' && candidate.header.token.trim()) {
    return candidate.header.token.trim();
  }
  if (typeof candidate.token === 'string' && candidate.token.trim()) {
    return candidate.token.trim();
  }
  return undefined;
}

export function buildFeishuWebhookSignatureHeaders(input: BuildWebhookHeadersInput): Record<string, string> {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce?.trim() || 'webhook-test-nonce';
  return {
    [FEISHU_WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    [FEISHU_WEBHOOK_NONCE_HEADER]: nonce,
    [FEISHU_WEBHOOK_SIGNATURE_HEADER]: createWebhookSignature(input.encryptKey, timestamp, nonce, input.body),
  };
}

export function encryptFeishuWebhookPayload(encryptKey: string, payload: unknown): string {
  const key = createHash('sha256').update(encryptKey).digest();
  const iv = Buffer.alloc(16, 7);
  const encryptor = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    encryptor.update(JSON.stringify(payload), 'utf-8'),
    encryptor.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

export function createFeishuWebhookSecurity(config: FeishuBridgeConfig) {
  const verificationToken = config.webhookVerificationToken?.trim();
  const encryptKey = config.webhookEncryptKey?.trim();
  const maxSkewMs = Math.max(1, config.webhookMaxSkewSeconds ?? 300) * 1000;

  function verifySignature(request: FastifyRequest, reply: FastifyReply, rawBody: unknown): boolean {
    if (!encryptKey) return true;

    const headers = request.headers as Record<string, unknown>;
    const timestamp = readHeader(headers, FEISHU_WEBHOOK_TIMESTAMP_HEADER);
    const nonce = readHeader(headers, FEISHU_WEBHOOK_NONCE_HEADER);
    const signature = readHeader(headers, FEISHU_WEBHOOK_SIGNATURE_HEADER);

    if (!timestamp || !nonce || !signature) {
      reply.code(401).send({ ok: false, error: 'Missing Feishu webhook signature headers' });
      return false;
    }

    const timestampMs = parseTimestamp(timestamp);
    if (timestampMs === null || Math.abs(Date.now() - timestampMs) > maxSkewMs) {
      reply.code(401).send({ ok: false, error: 'Feishu webhook timestamp is invalid or expired' });
      return false;
    }

    const expected = Buffer.from(createWebhookSignature(encryptKey, timestamp, nonce, rawBody), 'hex');
    const actual = parseSignature(signature);
    if (!actual || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      reply.code(401).send({ ok: false, error: 'Feishu webhook signature mismatch' });
      return false;
    }

    return true;
  }

  function parseBody(reply: FastifyReply, rawBody: unknown): unknown | undefined {
    if (!rawBody || typeof rawBody !== 'object') return rawBody;
    const payload = rawBody as EncryptedWebhookPayload;
    if (!payload.encrypt) return rawBody;
    if (!encryptKey) {
      reply.code(400).send({ ok: false, error: 'Encrypted Feishu webhook payload requires feishu.webhookEncryptKey' });
      return undefined;
    }

    try {
      return decryptWebhookPayload(encryptKey, payload.encrypt);
    } catch {
      reply.code(400).send({ ok: false, error: 'Failed to decrypt Feishu webhook payload' });
      return undefined;
    }
  }

  function verifyToken(reply: FastifyReply, body: unknown): boolean {
    if (!verificationToken) return true;
    const actual = extractVerificationToken(body);
    if (actual !== verificationToken) {
      reply.code(401).send({ ok: false, error: 'Feishu webhook verification token mismatch' });
      return false;
    }
    return true;
  }

  function resolveBody(request: FastifyRequest, reply: FastifyReply): unknown | undefined {
    if (!verifySignature(request, reply, request.body)) return undefined;
    const body = parseBody(reply, request.body);
    if (body === undefined) return undefined;
    if (!verifyToken(reply, body)) return undefined;
    return body;
  }

  return {
    isEnabled: Boolean(verificationToken || encryptKey),
    resolveBody,
  };
}
