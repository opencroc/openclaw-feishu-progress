import * as THREE from 'three';

import type { PlanetEdge, PlanetOverviewItem } from '@features/tasks/types';
import { PLANET_UNIVERSE_VIEW_BOX } from '@features/tasks/universe/PlanetUniverse';

import { clamp, createViewportEngine, disposeObject } from './shared';

type PlanetNodeVisual = {
  id: string;
  group: THREE.Group;
  position: THREE.Vector3;
  radius: number;
  shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  aura: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  orbit: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  crown: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  selectionRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  progressRing: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  baseY: number;
  driftAmplitude: number;
  driftSpeed: number;
  phaseOffset: number;
};

const STATUS_COLORS: Record<PlanetOverviewItem['status'], { base: number; emissive: number; aura: number }> = {
  queued: { base: 0xd9d2c6, emissive: 0x8f8574, aura: 0xf2ebe1 },
  running: { base: 0xe8c27b, emissive: 0xb78034, aura: 0xf0d8a2 },
  waiting: { base: 0xcab8d8, emissive: 0x7b6a89, aura: 0xd9cfee },
  done: { base: 0x8fbba9, emissive: 0x2e6b59, aura: 0xc4e2d7 },
  failed: { base: 0xd6a094, emissive: 0xb95a4a, aura: 0xf1d6d0 },
  archived: { base: 0xc3beb1, emissive: 0x8b8478, aura: 0xe7e2d7 },
};

const EDGE_COLORS: Record<PlanetEdge['type'], number> = {
  'depends-on': 0x7b6a89,
  'related-to': 0x8c806f,
  'supersedes': 0xb95a4a,
};

const WORLD_SCALE = 0.18;
const DEFAULT_CAMERA_OFFSET = new THREE.Vector3(1.4, 1.05, 1.6).normalize();
const MIN_CAMERA_DISTANCE = 44;
const MAX_CAMERA_DISTANCE = 280;

export type UniverseScene3DData = {
  planets: PlanetOverviewItem[];
  edges: PlanetEdge[];
  selectedId: string | null;
  focusPlanetId?: string | null;
  mutedPlanetIds?: string[];
  highlightPlanetIds?: string[];
};

export type UniverseScene3DHandle = {
  setData: (data: UniverseScene3DData) => void;
  setAutoRotate: (enabled: boolean) => void;
  zoom: (multiplier: number) => void;
  fitAll: () => void;
  focusSelected: () => void;
  dispose: () => void;
};

type UniverseScene3DMountOptions = {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  onPlanetClick: (id: string) => void;
  onHoverPlanetIdChange?: (id: string | null) => void;
};

function planetWorldPosition(planet: PlanetOverviewItem): THREE.Vector3 {
  const x = (planet.position.x - PLANET_UNIVERSE_VIEW_BOX.width / 2) * WORLD_SCALE;
  const z = (planet.position.y - PLANET_UNIVERSE_VIEW_BOX.height / 2) * WORLD_SCALE;
  const statusLift = planet.status === 'running'
    ? 10
    : planet.status === 'waiting'
      ? 7
      : planet.status === 'done'
        ? 5
        : planet.status === 'failed'
          ? 3
          : planet.status === 'archived'
            ? 1
            : 2;

  return new THREE.Vector3(x, statusLift + planet.complexity * 2.25, z);
}

function planetWorldRadius(planet: PlanetOverviewItem): number {
  return 5 + planet.radius * 0.18;
}

function createProgressArc(radius: number, progress: number): THREE.BufferGeometry {
  const normalizedProgress = clamp(progress, 2, 100) / 100;
  const curve = new THREE.EllipseCurve(
    0,
    0,
    radius,
    radius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * normalizedProgress,
    false,
    0,
  );

  const points = curve.getPoints(Math.max(20, Math.round(40 * normalizedProgress)));
  const vectors = points.map((point) => new THREE.Vector3(point.x, 0, point.y));
  return new THREE.BufferGeometry().setFromPoints(vectors);
}

function createOrbit(radius: number): THREE.BufferGeometry {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(48).map((point) => new THREE.Vector3(point.x, 0, point.y));
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createCrown(radius: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const segments = 8;

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const nextAngle = ((index + 1) / segments) * Math.PI * 2;
    points.push(
      new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
      new THREE.Vector3(
        Math.cos((angle + nextAngle) / 2) * (radius * 1.1),
        radius * 0.18,
        Math.sin((angle + nextAngle) / 2) * (radius * 1.1),
      ),
    );
  }

  return new THREE.BufferGeometry().setFromPoints(points);
}

function createEdgeLine(
  from: THREE.Vector3,
  to: THREE.Vector3,
  type: PlanetEdge['type'],
  confidence: number,
): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const midpoint = from.clone().lerp(to, 0.5);
  midpoint.y += Math.max(10, from.distanceTo(to) * 0.16) + (type === 'depends-on' ? 4 : 0);

  const curve = new THREE.CatmullRomCurve3([from, midpoint, to]);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(28));
  const material = new THREE.LineBasicMaterial({
    color: EDGE_COLORS[type],
    transparent: true,
    opacity: clamp(confidence, 0.18, 0.88),
  });

  return new THREE.Line(geometry, material);
}

function computeViewBounds(planets: PlanetOverviewItem[]): { center: THREE.Vector3; radius: number } {
  if (planets.length === 0) {
    return {
      center: new THREE.Vector3(0, 12, 0),
      radius: 42,
    };
  }

  const box = new THREE.Box3();

  for (const planet of planets) {
    const position = planetWorldPosition(planet);
    const radius = planetWorldRadius(planet) + 8;
    box.expandByPoint(position.clone().addScalar(radius));
    box.expandByPoint(position.clone().addScalar(-radius));
  }

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return {
    center: sphere.center,
    radius: Math.max(sphere.radius, 26),
  };
}

export function mountUniverseScene3D({
  container,
  canvas,
  onPlanetClick,
  onHoverPlanetIdChange,
}: UniverseScene3DMountOptions): UniverseScene3DHandle {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const state = {
    planets: [] as PlanetOverviewItem[],
    edges: [] as PlanetEdge[],
    selectedId: null as string | null,
    focusPlanetId: null as string | null,
    hoveredPlanetId: null as string | null,
    mutedPlanetIds: [] as string[],
    highlightPlanetIds: [] as string[],
    autoRotate: true,
    hasInteracted: false,
    appliedFocusId: null as string | null,
  };

  const engine = createViewportEngine({
    container,
    canvas,
    fog: { color: 0xf5efe5, near: 120, far: 360 },
    camera: {
      fov: 48,
      near: 0.1,
      far: 1000,
      position: [84, 72, 84],
      target: [0, 12, 0],
    },
    controls: {
      rotateSpeed: 0.55,
      zoomSpeed: 0.9,
      panSpeed: 0.75,
      minDistance: MIN_CAMERA_DISTANCE,
      maxDistance: MAX_CAMERA_DISTANCE,
      maxPolarAngle: Math.PI * 0.48,
      minPolarAngle: Math.PI * 0.08,
      autoRotate: true,
      autoRotateSpeed: 0.35,
    },
    exposure: 1.1,
    onControlStart() {
      state.hasInteracted = true;
    },
  });

  engine.scene.add(
    new THREE.AmbientLight(0xfff4e7, 1.75),
    new THREE.HemisphereLight(0xf8f4ee, 0xd8cfc0, 1.2),
  );

  const keyLight = new THREE.DirectionalLight(0xfff1d9, 2.2);
  keyLight.position.set(70, 92, 34);
  const fillLight = new THREE.DirectionalLight(0xaec5d8, 0.8);
  fillLight.position.set(-48, 36, -28);
  const warmCore = new THREE.PointLight(0xc18a3f, 90, 240, 2);
  warmCore.position.set(0, 22, 0);
  const jadeGlow = new THREE.PointLight(0x6b9f8d, 36, 180, 2);
  jadeGlow.position.set(-36, 18, 24);
  engine.scene.add(keyLight, fillLight, warmCore, jadeGlow);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(210, 72),
    new THREE.MeshStandardMaterial({
      color: 0xf6efe5,
      roughness: 0.94,
      metalness: 0.02,
      transparent: true,
      opacity: 0.76,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  engine.scene.add(ground);

  const orbitPlate = new THREE.Mesh(
    new THREE.RingGeometry(56, 164, 84),
    new THREE.MeshBasicMaterial({
      color: 0xd9cab7,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  orbitPlate.rotation.x = -Math.PI / 2;
  orbitPlate.position.y = -1.6;
  engine.scene.add(orbitPlate);

  const starsGeometry = new THREE.BufferGeometry();
  const starCount = 420;
  const starPositions = new Float32Array(starCount * 3);
  for (let index = 0; index < starCount; index += 1) {
    const stride = index * 3;
    starPositions[stride] = (Math.random() - 0.5) * 420;
    starPositions[stride + 1] = Math.random() * 180 + 8;
    starPositions[stride + 2] = (Math.random() - 0.5) * 420;
  }
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  engine.scene.add(new THREE.Points(
    starsGeometry,
    new THREE.PointsMaterial({
      color: 0xf5ebdc,
      size: 1.35,
      transparent: true,
      opacity: 0.72,
      sizeAttenuation: true,
    }),
  ));

  const visuals = {
    universeGroup: new THREE.Group(),
    planetVisuals: new Map<string, PlanetNodeVisual>(),
    planetMeshes: [] as THREE.Object3D[],
  };
  engine.scene.add(visuals.universeGroup);

  function pickPlanet(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, engine.camera);
    const hits = raycaster.intersectObjects(visuals.planetMeshes, false);
    const planetId = hits[0]?.object.userData.planetId;
    return typeof planetId === 'string' ? planetId : null;
  }

  function setHovered(nextPlanetId: string | null): void {
    if (state.hoveredPlanetId === nextPlanetId) return;
    state.hoveredPlanetId = nextPlanetId;
    canvas.style.cursor = nextPlanetId ? 'pointer' : 'grab';
    onHoverPlanetIdChange?.(nextPlanetId);
  }

  function frameTarget(target: THREE.Vector3, radius: number): void {
    const distance = clamp(radius * 3.2, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    const nextPosition = target.clone().add(DEFAULT_CAMERA_OFFSET.clone().multiplyScalar(distance));
    engine.camera.position.copy(nextPosition);
    engine.controls.target.copy(target);
    engine.controls.update();
  }

  function fitAllPlanets(): void {
    const bounds = computeViewBounds(state.planets);
    frameTarget(bounds.center, bounds.radius);
  }

  function focusPlanet(planetId: string): boolean {
    const visual = visuals.planetVisuals.get(planetId);
    if (!visual) return false;
    state.hasInteracted = true;
    frameTarget(visual.position, Math.max(visual.radius * 1.4, 18));
    return true;
  }

  function applyFocus(): void {
    const targetId = state.focusPlanetId || state.selectedId;
    if (targetId) {
      if (state.appliedFocusId === targetId) return;
      if (focusPlanet(targetId)) {
        state.appliedFocusId = targetId;
      }
      return;
    }

    state.appliedFocusId = null;
    if (!state.hasInteracted) {
      fitAllPlanets();
    }
  }

  function rebuildUniverseGroup(): void {
    disposeObject(visuals.universeGroup);
    visuals.universeGroup.clear();
    visuals.planetVisuals.clear();
    visuals.planetMeshes = [];

    const mutedPlanetSet = new Set(state.mutedPlanetIds);
    const highlightPlanetSet = new Set(state.highlightPlanetIds);
    const positionMap = new Map<string, THREE.Vector3>();
    for (const planet of state.planets) {
      positionMap.set(planet.id, planetWorldPosition(planet));
    }

    const edgeGroup = new THREE.Group();
    edgeGroup.renderOrder = 1;
    for (const edge of state.edges) {
      const from = positionMap.get(edge.fromPlanetId);
      const to = positionMap.get(edge.toPlanetId);
      if (!from || !to) continue;

      const line = createEdgeLine(from, to, edge.type, edge.confidence);
      if (mutedPlanetSet.has(edge.fromPlanetId) || mutedPlanetSet.has(edge.toPlanetId)) {
        line.material.opacity *= 0.22;
      }
      edgeGroup.add(line);
    }
    visuals.universeGroup.add(edgeGroup);

    const planetGroup = new THREE.Group();
    planetGroup.renderOrder = 2;

    for (const planet of state.planets) {
      const colors = STATUS_COLORS[planet.status];
      const position = positionMap.get(planet.id) ?? planetWorldPosition(planet);
      const radius = planetWorldRadius(planet);
      const muted = mutedPlanetSet.has(planet.id);
      const highlighted = highlightPlanetSet.has(planet.id);
      const selected = planet.id === state.selectedId;

      const shellGeometry = new THREE.SphereGeometry(radius, 32, 32);
      const shellMaterial = new THREE.MeshStandardMaterial({
        color: colors.base,
        emissive: colors.emissive,
        emissiveIntensity: planet.status === 'running' ? 0.42 : planet.status === 'waiting' ? 0.26 : highlighted ? 0.22 : 0.12,
        roughness: 0.34,
        metalness: 0.2,
        transparent: true,
        opacity: muted ? 0.16 : 0.96,
      });
      const shell = new THREE.Mesh(shellGeometry, shellMaterial);
      shell.userData.planetId = planet.id;

      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.28, 24, 24),
        new THREE.MeshBasicMaterial({
          color: selected ? 0xe7d4a8 : highlighted ? 0x82a9b4 : colors.aura,
          transparent: true,
          opacity: muted ? 0.04 : planet.status === 'running' ? 0.18 : highlighted ? 0.14 : 0.08,
          depthWrite: false,
        }),
      );

      const orbit = new THREE.Line(
        createOrbit(radius * 1.65),
        new THREE.LineBasicMaterial({
          color: selected ? 0xb78034 : colors.emissive,
          transparent: true,
          opacity: muted ? 0.06 : planet.status === 'archived' ? 0.1 : 0.26,
        }),
      );
      orbit.rotation.x = Math.PI / 2;

      const crown = new THREE.LineLoop(
        createCrown(radius * 0.92),
        new THREE.LineBasicMaterial({
          color: selected ? 0xb78034 : highlighted ? 0x56748f : 0xffffff,
          transparent: true,
          opacity: muted ? 0.08 : 0.42,
        }),
      );
      crown.position.y = radius * 1.14;

      const selectionRing = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.5, Math.max(0.18, radius * 0.04), 18, 64),
        new THREE.MeshBasicMaterial({
          color: selected ? 0xb78034 : highlighted ? 0x56748f : colors.emissive,
          transparent: true,
          opacity: muted ? 0.04 : selected ? 0.82 : highlighted ? 0.44 : 0.18,
          depthWrite: false,
        }),
      );
      selectionRing.rotation.x = Math.PI / 2;

      const progressRing = new THREE.Line(
        createProgressArc(radius * 1.28, planet.progress),
        new THREE.LineBasicMaterial({
          color: planet.status === 'failed' ? 0xb95a4a : planet.status === 'running' ? 0xb78034 : 0x56748f,
          transparent: true,
          opacity: muted ? 0.08 : 0.84,
        }),
      );
      progressRing.rotation.x = Math.PI / 2;
      progressRing.position.y = radius * 0.06;

      const group = new THREE.Group();
      group.position.copy(position);
      group.add(aura, orbit, selectionRing, progressRing, shell, crown);
      planetGroup.add(group);
      visuals.planetMeshes.push(shell);

      visuals.planetVisuals.set(planet.id, {
        id: planet.id,
        group,
        position: position.clone(),
        radius,
        shell,
        aura,
        orbit,
        crown,
        selectionRing,
        progressRing,
        baseY: position.y,
        driftAmplitude: planet.status === 'running' ? 1.8 : planet.status === 'waiting' ? 1.1 : 0.5,
        driftSpeed: planet.status === 'running' ? 1.35 : planet.status === 'waiting' ? 0.92 : 0.45,
        phaseOffset: planet.createdAt / 1000,
      });
    }

    visuals.universeGroup.add(planetGroup);
  }

  function handlePointerMove(event: PointerEvent): void {
    setHovered(pickPlanet(event.clientX, event.clientY));
  }

  function handlePointerLeave(): void {
    setHovered(null);
  }

  function handleClick(event: MouseEvent): void {
    const planetId = pickPlanet(event.clientX, event.clientY);
    if (!planetId) return;
    onPlanetClick(planetId);
  }

  function handleDoubleClick(event: MouseEvent): void {
    const planetId = pickPlanet(event.clientX, event.clientY);
    if (!planetId) {
      state.hasInteracted = true;
      state.appliedFocusId = null;
      fitAllPlanets();
      return;
    }
    focusPlanet(planetId);
  }

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('dblclick', handleDoubleClick);

  engine.renderer.setAnimationLoop(() => {
    const elapsed = engine.clock.getElapsedTime();
    for (const visual of visuals.planetVisuals.values()) {
      visual.group.position.y = visual.baseY + Math.sin(elapsed * visual.driftSpeed + visual.phaseOffset) * visual.driftAmplitude;
      const pulse = 0.94 + Math.sin(elapsed * (visual.driftSpeed + 0.65) + visual.phaseOffset) * 0.05;
      visual.aura.scale.setScalar(pulse);
      visual.progressRing.rotation.z += 0.0024;
      visual.selectionRing.rotation.y += 0.004;
      visual.crown.rotation.y -= 0.002;
    }

    engine.controls.autoRotate = state.autoRotate;
    engine.controls.update();
    engine.renderer.render(engine.scene, engine.camera);
  });

  function zoom(multiplier: number): void {
    const offset = engine.camera.position.clone().sub(engine.controls.target);
    const currentDistance = offset.length();
    const nextDistance = clamp(currentDistance / multiplier, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    offset.setLength(nextDistance);
    engine.camera.position.copy(engine.controls.target.clone().add(offset));
    engine.controls.update();
  }

  function fitAll(): void {
    state.hasInteracted = true;
    state.appliedFocusId = null;
    fitAllPlanets();
  }

  function focusSelected(): void {
    const planetId = state.selectedId ?? state.focusPlanetId;
    if (!planetId) return;
    state.hasInteracted = true;
    if (focusPlanet(planetId)) {
      state.appliedFocusId = planetId;
    }
  }

  return {
    setData(data) {
      state.planets = data.planets;
      state.edges = data.edges;
      state.selectedId = data.selectedId;
      state.focusPlanetId = data.focusPlanetId ?? null;
      state.mutedPlanetIds = data.mutedPlanetIds ?? [];
      state.highlightPlanetIds = data.highlightPlanetIds ?? [];

      rebuildUniverseGroup();
      applyFocus();
    },
    setAutoRotate(enabled) {
      state.autoRotate = enabled;
    },
    zoom,
    fitAll,
    focusSelected,
    dispose() {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      engine.dispose();
      visuals.planetVisuals.clear();
      visuals.planetMeshes = [];
    },
  };
}
