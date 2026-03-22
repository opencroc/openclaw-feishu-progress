import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type ViewportEngine = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  clock: THREE.Clock;
  dispose: () => void;
};

type ViewportEngineOptions = {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  fog: {
    color: number;
    near: number;
    far: number;
  };
  camera: {
    fov: number;
    near: number;
    far: number;
    position: [number, number, number];
    target: [number, number, number];
  };
  controls?: Partial<Pick<
    OrbitControls,
    | 'enableDamping'
    | 'dampingFactor'
    | 'rotateSpeed'
    | 'zoomSpeed'
    | 'panSpeed'
    | 'minDistance'
    | 'maxDistance'
    | 'minPolarAngle'
    | 'maxPolarAngle'
    | 'autoRotate'
    | 'autoRotateSpeed'
  >>;
  exposure?: number;
  onControlStart?: () => void;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const item of material) {
      disposeMaterial(item);
    }
    return;
  }

  for (const value of Object.values(material as Record<string, unknown>)) {
    if (value && typeof value === 'object' && 'isTexture' in (value as Record<string, unknown>)) {
      (value as THREE.Texture).dispose();
    }
  }

  material.dispose();
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if ('geometry' in mesh && mesh.geometry) {
      mesh.geometry.dispose();
    }
    disposeMaterial((mesh as { material?: THREE.Material | THREE.Material[] }).material);
  });
}

export function createViewportEngine({
  container,
  canvas,
  fog,
  camera: cameraOptions,
  controls: controlOptions,
  exposure = 1.08,
  onControlStart,
}: ViewportEngineOptions): ViewportEngine {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);

  const camera = new THREE.PerspectiveCamera(
    cameraOptions.fov,
    1,
    cameraOptions.near,
    cameraOptions.far,
  );
  camera.position.set(...cameraOptions.position);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = controlOptions?.enableDamping ?? true;
  controls.dampingFactor = controlOptions?.dampingFactor ?? 0.06;
  controls.rotateSpeed = controlOptions?.rotateSpeed ?? 0.6;
  controls.zoomSpeed = controlOptions?.zoomSpeed ?? 0.9;
  controls.panSpeed = controlOptions?.panSpeed ?? 0.75;
  controls.minDistance = controlOptions?.minDistance ?? 20;
  controls.maxDistance = controlOptions?.maxDistance ?? 240;
  controls.minPolarAngle = controlOptions?.minPolarAngle ?? Math.PI * 0.08;
  controls.maxPolarAngle = controlOptions?.maxPolarAngle ?? Math.PI * 0.48;
  controls.autoRotate = controlOptions?.autoRotate ?? true;
  controls.autoRotateSpeed = controlOptions?.autoRotateSpeed ?? 0.35;
  controls.target.set(...cameraOptions.target);
  if (onControlStart) {
    controls.addEventListener('start', onControlStart);
  }

  function resize(): void {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const clock = new THREE.Clock();

  return {
    scene,
    camera,
    renderer,
    controls,
    clock,
    dispose() {
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
    },
  };
}
