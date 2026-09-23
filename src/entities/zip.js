// ZIP — Fir Vale's fastest resident (sorry, Dez). An original creature: a
// small, lanky, electric-blue hare-fox with enormous floppy ears, round
// aviator goggles, a long mustard scarf that streams out behind, a fluffy
// tail with a glowing teal tip, and a samosa habit. Leaves a teal streak.
// Runs the real streets between hiding spots and waits there, taunting,
// until you catch up.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { babble } from '../audio/audio.js';

const VOICE = { pitch: 330, speed: 1.4, gain: 0.5 };
const TAUNTS = [
  'Zippety-zip! Too slow, big boots!',
  'Samosas are the fastest fuel known to science!',
  'You run like a wheelie bin on a Tuesday!',
  'Catch me if you — nope, you can\'t. Bye!',
  'I\'ve done three laps of Sheffield since you blinked!',
];
const CAUGHT = [
  'Hey! No fair! I was stretching!',
  'Okay okay, that one counts. Just about.',
  'Right, that\'s it — I\'m going SLIGHTLY faster now.',
];

function buildZip() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d6fe0, roughness: 0.55 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xcfe4ff, roughness: 0.6 });
  const scarfM = new THREE.MeshStandardMaterial({ color: 0xe0a91c, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.4 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x2de0d0, emissive: 0x0a5a55, roughness: 0.1, metalness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x5ff5e8 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6 });
  const add = (geo, m, x, y, z, parent = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  add(new THREE.SphereGeometry(0.2, 14, 10).scale(0.85, 1.15, 0.9), blue, 0, 0.55, 0);             // body
  add(new THREE.SphereGeometry(0.14, 12, 8).scale(0.8, 1, 0.6), belly, 0, 0.52, 0.09);              // belly
  const head = new THREE.Group(); head.position.set(0, 0.86, 0.04); body.add(head);
  add(new THREE.SphereGeometry(0.17, 16, 12).scale(1, 0.95, 1.05), blue, 0, 0, 0, head);
  add(new THREE.SphereGeometry(0.09, 12, 8).scale(1, 0.75, 1.1), belly, 0, -0.05, 0.13, head);       // muzzle
  add(new THREE.SphereGeometry(0.025, 8, 6), dark, 0, -0.02, 0.23, head);                            // nose
  for (const sx of [-1, 1]) {
    add(new THREE.TorusGeometry(0.05, 0.015, 8, 16), dark, sx * 0.065, 0.05, 0.14, head);           // goggles
    add(new THREE.CircleGeometry(0.045, 16), lens, sx * 0.065, 0.05, 0.148, head);
    const ear = new THREE.Group(); ear.position.set(sx * 0.08, 0.12, -0.02); ear.rotation.z = -sx * 0.35; head.add(ear);
    add(new THREE.SphereGeometry(0.06, 10, 8).scale(0.6, 3.4, 0.35), blue, 0, 0.2, 0, ear);
    add(new THREE.SphereGeometry(0.04, 8, 6).scale(0.5, 3.2, 0.2), belly, 0, 0.19, 0.018, ear);
  }
  add(new THREE.BoxGeometry(0.34, 0.02, 0.03), dark, 0, 0.05, -0.02, head).rotation.x = 0;          // goggle strap
  // scarf: collar + two streaming tails
  add(new THREE.TorusGeometry(0.13, 0.04, 8, 16).rotateX(Math.PI / 2), scarfM, 0, 0.72, 0);
  const scarf = [];
  for (let i = 0; i < 6; i++) { const s = add(new THREE.BoxGeometry(0.09, 0.02, 0.12), scarfM, 0.05, 0.72, -0.15 - i * 0.11); scarf.push(s); }
  // arms, legs (with trainers), tail
  const limbs = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.16, 0.66, 0); body.add(arm);
    add(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), blue, 0, -0.1, 0, arm);
    const leg = new THREE.Group(); leg.position.set(sx * 0.09, 0.4, 0); body.add(leg);
    add(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), blue, 0, -0.16, 0, leg);
    add(new THREE.BoxGeometry(0.1, 0.07, 0.2), shoe, 0, -0.34, 0.04, leg);
    add(new THREE.BoxGeometry(0.105, 0.02, 0.21), dark, 0, -0.37, 0.04, leg);
    limbs.push(arm, leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.45, -0.16); body.add(tail);
  add(new THREE.SphereGeometry(0.1, 10, 8).scale(0.8, 0.8, 2.2), blue, 0, 0.05, -0.18, tail);
  add(new THREE.SphereGeometry(0.075, 10, 8).scale(0.9, 0.9, 1.3), glow, 0, 0.08, -0.42, tail);
  root.scale.setScalar(1.25);
  return { root, body, head, limbs, tail, scarf };
}

export class Zip {
  constructor(scene, hud, route, stops) {
    this.scene = scene; this.hud = hud;
    this.m = buildZip(); scene.add(this.m.root);
    this.path = route; this.cum = [0];
    for (let i = 1; i < route.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.stops = stops.map((f) => f * this.len);       // arc lengths where Zip waits
    this.stop = 0; this.s = 0; this.state = 'wait'; this.tags = 0; this.t = 0;
    this.x = route[0][0]; this.z = route[0][1]; this.heading = 0; this.speed = 0;
    this.say(TAUNTS[0], 3);
    // teal speed streak
    this.trailN = 40; this.trail = [];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 2 * 3), 3));
    const idx = []; for (let i = 0; i < this.trailN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.trailMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3ff0e0, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.trailMesh.frustumCulled = false; scene.add(this.trailMesh);
    this.place();
  }
  say(text, dur = 2.5) { this.hud.bubble(this, text, 'Zip', dur); babble(VOICE, text, this.x, G(this.x, this.z) + 1, this.z); }
  bubbleAnchor(v) { return v.set(this.x, G(this.x, this.z) + 1.8, this.z); }
  at(s) {
    let i = 0; while (i < this.path.length - 2 && this.cum[i + 1] < s) i++;
    const [ax, az] = this.path[i], [bx, bz] = this.path[i + 1], L = this.cum[i + 1] - this.cum[i] || 1, k = Math.max(0, Math.min(1, (s - this.cum[i]) / L));
    return [ax + (bx - ax) * k, az + (bz - az) * k, (bx - ax) / L, (bz - az) / L];
  }
  get done() { return this.state === 'gone'; }
  update(dt, player) {
    this.t += dt;
    const d = Math.hypot(player.pos.x - this.x, player.pos.z - this.z);
    if (this.state === 'wait') {
      this.speed = 0;
      this.heading = Math.atan2(player.pos.x - this.x, player.pos.z - this.z);
      if (d < 22 && Math.random() < dt * 0.25) this.say(TAUNTS[(Math.random() * TAUNTS.length) | 0], 2.2);
      if (d < 3.2) {
        this.tags++;
        if (this.stop >= this.stops.length - 1) { this.state = 'escape'; this.say('FINE! Have your samosas back! …Minus one. Or four. Zippety-ZIP!', 4); }
        else { this.state = 'run'; this.stop++; this.say(CAUGHT[(this.tags - 1) % CAUGHT.length], 2.2); }
      }
    } else if (this.state === 'run' || this.state === 'escape') {
      this.speed = Math.min(15, this.speed + dt * 30);
      this.s += this.speed * dt;
      const target = this.state === 'escape' ? this.len : this.stops[this.stop];
      if (this.state === 'run' && this.s >= target) { this.s = target; this.state = 'wait'; }
      if (this.state === 'escape' && this.s >= this.len - 0.5) { this.state = 'gone'; this.m.root.visible = false; }
      const [x, z, tx, tz] = this.at(this.s); this.x = x; this.z = z; this.heading = Math.atan2(tx, tz);
    }
    this.place(dt);
  }
  place(dt = 0) {
    const m = this.m, y = G(this.x, this.z) + 0.15;
    m.root.position.set(this.x, y + (this.state === 'wait' ? Math.abs(Math.sin(this.t * 6)) * 0.12 : 0), this.z);
    m.root.rotation.y = this.heading;
    const run = this.speed > 1 ? 1 : 0, ph = this.t * (run ? 26 : 3);
    m.body.rotation.x = run ? 0.45 : 0;
    m.limbs.forEach((l, i) => { l.rotation.x = run ? Math.sin(ph + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI : 0)) * 1.3 : Math.sin(ph + i) * 0.1; });
    m.tail.rotation.y = Math.sin(this.t * (run ? 20 : 5)) * 0.4; m.tail.rotation.x = run ? -0.6 : 0.2;
    m.scarf.forEach((s, i) => { s.position.y = 0.72 + Math.sin(this.t * 14 - i) * 0.02 * (i + 1) + (run ? 0.03 * i : -0.06 * i); });
    m.head.rotation.z = this.state === 'wait' ? Math.sin(this.t * 3) * 0.15 : 0;
    // streak
    this.trail.unshift([this.x, y + 0.6, this.z]); if (this.trail.length > this.trailN) this.trail.pop();
    const pos = this.trailMesh.geometry.attributes.position;
    for (let i = 0; i < this.trailN; i++) {
      const p = this.trail[Math.min(i, this.trail.length - 1)], w = run ? 0.28 * (1 - i / this.trailN) : 0;
      pos.setXYZ(i * 2, p[0], p[1] - w, p[2]); pos.setXYZ(i * 2 + 1, p[0], p[1] + w, p[2]);
    }
    pos.needsUpdate = true;
    this.trailMesh.visible = m.root.visible;
  }
  dispose() { this.scene.remove(this.m.root); this.scene.remove(this.trailMesh); }
}
