# Backend Instrumentation (Guide)

本项目的执行与自愈能力依赖“后端可观测数据”来做判定与归因。你可以先把下面几类埋点补齐，再逐步增强。

## 最小可用（P0）

- Health endpoint：提供一个稳定的健康检查 URL（例如 `/health`），用于启动与就绪检测
- Seed/Cleanup endpoint（可选但强烈建议）：用于 E2E 前置数据准备与清理
- Log endpoint（可选）：用于拉取指定 `requestId` 或时间窗口内的日志片段（用于 log completion 检测与失败归因）

## 推荐日志字段（结构化日志）

- `requestId`：请求级唯一 ID（最好与链路透传一致）
- `userId`/`tenantId`：多租户或用户隔离时用于归因
- `method`/`path`/`status`：HTTP 维度的核心字段
- `durationMs`：耗时统计，用于慢接口与 SLO
- `eventStatus`：业务级完成态（避免“HTTP 200 但业务失败”）

## 与 OpenCroc/Studio 的对接点

- 运行时健康检查与等待：用于判定后端是否准备好
- Log completion 检测：用于判定关键请求是否真正完成（而不是只看 HTTP 返回）
- 自愈归因：失败时需要更完整的上下文（错误栈、关键日志、请求摘要）

## 常见坑

- 日志不带 `requestId` 导致难以匹配同一次 E2E 请求的后端事件
- 只记录 HTTP 层状态导致“业务失败”无法识别
- seed/cleanup 没有幂等导致并发执行时互相污染

下一步建议：当你有一条可稳定跑通的 E2E 流程后，再逐步把日志字段与 endpoint 做到更标准化。
