// Traffic AI. Cars follow real routes through the Fir Vale junction on the
// left (UK rules), queue behind each other, slow for the junction and
// bends, change gear, show off with pops & bangs, honk, and join/leave the
// map at its edges.
import * as THREE from 'three';
import { buildFalconR } from '../models/falconR.js';
import { EngineSound } from '../audio/engineSound.js';
import { groundHeight as G } from '../core/world.js';
import { sfx } from '../audio/audio.js';

const GEARS = [0, 15.5, 10.2, 7.4, 5.8, 4.8, 4.1]; // rpm per (m/s) / 10
const IDLE = 850, REDLINE = 7000;

const DRIVER_LINES = {
  shot: ['"OI! That\'s a fresh wrap, that!"', '"My insurance is ALREADY eleven grand!"', '"You\'ve scratched me alloys, you absolute WEAPON!"', '"I\'m telling me mum!"'],
  blocked: ['"Move yer feet!"', '"It\'s a ROAD, not a lounge!"', '"Some of us have a Greggs to get to!"'],
  hit: ['"You jumped out on ME, pal!"', '"That\'s coming out of your pocket!"'],
};

export class Car {
  constructor(scene, world, { net, routes, paint, plate, speedBias = 0, hud, start = 0.3, others } = {}) {
    this.scene = scene; this.world = world; this.hud = hud; this.net = net; this.routes = routes; this.others = others || [];
    const m = buildFalconR({ paint, plate });
    Object.assign(this, m);
    this.car.rotation.order = 'YXZ';
    scene.add(this.car);
    this.speedBias = speedBias;
    this.pickRoute(start);
    this.speed = 10; this.target = 13 + speedBias;
    this.gear = 2; this.rpm = 2500; this.throttle = 0.4;
    this.showOffTimer = 4 + Math.random() * 6; this.showOff = 0;
    this.bounceY = 0; this.bounceV = 0; this.pitch = 0; this.roll = 0;
    this.lastAccel = 0; this.popCooldown = 0; this.hornCooldown = 0; this.pause = 0;
    this.braking = false; this.angry = 0;
    this.collider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, tag: 'car', owner: this, rot: 1e-6, cx: 0, cz: 0, hw: 0.95, hd: 2.15, c: 1, s: 0 };
    world.dynamic.push(this.collider);
    this.engine = null;
    this.flameT = 0;
    this.radius = 2.4;
    this.x = 0; this.z = 0; this.hx = 0; this.hz = 1;
    { const p = this.sample(this.s, {}); this.heading = Math.atan2(p.tx, p.tz); }
    this.place();
  }

  // Build a drivable path from road keys ('Name#k', '~' = reversed).
  pickRoute(start = 0) {
    const keys = this.routes[(Math.random() * this.routes.length) | 0];
    const rev = Math.random() < 0.5;
    let pts = [];
    for (const k0 of keys) {
      const flip = k0.endsWith('~'), key = flip ? k0.slice(0, -1) : k0;
      const r = this.net.byKey(key); if (!r) continue;
      let seg = r.samples.map((p) => ({ x: p.x, z: p.z }));
      if (flip) seg.reverse();
      if (pts.length) seg = seg.slice(1);
      pts = pts.concat(seg);
    }
    if (rev) pts.reverse();
    let acc = 0; pts[0].s = 0;
    for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].s = acc; }
    this.path = pts; this.pathLen = acc; this.s = start * acc; this.seg = 0;
    this.lane = 2.4;
  }

  // Position on the path at arc length s, in the left-hand lane.
  sample(s, out) {
    const P = this.path;
    let i = Math.min(this.seg, P.length - 2);
    while (i > 0 && P[i].s > s) i--;
    while (i < P.length - 2 && P[i + 1].s < s) i++;
    this.seg = i;
    const a = P[i], b = P[i + 1], k = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s)));
    let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    out.x = a.x + (b.x - a.x) * k + tz * this.lane; out.z = a.z + (b.z - a.z) * k - tx * this.lane; out.tx = tx; out.tz = tz;
    return out;
  }

  place() {
    const p = this.sample(this.s, {});
    // smooth the heading so corners look like steering, not snapping
    const want = Math.atan2(p.tx, p.tz);
    let d = want - this.heading; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * 0.25;
    this.x = p.x; this.z = p.z; this.hx = Math.sin(this.heading); this.hz = Math.cos(this.heading);
  }

  startAudio() { if (!this.engine) this.engine = new EngineSound(); }


  onShot(point) {
    this.angry = 3;
    this.showOff = 2.5; // floors it out of there
    if (this.hornCooldown <= 0) { sfx.horn(this.car.position.x, 1, this.car.position.z); this.hornCooldown = 1.5; }
    if (this.hud && Math.random() < 0.6) this.hud.bubble(this, DRIVER_LINES.shot[(Math.random() * DRIVER_LINES.shot.length) | 0], 'Driver', 2.2);
  }

  update(dt, player, junction) {
    this.hornCooldown -= dt; this.popCooldown -= dt; this.angry -= dt;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) this.car.visible = true; this.updateCollider(!this.car.visible); return; }

    // --- decide what speed we want ---
    let want = this.target;
    this.showOffTimer -= dt;
    if (this.showOffTimer <= 0) { this.showOff = 2 + Math.random() * 1.5; this.showOffTimer = 9 + Math.random() * 10; }
    if (this.showOff > 0) { this.showOff -= dt; want = 22; if (this.showOff <= 0) this.liftOff = 1.2; }
    // slow for the Fir Vale junction
    if (junction) { const dj = Math.hypot(this.x - junction[0], this.z - junction[1]); if (dj < 35) want = Math.min(want, 6 + dj * 0.2); }
    // slow on tight bends ahead
    { const a = this.sample(this.s + 6, {}), b = this.sample(this.s + 14, {}); this.sample(this.s, {}); const turn = Math.abs(a.tx * b.tz - a.tz * b.tx); if (turn > 0.15) want = Math.min(want, 9); }

    // obstacle: the player in our lane ahead
    const dxp = player.pos.x - this.x, dzp = player.pos.z - this.z;
    const ahead = dxp * this.hx + dzp * this.hz, lat = Math.abs(dxp * this.hz - dzp * this.hx);
    const stopDist = 6 + this.speed * this.speed / 14;
    let blocked = false;
    if (lat < 2.3 && ahead > 0 && ahead < stopDist + 4) { blocked = true; want = Math.min(want, Math.max(0, (ahead - 5) * 0.8)); }
    // queue behind other cars
    for (const o of this.others) {
      if (o === this || !o.car.visible) continue;
      const dx = o.x - this.x, dz = o.z - this.z, fa = dx * this.hx + dz * this.hz, la = Math.abs(dx * this.hz - dz * this.hx);
      const same = o.hx * this.hx + o.hz * this.hz > 0.3;
      if (same && la < 2.5 && fa > 0 && fa < 16) want = Math.min(want, Math.max(0, (fa - 7) * 0.9));
    }
    if (blocked && this.speed < 1.5 && this.hornCooldown <= 0) {
      sfx.horn(this.car.position.x, 1, this.car.position.z); this.hornCooldown = 3 + Math.random() * 2;
      if (this.hud && Math.random() < 0.5) this.hud.bubble(this, DRIVER_LINES.blocked[(Math.random() * DRIVER_LINES.blocked.length) | 0], 'Driver', 2);
    }

    // --- longitudinal dynamics ---
    const prevSpeed = this.speed;
    const diff = want - this.speed;
    this.braking = diff < -0.5;
    if (diff > 0) { this.throttle = Math.min(1, diff / 4 + 0.25); this.speed += Math.min(diff, (this.showOff > 0 ? 7 : 3.5) * this.throttle * dt); }
    else { this.throttle = 0; this.speed += Math.max(diff, -(this.braking ? 9 : 1.5) * dt); }
    if (this.braking && this.speed > 8 && diff < -6 && Math.random() < dt * 3) this.engine?.squeal(0.5);
    this.speed = Math.max(0, this.speed);
    this.s += this.speed * dt;
    const accel = (this.speed - prevSpeed) / Math.max(dt, 1e-3);
    this.lastAccel += (accel - this.lastAccel) * Math.min(1, dt * 6);

    // --- gearbox & rpm ---
    let rpm = IDLE + this.speed * GEARS[this.gear] * 10 * (0.85 + this.throttle * 0.15);
    if (rpm > 6400 && this.gear < 6 && this.throttle > 0.1) { this.gear++; this.engine?.shift(); if (Math.random() < 0.5) this.engine?.pop(false); }
    else if (rpm < 2200 && this.gear > 1) this.gear--;
    if (this.speed < 0.5) { this.gear = 1; rpm = IDLE + this.throttle * 1500; }
    rpm = Math.min(REDLINE, rpm + (this.showOff > 0 ? 400 : 0));
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 8);

    if (this.liftOff > 0) {
      this.liftOff -= dt;
      if (this.popCooldown <= 0 && Math.random() < dt * 9) { this.engine?.pop(Math.random() < 0.3); this.popCooldown = 0.08; this.flameT = 0.08; }
    } else if (this.throttle === 0 && this.rpm > 3800 && this.popCooldown <= 0 && Math.random() < dt * 2.5) {
      this.engine?.pop(false); this.popCooldown = 0.2; this.flameT = 0.06;
    }

    // --- end of route: vanish at the map edge, come back on another road ---
    if (this.s >= this.pathLen - 2) {
      this.pickRoute(0); this.heading = Math.atan2(this.path[1].x - this.path[0].x, this.path[1].z - this.path[0].z);
      this.speed = 11; this.gear = 3; this.pause = 2 + Math.random() * 6; this.car.visible = false; this.target = 11 + Math.random() * 5 + this.speedBias;
      this.place(); this.updateCollider(true);
      return;
    }
    this.place();

    // --- suspension ---
    const k = 60, c = 9;
    const roadBump = Math.sin(this.s * 1.7) * 0.004 * this.speed + (Math.random() - 0.5) * 0.002 * this.speed;
    this.bounceV += (-k * this.bounceY - c * this.bounceV + roadBump * 60) * dt;
    this.bounceY += this.bounceV * dt;
    const targetPitch = THREE.MathUtils.clamp(-this.lastAccel * 0.012, -0.07, 0.06);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 7);

    // --- place the model ---
    const gy = G(this.x, this.z);
    const slope = (G(this.x + this.hx, this.z + this.hz) - G(this.x - this.hx, this.z - this.hz)) / 2;
    this.car.position.set(this.x, gy, this.z);
    this.car.rotation.set(-Math.atan(slope), this.heading, 0);
    this.body.position.y = this.bounceY + 0.02;
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = Math.sin(performance.now() * 0.013) * 0.004 * this.throttle;
    const spin = this.speed * dt / 0.34;
    for (const w of this.wheels) w.rotation.x += spin;

    const brakeOn = this.braking || this.speed < 0.3;
    this.brakeGlowMat.opacity = brakeOn ? 0.9 : 0;
    this.tailMat.color.setHex(brakeOn ? 0xff2211 : 0x5a0a0a);
    this.flameT -= dt;
    this.flameMat.opacity = this.flameT > 0 ? 1 : 0;
    for (const f of this.flames) { const sc = 0.4 + Math.random() * 0.5; f.scale.set(sc, sc, 1); }

    if (this.engine) {
      this.engine.setPosition(this.x - this.hx * 1.8, gy + 0.6, this.z - this.hz * 1.8);
      this.engine.update(this.rpm, this.throttle, this.speed);
    }
    this.updateCollider(false);
    this.checkPlayerHit(player, dt);
  }

  updateCollider(hidden) {
    const c = this.collider;
    if (hidden) { c.minX = c.maxX = c.minZ = c.maxZ = c.cx = c.cz = 99999; c.minY = c.maxY = -999; return; }
    const gy = G(this.x, this.z);
    c.rot = this.heading || 1e-6; c.c = Math.cos(c.rot); c.s = Math.sin(c.rot); c.cx = this.x; c.cz = this.z;
    const ex = Math.abs(c.c) * c.hw + Math.abs(c.s) * c.hd, ez = Math.abs(c.s) * c.hw + Math.abs(c.c) * c.hd;
    c.minX = this.x - ex; c.maxX = this.x + ex; c.minZ = this.z - ez; c.maxZ = this.z + ez;
    c.minY = gy; c.maxY = gy + 1.45;
  }

  checkPlayerHit(player, dt) {
    if (this.speed < 3) return;
    const dx = player.pos.x - this.x, dz = player.pos.z - this.z;
    const fwd = dx * this.hx + dz * this.hz, lat = dx * this.hz - dz * this.hx;
    const feet = player.pos.y - player.eye;
    if (feet > G(this.x, this.z) + 1.4) return; // jumped over the bonnet!
    if (Math.abs(lat) < 0.95 + player.radius + 0.05 && fwd > -2.2 && fwd < 2.2 + player.radius + 0.3) {
      const side = lat >= 0 ? 1 : -1, force = this.speed;
      // knock sideways (perpendicular) and forwards along the car's travel
      player.knock(this.hz * side * force * 0.55 + this.hx * force * 0.9, 3 + force * 0.25, -this.hx * side * force * 0.55 + this.hz * force * 0.9);
      player.damage(Math.round(8 + force * 1.6), 'car');
      this.speed *= 0.5; this.angry = 2;
      sfx.horn(this.x, 1, this.z); this.hornCooldown = 2;
      if (this.hud) this.hud.bubble(this, DRIVER_LINES.hit[(Math.random() * DRIVER_LINES.hit.length) | 0], 'Driver', 2.2);
    }
  }

  // Ray hit test against the car's rough box (for bullets).
  bulletBox() { return this.car.visible ? this.collider : null; }

  bubbleAnchor(v) { return v.set(this.x, G(this.x, this.z) + 2.2, this.z); }
}

// A parked Falcon R (no AI, no engine) — scenery you can hide behind.
export function parkedFalcon(scene, world, x, z, ry, paint, plate) {
  const m = buildFalconR({ paint, plate });
  m.car.rotation.order = 'YXZ';
  m.car.position.set(x, G(x, z), z); m.car.rotation.y = ry;
  scene.add(m.car);
  const sw = Math.abs(Math.sin(ry)) > 0.5;
  const hw = sw ? 2.15 : 0.95, hd = sw ? 0.95 : 2.15, gy = G(x, z);
  world.addBox(x - hw, x + hw, gy - 1, gy + 1.45, z - hd, z + hd, 'parked-car');
  return m;
}
