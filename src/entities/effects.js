// Cheap, pooled visual effects: sparks, dust, tracers and bullet holes.
import * as THREE from 'three';
import { glowTexture } from '../textures/procedural.js';

function holeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grd.addColorStop(0, 'rgba(10,10,10,1)'); grd.addColorStop(0.45, 'rgba(30,28,25,.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // ---- sparks (one Points object for all of them) ----
    this.N = 160;
    const g = new THREE.BufferGeometry();
    this.sPos = new Float32Array(this.N * 3); this.sCol = new Float32Array(this.N * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3));
    this.sVel = new Float32Array(this.N * 3); this.sLife = new Float32Array(this.N);
    this.sBase = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) this.sPos[i * 3 + 1] = -999;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;

    // ---- tracers ----
    this.tracers = [];
    const tm = new THREE.LineBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 12; i++) {
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(lg, tm.clone()); l.visible = false; l.frustumCulled = false; scene.add(l);
      this.tracers.push({ line: l, life: 0 });
    }
    this.tIdx = 0;

    // ---- bullet holes (instanced quads) ----
    this.maxHoles = 60;
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.maxHoles);
    this.holes.count = 0; this.holes.frustumCulled = false;
    scene.add(this.holes);
    this.hIdx = 0; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._n = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }

  sparks(p, normal, count = 8, color = [1, 0.8, 0.4], speed = 5) {
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % this.N;
      this.sPos[i * 3] = p.x; this.sPos[i * 3 + 1] = p.y; this.sPos[i * 3 + 2] = p.z;
      const v = speed * (0.4 + Math.random());
      this.sVel[i * 3] = (normal.x + (Math.random() - 0.5) * 1.6) * v;
      this.sVel[i * 3 + 1] = (normal.y + Math.random() * 1.2) * v;
      this.sVel[i * 3 + 2] = (normal.z + (Math.random() - 0.5) * 1.6) * v;
      this.sLife[i] = 0.25 + Math.random() * 0.3;
      this.sBase[i * 3] = color[0]; this.sBase[i * 3 + 1] = color[1]; this.sBase[i * 3 + 2] = color[2];
    }
  }

  dust(p, normal, color = [0.55, 0.5, 0.45]) { this.sparks(p, normal, 5, color, 1.6); }

  tracer(a, b) {
    const t = this.tracers[this.tIdx]; this.tIdx = (this.tIdx + 1) % this.tracers.length;
    const arr = t.line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true; t.life = 0.07; t.line.material.opacity = 0.8;
  }

  hole(p, normal) {
    this._n.copy(normal);
    this._q.setFromUnitVectors(this._z, this._n);
    this._m.compose(p.clone().addScaledVector(normal, 0.02), this._q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + Math.random() * 0.5));
    this.holes.setMatrixAt(this.hIdx, this._m);
    this.hIdx = (this.hIdx + 1) % this.maxHoles;
    this.holes.count = Math.min(this.maxHoles, this.holes.count + 1);
    this.holes.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.sLife[i] <= 0) continue;
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0) { this.sPos[i * 3 + 1] = -999; continue; }
      this.sVel[i * 3 + 1] -= 14 * dt;
      this.sPos[i * 3] += this.sVel[i * 3] * dt; this.sPos[i * 3 + 1] += this.sVel[i * 3 + 1] * dt; this.sPos[i * 3 + 2] += this.sVel[i * 3 + 2] * dt;
      const f = Math.min(1, this.sLife[i] * 4);
      this.sCol[i * 3] = this.sBase[i * 3] * f; this.sCol[i * 3 + 1] = this.sBase[i * 3 + 1] * f; this.sCol[i * 3 + 2] = this.sBase[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.8;
      if (t.life <= 0) t.line.visible = false;
    }
  }
}
