// Pooled visual effects: material-specific bullet impacts (decals, dust,
// sparks, splinters, glass), muzzle smoke, and tracers.
import * as THREE from 'three';
import { glowTexture } from '../textures/procedural.js';

function canvasTex(n, draw) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Decal textures per material family.
const DECALS = {
  masonry: (g, n) => { // chipped crater: pale dust ring, dark core
    const c = n / 2;
    let grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(20,18,16,1)'); grd.addColorStop(0.25, 'rgba(60,52,46,.95)'); grd.addColorStop(0.5, 'rgba(190,175,160,.55)'); grd.addColorStop(1, 'rgba(200,190,175,0)');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(30,26,22,.6)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * c * (0.5 + Math.random() * 0.4), c + Math.sin(a) * c * (0.5 + Math.random() * 0.4)); g.stroke(); }
  },
  metal: (g, n) => { // bright dimple with scorched edge
    const c = n / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(30,30,32,1)'); grd.addColorStop(0.18, 'rgba(210,210,215,1)'); grd.addColorStop(0.35, 'rgba(120,120,125,.9)'); grd.addColorStop(0.6, 'rgba(40,36,30,.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
  },
  wood: (g, n) => {
    const c = n / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(15,10,6,1)'); grd.addColorStop(0.3, 'rgba(70,45,25,.9)'); grd.addColorStop(0.55, 'rgba(200,160,110,.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
  },
  glass: (g, n) => { // radial crack star
    const c = n / 2;
    g.strokeStyle = 'rgba(235,245,255,.9)'; g.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28 + Math.random() * 0.3; g.beginPath(); g.moveTo(c, c); let x = c, y = c; for (let k = 0; k < 4; k++) { x += Math.cos(a + (Math.random() - 0.5) * 0.5) * c * 0.24; y += Math.sin(a + (Math.random() - 0.5) * 0.5) * c * 0.24; g.lineTo(x, y); } g.stroke(); }
    g.beginPath(); g.arc(c, c, c * 0.3, 0, 6.28); g.stroke();
    g.fillStyle = 'rgba(20,24,28,.9)'; g.beginPath(); g.arc(c, c, c * 0.08, 0, 6.28); g.fill();
  },
};
const MAT_FAMILY = { concrete: 'masonry', brick: 'masonry', asphalt: 'masonry', paving: 'masonry', stone: 'masonry', dirt: 'masonry', grass: 'masonry', metal: 'metal', plastic: 'metal', wood: 'wood', glass: 'glass' };
const DEBRIS = {
  concrete: { col: [0.7, 0.68, 0.64], n: 7, sp: 2.5 }, brick: { col: [0.62, 0.36, 0.28], n: 7, sp: 2.5 }, asphalt: { col: [0.3, 0.3, 0.3], n: 6, sp: 2 },
  paving: { col: [0.65, 0.64, 0.6], n: 6, sp: 2 }, stone: { col: [0.6, 0.57, 0.5], n: 7, sp: 2.5 }, dirt: { col: [0.35, 0.28, 0.2], n: 9, sp: 3 },
  grass: { col: [0.3, 0.4, 0.2], n: 8, sp: 2.5 }, wood: { col: [0.55, 0.4, 0.25], n: 8, sp: 3 }, glass: { col: [0.85, 0.92, 1.0], n: 10, sp: 3.5 },
  metal: { col: [1, 0.8, 0.45], n: 10, sp: 6, glow: true }, plastic: { col: [0.9, 0.5, 0.2], n: 4, sp: 2 }, flesh: { col: [0.9, 0.9, 0.9], n: 3, sp: 1.2 },
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // ---- particles: one additive (sparks) + one normal-blended (debris) Points ----
    this.sys = {};
    for (const kind of ['spark', 'debris']) {
      const N = 220, g = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = kind === 'spark'
        ? new THREE.PointsMaterial({ size: 0.07, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
        : new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: false });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
      this.sys[kind] = { N, pts, pos, col, vel: new Float32Array(N * 3), life: new Float32Array(N), base: new Float32Array(N * 3), next: 0, drag: kind === 'spark' ? 0.5 : 1.5, grav: kind === 'spark' ? 9 : 14 };
    }
    // ---- smoke puffs ----
    // soft smoke puff: radial alpha falloff (texture alpha, not a hard quad)
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    const sg = sc.getContext('2d'); const sgrd = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    sgrd.addColorStop(0, 'rgba(255,255,255,0.6)'); sgrd.addColorStop(0.45, 'rgba(255,255,255,0.25)'); sgrd.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = sgrd; sg.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(sc);
    this.smoke = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, alphaMap: smokeTex, color: 0xd8d4cc, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s); this.smoke.push({ s, vel: new THREE.Vector3(), life: 0, max: 1, grow: 1 });
    }
    this.sIdx = 0;
    // ---- tracers ----
    this.tracers = [];
    const tm = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 12; i++) {
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(lg, tm.clone()); l.visible = false; l.frustumCulled = false; scene.add(l);
      this.tracers.push({ line: l, life: 0 });
    }
    this.tIdx = 0;
    // ---- decals ----
    this.decals = {};
    for (const [k, draw] of Object.entries(DECALS)) {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: canvasTex(64, draw), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9, metalness: 0 }), 50);
      im.count = 0; im.frustumCulled = false; scene.add(im);
      this.decals[k] = { im, idx: 0 };
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._z = new THREE.Vector3(0, 0, 1); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  emit(kind, p, normal, count, color, speed, spread = 1.4, life = 0.5) {
    const S = this.sys[kind];
    for (let k = 0; k < count; k++) {
      const i = S.next; S.next = (S.next + 1) % S.N;
      S.pos[i * 3] = p.x; S.pos[i * 3 + 1] = p.y; S.pos[i * 3 + 2] = p.z;
      const v = speed * (0.3 + Math.random());
      S.vel[i * 3] = (normal.x + (Math.random() - 0.5) * spread) * v;
      S.vel[i * 3 + 1] = (normal.y + Math.random() * 0.8) * v;
      S.vel[i * 3 + 2] = (normal.z + (Math.random() - 0.5) * spread) * v;
      S.life[i] = life * (0.5 + Math.random());
      const shade = 0.8 + Math.random() * 0.3;
      S.base[i * 3] = color[0] * shade; S.base[i * 3 + 1] = color[1] * shade; S.base[i * 3 + 2] = color[2] * shade;
    }
  }

  // Everything a bullet hit on `mat` needs to look right.
  impact(p, normal, mat) {
    const d = DEBRIS[mat] || DEBRIS.concrete;
    this.emit('debris', p, normal, d.n, d.col, d.sp, 1.2, 0.8);
    if (d.glow) this.emit('spark', p, normal, 9, [1, 0.75, 0.35], 6, 1.6, 0.35);
    else if (mat !== 'flesh' && mat !== 'grass') this.emit('spark', p, normal, 2, [1, 0.8, 0.5], 3, 1.2, 0.12);
    if (mat !== 'flesh') this.puff(p.clone().addScaledVector(normal, 0.05), normal, mat === 'dirt' || mat === 'grass' ? 0x7a6a50 : (mat === 'brick' ? 0xb08070 : 0xc8c2b8), 0.25, 0.9);
    const fam = MAT_FAMILY[mat];
    if (fam && !(mat === 'grass')) this.hole(p, normal, fam, fam === 'glass' ? 0.3 : fam === 'metal' ? 0.07 : 0.13);
  }

  puff(p, dir, color = 0xd8d4cc, size = 0.3, life = 1.2) {
    const s = this.smoke[this.sIdx]; this.sIdx = (this.sIdx + 1) % this.smoke.length;
    s.s.position.copy(p); s.s.material.color.setHex(color); s.s.visible = true;
    s.vel.copy(dir).multiplyScalar(0.6).add(this._v.set((Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3));
    s.life = life; s.max = life; s.size = size; s.s.material.rotation = Math.random() * 6;
  }

  // Muzzle smoke in world space.
  muzzleSmoke(p, dir, amount = 1) {
    for (let i = 0; i < 2 + amount; i++) this.puff(this._v.copy(p).addScaledVector(dir, 0.1 + i * 0.12).clone(), dir, 0xcfcac2, 0.18 + i * 0.05, 1.2 + Math.random() * 0.8);
  }

  tracer(a, b) {
    const t = this.tracers[this.tIdx]; this.tIdx = (this.tIdx + 1) % this.tracers.length;
    const arr = t.line.geometry.attributes.position.array;
    // tracers start a little ahead of the muzzle and cover part of the path
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true; t.life = 0.05; t.line.material.opacity = 0.6;
  }

  hole(p, normal, family, size) {
    const D = this.decals[family];
    this._q.setFromUnitVectors(this._z, normal);
    this._q2.setFromAxisAngle(this._z, Math.random() * 6.28);
    this._q.multiply(this._q2);
    const s = size * (0.8 + Math.random() * 0.5);
    this._m.compose(this._v.copy(p).addScaledVector(normal, 0.012), this._q, this._s.set(s, s, s));
    D.im.setMatrixAt(D.idx, this._m); D.idx = (D.idx + 1) % 50;
    D.im.count = Math.min(50, D.im.count + 1); D.im.instanceMatrix.needsUpdate = true;
  }

  // compatibility helpers (older call sites)
  sparks(p, normal, count = 8, color = [1, 0.8, 0.4], speed = 5) { this.emit('spark', p, normal, count, color, speed); }
  dust(p, normal, color = [0.55, 0.5, 0.45]) { this.emit('debris', p, normal, 5, color, 1.6); }

  update(dt) {
    for (const S of Object.values(this.sys)) {
      for (let i = 0; i < S.N; i++) {
        if (S.life[i] <= 0) continue;
        S.life[i] -= dt;
        if (S.life[i] <= 0) { S.pos[i * 3 + 1] = -999; continue; }
        S.vel[i * 3 + 1] -= S.grav * dt;
        const dr = Math.max(0, 1 - S.drag * dt);
        S.vel[i * 3] *= dr; S.vel[i * 3 + 2] *= dr;
        S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
        const f = Math.min(1, S.life[i] * 4);
        S.col[i * 3] = S.base[i * 3] * f; S.col[i * 3 + 1] = S.base[i * 3 + 1] * f; S.col[i * 3 + 2] = S.base[i * 3 + 2] * f;
      }
      S.pts.geometry.attributes.position.needsUpdate = true; S.pts.geometry.attributes.color.needsUpdate = true;
    }
    for (const s of this.smoke) {
      if (!s.s.visible) continue;
      s.life -= dt; if (s.life <= 0) { s.s.visible = false; continue; }
      const k = 1 - s.life / s.max;
      s.s.position.addScaledVector(s.vel, dt); s.vel.multiplyScalar(Math.max(0, 1 - dt * 1.5)); s.vel.y += dt * 0.15;
      const sz = s.size * (1 + k * 3); s.s.scale.set(sz, sz, 1);
      s.s.material.opacity = Math.sin(Math.min(1, k * 6) * Math.PI / 2) * (1 - k) * 0.55;
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.05) * 0.6;
      if (t.life <= 0) t.line.visible = false;
    }
  }
}
