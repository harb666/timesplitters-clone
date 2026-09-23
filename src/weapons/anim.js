// Animation helpers for first-person weapons:
// - Spring3: critically-damped-ish springs for weighty recoil and sway.
// - Timeline: keyframed tracks with smooth easing for reloads/inspects.
import * as THREE from 'three';

export class Spring3 {
  constructor(stiffness = 120, damping = 14) {
    this.k = stiffness; this.c = damping;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.target = new THREE.Vector3();
  }
  impulse(x, y, z) { this.vel.x += x; this.vel.y += y; this.vel.z += z; }
  update(dt) {
    // semi-implicit Euler in two sub-steps for stability at low frame rates
    const h = dt / 2;
    for (let i = 0; i < 2; i++) {
      this.vel.x += ((this.target.x - this.pos.x) * this.k - this.vel.x * this.c) * h;
      this.vel.y += ((this.target.y - this.pos.y) * this.k - this.vel.y * this.c) * h;
      this.vel.z += ((this.target.z - this.pos.z) * this.k - this.vel.z * this.c) * h;
      this.pos.addScaledVector(this.vel, h);
    }
    return this.pos;
  }
}

export const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }, // overshoot
  snap: (t) => 1 - Math.pow(1 - t, 4),
};

// A track is a list of keys: [time, value(number|array), easing?]. Sampling
// between keys uses the easing of the destination key.
export function sample(track, t) {
  if (!track || track.length === 0) return null;
  if (t <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [t1, v1, e] = track[i];
    if (t <= t1) {
      const [t0, v0] = track[i - 1];
      const k = (ease[e || 'inOut'])((t - t0) / Math.max(1e-6, t1 - t0));
      if (typeof v0 === 'number') return v0 + (v1 - v0) * k;
      return v0.map((a, j) => a + (v1[j] - a) * k);
    }
  }
  return track[track.length - 1][1];
}

// Timeline = named tracks + timed events (sounds, spawns, ammo changes).
export class Timeline {
  constructor(duration, tracks, events = []) {
    this.duration = duration; this.tracks = tracks; this.events = events.slice().sort((a, b) => a[0] - b[0]);
    this.t = 0; this.next = 0; this.playing = false;
  }
  start() { this.t = 0; this.next = 0; this.playing = true; return this; }
  // returns true when finished this frame
  update(dt, onEvent) {
    if (!this.playing) return false;
    this.t += dt;
    while (this.next < this.events.length && this.events[this.next][0] <= this.t) { onEvent(this.events[this.next][1], this.events[this.next][2]); this.next++; }
    if (this.t >= this.duration) { this.playing = false; return true; }
    return false;
  }
  get(name, fallback) { const v = sample(this.tracks[name], this.t); return v === null ? fallback : v; }
}
