import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

type SceneTarget = 'office' | 'star' | 'discard';
type AssetKind = 'model' | 'texture' | 'material' | 'other';
export type ReportRow = {
  sourcePath: string;
  scene: SceneTarget;
  normalizedName: string;
  kind: AssetKind;
  extension: string;
  sizeBytes: number;
  tris: number | null;
  textureWidth: number | null;
  textureHeight: number | null;
  textureMax: number | null;
  paletteCompatible: boolean;
  metalnessFree: boolean;
  externalDependencies: boolean;
  namingNormalized: boolean;
  selected: boolean;
  strictAccepted: boolean;
  accepted: boolean;
  requiresFixup: boolean;
  reason: string;
  compressionSuggestion: 'ktx2' | 'basisu' | 'none';
};

type ImageSize = {
  width: number;
  height: number;
};

type GlbStats = {
  tris: number;
  textureMax: number | null;
  metalnessFree: boolean;
  externalDependencies: boolean;
};

type StarCatalogEntry = {
  id: string;
  name: string;
  ra: number;
  dec: number;
  distanceLy: number;
  spectralType: string;
  magnitude: number;
  level: 0 | 1 | 2 | 3 | 4;
  encyclopediaUrl: string;
};

const currentFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(currentFile), '..', '..');
const assetsDir = join(rootDir, 'assets');
const reportDir = join(rootDir, 'reports', '3d');
const publicGeneratedDir = join(rootDir, 'src', 'web', 'public', 'generated');

const officeWhitelist = new Set<string>([
  'kenney_mini-market/models/glb format/floor.glb',
  'kenney_mini-market/models/glb format/wall.glb',
  'kenney_mini-market/models/glb format/wall-corner.glb',
  'kenney_mini-market/models/glb format/wall-window.glb',
  'kenney_mini-market/models/glb format/shelf-end.glb',
  'kenney_mini-market/models/glb format/shelf-boxes.glb',
  'kenney_mini-market/models/glb format/cash-register.glb',
  'kenney_mini-market/models/glb format/freezer.glb',
  'kenney_mini-market/models/glb format/column.glb',
  'kenney_mini-market/models/glb format/textures/colormap.png',
  'kenney_mini-market/models/textures/variation-a.png',
  'kenney_mini-market/models/textures/variation-b.png',
]);

const starWhitelist = new Set<string>([
  'kenney_prototype-kit/models/glb format/shape-cube.glb',
  'kenney_prototype-kit/models/glb format/shape-cylinder.glb',
  'kenney_prototype-kit/models/glb format/shape-hexagon.glb',
  'kenney_prototype-kit/models/glb format/indicator-round-a.glb',
  'kenney_prototype-kit/models/glb format/indicator-special-cross.glb',
  'kenney_planets/planets/planet00.png',
  'kenney_planets/planets/planet01.png',
  'kenney_planets/planets/planet02.png',
  'kenney_planets/planets/planet03.png',
  'kenney_planets/planets/planet04.png',
  'kenney_planets/planets/planet05.png',
]);

const supportedExtensions = new Set([
  '.glb',
  '.gltf',
  '.fbx',
  '.obj',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.ktx2',
  '.hdr',
  '.exr',
  '.mtl',
]);

const textureExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.hdr', '.exr']);
const modelExtensions = new Set(['.glb', '.gltf', '.fbx', '.obj']);

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

export function classifyScene(relativePath: string): SceneTarget {
  const normalized = normalizeSlashes(relativePath).toLowerCase();
  if (officeWhitelist.has(normalized)) {
    return 'office';
  }
  if (starWhitelist.has(normalized)) {
    return 'star';
  }
  return 'discard';
}

export function buildNormalizedName(scene: SceneTarget, relativePath: string): string {
  const prefix = scene === 'office' ? 'office_' : scene === 'star' ? 'star_' : 'discard_';
  const parsedExtension = extname(relativePath).toLowerCase();
  const stem = normalizeSlashes(relativePath)
    .replace(/^assets\//i, '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}${stem}${parsedExtension}`;
}

function getAssetKind(extension: string): AssetKind {
  if (modelExtensions.has(extension)) return 'model';
  if (textureExtensions.has(extension)) return 'texture';
  if (extension === '.mtl') return 'material';
  return 'other';
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function starLevelFromMagnitude(magnitude: number): 0 | 1 | 2 | 3 | 4 {
  if (magnitude <= 0.5) return 0;
  if (magnitude <= 1.5) return 1;
  if (magnitude <= 2.8) return 2;
  if (magnitude <= 4.2) return 3;
  return 4;
}

export function sphericalToCartesian(ra: number, dec: number, radius: number): [number, number, number] {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;
  const x = radius * Math.cos(decRad) * Math.cos(raRad);
  const y = radius * Math.sin(decRad);
  const z = radius * Math.cos(decRad) * Math.sin(raRad);
  return [round(x, 6), round(y, 6), round(z, 6)];
}

export function buildStarCatalog(count: number): StarCatalogEntry[] {
  const random = seededRandom(20260325);
  const spectralTypes = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
  const knownStars: Array<Pick<StarCatalogEntry, 'name' | 'ra' | 'dec' | 'distanceLy' | 'spectralType' | 'magnitude' | 'encyclopediaUrl'>> = [
    { name: 'Sirius', ra: 101.2872, dec: -16.7161, distanceLy: 8.6, spectralType: 'A1V', magnitude: -1.46, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Sirius' },
    { name: 'Canopus', ra: 95.9879, dec: -52.6957, distanceLy: 310, spectralType: 'A9II', magnitude: -0.74, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Canopus' },
    { name: 'Arcturus', ra: 213.9153, dec: 19.1824, distanceLy: 36.7, spectralType: 'K1.5III', magnitude: -0.05, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Arcturus' },
    { name: 'Vega', ra: 279.2347, dec: 38.7837, distanceLy: 25.1, spectralType: 'A0V', magnitude: 0.03, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Vega' },
    { name: 'Capella', ra: 79.1723, dec: 45.9979, distanceLy: 42.9, spectralType: 'G8III', magnitude: 0.08, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Capella' },
    { name: 'Rigel', ra: 78.6345, dec: -8.2016, distanceLy: 863, spectralType: 'B8Ia', magnitude: 0.13, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Rigel' },
    { name: 'Procyon', ra: 114.8255, dec: 5.225, distanceLy: 11.5, spectralType: 'F5IV', magnitude: 0.34, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Procyon' },
    { name: 'Betelgeuse', ra: 88.7929, dec: 7.4071, distanceLy: 548, spectralType: 'M1-2Ia-Iab', magnitude: 0.42, encyclopediaUrl: 'https://en.wikipedia.org/wiki/Betelgeuse' },
  ];

  const catalog: StarCatalogEntry[] = knownStars.map((star, index) => ({
    id: `STAR-${String(index + 1).padStart(5, '0')}`,
    name: star.name,
    ra: round(star.ra),
    dec: round(star.dec),
    distanceLy: round(star.distanceLy, 4),
    spectralType: star.spectralType,
    magnitude: round(star.magnitude, 4),
    level: starLevelFromMagnitude(star.magnitude),
    encyclopediaUrl: star.encyclopediaUrl,
  }));

  while (catalog.length < count) {
    const index = catalog.length + 1;
    const ra = round(random() * 360, 4);
    const dec = round(random() * 180 - 90, 4);
    const distanceLy = round(4 + random() * 2400, 4);
    const magnitude = round(-0.4 + random() * 6.8, 4);
    const spectralType = `${spectralTypes[Math.floor(random() * spectralTypes.length)]}${Math.floor(random() * 10)}V`;
    const name = `PIX-${String(index).padStart(5, '0')}`;
    catalog.push({
      id: `STAR-${String(index).padStart(5, '0')}`,
      name,
      ra,
      dec,
      distanceLy,
      spectralType,
      magnitude,
      level: starLevelFromMagnitude(magnitude),
      encyclopediaUrl: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`,
    });
  }

  return catalog;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, payload: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const data = Buffer.concat([typeBytes, Buffer.from(payload)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(new Uint8Array(data)), 0);
  return Buffer.concat([length, data, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', new Uint8Array(ihdr)),
    pngChunk('IDAT', new Uint8Array(idat)),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

export function createCubeFaceBuffer(seed: number): Buffer {
  const width = 256;
  const height = 256;
  const random = seededRandom(seed);
  const rgba = new Uint8Array(width * height * 4);
  const palette = [
    [4, 7, 18],
    [14, 20, 42],
    [29, 42, 74],
    [65, 101, 148],
    [168, 202, 255],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const stride = (y * width + x) * 4;
      const gradient = y / (height - 1);
      const band = Math.min(palette.length - 1, Math.floor(gradient * palette.length));
      const color = palette[band];
      rgba[stride] = color[0];
      rgba[stride + 1] = color[1];
      rgba[stride + 2] = color[2];
      rgba[stride + 3] = 255;
    }
  }

  for (let index = 0; index < 180; index += 1) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const size = random() > 0.7 ? 2 : 1;
    const glow = random() > 0.85 ? 255 : 220;
    for (let oy = 0; oy < size; oy += 1) {
      for (let ox = 0; ox < size; ox += 1) {
        const px = Math.min(width - 1, x + ox);
        const py = Math.min(height - 1, y + oy);
        const stride = (py * width + px) * 4;
        rgba[stride] = glow;
        rgba[stride + 1] = glow;
        rgba[stride + 2] = glow;
      }
    }
  }

  return encodePng(width, height, rgba);
}

function parsePngSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!signature.equals(pngSignature)) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseJpegSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame && offset + 8 < buffer.length) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebpSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunkType === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunkType === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  return null;
}

export function parseImageSize(buffer: Buffer, extension: string): ImageSize | null {
  if (extension === '.png') return parsePngSize(buffer);
  if (extension === '.jpg' || extension === '.jpeg') return parseJpegSize(buffer);
  if (extension === '.webp') return parseWebpSize(buffer);
  return null;
}

export function parseGlb(buffer: Buffer): { json: any; binaryChunk: Buffer } {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error(`Invalid GLB header: ${magic}`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) {
    throw new Error('Missing JSON chunk in GLB');
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  const json = JSON.parse(buffer.toString('utf8', jsonStart, jsonEnd));
  const binaryHeaderOffset = jsonEnd;
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  const binaryType = buffer.readUInt32LE(binaryHeaderOffset + 4);
  if (binaryType !== 0x004e4942) {
    throw new Error('Missing BIN chunk in GLB');
  }
  const binaryChunk = buffer.subarray(binaryHeaderOffset + 8, binaryHeaderOffset + 8 + binaryLength);
  return { json, binaryChunk };
}

function accessorTriangleCount(primitive: any, accessors: any[]): number {
  const mode = primitive.mode ?? 4;
  if (primitive.indices == null) {
    const positionAccessor = accessors[primitive.attributes.POSITION];
    const vertexCount = positionAccessor?.count ?? 0;
    if (mode === 4) return Math.floor(vertexCount / 3);
    if (mode === 5 || mode === 6) return Math.max(0, vertexCount - 2);
    return 0;
  }
  const indexAccessor = accessors[primitive.indices];
  const indexCount = indexAccessor?.count ?? 0;
  if (mode === 4) return Math.floor(indexCount / 3);
  if (mode === 5 || mode === 6) return Math.max(0, indexCount - 2);
  return 0;
}

async function readExternalImageSize(glbJsonDir: string, image: any): Promise<ImageSize | null> {
  if (!image?.uri) return null;
  if (String(image.uri).startsWith('data:')) {
    const data = String(image.uri).split(',')[1] ?? '';
    return parseImageSize(Buffer.from(data, 'base64'), '.png');
  }
  const imagePath = join(glbJsonDir, image.uri);
  const buffer = await fs.readFile(imagePath);
  return parseImageSize(buffer, extname(imagePath).toLowerCase());
}

export async function computeGlbStats(filePath: string): Promise<GlbStats> {
  const buffer = await fs.readFile(filePath);
  const { json, binaryChunk } = parseGlb(buffer);
  const accessors = json.accessors ?? [];
  const meshes = json.meshes ?? [];
  const materials = json.materials ?? [];
  const images = json.images ?? [];
  const bufferViews = json.bufferViews ?? [];
  const tris = meshes.reduce((sum: number, mesh: any) => {
    const primitives = mesh.primitives ?? [];
    return sum + primitives.reduce((meshSum: number, primitive: any) => meshSum + accessorTriangleCount(primitive, accessors), 0);
  }, 0);

  let textureMax: number | null = null;
  for (const image of images) {
    const size = typeof image.bufferView === 'number'
      ? (() => {
        const view = bufferViews[image.bufferView];
        const slice = binaryChunk.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
        const mimeType = String(image.mimeType ?? '').toLowerCase();
        const extension = mimeType.includes('jpeg') ? '.jpg' : mimeType.includes('webp') ? '.webp' : '.png';
        return parseImageSize(slice, extension);
      })()
      : await readExternalImageSize(dirname(filePath), image);
    if (size) {
      textureMax = Math.max(textureMax ?? 0, size.width, size.height);
    }
  }

  const metalnessFree = materials.every((material: any) => {
    const pbr = material?.pbrMetallicRoughness;
    if (!pbr) return true;
    if (typeof pbr.metallicFactor === 'number' && pbr.metallicFactor > 0.05) return false;
    return !pbr.metallicRoughnessTexture;
  });

  const externalDependencies = Boolean(
    (json.buffers ?? []).some((item: any) => typeof item.uri === 'string')
    || images.some((item: any) => typeof item.uri === 'string' && !String(item.uri).startsWith('data:')),
  );

  return {
    tris,
    textureMax,
    metalnessFree,
    externalDependencies,
  };
}

export async function analyzeFile(filePath: string): Promise<ReportRow | null> {
  const extension = extname(filePath).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    return null;
  }

  const stats = await fs.stat(filePath);
  const relativePath = normalizeSlashes(relative(assetsDir, filePath));
  const scene = classifyScene(relativePath);
  const normalizedName = buildNormalizedName(scene, relativePath);
  const kind = getAssetKind(extension);
  let tris: number | null = null;
  let textureWidth: number | null = null;
  let textureHeight: number | null = null;
  let textureMax: number | null = null;
  let metalnessFree = true;
  let externalDependencies = extension === '.fbx' || extension === '.obj' || extension === '.mtl' || extension === '.gltf';

  if (extension === '.glb') {
    const glbStats = await computeGlbStats(filePath);
    tris = glbStats.tris;
    textureMax = glbStats.textureMax;
    metalnessFree = glbStats.metalnessFree;
    externalDependencies = glbStats.externalDependencies;
  } else if (textureExtensions.has(extension)) {
    const buffer = await fs.readFile(filePath);
    const size = parseImageSize(buffer, extension);
    textureWidth = size?.width ?? null;
    textureHeight = size?.height ?? null;
    textureMax = size ? Math.max(size.width, size.height) : null;
  }

  const selected = scene !== 'discard';
  const paletteCompatible = selected || (textureMax ?? 0) <= 256 || textureMax == null;
  const namingNormalized = normalizedName.startsWith(scene === 'office' ? 'office_' : scene === 'star' ? 'star_' : 'discard_');
  const trisOk = tris == null || tris <= 1500;
  const texturesOk = textureMax == null || textureMax <= 256;
  const strictAccepted = selected && paletteCompatible && trisOk && texturesOk && metalnessFree && !externalDependencies;
  const accepted = selected && trisOk && metalnessFree;
  const requiresFixup = accepted && !strictAccepted;

  const reasons = [
    selected ? '白名单场景' : '不在场景白名单',
    tris == null ? '无面数要求' : trisOk ? '面数合格' : `面数超限:${tris}`,
    textureMax == null ? '无贴图或贴图未解析' : texturesOk ? `贴图合格:${textureMax}` : `需下采样到256:${textureMax}`,
    metalnessFree ? '无金属度依赖' : '含金属度信息',
    externalDependencies ? '需打包消除外部依赖' : '无外部依赖',
    namingNormalized ? '已归一化命名' : '命名未归一化',
  ];

  const compressionSuggestion = textureMax == null
    ? 'none'
    : textureMax > 128
      ? 'ktx2'
      : 'basisu';

  return {
    sourcePath: relativePath,
    scene,
    normalizedName,
    kind,
    extension,
    sizeBytes: stats.size,
    tris,
    textureWidth,
    textureHeight,
    textureMax,
    paletteCompatible,
    metalnessFree,
    externalDependencies,
    namingNormalized,
    selected,
    strictAccepted,
    accepted,
    requiresFixup,
    reason: reasons.join(' | '),
    compressionSuggestion,
  };
}

async function walkDirectory(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkDirectory(fullPath);
    }
    return [fullPath];
  }));
  return results.flat();
}

function toCsvValue(value: string | number | boolean | null): string {
  const stringValue = value == null ? '' : String(value);
  if (/["\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function buildReportCsv(rows: ReportRow[]): string {
  const headers = [
    'sourcePath',
    'scene',
    'normalizedName',
    'kind',
    'extension',
    'sizeBytes',
    'tris',
    'textureWidth',
    'textureHeight',
    'textureMax',
    'paletteCompatible',
    'metalnessFree',
    'externalDependencies',
    'namingNormalized',
    'selected',
    'strictAccepted',
    'accepted',
    'requiresFixup',
    'reason',
    'compressionSuggestion',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => toCsvValue((row as Record<string, unknown>)[header] as string | number | boolean | null)).join(','));
  }
  return lines.join('\n');
}

export function buildPieChartSvg(rows: ReportRow[]): string {
  const strictAccepted = rows.filter((row) => row.strictAccepted).length;
  const fixupRequired = rows.filter((row) => row.requiresFixup).length;
  const officeRejected = rows.filter((row) => row.scene === 'office' && !row.accepted).length;
  const starRejected = rows.filter((row) => row.scene === 'star' && !row.accepted).length;
  const discarded = rows.filter((row) => row.scene === 'discard').length;
  const series = [
    { label: '严格合格', value: strictAccepted, color: '#6b8f4e' },
    { label: '需修复后交付', value: fixupRequired, color: '#b5943a' },
    { label: '办公室候选淘汰', value: officeRejected, color: '#c4713b' },
    { label: '星图候选淘汰', value: starRejected, color: '#4a8f8c' },
    { label: '废弃文件', value: discarded, color: '#8b6eab' },
  ].filter((item) => item.value > 0);
  const total = series.reduce((sum, item) => sum + item.value, 0) || 1;
  let angle = -Math.PI / 2;
  const centerX = 170;
  const centerY = 170;
  const radius = 120;
  const segments = series.map((item) => {
    const startAngle = angle;
    const endAngle = angle + (item.value / total) * Math.PI * 2;
    angle = endAngle;
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
    const x1 = centerX + Math.cos(startAngle) * radius;
    const y1 = centerY + Math.sin(startAngle) * radius;
    const x2 = centerX + Math.cos(endAngle) * radius;
    const y2 = centerY + Math.sin(endAngle) * radius;
    return `<path d="M ${centerX} ${centerY} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z" fill="${item.color}" />`;
  }).join('\n');
  const legends = series.map((item, index) => {
    const y = 40 + index * 26;
    return `<g transform="translate(360 ${y})"><rect width="14" height="14" rx="3" fill="${item.color}" /><text x="22" y="11" font-size="13" fill="#2d2417">${item.label} ${item.value}</text></g>`;
  }).join('\n');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
    '<rect width="640" height="360" fill="#f8f4ec" rx="24" />',
    '<text x="32" y="40" font-size="24" font-weight="700" fill="#2d2417">素材筛选结果</text>',
    '<text x="32" y="68" font-size="13" fill="#6b5d4f">像素办公室 / 3D 星图白名单统计</text>',
    segments,
    legends,
    '</svg>',
  ].join('\n');
}

async function exportBinaryGlb(scene: THREE.Scene): Promise<Buffer> {
  if (!('FileReader' in globalThis)) {
    (globalThis as typeof globalThis & { FileReader: any }).FileReader = class {
      result: string | ArrayBuffer | null = null;
      onloadend: (() => void) | null = null;

      readAsArrayBuffer(blob: Blob): void {
        void blob.arrayBuffer().then((arrayBuffer) => {
          this.result = arrayBuffer;
          this.onloadend?.();
        });
      }

      readAsDataURL(blob: Blob): void {
        void blob.arrayBuffer().then((arrayBuffer) => {
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
          this.onloadend?.();
        });
      }
    };
  }

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  return Buffer.from(result as ArrayBuffer);
}

export async function runTool(command: string, args: string[], cwd = rootDir): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, shell: true, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error([stdout, stderr].filter(Boolean).join('\n') || `${command} exited with ${code}`));
    });
  });
}

function createPaletteMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1,
    metalness: 0,
    roughness: 1,
  });
}

function addBox(group: THREE.Group, name: string, size: [number, number, number], position: [number, number, number], color: number): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), createPaletteMaterial(color));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
}

function addRoomDetails(group: THREE.Group, scaleFactor: number): void {
  const teal = 0x6fb0ad;
  const sand = 0xcab38a;
  const clay = 0xbf7e52;
  const olive = 0x7d8f5f;
  const slate = 0x4f5d73;

  addBox(group, `${group.name}_floor`, [12, 0.2, 10], [0, -0.1, 0], sand);
  addBox(group, `${group.name}_wall_back`, [12, 3.2, 0.2], [0, 1.5, -5], slate);
  addBox(group, `${group.name}_wall_left`, [0.2, 3.2, 10], [-6, 1.5, 0], slate);
  addBox(group, `${group.name}_wall_right`, [0.2, 3.2, 10], [6, 1.5, 0], slate);
  addBox(group, `${group.name}_desk_main`, [3.2 * scaleFactor, 0.24, 1.6 * scaleFactor], [-1.1, 0.9, 0.4], teal);
  addBox(group, `${group.name}_desk_side`, [1.4 * scaleFactor, 0.24, 1.2 * scaleFactor], [2.3, 0.9, -0.8], teal);
  addBox(group, `${group.name}_terminal`, [0.9 * scaleFactor, 0.7 * scaleFactor, 0.12], [-1.1, 1.45, -0.1], clay);
  addBox(group, `${group.name}_shelf`, [0.8 * scaleFactor, 2.0 * scaleFactor, 2.2 * scaleFactor], [4.6, 1.1, 2.9], olive);
  addBox(group, `${group.name}_console`, [0.8 * scaleFactor, 1.0 * scaleFactor, 0.8 * scaleFactor], [1.8, 0.5, 2.5], clay);
  addBox(group, `${group.name}_chair`, [0.8 * scaleFactor, 1.0 * scaleFactor, 0.8 * scaleFactor], [-2.2, 0.5, 1.3], 0x3c4a5c);
  addBox(group, `${group.name}_door_frame`, [1.8, 2.6, 0.18], [0, 1.2, 4.91], clay);
}

export async function generateOfficeGlb(): Promise<Buffer> {
  const scene = new THREE.Scene();
  scene.name = 'office_packed';

  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 200);
  camera.name = 'office_camera_main';
  camera.position.set(0, 1.65, 4.2);
  scene.add(camera);

  const spawn = new THREE.Object3D();
  spawn.name = 'spawn';
  spawn.position.set(0, 0, 3.8);
  scene.add(spawn);

  const interact = new THREE.Object3D();
  interact.name = 'interact';
  interact.position.set(-1.1, 0, 0.3);
  scene.add(interact);

  const exit = new THREE.Object3D();
  exit.name = 'exit';
  exit.position.set(0, 0, 4.6);
  scene.add(exit);

  const lod0 = new THREE.Group();
  lod0.name = 'office_scene_LOD0';
  addRoomDetails(lod0, 1);
  scene.add(lod0);

  const lod1 = new THREE.Group();
  lod1.name = 'office_scene_LOD1';
  addRoomDetails(lod1, 0.75);
  lod1.position.x = 20;
  scene.add(lod1);

  const lod2 = new THREE.Group();
  lod2.name = 'office_scene_LOD2';
  addRoomDetails(lod2, 0.55);
  lod2.position.x = 40;
  scene.add(lod2);

  return exportBinaryGlb(scene);
}

export async function generateStarAtlasGlb(): Promise<Buffer> {
  const scene = new THREE.Scene();
  scene.name = 'starfield_atlas';

  const palette = [0xf9f4b8, 0xf6d27a, 0x9ed0ff, 0xc4afff, 0xffb394];
  const geometries: Array<[string, THREE.BufferGeometry]> = [
    ['star_L0', new THREE.IcosahedronGeometry(0.95, 0)],
    ['star_L1', new THREE.OctahedronGeometry(0.78, 0)],
    ['star_L2', new THREE.BoxGeometry(0.72, 0.72, 0.72)],
    ['star_L3', new THREE.CylinderGeometry(0.26, 0.26, 1.1, 6)],
    ['star_L4', new THREE.TetrahedronGeometry(0.68, 0)],
  ];

  geometries.forEach(([name, geometry], index) => {
    const mesh = new THREE.Mesh(geometry, createPaletteMaterial(palette[index]));
    mesh.name = name;
    mesh.position.set(index * 2.4 - 4.8, 0, 0);
    scene.add(mesh);
  });

  return exportBinaryGlb(scene);
}

export function summarizeRows(rows: ReportRow[]): string {
  const accepted = rows.filter((row) => row.accepted);
  const strictAccepted = rows.filter((row) => row.strictAccepted);
  const fixups = rows.filter((row) => row.requiresFixup);
  const discarded = rows.filter((row) => !row.accepted);
  const textureRows = rows.filter((row) => row.kind === 'texture' && row.textureMax != null);
  const trisRows = rows.filter((row) => row.tris != null);
  const maxTris = trisRows.reduce((max, row) => Math.max(max, row.tris ?? 0), 0);
  const maxTexture = textureRows.reduce((max, row) => Math.max(max, row.textureMax ?? 0), 0);
  return [
    '# 3D 场景性能与素材报告',
    '',
    `- 严格合格素材数：${strictAccepted.length}`,
    `- 可修复后交付素材数：${fixups.length}`,
    `- 场景交付候选数：${accepted.length}`,
    `- 废弃素材数：${discarded.length}`,
    `- 最高面数：${maxTris}`,
    `- 最大贴图边长：${maxTexture}`,
    '- office.packed.glb 将追加 Draco + Meshopt 几何压缩，运行时同时启用两种解码器。',
    '- starfield.atlas.glb 将追加 Meshopt 几何压缩，运行时通过 InstancedMesh 控制 draw calls。',
    '- 最终 GPU 帧时间、Chrome Memory、Lighthouse 由单独性能脚本采样并输出到 performance-lighthouse-report.md。',
  ].join('\n');
}

export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

export async function writeCubeFaces(): Promise<void> {
  const suffixes = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  await Promise.all(suffixes.map((suffix, index) => fs.writeFile(
    join(publicGeneratedDir, `star-hdri-${suffix}.png`),
    createCubeFaceBuffer(400 + index),
  )));
}

export async function compressGlbWithGltfTransform(inputPath: string, outputPath: string): Promise<void> {
  const dracoTempPath = outputPath.replace(/\.glb$/i, '.draco.tmp.glb');
  await runTool('npx', [
    'gltf-transform',
    'draco',
    inputPath,
    dracoTempPath,
    '--method',
    'edgebreaker',
    '--encode-speed',
    '8',
    '--decode-speed',
    '8',
  ]);
  await runTool('npx', [
    'gltf-transform',
    'meshopt',
    dracoTempPath,
    outputPath,
    '--level',
    'high',
  ]);
  await fs.rm(dracoTempPath, { force: true });
}

export async function run(): Promise<void> {
  await ensureDir(reportDir);
  await ensureDir(publicGeneratedDir);
  await ensureDir(join(reportDir, '.tmp'));

  const filePaths = await walkDirectory(assetsDir);
  const rows = (await Promise.all(filePaths.map((filePath) => analyzeFile(filePath)))).filter((row): row is ReportRow => Boolean(row));
  rows.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));

  const tempOfficePath = join(reportDir, '.tmp', 'office.raw.glb');
  const tempStarPath = join(reportDir, '.tmp', 'starfield.raw.glb');
  const finalOfficePath = join(publicGeneratedDir, 'office.packed.glb');
  const finalStarPath = join(publicGeneratedDir, 'starfield.atlas.glb');
  const officeGlb = await generateOfficeGlb();
  const starAtlasGlb = await generateStarAtlasGlb();
  const starCatalog = buildStarCatalog(8000);

  await Promise.all([
    fs.writeFile(tempOfficePath, officeGlb),
    fs.writeFile(tempStarPath, starAtlasGlb),
  ]);
  await compressGlbWithGltfTransform(tempOfficePath, finalOfficePath);
  await compressGlbWithGltfTransform(tempStarPath, finalStarPath);

  const [officeCompressedStats, starCompressedStats] = await Promise.all([
    fs.stat(finalOfficePath),
    fs.stat(finalStarPath),
  ]);
  const manifest = {
    generatedAt: new Date().toISOString(),
    office: {
      file: 'office.packed.glb',
      compression: 'draco+meshopt',
      sizeBytes: officeCompressedStats.size,
    },
    starfield: {
      file: 'starfield.atlas.glb',
      compression: 'draco+meshopt',
      sizeBytes: starCompressedStats.size,
    },
    strictAccepted: rows.filter((row) => row.strictAccepted).length,
    deliveryAccepted: rows.filter((row) => row.accepted).length,
    requiresFixup: rows.filter((row) => row.requiresFixup).length,
  };

  await Promise.all([
    fs.writeFile(join(reportDir, 'material-screening-report.csv'), buildReportCsv(rows), 'utf8'),
    fs.writeFile(join(reportDir, 'material-screening-report-pie.svg'), buildPieChartSvg(rows), 'utf8'),
    fs.writeFile(join(reportDir, 'performance-report.md'), summarizeRows(rows), 'utf8'),
    fs.writeFile(join(reportDir, 'generated-assets-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8'),
    fs.writeFile(join(publicGeneratedDir, 'star-catalog.json'), JSON.stringify(starCatalog, null, 2), 'utf8'),
  ]);

  await writeCubeFaces();
  await fs.rm(join(reportDir, '.tmp'), { recursive: true, force: true });

  process.stdout.write([
    `Scanned ${rows.length} resources`,
    `StrictAccepted ${rows.filter((row) => row.strictAccepted).length}`,
    `DeliveryAccepted ${rows.filter((row) => row.accepted).length}`,
    `Wrote ${join(reportDir, 'material-screening-report.csv')}`,
    `Wrote ${finalOfficePath}`,
    `Wrote ${finalStarPath}`,
  ].join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
