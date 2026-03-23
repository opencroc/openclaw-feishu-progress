export default {
  backendRoot: '.',
  feishu: {
    enabled: true,
    mode: 'live',
    messageFormat: 'card-live',
    finalSummaryMode: 'both',
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    tenantAccessToken: process.env.FEISHU_TENANT_ACCESS_TOKEN,
    baseTaskUrl: process.env.OPENCLAW_FEISHU_PROGRESS_BASE_TASK_URL
      ?? process.env.OPENCROC_BASE_TASK_URL
      ?? 'http://127.0.0.1:8765',
    webhookVerificationToken: process.env.FEISHU_WEBHOOK_VERIFICATION_TOKEN,
    webhookEncryptKey: process.env.FEISHU_WEBHOOK_ENCRYPT_KEY,
    webhookMaxSkewSeconds: Number(process.env.FEISHU_WEBHOOK_MAX_SKEW_SECONDS || 300),
    webhookDedupTtlSeconds: Number(process.env.FEISHU_WEBHOOK_DEDUP_TTL_SECONDS || 600),
    relaySecret: process.env.OPENCLAW_RELAY_SECRET,
    relayMaxSkewSeconds: Number(process.env.OPENCLAW_RELAY_MAX_SKEW_SECONDS || 300),
    relayNonceTtlSeconds: Number(process.env.OPENCLAW_RELAY_NONCE_TTL_SECONDS || 600),
    deliveryMaxRetries: Number(process.env.FEISHU_DELIVERY_MAX_RETRIES || 2),
    deliveryRetryBaseMs: Number(process.env.FEISHU_DELIVERY_RETRY_BASE_MS || 300),
    deliveryRetryMaxMs: Number(process.env.FEISHU_DELIVERY_RETRY_MAX_MS || 5000),
    progressThrottlePercent: Number(process.env.FEISHU_PROGRESS_THROTTLE_PERCENT || 10),
  },
};
