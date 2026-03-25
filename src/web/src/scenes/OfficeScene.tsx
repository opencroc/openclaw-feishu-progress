import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { publicAsset } from '@shared/assets';
import { navigate } from '@shared/navigation';

type OfficeHud = {
  lod: 'LOD0' | 'LOD1' | 'LOD2';
  locked: boolean;
  nearInteract: boolean;
};

type OfficeNodes = {
  spawn: THREE.Object3D | null;
  interact: THREE.Object3D | null;
  exit: THREE.Object3D | null;
  lods: Partial<Record<OfficeHud['lod'], THREE.Group>>;
};

const officeSceneStyles = `
html, body, #root { width: 100%; height: 100%; margin: 0; }
body {
  background: #070f17;
  color: #f8f4ec;
  font-family: "Noto Sans SC", "PingFang SC", system-ui, sans-serif;
}
.office-scene-page {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at top left, rgba(111, 176, 173, 0.2), transparent 22%), linear-gradient(180deg, #08121b, #0d1a24);
}
.office-scene-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.office-scene-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.office-scene-topbar {
  position: absolute;
  top: 18px;
  left: 18px;
  right: 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.office-scene-card {
  max-width: 380px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(15, 23, 34, 0.72);
  border: 1px solid rgba(248, 244, 236, 0.12);
  backdrop-filter: blur(14px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
}
.office-scene-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
}
.office-scene-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(248, 244, 236, 0.82);
}
.office-scene-pills {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.office-scene-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(111, 176, 173, 0.16);
  color: #d8f2ef;
  font-size: 12px;
  font-weight: 600;
}
.office-scene-pill.warn {
  background: rgba(191, 126, 82, 0.18);
  color: #ffd8bf;
}
.office-scene-actions {
  display: flex;
  gap: 10px;
  pointer-events: auto;
}
.office-scene-button {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  background: rgba(248, 244, 236, 0.12);
  color: #f8f4ec;
  cursor: pointer;
  font: inherit;
}
.office-scene-button.primary {
  background: linear-gradient(135deg, #6fb0ad, #7d8f5f);
  color: #08121b;
  font-weight: 700;
}
.office-scene-footer {
  position: absolute;
  left: 18px;
  bottom: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}
.office-scene-hint {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(15, 23, 34, 0.72);
  border: 1px solid rgba(248, 244, 236, 0.12);
  color: rgba(248, 244, 236, 0.82);
  font-size: 12px;
}
.office-scene-center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.office-scene-loading {
  padding: 18px 22px;
  border-radius: 18px;
  background: rgba(15, 23, 34, 0.84);
  border: 1px solid rgba(248, 244, 236, 0.14);
  min-width: 260px;
  text-align: center;
}
.office-scene-loading strong {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
}
`;

export function resolveOfficeLod(distance: number): OfficeHud['lod'] {
  if (distance <= 15) return 'LOD0';
  if (distance <= 30) return 'LOD1';
  return 'LOD2';
}

export function clampOfficePosition(position: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.clamp(position.x, -5.2, 5.2),
    1.65,
    THREE.MathUtils.clamp(position.z, -4.4, 4.4),
  );
}

export function canInteract(player: THREE.Vector3, interactPosition: THREE.Vector3 | null, radius = 1.6): boolean {
  if (!interactPosition) return false;
  const flatPlayer = new THREE.Vector2(player.x, player.z);
  const flatTarget = new THREE.Vector2(interactPosition.x, interactPosition.z);
  return flatPlayer.distanceTo(flatTarget) <= radius;
}

function applyPixelMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material || !('color' in material)) continue;
      const source = material as THREE.MeshStandardMaterial;
      source.flatShading = true;
      source.emissive = source.color.clone();
      source.emissiveIntensity = 1;
      source.metalness = 0;
      source.roughness = 1;
      source.needsUpdate = true;
    }
  });
}

function collectOfficeNodes(root: THREE.Object3D): OfficeNodes {
  const nodes: OfficeNodes = {
    spawn: null,
    interact: null,
    exit: null,
    lods: {},
  };
  root.traverse((node) => {
    if (node.name === 'spawn') nodes.spawn = node;
    if (node.name === 'interact') nodes.interact = node;
    if (node.name === 'exit') nodes.exit = node;
    if (node.name.endsWith('LOD0')) nodes.lods.LOD0 = node as THREE.Group;
    if (node.name.endsWith('LOD1')) nodes.lods.LOD1 = node as THREE.Group;
    if (node.name.endsWith('LOD2')) nodes.lods.LOD2 = node as THREE.Group;
  });
  return nodes;
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material as Record<string, unknown>)) {
        if (value && typeof value === 'object' && 'isTexture' in (value as Record<string, unknown>)) {
          (value as THREE.Texture).dispose();
        }
      }
      material.dispose();
    }
  });
}

export default function OfficeScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hud, setHud] = useState<OfficeHud>({ lod: 'LOD0', locked: false, nearInteract: false });
  const [loadingMessage, setLoadingMessage] = useState('正在装配 office.packed.glb');
  const [error, setError] = useState<string | null>(null);
  const [interactionCount, setInteractionCount] = useState(0);

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
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x08121b);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0d1a24, 8, 34);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);
    camera.position.set(0, 1.65, 4.2);

    const controls = new PointerLockControls(camera, document.body);
    scene.add(camera);

    const ambient = new THREE.AmbientLight(0xffffff, 2.4);
    const rim = new THREE.DirectionalLight(0x8ad7ff, 0.7);
    rim.position.set(-5, 6, -2);
    const fill = new THREE.PointLight(0xffd89c, 15, 18, 2);
    fill.position.set(0, 3, 0);
    scene.add(ambient, rim, fill);

    const keys = new Set<string>();
    const clock = new THREE.Clock();
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const floorCenter = new THREE.Vector3(0, 0, 0);
    let officeRoot: THREE.Object3D | null = null;
    let officeNodes: OfficeNodes = { spawn: null, interact: null, exit: null, lods: {} };

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

    loader.load(
      publicAsset('generated/office.packed.glb'),
      (gltf) => {
        if (disposed) return;
        officeRoot = gltf.scene;
        officeRoot.position.set(0, 0, 0);
        officeRoot.scale.setScalar(1);
        applyPixelMaterials(officeRoot);
        officeNodes = collectOfficeNodes(officeRoot);
        Object.values(officeNodes.lods).forEach((group) => group?.position.set(0, 0, 0));
        if (officeNodes.spawn) {
          camera.position.copy(clampOfficePosition(officeNodes.spawn.position.clone().setY(1.65)));
        }
        scene.add(officeRoot);
        setLoadingMessage('');
      },
      () => {
        if (!disposed) {
          setLoadingMessage('正在配置第一人称控制与像素材质');
        }
      },
      (event) => {
        if (disposed) return;
        setError(event.message || '办公室场景资源加载失败');
      },
    );

    const syncHud = () => {
      const distance = camera.position.distanceTo(floorCenter);
      const nextLod = resolveOfficeLod(distance);
      if (officeNodes.lods.LOD0) officeNodes.lods.LOD0.visible = nextLod === 'LOD0';
      if (officeNodes.lods.LOD1) officeNodes.lods.LOD1.visible = nextLod === 'LOD1';
      if (officeNodes.lods.LOD2) officeNodes.lods.LOD2.visible = nextLod === 'LOD2';
      const nearInteract = canInteract(camera.position, officeNodes.interact?.position ?? null);
      setHud((current) => (
        current.lod === nextLod && current.locked === controls.isLocked && current.nearInteract === nearInteract
          ? current
          : { lod: nextLod, locked: controls.isLocked, nearInteract }
      ));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      keys.add(event.code);
      if (event.code === 'Escape') {
        navigate('/tasks');
      }
      if (event.code === 'Space' && canInteract(camera.position, officeNodes.interact?.position ?? null)) {
        setInteractionCount((value) => value + 1);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };

    const onClick = () => {
      if (!controls.isLocked) {
        controls.lock();
      }
    };

    controls.addEventListener('lock', syncHud);
    controls.addEventListener('unlock', syncHud);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('click', onClick);

    const animate = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      velocity.set(0, 0, 0);

      if (controls.isLocked) {
        controls.getDirection(direction);
        forward.copy(direction).setY(0).normalize();
        right.crossVectors(forward, camera.up).normalize();
        if (keys.has('KeyW')) velocity.add(forward);
        if (keys.has('KeyS')) velocity.sub(forward);
        if (keys.has('KeyD')) velocity.add(right);
        if (keys.has('KeyA')) velocity.sub(right);
        if (velocity.lengthSq() > 0) {
          velocity.normalize().multiplyScalar(4.4 * delta);
          camera.position.add(velocity);
          camera.position.copy(clampOfficePosition(camera.position));
        }
      }

      syncHud();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('click', onClick);
      controls.unlock();
      controls.disconnect();
      dracoLoader.dispose();
      renderer.dispose();
      disposeScene(scene);
    };
  }, []);

  return (
    <>
      <style>{officeSceneStyles}</style>
      <div className="office-scene-page">
        <canvas ref={canvasRef} className="office-scene-canvas" />
        <div className="office-scene-overlay">
          <div className="office-scene-topbar">
            <div className="office-scene-card">
              <h1 className="office-scene-title">像素办公室</h1>
              <p className="office-scene-copy">
                基于白名单资产生成的 office.packed.glb，运行时启用三段 LOD、像素化发光材质与第一人称漫游。
              </p>
              <div className="office-scene-pills">
                <span className="office-scene-pill">当前 LOD {hud.lod}</span>
                <span className={`office-scene-pill ${hud.nearInteract ? 'warn' : ''}`}>
                  {hud.nearInteract ? '可按 Space 交互' : '靠近终端触发交互'}
                </span>
                <span className="office-scene-pill">{hud.locked ? '鼠标已锁定' : '点击画面进入'}</span>
              </div>
            </div>
            <div className="office-scene-actions">
              <button type="button" className="office-scene-button primary" onClick={() => navigate('/tasks')}>
                返回任务流
              </button>
              <button type="button" className="office-scene-button" onClick={() => navigate('/starmap')}>
                打开 3D 星图
              </button>
            </div>
          </div>

          <div className="office-scene-footer">
            <div className="office-scene-hint">WASD 移动 · 鼠标转向 · Space 交互 · Esc 返回</div>
            {interactionCount > 0 ? (
              <div className="office-scene-hint">已完成 {interactionCount} 次终端交互</div>
            ) : null}
          </div>

          {(loadingMessage || error) ? (
            <div className="office-scene-center">
              <div className="office-scene-loading">
                <strong>{error ? '场景加载失败' : '正在初始化'}</strong>
                <div>{error || loadingMessage}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
