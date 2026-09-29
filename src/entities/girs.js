// GIR: little rogue robots loose on the streets. The model (src/models/gir.glb.js)
// is a rigged glTF with Idle / Walk / Run / Jump clips. Each GIR mooches about
// on his patch of pavement until he spots you (or hears gunfire), then sprints
// at you with his arms flailing, screaming, and bites your ankles. Shoot him
// and he squeals and gets knocked back; kill him and he tumbles, sparks and
// smokes, then another one turns up somewhere else a bit later.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { groundHeight as G } from '../core/world.js';
import { play } from '../audio/soundscape.js';

import GIR_GLB from '../models/gir.glb.js';                   // the model, as a script (base64 .glb)

// decode and parse as soon as the code loads (no network fetch, so no host can block it)
const MODEL = new Promise((res, rej) => {
  const bin = atob(GIR_GLB), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  new GLTFLoader().parse(u8.buffer, '', res, rej);
});
const HP = 60, RUN = 5.8, WALK = 1.1, SEE = 30, LOSE = 75, BITE = 7;
const HALF = 0.26, TALL = 0.62;          // hit box (a touch bigger than him, to be fair on a phone)
const FAR = 170;                          // beyond this he's a speck in the haze: not drawn

// The glTF uses skinned meshes rigidly weighted to one bone each. For lots of
// copies it's cheaper to parent plain meshes straight to the bones (no GPU
// skinning) and merge the pieces that share a bone and a material.
function rigidify(root) {
  root.updateMatrixWorld(true);
  const skinned = []; root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const groups = new Map(), m4 = new THREE.Matrix4();
  for (const m of skinned) {
    const bi = m.geometry.attributes.skinIndex.getX(0), bone = m.skeleton.bones[bi];
    const g = m.geometry.clone(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
    g.applyMatrix4(m4.multiplyMatrices(m.skeleton.boneInverses[bi], m.bindMatrix));
    const key = bone.uuid + m.material.uuid;
    if (!groups.has(key)) groups.set(key, { bone, mat: m.material, geos: [] });
    groups.get(key).geos.push(g);
    m.parent.remove(m);
  }
  for (const { bone, mat, geos } of groups.values()) {
    const mesh = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat);
    mesh.name = mat.name; mesh.castShadow = true; bone.add(mesh);
  }
  root.traverse((o) => { if (o.isSkinnedMesh) o.parent.remove(o); });
  return root;
}

export class Girs {
  constructor(game, map, { count = 6 } = {}) {
    this.game = game; this.map = map; this.count = count; this.list = []; this.ready = false; this.killed = 0;
    let seed = 20260929; this.R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const net = map.net, sp = map.spawn;
    this.roads = net.roads.filter((r) => (r.kind === 'r' || r.kind === 'b' || r.kind === 'a') && r.length > 16);
    this.load = MODEL.then((gltf) => {
      this.template = rigidify(gltf.scene); this.clips = gltf.animations;
      const used = [];
      // the first one just up the street from where you start, the rest further out
      for (let i = 0; i < count; i++) { const p = i === 0 ? this.ahead(sp) : this.spot(sp.x, sp.z, 35, 200, used); if (p) { used.push(p); this.spawn(p); } }
      this.ready = true;
    }).catch((e) => { console.warn('GIR model failed to load', e); this.game.hud?.toast('GIR failed to load: ' + (e && e.message || e), 6); });
  }

  // a pavement spot rMin..rMax from (x,z), not too close to other GIRs
  spot(x, z, rMin, rMax, used = []) {
    const R = this.R, net = this.map.net, q = {};
    for (let t = 0; t < 80; t++) {
      const r = this.roads[(R() * this.roads.length) | 0], s = 3 + R() * (r.length - 6);
      net.pointAt(r, s, (R() < 0.5 ? -1 : 1) * (r.half + 1.1), q);
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < rMin || d > rMax || used.some((u) => Math.hypot(u.x - q.x, u.z - q.z) < 30)) continue;
      const probe = { x: q.x, z: q.z };
      if (this.game.world.collideCylinder(probe, 0.4, G(q.x, q.z), TALL, 0.35)) continue;   // in or against something
      return { x: q.x, z: q.z };
    }
    return null;
  }

  // clear ground in front of the player's start, so you meet one straight away
  ahead(sp) {
    const fx = -Math.sin(sp.yaw), fz = -Math.cos(sp.yaw), rx = -fz, rz = fx;
    for (const d of [20, 16, 24, 28, 12]) for (const o of [0, 2, -2, 4, -4]) {
      const probe = { x: sp.x + fx * d + rx * o, z: sp.z + fz * d + rz * o }, x = probe.x, z = probe.z;
      if (!this.game.world.collideCylinder(probe, 0.4, G(x, z), TALL, 0.35)) return { x, z };
    }
    return this.spot(sp.x, sp.z, 12, 40);
  }

  spawn(p) {
    const root = this.template.clone(true);
    // own copies of the materials so a hit can flash just this one
    const mats = new Map();
    root.traverse((o) => { if (o.isMesh) { if (!mats.has(o.material)) mats.set(o.material, o.material.clone()); o.material = mats.get(o.material); } });
    const body = [...mats.values()].find((m) => m.name === 'GIR_Metal');
    const mixer = new THREE.AnimationMixer(root), act = {};
    for (const c of this.clips) act[c.name] = mixer.clipAction(c);
    for (const k of ['Idle', 'Walk', 'Run']) { act[k].play(); act[k].setEffectiveWeight(k === 'Idle' ? 1 : 0); }
    act.Idle.time = this.R() * 2;
    const y = G(p.x, p.z);
    const g = {
      root, mixer, act, body, head: root.getObjectByName('Head'), hips: root.getObjectByName('Hips'),
      pos: new THREE.Vector3(p.x, y, p.z), vel: new THREE.Vector3(), yaw: this.R() * 6.28, home: { x: p.x, z: p.z },
      hp: HP, state: 'idle', t: 1 + this.R() * 3, target: null, biteT: 0, flash: 0, flinch: 0, noiseT: 0, hop: 0,
      w: { Idle: 1, Walk: 0, Run: 0 }, spin: new THREE.Vector3(), deadT: 0,
    };
    g.collider = { minX: 1e5, maxX: 1e5, minY: 0, maxY: 0, minZ: 1e5, maxZ: 1e5, tag: 'gir', ghost: true, owner: { onShot: (pt, dmg) => this.hit(g, dmg ?? 34, pt) } };
    this.game.world.dynamic.push(g.collider);
    root.position.copy(g.pos); root.rotation.y = g.yaw;
    this.game.scene.add(root); this.list.push(g);
    return g;
  }

  // aim-assist targets (chest height)
  targets() { return this.list.filter((g) => g.state !== 'dead' && g.root.visible).map((g) => g.pos.clone().setY(g.pos.y + 0.32)); }

  onLoudNoise(x, z) {
    for (const g of this.list) if (g.state !== 'dead' && g.state !== 'chase' && Math.hypot(g.pos.x - x, g.pos.z - z) < 60) this.alert(g);
  }
  alert(g) {
    if (g.state === 'chase') return;
    g.state = 'chase'; g.t = 0;
    play('gir_scream', { pos: g.pos.clone().setY(g.pos.y + 0.4), gain: 0.9, rolloff: 0.8 });
  }

  hit(g, dmg, pt) {
    if (g.state === 'dead') return;
    const fx = this.game.effects, pl = this.game.player.pos;
    g.hp -= dmg; g.flash = 0.09;
    fx.sparks(pt ? pt.clone() : g.pos.clone().setY(g.pos.y + 0.3), new THREE.Vector3(0, 1, 0), 8);
    play('impact_metal', { pos: g.pos.clone(), gain: 0.8 });
    // knocked back away from the shooter, head snaps back
    const dx = g.pos.x - pl.x, dz = g.pos.z - pl.z, d = Math.hypot(dx, dz) || 1;
    if (g.hp <= 0) return this.die(g, dx / d, dz / d);
    g.vel.x += dx / d * 3.2; g.vel.z += dz / d * 3.2; g.flinch = 1;
    play('gir_squeal', { pos: g.pos.clone().setY(g.pos.y + 0.4), gain: 0.8 });
    this.alert(g); g.t = Math.min(g.t, -0.25);          // a short stagger before he's back on it
  }

  die(g, nx, nz) {
    g.state = 'dead'; g.deadT = 0; this.killed++; g.flash = 0; if (g.body) g.body.emissive.setScalar(0);
    g.vel.set(nx * 3.5, 4.2, nz * 3.5); g.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
    for (const k of ['Idle', 'Walk', 'Run']) g.act[k].setEffectiveWeight(0);
    g.act.Jump.reset().setLoop(THREE.LoopOnce, 1); g.act.Jump.clampWhenFinished = true; g.act.Jump.setEffectiveWeight(1).play();
    play('gir_scream', { pos: g.pos.clone().setY(g.pos.y + 0.4), gain: 1.1, rate: 1.15, rolloff: 0.8 });
    const c = g.collider; c.minX = c.maxX = c.minZ = c.maxZ = 1e5;
    this.game.addScore(75, 'GIR DOWN!');
    // straight away another one turns up down the street and comes for you
    const P = this.game.player.pos, alive = this.list.filter((o) => o.state !== 'dead').map((o) => o.pos);
    const p = this.spot(P.x, P.z, 25, 60, alive) || this.spot(P.x, P.z, 25, 120, alive);
    if (p) { const n = this.spawn(p); this.alert(n); n.t = -0.6; }
  }

  // one-off burst when a dead GIR hits the ground
  crash(g) {
    const fx = this.game.effects, p = g.pos.clone().setY(g.pos.y + 0.2), up = new THREE.Vector3(0, 1, 0);
    fx.sparks(p, up, 26, [0.4, 1, 0.95], 6);
    fx.sparks(p, up, 14, [1, 0.7, 0.3], 4);
    for (let k = 0; k < 4; k++) fx.puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4)), up, 0x2e3032, 0.35, 2.4);
    play('explosion', { pos: p, gain: 0.25, rate: 1.6 });
    play('impact_metal', { pos: p, gain: 1 });
    // the eyes and chest light go dark
    g.root.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissiveIntensity = 0.05; });
  }

  update(dt) {
    if (!this.ready) return;
    const game = this.game, world = game.world, pl = game.player, P = pl.pos;
    for (const g of this.list) {
      const dx = P.x - g.pos.x, dz = P.z - g.pos.z, dist = Math.hypot(dx, dz);
      g.root.visible = dist < FAR || g.state === 'chase';
      if (g.state === 'dead') { this.updateDead(g, dt, dist); continue; }
      g.t += dt;
      let speed = 0, face = null;
      if (g.state === 'chase') {
        if (dist > LOSE || pl.dead) { g.state = 'idle'; g.t = 0; g.home = { x: g.pos.x, z: g.pos.z }; }
        else if (g.t >= 0) {
          face = Math.atan2(dx, dz);
          if (dist > 0.75) speed = RUN * Math.min(1, 0.35 + g.t * 1.5);
          g.biteT -= dt;
          if (dist < 0.95 && g.biteT <= 0 && Math.abs(P.y - g.pos.y) < 2) {
            g.biteT = 0.75; g.hop = 1;
            pl.damage(BITE, 'gir');
            play(Math.random() < 0.5 ? 'gir_giggle' : 'gir_squeal', { pos: g.pos.clone().setY(g.pos.y + 0.4), gain: 0.8 });
          }
          g.noiseT -= dt;
          if (g.noiseT <= 0) { g.noiseT = 2.5 + Math.random() * 3; play(Math.random() < 0.6 ? 'gir_scream' : 'gir_giggle', { pos: g.pos.clone().setY(g.pos.y + 0.4), gain: 0.7, rolloff: 0.9 }); }
        }
      } else {
        if (dist < SEE && !pl.dead) this.alert(g);
        else if (g.state === 'idle' && g.t > 0) {
          g.state = 'wander'; const a = Math.random() * 6.28, r = 1.5 + Math.random() * 5;
          g.target = { x: g.home.x + Math.cos(a) * r, z: g.home.z + Math.sin(a) * r };
        } else if (g.state === 'wander') {
          const tx = g.target.x - g.pos.x, tz = g.target.z - g.pos.z, td = Math.hypot(tx, tz);
          if (td < 0.3 || g.t > 8) { g.state = 'idle'; g.t = -(1.5 + Math.random() * 4); }
          else { speed = WALK; face = Math.atan2(tx, tz); }
        }
      }
      // turn, move, collide, stand on the ground
      if (face !== null) { let d = face - g.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); g.yaw += d * Math.min(1, dt * (g.state === 'chase' ? 10 : 4)); }
      g.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      g.pos.x += (Math.sin(g.yaw) * speed + g.vel.x) * dt; g.pos.z += (Math.cos(g.yaw) * speed + g.vel.z) * dt;
      if (dist < 90) {
        world.collideCylinder(g.pos, 0.18, g.pos.y, TALL, 0.35);
        g.pos.y = world.floorAt(g.pos.x, g.pos.z, g.pos.y + 0.35, 0.35, 0.1);
      } else g.pos.y = G(g.pos.x, g.pos.z);
      // blend walk / run / idle
      const want = speed > 3 ? 'Run' : speed > 0.2 ? 'Walk' : 'Idle';
      for (const k of ['Idle', 'Walk', 'Run']) {
        g.w[k] += ((k === want ? 1 : 0) - g.w[k]) * Math.min(1, dt * 8);
        g.act[k].setEffectiveWeight(g.w[k]);
      }
      g.act.Run.timeScale = 0.6 + speed / RUN * 0.6; g.act.Walk.timeScale = 1.2;
      // hit reaction: lean back and recover; bite: a little hop
      g.flinch = Math.max(0, g.flinch - dt * 4); g.hop = Math.max(0, g.hop - dt * 3.5);
      if (dist < 110) {
        g.mixer.update(dt);
        if (g.flinch > 0) { g.hips.rotation.x -= g.flinch * 0.6; g.head.rotation.x -= g.flinch * 0.4; }
      }
      g.root.position.set(g.pos.x, g.pos.y + Math.sin(g.hop * Math.PI) * 0.18, g.pos.z);
      g.root.rotation.set(0, g.yaw, 0);
      g.flash -= dt; if (g.body) g.body.emissive.setScalar(g.flash > 0 ? 0.6 : 0);
      const c = g.collider;
      c.minX = g.pos.x - HALF; c.maxX = g.pos.x + HALF; c.minZ = g.pos.z - HALF; c.maxZ = g.pos.z + HALF; c.minY = g.pos.y; c.maxY = g.pos.y + TALL;
    }
  }

  updateDead(g, dt, dist) {
    g.deadT += dt;
    if (g.vel.y !== 0 || g.pos.y > G(g.pos.x, g.pos.z) + 0.01) {
      g.vel.y -= 14 * dt; g.pos.addScaledVector(g.vel, dt);
      g.root.rotation.x += g.spin.x * dt; g.root.rotation.y += g.spin.y * dt; g.root.rotation.z += g.spin.z * dt;
      if (Math.random() < dt * 25) this.game.effects.puff(g.pos.clone().setY(g.pos.y + 0.3), new THREE.Vector3(0, 1, 0), 0x3a3a3a, 0.2, 1.2);
      const gy = G(g.pos.x, g.pos.z);
      if (g.pos.y <= gy && g.vel.y < 0) {
        g.pos.y = gy; g.vel.set(0, 0, 0);
        // lie on his back or side
        g.root.rotation.set(Math.random() < 0.5 ? -1.45 : 0, g.root.rotation.y, Math.random() < 0.5 ? 1.5 : 0);
        this.crash(g);
      }
    } else if (g.deadT > 3 && g.deadT < 9 && Math.random() < dt * 3) {
      this.game.effects.puff(g.pos.clone().setY(g.pos.y + 0.15), new THREE.Vector3(0, 1, 0), 0x333333, 0.2, 2);   // smouldering
    }
    g.mixer.update(dt);
    g.root.position.copy(g.pos);
    if (g.deadT > 12) g.root.position.y -= (g.deadT - 12) * 0.25;            // sinks away
    if (g.deadT > 14) {
      this.game.scene.remove(g.root);
      const i = this.game.world.dynamic.indexOf(g.collider); if (i >= 0) this.game.world.dynamic.splice(i, 1);
      this.list.splice(this.list.indexOf(g), 1);
    }
  }
}
