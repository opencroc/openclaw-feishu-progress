import type { PlanetEdgeStore } from '../edge-store.js';
import type { FastifyInstance } from 'fastify';
import type { CrocAgent, CrocOffice } from '../croc-office.js';
import { inferPlanetEdges, type PlanetEdge, type PlanetEdgeType } from '../planet-edge-inference.js';
import type { PlanetMetaRecord, PlanetMetaStore, PlanetPosition } from '../planet-meta-store.js';
import type { TaskEvent, TaskRecord, TaskStage, TaskStatus } from '../task-store.js';

export type PlanetStatus = TaskStatus | 'archived';

export interface PlanetOverviewItem {
  id: string;
  title: string;
  sourceText?: string;
  summary?: string;
  kind: string;
  status: PlanetStatus;
  progress: number;
  complexity: number;
  radius: number;
  position: PlanetPosition;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  currentStageKey?: string;
  currentStageLabel?: string;
  waitingFor?: string;
  taskUrl: string;
  tags: string[];
}

interface PlanetListResponse {
  ok: true;
  planets: PlanetOverviewItem[];
  edges: PlanetEdge[];
}

export interface PlanetInteriorStage {
  key: string;
  label: string;
  status: TaskStage['status'];
  progress: number;
  detail?: string;
  startedAt?: number;
  completedAt?: number;
  arcStart: number;
  arcEnd: number;
  midAngle: number;
}

export interface PlanetInteriorAgent {
  id: string;
  name: string;
  role: string;
  sprite: string;
  status: CrocAgent['status'];
  stageKey: string;
  stageLabel: string;
  progress?: number;
  currentAction?: string;
  angle: number;
}

interface PlanetInteriorResponse {
  ok: true;
  planet: PlanetOverviewItem;
  interior: {
    stages: PlanetInteriorStage[];
    agents: PlanetInteriorAgent[];
    events: TaskEvent[];
    summary?: string;
    waitingFor?: string;
  };
}

const HEAVY_KINDS = new Set(['chat', 'analysis', 'pipeline', 'report', 'execute', 'test']);
const ROLE_STAGE_CANDIDATES: Record<string, string[]> = {
  parser: ['gather', 'scan', 'receive', 'prepare'],
  analyzer: ['understand', 'analyze', 'graph'],
  tester: ['generate', 'codegen', 'execute', 'test'],
  healer: ['execute', 'analyze', 'finalize', 'report'],
  planner: ['plan', 'understand', 'receive'],
  reporter: ['report', 'finalize', 'output'],
};

function isPlanetEdgeType(value: unknown): value is PlanetEdgeType {
  return value === 'depends-on' || value === 'related-to' || value === 'supersedes';
}

export function computeTaskComplexity(task: TaskRecord): number {
  let score = 0;
  score += Math.min(task.stages.length / 3, 2);
  score += Math.min(task.title.length / 32, 2);
  score += Math.min(task.events.length / 8, 2);

  const durationMs = (task.completedAt ?? Date.now()) - task.createdAt;
  score += Math.min(durationMs / (5 * 60 * 1000), 2);
  score += HEAVY_KINDS.has(task.kind) ? 1.5 : 0.75;

  return Math.max(1, Math.min(10, Math.round(score)));
}

export function complexityToRadius(complexity: number): number {
  return Math.round(28 + (complexity - 1) * (34 / 9));
}

function resolvePlanetStatus(task: TaskRecord, meta?: PlanetMetaRecord): PlanetStatus {
  if (meta?.archived) return 'archived';
  return task.status;
}

function deriveTags(task: TaskRecord, meta?: PlanetMetaRecord): string[] {
  const tags = new Set<string>(meta?.tags ?? []);
  tags.add(task.kind);
  if (task.currentStageKey) tags.add(task.currentStageKey);
  if (task.waitingFor) tags.add('waiting');
  return [...tags];
}

function autoLayout(index: number): PlanetPosition {
  const angle = index * 2.399963229728653;
  const distance = 90 + index * 34;
  return {
    x: 420 + Math.cos(angle) * distance,
    y: 290 + Math.sin(angle) * distance,
  };
}

function buildPlanets(tasks: TaskRecord[], metaStore: PlanetMetaStore): PlanetOverviewItem[] {
  const metas = new Map(metaStore.list().map((meta) => [meta.id, meta]));

  return tasks.map((task, index) => {
    const meta = metas.get(task.id);
    const complexity = computeTaskComplexity(task);
    const currentStage = task.stages.find((stage) => stage.key === task.currentStageKey);

    return {
      id: task.id,
      title: task.title,
      sourceText: task.sourceText,
      summary: task.summary,
      kind: task.kind,
      status: resolvePlanetStatus(task, meta),
      progress: task.progress,
      complexity,
      radius: complexityToRadius(complexity),
      position: meta?.position ?? autoLayout(index),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      currentStageKey: task.currentStageKey,
      currentStageLabel: currentStage?.label,
      waitingFor: task.waitingFor,
      taskUrl: `/tasks/${task.id}`,
      tags: deriveTags(task, meta),
    };
  });
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeStageProgress(task: TaskRecord, stage: TaskStage, stageIndex: number): number {
  if (stage.status === 'done' || stage.status === 'failed') return 100;
  if (stage.status === 'pending') return 0;

  const stageSpan = 100 / Math.max(task.stages.length, 1);
  const stageStart = stageIndex * stageSpan;
  const relativeProgress = (task.progress - stageStart) / stageSpan;
  return clampProgress(relativeProgress * 100);
}

function buildStageInterior(task: TaskRecord): PlanetInteriorStage[] {
  const totalStages = Math.max(task.stages.length, 1);
  const arcSize = 360 / totalStages;
  const gap = Math.min(7, arcSize * 0.12);

  return task.stages.map((stage, index) => {
    const rawStart = index * arcSize;
    const rawEnd = rawStart + arcSize;
    const arcStart = rawStart + gap / 2;
    const arcEnd = rawEnd - gap / 2;

    return {
      key: stage.key,
      label: stage.label,
      status: stage.status,
      progress: computeStageProgress(task, stage, index),
      detail: stage.detail,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      arcStart,
      arcEnd,
      midAngle: (arcStart + arcEnd) / 2,
    };
  });
}

function resolveStageKeyForRole(role: string, stages: PlanetInteriorStage[], currentStageKey?: string): string {
  const candidates = ROLE_STAGE_CANDIDATES[role] ?? [];
  for (const candidate of candidates) {
    if (stages.some((stage) => stage.key === candidate)) return candidate;
  }
  return currentStageKey && stages.some((stage) => stage.key === currentStageKey)
    ? currentStageKey
    : (stages[0]?.key ?? 'receive');
}

function deriveAgentStatusFromStage(stage: PlanetInteriorStage, role: string): CrocAgent['status'] {
  if (stage.status === 'done') return 'done';
  if (stage.status === 'failed') return 'error';
  if (stage.status === 'running') {
    return role === 'planner' || role === 'analyzer' ? 'thinking' : 'working';
  }
  return 'idle';
}

function deriveAgentAction(stage: PlanetInteriorStage): string | undefined {
  if (stage.detail) return stage.detail;
  if (stage.status === 'done') return `${stage.label} complete`;
  if (stage.status === 'failed') return `${stage.label} blocked`;
  if (stage.status === 'running') return `Working on ${stage.label}`;
  return undefined;
}

function buildInteriorAgents(task: TaskRecord, officeAgents: CrocAgent[], stages: PlanetInteriorStage[]): PlanetInteriorAgent[] {
  if (stages.length === 0) return [];

  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));
  const useLiveOfficeState = task.status === 'running' || task.status === 'waiting';
  const groupedAgents = new Map<string, number>();

  return officeAgents.map((agent) => {
    const stageKey = resolveStageKeyForRole(agent.role, stages, task.currentStageKey);
    const stage = stageByKey.get(stageKey) ?? stages[0];
    const stageSlot = groupedAgents.get(stageKey) ?? 0;
    groupedAgents.set(stageKey, stageSlot + 1);
    const angleOffset = stageSlot === 0 ? 0 : (stageSlot % 2 === 0 ? 1 : -1) * (10 + Math.floor(stageSlot / 2) * 8);

    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      sprite: agent.sprite,
      status: useLiveOfficeState
        ? agent.status
        : deriveAgentStatusFromStage(stage, agent.role),
      stageKey,
      stageLabel: stage?.label ?? stageKey,
      progress: useLiveOfficeState
        ? agent.progress
        : stage?.progress,
      currentAction: useLiveOfficeState
        ? agent.currentTask
        : deriveAgentAction(stage),
      angle: (stage?.midAngle ?? 0) + angleOffset,
    };
  });
}

export function registerPlanetRoutes(
  app: FastifyInstance,
  office: CrocOffice,
  metaStore: PlanetMetaStore,
  edgeStore: PlanetEdgeStore,
): void {
  app.get<{ Querystring: { limit?: string } }>('/api/planets', async (req): Promise<PlanetListResponse> => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const tasks = office.listTasks(Number.isFinite(limit) ? limit : 50);
    const autoEdges = inferPlanetEdges(tasks);
    return {
      ok: true,
      planets: buildPlanets(tasks, metaStore),
      edges: edgeStore.getMerged(autoEdges),
    };
  });

  app.get<{ Params: { id: string } }>('/api/planets/:id', async (req, reply) => {
    const task = office.getTask(req.params.id);
    if (!task) {
      reply.code(404).send({ error: 'Planet not found' });
      return;
    }

    const [planet] = buildPlanets([task], metaStore);
    return {
      ok: true,
      planet,
      task,
    };
  });

  app.get<{ Params: { id: string } }>('/api/planets/:id/interior', async (req, reply): Promise<PlanetInteriorResponse | void> => {
    const task = office.getTask(req.params.id);
    if (!task) {
      reply.code(404).send({ error: 'Planet not found' });
      return;
    }

    const [planet] = buildPlanets([task], metaStore);
    const stages = buildStageInterior(task);
    const agents = buildInteriorAgents(task, office.getAgents(), stages);

    return {
      ok: true,
      planet,
      interior: {
        stages,
        agents,
        events: task.events.slice(-30).reverse(),
        summary: task.summary,
        waitingFor: task.waitingFor,
      },
    };
  });

  app.post<{ Body: { from: string; to: string; type?: PlanetEdgeType; reason?: string } }>('/api/planets/edges', async (req, reply) => {
    const { from, to, type = 'related-to', reason } = req.body || {};
    if (!from || !to || from === to) {
      reply.code(400).send({ error: 'Invalid edge endpoints' });
      return;
    }
    if (!isPlanetEdgeType(type)) {
      reply.code(400).send({ error: 'Invalid edge type' });
      return;
    }
    if (!office.getTask(from) || !office.getTask(to)) {
      reply.code(404).send({ error: 'Planet not found for edge creation' });
      return;
    }

    const edge = edgeStore.upsertManual({
      fromPlanetId: from,
      toPlanetId: to,
      type,
      reason,
    });

    return { ok: true, edge };
  });

  app.put<{ Params: { fromId: string; toId: string }; Body: { type?: PlanetEdgeType; reason?: string } }>('/api/planets/edges/:fromId/:toId', async (req, reply) => {
    const { fromId, toId } = req.params;
    const { type = 'related-to', reason } = req.body || {};

    if (!isPlanetEdgeType(type)) {
      reply.code(400).send({ error: 'Invalid edge type' });
      return;
    }
    if (!office.getTask(fromId) || !office.getTask(toId)) {
      reply.code(404).send({ error: 'Planet not found for edge update' });
      return;
    }

    const edge = edgeStore.upsertManual({
      fromPlanetId: fromId,
      toPlanetId: toId,
      type,
      reason,
    });

    return { ok: true, edge };
  });

  app.delete<{ Params: { fromId: string; toId: string } }>('/api/planets/edges/:fromId/:toId', async (req, reply) => {
    const removed = edgeStore.removeManual(req.params.fromId, req.params.toId);
    if (!removed) {
      reply.code(404).send({ error: 'Manual edge not found' });
      return;
    }
    return { ok: true };
  });
}
