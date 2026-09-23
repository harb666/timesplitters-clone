// The Mini Mart's shopping trolley, which has ideas of its own. It rolls
// down the street (faster downhill), wobbling on its one bad wheel, until
// you catch it -- then you push it home.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { sfx } from '../audio/audio.js';

function buildTrolley() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced2, metalness: 0.9, roughness: 0.35 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1f8a4c, roughness: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const bar = (w, h, d, x, y, z, m = metal) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  // wire basket: frame + vertical wires on the sides
  const W = 0.56, L = 0.9, y0 = 0.42, y1 = 0.95;
  for (const y of [y0, (y0 + y1) / 2, y1]) { bar(W, 0.015, 0.015, 0, y, L / 2); bar(W * 0.8, 0.015, 0.015, 0, y, -L / 2); bar(0.015, 0.015, L, W / 2 - (y === y0 ? 0.04 : 0), y, 0); bar(0.015, 0.015, L, -W / 2 + (y === y0 ? 0.04 : 0), y, 0); }
  for (let i = 0; i <= 10; i++) { const z = -L / 2 + i * L / 10; bar(0.01, y1 - y0, 0.01, W / 2, (y0 + y1) / 2, z); bar(0.01, y1 - y0, 0.01, -W / 2, (y0 + y1) / 2, z); }
  for (let i = 0; i <= 6; i++) { const x = -W / 2 + i * W / 6; bar(0.01, y1 - y0, 0.01, x, (y0 + y1) / 2, L / 2); bar(0.01, 0.01, L, x, y0, 0); }
  // chassis + wheels + handle
  bar(0.04, 0.04, L + 0.1, 0.24, 0.16, 0); bar(0.04, 0.04, L + 0.1, -0.24, 0.16, 0);
  for (const [x, z] of [[0.24, 0.45], [-0.24, 0.45], [0.2, -0.45], [-0.2, -0.45]]) {
    bar(0.02, 0.1, 0.02, x, 0.1, z);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12).rotateZ(Math.PI / 2), rubber); w.position.set(x, 0.06, z); g.add(w);
  }
  bar(W + 0.06, 0.04, 0.04, 0, 1.02, -L / 2 - 0.12, plastic);
  for (const x of [-W / 2, W / 2]) { const s = bar(0.02, 0.02, 0.2, x, 0.99, -L / 2 - 0.05); s.rotation.x = 0.3; }
  // a stray carrier bag and a loaf
  bar(0.22, 0.2, 0.15, 0.08, y0 + 0.12, 0.1, new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8 }));
  bar(0.1, 0.1, 0.3, -0.12, y0 + 0.06, -0.15, new THREE.MeshStandardMaterial({ color: 0xc8904a, roughness: 0.9 }));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

export class Trolley {
  constructor(scene, world, path, home) {
    this.mesh = buildTrolley(); scene.add(this.mesh);
    this.world = world; this.home = home;
    this.path = path; this.cum = [0];
    for (let i = 1; i < path.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.s = 0; this.speed = 2.5; this.state = 'rolling'; this.x = path[0][0]; this.z = path[0][1]; this.heading = 0; this.wob = 0; this.rattle = 0;
    this.place();
  }
  at(s) {
    let i = 0; while (i < this.path.length - 2 && this.cum[i + 1] < s) i++;
    const [ax, az] = this.path[i], [bx, bz] = this.path[i + 1], L = this.cum[i + 1] - this.cum[i] || 1, k = Math.max(0, Math.min(1, (s - this.cum[i]) / L));
    return [ax + (bx - ax) * k, az + (bz - az) * k, (bx - ax) / L, (bz - az) / L];
  }
  place() {
    const y = G(this.x, this.z) + (this.onPave ? 0.15 : 0.03);
    this.mesh.position.set(this.x, y, this.z);
    this.mesh.rotation.set(this.state === 'crashed' ? 0.15 : 0, this.heading, this.state === 'crashed' ? 1.35 : Math.sin(this.wob) * 0.03);
  }
  get caught() { return this.state === 'pushed' || this.state === 'home'; }
  update(dt, player) {
    const px = player.pos.x, pz = player.pos.z, d = Math.hypot(px - this.x, pz - this.z);
    if (this.state === 'rolling') {
      const [x0, z0] = this.at(this.s), [x1, z1, tx, tz] = this.at(Math.min(this.len, this.s + 2));
      const slope = (G(x0, z0) - G(x1, z1)) / 2;                    // positive = downhill
      this.speed = Math.max(2.4, Math.min(7.5, this.speed + (slope * 9.8 * 0.9 - 0.15) * dt));
      this.s += this.speed * dt; this.wob += dt * (8 + this.speed * 2);
      const side = Math.sin(this.s * 0.35) * 0.9;                    // the dodgy wheel
      this.x = x0 + tz * side; this.z = z0 - tx * side; this.heading = Math.atan2(tx, tz) + Math.sin(this.wob * 0.4) * 0.12;
      this.rattle -= dt; if (this.rattle <= 0) { sfx.clatter(this.x, 0.5, this.z, 0.25 + this.speed * 0.04); this.rattle = 0.12 + Math.random() * 0.15; }
      if (this.s >= this.len - 0.5) { this.state = 'crashed'; sfx.clatter(this.x, 0.5, this.z, 1.5); }
      if (d < 1.9) this.catch();
    } else if (this.state === 'crashed') {
      if (d < 2.2) this.catch();
    } else if (this.state === 'pushed') {
      // sits in front of the player
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const tx = px + fx * 1.25, tz = pz + fz * 1.25;
      this.x += (tx - this.x) * Math.min(1, dt * 10); this.z += (tz - this.z) * Math.min(1, dt * 10);
      this.heading = Math.atan2(fx, fz); this.wob += dt * 10 * Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 3);
      if (Math.hypot(this.x - this.home[0], this.z - this.home[1]) < 4) { this.state = 'home'; sfx.pickup(); }
    }
    this.place();
  }
  catch() { this.state = 'pushed'; sfx.clatter(this.x, 0.5, this.z, 1); }
  dispose(scene) { scene.remove(this.mesh); }
}
