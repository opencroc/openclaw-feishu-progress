import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { FileTaskSnapshotStore } from './task-store.file.js';
import { TaskStore } from './task-store.js';

describe('FileTaskSnapshotStore integration', () => {
  it('hydrates persisted tasks into a new TaskStore instance', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opencroc-task-store-'));
    const filePath = join(dir, 'task-snapshots.json');
    const snapshotStore = new FileTaskSnapshotStore(filePath);
    const store = new TaskStore(snapshotStore);

    const task = store.create({
      kind: 'chat',
      title: 'Analyze relay chain',
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'understand', label: 'Understand' },
        { key: 'finalize', label: 'Finalize' },
      ],
    });

    store.markRunning(task.id, 'understand', 'Reading recent context', 38);
    store.markDone(task.id, 'Relay chain analyzed');

    const restored = new TaskStore(new FileTaskSnapshotStore(filePath));
    const restoredTask = restored.get(task.id);

    expect(restoredTask).toMatchObject({
      id: task.id,
      kind: 'chat',
      status: 'done',
      progress: 100,
      summary: 'Relay chain analyzed',
      currentStageKey: 'understand',
    });
    expect(restoredTask?.events.at(-1)?.type).toBe('done');
  });

  it('returns an empty task list for invalid snapshot json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opencroc-task-store-invalid-'));
    const filePath = join(dir, 'task-snapshots.json');
    writeFileSync(filePath, '{"broken":', 'utf-8');

    const restored = new TaskStore(new FileTaskSnapshotStore(filePath));
    expect(restored.list(10)).toEqual([]);
  });
});
