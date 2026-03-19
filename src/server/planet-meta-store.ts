import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PlanetPosition {
  x: number;
  y: number;
}

export interface PlanetMetaRecord {
  id: string;
  position?: PlanetPosition;
  archived?: boolean;
  tags?: string[];
}

export interface PlanetMetaStore {
  get(id: string): PlanetMetaRecord | undefined;
  list(): PlanetMetaRecord[];
  save(record: PlanetMetaRecord): PlanetMetaRecord;
}

interface SerializedPlanetMetaFile {
  version: 1;
  planets: PlanetMetaRecord[];
}

function normalizePosition(value: unknown): PlanetPosition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<PlanetPosition>;
  if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') return undefined;
  return { x: candidate.x, y: candidate.y };
}

function normalizeRecord(value: unknown): PlanetMetaRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PlanetMetaRecord>;
  if (typeof candidate.id !== 'string') return null;
  return {
    id: candidate.id,
    position: normalizePosition(candidate.position),
    archived: candidate.archived === true ? true : undefined,
    tags: Array.isArray(candidate.tags)
      ? [...new Set(candidate.tags.map((tag) => typeof tag === 'string' ? tag.trim() : '').filter(Boolean))]
      : [],
  };
}

export class FilePlanetMetaStore implements PlanetMetaStore {
  private readonly records = new Map<string, PlanetMetaRecord>();

  constructor(private readonly filePath: string) {
    for (const record of this.readFile()) {
      this.records.set(record.id, record);
    }
  }

  get(id: string): PlanetMetaRecord | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  list(): PlanetMetaRecord[] {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  save(record: PlanetMetaRecord): PlanetMetaRecord {
    const normalized = normalizeRecord(record);
    if (!normalized) {
      throw new Error('Invalid planet meta record');
    }

    this.records.set(normalized.id, normalized);
    this.persist();
    return structuredClone(normalized);
  }

  private persist(): void {
    const data: SerializedPlanetMetaFile = {
      version: 1,
      planets: [...this.records.values()]
        .map((record) => normalizeRecord(record))
        .filter((record): record is PlanetMetaRecord => Boolean(record))
        .sort((left, right) => left.id.localeCompare(right.id)),
    };

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private readFile(): PlanetMetaRecord[] {
    if (!existsSync(this.filePath)) return [];

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SerializedPlanetMetaFile | PlanetMetaRecord[];
      const planets = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.planets)
          ? parsed.planets
          : [];
      return planets
        .map((record) => normalizeRecord(record))
        .filter((record): record is PlanetMetaRecord => Boolean(record));
    } catch {
      return [];
    }
  }
}
