# Feishu 鉴权与部署

这份文档把 OpenClaw Feishu Progress 的飞书鉴权、OpenClaw relay 鉴权、部署方式和上线验收串成一条完整路径。目标不是列概念，而是让你按步骤配完以后，能稳定跑通 `ACK -> progress -> done/failed`。

## 先记住这三个原则

- `.env` 只是给 `openclaw-feishu-progress.config.*` 或 `opencroc.config.*` 里的 `process.env` 提供值，不会自动把变量注入 `feishu` 配置对象。
- 你改了本项目配置后，需要重启 OpenClaw Feishu Progress 服务；你改了 OpenClaw 侧 relay 配置后，也要重启正在运行的 `openclaw/gateway` 进程或 systemd 服务。
- OpenClaw 的 `mode` 只支持 `daily|idle`，没有真正的 `never`。如果你要“等同只靠 `/new`、`/reset` 手动切会话”，用超大 `idleMinutes` 规避自动切会话。

## 配置清单

| 配置项 | 建议环境变量 | 是否必需 | 作用 |
| --- | --- | --- | --- |
| `feishu.enabled` | - | 是 | 打开飞书桥接能力 |
| `feishu.mode` | - | 是 | 生产建议 `live` |
| `feishu.messageFormat` | - | 否 | `text` / `card` / `card-live` |
| `feishu.finalSummaryMode` | - | 否 | 终态摘要发送策略 |
| `feishu.appId` | `FEISHU_APP_ID` | 二选一 | 飞书应用凭据 |
| `feishu.appSecret` | `FEISHU_APP_SECRET` | 二选一 | 飞书应用凭据 |
| `feishu.tenantAccessToken` | `FEISHU_TENANT_ACCESS_TOKEN` | 二选一 | 固定 tenant token，替代 `appId/appSecret` |
| `feishu.baseTaskUrl` | `OPENCLAW_FEISHU_PROGRESS_BASE_TASK_URL` | 是 | 飞书消息中的任务详情链接前缀 |
| `feishu.webhookVerificationToken` | `FEISHU_WEBHOOK_VERIFICATION_TOKEN` | 建议开启 | 校验 `/api/feishu/webhook` 回调体 token |
| `feishu.webhookEncryptKey` | `FEISHU_WEBHOOK_ENCRYPT_KEY` | 建议开启 | 校验飞书事件订阅签名并解密 |
| `feishu.webhookMaxSkewSeconds` | `FEISHU_WEBHOOK_MAX_SKEW_SECONDS` | 否 | webhook 时间偏差容忍 |
| `feishu.webhookDedupTtlSeconds` | `FEISHU_WEBHOOK_DEDUP_TTL_SECONDS` | 否 | webhook 幂等去重 TTL |
| `feishu.relaySecret` | `OPENCLAW_RELAY_SECRET` | 建议开启 | OpenClaw 调用 relay 接口时的共享密钥 |
| `feishu.relayMaxSkewSeconds` | `OPENCLAW_RELAY_MAX_SKEW_SECONDS` | 否 | relay 时间偏差容忍 |
| `feishu.relayNonceTtlSeconds` | `OPENCLAW_RELAY_NONCE_TTL_SECONDS` | 否 | relay nonce 回放保护 TTL |
| `feishu.deliveryMaxRetries` | `FEISHU_DELIVERY_MAX_RETRIES` | 否 | 飞书出站投递最大重试次数 |
| `feishu.deliveryRetryBaseMs` | `FEISHU_DELIVERY_RETRY_BASE_MS` | 否 | 指数退避初始延迟 |
| `feishu.deliveryRetryMaxMs` | `FEISHU_DELIVERY_RETRY_MAX_MS` | 否 | 指数退避上限 |
| `feishu.progressThrottlePercent` | `FEISHU_PROGRESS_THROTTLE_PERCENT` | 否 | 进度节流阈值，避免消息过密 |

`appId/appSecret` 与 `tenantAccessToken` 二选一即可。生产上如果你能稳定管理 token 轮换，优先推荐 `appId/appSecret`；如果外部系统统一发 token，也可以直接用 `tenantAccessToken`。

## 推荐的 `.env`

```bash
# Feishu app credentials
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=sec_xxx
# FEISHU_TENANT_ACCESS_TOKEN=t-xxx

# Public URL shown in Feishu task links
OPENCLAW_FEISHU_PROGRESS_BASE_TASK_URL=https://progress.example.com

# Feishu webhook security
FEISHU_WEBHOOK_VERIFICATION_TOKEN=verify_xxx
FEISHU_WEBHOOK_ENCRYPT_KEY=encrypt_xxx
FEISHU_WEBHOOK_MAX_SKEW_SECONDS=300
FEISHU_WEBHOOK_DEDUP_TTL_SECONDS=600

# OpenClaw relay security
OPENCLAW_RELAY_SECRET=relay_xxx
OPENCLAW_RELAY_MAX_SKEW_SECONDS=300
OPENCLAW_RELAY_NONCE_TTL_SECONDS=600

# Feishu outbound delivery retry
FEISHU_DELIVERY_MAX_RETRIES=2
FEISHU_DELIVERY_RETRY_BASE_MS=300
FEISHU_DELIVERY_RETRY_MAX_MS=5000

# Optional: lower outbound noise
FEISHU_PROGRESS_THROTTLE_PERCENT=10
```

## 推荐的配置文件

```js
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
    baseTaskUrl: process.env.OPENCLAW_FEISHU_PROGRESS_BASE_TASK_URL,
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
```

## 飞书侧怎么配

### 1. 机器人权限

- 确认应用有发消息权限，并且机器人已经被加入目标群聊或可私聊。
- 如果你要用 `card-live`，确认应用允许发卡片并更新卡片。

### 2. 事件订阅

- 回调地址指向 `https://your-domain/api/feishu/webhook`。
- 如果飞书后台配置了 `verification token`，就把同一个值放到 `feishu.webhookVerificationToken`。
- 如果飞书后台配置了 `encrypt key`，就把同一个值放到 `feishu.webhookEncryptKey`。
- 首次接入时，飞书会发 `url_verification`；服务必须原样回传 challenge。

### 3. webhook 鉴权规则

如果配置了 `feishu.webhookEncryptKey`，服务会校验这些请求头：

- `x-lark-request-timestamp`
- `x-lark-request-nonce`
- `x-lark-signature`

如果同时配置了 `feishu.webhookVerificationToken`，还会校验请求体里的 token。

重复 webhook 事件会按 TTL 去重，并持久化到 `.opencroc/feishu-webhook-dedup.json`。这意味着服务重启以后，TTL 窗口内的重复投递仍会被拦住。

## OpenClaw relay 怎么配

OpenClaw 调本服务主要走两个入口：

- `/api/feishu/relay`
- `/api/feishu/relay/event`

如果配置了 `feishu.relaySecret`，OpenClaw 必须附带以下请求头：

- `x-openclaw-timestamp`
- `x-openclaw-nonce`
- `x-openclaw-signature`

签名串规则是：

```text
METHOD + path + timestamp + nonce + stable JSON body
```

签名算法为 `HMAC-SHA256`。如果时钟偏差超过 `relayMaxSkewSeconds`，或相同 `timestamp + nonce` 被重复使用，请求会被拒绝。

OpenClaw 侧配置改完后，同样需要重启 `openclaw/gateway` 进程或服务，不然 relay 还会继续用旧配置。

## 部署到 Linux/systemd

### 1. 安装与构建

```bash
git clone git@github.com:opencroc/openclaw-feishu-progress.git
cd openclaw-feishu-progress
npm install
npm run build
```

### 2. 准备配置

- 放好 `.env`
- 放好 `openclaw-feishu-progress.config.js` 或兼容的 `opencroc.config.js`
- 确认 `OPENCLAW_FEISHU_PROGRESS_BASE_TASK_URL` 是飞书用户实际能打开的公网地址

### 3. systemd 示例

```ini
[Unit]
Description=OpenClaw Feishu Progress
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/openclaw-feishu-progress
EnvironmentFile=/srv/openclaw-feishu-progress/.env
ExecStart=/usr/bin/node dist/cli/index.js serve --host 0.0.0.0 --port 8765 --no-open
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启动或重启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-feishu-progress
sudo systemctl restart openclaw-feishu-progress
```

查看日志：

```bash
journalctl -u openclaw-feishu-progress -f
```

### 4. 持久化文件与权限

这些文件默认写在工作目录下的 `.opencroc/`：

- `task-snapshots.json`
- `studio-snapshot.json`
- `planet-meta.json`
- `planet-edges.json`
- `feishu-webhook-dedup.json`

部署用户必须对工作目录和 `.opencroc/` 有写权限，不然任务快照、topic 关系和 webhook 去重都无法持久化。

## 上线验收与 smoke

### 成功链路

```bash
curl -X POST http://127.0.0.1:8765/api/feishu/smoke/progress \
  -H 'content-type: application/json' \
  -d '{
    "chatId": "oc_xxx",
    "requestId": "om_xxx",
    "title": "Smoke success from deployment doc"
  }'
```

预期看到：

1. 飞书先收到 ACK
2. 飞书连续收到多次 progress
3. 飞书收到 done 终态

### 失败链路

```bash
curl -X POST http://127.0.0.1:8765/api/feishu/smoke/progress \
  -H 'content-type: application/json' \
  -d '{
    "chatId": "oc_xxx",
    "requestId": "om_xxx",
    "title": "Smoke failed from deployment doc",
    "outcome": "failed",
    "failureMessage": "Smoke failed after staged progress"
  }'
```

预期看到：

1. 飞书先收到 ACK
2. 飞书连续收到多次 progress
3. 飞书收到 failed 终态

### 出问题时优先检查

- `OPENCLAW_FEISHU_PROGRESS_BASE_TASK_URL` 是否真的能从飞书客户端打开
- 服务与 OpenClaw 所在机器时钟是否同步
- `.opencroc/feishu-webhook-dedup.json` 是否可写
- `relaySecret` / `verification token` / `encrypt key` 是否两端一致
- 改完配置后是否真的重启了本服务和 `openclaw/gateway`

## 轮换与回滚建议

- 轮换 `relaySecret` 或飞书 `encrypt key` 时，先改配置文件，再重启服务，再做一次 smoke。
- 如果新密钥上线后立刻出现大量 401/403/409，优先回滚到旧密钥，确认时钟和签名串一致后再二次切换。
- 每次部署完成后，至少跑一遍成功 smoke；如果你改动了鉴权链路，再补一遍失败 smoke。
