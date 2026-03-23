# Troubleshooting

完整的鉴权配置、OpenClaw relay 接入、systemd 部署和 smoke 验收步骤见 [飞书鉴权与部署](./feishu-auth-deployment.md)。

## 配置改了但没生效

- 如果你改的是本项目（OpenClaw Feishu Progress / Studio）配置：需要重启正在运行的服务进程。
- 如果你改的是 OpenClaw 侧（openclaw/gateway）配置：同样需要重启正在运行的 `openclaw/gateway` 进程或 systemd 服务后才会生效。

补充说明（OpenClaw 会话模式）

- OpenClaw 的 `mode` 只支持 `daily|idle`，没有真正的 `never`。
- 如果你想实现“等同只靠 `/new`、`/reset` 手动切会话”，用超大 `idleMinutes` 来避免自动切会话。

## 飞书收不到 ACK/进度消息

- 检查 `.env` 或 config 里的 `FEISHU_APP_ID` / `FEISHU_APP_SECRET`（或 `FEISHU_TENANT_ACCESS_TOKEN`）是否正确。
- 确认飞书应用权限与范围：机器人是否有发消息权限，是否能在目标群/私聊中发言。
- 确认 `OPENCLAW_FEISHU_PROGRESS_BASE_TASK_URL` 可被飞书用户访问，否则卡片/文本里的“任务详情链接”会打不开。
- 如果使用 `messageFormat: 'card-live'`：需要能成功拿到 `message_id` 并允许 PATCH 更新；否则会退化为多条消息。
- 如果出现 429：当前版本会做有限次退避重试；如果仍失败，需要降低更新频率，或调大 `deliveryRetryBaseMs` / `deliveryRetryMaxMs`。

## Webhook 收不到或验签失败

- 确认飞书事件订阅 URL 指向 `/api/feishu/webhook`，并能通过公网访问。
- 首次校验会发送 `url_verification`，服务需要正确回传 challenge。
- 若启用了 `feishu.webhookVerificationToken`：确保它和飞书事件订阅后台的 verification token 一致。
- 若启用了 `feishu.webhookEncryptKey`：确认飞书请求里带有 `x-lark-request-timestamp`、`x-lark-request-nonce`、`x-lark-signature`，并且 encrypt key 与后台一致。
- 如果报时间戳过期：检查服务器时钟偏差，或适当调大 `webhookMaxSkewSeconds`。
- 如果怀疑重复事件没有挡住：检查 `.opencroc/feishu-webhook-dedup.json` 是否可写，服务重启后去重状态会从这里恢复。

## relay 进度能进来但飞书不更新

- 如果启用了 `feishu.relaySecret`：确认 OpenClaw 已发送 `x-openclaw-timestamp`、`x-openclaw-nonce`、`x-openclaw-signature` 三个请求头。
- 确认 OpenClaw 与本服务机器时钟偏差不要超过 `relayMaxSkewSeconds`，否则会被当成过期请求拦截。
- 如果出现 409：通常是相同 `timestamp + nonce` 被重复发送，属于回放保护命中。
- 检查 `/api/feishu/relay/event` 是否成功返回（是否被鉴权拦截、是否 4xx/5xx）。
- 检查任务是否已 bind 到飞书（`chatId` 是否正确；是否记录了 `messageId` 用于 live update）。
- 如果飞书 API 偶发 429/5xx 或网络错误：确认 `deliveryMaxRetries`、`deliveryRetryBaseMs`、`deliveryRetryMaxMs` 是否配置合理。
- 如果 OpenClaw 负责最终答案：确保 relay start 时设置 `finalAnswerSource=openclaw`，避免重复发送最终摘要。

## Studio 页面没数据

- 先触发一次 `scan` 或 `pipeline`，让图谱与任务产生数据。
- 确认服务监听地址与端口正确（开发态默认 `:5173` 前端、`:8765` 后端）。
- 如果你是生产构建：确认 `npm run build` 生成了 `src/web/dist`，否则会使用内嵌的简易页面。
