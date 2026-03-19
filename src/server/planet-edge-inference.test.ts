import { describe, expect, it } from 'vitest';

import { inferPlanetEdges } from './planet-edge-inference.js';
import type { TaskRecord } from './task-store.js';

function makeTask(overrides: Partial<TaskRecord> & Pick<TaskRecord, 'id' | 'kind' | 'title' | 'createdAt' | 'updatedAt'>): TaskRecord {
  return {
    id: overrides.id,
    kind: overrides.kind,
    title: overrides.title,
    sourceText: overrides.sourceText,
    status: overrides.status ?? 'queued',
    progress: overrides.progress ?? 0,
    currentStageKey: overrides.currentStageKey,
    stages: overrides.stages ?? [
      { key: 'receive', label: 'Receive', status: 'pending' },
      { key: 'report', label: 'Report', status: 'pending' },
    ],
    summary: overrides.summary,
    waitingFor: overrides.waitingFor,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
    completedAt: overrides.completedAt,
    events: overrides.events ?? [],
  };
}

describe('inferPlanetEdges', () => {
  it('infers a depends-on edge from later report tasks to earlier scans', () => {
    const scanTask = makeTask({
      id: 'scan-1',
      kind: 'scan',
      title: 'Scan src/server/routes',
      sourceText: '扫描 src/server/routes 和 src/web/src/pages',
      createdAt: 1000,
      updatedAt: 1000,
    });
    const reportTask = makeTask({
      id: 'report-1',
      kind: 'report',
      title: 'Summarize routes scan',
      sourceText: '基于上次扫描 src/server/routes 的结果生成报告',
      createdAt: 2000,
      updatedAt: 2000,
    });

    expect(inferPlanetEdges([reportTask, scanTask])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromPlanetId: reportTask.id,
        toPlanetId: scanTask.id,
        type: 'depends-on',
        source: 'auto',
      }),
    ]));
  });

  it('marks rewrite-style followups as supersedes', () => {
    const firstTask = makeTask({
      id: 'analysis-1',
      kind: 'analysis',
      title: 'Analyze pipeline structure',
      sourceText: '分析 pipeline 和 src/server',
      createdAt: 1000,
      updatedAt: 1000,
    });
    const redoTask = makeTask({
      id: 'analysis-2',
      kind: 'analysis',
      title: 'Rewrite previous analysis',
      sourceText: '重写之前的分析，继续聚焦 src/server pipeline',
      createdAt: 1100,
      updatedAt: 1100,
    });

    expect(inferPlanetEdges([firstTask, redoTask])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromPlanetId: redoTask.id,
        toPlanetId: firstTask.id,
        type: 'supersedes',
        source: 'auto',
      }),
    ]));
  });

  it('does not create edges for unrelated tasks', () => {
    const taskA = makeTask({
      id: 'chat-1',
      kind: 'chat',
      title: 'Draft team note',
      sourceText: '整理团队同步会纪要',
      createdAt: 1000,
      updatedAt: 1000,
    });
    const taskB = makeTask({
      id: 'execute-1',
      kind: 'execute',
      title: 'Run regression suite',
      sourceText: '执行 regression suite for billing service',
      createdAt: 200000,
      updatedAt: 200000,
    });

    expect(inferPlanetEdges([taskA, taskB])).toEqual([]);
  });
});
