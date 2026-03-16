/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — Office Environment
   Low-poly 3D office built from primitives
   ~3000 lines
   ═══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { getScene } from './engine.js';

let officeGroup = null;
let currentTheme = 'dark';

/* ─── Material Cache ───────────────────────────────────────────────────────── */
const MAT = {};

function initMaterials(theme) {
  const dk = theme === 'dark';
  MAT.floor     = new THREE.MeshStandardMaterial({ color: dk ? 0x1a2332 : 0xe2e8f0, roughness: 0.8, metalness: 0.05 });
  MAT.wall      = new THREE.MeshStandardMaterial({ color: dk ? 0x1e293b : 0xf8fafc, roughness: 0.7, metalness: 0.0, transparent: true, opacity: 0.85 });
  MAT.wallGlass = new THREE.MeshPhysicalMaterial({ color: dk ? 0x1e3a5f : 0xbfdbfe, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.25, transmission: 0.6, thickness: 0.5, ior: 1.5 });
  MAT.desk      = new THREE.MeshStandardMaterial({ color: dk ? 0x2d3748 : 0xcbd5e1, roughness: 0.5, metalness: 0.2 });
  MAT.deskTop   = new THREE.MeshStandardMaterial({ color: dk ? 0x374151 : 0xdde4ed, roughness: 0.4, metalness: 0.15 });
  MAT.chair     = new THREE.MeshStandardMaterial({ color: dk ? 0x4a5568 : 0x94a3b8, roughness: 0.6, metalness: 0.1 });
  MAT.screen    = new THREE.MeshStandardMaterial({ color: dk ? 0x000000 : 0x111111, roughness: 0.1, metalness: 0.8 });
  MAT.screenGlow= new THREE.MeshBasicMaterial({ color: dk ? 0x34d399 : 0x059669, transparent: true, opacity: 0.6 });
  MAT.metal     = new THREE.MeshStandardMaterial({ color: dk ? 0x64748b : 0x94a3b8, roughness: 0.3, metalness: 0.7 });
  MAT.accent    = new THREE.MeshStandardMaterial({ color: dk ? 0x34d399 : 0x059669, roughness: 0.4, metalness: 0.3, emissive: dk ? 0x34d399 : 0x059669, emissiveIntensity: dk ? 0.3 : 0.1 });
  MAT.neon      = new THREE.MeshBasicMaterial({ color: dk ? 0x34d399 : 0x059669, transparent: true, opacity: dk ? 0.8 : 0.4 });
  MAT.neonBlue  = new THREE.MeshBasicMaterial({ color: dk ? 0x60a5fa : 0x2563eb, transparent: true, opacity: dk ? 0.6 : 0.3 });
  MAT.neonPurple= new THREE.MeshBasicMaterial({ color: dk ? 0xa78bfa : 0x7c3aed, transparent: true, opacity: dk ? 0.5 : 0.25 });
  MAT.server    = new THREE.MeshStandardMaterial({ color: dk ? 0x1a2332 : 0xcbd5e1, roughness: 0.3, metalness: 0.6 });
  MAT.coffee    = new THREE.MeshStandardMaterial({ color: dk ? 0x78350f : 0xa16207, roughness: 0.5, metalness: 0.1 });
  MAT.plant     = new THREE.MeshStandardMaterial({ color: dk ? 0x166534 : 0x22c55e, roughness: 0.8, metalness: 0.0 });
  MAT.pot       = new THREE.MeshStandardMaterial({ color: dk ? 0x92400e : 0xfbbf24, roughness: 0.6, metalness: 0.0 });
  MAT.whiteboard= new THREE.MeshStandardMaterial({ color: dk ? 0xf8fafc : 0xffffff, roughness: 0.2, metalness: 0.05 });
  MAT.frame     = new THREE.MeshStandardMaterial({ color: dk ? 0x374151 : 0x64748b, roughness: 0.4, metalness: 0.5 });
  MAT.carpet    = new THREE.MeshStandardMaterial({ color: dk ? 0x1e1b4b : 0xc7d2fe, roughness: 0.95, metalness: 0.0 });
  MAT.pillar    = new THREE.MeshStandardMaterial({ color: dk ? 0x334155 : 0xe2e8f0, roughness: 0.5, metalness: 0.3 });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   createOffice — Build the full 3D office environment
   ═══════════════════════════════════════════════════════════════════════════════ */
export async function createOffice(theme) {
  currentTheme = theme;
  initMaterials(theme);

  const scene = getScene();
  officeGroup = new THREE.Group();
  officeGroup.name = 'office';

  buildFloor();
  buildWalls();
  buildGlassPartitions();
  buildPondZone();
  buildDesks(6);
  buildServerRack();
  buildCoffeeMachine();
  buildPlants();
  buildWhiteboard();
  buildPillars();
  buildCarpet();
  buildCeilingLights();
  buildNeonStrips();
  buildCenterPlatform();
  buildBookshelf();
  buildWaterCooler();
  buildDecorativeElements();

  scene.add(officeGroup);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Office Floor
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildFloor() {
  const geo = new THREE.BoxGeometry(28, 0.2, 20);
  const floor = new THREE.Mesh(geo, MAT.floor);
  floor.position.set(0, 0.1, 0);
  floor.receiveShadow = true;
  floor.name = 'office-floor';
  officeGroup.add(floor);

  // Floor edge trim (accent line)
  const edgeGeo = new THREE.BoxGeometry(28.2, 0.05, 0.05);
  const edgeFront = new THREE.Mesh(edgeGeo, MAT.neon);
  edgeFront.position.set(0, 0.22, 10);
  officeGroup.add(edgeFront);
  const edgeBack = edgeFront.clone();
  edgeBack.position.z = -10;
  officeGroup.add(edgeBack);

  const edgeSideGeo = new THREE.BoxGeometry(0.05, 0.05, 20.2);
  const edgeLeft = new THREE.Mesh(edgeSideGeo, MAT.neon);
  edgeLeft.position.set(-14, 0.22, 0);
  officeGroup.add(edgeLeft);
  const edgeRight = edgeLeft.clone();
  edgeRight.position.x = 14;
  officeGroup.add(edgeRight);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Walls
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildWalls() {
  // Back wall
  const backGeo = new THREE.BoxGeometry(28, 6, 0.15);
  const backWall = new THREE.Mesh(backGeo, MAT.wall);
  backWall.position.set(0, 3.2, -10);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  officeGroup.add(backWall);

  // Left wall
  const sideGeo = new THREE.BoxGeometry(0.15, 6, 20);
  const leftWall = new THREE.Mesh(sideGeo, MAT.wall);
  leftWall.position.set(-14, 3.2, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  officeGroup.add(leftWall);

  // Right wall (half + glass)
  const rightLower = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 20), MAT.wall);
  rightLower.position.set(14, 1.2, 0);
  rightLower.castShadow = true;
  officeGroup.add(rightLower);

  // Wall accent strips
  const stripGeo = new THREE.BoxGeometry(28, 0.04, 0.04);
  const strip1 = new THREE.Mesh(stripGeo, MAT.neon);
  strip1.position.set(0, 5, -9.9);
  officeGroup.add(strip1);
  const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 6, 0.04), MAT.neonBlue);
  strip2.position.set(-13.9, 3.2, 9.5);
  officeGroup.add(strip2);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Glass Partitions
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildGlassPartitions() {
  // Partition between server area and desks
  const partGeo = new THREE.BoxGeometry(0.08, 4, 8);
  const part1 = new THREE.Mesh(partGeo, MAT.wallGlass);
  part1.position.set(-5, 2.2, -3);
  officeGroup.add(part1);

  // Partition near center
  const part2Geo = new THREE.BoxGeometry(8, 3.5, 0.08);
  const part2 = new THREE.Mesh(part2Geo, MAT.wallGlass);
  part2.position.set(3, 1.95, 3);
  officeGroup.add(part2);

  // Glass frame accents
  const framGeo = new THREE.BoxGeometry(0.06, 4, 0.06);
  const frame1 = new THREE.Mesh(framGeo, MAT.frame);
  frame1.position.set(-5, 2.2, 1);
  officeGroup.add(frame1);
  const frame2 = frame1.clone();
  frame2.position.z = -7;
  officeGroup.add(frame2);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Agent Desks — Each agent gets a desk with monitor and chair
   ═══════════════════════════════════════════════════════════════════════════════ */
export const DESK_POSITIONS = [];
export const POND_POSITIONS = [];
const DESK_INDICATORS = new Map();

function buildPondZone() {
  const pond = new THREE.Group();
  pond.name = 'agent-pond';

  const centerX = -9;
  const centerZ = 6.2;

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.5, 0.16, 24),
    MAT.frame,
  );
  rim.position.set(centerX, 0.25, centerZ);
  rim.receiveShadow = true;
  pond.add(rim);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.2, 0.1, 24),
    new THREE.MeshStandardMaterial({
      color: currentTheme === 'dark' ? 0x0f3a5d : 0x7dd3fc,
      roughness: 0.18,
      metalness: 0.2,
      transparent: true,
      opacity: currentTheme === 'dark' ? 0.72 : 0.52,
      emissive: currentTheme === 'dark' ? 0x0ea5e9 : 0x0369a1,
      emissiveIntensity: currentTheme === 'dark' ? 0.16 : 0.06,
    }),
  );
  water.position.set(centerX, 0.3, centerZ);
  pond.add(water);

  // Pixel-style stepping stones around the pond edge.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 3.7 + (i % 2) * 0.25;
    const stone = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.06, 0.32),
      MAT.deskTop,
    );
    stone.position.set(centerX + Math.cos(a) * r, 0.23, centerZ + Math.sin(a) * r);
    stone.rotation.y = a * 0.7;
    stone.receiveShadow = true;
    pond.add(stone);
  }

  POND_POSITIONS.length = 0;
  const count = 24;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 1.55 + (i % 3) * 0.34;
    POND_POSITIONS.push({
      x: centerX + Math.cos(a) * r,
      z: centerZ + Math.sin(a) * r,
    });
  }

  officeGroup.add(pond);
}

function buildDesks(count) {
  DESK_POSITIONS.length = 0;
  DESK_INDICATORS.clear();
  const rows = 2;
  const cols = Math.ceil(count / rows);
  const xStart = -2;
  const zStart = -6;
  const xSpacing = 4.5;
  const zSpacing = 5;

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = xStart + col * xSpacing;
    const z = zStart + row * zSpacing;

    DESK_POSITIONS.push({ x, z });
    buildSingleDesk(x, z, i);
  }
}

function buildSingleDesk(x, z, idx) {
  const desk = new THREE.Group();
  desk.name = `desk-${idx}`;

  // Desktop surface
  const topGeo = new THREE.BoxGeometry(2.4, 0.08, 1.2);
  const top = new THREE.Mesh(topGeo, MAT.deskTop);
  top.position.set(0, 1.0, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  desk.add(top);

  // Legs (4)
  const legGeo = new THREE.BoxGeometry(0.08, 0.8, 0.08);
  const positions = [
    [-1.1, 0.6, -0.5], [1.1, 0.6, -0.5],
    [-1.1, 0.6, 0.5], [1.1, 0.6, 0.5],
  ];
  positions.forEach(p => {
    const leg = new THREE.Mesh(legGeo, MAT.desk);
    leg.position.set(...p);
    leg.castShadow = true;
    desk.add(leg);
  });

  // Monitor
  const monitorGroup = new THREE.Group();
  // Screen
  const scrGeo = new THREE.BoxGeometry(1.0, 0.7, 0.04);
  const scr = new THREE.Mesh(scrGeo, MAT.screen);
  scr.position.set(0, 1.65, -0.3);
  scr.castShadow = true;
  monitorGroup.add(scr);

  // Screen glow face
  const glowGeo = new THREE.PlaneGeometry(0.92, 0.62);
  const glow = new THREE.Mesh(glowGeo, MAT.screenGlow);
  glow.position.set(0, 1.65, -0.278);
  monitorGroup.add(glow);

  // Monitor stand
  const standGeo = new THREE.BoxGeometry(0.06, 0.28, 0.06);
  const stand = new THREE.Mesh(standGeo, MAT.metal);
  stand.position.set(0, 1.18, -0.3);
  monitorGroup.add(stand);

  // Monitor base
  const baseGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.04, 16);
  const base = new THREE.Mesh(baseGeo, MAT.metal);
  base.position.set(0, 1.04, -0.3);
  monitorGroup.add(base);

  desk.add(monitorGroup);

  // Keyboard
  const kbGeo = new THREE.BoxGeometry(0.6, 0.02, 0.2);
  const kb = new THREE.Mesh(kbGeo, MAT.desk);
  kb.position.set(0, 1.06, 0.15);
  desk.add(kb);

  // Mouse
  const mouseGeo = new THREE.BoxGeometry(0.1, 0.02, 0.14);
  const mouse = new THREE.Mesh(mouseGeo, MAT.desk);
  mouse.position.set(0.5, 1.06, 0.15);
  desk.add(mouse);

  // Chair
  const chairGroup = new THREE.Group();
  // Seat
  const seatGeo = new THREE.BoxGeometry(0.7, 0.08, 0.7);
  const seat = new THREE.Mesh(seatGeo, MAT.chair);
  seat.position.set(0, 0.7, 0.9);
  seat.castShadow = true;
  chairGroup.add(seat);
  // Back rest
  const backGeo = new THREE.BoxGeometry(0.7, 0.6, 0.06);
  const back = new THREE.Mesh(backGeo, MAT.chair);
  back.position.set(0, 1.04, 1.23);
  back.castShadow = true;
  chairGroup.add(back);
  // Chair base
  const cbaseGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8);
  const cbase = new THREE.Mesh(cbaseGeo, MAT.metal);
  cbase.position.set(0, 0.45, 0.9);
  chairGroup.add(cbase);
  // Chair wheels (5-star base)
  const wheelGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.03, 5);
  const wheel = new THREE.Mesh(wheelGeo, MAT.metal);
  wheel.position.set(0, 0.2, 0.9);
  chairGroup.add(wheel);

  desk.add(chairGroup);

  // Desk lamp
  if (idx % 2 === 0) {
    const lampGroup = new THREE.Group();
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.04, 16), MAT.metal);
    lampBase.position.set(-0.8, 1.06, -0.2);
    lampGroup.add(lampBase);
    const lampArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), MAT.metal);
    lampArm.position.set(-0.8, 1.31, -0.2);
    lampGroup.add(lampArm);
    const lampHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.12, 8), MAT.accent);
    lampHead.position.set(-0.8, 1.58, -0.2);
    lampHead.rotation.x = Math.PI;
    lampGroup.add(lampHead);
    desk.add(lampGroup);
  }

  // Coffee mug (alternating desks)
  if (idx % 3 === 1) {
    const mugGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.1, 12);
    const mug = new THREE.Mesh(mugGeo, MAT.coffee);
    mug.position.set(0.8, 1.09, 0.0);
    desk.add(mug);
  }

  // Occupancy beacon near each desk (idle=dim, occupied=bright).
  const indicator = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
    new THREE.MeshStandardMaterial({
      color: currentTheme === 'dark' ? 0x475569 : 0x94a3b8,
      roughness: 0.25,
      metalness: 0.4,
      emissive: currentTheme === 'dark' ? 0x0f172a : 0x64748b,
      emissiveIntensity: 0.12,
    }),
  );
  indicator.position.set(1.0, 1.08, -0.32);
  desk.add(indicator);
  DESK_INDICATORS.set(idx, indicator);

  desk.position.set(x, 0.2, z);
  officeGroup.add(desk);
}

export function setDeskOccupied(index, occupied) {
  const indicator = DESK_INDICATORS.get(index);
  if (!indicator) return;
  const mat = indicator.material;
  if (!mat) return;

  if (occupied) {
    mat.color.setHex(currentTheme === 'dark' ? 0x34d399 : 0x059669);
    mat.emissive.setHex(currentTheme === 'dark' ? 0x34d399 : 0x047857);
    mat.emissiveIntensity = currentTheme === 'dark' ? 0.62 : 0.35;
  } else {
    mat.color.setHex(currentTheme === 'dark' ? 0x475569 : 0x94a3b8);
    mat.emissive.setHex(currentTheme === 'dark' ? 0x0f172a : 0x64748b);
    mat.emissiveIntensity = 0.12;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Server Rack
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildServerRack() {
  const rack = new THREE.Group();
  rack.name = 'server-rack';

  // Main cabinet
  const cabinetGeo = new THREE.BoxGeometry(1.0, 3.5, 0.8);
  const cabinet = new THREE.Mesh(cabinetGeo, MAT.server);
  cabinet.position.set(0, 1.95, 0);
  cabinet.castShadow = true;
  rack.add(cabinet);

  // Server units (stacked)
  for (let i = 0; i < 6; i++) {
    const unitGeo = new THREE.BoxGeometry(0.9, 0.35, 0.7);
    const unit = new THREE.Mesh(unitGeo, MAT.desk);
    unit.position.set(0, 0.5 + i * 0.5, 0);
    rack.add(unit);

    // LED lights on each server unit
    const ledColors = [MAT.neon, MAT.neonBlue, MAT.neon, MAT.neonBlue, MAT.neon, MAT.neonPurple];
    for (let j = 0; j < 3; j++) {
      const ledGeo = new THREE.BoxGeometry(0.03, 0.03, 0.01);
      const led = new THREE.Mesh(ledGeo, ledColors[i]);
      led.position.set(-0.3 + j * 0.15, 0.5 + i * 0.5, 0.36);
      rack.add(led);
    }
  }

  // Status light on top
  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8), MAT.accent);
  statusLight.position.set(0, 3.8, 0);
  rack.add(statusLight);

  rack.position.set(-10, 0.2, -6);
  officeGroup.add(rack);

  // Second rack
  const rack2 = rack.clone();
  rack2.position.set(-10, 0.2, -3);
  rack2.name = 'server-rack-2';
  officeGroup.add(rack2);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Coffee Machine Area
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildCoffeeMachine() {
  const area = new THREE.Group();
  area.name = 'coffee-area';

  // Counter
  const counterGeo = new THREE.BoxGeometry(2.5, 1.0, 0.8);
  const counter = new THREE.Mesh(counterGeo, MAT.deskTop);
  counter.position.set(0, 0.7, 0);
  counter.castShadow = true;
  counter.receiveShadow = true;
  area.add(counter);

  // Machine body
  const machineGeo = new THREE.BoxGeometry(0.5, 0.6, 0.4);
  const machine = new THREE.Mesh(machineGeo, MAT.server);
  machine.position.set(-0.4, 1.5, 0);
  machine.castShadow = true;
  area.add(machine);

  // Machine spout
  const spoutGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
  const spout = new THREE.Mesh(spoutGeo, MAT.metal);
  spout.position.set(-0.4, 1.13, 0.15);
  area.add(spout);

  // Cups
  for (let i = 0; i < 3; i++) {
    const cupGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.08, 8);
    const cup = new THREE.Mesh(cupGeo, MAT.coffee);
    cup.position.set(0.3 + i * 0.15, 1.24, 0);
    area.add(cup);
  }

  // Green indicator LED
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8), MAT.accent);
  led.position.set(-0.15, 1.7, 0.21);
  area.add(led);

  area.position.set(11, 0.2, -7);
  officeGroup.add(area);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Plants
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildPlants() {
  const positions = [
    [-12, 0.2, 8], [12, 0.2, 8], [-12, 0.2, -8], [8, 0.2, -8],
    [0, 0.2, 9], [-7, 0.2, 9],
  ];

  positions.forEach((pos, i) => {
    const plant = new THREE.Group();
    plant.name = `plant-${i}`;

    // Pot
    const potGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.35, 8);
    const pot = new THREE.Mesh(potGeo, MAT.pot);
    pot.position.set(0, 0.175, 0);
    pot.castShadow = true;
    plant.add(pot);

    // Leaves (spheres at different angles)
    const leafMat = MAT.plant;
    for (let j = 0; j < 5; j++) {
      const leafGeo = new THREE.SphereGeometry(0.15 + Math.random() * 0.1, 6, 6);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const angle = (j / 5) * Math.PI * 2;
      leaf.position.set(
        Math.cos(angle) * 0.15,
        0.5 + Math.random() * 0.3,
        Math.sin(angle) * 0.15
      );
      leaf.scale.y = 1.2 + Math.random() * 0.3;
      plant.add(leaf);
    }

    // Center trunk
    const trunkGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6);
    const trunk = new THREE.Mesh(trunkGeo, MAT.coffee);
    trunk.position.set(0, 0.5, 0);
    plant.add(trunk);

    plant.position.set(...pos);
    officeGroup.add(plant);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Whiteboard
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildWhiteboard() {
  const wb = new THREE.Group();
  wb.name = 'whiteboard';

  // Board
  const boardGeo = new THREE.BoxGeometry(3, 2, 0.06);
  const board = new THREE.Mesh(boardGeo, MAT.whiteboard);
  board.position.set(0, 3.2, -9.9);
  board.castShadow = true;
  wb.add(board);

  // Frame
  const frameGeo = new THREE.BoxGeometry(3.1, 2.1, 0.04);
  const frame = new THREE.Mesh(frameGeo, MAT.frame);
  frame.position.set(0, 3.2, -9.95);
  wb.add(frame);

  // Colored marks on the board
  const markColors = [0x34d399, 0x60a5fa, 0xf87171, 0xfbbf24];
  for (let i = 0; i < 4; i++) {
    const markGeo = new THREE.BoxGeometry(0.6, 0.04, 0.01);
    const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({
      color: markColors[i], transparent: true, opacity: 0.6,
    }));
    mark.position.set(-0.9 + i * 0.6, 3.5 - i * 0.2, -9.86);
    wb.add(mark);
  }

  officeGroup.add(wb);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Pillars
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildPillars() {
  const positions = [[-8, 0], [8, 0], [-8, -6], [8, -6]];
  positions.forEach(([x, z], i) => {
    const pillarGeo = new THREE.BoxGeometry(0.4, 6.2, 0.4);
    const pillar = new THREE.Mesh(pillarGeo, MAT.pillar);
    pillar.position.set(x, 3.3, z);
    pillar.castShadow = true;
    pillar.name = `pillar-${i}`;
    officeGroup.add(pillar);

    // Neon accent at pillar base
    const neonGeo = new THREE.BoxGeometry(0.5, 0.04, 0.5);
    const neon = new THREE.Mesh(neonGeo, i < 2 ? MAT.neon : MAT.neonBlue);
    neon.position.set(x, 0.22, z);
    officeGroup.add(neon);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Carpet
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildCarpet() {
  const carpetGeo = new THREE.BoxGeometry(10, 0.03, 7);
  const carpet = new THREE.Mesh(carpetGeo, MAT.carpet);
  carpet.position.set(2, 0.22, -3);
  carpet.receiveShadow = true;
  carpet.name = 'carpet';
  officeGroup.add(carpet);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Ceiling Lights
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildCeilingLights() {
  const positions = [[-4, -4], [4, -4], [-4, 3], [4, 3], [0, 0]];
  positions.forEach(([x, z], i) => {
    const lightGroup = new THREE.Group();
    lightGroup.name = `ceiling-light-${i}`;

    // Housing
    const housingGeo = new THREE.BoxGeometry(1.5, 0.06, 0.4);
    const housing = new THREE.Mesh(housingGeo, MAT.metal);
    housing.position.set(0, 6.0, 0);
    lightGroup.add(housing);

    // Light panel (emitting)
    const panelGeo = new THREE.BoxGeometry(1.4, 0.02, 0.35);
    const panelMat = new THREE.MeshBasicMaterial({
      color: currentTheme === 'dark' ? 0xddeeff : 0xfffef0,
      transparent: true,
      opacity: currentTheme === 'dark' ? 0.3 : 0.6,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 5.97, 0);
    panel.name = 'light-panel';
    lightGroup.add(panel);

    // Wire
    const wireGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4);
    const wire = new THREE.Mesh(wireGeo, MAT.metal);
    wire.position.set(-0.5, 6.25, 0);
    lightGroup.add(wire);
    const wire2 = wire.clone();
    wire2.position.x = 0.5;
    lightGroup.add(wire2);

    lightGroup.position.set(x, 0, z);
    officeGroup.add(lightGroup);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Neon Strips — Decorative glowing lines
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildNeonStrips() {
  // Floor neon strips (crossing pattern)
  const stripGeo = new THREE.BoxGeometry(0.04, 0.02, 14);
  const strip1 = new THREE.Mesh(stripGeo, MAT.neon);
  strip1.position.set(-5.04, 0.23, -2);
  officeGroup.add(strip1);

  const strip2Geo = new THREE.BoxGeometry(12, 0.02, 0.04);
  const strip2 = new THREE.Mesh(strip2Geo, MAT.neonBlue);
  strip2.position.set(2, 0.23, 3.04);
  officeGroup.add(strip2);

  // Ceiling neon strip
  const ceilStripGeo = new THREE.BoxGeometry(26, 0.03, 0.03);
  const ceilStrip = new THREE.Mesh(ceilStripGeo, MAT.neonPurple);
  ceilStrip.position.set(0, 6.15, 0);
  officeGroup.add(ceilStrip);

  const ceilStrip2Geo = new THREE.BoxGeometry(0.03, 0.03, 18);
  const ceilStrip2 = new THREE.Mesh(ceilStrip2Geo, MAT.neon);
  ceilStrip2.position.set(0, 6.15, 0);
  officeGroup.add(ceilStrip2);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Center Platform — Hologram display base
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildCenterPlatform() {
  const platform = new THREE.Group();
  platform.name = 'center-platform';

  // Octagonal base
  const baseGeo = new THREE.CylinderGeometry(1.5, 1.6, 0.15, 8);
  const base = new THREE.Mesh(baseGeo, MAT.metal);
  base.position.set(0, 0.28, 0);
  base.receiveShadow = true;
  platform.add(base);

  // Inner ring
  const innerGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.2, 16);
  const inner = new THREE.Mesh(innerGeo, MAT.accent);
  inner.position.set(0, 0.32, 0);
  platform.add(inner);

  // Rotating accent ring
  const ringGeo = new THREE.TorusGeometry(1.3, 0.02, 8, 32);
  const ring = new THREE.Mesh(ringGeo, MAT.neon);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.4, 0);
  ring.name = 'holo-ring';
  platform.add(ring);

  // Second ring (tilted)
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.015, 8, 32), MAT.neonBlue);
  ring2.rotation.x = Math.PI / 2;
  ring2.rotation.z = Math.PI / 6;
  ring2.position.set(0, 0.5, 0);
  ring2.name = 'holo-ring-2';
  platform.add(ring2);

  officeGroup.add(platform);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Bookshelf
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildBookshelf() {
  const shelf = new THREE.Group();
  shelf.name = 'bookshelf';

  // Frame
  const frameGeo = new THREE.BoxGeometry(2.0, 3.0, 0.4);
  const frame = new THREE.Mesh(frameGeo, MAT.desk);
  frame.position.set(0, 1.7, 0);
  frame.castShadow = true;
  shelf.add(frame);

  // Shelves
  for (let i = 0; i < 4; i++) {
    const shelfGeo = new THREE.BoxGeometry(1.9, 0.04, 0.38);
    const sh = new THREE.Mesh(shelfGeo, MAT.deskTop);
    sh.position.set(0, 0.5 + i * 0.7, 0);
    shelf.add(sh);
  }

  // Books (colored blocks)
  const bookColors = [0x60a5fa, 0xf87171, 0x34d399, 0xfbbf24, 0xa78bfa, 0xf472b6];
  for (let row = 0; row < 3; row++) {
    let bx = -0.8;
    for (let j = 0; j < 5; j++) {
      const w = 0.08 + Math.random() * 0.15;
      const h = 0.25 + Math.random() * 0.15;
      const bookGeo = new THREE.BoxGeometry(w, h, 0.25);
      const bookMat = new THREE.MeshStandardMaterial({
        color: bookColors[(row * 5 + j) % bookColors.length],
        roughness: 0.8,
      });
      const book = new THREE.Mesh(bookGeo, bookMat);
      book.position.set(bx + w / 2, 0.55 + row * 0.7 + h / 2, 0);
      shelf.add(book);
      bx += w + 0.02;
    }
  }

  shelf.position.set(-12.5, 0.2, -4);
  shelf.rotation.y = Math.PI / 2;
  officeGroup.add(shelf);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Water Cooler
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildWaterCooler() {
  const cooler = new THREE.Group();
  cooler.name = 'water-cooler';

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.4, 1.2, 0.35);
  const body = new THREE.Mesh(bodyGeo, MAT.server);
  body.position.set(0, 0.8, 0);
  body.castShadow = true;
  cooler.add(body);

  // Water jug on top
  const jugGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.5, 12);
  const jugMat = new THREE.MeshPhysicalMaterial({
    color: 0x93c5fd, transmission: 0.8, roughness: 0.1,
    thickness: 0.3, transparent: true, opacity: 0.5,
  });
  const jug = new THREE.Mesh(jugGeo, jugMat);
  jug.position.set(0, 1.65, 0);
  cooler.add(jug);

  cooler.position.set(11, 0.2, -4);
  officeGroup.add(cooler);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Decorative Elements
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildDecorativeElements() {
  // Wall clock
  const clockGroup = new THREE.Group();
  clockGroup.name = 'wall-clock';
  const clockFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24),
    MAT.whiteboard);
  clockFace.rotation.x = Math.PI / 2;
  clockFace.position.set(-6, 4.5, -9.9);
  clockGroup.add(clockFace);

  const clockRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.02, 8, 24),
    MAT.frame);
  clockRim.position.set(-6, 4.5, -9.88);
  clockGroup.add(clockRim);

  // Clock hands
  const hourGeo = new THREE.BoxGeometry(0.02, 0.2, 0.01);
  const hourHand = new THREE.Mesh(hourGeo, MAT.frame);
  hourHand.position.set(-6, 4.6, -9.86);
  hourHand.rotation.z = Math.PI / 4;
  clockGroup.add(hourHand);

  const minGeo = new THREE.BoxGeometry(0.015, 0.3, 0.01);
  const minHand = new THREE.Mesh(minGeo, MAT.accent);
  minHand.position.set(-6, 4.6, -9.84);
  minHand.rotation.z = -Math.PI / 6;
  clockGroup.add(minHand);

  officeGroup.add(clockGroup);

  // Ceiling fan
  const fan = new THREE.Group();
  fan.name = 'ceiling-fan';
  const fanHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), MAT.metal);
  fanHub.position.set(0, 6.1, 0);
  fan.add(fanHub);
  const fanRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), MAT.metal);
  fanRod.position.set(0, 6.3, 0);
  fan.add(fanRod);

  for (let i = 0; i < 4; i++) {
    const bladeGeo = new THREE.BoxGeometry(1.5, 0.02, 0.25);
    const blade = new THREE.Mesh(bladeGeo, MAT.desk);
    blade.position.set(0, 6.08, 0);
    blade.rotation.y = (i / 4) * Math.PI * 2;
    blade.translateX(0.75);
    fan.add(blade);
  }

  fan.position.set(2, 0, -2);
  officeGroup.add(fan);

  // Door frame on side wall
  const doorFrame = new THREE.Group();
  doorFrame.name = 'door-frame';
  const doorPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 3, 0.1), MAT.frame);
  doorPost.position.set(-13.95, 1.7, 5);
  doorFrame.add(doorPost);
  const doorPost2 = doorPost.clone();
  doorPost2.position.z = 7;
  doorFrame.add(doorPost2);
  const doorLintel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 2.1), MAT.frame);
  doorLintel.position.set(-13.95, 3.2, 6);
  doorFrame.add(doorLintel);
  officeGroup.add(doorFrame);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Floor Y position getter
   ═══════════════════════════════════════════════════════════════════════════════ */
export function getFloorY() {
  return 0.2;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Theme Update
   ═══════════════════════════════════════════════════════════════════════════════ */
export function updateOfficeLighting(theme) {
  if (!officeGroup) return;
  currentTheme = theme;

  // Reload materials
  initMaterials(theme);

  // We rebuild the office to apply new materials
  const scene = getScene();
  scene.remove(officeGroup);
  officeGroup = new THREE.Group();
  officeGroup.name = 'office';

  buildFloor();
  buildWalls();
  buildGlassPartitions();
  buildPondZone();
  buildDesks(6);
  buildServerRack();
  buildCoffeeMachine();
  buildPlants();
  buildWhiteboard();
  buildPillars();
  buildCarpet();
  buildCeilingLights();
  buildNeonStrips();
  buildCenterPlatform();
  buildBookshelf();
  buildWaterCooler();
  buildDecorativeElements();

  scene.add(officeGroup);
}
