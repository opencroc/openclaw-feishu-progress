import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { getKindLabel, getStageLabel, getStatusLabel } from '@features/tasks/labels';
import type { PlanetEdge, PlanetOverviewItem } from '@features/tasks/types';
import { PLANET_UNIVERSE_VIEW_BOX } from './PlanetUniverse';

type UniverseScene3DProps = {
  planets: PlanetOverviewItem[];
  edges: PlanetEdge[];
  selectedId: string | null;
  focusPlanetId?: string | null;
  mutedPlanetIds?: string[];
  highlightPlanetIds?: string[];
  onPlanetClick: (id: string) => void;
};

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
      new THREE.Vector3(Math.cos((angle + nextAngle) / 2) * (radius * 1.1), radius * 0.18, Math.sin((angle + nextAngle) / 2) * (radius * 1.1)),
    );
  }

  return new THREE.BufferGeometry().setFromPoints(points);
}

function createEdgeLine(from: THREE.Vector3, to: THREE.Vector3, type: PlanetEdge['type'], confidence: number): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
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

function describePlanet(planet: PlanetOverviewItem): string {
  const stageCopy = planet.currentStageLabel
    ? getStageLabel(planet.currentStageLabel, planet.currentStageKey)
    : planet.currentStageKey
      ? getStageLabel(undefined, planet.currentStageKey)
      : getStatusLabel(planet.status);

  return `${getKindLabel(planet.kind)} · ${getStatusLabel(planet.status)} · ${planet.progress}% · ${stageCopy}`;
}

export default function UniverseScene3D({
  planets,
  edges,
  selectedId,
  focusPlanetId,
  mutedPlanetIds = [],
  highlightPlanetIds = [],
  onPlanetClick,
}: UniverseScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onPlanetClickRef = useRef(onPlanetClick);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const universeGroupRef = useRef<THREE.Group | null>(null);
  const planetVisualsRef = useRef<Map<string, PlanetNodeVisual>>(new Map());
  const planetMeshesRef = useRef<THREE.Object3D[]>([]);
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const hasInteractedRef = useRef(false);
  const appliedFocusRef = useRef<string | null>(null);
  const [hoveredPlanetId, setHoveredPlanetId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const planetsRef = useRef(planets);
  const autoRotateRef = useRef(autoRotate);

  onPlanetClickRef.current = onPlanetClick;
  planetsRef.current = planets;
  autoRotateRef.current = autoRotate;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf5efe5, 120, 360);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
    camera.position.set(84, 72, 84);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearAlpha(0);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.75;
    controls.minDistance = MIN_CAMERA_DISTANCE;
    controls.maxDistance = MAX_CAMERA_DISTANCE;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.target.set(0, 12, 0);
    controls.addEventListener('start', () => {
      hasInteractedRef.current = true;
    });

    const ambient = new THREE.AmbientLight(0xfff4e7, 1.75);
    const hemi = new THREE.HemisphereLight(0xf8f4ee, 0xd8cfc0, 1.2);
    const keyLight = new THREE.DirectionalLight(0xfff1d9, 2.2);
    keyLight.position.set(70, 92, 34);
    const fillLight = new THREE.DirectionalLight(0xaec5d8, 0.8);
    fillLight.position.set(-48, 36, -28);
    const warmCore = new THREE.PointLight(0xc18a3f, 90, 240, 2);
    warmCore.position.set(0, 22, 0);
    const jadeGlow = new THREE.PointLight(0x6b9f8d, 36, 180, 2);
    jadeGlow.position.set(-36, 18, 24);

    scene.add(ambient, hemi, keyLight, fillLight, warmCore, jadeGlow);

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
    scene.add(ground);

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
    scene.add(orbitPlate);

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
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: 0xf5ebdc,
        size: 1.35,
        transparent: true,
        opacity: 0.72,
        sizeAttenuation: true,
      }),
    );
    scene.add(stars);

    const universeGroup = new THREE.Group();
    scene.add(universeGroup);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    universeGroupRef.current = universeGroup;

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
      for (const visual of planetVisualsRef.current.values()) {
        visual.group.position.y = visual.baseY + Math.sin(elapsed * visual.driftSpeed + visual.phaseOffset) * visual.driftAmplitude;
        const pulse = 0.94 + Math.sin(elapsed * (visual.driftSpeed + 0.65) + visual.phaseOffset) * 0.05;
        visual.aura.scale.setScalar(pulse);
        visual.progressRing.rotation.z += 0.0024;
        visual.selectionRing.rotation.y += 0.004;
        visual.crown.rotation.y -= 0.002;
      }

      controls.autoRotate = autoRotateRef.current;
      controls.update();
      renderer.render(scene, camera);
    });

    function pickPlanet(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;

      pointerRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(planetMeshesRef.current, false);
      const target = hits[0]?.object.userData.planetId;
      return typeof target === 'string' ? target : null;
    }

    function updateHover(nextPlanetId: string | null): void {
      setHoveredPlanetId((current) => (current === nextPlanetId ? current : nextPlanetId));
      canvas.style.cursor = nextPlanetId ? 'pointer' : 'grab';
    }

    function handlePointerMove(event: PointerEvent): void {
      updateHover(pickPlanet(event.clientX, event.clientY));
    }

    function handlePointerLeave(): void {
      updateHover(null);
    }

    function handleClick(event: MouseEvent): void {
      const planetId = pickPlanet(event.clientX, event.clientY);
      if (!planetId) return;
      onPlanetClickRef.current(planetId);
    }

    function handleDoubleClick(event: MouseEvent): void {
      const planetId = pickPlanet(event.clientX, event.clientY);
      if (!planetId) {
        hasInteractedRef.current = true;
        appliedFocusRef.current = null;
        fitAllPlanets();
        return;
      }
      focusPlanet(planetId);
    }

    function frameTarget(target: THREE.Vector3, radius: number): void {
      const distance = clamp(radius * 3.2, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
      const nextPosition = target.clone().add(DEFAULT_CAMERA_OFFSET.clone().multiplyScalar(distance));
      camera.position.copy(nextPosition);
      controls.target.copy(target);
      controls.update();
    }

    function fitAllPlanets(): void {
      const bounds = computeViewBounds(planetsRef.current);
      frameTarget(bounds.center, bounds.radius);
    }

    function focusPlanet(planetId: string): void {
      const visual = planetVisualsRef.current.get(planetId);
      if (!visual) return;
      hasInteractedRef.current = true;
      frameTarget(visual.position, Math.max(visual.radius * 1.4, 18));
    }

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('dblclick', handleDoubleClick);

    (container as HTMLDivElement & {
      __universeFitAll?: typeof fitAllPlanets;
      __universeFocusPlanet?: typeof focusPlanet;
    }).__universeFitAll = fitAllPlanets;
    (container as HTMLDivElement & {
      __universeFocusPlanet?: typeof focusPlanet;
    }).__universeFocusPlanet = focusPlanet;

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();

      if (universeGroupRef.current) {
        disposeObject(universeGroupRef.current);
      }
      disposeObject(scene);
      renderer.dispose();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      universeGroupRef.current = null;
      planetVisualsRef.current = new Map();
      planetMeshesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const universeGroup = universeGroupRef.current;
    if (!scene || !universeGroup) return;

    disposeObject(universeGroup);
    scene.remove(universeGroup);

    const nextUniverseGroup = new THREE.Group();
    scene.add(nextUniverseGroup);
    universeGroupRef.current = nextUniverseGroup;
    planetVisualsRef.current = new Map();
    planetMeshesRef.current = [];

    const mutedPlanetSet = new Set(mutedPlanetIds);
    const highlightPlanetSet = new Set(highlightPlanetIds);
    const positionMap = new Map<string, THREE.Vector3>();

    for (const planet of planets) {
      positionMap.set(planet.id, planetWorldPosition(planet));
    }

    const edgeGroup = new THREE.Group();
    edgeGroup.renderOrder = 1;
    for (const edge of edges) {
      const from = positionMap.get(edge.fromPlanetId);
      const to = positionMap.get(edge.toPlanetId);
      if (!from || !to) continue;

      const line = createEdgeLine(from, to, edge.type, edge.confidence);
      if (mutedPlanetSet.has(edge.fromPlanetId) || mutedPlanetSet.has(edge.toPlanetId)) {
        line.material.opacity *= 0.22;
      }
      edgeGroup.add(line);
    }
    nextUniverseGroup.add(edgeGroup);

    const planetGroup = new THREE.Group();
    planetGroup.renderOrder = 2;

    for (const planet of planets) {
      const colors = STATUS_COLORS[planet.status];
      const position = positionMap.get(planet.id) ?? planetWorldPosition(planet);
      const radius = planetWorldRadius(planet);
      const muted = mutedPlanetSet.has(planet.id);
      const highlighted = highlightPlanetSet.has(planet.id);
      const selected = planet.id === selectedId;

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
      planetMeshesRef.current.push(shell);

      planetVisualsRef.current.set(planet.id, {
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

    nextUniverseGroup.add(planetGroup);
  }, [edges, highlightPlanetIds, mutedPlanetIds, planets, selectedId]);

  useEffect(() => {
    const container = containerRef.current as (HTMLDivElement & {
      __universeFitAll?: () => void;
      __universeFocusPlanet?: (planetId: string) => void;
    }) | null;
    if (!container) return;

    const targetId = focusPlanetId || selectedId;
    if (targetId) {
      if (appliedFocusRef.current === targetId) return;
      container.__universeFocusPlanet?.(targetId);
      appliedFocusRef.current = targetId;
      return;
    }

    appliedFocusRef.current = null;
    if (!hasInteractedRef.current) {
      container.__universeFitAll?.();
    }
  }, [focusPlanetId, planets, selectedId]);

  const hoveredPlanet = hoveredPlanetId
    ? planets.find((planet) => planet.id === hoveredPlanetId) ?? null
    : null;
  const selectedPlanet = selectedId
    ? planets.find((planet) => planet.id === selectedId) ?? null
    : null;
  const overlayPlanet = hoveredPlanet ?? selectedPlanet;

  function zoom(multiplier: number): void {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    hasInteractedRef.current = true;
    const offset = camera.position.clone().sub(controls.target);
    const currentDistance = offset.length();
    const nextDistance = clamp(currentDistance / multiplier, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    offset.setLength(nextDistance);
    camera.position.copy(controls.target.clone().add(offset));
    controls.update();
  }

  function fitAll(): void {
    const container = containerRef.current as (HTMLDivElement & { __universeFitAll?: () => void }) | null;
    if (!container) return;
    hasInteractedRef.current = true;
    appliedFocusRef.current = null;
    container.__universeFitAll?.();
  }

  function focusSelected(): void {
    const planetId = selectedId ?? focusPlanetId;
    if (!planetId) return;
    const container = containerRef.current as (HTMLDivElement & { __universeFocusPlanet?: (planetId: string) => void }) | null;
    if (!container) return;
    hasInteractedRef.current = true;
    container.__universeFocusPlanet?.(planetId);
    appliedFocusRef.current = planetId;
  }

  return (
    <div className="universe-canvas-shell">
      <div ref={containerRef} className="universe-canvas-stage universe-canvas-stage-3d">
        <canvas ref={canvasRef} className="universe-scene-canvas" />

        <div className="universe-scene-overlay">
          <div className="universe-scene-badge">3D 星图</div>
          {overlayPlanet ? (
            <div className="universe-scene-hud">
              <strong>{overlayPlanet.title}</strong>
              <span>{describePlanet(overlayPlanet)}</span>
              {overlayPlanet.summary ? <span>{overlayPlanet.summary}</span> : null}
            </div>
          ) : (
            <div className="universe-scene-note">
              拖拽旋转星图，滚轮缩放，双击星球聚焦，双击留白适配全局。
            </div>
          )}
        </div>
      </div>

      <div className="universe-canvas-toolbar">
        <button type="button" onClick={() => zoom(1.16)}>+</button>
        <button type="button" onClick={() => zoom(1 / 1.16)}>-</button>
        <button type="button" onClick={fitAll}>适配</button>
        <button type="button" onClick={focusSelected} disabled={!selectedId && !focusPlanetId}>
          聚焦
        </button>
        <button type="button" onClick={() => setAutoRotate((current) => !current)}>
          {autoRotate ? '停转' : '旋转'}
        </button>
      </div>
    </div>
  );
}
