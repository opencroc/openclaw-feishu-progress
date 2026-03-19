import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { FilePlanetEdgeStore } from './edge-store.js';

describe('FilePlanetEdgeStore', () => {
  it('persists manual edges and lets manual values override auto edges', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opencroc-edge-store-'));
    const filePath = join(dir, 'planet-edges.json');
    const store = new FilePlanetEdgeStore(filePath);

    store.upsertManual({
      fromPlanetId: 'report-1',
      toPlanetId: 'scan-1',
      type: 'depends-on',
      reason: 'manual relationship',
    });

    const restored = new FilePlanetEdgeStore(filePath);
    expect(restored.listManual()).toEqual([
      expect.objectContaining({
        fromPlanetId: 'report-1',
        toPlanetId: 'scan-1',
        type: 'depends-on',
        source: 'manual',
        confidence: 1,
      }),
    ]);

    const merged = restored.getMerged([
      {
        fromPlanetId: 'report-1',
        toPlanetId: 'scan-1',
        type: 'related-to',
        source: 'auto',
        confidence: 0.82,
      },
      {
        fromPlanetId: 'analysis-1',
        toPlanetId: 'scan-1',
        type: 'depends-on',
        source: 'auto',
        confidence: 0.64,
      },
    ]);

    expect(merged).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromPlanetId: 'report-1',
        toPlanetId: 'scan-1',
        type: 'depends-on',
        source: 'manual',
      }),
      expect.objectContaining({
        fromPlanetId: 'analysis-1',
        toPlanetId: 'scan-1',
        type: 'depends-on',
        source: 'auto',
      }),
    ]));
  });

  it('removes manual edges durably', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opencroc-edge-remove-'));
    const filePath = join(dir, 'planet-edges.json');
    const store = new FilePlanetEdgeStore(filePath);

    store.upsertManual({
      fromPlanetId: 'report-1',
      toPlanetId: 'scan-1',
      type: 'depends-on',
    });

    expect(store.removeManual('report-1', 'scan-1')).toBe(true);

    const restored = new FilePlanetEdgeStore(filePath);
    expect(restored.listManual()).toEqual([]);
  });
});
