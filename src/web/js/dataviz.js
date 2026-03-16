/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — Data Visualization
   3D graph layout, holographic display
   ~2000 lines
   ═══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

/* ─── Color Map per module ─────────────────────────────────────────────────── */
const MOD_COLORS = [
  0x34d399, 0x60a5fa, 0xa78bfa, 0xf472b6, 0xfbbf24,
  0x22d3ee, 0xf87171, 0x4ade80, 0x818cf8, 0xfb923c,
  0x38bdf8, 0xc084fc, 0xa3e635, 0xe879f9, 0x2dd4bf,
];

function modColor(idx) {
  return MOD_COLORS[idx % MOD_COLORS.length];
}

/* ═══════════════════════════════════════════════════════════════════════════════
   GraphViz — 3D Force-directed graph from node/edge data
   ═══════════════════════════════════════════════════════════════════════════════ */
export class GraphViz {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'graph-viz';
    this.group.position.set(0, 8, 0); // Float above office
    this.group.visible = false;       // Hidden by default (shown via view switch)
    scene.add(this.group);

    this._nodes = new Map(); // id → mesh
    this._edges = [];        // line meshes
    this._modules = new Map(); // module → { center, color }
  }

  /** Update from backend graph data */
  update(graphData) {
    if (!graphData || !graphData.nodes) return;

    // Clear existing
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    this._nodes.clear();
    this._edges = [];
    this._modules.clear();

    const { nodes, edges } = graphData;
    if (!nodes.length) return;

    // Group nodes by module
    const moduleMap = new Map();
    nodes.forEach(n => {
      const mod = n.module || 'default';
      if (!moduleMap.has(mod)) moduleMap.set(mod, []);
      moduleMap.get(mod).push(n);
    });

    // Layout modules in a circle
    const moduleList = [...moduleMap.keys()];
    const moduleRadius = Math.max(4, moduleList.length * 1.2);

    moduleList.forEach((mod, mi) => {
      const angle = (mi / moduleList.length) * Math.PI * 2;
      const mx = Math.cos(angle) * moduleRadius;
      const mz = Math.sin(angle) * moduleRadius;
      const color = modColor(mi);

      this._modules.set(mod, { x: mx, z: mz, color, idx: mi });

      // Module sphere (ghostly cluster indicator)
      const clusterGeo = new THREE.SphereGeometry(1.2, 16, 16);
      const clusterMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.08, wireframe: true,
      });
      const cluster = new THREE.Mesh(clusterGeo, clusterMat);
      cluster.position.set(mx, 0, mz);
      this.group.add(cluster);

      // Layout nodes within module cluster
      const moduleNodes = moduleMap.get(mod);
      moduleNodes.forEach((n, ni) => {
        const nodeAngle = (ni / moduleNodes.length) * Math.PI * 2;
        const nr = Math.min(moduleNodes.length * 0.15, 0.9);
        const nx = mx + Math.cos(nodeAngle) * nr;
        const nz = mz + Math.sin(nodeAngle) * nr;
        const ny = Math.sin(ni * 0.5) * 0.3;

        // Node sphere
        const nodeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const nodeMat = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.3,
          roughness: 0.3, metalness: 0.5,
        });
        const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
        nodeMesh.position.set(nx, ny, nz);
        this.group.add(nodeMesh);
        this._nodes.set(n.id, { mesh: nodeMesh, data: n, x: nx, y: ny, z: nz });
      });
    });

    // Edges
    if (edges) {
      edges.forEach(e => {
        const from = this._nodes.get(e.from || e.source);
        const to = this._nodes.get(e.to || e.target);
        if (!from || !to) return;

        const points = [
          new THREE.Vector3(from.x, from.y, from.z),
          new THREE.Vector3(to.x, to.y, to.z),
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x475569, transparent: true, opacity: 0.3,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        this.group.add(line);
        this._edges.push(line);
      });
    }
  }

  /** Show/hide the graph */
  show() { this.group.visible = true; }
  hide() { this.group.visible = false; }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   HologramDisplay — Central floating data display
   ═══════════════════════════════════════════════════════════════════════════════ */
export class HologramDisplay {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'hologram';
    this.group.position.set(0, 2.0, 0);
    scene.add(this.group);

    this._time = 0;
    this._build();
  }

  _build() {
    /* ── Main sphere (wireframe data globe) ──────────────────────────────── */
    const sphereGeo = new THREE.IcosahedronGeometry(1.0, 2);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x34d399, wireframe: true, transparent: true, opacity: 0.2,
    });
    this.sphere = new THREE.Mesh(sphereGeo, sphereMat);
    this.group.add(this.sphere);

    /* ── Inner sphere ────────────────────────────────────────────────────── */
    const innerGeo = new THREE.IcosahedronGeometry(0.6, 1);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa, wireframe: true, transparent: true, opacity: 0.15,
    });
    this.innerSphere = new THREE.Mesh(innerGeo, innerMat);
    this.group.add(this.innerSphere);

    /* ── Core glow ───────────────────────────────────────────────────────── */
    const coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x34d399, transparent: true, opacity: 0.6,
    });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.core);

    /* ── Orbiting rings ──────────────────────────────────────────────────── */
    const ring1Geo = new THREE.TorusGeometry(1.3, 0.01, 8, 48);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x34d399, transparent: true, opacity: 0.3,
    });
    this.ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    this.ring1.rotation.x = Math.PI / 3;
    this.group.add(this.ring1);

    const ring2Geo = new THREE.TorusGeometry(1.5, 0.008, 8, 48);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa, transparent: true, opacity: 0.2,
    });
    this.ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    this.ring2.rotation.x = Math.PI / 2;
    this.ring2.rotation.z = Math.PI / 4;
    this.group.add(this.ring2);

    const ring3Geo = new THREE.TorusGeometry(1.1, 0.008, 8, 48);
    const ring3Mat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa, transparent: true, opacity: 0.2,
    });
    this.ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    this.ring3.rotation.x = -Math.PI / 4;
    this.ring3.rotation.y = Math.PI / 3;
    this.group.add(this.ring3);

    /* ── Floating data points ────────────────────────────────────────────── */
    const dataCount = 60;
    const dataPositions = new Float32Array(dataCount * 3);
    const dataSizes = new Float32Array(dataCount);
    const dataColors = new Float32Array(dataCount * 3);

    const palette = [
      new THREE.Color(0x34d399), new THREE.Color(0x60a5fa),
      new THREE.Color(0xa78bfa), new THREE.Color(0x22d3ee),
    ];

    for (let i = 0; i < dataCount; i++) {
      const r = 0.8 + Math.random() * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      dataPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      dataPositions[i * 3 + 1] = r * Math.cos(phi);
      dataPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      dataSizes[i] = 0.03 + Math.random() * 0.04;
      const c = palette[Math.floor(Math.random() * palette.length)];
      dataColors[i * 3] = c.r;
      dataColors[i * 3 + 1] = c.g;
      dataColors[i * 3 + 2] = c.b;
    }

    const dataGeo = new THREE.BufferGeometry();
    dataGeo.setAttribute('position', new THREE.BufferAttribute(dataPositions, 3));
    dataGeo.setAttribute('color', new THREE.BufferAttribute(dataColors, 3));

    const dataMat = new THREE.PointsMaterial({
      size: 0.04, transparent: true, opacity: 0.6,
      vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.dataPoints = new THREE.Points(dataGeo, dataMat);
    this.group.add(this.dataPoints);

    /* ── Hologram point light ────────────────────────────────────────────── */
    const holoLight = new THREE.PointLight(0x34d399, 1.0, 8, 2);
    holoLight.position.set(0, 0.5, 0);
    this.group.add(holoLight);
    this.holoLight = holoLight;

    /* ── Scan line effect ────────────────────────────────────────────────── */
    const scanGeo = new THREE.PlaneGeometry(2.5, 0.02);
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0x34d399, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    });
    this.scanLine = new THREE.Mesh(scanGeo, scanMat);
    this.group.add(this.scanLine);
  }

  /** Update each frame */
  update(dt, graphData) {
    this._time += dt;

    // Rotate elements
    this.sphere.rotation.y += dt * 0.15;
    this.sphere.rotation.x += dt * 0.05;
    this.innerSphere.rotation.y -= dt * 0.2;
    this.innerSphere.rotation.z += dt * 0.1;
    this.ring1.rotation.y += dt * 0.3;
    this.ring2.rotation.y -= dt * 0.2;
    this.ring3.rotation.z += dt * 0.25;

    // Core pulse
    const pulse = 0.8 + 0.2 * Math.sin(this._time * 3);
    this.core.scale.setScalar(pulse);
    this.core.material.opacity = 0.4 + 0.3 * Math.sin(this._time * 2);

    // Data points rotation
    this.dataPoints.rotation.y += dt * 0.1;

    // Scan line sweeping
    this.scanLine.position.y = Math.sin(this._time * 1.0) * 1.2;
    this.scanLine.material.opacity = 0.15 + 0.15 * Math.abs(Math.sin(this._time));

    // Light intensity pulse
    this.holoLight.intensity = 0.6 + 0.4 * Math.sin(this._time * 2);

    // Update sphere opacity based on data amount
    if (graphData && graphData.nodes) {
      const nodeCount = graphData.nodes.length;
      const t = Math.min(nodeCount / 100, 1);
      this.sphere.material.opacity = 0.1 + t * 0.2;
      this.innerSphere.material.opacity = 0.08 + t * 0.15;
    }
  }
}
