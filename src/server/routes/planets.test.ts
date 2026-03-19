import { describe, expect, it } from 'vitest';

import { CrocOffice } from '../croc-office.js';
import type { PlanetEdgeStore } from '../edge-store.js';
import type { PlanetEdge } from '../planet-edge-inference.js';
import type { PlanetMetaRecord, PlanetMetaStore } from '../planet-meta-store.js';
import { registerPlanetRoutes } from './planets.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RouteHandler = (req: any, reply: any) => Promise<any> | any;

class FakeFastify {
  routes = new Map<string, RouteHandler>();

  get(path: string, handler: RouteHandler) {
    this.routes.set(`GET ${path}`, handler);
  }

  post(path: string, handler: RouteHandler) {
    this.routes.set(`POST ${path}`, handler);
  }

  put(path: string, handler: RouteHandler) {
    this.routes.set(`PUT ${path}`, handler);
  }

  delete(path: string, handler: RouteHandler) {
    this.routes.set(`DELETE ${path}`, handler);
  }
}

class FakeReply {
  statusCode = 200;
  payload: unknown;

  code(code: number) {
    this.statusCode = code;
    return this;
  }

  send(payload: unknown) {
    this.payload = payload;
    return payload;
  }
}

class MemoryPlanetMetaStore implements PlanetMetaStore {
  private readonly records = new Map<string, PlanetMetaRecord>();

  get(id: string): PlanetMetaRecord | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  list(): PlanetMetaRecord[] {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  save(record: PlanetMetaRecord): PlanetMetaRecord {
    this.records.set(record.id, structuredClone(record));
    return structuredClone(record);
  }
}

class MemoryPlanetEdgeStore implements PlanetEdgeStore {
  private readonly manualEdges = new Map<string, PlanetEdge>();

  listManual(): PlanetEdge[] {
    return [...this.manualEdges.values()].map((edge) => structuredClone(edge));
  }

  upsertManual(edge: { fromPlanetId: string; toPlanetId: string; type: PlanetEdge['type']; reason?: string }): PlanetEdge {
    const nextEdge: PlanetEdge = {
      fromPlanetId: edge.fromPlanetId,
      toPlanetId: edge.toPlanetId,
      type: edge.type,
      reason: edge.reason,
      confidence: 1,
      source: 'manual',
    };
    this.manualEdges.set(edgeKey(nextEdge), nextEdge);
    return structuredClone(nextEdge);
  }

  removeManual(fromPlanetId: string, toPlanetId: string): boolean {
    return this.manualEdges.delete(edgeKey({ fromPlanetId, toPlanetId }));
  }

  getMerged(autoEdges: PlanetEdge[]): PlanetEdge[] {
    const merged = new Map<string, PlanetEdge>();
    for (const edge of autoEdges) {
      merged.set(edgeKey(edge), structuredClone(edge));
    }
    for (const edge of this.manualEdges.values()) {
      merged.set(edgeKey(edge), structuredClone(edge));
    }
    return [...merged.values()];
  }
}

function edgeKey(edge: Pick<PlanetEdge, 'fromPlanetId' | 'toPlanetId'>): string {
  return `${edge.fromPlanetId}::${edge.toPlanetId}`;
}

async function call(app: FakeFastify, method: HttpMethod, path: string, req: any = {}) {
  const handler = app.routes.get(`${method} ${path}`);
  if (!handler) throw new Error(`Route not found: ${method} ${path}`);
  const reply = new FakeReply();
  const result = await handler(req, reply);
  return { result, reply };
}

describe('registerPlanetRoutes', () => {
  it('returns derived planet overview data, interiors, and inferred edges', async () => {
    const app = new FakeFastify();
    const office = new CrocOffice({ backendRoot: '.' }, process.cwd());
    const metaStore = new MemoryPlanetMetaStore();
    const edgeStore = new MemoryPlanetEdgeStore();

    const scanTask = office.createTask('scan', 'Scan workspace structure', [
      { key: 'receive', label: 'Receive task' },
      { key: 'scan', label: 'Scan workspace' },
      { key: 'report', label: 'Generate report' },
    ], '扫描 src/server/routes 和 src/web/src/pages');
    office.activateTask(scanTask.id);
    office.markTaskRunning('scan', 'Scanning workspace', 48);
    office.finishTask('Workspace scan complete');
    office.activateTask(null);

    const chatTask = office.createChatTask('Analyze Feishu relay behavior', '分析飞书 relay 和 src/server/routes');
    office.activateTask(chatTask.id);
    office.markTaskRunning('understand', 'Mapping current relay chain', 32);
    office.activateTask(null);

    const reportTask = office.createTask('report', 'Summarize scan findings', [
      { key: 'receive', label: 'Receive task' },
      { key: 'gather', label: 'Gather findings' },
      { key: 'report', label: 'Write report' },
    ], '基于上次扫描 src/server/routes 的结果生成报告');

    metaStore.save({
      id: chatTask.id,
      position: { x: 123, y: 234 },
      tags: ['manual-tag'],
    });

    registerPlanetRoutes(app as any, office, metaStore, edgeStore);

    const list = await call(app, 'GET', '/api/planets', { query: { limit: '10' } });
    expect((list.result as any).ok).toBe(true);
    expect((list.result as any).planets).toHaveLength(3);

    const chatPlanet = (list.result as any).planets.find((planet: { id: string }) => planet.id === chatTask.id);
    expect(chatPlanet).toMatchObject({
      id: chatTask.id,
      status: 'running',
      position: { x: 123, y: 234 },
      tags: expect.arrayContaining(['chat', 'understand', 'manual-tag']),
    });

    expect((list.result as any).edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromPlanetId: reportTask.id,
        toPlanetId: scanTask.id,
        type: 'depends-on',
        source: 'auto',
      }),
    ]));

    const detail = await call(app, 'GET', '/api/planets/:id', { params: { id: scanTask.id } });
    expect((detail.result as any).ok).toBe(true);
    expect((detail.result as any).planet).toMatchObject({
      id: scanTask.id,
      status: 'done',
      taskUrl: `/tasks/${scanTask.id}`,
    });
    expect((detail.result as any).task.summary).toBe('Workspace scan complete');

    const interior = await call(app, 'GET', '/api/planets/:id/interior', { params: { id: chatTask.id } });
    expect((interior.result as any).ok).toBe(true);
    expect((interior.result as any).planet.id).toBe(chatTask.id);
    expect((interior.result as any).interior.stages).toHaveLength(5);
    expect((interior.result as any).interior.agents.length).toBeGreaterThanOrEqual(4);
    expect((interior.result as any).interior.events[0]?.message).toContain('Mapping current relay chain');
    expect((interior.result as any).interior.stages[0]).toMatchObject({
      arcStart: expect.any(Number),
      arcEnd: expect.any(Number),
      midAngle: expect.any(Number),
    });
  });

  it('creates, updates, and deletes manual edges', async () => {
    const app = new FakeFastify();
    const office = new CrocOffice({ backendRoot: '.' }, process.cwd());
    const metaStore = new MemoryPlanetMetaStore();
    const edgeStore = new MemoryPlanetEdgeStore();

    const earlier = office.createTask('scan', 'Scan backend', [
      { key: 'receive', label: 'Receive task' },
      { key: 'scan', label: 'Scan backend' },
    ], '扫描 src/server');
    const later = office.createTask('report', 'Create report', [
      { key: 'receive', label: 'Receive task' },
      { key: 'report', label: 'Create report' },
    ], '输出报告');

    registerPlanetRoutes(app as any, office, metaStore, edgeStore);

    const created = await call(app, 'POST', '/api/planets/edges', {
      body: { from: later.id, to: earlier.id, type: 'depends-on', reason: 'manual link' },
    });
    expect((created.result as any).edge).toMatchObject({
      fromPlanetId: later.id,
      toPlanetId: earlier.id,
      type: 'depends-on',
      source: 'manual',
      reason: 'manual link',
    });

    const updated = await call(app, 'PUT', '/api/planets/edges/:fromId/:toId', {
      params: { fromId: later.id, toId: earlier.id },
      body: { type: 'supersedes', reason: 'replace older report chain' },
    });
    expect((updated.result as any).edge).toMatchObject({
      fromPlanetId: later.id,
      toPlanetId: earlier.id,
      type: 'supersedes',
      source: 'manual',
      reason: 'replace older report chain',
    });

    const list = await call(app, 'GET', '/api/planets', { query: { limit: '10' } });
    expect((list.result as any).edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromPlanetId: later.id,
        toPlanetId: earlier.id,
        type: 'supersedes',
        source: 'manual',
      }),
    ]));

    const deleted = await call(app, 'DELETE', '/api/planets/edges/:fromId/:toId', {
      params: { fromId: later.id, toId: earlier.id },
    });
    expect((deleted.result as any)).toEqual({ ok: true });

    const afterDelete = await call(app, 'GET', '/api/planets', { query: { limit: '10' } });
    expect((afterDelete.result as any).edges).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromPlanetId: later.id,
        toPlanetId: earlier.id,
        source: 'manual',
      }),
    ]));
  });

  it('returns 404 for missing planets and 400 for invalid edge input', async () => {
    const app = new FakeFastify();
    const office = new CrocOffice({ backendRoot: '.' }, process.cwd());
    const metaStore = new MemoryPlanetMetaStore();
    const edgeStore = new MemoryPlanetEdgeStore();
    const first = office.createTask('scan', 'Scan backend', [
      { key: 'receive', label: 'Receive task' },
      { key: 'scan', label: 'Scan backend' },
    ]);
    const second = office.createTask('report', 'Create report', [
      { key: 'receive', label: 'Receive task' },
      { key: 'report', label: 'Create report' },
    ]);
    registerPlanetRoutes(app as any, office, metaStore, edgeStore);

    const missingPlanet = await call(app, 'GET', '/api/planets/:id', { params: { id: 'missing' } });
    expect(missingPlanet.reply.statusCode).toBe(404);
    expect(missingPlanet.reply.payload).toEqual({ error: 'Planet not found' });

    const invalidType = await call(app, 'POST', '/api/planets/edges', {
      body: { from: second.id, to: first.id, type: 'invalid-type' },
    });
    expect(invalidType.reply.statusCode).toBe(400);
    expect(invalidType.reply.payload).toEqual({ error: 'Invalid edge type' });

    const invalidEdge = await call(app, 'POST', '/api/planets/edges', {
      body: { from: 'a', to: 'a', type: 'invalid-type' },
    });
    expect(invalidEdge.reply.statusCode).toBe(400);
    expect(invalidEdge.reply.payload).toEqual({ error: 'Invalid edge endpoints' });
  });
});
