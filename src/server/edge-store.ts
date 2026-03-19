import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PlanetEdge, PlanetEdgeType } from './planet-edge-inference.js';

export interface PlanetEdgeStore {
  listManual(): PlanetEdge[];
  upsertManual(edge: { fromPlanetId: string; toPlanetId: string; type: PlanetEdgeType; reason?: string }): PlanetEdge;
  removeManual(fromPlanetId: string, toPlanetId: string): boolean;
  getMerged(autoEdges: PlanetEdge[]): PlanetEdge[];
}

interface SerializedEdgeFile {
  version: 1;
  manualEdges: PlanetEdge[];
}

function normalizeEdge(value: unknown): PlanetEdge | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PlanetEdge>;
  if (
    typeof candidate.fromPlanetId !== 'string' ||
    typeof candidate.toPlanetId !== 'string' ||
    (candidate.type !== 'depends-on' && candidate.type !== 'related-to' && candidate.type !== 'supersedes')
  ) {
    return null;
  }

  return {
    fromPlanetId: candidate.fromPlanetId,
    toPlanetId: candidate.toPlanetId,
    type: candidate.type,
    confidence: typeof candidate.confidence === 'number' ? Math.max(0, Math.min(candidate.confidence, 1)) : 1,
    source: candidate.source === 'auto' ? 'auto' : 'manual',
    reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
  };
}

function edgeKey(fromPlanetId: string, toPlanetId: string): string {
  return `${fromPlanetId}::${toPlanetId}`;
}

export class FilePlanetEdgeStore implements PlanetEdgeStore {
  private readonly manualEdges = new Map<string, PlanetEdge>();

  constructor(private readonly filePath: string) {
    for (const edge of this.readFile()) {
      this.manualEdges.set(edgeKey(edge.fromPlanetId, edge.toPlanetId), edge);
    }
  }

  listManual(): PlanetEdge[] {
    return [...this.manualEdges.values()].map((edge) => structuredClone(edge));
  }

  upsertManual(edge: { fromPlanetId: string; toPlanetId: string; type: PlanetEdgeType; reason?: string }): PlanetEdge {
    const nextEdge: PlanetEdge = {
      fromPlanetId: edge.fromPlanetId,
      toPlanetId: edge.toPlanetId,
      type: edge.type,
      confidence: 1,
      source: 'manual',
      reason: edge.reason,
    };
    this.manualEdges.set(edgeKey(nextEdge.fromPlanetId, nextEdge.toPlanetId), nextEdge);
    this.persist();
    return structuredClone(nextEdge);
  }

  removeManual(fromPlanetId: string, toPlanetId: string): boolean {
    const removed = this.manualEdges.delete(edgeKey(fromPlanetId, toPlanetId));
    if (removed) this.persist();
    return removed;
  }

  getMerged(autoEdges: PlanetEdge[]): PlanetEdge[] {
    const merged = new Map<string, PlanetEdge>();

    for (const edge of autoEdges) {
      merged.set(edgeKey(edge.fromPlanetId, edge.toPlanetId), structuredClone(edge));
    }

    for (const edge of this.manualEdges.values()) {
      merged.set(edgeKey(edge.fromPlanetId, edge.toPlanetId), structuredClone(edge));
    }

    return [...merged.values()].sort((left, right) => {
      if (left.source !== right.source) return left.source === 'manual' ? -1 : 1;
      return right.confidence - left.confidence;
    });
  }

  private persist(): void {
    const data: SerializedEdgeFile = {
      version: 1,
      manualEdges: [...this.manualEdges.values()]
        .map((edge) => normalizeEdge(edge))
        .filter((edge): edge is PlanetEdge => Boolean(edge))
        .sort((left, right) => edgeKey(left.fromPlanetId, left.toPlanetId).localeCompare(edgeKey(right.fromPlanetId, right.toPlanetId))),
    };

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private readFile(): PlanetEdge[] {
    if (!existsSync(this.filePath)) return [];

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SerializedEdgeFile | PlanetEdge[];
      const edges = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.manualEdges)
          ? parsed.manualEdges
          : [];

      return edges
        .map((edge) => normalizeEdge(edge))
        .filter((edge): edge is PlanetEdge => Boolean(edge))
        .map((edge) => ({ ...edge, source: 'manual', confidence: 1 }));
    } catch {
      return [];
    }
  }
}
