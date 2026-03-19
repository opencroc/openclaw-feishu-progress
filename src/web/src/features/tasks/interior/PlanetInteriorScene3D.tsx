import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import EventTimeline from './EventTimeline';
import { publicAsset } from '@shared/assets';
import {
  getAgentStatusLabel,
  getKindLabel,
  getRoleLabel,
  getStageLabel,
  getStageStatusLabel,
  getStatusLabel,
} from '../labels';
import type {
  PlanetInteriorData,
  PlanetInteriorStage,
  PlanetOverviewItem,
} from '@features/tasks/types';

type PlanetInteriorScene3DProps = {
  planet: PlanetOverviewItem;
  interior: PlanetInteriorData;
  formatTime: (ts?: number) => string;
};

type HoverState =
  | { kind: 'core' }
  | { kind: 'stage'; stageKey: string }
  | { kind: 'agent'; agentId: string };

type StageVisual = {
  key: string;
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  ring: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>;
  progress: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial> | null;
  halo: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  y: number;
  radius: number;
};

type AgentVisual = {
  id: string;
  group: THREE.Group;
  marker: THREE.Mesh;
  glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  anchor: THREE.Vector3;
  floatAmplitude: number;
  floatSpeed: number;
  baseEmissiveIntensity: number;
  baseGlowOpacity: number;
};

const CORE_RADIUS = 11;
const MIN_CAMERA_DISTANCE = 34;
const MAX_CAMERA_DISTANCE = 120;
const DEFAULT_CAMERA_OFFSET = new THREE.Vector3(1.2, 0.72, 1.36).normalize();

const STAGE_STYLES: Record<PlanetInteriorStage['status'], { base: number; glow: number; rim: number }> = {
  pending: { base: 0xd1c8ba, glow: 0xefe7dc, rim: 0xa99b86 },
  running: { base: 0xdca75c, glow: 0xf0cf98, rim: 0xb78034 },
  done: { base: 0x73a08f, glow: 0xc4e1d7, rim: 0x2e6b59 },
  failed: { base: 0xc98274, glow: 0xf0d0c9, rim: 0xb95a4a },
};

const ROLE_COLORS: Record<string, number> = {
  parser: 0x56748f,
  analyzer: 0x7b6a89,
  tester: 0x2e6b59,
  healer: 0xb95a4a,
  planner: 0xb78034,
  reporter: 0x4f86a8,
  runtime: 0x6f6254,
};

const PIXEL_ASSETS = {
  officeBg: publicAsset('star/office_bg_small.webp'),
  desk: publicAsset('star/desk-v3.webp'),
  avatar: publicAsset('star/star-idle-v5.png'),
  server: publicAsset('botreview/server.gif'),
  coffee: publicAsset('botreview/coffee-machine.gif'),
  walls: publicAsset('botreview/walls.png'),
};

function renderSummary(summary?: string) {
  if (!summary) return <div className="task-empty">还没有摘要，任务仍在生成最终结果。</div>;
  return summary.split(/\n{2,}/).map((block, index) => (
    <p key={`planet-summary-${index}`}>
      {block.split('\n').map((line, lineIndex, lines) => (
        <span key={`planet-summary-${index}-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </p>
  ));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function polarToVector(radius: number, angle: number, y = 0): THREE.Vector3 {
  const radians = ((angle - 90) * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(radians),
    y,
    radius * Math.sin(radians),
  );
}

function describeTimeRange(stage: PlanetInteriorStage, formatTime: (ts?: number) => string): string {
  if (stage.startedAt && stage.completedAt) {
    return `${formatTime(stage.startedAt)} 至 ${formatTime(stage.completedAt)}`;
  }
  if (stage.startedAt) {
    return `开始于 ${formatTime(stage.startedAt)}`;
  }
  if (stage.completedAt) {
    return `结束于 ${formatTime(stage.completedAt)}`;
  }
  return '暂无时间记录';
}

function makeArcCurve(radius: number, y: number, startAngle: number, endAngle: number): THREE.CatmullRomCurve3 {
  const span = Math.max(4, endAngle - startAngle);
  const points: THREE.Vector3[] = [];
  const steps = Math.max(14, Math.round(span / 6));

  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (span * index) / steps;
    points.push(polarToVector(radius, angle, y));
  }

  return new THREE.CatmullRomCurve3(points);
}

function makeArcMesh(
  curve: THREE.CatmullRomCurve3,
  color: number,
  tubeRadius: number,
  opacity = 1,
): THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial> {
  const geometry = new THREE.TubeGeometry(curve, 24, tubeRadius, 4, false);
  const material = opacity < 1
    ? new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    : new THREE.MeshStandardMaterial({
      color,
      roughness: 0.38,
      metalness: 0.12,
      emissive: color,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.96,
    });

  return new THREE.Mesh(geometry, material);
}

function makeHalo(curve: THREE.CatmullRomCurve3, color: number, opacity: number): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  return new THREE.Line(geometry, material);
}

function makeAgentGeometry(role: string): THREE.BufferGeometry {
  switch (role) {
    case 'analyzer':
      return new THREE.OctahedronGeometry(1.65, 0);
    case 'tester':
      return new THREE.BoxGeometry(2.4, 2.4, 2.4);
    case 'healer':
      return new THREE.ConeGeometry(1.8, 3.4, 4);
    case 'planner':
      return new THREE.DodecahedronGeometry(1.7, 0);
    case 'reporter':
      return new THREE.CylinderGeometry(1.4, 1.4, 2.4, 6);
    case 'runtime':
      return new THREE.IcosahedronGeometry(1.65, 0);
    default:
      return new THREE.SphereGeometry(1.65, 18, 18);
  }
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }
  material.dispose();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if ('geometry' in mesh && mesh.geometry) {
      mesh.geometry.dispose();
    }
    disposeMaterial((mesh as { material?: THREE.Material | THREE.Material[] }).material);
  });
}

function createBox(
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  options?: Partial<Pick<THREE.MeshStandardMaterial, 'roughness' | 'metalness' | 'emissive' | 'emissiveIntensity'>>,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({
      color,
      roughness: options?.roughness ?? 0.72,
      metalness: options?.metalness ?? 0.08,
      emissive: options?.emissive ?? 0x000000,
      emissiveIntensity: options?.emissiveIntensity ?? 0,
    }),
  );
  mesh.position.set(...position);
  return mesh;
}

function createPixelOfficeBackdrop(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pixel-office-backdrop';

  const tileLight = new THREE.MeshStandardMaterial({ color: 0xf3eadc, roughness: 0.96, metalness: 0.02 });
  const tileDark = new THREE.MeshStandardMaterial({ color: 0xe5d7c4, roughness: 0.96, metalness: 0.02 });
  const tileGeometry = new THREE.BoxGeometry(6, 0.9, 6);

  for (let x = -5; x <= 5; x += 1) {
    for (let z = -4; z <= 4; z += 1) {
      const tile = new THREE.Mesh(tileGeometry, (x + z) % 2 === 0 ? tileLight : tileDark);
      tile.position.set(x * 6.1, -11.4, z * 6.1);
      group.add(tile);
    }
  }

  group.add(createBox([74, 20, 2], 0xd9cab7, [0, -1.5, -34]));
  group.add(createBox([2, 20, 38], 0xd7c5ae, [-36, -1.5, -16]));
  group.add(createBox([2, 20, 24], 0xd7c5ae, [36, -1.5, -22]));
  group.add(createBox([26, 7, 1.2], 0xa6bfd0, [-16, 2, -32.2], { emissive: 0xa6bfd0, emissiveIntensity: 0.08 }));
  group.add(createBox([18, 7, 1.2], 0xc1d1dc, [16, 2, -32.2], { emissive: 0xc1d1dc, emissiveIntensity: 0.06 }));
  group.add(createBox([72, 1.2, 2.2], 0xb27c33, [0, 7.6, -33.6], { emissive: 0xb27c33, emissiveIntensity: 0.12 }));

  const deskGroup = new THREE.Group();
  deskGroup.name = 'office-desk';
  deskGroup.add(createBox([18, 1.4, 10], 0xb78034, [0, -4.7, 0]));
  deskGroup.add(createBox([1.3, 6.6, 1.3], 0x6f6254, [-7.6, -8.1, -3.8]));
  deskGroup.add(createBox([1.3, 6.6, 1.3], 0x6f6254, [7.6, -8.1, -3.8]));
  deskGroup.add(createBox([1.3, 6.6, 1.3], 0x6f6254, [-7.6, -8.1, 3.8]));
  deskGroup.add(createBox([1.3, 6.6, 1.3], 0x6f6254, [7.6, -8.1, 3.8]));
  deskGroup.add(createBox([8.8, 6.4, 1.2], 0x2d261f, [0, 0.2, -1.6]));
  deskGroup.add(createBox([6.8, 4.6, 0.35], 0x8eb0bf, [0, 0.2, -0.75], { emissive: 0x8eb0bf, emissiveIntensity: 0.18 }));
  deskGroup.add(createBox([3.8, 0.85, 2.8], 0xd9cab7, [0, -2.2, 1.4]));
  deskGroup.add(createBox([4.4, 2.8, 4.4], 0x7b6a89, [-14, -6.1, 8]));
  deskGroup.add(createBox([4.4, 5.6, 4.4], 0x56748f, [-14, -2.1, 8], { emissive: 0x56748f, emissiveIntensity: 0.08 }));
  deskGroup.add(createBox([2, 2, 2], 0xb95a4a, [14, -3.8, 7]));
  deskGroup.add(createBox([1.1, 3.2, 1.1], 0xe8d6bf, [14, -1.2, 7]));
  group.add(deskGroup);

  return group;
}

export default function PlanetInteriorScene3D({ planet, interior, formatTime }: PlanetInteriorScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const stageVisualsRef = useRef<Map<string, StageVisual>>(new Map());
  const agentVisualsRef = useRef<Map<string, AgentVisual>>(new Map());
  const interactivesRef = useRef<THREE.Object3D[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const autoRotateRef = useRef(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);

  autoRotateRef.current = autoRotate;

  const spotlightStageKey = useMemo(() => {
    if (hoverState?.kind === 'stage') return hoverState.stageKey;
    if (hoverState?.kind === 'agent') {
      return interior.agents.find((agent) => agent.id === hoverState.agentId)?.stageKey ?? planet.currentStageKey ?? interior.stages[0]?.key;
    }
    return planet.currentStageKey ?? interior.stages.find((stage) => stage.status === 'running')?.key ?? interior.stages[0]?.key;
  }, [hoverState, interior.agents, interior.stages, planet.currentStageKey]);

  const hoveredAgentId = hoverState?.kind === 'agent' ? hoverState.agentId : null;

  const spotlightStage = interior.stages.find((stage) => stage.key === spotlightStageKey) ?? interior.stages[0] ?? null;
  const hoveredAgent = hoveredAgentId
    ? interior.agents.find((agent) => agent.id === hoveredAgentId) ?? null
    : null;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf7f1e8, 70, 180);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 500);
    camera.position.set(34, 24, 42);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearAlpha(0);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.86;
    controls.panSpeed = 0.74;
    controls.minDistance = MIN_CAMERA_DISTANCE;
    controls.maxDistance = MAX_CAMERA_DISTANCE;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.42;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xfff5eb, 1.6);
    const hemi = new THREE.HemisphereLight(0xf9f6f1, 0xd9cdbc, 1.1);
    const key = new THREE.DirectionalLight(0xfff3da, 1.9);
    key.position.set(24, 38, 18);
    const fill = new THREE.DirectionalLight(0xb3cad8, 0.75);
    fill.position.set(-18, 16, -12);
    const coreLight = new THREE.PointLight(0xb78034, 54, 120, 2);
    coreLight.position.set(0, 4, 0);
    const accent = new THREE.PointLight(0x56748f, 18, 90, 2);
    accent.position.set(-18, 8, 12);
    scene.add(ambient, hemi, key, fill, coreLight, accent);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(76, 72),
      new THREE.MeshStandardMaterial({
        color: 0xf2eadf,
        roughness: 0.94,
        metalness: 0.02,
        transparent: true,
        opacity: 0.84,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -11;
    scene.add(floor);

    const referenceRings = [22, 30, 38].map((radius, index) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + 0.55, 96),
        new THREE.MeshBasicMaterial({
          color: index === 0 ? 0xceb89b : 0xd9cab7,
          transparent: true,
          opacity: index === 0 ? 0.22 : 0.14,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -10.6 + index * 0.06;
      return ring;
    });
    for (const ring of referenceRings) scene.add(ring);

    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 260;
    const positions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      const stride = index * 3;
      positions[stride] = (Math.random() - 0.5) * 160;
      positions[stride + 1] = Math.random() * 80 + 8;
      positions[stride + 2] = (Math.random() - 0.5) * 160;
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: 0xf0e5d8,
        size: 1.2,
        opacity: 0.56,
        transparent: true,
        sizeAttenuation: true,
      }),
    ));

    scene.add(createPixelOfficeBackdrop());

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    rootGroupRef.current = rootGroup;

    function resize(): void {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);
    resize();

    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
      const elapsed = clock.getElapsedTime();
      const root = rootGroupRef.current;
      if (root) {
        const coreAura = root.getObjectByName('core-aura') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | undefined;
        const coreShell = root.getObjectByName('core-shell') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | undefined;
        if (coreAura) {
          const auraPulse = 0.96 + Math.sin(elapsed * 1.2) * 0.06;
          coreAura.scale.setScalar(auraPulse);
        }
        if (coreShell) {
          coreShell.rotation.y += 0.003;
        }
      }

      for (const visual of agentVisualsRef.current.values()) {
        visual.group.position.copy(visual.anchor);
        visual.group.position.y += Math.sin(elapsed * visual.floatSpeed + visual.anchor.x * 0.08) * visual.floatAmplitude;
        visual.group.rotation.y += 0.02;
        const glowScale = 0.92 + Math.sin(elapsed * (visual.floatSpeed + 0.3)) * 0.08;
        visual.glow.scale.setScalar(glowScale);
      }

      controls.autoRotate = autoRotateRef.current;
      controls.update();
      renderer.render(scene, camera);
    });

    function focusPlanetInterior(distanceScale: number): void {
      const distance = clamp(distanceScale, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
      const nextPosition = DEFAULT_CAMERA_OFFSET.clone().multiplyScalar(distance);
      camera.position.copy(nextPosition);
      controls.target.set(0, 0, 0);
      controls.update();
    }

    function fitAll(): void {
      focusPlanetInterior(62);
    }

    function handlePointerMove(event: PointerEvent): void {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hit = raycasterRef.current.intersectObjects(interactivesRef.current, false)[0];
      const data = hit?.object.userData;

      if (data?.hoverKind === 'stage' && typeof data.stageKey === 'string') {
        setHoverState((current) => (
          current?.kind === 'stage' && current.stageKey === data.stageKey
            ? current
            : { kind: 'stage', stageKey: data.stageKey }
        ));
        canvas.style.cursor = 'pointer';
        return;
      }

      if (data?.hoverKind === 'agent' && typeof data.agentId === 'string') {
        setHoverState((current) => (
          current?.kind === 'agent' && current.agentId === data.agentId
            ? current
            : { kind: 'agent', agentId: data.agentId }
        ));
        canvas.style.cursor = 'pointer';
        return;
      }

      if (data?.hoverKind === 'core') {
        setHoverState((current) => (current?.kind === 'core' ? current : { kind: 'core' }));
        canvas.style.cursor = 'pointer';
        return;
      }

      setHoverState(null);
      canvas.style.cursor = 'grab';
    }

    function handlePointerLeave(): void {
      setHoverState(null);
      canvas.style.cursor = 'grab';
    }

    function handleDoubleClick(): void {
      fitAll();
    }

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('dblclick', handleDoubleClick);

    (container as HTMLDivElement & {
      __fitInterior?: () => void;
      __focusInterior?: (distanceScale: number) => void;
    }).__fitInterior = fitAll;
    (container as HTMLDivElement & {
      __focusInterior?: (distanceScale: number) => void;
    }).__focusInterior = focusPlanetInterior;

    fitAll();

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      rootGroupRef.current = null;
      stageVisualsRef.current = new Map();
      agentVisualsRef.current = new Map();
      interactivesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const rootGroup = rootGroupRef.current;
    if (!rootGroup) return;

    disposeObject(rootGroup);
    rootGroup.clear();
    stageVisualsRef.current = new Map();
    agentVisualsRef.current = new Map();
    interactivesRef.current = [];

    const stageCount = Math.max(interior.stages.length, 1);
    const stageMidpoint = (stageCount - 1) / 2;

    const coreGroup = new THREE.Group();
    const coreAura = new THREE.Mesh(
      new THREE.BoxGeometry(16, 12, 4.4),
      new THREE.MeshBasicMaterial({
        color: planet.status === 'failed' ? 0xb95a4a : planet.status === 'running' ? 0xe7c890 : 0xb7c9d3,
        transparent: true,
        opacity: planet.status === 'running' ? 0.16 : 0.1,
        depthWrite: false,
      }),
    );
    coreAura.name = 'core-aura';

    const desk = createBox([15.4, 1.2, 8.2], 0xb78034, [0, -5.7, 0], { emissive: 0xb78034, emissiveIntensity: 0.04 });
    const stand = createBox([2.2, 3.8, 1.2], 0x6f6254, [0, -1.5, -1.3]);
    const coreShell = createBox([10.2, 7.2, 1.3], 0x2d261f, [0, 2.1, -2.2], {
      emissive: planet.status === 'running' ? 0xb78034 : planet.status === 'waiting' ? 0x7b6a89 : 0x56748f,
      emissiveIntensity: planet.status === 'running' ? 0.2 : 0.12,
      roughness: 0.28,
      metalness: 0.14,
    });
    coreShell.name = 'core-shell';
    coreShell.userData = { hoverKind: 'core' };

    const screen = createBox([8.1, 5.2, 0.3], 0x9ab7c2, [0, 2.1, -1.4], {
      emissive: 0x9ab7c2,
      emissiveIntensity: 0.2,
      roughness: 0.18,
    });
    screen.userData = { hoverKind: 'core' };
    const progressBar = createBox([6.8, 0.62, 0.34], 0xb78034, [0, -0.6, -1.18], {
      emissive: 0xb78034,
      emissiveIntensity: 0.22,
      roughness: 0.24,
    });
    progressBar.scale.x = clamp(planet.progress / 100, 0.08, 1);
    progressBar.position.x = -((1 - progressBar.scale.x) * 6.8) / 2;
    progressBar.userData = { hoverKind: 'core' };

    const keyboard = createBox([5.8, 0.48, 2.6], 0xd5c4ad, [0, -3.25, 1.45]);
    const sideTower = createBox([3.2, 5.6, 3.2], 0x56748f, [-9.8, -3.25, 6.4], { emissive: 0x56748f, emissiveIntensity: 0.08 });
    const mug = createBox([1.4, 1.8, 1.4], 0xb95a4a, [8.7, -3.8, 4.9], { emissive: 0xb95a4a, emissiveIntensity: 0.08 });

    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(15.8, 0.58, 6, 36),
      new THREE.MeshBasicMaterial({
        color: 0xb78034,
        transparent: true,
        opacity: 0.22,
      }),
    );
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.y = -5.2;

    const axis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -10, 0),
        new THREE.Vector3(0, 12, 0),
      ]),
      new THREE.LineBasicMaterial({
        color: 0xd3c0a7,
        transparent: true,
        opacity: 0.22,
      }),
    );

    coreGroup.add(coreAura, coreRing, desk, stand, coreShell, screen, progressBar, keyboard, sideTower, mug, axis);
    rootGroup.add(coreGroup);
    interactivesRef.current.push(coreShell, screen, progressBar);

    for (const [index, stage] of interior.stages.entries()) {
      const style = STAGE_STYLES[stage.status];
      const radius = 20 + index * 4.8;
      const y = (index - stageMidpoint) * 3.2;
      const curve = makeArcCurve(radius, y, stage.arcStart, stage.arcEnd);
      const stageMesh = makeArcMesh(curve, style.base, 0.92) as THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>;
      const progressEndAngle = stage.arcStart + (stage.arcEnd - stage.arcStart) * clamp(stage.progress / 100, 0.05, 1);
      const progressCurve = makeArcCurve(radius + 0.54, y + 0.28, stage.arcStart, progressEndAngle);
      const progressMesh = stage.progress > 0
        ? makeArcMesh(progressCurve, style.rim, 0.26, 0.92) as THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>
        : null;
      const halo = makeHalo(curve, style.glow, stage.status === 'running' ? 0.44 : 0.24);

      stageMesh.userData = { hoverKind: 'stage', stageKey: stage.key };
      const group = new THREE.Group();
      group.add(stageMesh, halo);
      if (progressMesh) {
        group.add(progressMesh);
      }

      stageVisualsRef.current.set(stage.key, {
        key: stage.key,
        group,
        curve,
        ring: stageMesh,
        progress: progressMesh,
        halo,
        y,
        radius,
      });

      rootGroup.add(group);
      interactivesRef.current.push(stageMesh);
    }

    for (const agent of interior.agents) {
      const stageVisual = stageVisualsRef.current.get(agent.stageKey);
      const anchor = stageVisual
        ? polarToVector(stageVisual.radius + 6, agent.angle, stageVisual.y + 2.8)
        : polarToVector(28, agent.angle, 0);
      const color = ROLE_COLORS[agent.role] ?? 0x56748f;

      const marker = new THREE.Mesh(
        makeAgentGeometry(agent.role),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: agent.status === 'working' || agent.status === 'thinking' ? 0.28 : 0.12,
          roughness: 0.34,
          metalness: 0.18,
        }),
      );
      marker.userData = { hoverKind: 'agent', agentId: agent.id };

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(2.7, 18, 18),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: agent.status === 'error' ? 0.18 : 0.12,
          depthWrite: false,
        }),
      );

      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, -2.8, 0),
          new THREE.Vector3(0, -8.2, 0),
        ]),
        new THREE.LineBasicMaterial({
          color: 0xc8b8a1,
          transparent: true,
          opacity: 0.28,
        }),
      );

      const group = new THREE.Group();
      group.position.copy(anchor);
      group.add(glow, stem, marker);
      rootGroup.add(group);

      agentVisualsRef.current.set(agent.id, {
        id: agent.id,
        group,
        marker,
        glow,
        anchor,
        floatAmplitude: agent.status === 'working' || agent.status === 'thinking' ? 0.9 : 0.4,
        floatSpeed: agent.status === 'working' || agent.status === 'thinking' ? 1.45 : 0.8,
        baseEmissiveIntensity: agent.status === 'working' || agent.status === 'thinking' ? 0.28 : 0.12,
        baseGlowOpacity: agent.status === 'error' ? 0.18 : 0.12,
      });
      interactivesRef.current.push(marker);
    }
  }, [interior.agents, interior.stages, planet.status]);

  useEffect(() => {
    for (const [stageKey, visual] of stageVisualsRef.current.entries()) {
      const active = stageKey === spotlightStageKey;
      visual.ring.material.emissiveIntensity = active ? 0.34 : 0.12;
      visual.ring.material.opacity = active ? 1 : 0.96;
      visual.halo.material.opacity = active ? 0.7 : 0.24;
      if (visual.progress) {
        visual.progress.material.opacity = active ? 1 : 0.78;
      }
    }

    for (const [agentId, visual] of agentVisualsRef.current.entries()) {
      const active = agentId === hoveredAgentId;
      const material = visual.marker.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = active ? 0.46 : visual.baseEmissiveIntensity;
      visual.glow.material.opacity = active ? 0.24 : visual.baseGlowOpacity;
      visual.group.scale.setScalar(active ? 1.08 : 1);
    }
  }, [hoveredAgentId, spotlightStageKey]);

  const hudTitle = hoveredAgent
    ? hoveredAgent.name
    : spotlightStage
      ? getStageLabel(spotlightStage.label, spotlightStage.key)
      : planet.title;

  const hudMeta = hoveredAgent
    ? `${getRoleLabel(hoveredAgent.role)} · ${getAgentStatusLabel(hoveredAgent.status)} · ${getStageLabel(hoveredAgent.stageLabel, hoveredAgent.stageKey)}`
    : spotlightStage
      ? `${getStageStatusLabel(spotlightStage.status)} · 进度 ${spotlightStage.progress}%`
      : `${getKindLabel(planet.kind)} · ${getStatusLabel(planet.status)} · ${planet.progress}%`;

  const hudDetail = hoveredAgent
    ? (hoveredAgent.currentAction || '当前没有公开的执行动作。')
    : spotlightStage
      ? (spotlightStage.detail || describeTimeRange(spotlightStage, formatTime))
      : (interior.summary || '这是当前任务的核心剖面。');

  function zoom(multiplier: number): void {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offset = camera.position.clone().sub(controls.target);
    const nextDistance = clamp(offset.length() / multiplier, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    offset.setLength(nextDistance);
    camera.position.copy(controls.target.clone().add(offset));
    controls.update();
  }

  function fitAll(): void {
    const container = containerRef.current as (HTMLDivElement & { __fitInterior?: () => void }) | null;
    container?.__fitInterior?.();
  }

  function focusCore(): void {
    const container = containerRef.current as (HTMLDivElement & { __focusInterior?: (distanceScale: number) => void }) | null;
    container?.__focusInterior?.(46);
  }

  return (
    <div className="planet-interior-shell pixel-office-interior">
      <section className="planet-hero-card pixel-office-panel">
        <div className="planet-hero-copy">
          <div className="planet-hero-kind">{getKindLabel(planet.kind)}星球 · 像素办公室</div>
          <h2>{planet.title}</h2>
          <div className="planet-hero-meta">
            {getStatusLabel(planet.status)} · {planet.progress}% · 复杂度 {planet.complexity}
            {planet.currentStageLabel ? ` · ${getStageLabel(planet.currentStageLabel, planet.currentStageKey)}` : ''}
          </div>
          <div className="task-badges" style={{ marginTop: 12 }}>
            <span className={`badge ${planet.status}`}>{getStatusLabel(planet.status)}</span>
            <span className="badge">创建于 {formatTime(planet.createdAt)}</span>
            <span className="badge">更新于 {formatTime(planet.updatedAt)}</span>
            {interior.waitingFor ? <span className="badge waiting">等待：{interior.waitingFor}</span> : null}
          </div>
        </div>
      </section>

      <div className="planet-interior-grid">
        <div className="planet-visual-stack">
          <div className="planet-visual-card planet-visual-card-3d pixel-office-panel">
            <div ref={containerRef} className="planet-interior-scene">
              <canvas ref={canvasRef} className="planet-interior-canvas" />

              <div className="planet-interior-pixel-layer" aria-hidden="true">
                <img className="planet-pixel-bg" src={PIXEL_ASSETS.officeBg} alt="" />
                <img className="planet-pixel-walls" src={PIXEL_ASSETS.walls} alt="" />
                <img className="planet-pixel-server" src={PIXEL_ASSETS.server} alt="" />
                <img className="planet-pixel-coffee" src={PIXEL_ASSETS.coffee} alt="" />
                <img className="planet-pixel-desk" src={PIXEL_ASSETS.desk} alt="" />
              </div>

              <div className="planet-interior-scene-overlay">
                <div className="planet-interior-badge">像素办公室</div>
                <div className="planet-interior-hud">
                  <strong>{hudTitle}</strong>
                  <span>{hudMeta}</span>
                  <span>{hudDetail}</span>
                </div>
              </div>

              <div className="planet-interior-toolbar">
                <button type="button" onClick={() => zoom(1.14)}>+</button>
                <button type="button" onClick={() => zoom(1 / 1.14)}>-</button>
                <button type="button" onClick={fitAll}>适配</button>
                <button type="button" onClick={focusCore}>核心</button>
                <button type="button" onClick={() => setAutoRotate((current) => !current)}>
                  {autoRotate ? '停转' : '旋转'}
                </button>
              </div>
            </div>
          </div>

          <div className="planet-stage-strip">
            {interior.stages.map((stage) => (
              <div
                key={stage.key}
                className={`planet-stage-card pixel-office-panel ${stage.status} ${stage.key === spotlightStageKey ? 'active' : ''}`}
              >
                <div className="planet-stage-top">
                  <strong>{getStageLabel(stage.label, stage.key)}</strong>
                  <span>{stage.progress}%</span>
                </div>
                <div className={`planet-stage-status ${stage.status}`}>{getStageStatusLabel(stage.status)}</div>
                <p>{stage.detail || '暂无阶段说明。'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="planet-side-stack">
          <div className="planet-summary-card pixel-office-panel">
            <div className="planet-card-head">
              <h3>任务摘要</h3>
              <span>{getStatusLabel(planet.status)}</span>
            </div>
            <div className="task-summary">{renderSummary(interior.summary)}</div>
          </div>

          <div className="planet-agents-card pixel-office-panel">
            <div className="planet-card-head">
              <h3>执行工位</h3>
              <span>{interior.agents.length} 个</span>
            </div>
            <div className="planet-agent-list">
              {interior.agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`planet-agent-card pixel-office-panel ${agent.status} ${agent.id === hoveredAgentId ? 'active' : ''}`}
                >
                  <div className="planet-agent-top">
                    <div className="planet-agent-title">
                      <img className="planet-agent-pixel" src={PIXEL_ASSETS.avatar} alt="" aria-hidden="true" />
                      <strong>{agent.name}</strong>
                    </div>
                    <span>{getAgentStatusLabel(agent.status)}</span>
                  </div>
                  <div className="planet-agent-meta">
                    {getRoleLabel(agent.role)} · {getStageLabel(agent.stageLabel, agent.stageKey)}
                    {typeof agent.progress === 'number' ? ` · ${agent.progress}%` : ''}
                  </div>
                  <p>{agent.currentAction || '待命中。'}</p>
                </div>
              ))}
            </div>
          </div>

          <EventTimeline events={interior.events} formatTime={formatTime} />
        </div>
      </div>
    </div>
  );
}
