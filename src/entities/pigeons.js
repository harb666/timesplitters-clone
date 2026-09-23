// Town pigeons pecking about on the pavements outside the shops. They
// waddle and peck, scatter and fly off when you get close or fire, and
// drift back down a while later. One instanced draw call for all of them.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';

function birdGeo() {
  const parts = [];
  const add = (g, x, y, z) => { g.translate(x, y, z); parts.push(g.index ? g.toNonIndexed() : g); };
  add(new THREE.SphereGeometry(0.11, 8, 6).scale(0.8, 0.75, 1.35), 0, 0.14, 0);          // body
  add(new THREE.SphereGeometry(0.055, 7, 5), 0, 0.25, 0.13);                              // head
  add(new THREE.ConeGeometry(0.015, 0.05, 4).rotateX(Math.PI / 2), 0, 0.245, 0.195);     // beak
  add(new THREE.BoxGeometry(0.1, 0.02, 0.14), 0, 0.15, -0.17);                            // tail
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.08, 0.012), sx * 0.035, 0.04, 0.02); // legs
  const out = new THREE.BufferGeometry(); let n = 0; for (const g of parts) n += g.attributes.position.count;
  for (const [k, sz] of [['position', 3], ['normal', 3]]) { const a = new Float32Array(n * sz); let o = 0; for (const g of parts) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, sz)); }
  return out;
}

export class Pigeons {
  constructor(scene, spots, count = 60) {
    this.birds = [];
    const R = Math.random;
    for (let i = 0; i < count && spots.length; i++) {
      const s = spots[(i / 5 | 0) % spots.length];
      const x = s[0] + (R() - 0.5) * 3, z = s[1] + (R() - 0.5) * 3;
      this.birds.push({ x, z, y: G(x, z) + 0.15, home: [x, z], yaw: R() * 6.28, t: R() * 10, state: 'ground', vy: 0, vx: 0, vz: 0, away: 0 });
    }
    this.mesh = new THREE.InstancedMesh(birdGeo(), new THREE.MeshStandardMaterial({ color: 0x8c9098, roughness: 0.7 }), Math.max(1, this.birds.length));
    const c = new THREE.Color(); this.birds.forEach((b, i) => { c.setHSL(0.6, 0.06, 0.35 + Math.random() * 0.25); this.mesh.setColorAt(i, c); });
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
  }
  scare(px, pz, r) {
    for (const b of this.birds) if (b.state === 'ground' && Math.hypot(b.x - px, b.z - pz) < r) {
      b.state = 'fly'; const a = Math.atan2(b.x - px, b.z - pz) + (Math.random() - 0.5); b.vx = Math.sin(a) * 6; b.vz = Math.cos(a) * 6; b.vy = 4 + Math.random() * 2; b.yaw = a; b.away = 12 + Math.random() * 15;
    }
  }
  update(dt, player) {
    const px = player.pos.x, pz = player.pos.z;
    this.scare(px, pz, 2.6);
    let n = 0;
    for (const b of this.birds) {
      b.t += dt;
      if (b.state === 'ground') {
        if (Math.sin(b.t * 0.7 + b.home[0]) > 0.6) { b.x += Math.sin(b.yaw) * 0.25 * dt; b.z += Math.cos(b.yaw) * 0.25 * dt; }
        if (Math.random() < dt * 0.3) b.yaw += (Math.random() - 0.5) * 2;
        if (Math.hypot(b.x - b.home[0], b.z - b.home[1]) > 3) b.yaw = Math.atan2(b.home[0] - b.x, b.home[1] - b.z);
        b.y = G(b.x, b.z) + 0.15;
      } else if (b.state === 'fly') {
        b.away -= dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.vy = Math.max(0.5, b.vy - dt * 2);
        if (b.away <= 0) { b.state = 'land'; }
      } else {
        // glide back down to its patch of pavement
        const dx = b.home[0] - b.x, dz = b.home[1] - b.z, d = Math.hypot(dx, dz), gy = G(b.home[0], b.home[1]) + 0.15;
        b.yaw = Math.atan2(dx, dz); const sp = Math.min(7, d * 0.8 + 1);
        b.x += dx / (d || 1) * sp * dt; b.z += dz / (d || 1) * sp * dt; b.y += (gy - b.y) * Math.min(1, dt * (d < 4 ? 3 : 0.5));
        if (d < 0.3 && Math.abs(b.y - gy) < 0.1) { b.state = 'ground'; if (Math.hypot(b.x - px, b.z - pz) < 4) { b.state = 'fly'; b.away = 8; b.vy = 3; b.vx = -dx; b.vz = -dz; } }
      }
      if (Math.hypot(b.x - px, b.z - pz) > 90) continue;
      const peck = b.state === 'ground' ? Math.max(0, Math.sin(b.t * 5 + b.home[1])) * 0.5 : 0;
      const flap = b.state !== 'ground' ? Math.sin(b.t * 30) * 0.15 : 0;
      this.e.set(peck, b.yaw, flap); this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(b.x, b.y, b.z), this.q, this.s); this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }
}
