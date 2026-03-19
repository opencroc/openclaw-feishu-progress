import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  TaskDecisionOption,
  TaskDecisionPrompt,
  TaskEvent,
  TaskRecord,
  TaskSnapshotStore,
  TaskStage,
  TaskStageStatus,
  TaskStatus,
} from './task-store.js';

interface SerializedTaskSnapshotFile {
  version: 1;
  tasks: TaskRecord[];
}

function isTaskStageStatus(value: unknown): value is TaskStageStatus {
  return value === 'pending' || value === 'running' || value === 'done' || value === 'failed';
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'queued' || value === 'running' || value === 'waiting' || value === 'done' || value === 'failed';
}

function normalizeDecisionOptions(value: unknown): TaskDecisionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<TaskDecisionOption>;
    if (typeof candidate.id !== 'string' || typeof candidate.label !== 'string') return [];
    return [{
      id: candidate.id,
      label: candidate.label,
      description: typeof candidate.description === 'string' ? candidate.description : undefined,
    }];
  });
}

function normalizeDecision(value: unknown): TaskDecisionPrompt | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<TaskDecisionPrompt>;
  if (typeof candidate.prompt !== 'string') return undefined;
  const options = normalizeDecisionOptions(candidate.options);
  if (options.length === 0) return undefined;
  return {
    prompt: candidate.prompt,
    options,
    allowFreeText: candidate.allowFreeText === true,
  };
}

function normalizeStage(value: unknown): TaskStage | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TaskStage>;
  if (typeof candidate.key !== 'string' || typeof candidate.label !== 'string') return null;
  return {
    key: candidate.key,
    label: candidate.label,
    status: isTaskStageStatus(candidate.status) ? candidate.status : 'pending',
    detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
    startedAt: typeof candidate.startedAt === 'number' ? candidate.startedAt : undefined,
    completedAt: typeof candidate.completedAt === 'number' ? candidate.completedAt : undefined,
  };
}

function normalizeEvent(value: unknown): TaskEvent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TaskEvent>;
  if (typeof candidate.message !== 'string' || typeof candidate.time !== 'number') return null;
  const type = candidate.type;
  if (
    type !== 'created' &&
    type !== 'progress' &&
    type !== 'log' &&
    type !== 'waiting' &&
    type !== 'done' &&
    type !== 'failed'
  ) {
    return null;
  }
  return {
    type,
    message: candidate.message,
    progress: typeof candidate.progress === 'number' ? candidate.progress : undefined,
    stageKey: typeof candidate.stageKey === 'string' ? candidate.stageKey : undefined,
    level: candidate.level === 'info' || candidate.level === 'warn' || candidate.level === 'error'
      ? candidate.level
      : undefined,
    time: candidate.time,
  };
}

function normalizeTask(value: unknown): TaskRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TaskRecord>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.kind !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.progress !== 'number' ||
    typeof candidate.createdAt !== 'number' ||
    typeof candidate.updatedAt !== 'number'
  ) {
    return null;
  }

  const stages = Array.isArray(candidate.stages)
    ? candidate.stages.map((stage) => normalizeStage(stage)).filter((stage): stage is TaskStage => Boolean(stage))
    : [];
  const events = Array.isArray(candidate.events)
    ? candidate.events.map((event) => normalizeEvent(event)).filter((event): event is TaskEvent => Boolean(event))
    : [];

  return {
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    sourceText: typeof candidate.sourceText === 'string' ? candidate.sourceText : undefined,
    status: isTaskStatus(candidate.status) ? candidate.status : 'queued',
    progress: Math.max(0, Math.min(100, Math.round(candidate.progress))),
    currentStageKey: typeof candidate.currentStageKey === 'string' ? candidate.currentStageKey : undefined,
    stages,
    summary: typeof candidate.summary === 'string' ? candidate.summary : undefined,
    waitingFor: typeof candidate.waitingFor === 'string' ? candidate.waitingFor : undefined,
    decision: normalizeDecision(candidate.decision),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    completedAt: typeof candidate.completedAt === 'number' ? candidate.completedAt : undefined,
    events,
  };
}

export class FileTaskSnapshotStore implements TaskSnapshotStore {
  constructor(
    private readonly filePath: string,
    private readonly maxTasks = 240,
  ) {}

  load(): TaskRecord[] {
    const data = this.readFile();
    return data?.tasks ?? [];
  }

  save(tasks: TaskRecord[]): void {
    const data: SerializedTaskSnapshotFile = {
      version: 1,
      tasks: tasks
        .map((task) => normalizeTask(task))
        .filter((task): task is TaskRecord => Boolean(task))
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, this.maxTasks),
    };

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private readFile(): SerializedTaskSnapshotFile | null {
    if (!existsSync(this.filePath)) return null;

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SerializedTaskSnapshotFile | TaskRecord[];
      const tasks = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.tasks)
          ? parsed.tasks
          : [];

      return {
        version: 1,
        tasks: tasks
          .map((task) => normalizeTask(task))
          .filter((task): task is TaskRecord => Boolean(task))
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, this.maxTasks),
      };
    } catch {
      return null;
    }
  }
}
