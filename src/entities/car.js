// Traffic AI for the Falcon R. Drives up and down Barnsley Road on the
// left (UK rules), changes gear, shows off with pops & bangs, stops for
// people on the zebra crossing, honks, and swaps lanes out of sight in the fog.
import * as THREE from 'three';
import { buildFalconR } from '../models/falconR.js';
import { EngineSound } from '../audio/engineSound.js';
import { groundHeight as G } from '../core/world.js';
import { LANES, ROAD } from '../maps/firVale.js';
import { sfx } from '../audio/audio.js';

const GEARS = [0, 15.5, 10.2, 7.4, 5.8, 4.8, 4.1]; // rpm per (m/s) / 10
const IDLE = 850, REDLINE = 7000;

const DRIVER_LINES = {
  shot: ['"OI! That\'s a fresh wrap, that!"', '"My insurance is ALREADY eleven grand!"', '"You\'ve scratched me alloys, you absolute WEAPON!"', '"I\'m telling me mum!"'],
  blocked: ['"Move yer feet!"', '"It\'s a ROAD, not a lounge!"', '"Some of us have a Greggs to get to!"'],
  hit: ['"You jumped out on ME, pal!"', '"That\'s coming out of your pocket!"'],
};

export class Car {
  constructor(scene, world, { lane = 'south', z = -60, paint, plate, speedBias = 0, hud } = {}) {
    this.scene = scene; this.world = world; this.hud = hud;
    const m = buildFalconR({ paint, plate });
    Object.assign(this, m);
    this.car.rotation.order = 'YXZ';
    scene.add(this.car);
    this.lane = lane;
    this.dir = lane === 'south' ? 1 : -1;
    this.x = LANES[lane]; this.z = z;
    this.speed = 10; this.target = 14 + speedBias;
    this.gear = 2; this.rpm = 2500; this.throttle = 0.4;
    this.showOffTimer = 4 + Math.random() * 6; this.showOff = 0;
    this.bounceY = 0; this.bounceV = 0; this.pitch = 0; this.roll = 0;
    this.lastAccel = 0; this.popCooldown = 0; this.hornCooldown = 0; this.pause = 0;
    this.braking = false; this.angry = 0;
    this.collider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, tag: 'car', owner: this };
    world.dynamic.push(this.collider);
    this.engine = null;
    this.flameT = 0;
    this.radius = 2.4;
  }

  startAudio() { if (!this.engine) this.engine = new EngineSound(); }

  get heading() { return this.dir > 0 ? 0 : Math.PI; }

  onShot(point) {
    this.angry = 3;
    this.showOff = 2.5; // floors it out of there
    if (this.hornCooldown <= 0) { sfx.horn(this.car.position.x, 1, this.car.position.z); this.hornCooldown = 1.5; }
    if (this.hud && Math.random() < 0.6) this.hud.bubble(this, DRIVER_LINES.shot[(Math.random() * DRIVER_LINES.shot.length) | 0], 'Falcon R driver', 2.2);
  }

  update(dt, player) {
    this.hornCooldown -= dt; this.popCooldown -= dt; this.angry -= dt;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) this.car.visible = true; return; }

    // --- decide what speed we want ---
    let want = this.target;
    this.showOffTimer -= dt;
    if (this.showOffTimer <= 0) { this.showOff = 2 + Math.random() * 1.5; this.showOffTimer = 9 + Math.random() * 10; }
    if (this.showOff > 0) { this.showOff -= dt; want = 24; if (this.showOff <= 0) this.liftOff = 1.2; }

    // obstacle: the player standing in our lane ahead
    const dx = player.pos.x - this.x, dz = (player.pos.z - this.z) * this.dir;
    const inLane = Math.abs(dx) < 2.3;
    const stopDist = 6 + this.speed * this.speed / 14;
    let blocked = false;
    if (inLane && dz > 0 && dz < stopDist + 4) { blocked = true; want = Math.min(want, Math.max(0, (dz - 5) * 0.8)); }
    // zebra crossing: wait if someone's on it
    const zebraAhead = (15 - this.z) * this.dir;
    const onZebra = player.pos.z > 11 && player.pos.z < 19 && Math.abs(player.pos.x) < ROAD.halfWidth + 1.2;
    if (onZebra && zebraAhead > 3 && zebraAhead < 30) want = Math.min(want, Math.max(0, (zebraAhead - 6) * 0.7));
    if (blocked && this.speed < 1.5 && this.hornCooldown <= 0) {
      sfx.horn(this.car.position.x, 1, this.car.position.z); this.hornCooldown = 3 + Math.random() * 2;
      if (this.hud && Math.random() < 0.5) this.hud.bubble(this, DRIVER_LINES.blocked[(Math.random() * DRIVER_LINES.blocked.length) | 0], 'Falcon R driver', 2);
    }

    // --- longitudinal dynamics ---
    const prevSpeed = this.speed;
    const diff = want - this.speed;
    this.braking = diff < -0.5;
    if (diff > 0) { this.throttle = Math.min(1, diff / 4 + 0.25); this.speed += Math.min(diff, (this.showOff > 0 ? 7 : 3.5) * this.throttle * dt); }
    else { this.throttle = 0; this.speed += Math.max(diff, -(this.braking ? 9 : 1.5) * dt); }
    if (this.braking && this.speed > 8 && diff < -6 && Math.random() < dt * 3) this.engine?.squeal(0.5);
    this.speed = Math.max(0, this.speed);
    this.z += this.speed * this.dir * dt;
    const accel = (this.speed - prevSpeed) / Math.max(dt, 1e-3);
    this.lastAccel += (accel - this.lastAccel) * Math.min(1, dt * 6);

    // --- gearbox & rpm ---
    let rpm = IDLE + this.speed * GEARS[this.gear] * 10 * (0.85 + this.throttle * 0.15);
    if (rpm > 6400 && this.gear < 6 && this.throttle > 0.1) { this.gear++; this.engine?.shift(); if (Math.random() < 0.5) this.engine?.pop(false); }
    else if (rpm < 2200 && this.gear > 1) this.gear--;
    if (this.speed < 0.5) { this.gear = 1; rpm = IDLE + this.throttle * 1500; }
    rpm = Math.min(REDLINE, rpm + (this.showOff > 0 ? 400 : 0));
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 8);

    // pops & bangs when lifting off at high revs
    if (this.liftOff > 0) {
      this.liftOff -= dt;
      if (this.popCooldown <= 0 && Math.random() < dt * 9) { this.engine?.pop(Math.random() < 0.3); this.popCooldown = 0.08; this.flameT = 0.08; }
    } else if (this.throttle === 0 && this.rpm > 3800 && this.popCooldown <= 0 && Math.random() < dt * 2.5) {
      this.engine?.pop(false); this.popCooldown = 0.2; this.flameT = 0.06;
    }

    // --- off the end of the road: wait in the fog, swap lanes ---
    if (this.z > ROAD.zMax - 6 || this.z < ROAD.zMin + 6) {
      this.dir *= -1; this.lane = this.dir > 0 ? 'south' : 'north'; this.x = LANES[this.lane];
      this.z = this.dir > 0 ? ROAD.zMin + 8 : ROAD.zMax - 8;
      this.speed = 12; this.gear = 3;
      this.pause = 2 + Math.random() * 6; this.car.visible = false;
      this.target = 12 + Math.random() * 6;
      this.updateCollider(true);
      return;
    }

    // --- suspension: pitch from accel, bounce from road ---
    const k = 60, c = 9;
    const roadBump = Math.sin(this.z * 1.7) * 0.004 * this.speed + (Math.random() - 0.5) * 0.002 * this.speed;
    this.bounceV += (-k * this.bounceY - c * this.bounceV + roadBump * 60) * dt;
    this.bounceY += this.bounceV * dt;
    const targetPitch = THREE.MathUtils.clamp(-this.lastAccel * 0.012, -0.07, 0.06);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 7);

    // --- place the model ---
    const gy = G(this.x, this.z);
    const slope = (G(this.x, this.z + this.dir) - G(this.x, this.z - this.dir)) / 2;
    this.car.position.set(this.x, gy, this.z);
    this.car.rotation.set(-Math.atan(slope), this.heading, 0);
    this.body.position.y = this.bounceY + 0.02;
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = Math.sin(performance.now() * 0.013) * 0.004 * this.throttle; // engine shake
    const spin = this.speed * dt / 0.34;
    for (const w of this.wheels) w.rotation.x += spin;

    // lights
    const brakeOn = this.braking || this.speed < 0.3;
    this.brakeGlowMat.opacity = brakeOn ? 0.9 : 0;
    this.tailMat.color.setHex(brakeOn ? 0xff2211 : 0x5a0a0a);
    this.flameT -= dt;
    this.flameMat.opacity = this.flameT > 0 ? 1 : 0;
    for (const f of this.flames) { const s = 0.4 + Math.random() * 0.5; f.scale.set(s, s, 1); }

    // audio
    if (this.engine) {
      this.engine.setPosition(this.x, gy + 0.6, this.z - this.dir * 1.8);
      this.engine.update(this.rpm, this.throttle, this.speed);
    }

    this.updateCollider(false);
    this.checkPlayerHit(player, dt);
  }

  updateCollider(hidden) {
    const c = this.collider;
    if (hidden) { c.minX = c.maxX = c.minZ = c.maxZ = 99999; c.minY = c.maxY = -999; return; }
    const gy = G(this.x, this.z);
    c.minX = this.x - 0.95; c.maxX = this.x + 0.95; c.minZ = this.z - 2.15; c.maxZ = this.z + 2.15;
    c.minY = gy; c.maxY = gy + 1.45;
  }

  checkPlayerHit(player, dt) {
    if (this.speed < 3) return;
    const dx = player.pos.x - this.x, dz = (player.pos.z - this.z) * this.dir;
    const feet = player.pos.y - player.eye;
    if (feet > G(this.x, this.z) + 1.4) return; // jumped over the bonnet!
    if (Math.abs(dx) < 0.95 + player.radius + 0.05 && dz > -2.2 && dz < 2.2 + player.radius + 0.3) {
      const side = dx >= 0 ? 1 : -1;
      const force = this.speed;
      player.knock(side * force * 0.55, 3 + force * 0.25, this.dir * force * 0.9);
      player.damage(Math.round(8 + force * 1.6), 'car');
      this.speed *= 0.5; this.pause = 0; this.angry = 2;
      sfx.horn(this.x, 1, this.z); this.hornCooldown = 2;
      if (this.hud) this.hud.bubble(this, DRIVER_LINES.hit[(Math.random() * DRIVER_LINES.hit.length) | 0], 'Falcon R driver', 2.2);
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
