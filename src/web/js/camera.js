/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — Camera Controller
   Orbit controls, fly-to transitions, auto-rotate
   ~1000 lines
   ═══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ═══════════════════════════════════════════════════════════════════════════════
   Camera Presets
   ═══════════════════════════════════════════════════════════════════════════════ */
const PRESETS = {
  office: {
    position: new THREE.Vector3(18, 14, 18),
    target: new THREE.Vector3(0, 2, 0),
  },
  graph: {
    position: new THREE.Vector3(0, 25, 0.1),
    target: new THREE.Vector3(0, 0, 0),
  },
  closeup: {
    position: new THREE.Vector3(5, 4, 8),
    target: new THREE.Vector3(0, 2, 0),
  },
  overview: {
    position: new THREE.Vector3(30, 20, 30),
    target: new THREE.Vector3(0, 0, 0),
  },
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CameraController
   ═══════════════════════════════════════════════════════════════════════════════ */
export class CameraController {
  constructor(canvas, camera, scene) {
    this.camera = camera;
    this.scene = scene;
    scene.userData.camera = camera; // Store ref for CSS2D renderer

    // Orbit controls
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.panSpeed = 0.8;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 1.2;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minPolarAngle = Math.PI * 0.05;
    this.controls.target.set(0, 2, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;

    // Fly-to animation state
    this._flying = false;
    this._flyStart = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
    this._flyEnd = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
    this._flyProgress = 0;
    this._flyDuration = 1.5;
  }

  /** Update each frame */
  update(dt) {
    if (this._flying) {
      this._flyProgress += dt / this._flyDuration;
      if (this._flyProgress >= 1) {
        this._flyProgress = 1;
        this._flying = false;
      }

      // Smooth easing (ease-out-expo)
      const t = 1 - Math.pow(1 - this._flyProgress, 3);

      this.camera.position.lerpVectors(this._flyStart.pos, this._flyEnd.pos, t);
      this.controls.target.lerpVectors(this._flyStart.tgt, this._flyEnd.tgt, t);
    }

    this.controls.update();
  }

  /** Fly to a named preset or custom position */
  flyTo(presetOrTarget, duration = 1.5) {
    let target;
    if (typeof presetOrTarget === 'string') {
      target = PRESETS[presetOrTarget];
      if (!target) return;
    } else {
      target = presetOrTarget;
    }

    this._flyStart.pos.copy(this.camera.position);
    this._flyStart.tgt.copy(this.controls.target);
    this._flyEnd.pos.copy(target.position);
    this._flyEnd.tgt.copy(target.target);
    this._flyProgress = 0;
    this._flyDuration = duration;
    this._flying = true;
  }

  /** Fly to a specific module in the graph */
  flyToModule(x, z) {
    this.flyTo({
      position: new THREE.Vector3(x + 8, 10, z + 8),
      target: new THREE.Vector3(x, 1, z),
    });
  }

  /** Enable/disable auto rotation */
  enableAutoRotate() {
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;
  }

  disableAutoRotate() {
    this.controls.autoRotate = false;
  }

  /** Get the raw controls for external use */
  getControls() {
    return this.controls;
  }
}
