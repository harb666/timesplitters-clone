// First-person player: fast arcade movement, jumping, step-up onto kerbs,
// health + armour, knockback, head bob and footsteps.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { sfx } from '../audio/audio.js';
import { play } from '../audio/soundscape.js';

const RUN_SPEED = 7.4;      // m/s — fast, arcade feel
const SPRINT_SPEED = 10.5, ADS_SPEED = 3.8;
const ACCEL_GROUND = 60, ACCEL_AIR = 14, FRICTION = 12;
const GRAVITY = 24, JUMP_V = 8.2, STEP = 0.45;

export class Player {
  constructor(camera, world) {
    this.camera = camera; this.world = world;
    this.pos = new THREE.Vector3();        // eye position
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.65; this.radius = 0.35; this.height = 1.8;
    this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
    this.health = 100; this.armour = 25; this.maxHealth = 100;
    this.bob = 0; this.stepDist = 0; this.leftFoot = false;
    this.dead = false; this.hurtT = 0; this.shake = 0;
    this.airTime = 0; this.recoil = 0;
    this.onDamage = null; this.onDeath = null;
    this.aimAssistFactor = 1;
    this.recoilPitch = 0; this.recoilYaw = 0; // camera kick that settles back
    this.sprinting = false; this.stamina = 0; this.breathT = 0; this.breathIn = true;
    this.landed = 0; this.adsK = 0; this.surfaceAt = () => 'paving';
  }

  spawn(x, z, yaw) {
    const floor = this.world.floorAt(x, z, 100, 0);
    this.pos.set(x, floor + this.eye, z);
    this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.health = 100; this.armour = 25; this.dead = false;
  }

  // Part of the kick stays (you have to pull down), part settles back.
  addRecoil(pitch, yaw) { this.pitch += pitch * 0.35; this.yaw += yaw * 0.3; this.recoilPitch += pitch * 0.65; this.recoilYaw += yaw * 0.7; }

  knock(vx, vy, vz) { this.vel.x += vx; this.vel.y = Math.max(this.vel.y, vy); this.vel.z += vz; this.onGround = false; this.shake = 0.5; }

  damage(amount, source) {
    if (this.dead) return;
    const absorbed = Math.min(this.armour, Math.round(amount * 0.6));
    this.armour -= absorbed;
    this.health = Math.max(0, this.health - (amount - absorbed));
    this.hurtT = 0.4; this.shake = Math.max(this.shake, 0.35);
    sfx.hurt();
    this.onDamage?.(amount, source);
    if (this.health <= 0) { this.dead = true; this.onDeath?.(source); }
  }

  update(dt) {
    // ---- look ----
    const touchScale = input.isTouch ? 0.0052 : 0.0024;
    const sens = settings.sensitivity * touchScale * this.aimAssistFactor * (1 - this.adsK * 0.45);
    this.yaw -= input.lookX * sens;
    this.pitch -= input.lookY * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    if (this.dead) { this.applyCamera(dt, 0); return; }

    // ---- movement ----
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const mx = input.moveX, my = input.moveY;
    const wishX = fx * my + rx * mx, wishZ = fz * my + rz * mx;
    const wishLen = Math.min(1, Math.hypot(mx, my));
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    this.sprinting = !!input.sprint && my > 0.5 && this.onGround !== false && this.adsK < 0.3;
    const speed = this.sprinting ? SPRINT_SPEED : (RUN_SPEED + (ADS_SPEED - RUN_SPEED) * this.adsK);
    const targetX = wishX * speed, targetZ = wishZ * speed;
    if (wishLen > 0.01) {
      this.vel.x += THREE.MathUtils.clamp(targetX - this.vel.x, -accel * dt, accel * dt);
      this.vel.z += THREE.MathUtils.clamp(targetZ - this.vel.z, -accel * dt, accel * dt);
    } else if (this.onGround) {
      const f = Math.max(0, 1 - FRICTION * dt);
      this.vel.x *= f; this.vel.z *= f;
    }

    // ---- jump (with coyote time + input buffer so it feels forgiving) ----
    if (input.jump) this.jumpBuffer = 0.15;
    this.jumpBuffer -= dt; this.coyote -= dt;
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vel.y = JUMP_V; this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
      play('cloth', { gain: 0.6 }); play('breath_out', { gain: 0.25 });
    }

    this.vel.y -= GRAVITY * dt;
    let feet = this.pos.y - this.eye;
    const next = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    this.world.collideCylinder(next, this.radius, feet, this.height, STEP);
    this.pos.x = next.x; this.pos.z = next.z;
    feet += this.vel.y * dt;

    const floor = this.world.floorAt(this.pos.x, this.pos.z, Math.max(feet, this.pos.y - this.eye), STEP, this.radius * 0.5);
    const wasGround = this.onGround;
    if (feet <= floor + 0.001 || (wasGround && feet - floor < STEP && this.vel.y <= 0)) {
      if (!wasGround && this.airTime > 0.2) {
        this.landed = Math.min(6, 2 + this.airTime * 6);
        play('step_' + this.surface(), { gain: 1, rate: 0.85, jitter: 0.05, send: 0.1 }); play('cloth', { gain: 0.5 });
        if (this.airTime > 0.9) this.damage(Math.round((this.airTime - 0.9) * 40), 'fall');
      }
      feet = floor; this.vel.y = 0; this.onGround = true; this.coyote = 0.1; this.airTime = 0;
    } else {
      if (wasGround) this.coyote = 0.1;
      this.onGround = false; this.airTime += dt;
    }
    // ceilings (e.g. bus shelter roof) — keep it simple, just stop upward motion under boxes
    this.pos.y = feet + this.eye;
    if (this.pos.y < -50) this.damage(999, 'fall');

    // ---- footsteps & head bob ----
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1) {
      this.stepDist += hs * dt; this.bob += hs * dt * 1.9;
      const stride = this.sprinting ? 2.9 : 2.2;
      if (this.stepDist > stride) {
        this.stepDist = 0; this.leftFoot = !this.leftFoot;
        const k = Math.min(1.3, hs / RUN_SPEED);
        play('step_' + this.surface(), { gain: 0.35 + 0.45 * k, rate: this.leftFoot ? 1 : 0.94, jitter: 0.07, send: 0.08 });
        if (this.sprinting && Math.random() < 0.5) play('cloth', { gain: 0.25 });
      }
    } else this.bob += (Math.round(this.bob / Math.PI) * Math.PI - this.bob) * Math.min(1, dt * 8);
    // breathing: builds up while sprinting, recovers slowly
    this.stamina = Math.max(0, Math.min(1, this.stamina + (this.sprinting && hs > 5 ? dt * 0.18 : -dt * 0.09)));
    this.breathT -= dt;
    if (this.stamina > 0.3 && this.breathT <= 0) {
      play(this.breathIn ? 'breath_in' : 'breath_out', { gain: 0.15 + this.stamina * 0.3, jitter: 0.05, send: 0 });
      this.breathT = (this.breathIn ? 0.55 : 0.7) - this.stamina * 0.25; this.breathIn = !this.breathIn;
    }
    this.applyCamera(dt, hs);
  }

  applyCamera(dt, hs) {
    this.hurtT -= dt; this.shake = Math.max(0, this.shake - dt * 1.5);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const cam = this.camera;
    const bobY = Math.abs(Math.sin(this.bob)) * 0.06 * Math.min(1, hs / RUN_SPEED);
    const sh = this.shake * this.shake;
    cam.position.set(
      this.pos.x + (Math.random() - 0.5) * sh * 0.3,
      this.pos.y + bobY - 0.03 + (this.dead ? -1.2 : 0) + (Math.random() - 0.5) * sh * 0.3,
      this.pos.z + (Math.random() - 0.5) * sh * 0.3);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    // recoil kick settles back towards where you were aiming
    const rec = Math.exp(-dt / 0.22);
    this.recoilPitch *= rec; this.recoilYaw *= rec;
    cam.rotation.y = this.yaw + this.recoilYaw;
    cam.rotation.x = this.pitch + this.recoilPitch;
    cam.rotation.z = this.dead ? 0.6 : Math.sin(this.bob * 0.5) * 0.004 * hs;
  }

  surface() { return this.surfaceAt(this.pos.x, this.pos.z); }

  forward(v) { this.camera.updateMatrixWorld(); return v.set(0, 0, -1).applyQuaternion(this.camera.quaternion); }
}
