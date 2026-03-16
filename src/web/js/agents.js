/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — Agent Robot Characters
   Low-poly robot agents built from Three.js primitives
   ~2500 lines
   ═══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DESK_POSITIONS } from './office.js';

/* ─── Module state ─────────────────────────────────────────────────────────── */
const agents = new Map(); // name → { group, parts, label, bubble, anim }
let scene = null;
let css2dRenderer = null;

/* ─── Robot Colors per Role ────────────────────────────────────────────────── */
const ROLE_COLORS = {
  parser:   { body: 0x60a5fa, accent: 0x3b82f6, eye: 0xdbeafe, glow: 0x60a5fa },
  analyzer: { body: 0xa78bfa, accent: 0x8b5cf6, eye: 0xede9fe, glow: 0xa78bfa },
  tester:   { body: 0x34d399, accent: 0x10b981, eye: 0xd1fae5, glow: 0x34d399 },
  healer:   { body: 0xfbbf24, accent: 0xf59e0b, eye: 0xfef3c7, glow: 0xfbbf24 },
  planner:  { body: 0xf472b6, accent: 0xec4899, eye: 0xfce7f3, glow: 0xf472b6 },
  reporter: { body: 0x22d3ee, accent: 0x06b6d4, eye: 0xcffafe, glow: 0x22d3ee },
};

const DEFAULT_COLORS = { body: 0x94a3b8, accent: 0x64748b, eye: 0xf1f5f9, glow: 0x94a3b8 };

/* ─── Animation parameters per status ─────────────────────────────────────── */
const STATUS_ANIM = {
  idle:     { speed: 0.5, bobAmp: 0.03, rotSpeed: 0 },
  working:  { speed: 2.0, bobAmp: 0.06, rotSpeed: 0.5 },
  testing:  { speed: 2.5, bobAmp: 0.08, rotSpeed: 0.8 },
  thinking: { speed: 1.0, bobAmp: 0.02, rotSpeed: 0.3 },
  error:    { speed: 4.0, bobAmp: 0.04, rotSpeed: 0, shake: true },
  failed:   { speed: 4.0, bobAmp: 0.04, rotSpeed: 0, shake: true },
  done:     { speed: 1.0, bobAmp: 0.05, rotSpeed: 0.2 },
  passed:   { speed: 1.0, bobAmp: 0.05, rotSpeed: 0.2 },
};

/* ═══════════════════════════════════════════════════════════════════════════════
   AgentManager — Creates, updates, removes 3D robot agents
   ═══════════════════════════════════════════════════════════════════════════════ */
export class AgentManager {
  constructor(sceneRef) {
    scene = sceneRef;
    this._time = 0;
    this._bubbleTimers = new Map();
    this._initCSS2D();
  }

  /** Initialize CSS2D renderer for labels and bubbles */
  _initCSS2D() {
    css2dRenderer = new CSS2DRenderer();
    css2dRenderer.setSize(window.innerWidth, window.innerHeight);
    css2dRenderer.domElement.style.position = 'fixed';
    css2dRenderer.domElement.style.top = '0';
    css2dRenderer.domElement.style.left = '0';
    css2dRenderer.domElement.style.pointerEvents = 'none';
    css2dRenderer.domElement.style.zIndex = '5';
    document.body.appendChild(css2dRenderer.domElement);

    window.addEventListener('resize', () => {
      css2dRenderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /** Sync agents from backend data */
  sync(agentData) {
    const current = new Set();

    agentData.forEach((a, i) => {
      current.add(a.name);
      if (!agents.has(a.name)) {
        this._createRobot(a, i, agentData.length);
      }
      this._updateStatus(a.name, a.status);
    });

    // Remove stale agents
    for (const [name] of agents) {
      if (!current.has(name)) {
        this._removeRobot(name);
      }
    }

    // Schedule bubbles
    this._scheduleBubbles(agentData);
  }

  /** Update all agents each frame */
  update(dt) {
    this._time += dt;

    for (const [name, agent] of agents) {
      const anim = STATUS_ANIM[agent.status] || STATUS_ANIM.idle;

      // Bobbing
      const bobY = Math.sin(this._time * anim.speed * 2) * anim.bobAmp;
      agent.group.position.y = agent.baseY + bobY;

      // Arm rotation (working animation)
      if (agent.parts.leftArm) {
        agent.parts.leftArm.rotation.x = Math.sin(this._time * anim.speed) * 0.3;
      }
      if (agent.parts.rightArm) {
        agent.parts.rightArm.rotation.x = -Math.sin(this._time * anim.speed) * 0.3;
      }

      // Head rotation (thinking)
      if (agent.parts.head && anim.rotSpeed > 0) {
        agent.parts.head.rotation.y = Math.sin(this._time * anim.rotSpeed) * 0.2;
      }

      // Shake effect (error)
      if (anim.shake) {
        agent.group.position.x = agent.baseX + Math.sin(this._time * 30) * 0.04;
        agent.group.position.z = agent.baseZ + Math.cos(this._time * 25) * 0.02;
      } else {
        agent.group.position.x = agent.baseX;
        agent.group.position.z = agent.baseZ;
      }

      // Eye glow pulsing
      if (agent.parts.leftEye && agent.parts.rightEye) {
        const eyePulse = 0.5 + 0.5 * Math.sin(this._time * anim.speed * 1.5);
        agent.parts.leftEye.material.opacity = 0.6 + eyePulse * 0.4;
        agent.parts.rightEye.material.opacity = 0.6 + eyePulse * 0.4;
      }

      // Antenna glow
      if (agent.parts.antenna) {
        const glow = 0.3 + 0.7 * Math.abs(Math.sin(this._time * 3));
        agent.parts.antenna.material.emissiveIntensity = glow;
      }
    }

    // Update CSS2D renderer
    if (css2dRenderer && scene) {
      // find camera from scene parent
      const camera = scene.userData.camera;
      if (camera) css2dRenderer.render(scene, camera);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Robot Construction — Build a low-poly robot from primitives
     ═════════════════════════════════════════════════════════════════════════ */
  _createRobot(agentData, index, total) {
    const role = agentData.role || 'parser';
    const colors = ROLE_COLORS[role] || DEFAULT_COLORS;
    const group = new THREE.Group();
    group.name = `agent-${agentData.name}`;

    const parts = {};

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colors.body, roughness: 0.4, metalness: 0.5,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: colors.accent, roughness: 0.3, metalness: 0.6,
    });
    const eyeMat = new THREE.MeshBasicMaterial({
      color: colors.eye, transparent: true, opacity: 0.9,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, roughness: 0.2, metalness: 0.8,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: colors.glow, roughness: 0.3, metalness: 0.4,
      emissive: colors.glow, emissiveIntensity: 0.5,
    });

    /* ── Body (torso) ────────────────────────────────────────────────────── */
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.6, 0.35);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);
    parts.body = body;

    // Chest plate
    const chestGeo = new THREE.BoxGeometry(0.35, 0.35, 0.02);
    const chest = new THREE.Mesh(chestGeo, accentMat);
    chest.position.set(0, 0.95, 0.19);
    group.add(chest);

    // Chest LED
    const ledGeo = new THREE.CircleGeometry(0.04, 8);
    const led = new THREE.Mesh(ledGeo, glowMat);
    led.position.set(0, 1.0, 0.205);
    parts.chestLed = led;
    group.add(led);

    /* ── Head ────────────────────────────────────────────────────────────── */
    const headGeo = new THREE.BoxGeometry(0.4, 0.35, 0.3);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.45;
    head.castShadow = true;
    group.add(head);
    parts.head = head;

    // Visor / Face plate
    const visorGeo = new THREE.BoxGeometry(0.35, 0.15, 0.02);
    const visor = new THREE.Mesh(visorGeo, new THREE.MeshStandardMaterial({
      color: 0x111827, roughness: 0.1, metalness: 0.9,
    }));
    visor.position.set(0, 1.48, 0.17);
    group.add(visor);

    // Eyes (glowing dots)
    const eyeGeo = new THREE.CircleGeometry(0.035, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 1.48, 0.185);
    group.add(leftEye);
    parts.leftEye = leftEye;

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    rightEye.position.set(0.08, 1.48, 0.185);
    group.add(rightEye);
    parts.rightEye = rightEye;

    // Antenna
    const antennaGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6);
    const antenna = new THREE.Mesh(antennaGeo, metalMat);
    antenna.position.set(0, 1.72, 0);
    group.add(antenna);

    // Antenna tip (glowing ball)
    const tipGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const tip = new THREE.Mesh(tipGeo, glowMat);
    tip.position.set(0, 1.84, 0);
    group.add(tip);
    parts.antenna = tip;

    /* ── Arms ────────────────────────────────────────────────────────────── */
    // Left arm
    const armGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
    const leftArm = new THREE.Mesh(armGeo, accentMat);
    leftArm.position.set(-0.36, 0.85, 0);
    leftArm.castShadow = true;
    group.add(leftArm);
    parts.leftArm = leftArm;

    // Left hand
    const handGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, metalMat);
    leftHand.position.set(-0.36, 0.58, 0);
    group.add(leftHand);

    // Right arm
    const rightArm = new THREE.Mesh(armGeo, accentMat);
    rightArm.position.set(0.36, 0.85, 0);
    rightArm.castShadow = true;
    group.add(rightArm);
    parts.rightArm = rightArm;

    // Right hand
    const rightHand = new THREE.Mesh(handGeo, metalMat);
    rightHand.position.set(0.36, 0.58, 0);
    group.add(rightHand);

    /* ── Legs ────────────────────────────────────────────────────────────── */
    const legGeo = new THREE.BoxGeometry(0.14, 0.35, 0.14);
    const leftLeg = new THREE.Mesh(legGeo, bodyMat);
    leftLeg.position.set(-0.12, 0.38, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    parts.leftLeg = leftLeg;

    const rightLeg = new THREE.Mesh(legGeo, bodyMat);
    rightLeg.position.set(0.12, 0.38, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    parts.rightLeg = rightLeg;

    // Feet
    const footGeo = new THREE.BoxGeometry(0.16, 0.06, 0.2);
    const leftFoot = new THREE.Mesh(footGeo, accentMat);
    leftFoot.position.set(-0.12, 0.23, 0.03);
    group.add(leftFoot);

    const rightFoot = new THREE.Mesh(footGeo, accentMat);
    rightFoot.position.set(0.12, 0.23, 0.03);
    group.add(rightFoot);

    /* ── Backpack (jet-pack) ─────────────────────────────────────────────── */
    const backpackGeo = new THREE.BoxGeometry(0.25, 0.3, 0.15);
    const backpack = new THREE.Mesh(backpackGeo, accentMat);
    backpack.position.set(0, 0.95, -0.25);
    backpack.castShadow = true;
    group.add(backpack);

    // Exhaust ports
    const exhaustGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.06, 6);
    const exhaust1 = new THREE.Mesh(exhaustGeo, metalMat);
    exhaust1.position.set(-0.06, 0.77, -0.3);
    group.add(exhaust1);
    const exhaust2 = exhaust1.clone();
    exhaust2.position.x = 0.06;
    group.add(exhaust2);

    /* ── Shadow blob ─────────────────────────────────────────────────────── */
    const shadowGeo = new THREE.CircleGeometry(0.3, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.15,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.21;
    group.add(shadow);

    /* ── Position ────────────────────────────────────────────────────────── */
    const desk = DESK_POSITIONS[index] || { x: index * 3 - 6, z: 0 };
    const x = desk.x;
    const z = desk.z + 1.2; // Position in front of desk (in chair)

    group.position.set(x, 0.2, z);

    // Point toward desk
    group.lookAt(new THREE.Vector3(desk.x, 0.2, desk.z));

    scene.add(group);

    /* ── CSS2D Label ─────────────────────────────────────────────────────── */
    const labelDiv = document.createElement('div');
    labelDiv.className = 'agent-label-3d';
    labelDiv.innerHTML = `${agentData.name}<span class="role">${role}</span>`;
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 2.1, 0);
    group.add(label);

    /* ── Point light (glow effect around robot) ──────────────────────────── */
    const glow = new THREE.PointLight(colors.glow, 0.3, 4, 2);
    glow.position.set(0, 1.2, 0);
    group.add(glow);
    parts.glow = glow;

    /* ── Store ───────────────────────────────────────────────────────────── */
    agents.set(agentData.name, {
      group,
      parts,
      label,
      status: agentData.status || 'idle',
      role,
      baseX: x,
      baseY: 0.2,
      baseZ: z,
      deskPos: desk,
    });
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Status Update
     ═════════════════════════════════════════════════════════════════════════ */
  _updateStatus(name, status) {
    const agent = agents.get(name);
    if (!agent) return;
    agent.status = status;

    // Update glow intensity based on status
    const intensityMap = {
      idle: 0.2, working: 0.6, testing: 0.7,
      thinking: 0.4, error: 1.0, failed: 1.0,
      done: 0.5, passed: 0.5,
    };
    if (agent.parts.glow) {
      agent.parts.glow.intensity = intensityMap[status] || 0.2;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Remove Robot
     ═════════════════════════════════════════════════════════════════════════ */
  _removeRobot(name) {
    const agent = agents.get(name);
    if (!agent) return;
    scene.remove(agent.group);
    agents.delete(name);

    // Clean bubble timer
    const bt = this._bubbleTimers.get(name);
    if (bt) { clearTimeout(bt); this._bubbleTimers.delete(name); }
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Bubble System — 3D floating chat bubbles
     ═════════════════════════════════════════════════════════════════════════ */
  _scheduleBubbles(agentData) {
    const BUBBLE_TEXTS = {
      working: ['正在执行...', '快了快了', '处理中...', '加油 💪'],
      testing: ['跑测试中...', '验证 API...', '等结果...'],
      thinking: ['让我想想...', '分析中...', '推理...', '🤔'],
      error: ['出错了!', '修复中...', '糟糕...'],
      idle: ['摸鱼中~', '等任务...', '☕ 喝咖啡', 'zzZ'],
      done: ['搞定!', '完成 ✓', '下一个!'],
      passed: ['全绿 ✓', '测试通过!'],
      failed: ['有失败...', '需要修复'],
    };

    const current = new Set();
    agentData.forEach(a => {
      current.add(a.name);
      if (this._bubbleTimers.has(a.name)) return;

      const schedule = () => {
        const agent = agents.get(a.name);
        if (!agent) return;
        const status = agent.status || 'idle';
        const texts = BUBBLE_TEXTS[status] || BUBBLE_TEXTS.idle;
        const text = texts[Math.floor(Math.random() * texts.length)];
        this._showBubble(a.name, text);
        const next = 6000 + Math.random() * 8000;
        this._bubbleTimers.set(a.name, setTimeout(schedule, next));
      };

      const delay = 1000 + Math.random() * 3000;
      this._bubbleTimers.set(a.name, setTimeout(schedule, delay));
    });

    // Remove timers for removed agents
    for (const [name, timer] of this._bubbleTimers) {
      if (!current.has(name)) {
        clearTimeout(timer);
        this._bubbleTimers.delete(name);
      }
    }
  }

  _showBubble(name, text) {
    const agent = agents.get(name);
    if (!agent) return;

    // Remove existing bubble
    if (agent.bubbleObj) {
      agent.group.remove(agent.bubbleObj);
    }

    const div = document.createElement('div');
    div.className = 'bubble-3d';
    div.textContent = text;

    const bubble = new CSS2DObject(div);
    bubble.position.set(0.4, 2.3, 0);
    agent.group.add(bubble);
    agent.bubbleObj = bubble;

    // Remove after 3 seconds
    setTimeout(() => {
      if (agent.bubbleObj === bubble) {
        agent.group.remove(bubble);
        agent.bubbleObj = null;
      }
    }, 3000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Helper exports
   ═══════════════════════════════════════════════════════════════════════════════ */
export function getAgentPosition(name) {
  const agent = agents.get(name);
  if (!agent) return null;
  return agent.group.position.clone();
}
