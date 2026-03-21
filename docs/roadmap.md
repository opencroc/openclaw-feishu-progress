# Roadmap (Sprint-Based) — OpenClaw Feishu Progress + OpenCroc

本 Roadmap 把两条主线视为同等优先级并同步推进：

- 主线 A（对话入口）：OpenClaw relay + 飞书 ACK/进度/卡片交互，把复杂请求稳定变成“可追踪任务”
- 主线 B（任务内核）：OpenCroc scan/graph + pipeline（生成/执行/自愈/报告），把任务真正跑完并产出可交付物

> 节奏：每个 Sprint 2 周。日期以 2026-03-23 为 Sprint 1 起点，可按实际排期平移。

## 北极星指标

- 飞书侧体验：ACK p95 < 2s；进度投递成功率 > 99%；卡片更新乱序/重复 < 0.1%
- 任务闭环：一次复杂请求能在 Studio 看到任务链路，并能稳定产出 report/文件/可复现日志
- 工程质量：`npm test` 与 CI 绿；新增能力都有最小可回归用例与文档

## 全局 DoD（所有 Sprint 通用）

- 新增/变更的接口有明确的契约（请求字段、鉴权、幂等、错误码）
- 单元测试覆盖关键分支（成功、失败、重试、鉴权失败、幂等重复）
- 关键路径有结构化日志字段（至少包含 `taskId`，涉及飞书时包含 `chatId`/`messageId`）
- 文档与示例可跑通（至少 1 条 smoke 流程）

## Sprint 1（2026-03-23 ~ 2026-04-05）：入口与投递“生产化底座”

目标：先把入口安全、投递稳态、幂等去重做扎实，再把 OpenCroc 的阶段进度与飞书展示对齐。

交付（主线 A：OpenClaw/飞书）

- `/api/feishu/webhook` 的安全校验与幂等去重“可持久”：重启进程后仍能在 TTL 内去重
- `/api/feishu/relay` 与 `/api/feishu/relay/event` 增加最小鉴权（共享密钥/HMAC），并有回放保护（timestamp/nonce）
- 出站投递稳态：对 429/5xx/网络抖动的重试退避策略明确，可配置，且不会造成无限重试与消息风暴

交付（主线 B：OpenCroc scan/pipeline）

- 任务阶段与飞书展示对齐：scan/pipeline/execute/report 的 stage 文案与百分比策略统一（减少“跳进度/卡住”）
- `scan` 与 Studio UI 的数据落盘/缓存策略明确（至少保证重启后能恢复最近任务与图谱快照）

Sprint 1 DoD（验收）

- 针对 webhook/relay 鉴权与去重的单测覆盖完成，并在 CI 里跑
- 本地 smoke：能在飞书看到 ACK -> 多次 progress -> done/failed（含 1 次重试场景）
- 文档：新增/更新“鉴权配置与部署注意事项”小节（包含环境变量与回滚方式）

## Sprint 2（2026-04-06 ~ 2026-04-19）：等待态决策与卡片交互闭环

目标：让 `waiting` 不再只是“发一条文本提示”，而是可交互、可回填决策并驱动任务继续。

交付（主线 A：飞书卡片交互）

- `waiting` 状态生成带按钮的卡片（例如：继续执行/停止/只生成报告/仅 scan），并支持回调
- 增加决策提交接口（例如：`POST /api/tasks/:id/decision`），支持 option id 与可选 free text
- 卡片 `card-live` 原地更新：用户点选后，卡片显示“已选择 X”，并推进任务状态

交付（主线 B：任务编排）

- 为“有风险/有成本”的动作加决策点：例如 self-heal 的 source mutation 或 PR 生成前必须进入 `waiting` 等待确认
- 让 chat 意图分类（pipeline/scan/report/analysis）与可交互按钮保持一致（避免 UI/后端分叉）

Sprint 2 DoD（验收）

- 一条完整流程：飞书触发 -> 进入 waiting -> 点按钮 -> 任务继续 -> 最终在飞书收到完成摘要 + 任务链接
- 决策回调与任务状态变更有单测（含重复点击/重复回调幂等）

## Sprint 3（2026-04-20 ~ 2026-05-03）：可观测性与生产部署一键化

目标：把“能跑”提升到“可长期跑、可排障、可监控”。

交付（主线 A：服务化与排障）

- 增加 `/healthz`（以及必要的 `/readyz`）并明确判断标准（配置、存储、飞书凭据可用性）
- systemd 或 Docker 交付物完善：环境变量清单、日志路径、升级步骤、回滚方式
- 飞书相关关键错误可定位：token 获取失败、权限不足、429、卡片更新失败、消息线程参数不匹配

交付（主线 B：scan/graph 的可观测）

- scan 过程输出阶段日志与耗时统计（文件数、跳过数、deep scan 上限命中等）
- 为超大仓库提供降级策略（maxDeepScan、忽略规则、超时中止），并能在报告里解释“扫描了什么/没扫描什么”

Sprint 3 DoD（验收）

- 以“重启/故障/权限不足/429”作为必测场景，能给出明确可执行的排障建议
- 文档补齐：Troubleshooting + Deployment 两段可独立读懂并复现

## Sprint 4（2026-05-04 ~ 2026-05-17）：报告回传与执行质量门禁

目标：让飞书收到的不只是“完成了”，而是“可交付的结果”；让 pipeline/run 的质量结果可量化。

交付（主线 A：飞书回传内容升级）

- done/failed 的最终摘要模板化：结论、关键数据、产物链接（report/文件/仪表盘）
- 将 checklist/workorder/token usage（如有）作为可选附件回传（文本或卡片分块）

交付（主线 B：执行与自愈质量）

- 执行质量门禁（quality gate）默认启用且可配置：例如后端不可用、auth 失败、失败率过高直接标红
- 自愈策略分级：config-only 默认优先，source mutation 需进入 waiting 并二次确认

Sprint 4 DoD（验收）

- 在飞书里能看到“可落地的下一步”：失败原因分类、建议动作、指向 report 的链接
- 至少 1 套端到端回归：pipeline -> execute -> (optional heal) -> report，数据在 Studio 可回看

## Sprint 5（2026-05-18 ~ 2026-05-31）：任务队列与并发治理（多 chat 生产形态）

目标：从“单任务互斥”走向“可控并发”，避免多 chat/多请求导致互相干扰。

交付（主线 A：多会话治理）

- 按 chatId/tenant 的并发与队列策略：默认串行，同 chat 不乱序；跨 chat 可并行但有全局上限
- 任务取消/超时：能在飞书触发取消，并在 Studio 与飞书都可见（含幂等）

交付（主线 B：远程 scan 与任务化运行）

- 支持把 `opencroc scan <target>` 的能力任务化（本机路径或远端仓库），并把结果回传到飞书
- 明确缓存策略：同一 target 的重复 scan 可以复用（可配置禁用）

Sprint 5 DoD（验收）

- 压测式验收：并发 5 个 chat 触发任务，队列/并发策略符合预期，且不会把进度串线
- 取消/超时与恢复（重启后仍能看到任务最终态）有回归用例

## Sprint 6（2026-06-01 ~ 2026-06-14）：插件化与包边界收敛

目标：把“飞书桥接”和“OpenCroc 内核”边界明确，支持未来多渠道与多形态部署。

交付（主线 A：通知渠道插件）

- 抽象 `NotificationChannel`（send/update/ack/decision callback），飞书实现作为第一个插件
- 预留第二渠道占位（例如 stdout/webhook/slack 任一），验证核心不被飞书绑死

交付（主线 B：内核拆分与兼容）

- 明确包与命名策略：`openclaw-feishu-progress` 与 `opencroc` 的 CLI/配置兼容路线图（不破坏现有用户）
- 将 scanner/graph/insight/pipeline/execution 的依赖关系写成“架构契约”（谁能依赖谁）

Sprint 6 DoD（验收）

- 新增渠道不会影响飞书能力，且新增渠道有最小 smoke
- README 与配置文档更新，包含迁移/兼容说明

## 依赖与外部约束（需在文档中持续强调）

- OpenClaw 的 `mode` 只支持 `daily|idle`，没有真正的 `never`。如需“等同只靠 `/new`、`/reset` 手动切会话”，用超大 `idleMinutes` 规避自动切会话。
- OpenClaw 侧配置生效通常需要重启正在运行的 `openclaw/gateway` 进程或服务。

## 未来（超出本季度的候选方向）

- 多租户与权限（Studio 鉴权、审计日志）
- 更强的 LLM 约束推理（链路规划/自愈策略更可控）
- 执行平台化（worker 池、任务分片、artifact 存储与检索）
