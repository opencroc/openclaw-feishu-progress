import type { CrocOffice } from './croc-office.js';
import type { TaskRecord } from './task-store.js';

export interface TaskDecisionRequest {
  optionId?: string;
  freeText?: string;
  detail?: string;
  progress?: number;
}

export interface TaskDecisionResolved {
  optionId?: string;
  optionLabel?: string;
  freeText?: string;
}

export interface TaskDecisionSuccess {
  ok: true;
  task: TaskRecord;
  decision: TaskDecisionResolved;
  detail: string;
  alreadyResolved?: boolean;
}

export interface TaskDecisionFailure {
  ok: false;
  statusCode: number;
  error: string;
}

export interface SubmitTaskDecisionOptions {
  idempotentIfNotWaiting?: boolean;
  waitForDelivery?: boolean;
}

export function formatDecisionDetail(optionLabel: string | undefined, freeText: string | undefined): string {
  if (optionLabel && freeText) return `Decision received: ${optionLabel} — ${freeText}`;
  if (optionLabel) return `Decision received: ${optionLabel}`;
  if (freeText) return `Decision received: ${freeText}`;
  return 'Decision received';
}

export function describeTaskDecisionAlreadyProcessed(task: TaskRecord, decision: TaskDecisionResolved): string {
  const selected = decision.optionLabel || decision.freeText || decision.optionId;
  if (task.status === 'done') {
    return selected ? `该决策已处理：${selected}；任务已完成` : '该决策已处理，任务已完成';
  }
  if (task.status === 'failed') {
    return selected ? `该决策已处理：${selected}；任务已结束` : '该决策已处理，任务已结束';
  }
  return selected ? `该决策已处理：${selected}；任务已继续执行` : '该决策已处理，任务已继续执行';
}

export async function submitTaskDecision(
  office: CrocOffice,
  taskId: string,
  request: TaskDecisionRequest,
  options: SubmitTaskDecisionOptions = {},
): Promise<TaskDecisionSuccess | TaskDecisionFailure> {
  const task = office.getTask(taskId);
  if (!task) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Task not found',
    };
  }

  const optionId = request.optionId?.trim() || undefined;
  const freeText = request.freeText?.trim() || undefined;
  const decision: TaskDecisionResolved = {
    optionId,
    freeText,
  };

  if (task.status !== 'waiting') {
    if (!options.idempotentIfNotWaiting) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Task is not waiting for a decision',
      };
    }
    return {
      ok: true,
      task,
      decision,
      detail: describeTaskDecisionAlreadyProcessed(task, decision),
      alreadyResolved: true,
    };
  }

  const prompt = task.decision;
  const selectedOption = optionId
    ? prompt?.options.find((option) => option.id === optionId)
    : undefined;

  if (optionId && !selectedOption) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Invalid decision option',
    };
  }

  if (!optionId && !freeText) {
    return {
      ok: false,
      statusCode: 400,
      error: 'optionId or freeText is required',
    };
  }

  if (freeText && prompt && prompt.allowFreeText !== true && !optionId) {
    return {
      ok: false,
      statusCode: 400,
      error: 'This decision does not allow free text only submissions',
    };
  }

  if (freeText && prompt && prompt.allowFreeText !== true && optionId) {
    return {
      ok: false,
      statusCode: 400,
      error: 'This decision does not allow free text notes',
    };
  }

  const detail = request.detail?.trim() || formatDecisionDetail(selectedOption?.label, freeText);
  const updated = await office.submitTaskDecision(task.id, {
    detail,
    progress: request.progress ?? task.progress,
  }, options.waitForDelivery);

  if (!updated) {
    return {
      ok: false,
      statusCode: 409,
      error: 'Task decision could not be applied',
    };
  }

  return {
    ok: true,
    task: updated,
    detail,
    decision: {
      optionId: selectedOption?.id,
      optionLabel: selectedOption?.label,
      freeText,
    },
  };
}
