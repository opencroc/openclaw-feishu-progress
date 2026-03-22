import * as THREE from 'three';

import type {
  PlanetInteriorAgent,
  PlanetInteriorData,
  PlanetInteriorStage,
  PlanetOverviewItem,
} from '@features/tasks/types';

import { clamp, createViewportEngine, disposeObject } from './shared';

export type PlanetInteriorHoverState =
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

function polarToVector(radius: number, angle: number, y = 0): THREE.Vector3 {
  const radians = ((angle - 90) * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(radians),
    y,
    radius * Math.sin(radians),
  );
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
  deskGroup.add(createBox([7.2, 4.4, 0.5], 0x2d261f, [0, -1.8, -2.7], { emissive: 0x56748f, emissiveIntensity: 0.12, roughness: 0.32 }));
  deskGroup.add(createBox([6.2, 0.38, 2.2], 0xd9cab7, [0, -3.6, 1.6]));
  deskGroup.add(createBox([2.1, 3.8, 2.1], 0x56748f, [10.8, -3.2, 4.6], { emissive: 0x56748f, emissiveIntensity: 0.06 }));
  deskGroup.position.set(0, -1.2, 14);
  group.add(deskGroup);

  return group;
}

export type InteriorScene3DData = {
  planet: PlanetOverviewItem;
  interior: PlanetInteriorData;
};

export type InteriorScene3DHighlight = {
  spotlightStageKey: string | null;
  hoveredAgentId: string | null;
};

export type InteriorScene3DHandle = {
  setData: (data: InteriorScene3DData) => void;
  setHighlight: (highlight: InteriorScene3DHighlight) => void;
  setAutoRotate: (enabled: boolean) => void;
  zoom: (multiplier: number) => void;
  fitAll: () => void;
  focusCore: () => void;
  dispose: () => void;
};

type InteriorScene3DMountOptions = {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  onHoverStateChange?: (hoverState: PlanetInteriorHoverState | null) => void;
};

export function mountInteriorScene3D({
  container,
  canvas,
  onHoverStateChange,
}: InteriorScene3DMountOptions): InteriorScene3DHandle {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const state = {
    planet: null as PlanetOverviewItem | null,
    interior: null as PlanetInteriorData | null,
    autoRotate: true,
    highlight: {
      spotlightStageKey: null as string | null,
      hoveredAgentId: null as string | null,
    },
  };

  const visuals = {
    rootGroup: new THREE.Group(),
    stageVisuals: new Map<string, StageVisual>(),
    agentVisuals: new Map<string, AgentVisual>(),
    interactives: [] as THREE.Object3D[],
  };

  const engine = createViewportEngine({
    container,
    canvas,
    fog: { color: 0xf7f1e8, near: 70, far: 180 },
    camera: {
      fov: 46,
      near: 0.1,
      far: 500,
      position: [34, 24, 42],
      target: [0, 0, 0],
    },
    controls: {
      rotateSpeed: 0.62,
      zoomSpeed: 0.86,
      panSpeed: 0.74,
      minDistance: MIN_CAMERA_DISTANCE,
      maxDistance: MAX_CAMERA_DISTANCE,
      minPolarAngle: Math.PI * 0.12,
      maxPolarAngle: Math.PI * 0.48,
      autoRotate: true,
      autoRotateSpeed: 0.42,
    },
  });

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
  engine.scene.add(ambient, hemi, key, fill, coreLight, accent);

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
  engine.scene.add(floor);

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
  for (const ring of referenceRings) {
    engine.scene.add(ring);
  }

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
  engine.scene.add(new THREE.Points(
    starsGeometry,
    new THREE.PointsMaterial({
      color: 0xf0e5d8,
      size: 1.2,
      opacity: 0.56,
      transparent: true,
      sizeAttenuation: true,
    }),
  ));

  engine.scene.add(createPixelOfficeBackdrop());
  engine.scene.add(visuals.rootGroup);

  function focusPlanetInterior(distanceScale: number): void {
    const distance = clamp(distanceScale, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    const nextPosition = DEFAULT_CAMERA_OFFSET.clone().multiplyScalar(distance);
    engine.camera.position.copy(nextPosition);
    engine.controls.target.set(0, 0, 0);
    engine.controls.update();
  }

  function fitAll(): void {
    focusPlanetInterior(62);
  }

  function applyHighlight(): void {
    for (const [stageKey, visual] of visuals.stageVisuals.entries()) {
      const active = stageKey === state.highlight.spotlightStageKey;
      visual.ring.material.emissiveIntensity = active ? 0.34 : 0.12;
      visual.ring.material.opacity = active ? 1 : 0.96;
      visual.halo.material.opacity = active ? 0.7 : 0.24;
      if (visual.progress) {
        visual.progress.material.opacity = active ? 1 : 0.78;
      }
    }

    for (const [agentId, visual] of visuals.agentVisuals.entries()) {
      const active = agentId === state.highlight.hoveredAgentId;
      const material = visual.marker.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = active ? 0.46 : visual.baseEmissiveIntensity;
      visual.glow.material.opacity = active ? 0.24 : visual.baseGlowOpacity;
      visual.group.scale.setScalar(active ? 1.08 : 1);
    }
  }

  function rebuildInterior(): void {
    const planet = state.planet;
    const interior = state.interior;
    if (!planet || !interior) return;

    disposeObject(visuals.rootGroup);
    visuals.rootGroup.clear();
    visuals.stageVisuals.clear();
    visuals.agentVisuals.clear();
    visuals.interactives = [];

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
    visuals.rootGroup.add(coreGroup);
    visuals.interactives.push(coreShell, screen, progressBar);

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

      visuals.stageVisuals.set(stage.key, {
        key: stage.key,
        group,
        curve,
        ring: stageMesh,
        progress: progressMesh,
        halo,
        y,
        radius,
      });

      visuals.rootGroup.add(group);
      visuals.interactives.push(stageMesh);
    }

    for (const agent of interior.agents) {
      const stageVisual = visuals.stageVisuals.get(agent.stageKey);
      const anchor = stageVisual
        ? polarToVector(stageVisual.radius + 6, agent.angle, stageVisual.y + 2.8)
        : polarToVector(CORE_RADIUS + 17, agent.angle, 0);
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
      visuals.rootGroup.add(group);

      visuals.agentVisuals.set(agent.id, {
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
      visuals.interactives.push(marker);
    }

    applyHighlight();
  }

  function pickHoverState(clientX: number, clientY: number): PlanetInteriorHoverState | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, engine.camera);
    const hit = raycaster.intersectObjects(visuals.interactives, false)[0];
    const data = hit?.object.userData;

    if (data?.hoverKind === 'stage' && typeof data.stageKey === 'string') {
      return { kind: 'stage', stageKey: data.stageKey };
    }
    if (data?.hoverKind === 'agent' && typeof data.agentId === 'string') {
      return { kind: 'agent', agentId: data.agentId };
    }
    if (data?.hoverKind === 'core') {
      return { kind: 'core' };
    }
    return null;
  }

  function handlePointerMove(event: PointerEvent): void {
    const hoverState = pickHoverState(event.clientX, event.clientY);
    canvas.style.cursor = hoverState ? 'pointer' : 'grab';
    onHoverStateChange?.(hoverState);
  }

  function handlePointerLeave(): void {
    canvas.style.cursor = 'grab';
    onHoverStateChange?.(null);
  }

  function handleDoubleClick(): void {
    fitAll();
  }

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('dblclick', handleDoubleClick);

  engine.renderer.setAnimationLoop(() => {
    const elapsed = engine.clock.getElapsedTime();
    const coreAura = visuals.rootGroup.getObjectByName('core-aura') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | undefined;
    const coreShell = visuals.rootGroup.getObjectByName('core-shell') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | undefined;
    if (coreAura) {
      const auraPulse = 0.96 + Math.sin(elapsed * 1.2) * 0.06;
      coreAura.scale.setScalar(auraPulse);
    }
    if (coreShell) {
      coreShell.rotation.y += 0.003;
    }

    for (const visual of visuals.agentVisuals.values()) {
      visual.group.position.copy(visual.anchor);
      visual.group.position.y += Math.sin(elapsed * visual.floatSpeed + visual.anchor.x * 0.08) * visual.floatAmplitude;
      visual.group.rotation.y += 0.02;
      const glowScale = 0.92 + Math.sin(elapsed * (visual.floatSpeed + 0.3)) * 0.08;
      visual.glow.scale.setScalar(glowScale);
    }

    engine.controls.autoRotate = state.autoRotate;
    engine.controls.update();
    engine.renderer.render(engine.scene, engine.camera);
  });

  fitAll();

  function zoom(multiplier: number): void {
    const offset = engine.camera.position.clone().sub(engine.controls.target);
    const nextDistance = clamp(offset.length() / multiplier, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    offset.setLength(nextDistance);
    engine.camera.position.copy(engine.controls.target.clone().add(offset));
    engine.controls.update();
  }

  function focusCore(): void {
    focusPlanetInterior(46);
  }

  return {
    setData(data) {
      const shouldRefit = !state.planet || state.planet.id !== data.planet.id;
      state.planet = data.planet;
      state.interior = data.interior;
      rebuildInterior();
      if (shouldRefit) {
        fitAll();
      }
    },
    setHighlight(highlight) {
      state.highlight = highlight;
      applyHighlight();
    },
    setAutoRotate(enabled) {
      state.autoRotate = enabled;
    },
    zoom,
    fitAll,
    focusCore,
    dispose() {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      engine.dispose();
      visuals.stageVisuals.clear();
      visuals.agentVisuals.clear();
      visuals.interactives = [];
    },
  };
}
