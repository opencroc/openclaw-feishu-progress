/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — Particle Systems & Effects
   ~2000 lines
   ═══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

function disposeObject3D(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ParticleManager
   ═══════════════════════════════════════════════════════════════════════════════ */
export class ParticleManager {
  constructor(scene) {
    this.scene = scene;
    this.systems = [];
    this._time = 0;

    this._createAmbientParticles();
    this._createDataStreamParticles();
    this._createGroundGlow();
  }

  /* ─── Update each frame ──────────────────────────────────────────────── */
  update(dt) {
    this._time += dt;

    for (const sys of this.systems) {
      if (sys.update) sys.update(dt, this._time);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Ambient Floating Particles — Dust motes & bokeh
     ═════════════════════════════════════════════════════════════════════════ */
  _createAmbientParticles() {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    const palette = [
      new THREE.Color(0x34d399),
      new THREE.Color(0x60a5fa),
      new THREE.Color(0xa78bfa),
      new THREE.Color(0x22d3ee),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;

      velocities[i * 3]     = (Math.random() - 0.5) * 0.2;
      velocities[i * 3 + 1] = 0.05 + Math.random() * 0.15;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2;

      sizes[i] = 0.02 + Math.random() * 0.08;
      opacities[i] = 0.1 + Math.random() * 0.4;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aOpacity;
        attribute vec3 aVelocity;
        attribute vec3 color;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          vOpacity = aOpacity;
          vColor = color;
          vec3 pos = position;
          // Gentle floating motion
          pos.x += sin(uTime * aVelocity.x + position.z * 2.0) * 0.5;
          pos.y += mod(pos.y + uTime * aVelocity.y, 15.0);
          pos.z += cos(uTime * aVelocity.z + position.x * 2.0) * 0.5;
          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = aSize * uPixelRatio * (150.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = (1.0 - smoothstep(0.2, 0.5, d)) * vOpacity;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const points = new THREE.Points(geo, mat);
    points.name = 'ambient-particles';
    this.scene.add(points);

    this.systems.push({
      mesh: points,
      update: (dt, time) => {
        mat.uniforms.uTime.value = time;
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Data Stream Particles — Vertical data flow columns
     ═════════════════════════════════════════════════════════════════════════ */
  _createDataStreamParticles() {
    const streamPositions = [
      { x: -10, z: -4.5 },  // Server area
      { x: 0, z: 0 },       // Center hologram
      { x: -10, z: -1.5 },  // Server area 2
    ];

    streamPositions.forEach((sp, idx) => {
      const count = 80;
      const positions = new Float32Array(count * 3);
      const speeds = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        positions[i * 3]     = sp.x + (Math.random() - 0.5) * 0.6;
        positions[i * 3 + 1] = Math.random() * 6;
        positions[i * 3 + 2] = sp.z + (Math.random() - 0.5) * 0.6;
        speeds[i] = 1.0 + Math.random() * 2.0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

      const color = idx === 1 ? 0x34d399 : (idx === 0 ? 0x60a5fa : 0xa78bfa);

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: `
          attribute float aSpeed;
          uniform float uTime;
          uniform float uPixelRatio;
          varying float vAlpha;
          void main() {
            vec3 pos = position;
            float y = mod(pos.y + uTime * aSpeed, 6.0);
            pos.y = y + 0.3;
            vAlpha = 1.0 - y / 6.0; // Fade as they rise
            vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = 3.0 * uPixelRatio * (100.0 / -mvPos.z);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float alpha = (1.0 - d * 2.0) * vAlpha * 0.6;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geo, mat);
      points.name = `data-stream-${idx}`;
      this.scene.add(points);

      this.systems.push({
        mesh: points,
        update: (dt, time) => {
          mat.uniforms.uTime.value = time;
        },
      });
    });
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Ground Glow — Circle of light on the ground near center
     ═════════════════════════════════════════════════════════════════════════ */
  _createGroundGlow() {
    const glowGeo = new THREE.CircleGeometry(3, 32);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x34d399) },
        uIntensity: { value: 0.15 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          vec2 center = vUv - vec2(0.5);
          float dist = length(center) * 2.0;
          float ring1 = smoothstep(0.8, 0.85, dist) - smoothstep(0.85, 0.9, dist);
          float ring2 = smoothstep(0.5, 0.55, dist) - smoothstep(0.55, 0.6, dist);
          float pulse = 0.5 + 0.5 * sin(uTime * 2.0);
          float glow = (1.0 - dist) * uIntensity;
          float rings = (ring1 + ring2 * 0.5) * 0.3 * pulse;
          float alpha = max(glow, rings);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.22, 0);
    glow.name = 'ground-glow';
    this.scene.add(glow);

    this.systems.push({
      mesh: glow,
      update: (dt, time) => {
        glowMat.uniforms.uTime.value = time;
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════════
     Celebration Explosion — Triggered on pipeline completion
     ═════════════════════════════════════════════════════════════════════════ */
  triggerCelebration() {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const palette = [
      new THREE.Color(0x34d399), new THREE.Color(0x60a5fa),
      new THREE.Color(0xfbbf24), new THREE.Color(0xf472b6),
      new THREE.Color(0xa78bfa), new THREE.Color(0x22d3ee),
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 2;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 3 + Math.random() * 5;
      velocities.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.5 + 4,
        Math.sin(phi) * Math.sin(theta) * speed,
      );

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      sizes[i] = 0.05 + Math.random() * 0.1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      transparent: true,
      opacity: 1.0,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geo, mat);
    particles.name = 'celebration';
    this.scene.add(particles);

    let life = 0;
    const sys = {
      mesh: particles,
      update: (dt) => {
        life += dt;
        if (life > 3) {
          this.scene.remove(particles);
          geo.dispose();
          mat.dispose();
          const idx = this.systems.indexOf(sys);
          if (idx >= 0) this.systems.splice(idx, 1);
          return;
        }

        const posArr = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
          posArr[i * 3]     += velocities[i * 3] * dt;
          posArr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
          posArr[i * 3 + 2] += velocities[i * 3 + 2] * dt;
          velocities[i * 3 + 1] -= 9.8 * dt; // Gravity
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, 1 - life / 3);
      },
    };

    this.systems.push(sys);
  }

  triggerAgentTransfer(from, to, kind = 'assigned') {
    if (!from || !to) return;

    const startColor = kind === 'released' ? 0xfbbf24 : 0x60a5fa;
    const endColor = kind === 'released' ? 0x34d399 : 0x22d3ee;

    this._triggerPulse(from.x, 0.34, from.z, startColor, kind === 'released' ? 0.8 : 1.1);
    this._triggerPulse(to.x, 0.34, to.z, endColor, kind === 'released' ? 1.2 : 0.9, 180);

    // Expanding ripple at the pond side (departure or arrival).
    const pondSide = kind === 'assigned' ? from : to;
    if (pondSide.x != null) this.triggerPondRipple(pondSide.x, pondSide.z ?? 6.2);
  }

  triggerPondRipple(x, z) {
    const geo = new THREE.RingGeometry(0.18, 0.32, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.31, z);
    this.scene.add(ring);

    let life = 0;
    const sys = {
      mesh: ring,
      update: (dt) => {
        life += dt;
        if (life >= 1.1) {
          this.scene.remove(ring);
          geo.dispose();
          mat.dispose();
          const idx = this.systems.indexOf(sys);
          if (idx >= 0) this.systems.splice(idx, 1);
          return;
        }
        ring.scale.setScalar(1 + life * 3.2);
        ring.material.opacity = Math.max(0, 0.65 * (1 - life / 1.1));
      },
    };
    this.systems.push(sys);
  }

  _triggerPulse(x, y, z, colorHex, lift = 1, delayMs = 0) {
    const spawn = () => {
      const count = 38;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        const a = (i / count) * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.4;
        velocities[i * 3] = Math.cos(a) * speed;
        velocities[i * 3 + 1] = 0.8 + Math.random() * lift;
        velocities[i * 3 + 2] = Math.sin(a) * speed;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.09,
        color: colorHex,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const points = new THREE.Points(geo, mat);
      this.scene.add(points);

      let life = 0;
      const ttl = 0.68;
      const sys = {
        mesh: points,
        update: (dt) => {
          life += dt;
          if (life >= ttl) {
            this.scene.remove(points);
            geo.dispose();
            mat.dispose();
            const idx = this.systems.indexOf(sys);
            if (idx >= 0) this.systems.splice(idx, 1);
            return;
          }

          const arr = geo.attributes.position.array;
          for (let i = 0; i < count; i++) {
            arr[i * 3] += velocities[i * 3] * dt;
            arr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
            arr[i * 3 + 2] += velocities[i * 3 + 2] * dt;
            velocities[i * 3 + 1] -= 2.8 * dt;
          }
          geo.attributes.position.needsUpdate = true;
          mat.opacity = Math.max(0, 0.92 - (life / ttl) * 0.92);
        },
      };

      this.systems.push(sys);
    };

    if (delayMs > 0) {
      setTimeout(spawn, delayMs);
    } else {
      spawn();
    }
  }

  dispose() {
    for (const system of this.systems) {
      if (system.mesh) {
        this.scene.remove(system.mesh);
        disposeObject3D(system.mesh);
      }
    }
    this.systems = [];
  }
}
