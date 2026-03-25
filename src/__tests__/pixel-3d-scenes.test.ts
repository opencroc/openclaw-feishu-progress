import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  analyzeFile,
  buildNormalizedName,
  buildPieChartSvg,
  buildReportCsv,
  buildStarCatalog,
  compressGlbWithGltfTransform,
  computeGlbStats,
  createCubeFaceBuffer,
  classifyScene,
  generateOfficeGlb,
  generateStarAtlasGlb,
  parseGlb,
  parseImageSize,
  type ReportRow,
  runTool,
  sphericalToCartesian,
  starLevelFromMagnitude,
  summarizeRows,
} from '../tools/pixel-scene-pipeline';
import {
  canInteract,
  clampOfficePosition,
  resolveOfficeLod,
} from '../web/src/scenes/OfficeScene';
import {
  catalogEntryToPosition,
  clampStarFov,
  groupCatalogByLevel,
  type StarCatalogEntry,
} from '../web/src/scenes/StarMapScene';

describe('pixel 3d pipeline', () => {
  it('classifies office and star assets into scene whitelists', () => {
    expect(classifyScene('kenney_mini-market/Models/GLB format/floor.glb')).toBe('office');
    expect(classifyScene('kenney_prototype-kit/Models/GLB format/shape-cube.glb')).toBe('star');
    expect(classifyScene('kenney_city-kit-suburban_20/Models/GLB format/tree-large.glb')).toBe('discard');
  });

  it('builds deterministic star catalogs with requested size', () => {
    const catalog = buildStarCatalog(12);
    expect(catalog).toHaveLength(12);
    expect(catalog[0].name).toBe('Sirius');
    expect(catalog[11].id).toBe('STAR-00012');
    expect(catalog[11].ra).toBeGreaterThanOrEqual(0);
    expect(catalog[11].ra).toBeLessThanOrEqual(360);
  });

  it('maps magnitudes to star detail levels', () => {
    expect(starLevelFromMagnitude(-1.46)).toBe(0);
    expect(starLevelFromMagnitude(1.2)).toBe(1);
    expect(starLevelFromMagnitude(2.6)).toBe(2);
    expect(starLevelFromMagnitude(3.9)).toBe(3);
    expect(starLevelFromMagnitude(5.8)).toBe(4);
  });

  it('converts spherical coordinates into stable 3d points', () => {
    const point = sphericalToCartesian(90, 0, 10);
    expect(point[0]).toBeCloseTo(0, 6);
    expect(point[1]).toBeCloseTo(0, 6);
    expect(point[2]).toBeCloseTo(10, 6);
  });

  it('normalizes scene names to office and star prefixes', () => {
    expect(buildNormalizedName('office', 'kenney_mini-market/Models/GLB format/floor.glb')).toBe(
      'office_kenney-mini-market-models-glb-format-floor.glb',
    );
    expect(buildNormalizedName('star', 'kenney_planets/Planets/planet00.png')).toBe(
      'star_kenney-planets-planets-planet00.png',
    );
  });

  it('creates parseable cube face png buffers', () => {
    const png = createCubeFaceBuffer(401);
    const imageSize = parseImageSize(png, '.png');
    expect(imageSize).toEqual({ width: 256, height: 256 });
  });

  it('generates office glb with camera and interaction nodes', async () => {
    const buffer = await generateOfficeGlb();
    const parsed = parseGlb(buffer);
    const nodeNames = (parsed.json.nodes as Array<{ name?: string }>).map((node) => node.name);
    expect(nodeNames).toContain('office_camera_main');
    expect(nodeNames).toContain('spawn');
    expect(nodeNames).toContain('interact');
    expect(nodeNames).toContain('exit');
    expect(nodeNames).toContain('office_scene_LOD0');
    expect(nodeNames).toContain('office_scene_LOD1');
    expect(nodeNames).toContain('office_scene_LOD2');
  });

  it('generates star atlas glb with five lod prototype meshes', async () => {
    const buffer = await generateStarAtlasGlb();
    const parsed = parseGlb(buffer);
    const meshNames = (parsed.json.nodes as Array<{ name?: string }>).map((node) => node.name);
    expect(meshNames).toContain('star_L0');
    expect(meshNames).toContain('star_L1');
    expect(meshNames).toContain('star_L2');
    expect(meshNames).toContain('star_L3');
    expect(meshNames).toContain('star_L4');
  });

  it('computes glb stats and analyzes generated files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pixel-scenes-'));
    try {
      const officePath = join(directory, 'office.glb');
      const atlasPath = join(directory, 'star.glb');
      const cubePath = join(directory, 'cube.png');
      await writeFile(officePath, await generateOfficeGlb());
      await writeFile(atlasPath, await generateStarAtlasGlb());
      await writeFile(cubePath, createCubeFaceBuffer(402));

      const officeStats = await computeGlbStats(officePath);
      const officeRow = await analyzeFile(officePath);
      const cubeRow = await analyzeFile(cubePath);

      expect(officeStats.tris).toBeGreaterThan(0);
      expect(officeRow?.kind).toBe('model');
      expect(officeRow?.strictAccepted).toBe(false);
      expect(cubeRow?.kind).toBe('texture');
      expect(cubeRow?.textureMax).toBe(256);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes csv, pie chart and summary output for report rows', () => {
    const rows: ReportRow[] = [
      {
        sourcePath: 'office/floor.glb',
        scene: 'office',
        normalizedName: 'office_floor.glb',
        kind: 'model',
        extension: '.glb',
        sizeBytes: 100,
        tris: 120,
        textureWidth: null,
        textureHeight: null,
        textureMax: null,
        paletteCompatible: true,
        metalnessFree: true,
        externalDependencies: false,
        namingNormalized: true,
        selected: true,
        strictAccepted: true,
        accepted: true,
        requiresFixup: false,
        reason: 'ok',
        compressionSuggestion: 'none',
      },
      {
        sourcePath: 'star/planet.png',
        scene: 'star',
        normalizedName: 'star_planet.png',
        kind: 'texture',
        extension: '.png',
        sizeBytes: 100,
        tris: null,
        textureWidth: 512,
        textureHeight: 512,
        textureMax: 512,
        paletteCompatible: false,
        metalnessFree: true,
        externalDependencies: false,
        namingNormalized: true,
        selected: true,
        strictAccepted: false,
        accepted: true,
        requiresFixup: true,
        reason: 'fixup',
        compressionSuggestion: 'ktx2',
      },
    ];

    const csv = buildReportCsv(rows);
    const svg = buildPieChartSvg(rows);
    const summary = summarizeRows(rows);

    expect(csv).toContain('strictAccepted');
    expect(csv).toContain('requiresFixup');
    expect(svg).toContain('严格合格');
    expect(svg).toContain('需修复后交付');
    expect(summary).toContain('严格合格素材数：1');
    expect(summary).toContain('可修复后交付素材数：1');
  });

  it('runs gltf-transform compression on generated glbs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pixel-scenes-compress-'));
    try {
      const inputPath = join(directory, 'office.raw.glb');
      const outputPath = join(directory, 'office.packed.glb');
      await writeFile(inputPath, await generateOfficeGlb());

      await compressGlbWithGltfTransform(inputPath, outputPath);

      const outputStats = await stat(outputPath);
      const outputBuffer = await readFile(outputPath);
      const parsed = parseGlb(outputBuffer);

      expect(outputStats.size).toBeGreaterThan(0);
      expect(JSON.stringify(parsed.json.extensionsUsed ?? [])).toMatch(/draco|meshopt/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('runs shell tooling helper successfully', async () => {
    await expect(runTool('node', ['-e', "process.stdout.write('ok')"])).resolves.toBeUndefined();
  });
});

describe('office scene helpers', () => {
  it('switches lod ranges at 15m and 30m', () => {
    expect(resolveOfficeLod(14.9)).toBe('LOD0');
    expect(resolveOfficeLod(20)).toBe('LOD1');
    expect(resolveOfficeLod(31)).toBe('LOD2');
  });

  it('clamps the player inside office bounds', () => {
    const clamped = clampOfficePosition(new THREE.Vector3(10, 0, -10));
    expect(clamped.x).toBe(5.2);
    expect(clamped.y).toBe(1.65);
    expect(clamped.z).toBe(-4.4);
  });

  it('detects interaction radius on the floor plane', () => {
    const player = new THREE.Vector3(0, 1.65, 0.5);
    const target = new THREE.Vector3(0.3, 0, 0.2);
    expect(canInteract(player, target, 1)).toBe(true);
    expect(canInteract(player, new THREE.Vector3(4, 0, 4), 1)).toBe(false);
  });
});

describe('star map helpers', () => {
  const sampleCatalog: StarCatalogEntry[] = [
    {
      id: 'STAR-00001',
      name: 'Alpha',
      ra: 0,
      dec: 0,
      distanceLy: 10,
      spectralType: 'G2V',
      magnitude: 0.2,
      level: 0,
      encyclopediaUrl: 'https://example.com/alpha',
    },
    {
      id: 'STAR-00002',
      name: 'Beta',
      ra: 90,
      dec: 45,
      distanceLy: 1200,
      spectralType: 'A0V',
      magnitude: 3.2,
      level: 3,
      encyclopediaUrl: 'https://example.com/beta',
    },
  ];

  it('clamps star map fov to the allowed range', () => {
    expect(clampStarFov(2)).toBe(5);
    expect(clampStarFov(58)).toBe(58);
    expect(clampStarFov(160)).toBe(120);
  });

  it('groups star entries by magnitude level', () => {
    const grouped = groupCatalogByLevel(sampleCatalog);
    expect(grouped[0]).toHaveLength(1);
    expect(grouped[3]).toHaveLength(1);
    expect(grouped[4]).toHaveLength(0);
  });

  it('projects catalog entries into a 3d starfield radius', () => {
    const point = catalogEntryToPosition(sampleCatalog[1]);
    expect(point.length()).toBeGreaterThan(80);
    expect(point.y).toBeGreaterThan(0);
  });
});
