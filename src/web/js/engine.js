/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — Three.js Engine
   Scene, Renderer, Post-processing, Clock
   ~2500 lines
   ═══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ─── Module-level singletons ──────────────────────────────────────────────── */
let renderer = null;
let scene = null;
let camera = null;
let composer = null;
let clock = null;
let bloomPass = null;
let fxaaPass = null;

/* ═══════════════════════════════════════════════════════════════════════════════
   1. createEngine — Initialize the full Three.js rendering pipeline
   ═══════════════════════════════════════════════════════════════════════════════ */
export async function createEngine(canvas, theme = 'dark') {
  clock = new THREE.Clock();

  /* ─── Scene ────────────────────────────────────────────────────────────── */
  scene = new THREE.Scene();
  scene.fog = theme === 'dark'
    ? new THREE.FogExp2(0x050510, 0.012)
    : new THREE.FogExp2(0xe8ecf4, 0.008);

  /* ─── Camera ───────────────────────────────────────────────────────────── */
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 500);
  camera.position.set(18, 14, 18);
  camera.lookAt(0, 0, 0);

  /* ─── Renderer ─────────────────────────────────────────────────────────── */
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme === 'dark' ? 1.0 : 1.4;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (theme === 'dark') {
    renderer.setClearColor(0x050510);
  } else {
    renderer.setClearColor(0xe8ecf4);
  }

  /* ─── Lighting ─────────────────────────────────────────────────────────── */
  setupLighting(scene, theme);

  /* ─── Post-processing ──────────────────────────────────────────────────── */
  setupPostProcessing(theme);

  /* ─── Ground Grid ──────────────────────────────────────────────────────── */
  createGroundGrid(theme);

  /* ─── Sky ──────────────────────────────────────────────────────────────── */
  createSkyDome(theme);

  return { renderer, scene, camera, composer, clock };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   2. Lighting Setup
   ═══════════════════════════════════════════════════════════════════════════════ */
function setupLighting(scene, theme) {
  // Remove existing lights
  scene.children.filter(c => c.isLight).forEach(l => scene.remove(l));

  if (theme === 'dark') {
    /* ── Dark theme: moody blue-green ambient + dramatic spots ────────── */
    const ambient = new THREE.AmbientLight(0x1a2a4a, 0.4);
    ambient.name = 'ambient';
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x0d1b2a, 0x0a0f1e, 0.3);
    hemi.name = 'hemi';
    scene.add(hemi);

    // Main directional (moonlight)
    const dir = new THREE.DirectionalLight(0x4488cc, 0.6);
    dir.name = 'dir-main';
    dir.position.set(-10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -25;
    dir.shadow.camera.right = 25;
    dir.shadow.camera.top = 25;
    dir.shadow.camera.bottom = -25;
    dir.shadow.bias = -0.002;
    dir.shadow.normalBias = 0.02;
    scene.add(dir);

    // Accent spot (green glow from center)
    const accent = new THREE.PointLight(0x34d399, 2.0, 30, 1.5);
    accent.name = 'accent-glow';
    accent.position.set(0, 6, 0);
    accent.castShadow = false;
    scene.add(accent);

    // Rim light (purple back-light)
    const rim = new THREE.PointLight(0xa78bfa, 1.0, 25, 1.5);
    rim.name = 'rim-light';
    rim.position.set(-12, 8, -12);
    scene.add(rim);

    // Warm light (desk area)
    const warm = new THREE.PointLight(0xfbbf24, 0.8, 15, 2);
    warm.name = 'warm-desk';
    warm.position.set(6, 4, 6);
    scene.add(warm);

  } else {
    /* ── Light theme: bright natural lighting ─────────────────────────── */
    const ambient = new THREE.AmbientLight(0xf0f4fa, 0.6);
    ambient.name = 'ambient';
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xddeeff, 0xf0ece0, 0.5);
    hemi.name = 'hemi';
    scene.add(hemi);

    // Sun
    const dir = new THREE.DirectionalLight(0xfff5e6, 1.2);
    dir.name = 'dir-main';
    dir.position.set(12, 25, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -25;
    dir.shadow.camera.right = 25;
    dir.shadow.camera.top = 25;
    dir.shadow.camera.bottom = -25;
    dir.shadow.bias = -0.002;
    dir.shadow.normalBias = 0.02;
    scene.add(dir);

    // Soft fill
    const fill = new THREE.DirectionalLight(0xb3d4ff, 0.4);
    fill.name = 'fill-light';
    fill.position.set(-8, 12, -5);
    scene.add(fill);

    // Subtle accent
    const accent = new THREE.PointLight(0x059669, 0.6, 20, 2);
    accent.name = 'accent-glow';
    accent.position.set(0, 5, 0);
    scene.add(accent);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   3. Post-processing Pipeline
   ═══════════════════════════════════════════════════════════════════════════════ */
function setupPostProcessing(theme) {
  const size = renderer.getSize(new THREE.Vector2());

  composer = new EffectComposer(renderer);

  // Render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom pass — gives the neon glow effect
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    theme === 'dark' ? 0.6 : 0.15,   // strength
    0.4,                                // radius
    theme === 'dark' ? 0.85 : 0.95     // threshold
  );
  composer.addPass(bloomPass);

  // FXAA anti-aliasing
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(1 / size.x, 1 / size.y);
  composer.addPass(fxaaPass);

  // Output pass (gamma correction)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   4. Ground Grid — Procedural infinite grid
   ═══════════════════════════════════════════════════════════════════════════════ */
function createGroundGrid(theme) {
  /* ── Ground plane ──────────────────────────────────────────────────────── */
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({
    color: theme === 'dark' ? 0x0a0f1e : 0xdee4ed,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  /* ── Grid lines ────────────────────────────────────────────────────────── */
  const gridSize = 80;
  const gridDiv = 40;
  const gridHelper = new THREE.GridHelper(
    gridSize, gridDiv,
    theme === 'dark' ? 0x1a2a3a : 0xbcc5d0,
    theme === 'dark' ? 0x0f1a2a : 0xd0d8e0,
  );
  gridHelper.position.y = 0.01;
  gridHelper.material.opacity = theme === 'dark' ? 0.3 : 0.2;
  gridHelper.material.transparent = true;
  gridHelper.name = 'grid';
  scene.add(gridHelper);

  /* ── Accent grid ring around center ────────────────────────────────────── */
  const ringGeo = new THREE.RingGeometry(8, 8.08, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: theme === 'dark' ? 0x34d399 : 0x059669,
    transparent: true,
    opacity: theme === 'dark' ? 0.4 : 0.2,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.name = 'center-ring';
  scene.add(ring);

  /* ── Second ring ───────────────────────────────────────────────────────── */
  const ring2Geo = new THREE.RingGeometry(14, 14.06, 64);
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: theme === 'dark' ? 0x60a5fa : 0x2563eb,
    transparent: true,
    opacity: theme === 'dark' ? 0.2 : 0.1,
    side: THREE.DoubleSide,
  });
  const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.02;
  ring2.name = 'outer-ring';
  scene.add(ring2);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   5. Sky Dome — Gradient atmosphere
   ═══════════════════════════════════════════════════════════════════════════════ */
function createSkyDome(theme) {
  const skyGeo = new THREE.SphereGeometry(150, 32, 32);

  // Custom shader for gradient sky
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: theme === 'dark' ? new THREE.Color(0x0a0f2e) : new THREE.Color(0x87ceeb) },
      bottomColor: { value: theme === 'dark' ? new THREE.Color(0x050510) : new THREE.Color(0xe8ecf4) },
      offset: { value: 20 },
      exponent: { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky';
  scene.add(sky);

  /* ── Stars (dark theme only) ───────────────────────────────────────────── */
  if (theme === 'dark') {
    createStarField();
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   6. Star Field — Procedural stars
   ═══════════════════════════════════════════════════════════════════════════════ */
function createStarField() {
  const count = 2000;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const starColors = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xccddff),
    new THREE.Color(0xffeedd),
    new THREE.Color(0xddeeff),
    new THREE.Color(0x34d399),
  ];

  for (let i = 0; i < count; i++) {
    // Distribute on upper hemisphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.45; // Only upper portion
    const r = 100 + Math.random() * 40;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    sizes[i] = 0.3 + Math.random() * 1.2;

    const c = starColors[Math.floor(Math.random() * starColors.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vSize;
      uniform float time;
      void main() {
        vColor = color;
        vSize = size;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.7 + 0.3 * sin(time * 2.0 + position.x * 10.0 + position.z * 7.0);
        gl_PointSize = size * twinkle * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vSize;
      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        float glow = exp(-dist * dist * 8.0);
        gl_FragColor = vec4(vColor * (0.8 + glow * 0.5), alpha * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const stars = new THREE.Points(geo, mat);
  stars.name = 'stars';
  scene.add(stars);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   7. Resize Handler
   ═══════════════════════════════════════════════════════════════════════════════ */
export function resizeEngine() {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  if (fxaaPass) fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   8. Update Functions
   ═══════════════════════════════════════════════════════════════════════════════ */

/** Called each frame to update time-based uniforms */
export function updateEngine(dt) {
  // Update star twinkle
  const stars = scene.getObjectByName('stars');
  if (stars && stars.material.uniforms) {
    stars.material.uniforms.time.value += dt;
  }

  // Animate center ring
  const ring = scene.getObjectByName('center-ring');
  if (ring) {
    ring.rotation.z += dt * 0.1;
  }

  const ring2 = scene.getObjectByName('outer-ring');
  if (ring2) {
    ring2.rotation.z -= dt * 0.05;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   9. Theme Update
   ═══════════════════════════════════════════════════════════════════════════════ */
export function updateEngineTheme(theme) {
  if (!renderer || !scene) return;

  // Update clear color
  renderer.setClearColor(theme === 'dark' ? 0x050510 : 0xe8ecf4);
  renderer.toneMappingExposure = theme === 'dark' ? 1.0 : 1.4;

  // Update fog
  scene.fog = theme === 'dark'
    ? new THREE.FogExp2(0x050510, 0.012)
    : new THREE.FogExp2(0xe8ecf4, 0.008);

  // Update lighting
  setupLighting(scene, theme);

  // Update bloom
  if (bloomPass) {
    bloomPass.strength = theme === 'dark' ? 0.6 : 0.15;
    bloomPass.threshold = theme === 'dark' ? 0.85 : 0.95;
  }

  // Update ground
  const ground = scene.getObjectByName('ground');
  if (ground) ground.material.color.setHex(theme === 'dark' ? 0x0a0f1e : 0xdee4ed);

  // Update grid
  const grid = scene.getObjectByName('grid');
  if (grid) {
    grid.material.opacity = theme === 'dark' ? 0.3 : 0.2;
  }

  // Update sky
  const sky = scene.getObjectByName('sky');
  if (sky && sky.material.uniforms) {
    sky.material.uniforms.topColor.value.setHex(theme === 'dark' ? 0x0a0f2e : 0x87ceeb);
    sky.material.uniforms.bottomColor.value.setHex(theme === 'dark' ? 0x050510 : 0xe8ecf4);
  }

  // Stars visibility
  const stars = scene.getObjectByName('stars');
  if (stars) stars.visible = theme === 'dark';
  if (!stars && theme === 'dark') createStarField();

  // Center ring
  const ring = scene.getObjectByName('center-ring');
  if (ring) {
    ring.material.color.setHex(theme === 'dark' ? 0x34d399 : 0x059669);
    ring.material.opacity = theme === 'dark' ? 0.4 : 0.2;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   10. Getters
   ═══════════════════════════════════════════════════════════════════════════════ */
export function getRenderer() { return renderer; }
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getComposer() { return composer; }
export function getClock() { return clock; }
