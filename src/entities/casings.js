// Spent cartridge cases: ejected with real velocity/spin, bounce on the
// ground, roll to a stop, and ring differently on hard vs soft ground.
import * as THREE from 'three';
import { lathe, PartBuilder } from '../models/shapes.js';
import { play } from '../audio/soundscape.js';

const MAX = 40;

export class Casings {
  constructor(scene, world, M, surfaceAt) {
    this.world = world; this.surfaceAt = surfaceAt;
    this.pool = [];
    const rifle = new THREE.Group();
    new PartBuilder().add(M.brass, lathe([[0, 0], [0.0056, 0], [0.0056, 0.0015], [0.0048, 0.002], [0.0056, 0.0025], [0.0056, 0.028], [0.0045, 0.033], [0.0041, 0.039], [0.0034, 0.039]], 14)).build(rifle);
    const pistol = new THREE.Group();
    new PartBuilder().add(M.brass, lathe([[0, 0], [0.0055, 0], [0.0055, 0.0015], [0.0047, 0.0019], [0.0048, 0.033], [0.0042, 0.033]], 14)).build(pistol);
    this.geo = { rifle: rifle.children[0].geometry, pistol: pistol.children[0].geometry };
    this.mat = M.brass;
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(this.geo.rifle, this.mat); m.visible = false; m.castShadow = true;
      scene.add(m);
      this.pool.push({ m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, rest: false, bounces: 0 });
    }
    this.i = 0;
  }

  spawn(kind, pos, vel) {
    const c = this.pool[this.i]; this.i = (this.i + 1) % MAX;
    c.m.geometry = this.geo[kind] || this.geo.rifle;
    c.m.position.copy(pos); c.vel.copy(vel);
    c.spin.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 40);
    c.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    c.m.visible = true; c.life = 25; c.rest = false; c.bounces = 0;
  }

  update(dt) {
    for (const c of this.pool) {
      if (!c.m.visible) continue;
      c.life -= dt; if (c.life <= 0) { c.m.visible = false; continue; }
      if (c.rest) continue;
      c.vel.y -= 9.81 * dt;
      c.m.position.addScaledVector(c.vel, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      const p = c.m.position;
      const floor = this.world.floorAt(p.x, p.z, p.y + 0.05, 0.05) + 0.006;
      if (p.y < floor) {
        p.y = floor;
        const speed = Math.abs(c.vel.y);
        const surf = this.surfaceAt(p.x, p.z);
        const soft = surf === 'grass';
        if (speed > 0.4) play(soft ? 'casing_soft' : 'casing', { pos: p, gain: Math.min(1, speed / 3) * (soft ? 0.5 : 0.9), jitter: 0.12, ref: 1, send: 0.1, physicalDelay: false });
        c.vel.y = speed * (soft ? 0.15 : 0.42);
        c.vel.x *= soft ? 0.3 : 0.7; c.vel.z *= soft ? 0.3 : 0.7;
        c.spin.multiplyScalar(0.5);
        c.bounces++;
        if (c.bounces > 5 || speed < 0.3) { c.rest = true; c.m.rotation.x = Math.PI / 2; c.m.rotation.z = 0; }
      }
    }
  }
}
