// Rogue delivery drones: a fleet of "VALE PARCELS" quadcopters whose
// software update went badly. They buzz the rooftops, make bombing runs on
// you with parcels, and can be shot down. (Machines, not people: this is
// the game's target practice.)
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { getCtx, getSfxBus, sfx } from '../audio/audio.js';
import { play } from '../audio/soundscape.js';

let A = null;
function assets() {
  if (A) return A;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#f0a020'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#111'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.fillText('VALE PARCELS', 64, 23);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  A = {
    shell: new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.45, metalness: 0.4 }),
    stripe: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
    arm: new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5, metalness: 0.5 }),
    rotor: new THREE.MeshBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }), green: new THREE.MeshBasicMaterial({ color: 0x2aff5a }),
    box: new THREE.MeshStandardMaterial({ color: 0xb58a58, roughness: 0.9 }), tape: new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.6 }),
  };
  return A;
}
function buildDrone() {
  const a = assets(), g = new THREE.Group(), rotors = [];
  const m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  m(new THREE.BoxGeometry(0.42, 0.13, 0.42), a.shell, 0, 0, 0);
  m(new THREE.BoxGeometry(0.43, 0.05, 0.3), a.stripe, 0, 0.02, 0);
  m(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), a.arm, 0, -0.08, 0.14).rotation.x = Math.PI; // camera dome
  for (const [x, z, i] of [[0.34, 0.34, 0], [-0.34, 0.34, 1], [0.34, -0.34, 2], [-0.34, -0.34, 3]]) {
    const arm = m(new THREE.BoxGeometry(0.05, 0.035, 0.5), a.arm, x / 2, 0.02, z / 2); arm.rotation.y = Math.atan2(x, z);
    m(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), a.arm, x, 0.05, z);
    const r = m(new THREE.CircleGeometry(0.2, 18), a.rotor, x, 0.1, z); r.rotation.x = -Math.PI / 2; rotors.push(r);
    m(new THREE.SphereGeometry(0.02, 6, 4), i < 2 ? a.green : a.red, x, -0.02, z);
  }
  const parcel = new THREE.Group(); parcel.position.y = -0.32; g.add(parcel);
  const pb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), a.box); pb.castShadow = true; parcel.add(pb);
  const pt = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.23, 0.06), a.tape); parcel.add(pt);
  for (const [x, z] of [[0.1, 0.1], [-0.1, 0.1], [0.1, -0.1], [-0.1, -0.1]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 3), a.arm); s.position.set(x, -0.2, z); g.add(s); }
  g.scale.setScalar(1.6);
  return { g, rotors, parcel };
}

export class Drones {
  constructor(game, { center, count = 10, radius = 70 }) {
    this.game = game; this.list = []; this.parcels = []; this.center = center; this.radius = radius; this.killed = 0; this.total = count;
    for (let i = 0; i < count; i++) this.spawn(i);
    this.startBuzz();
  }
  spawn(i) {
    const { g, rotors, parcel } = buildDrone();
    const a = (i / this.total) * Math.PI * 2, r = this.radius * (0.4 + Math.random() * 0.6);
    const x = this.center[0] + Math.cos(a) * r, z = this.center[1] + Math.sin(a) * r;
    const d = { mesh: g, rotors, parcel, pos: new THREE.Vector3(x, G(x, z) + 12 + Math.random() * 6, z), vel: new THREE.Vector3(), hp: 60, alive: true, falling: false,
      phase: Math.random() * 10, runT: 3 + Math.random() * 6, mode: 'patrol', hasParcel: true, flash: 0, orbit: a, spin: 0 };
    d.collider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, tag: 'drone', owner: { onShot: (p, dmg) => this.hit(d, dmg ?? 34, p) } };
    this.game.world.dynamic.push(d.collider);
    this.game.scene.add(g); this.list.push(d);
  }
  get done() { return this.killed >= this.total; }
  alive() { return this.list.filter((d) => d.alive); }
  // aim-assist targets
  targets() { return this.list.filter((d) => d.alive).map((d) => d.pos); }

  hit(d, dmg, p) {
    if (!d.alive) return;
    d.hp -= dmg; d.flash = 0.12;
    this.game.effects.sparks(p ? p.clone() : d.pos.clone(), new THREE.Vector3(0, 1, 0), 10);
    play('impact_metal', { pos: d.pos.clone(), gain: 0.9 });
    if (d.hp <= 0) {
      d.alive = false; d.falling = true; d.vel.set((Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4); this.killed++;
      this.game.addScore(50, 'DRONE DOWN!');
      if (this.killed === this.total) this.game.hud.toast('AIRSPACE CLEAR!', 2);
    }
  }

  update(dt) {
    const g = this.game, pl = g.player.pos;
    let buzz = 0;
    for (const d of this.list) {
      const c = d.collider;
      if (d.alive) {
        d.phase += dt;
        let target;
        if (d.mode === 'patrol') {
          d.orbit += dt * 0.12;
          const r = this.radius * (0.55 + 0.35 * Math.sin(d.phase * 0.3));
          const tx = this.center[0] + Math.cos(d.orbit) * r, tz = this.center[1] + Math.sin(d.orbit) * r;
          target = new THREE.Vector3(tx, G(tx, tz) + 13 + Math.sin(d.phase) * 3, tz);
          d.runT -= dt;
          if (d.runT <= 0 && Math.hypot(pl.x - d.pos.x, pl.z - d.pos.z) < 110) { d.mode = 'run'; d.runT = 7; }
        } else {
          // bombing run: get above the player's head and let go
          target = new THREE.Vector3(pl.x, G(pl.x, pl.z) + 7, pl.z);
          d.runT -= dt;
          if (d.hasParcel && Math.hypot(pl.x - d.pos.x, pl.z - d.pos.z) < 1.8 && Math.abs(d.pos.y - target.y) < 2.5) this.drop(d);
          if (d.runT <= 0 || !d.hasParcel) { d.mode = 'patrol'; d.runT = 5 + Math.random() * 7; if (!d.hasParcel) setTimeout(() => { d.hasParcel = true; d.parcel.visible = true; }, 6000); }
        }
        const want = target.sub(d.pos), dist = want.length(), maxV = d.mode === 'run' ? 8 : 5;
        want.multiplyScalar(Math.min(maxV, dist * 1.2) / (dist || 1));
        d.vel.lerp(want, Math.min(1, dt * 1.5));
        d.pos.addScaledVector(d.vel, dt);
        d.mesh.rotation.set(d.vel.z * 0.06, d.phase * 0.2, -d.vel.x * 0.06);
        for (const r of d.rotors) r.rotation.z += dt * 60;
        const dd = d.pos.distanceTo(pl); buzz += 1 / (1 + dd * dd / 150);
      } else if (d.falling) {
        d.vel.y -= 14 * dt; d.pos.addScaledVector(d.vel, dt); d.spin += dt * 12;
        d.mesh.rotation.set(d.spin * 0.7, d.spin, d.spin * 0.4);
        if (Math.random() < dt * 20) g.effects.puff(d.pos.clone(), new THREE.Vector3(0, 1, 0), 0x2a2a2a, 0.5, 1.5);
        const gy = G(d.pos.x, d.pos.z);
        if (d.pos.y < gy + 0.2) {
          d.falling = false; d.pos.y = gy + 0.15; d.mesh.rotation.set(0.3, d.spin, 2.9);
          g.effects.sparks(d.pos.clone(), new THREE.Vector3(0, 1, 0), 24, [1, 0.6, 0.2], 7);
          for (let k = 0; k < 4; k++) g.effects.puff(d.pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.3, (Math.random() - 0.5))), new THREE.Vector3(0, 1, 0), 0x3a3a3a, 0.8, 2.5);
          play('explosion', { pos: d.pos.clone(), gain: 0.5 });
          setTimeout(() => { g.scene.remove(d.mesh); }, 20000);
        }
      }
      d.mesh.position.copy(d.pos);
      d.flash -= dt; d.mesh.scale.setScalar(1.6 * (d.flash > 0 ? 1.12 : 1));
      if (d.alive) { const s = 0.75; c.minX = d.pos.x - s; c.maxX = d.pos.x + s; c.minZ = d.pos.z - s; c.maxZ = d.pos.z + s; c.minY = d.pos.y - 0.7; c.maxY = d.pos.y + 0.3; }
      else { c.minX = c.maxX = c.minZ = c.maxZ = 99999; }
    }
    // falling parcels
    for (const p of this.parcels) {
      if (p.done) continue;
      p.vy -= 12 * dt; p.mesh.position.y += p.vy * dt; p.mesh.rotation.x += dt * 3;
      const gy = G(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y < gy + 0.15) {
        p.done = true; p.mesh.position.y = gy + 0.12; sfx.clatter(p.mesh.position.x, gy, p.mesh.position.z, 1.2);
        g.effects.puff(p.mesh.position.clone(), new THREE.Vector3(0, 1, 0), 0xb58a58, 0.6, 1);
        if (Math.hypot(pl.x - p.mesh.position.x, pl.z - p.mesh.position.z) < 1.6 && !g.player.dead) { g.player.damage(12, 'parcel'); g.hud.toast('PARCEL DELIVERED. SIGNED FOR BY YOUR FACE.', 2); }
        setTimeout(() => g.scene.remove(p.mesh), 15000);
      }
    }
    this.setBuzz(buzz);
  }
  drop(d) {
    d.hasParcel = false; d.parcel.visible = false;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.35, 0.48), assets().box); m.position.copy(d.pos); m.position.y -= 0.5; m.castShadow = true;
    this.game.scene.add(m); this.parcels.push({ mesh: m, vy: 0 });
    this.game.hud.toast('INCOMING PARCEL!', 1);
  }
  // one shared rotor whine, louder the closer the nearest drones are
  startBuzz() {
    const ctx = getCtx(); if (!ctx) return;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(getSfxBus());
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.8; f.connect(out);
    this.osc = [175, 181.5, 352].map((hz) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(); return o; });
    this.buzzGain = out;
  }
  setBuzz(v) { if (this.buzzGain) this.buzzGain.gain.setTargetAtTime(Math.min(0.35, v * 0.25), getCtx().currentTime, 0.1); }
  dispose() {
    for (const o of this.osc || []) o.stop();
    for (const d of this.list) { const i = this.game.world.dynamic.indexOf(d.collider); if (i >= 0) this.game.world.dynamic.splice(i, 1); }
  }
}
