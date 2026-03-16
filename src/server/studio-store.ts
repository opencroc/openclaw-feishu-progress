import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KnowledgeGraph, RiskAnnotation } from '../graph/types.js';

function isSerializedSnapshotFile(value: SerializedSnapshotFile | StudioProjectStore): value is SerializedSnapshotFile {
  return 'snapshots' in value && Array.isArray(value.snapshots);
}

export interface StudioProjectStore {
  graph: KnowledgeGraph | null;
  risks: RiskAnnotation[];
  scanTime: number;
  source: string;
}

export interface StudioSnapshotStore {
  load(): StudioProjectStore | null;
  save(snapshot: StudioProjectStore): void;
  list(): StudioSnapshotSummary[];
  loadById(id: string): StudioProjectStore | null;
  rename(id: string, name: string): boolean;
  delete(id: string): boolean;
  pin(id: string, pinned: boolean): boolean;
  updateTags(id: string, tags: string[]): boolean;
}

export interface StudioSnapshotRecord extends StudioProjectStore {
  id: string;
  name: string;
  pinned: boolean;
  tags: string[];
}

export interface StudioSnapshotSummary {
  id: string;
  name: string;
  source: string;
  scanTime: number;
  nodeCount: number;
  riskCount: number;
  current: boolean;
  pinned: boolean;
  tags: string[];
}

interface SerializedSnapshotFile {
  version: 2;
  currentSnapshotId: string | null;
  snapshots: StudioSnapshotRecord[];
}

export const EMPTY_STUDIO_STORE: StudioProjectStore = {
  graph: null,
  risks: [],
  scanTime: 0,
  source: '',
};

export class FileStudioSnapshotStore implements StudioSnapshotStore {
  private readonly filePath: string;
  private readonly maxSnapshots: number;

  constructor(filePath: string, maxSnapshots = 12) {
    this.filePath = filePath;
    this.maxSnapshots = maxSnapshots;
  }

  load(): StudioProjectStore | null {
    const data = this.readFile();
    if (!data || !data.currentSnapshotId) return null;
    const current = data.snapshots.find((snapshot) => snapshot.id === data.currentSnapshotId);
    return current ? this.toProjectStore(current) : null;
  }

  save(snapshot: StudioProjectStore): void {
    const data = this.readFile() ?? { version: 2, currentSnapshotId: null, snapshots: [] };
    const record = this.toSnapshotRecord(snapshot);
    data.currentSnapshotId = record.id;
    data.snapshots = [record, ...data.snapshots].slice(0, this.maxSnapshots);

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  list(): StudioSnapshotSummary[] {
    const data = this.readFile();
    if (!data) return [];
    return data.snapshots.map((snapshot) => ({
      id: snapshot.id,
      name: snapshot.name,
      source: snapshot.source,
      scanTime: snapshot.scanTime,
      nodeCount: snapshot.graph?.nodes.length ?? 0,
      riskCount: snapshot.risks.length,
      current: snapshot.id === data.currentSnapshotId,
      pinned: Boolean(snapshot.pinned),
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    })).sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.scanTime - left.scanTime;
    });
  }

  loadById(id: string): StudioProjectStore | null {
    const data = this.readFile();
    if (!data) return null;

    const record = data.snapshots.find((snapshot) => snapshot.id === id);
    if (!record) return null;

    data.currentSnapshotId = record.id;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    return this.toProjectStore(record);
  }

  rename(id: string, name: string): boolean {
    const nextName = name.trim();
    if (!nextName) return false;

    const data = this.readFile();
    if (!data) return false;

    const record = data.snapshots.find((snapshot) => snapshot.id === id);
    if (!record) return false;

    record.name = nextName;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }

  delete(id: string): boolean {
    const data = this.readFile();
    if (!data) return false;

    const nextSnapshots = data.snapshots.filter((snapshot) => snapshot.id !== id);
    if (nextSnapshots.length === data.snapshots.length) return false;

    data.snapshots = nextSnapshots;
    if (data.currentSnapshotId === id) {
      data.currentSnapshotId = nextSnapshots[0]?.id ?? null;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }

  pin(id: string, pinned: boolean): boolean {
    const data = this.readFile();
    if (!data) return false;

    const record = data.snapshots.find((snapshot) => snapshot.id === id);
    if (!record) return false;

    record.pinned = pinned;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }

  updateTags(id: string, tags: string[]): boolean {
    const data = this.readFile();
    if (!data) return false;

    const record = data.snapshots.find((snapshot) => snapshot.id === id);
    if (!record) return false;

    record.tags = this.normalizeTags(tags);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }

  private readFile(): SerializedSnapshotFile | null {
    if (!existsSync(this.filePath)) return null;

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SerializedSnapshotFile | StudioProjectStore;
      return this.normalize(parsed);
    } catch {
      return null;
    }
  }

  private normalize(parsed: SerializedSnapshotFile | StudioProjectStore): SerializedSnapshotFile {
    if (isSerializedSnapshotFile(parsed)) {
      return {
        version: 2,
        currentSnapshotId: typeof parsed.currentSnapshotId === 'string' ? parsed.currentSnapshotId : null,
        snapshots: parsed.snapshots.map((snapshot) => ({
          id: snapshot.id,
          name: snapshot.name,
          pinned: Boolean(snapshot.pinned),
          tags: this.normalizeTags(snapshot.tags),
          graph: snapshot.graph ?? null,
          risks: Array.isArray(snapshot.risks) ? snapshot.risks : [],
          scanTime: typeof snapshot.scanTime === 'number' ? snapshot.scanTime : 0,
          source: typeof snapshot.source === 'string' ? snapshot.source : '',
        })),
      };
    }

    const legacyStore = parsed as StudioProjectStore;
    const legacy = this.toSnapshotRecord({
      graph: legacyStore.graph ?? null,
      risks: Array.isArray(legacyStore.risks) ? legacyStore.risks : [],
      scanTime: typeof legacyStore.scanTime === 'number' ? legacyStore.scanTime : 0,
      source: typeof legacyStore.source === 'string' ? legacyStore.source : '',
    });

    return {
      version: 2,
      currentSnapshotId: legacy.id,
      snapshots: [legacy],
    };
  }

  private toSnapshotRecord(snapshot: StudioProjectStore): StudioSnapshotRecord {
    const name = snapshot.graph?.projectInfo?.name || this.deriveName(snapshot.source);
    return {
      id: `${snapshot.scanTime || Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name,
      pinned: false,
      tags: [],
      graph: snapshot.graph ?? null,
      risks: Array.isArray(snapshot.risks) ? snapshot.risks : [],
      scanTime: typeof snapshot.scanTime === 'number' ? snapshot.scanTime : Date.now(),
      source: typeof snapshot.source === 'string' ? snapshot.source : '',
    };
  }

  private toProjectStore(snapshot: StudioSnapshotRecord): StudioProjectStore {
    return {
      graph: snapshot.graph ?? null,
      risks: Array.isArray(snapshot.risks) ? snapshot.risks : [],
      scanTime: typeof snapshot.scanTime === 'number' ? snapshot.scanTime : 0,
      source: typeof snapshot.source === 'string' ? snapshot.source : '',
    };
  }

  private deriveName(source: string): string {
    if (!source) return 'unknown-project';
    const parts = source.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || source;
  }

  private normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags
      .map((tag) => typeof tag === 'string' ? tag.trim() : '')
      .filter(Boolean)
    )];
  }
}