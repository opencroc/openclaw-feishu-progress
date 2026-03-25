import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { publicAsset } from '@shared/assets';
import { navigate } from '@shared/navigation';

export type StarCatalogEntry = {
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

type PickedStar = {
  entry: StarCatalogEntry;
  color: string;
};

const starMapStyles = `
html, body, #root { width: 100%; height: 100%; margin: 0; }
body {
  background: #030611;
  color: #f8f4ec;
  font-family: "Noto Sans SC", "PingFang SC", system-ui, sans-serif;
}
.starmap-page {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at top left, rgba(60, 111, 202, 0.22), transparent 18%), radial-gradient(circle at bottom right, rgba(196, 175, 255, 0.18), transparent 24%), linear-gradient(180deg, #040813, #09101d 60%, #091522);
}
.starmap-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.starmap-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.starmap-topbar {
  position: absolute;
  top: 18px;
  left: 18px;
  right: 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.starmap-panel {
  max-width: 420px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(9, 16, 29, 0.72);
  border: 1px solid rgba(248, 244, 236, 0.12);
  backdrop-filter: blur(16px);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.3);
}
.starmap-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
}
.starmap-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(248, 244, 236, 0.82);
}
.starmap-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.starmap-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(64, 118, 211, 0.18);
  color: #d7e7ff;
  font-size: 12px;
  font-weight: 600;
}
.starmap-actions {
  display: flex;
  gap: 10px;
  pointer-events: auto;
}
.starmap-button {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  background: rgba(248, 244, 236, 0.12);
  color: #f8f4ec;
  cursor: pointer;
  font: inherit;
}
.starmap-button.primary {
  background: linear-gradient(135deg, #9ed0ff, #c4afff);
  color: #09101d;
  font-weight: 700;
}
.starmap-footer {
  position: absolute;
  left: 18px;
  bottom: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.starmap-hint {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(9, 16, 29, 0.76);
  border: 1px solid rgba(248, 244, 236, 0.12);
  font-size: 12px;
  color: rgba(248, 244, 236, 0.82);
}
.starmap-card {
  position: absolute;
  right: 18px;
  bottom: 18px;
  width: 320px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(9, 16, 29, 0.8);
  border: 1px solid rgba(248, 244, 236, 0.12);
  backdrop-filter: blur(16px);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}
.starmap-card h2 {
  margin: 0 0 8px;
  font-size: 18px;
}
.starmap-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
  margin-top: 10px;
}
.starmap-meta span {
  display: block;
  font-size: 11px;
  color: rgba(248, 244, 236, 0.62);
}
.starmap-meta strong {
  display: block;
  margin-top: 2px;
  font-size: 14px;
  color: #f8f4ec;
}
.starmap-link {
  display: inline-flex;
  align-items: center;
  margin-top: 14px;
  color: #d7e7ff;
  text-decoration: none;
  font-weight: 600;
}
.starmap-center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.starmap-loading {
  min-width: 280px;
  padding: 18px 22px;
  border-radius: 18px;
  text-align: center;
  background: rgba(9, 16, 29, 0.84);
  border: 1px solid rgba(248, 244, 236, 0.14);
}
`;

const starPalette = ['#f9f4b8', '#f6d27a', '#9ed0ff', '#c4afff', '#ffb394'] as const;

export function clampStarFov(value: number): number {
  return THREE.MathUtils.clamp(value, 5, 120);
}

export function catalogEntryToPosition(entry: StarCatalogEntry): THREE.Vector3 {
  const radius = 26 + Math.min(entry.distanceLy, 2400) / 2400 * 128;
  const ra = THREE.MathUtils.degToRad(entry.ra);
  const dec = THREE.MathUtils.degToRad(entry.dec);
  return new THREE.Vector3(
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
    radius * Math.cos(dec) * Math.sin(ra),
  );
}

export function groupCatalogByLevel(catalog: StarCatalogEntry[]): Record<StarCatalogEntry['level'], StarCatalogEntry[]> {
  return catalog.reduce<Record<StarCatalogEntry['level'], StarCatalogEntry[]>>((groups, entry) => {
    groups[entry.level].push(entry);
    return groups;
  }, { 0: [], 1: [], 2: [], 3: [], 4: [] });
}

async function openCatalogCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return await new Promise((resolveDatabase, reject) => {
    const request = indexedDB.open('opencroc-starmap-cache', 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('catalogs')) {
        database.createObjectStore('catalogs', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolveDatabase(request.result);
  });
}

async function readCachedCatalog(key: string): Promise<StarCatalogEntry[] | null> {
  const database = await openCatalogCache();
  if (!database) return null;
  return await new Promise((resolveCatalog, reject) => {
    const transaction = database.transaction('catalogs', 'readonly');
    const request = transaction.objectStore('catalogs').get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolveCatalog((request.result?.payload as StarCatalogEntry[] | undefined) ?? null);
      database.close();
    };
  });
}

async function writeCachedCatalog(key: string, payload: StarCatalogEntry[]): Promise<void> {
  const database = await openCatalogCache();
  if (!database) return;
  await new Promise<void>((resolveWrite, reject) => {
    const transaction = database.transaction('catalogs', 'readwrite');
    transaction.objectStore('catalogs').put({ key, payload });
    transaction.oncomplete = () => {
      database.close();
      resolveWrite();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function loadCatalogWithCache(url: string): Promise<StarCatalogEntry[]> {
  const cached = await readCachedCatalog(url);
  if (cached?.length) {
    return cached;
  }
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`星表加载失败：${response.status}`);
  }
  const payload = await response.json() as StarCatalogEntry[];
  await writeCachedCatalog(url, payload);
  return payload;
}

function createStarMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
      attribute float instanceMagnitude;
      varying float vGlow;
      void main() {
        float normalizedMagnitude = clamp((instanceMagnitude + 1.5) / 7.0, 0.0, 1.0);
        float sizeScale = mix(1.85, 0.58, normalizedMagnitude);
        vGlow = mix(1.18, 0.72, normalizedMagnitude);
        vec3 transformed = position * sizeScale;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vGlow;
      void main() {
        vec2 snapped = floor(gl_FragCoord.xy / 2.0) * 2.0;
        float pixelMask = mod(snapped.x + snapped.y, 4.0) < 1.0 ? 0.9 : 1.0;
        gl_FragColor = vec4(uColor * vGlow * pixelMask, 1.0);
      }
    `,
    toneMapped: false,
  });
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material?.dispose();
    }
  });
}

export default function StarMapScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoRotateRef = useRef(true);
  const [loadingMessage, setLoadingMessage] = useState('正在加载星图资产与星表');
  const [error, setError] = useState<string | null>(null);
  const [selectedStar, setSelectedStar] = useState<PickedStar | null>(null);
  const [fov, setFov] = useState(58);
  const [autoRotate, setAutoRotate] = useState(true);
  const [starCount, setStarCount] = useState(0);

  const actionLabel = useMemo(() => (autoRotate ? '自动旋转 0.2°/s' : '自动旋转已暂停'), [autoRotate]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let animationFrame = 0;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x040813);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
    camera.position.set(0, 22, 160);
    camera.lookAt(0, 0, 0);

    const starRoot = new THREE.Group();
    scene.add(starRoot);

    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    const blueLight = new THREE.PointLight(0x6ea8ff, 32, 280, 2);
    blueLight.position.set(-18, 24, 20);
    const purpleLight = new THREE.PointLight(0xc4afff, 28, 260, 2);
    purpleLight.position.set(24, -10, -18);
    scene.add(ambient, blueLight, purpleLight);

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener('resize', resize);

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(publicAsset('draco/'));
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clickStart = new THREE.Vector2();
    let atlasRoot: THREE.Object3D | null = null;
    const interactiveMeshes: THREE.InstancedMesh[] = [];

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = clampStarFov(camera.fov + event.deltaY * 0.03);
      camera.fov = next;
      camera.updateProjectionMatrix();
      setFov(next);
    };

    const pickStar = (clientX: number, clientY: number) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(interactiveMeshes, false);
      const hit = intersections.find((intersection) => typeof intersection.instanceId === 'number');
      if (!hit || typeof hit.instanceId !== 'number') {
        setSelectedStar(null);
        return;
      }
      const object = hit.object as THREE.InstancedMesh & { userData: { entries?: StarCatalogEntry[]; color?: string } };
      const entry = object.userData.entries?.[hit.instanceId];
      if (!entry) return;
      setSelectedStar({
        entry,
        color: object.userData.color ?? '#f8f4ec',
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      clickStart.set(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (clickStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) <= 6) {
        pickStar(event.clientX, event.clientY);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyR') {
        setAutoRotate(true);
      }
      if (event.code === 'KeyP') {
        setAutoRotate(false);
      }
      if (event.code === 'Escape') {
        navigate('/tasks');
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    const loadAssets = async () => {
      try {
        const [catalog, atlas] = await Promise.all([
          loadCatalogWithCache(publicAsset('generated/star-catalog.json')),
          loader.loadAsync(publicAsset('generated/starfield.atlas.glb')),
        ]);
        if (disposed) return;

        setStarCount(catalog.length);
        atlasRoot = atlas.scene;
        const atlasMeshes = atlas.scene.children.filter((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh);
        const geometryByLevel = atlasMeshes.reduce<Record<number, THREE.BufferGeometry>>((map, mesh) => {
          const match = mesh.name.match(/L(\d)$/);
          if (match) {
            map[Number(match[1])] = mesh.geometry.clone();
          }
          return map;
        }, {});

        const groups = groupCatalogByLevel(catalog);
        for (const levelText of Object.keys(groups)) {
          const level = Number(levelText) as StarCatalogEntry['level'];
          const entries = groups[level];
          const geometry = (geometryByLevel[level] ?? new THREE.IcosahedronGeometry(0.8, 0)).clone();
          const magnitudes = new Float32Array(entries.length);
          geometry.setAttribute('instanceMagnitude', new THREE.InstancedBufferAttribute(magnitudes, 1));
          const color = starPalette[level];
          const mesh = new THREE.InstancedMesh(geometry, createStarMaterial(color), entries.length);
          mesh.frustumCulled = false;
          mesh.userData.entries = entries;
          mesh.userData.color = color;
          const matrix = new THREE.Matrix4();
          const quaternion = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          entries.forEach((entry, index) => {
            const position = catalogEntryToPosition(entry);
            quaternion.setFromEuler(new THREE.Euler(entry.dec * 0.01, entry.ra * 0.01, entry.magnitude * 0.02));
            const size = THREE.MathUtils.mapLinear(entry.magnitude, -1.5, 6.5, 1.85, 0.55);
            scale.setScalar(size);
            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(index, matrix);
            magnitudes[index] = entry.magnitude;
          });
          mesh.instanceMatrix.needsUpdate = true;
          interactiveMeshes.push(mesh);
          starRoot.add(mesh);
        }

        const cubeTexture = await new THREE.CubeTextureLoader().loadAsync([
          publicAsset('generated/star-hdri-px.png'),
          publicAsset('generated/star-hdri-nx.png'),
          publicAsset('generated/star-hdri-py.png'),
          publicAsset('generated/star-hdri-ny.png'),
          publicAsset('generated/star-hdri-pz.png'),
          publicAsset('generated/star-hdri-nz.png'),
        ]);
        cubeTexture.colorSpace = THREE.SRGBColorSpace;
        cubeTexture.generateMipmaps = false;
        cubeTexture.minFilter = THREE.LinearFilter;
        cubeTexture.magFilter = THREE.NearestFilter;
        scene.background = cubeTexture;
        setLoadingMessage('');
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : '星图初始化失败');
        }
      }
    };

    void loadAssets();

    const clock = new THREE.Clock();
    const animate = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      if (autoRotateRef.current) {
        starRoot.rotation.y += THREE.MathUtils.degToRad(0.2) * delta;
      }
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      dracoLoader.dispose();
      renderer.dispose();
      if (atlasRoot) disposeObject(atlasRoot);
      disposeObject(scene);
    };
  }, []);

  return (
    <>
      <style>{starMapStyles}</style>
      <div className="starmap-page">
        <canvas ref={canvasRef} className="starmap-canvas" />
        <div className="starmap-overlay">
          <div className="starmap-topbar">
            <div className="starmap-panel">
              <h1 className="starmap-title">3D 星图</h1>
              <p className="starmap-copy">
                基于 starfield.atlas.glb 与 star-catalog.json 渲染 8 000 颗实例化恒星，支持像素阈值着色、鼠标拾取与 IndexedDB 缓存。
              </p>
              <div className="starmap-pills">
                <span className="starmap-pill">{starCount > 0 ? `${starCount} 颗星` : '等待星表'}</span>
                <span className="starmap-pill">FOV {Math.round(fov)}°</span>
                <span className="starmap-pill">{actionLabel}</span>
              </div>
            </div>
            <div className="starmap-actions">
              <button type="button" className="starmap-button primary" onClick={() => navigate('/tasks')}>
                返回任务流
              </button>
              <button type="button" className="starmap-button" onClick={() => navigate('/office')}>
                打开像素办公室
              </button>
            </div>
          </div>

          <div className="starmap-footer">
            <div className="starmap-hint">滚轮缩放 5°-120° · 点击星体查看卡片</div>
            <div className="starmap-hint">R 自动旋转 · P 暂停 · Esc 返回</div>
          </div>

          {(loadingMessage || error) ? (
            <div className="starmap-center">
              <div className="starmap-loading">
                <strong>{error ? '星图加载失败' : '正在初始化 3D 星图'}</strong>
                <div>{error || loadingMessage}</div>
              </div>
            </div>
          ) : null}

          {selectedStar ? (
            <div className="starmap-card">
              <h2 style={{ color: selectedStar.color }}>{selectedStar.entry.name}</h2>
              <div>{selectedStar.entry.id}</div>
              <div className="starmap-meta">
                <div>
                  <span>距离</span>
                  <strong>{selectedStar.entry.distanceLy.toFixed(1)} ly</strong>
                </div>
                <div>
                  <span>光谱</span>
                  <strong>{selectedStar.entry.spectralType}</strong>
                </div>
                <div>
                  <span>赤经 / 赤纬</span>
                  <strong>{selectedStar.entry.ra.toFixed(4)}° / {selectedStar.entry.dec.toFixed(4)}°</strong>
                </div>
                <div>
                  <span>星等</span>
                  <strong>{selectedStar.entry.magnitude.toFixed(2)}</strong>
                </div>
              </div>
              <a className="starmap-link" href={selectedStar.entry.encyclopediaUrl} target="_blank" rel="noreferrer">
                打开百科条目
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
