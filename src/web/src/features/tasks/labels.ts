import type { PlanetEdge, PlanetInteriorAgent, PlanetInteriorStage, PlanetOverviewItem, TaskRecord } from './types';

const STATUS_LABELS: Record<PlanetOverviewItem['status'], string> = {
  queued: '排队中',
  running: '执行中',
  waiting: '待确认',
  done: '已完成',
  failed: '失败',
  archived: '已归档',
};

const KIND_LABELS: Record<string, string> = {
  chat: '对话',
  scan: '扫描',
  pipeline: '流水线',
  test: '测试',
  report: '报告',
  analysis: '分析',
  execute: '执行',
};

const EDGE_TYPE_LABELS: Record<PlanetEdge['type'], string> = {
  'depends-on': '依赖',
  'related-to': '相关',
  supersedes: '替代',
};

const STAGE_STATUS_LABELS: Record<PlanetInteriorStage['status'], string> = {
  pending: '待开始',
  running: '进行中',
  done: '已完成',
  failed: '失败',
};

const AGENT_STATUS_LABELS: Record<PlanetInteriorAgent['status'], string> = {
  idle: '空闲',
  working: '执行中',
  thinking: '思考中',
  done: '完成',
  error: '阻塞',
};

const ROLE_LABELS: Record<string, string> = {
  parser: '解析',
  analyzer: '分析',
  tester: '测试',
  healer: '修复',
  planner: '规划',
  reporter: '汇报',
  runtime: '运行时',
};

const STAGE_KEY_LABELS: Record<string, string> = {
  receive: '接收任务',
  understand: '理解问题',
  gather: '收集上下文',
  generate: '生成结果',
  finalize: '整理输出',
  scan: '扫描结构',
  report: '生成报告',
  graph: '构建图谱',
  analyze: '分析链路',
  plan: '规划方案',
  codegen: '生成代码',
  prepare: '准备环境',
  backend: '后端准备',
  execute: '执行任务',
  output: '输出结果',
  write: '写入产物',
  publish: '发布结果',
  test: '执行测试',
};

const STAGE_LABEL_ALIASES: Record<string, string> = {
  'Receive task': '接收任务',
  'Understand problem': '理解问题',
  'Gather materials / scan context': '收集材料 / 扫描上下文',
  'Generate answer': '生成答案',
  'Finalize output': '整理输出',
  'Scan project structure': '扫描项目结构',
  'Build knowledge graph': '构建知识图谱',
  'Summarize result': '整理结论',
  'Scan workspace': '扫描工作区',
  'Generate report': '生成报告',
  'Gather findings': '收集结论',
  'Write report': '撰写报告',
  'Analyze API chains': '分析接口链路',
  'Plan test chains': '规划测试链路',
  'Generate test code': '生成测试代码',
  'Validate and summarize': '校验并汇总',
  'Prepare runtime and test files': '准备运行环境与测试文件',
  'Prepare backend and auth': '准备后端与鉴权',
  'Run Playwright tests': '执行 Playwright 测试',
  'Analyze failures and summarize': '分析失败并汇总',
  'Generate reports': '生成报告集',
  'Write report files': '写入报告文件',
  'Publish report metadata': '发布报告元数据',
};

export function getStatusLabel(status: PlanetOverviewItem['status'] | TaskRecord['status']): string {
  return STATUS_LABELS[status] ?? status;
}

export function getKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export function getEdgeTypeLabel(type: PlanetEdge['type']): string {
  return EDGE_TYPE_LABELS[type];
}

export function getStageStatusLabel(status: PlanetInteriorStage['status']): string {
  return STAGE_STATUS_LABELS[status];
}

export function getAgentStatusLabel(status: PlanetInteriorAgent['status']): string {
  return AGENT_STATUS_LABELS[status];
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function getStageKeyLabel(stageKey?: string): string {
  if (!stageKey) return '—';
  return STAGE_KEY_LABELS[stageKey] ?? stageKey;
}

export function getStageLabel(label?: string, stageKey?: string): string {
  if (label && STAGE_LABEL_ALIASES[label]) return STAGE_LABEL_ALIASES[label];
  if (label && label.trim().length > 0) return label;
  return getStageKeyLabel(stageKey);
}

export function getTagLabel(tag: string): string {
  if (KIND_LABELS[tag]) return KIND_LABELS[tag];
  if (STAGE_KEY_LABELS[tag]) return STAGE_KEY_LABELS[tag];
  return tag;
}
