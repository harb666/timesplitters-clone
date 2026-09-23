// THE SCRAP BLASTER
// A junkyard hand-cannon bodged together from a scaffold pipe, a biscuit
// tin receiver, a baked-bean-can drum magazine, gaffer tape, and a rubber
// duck for a front sight. Fires a spray of 6 scrap pellets, pump action.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { sfx } from '../audio/audio.js';
import { glowTexture } from '../textures/procedural.js';

const STATS = {
  name: 'SCRAP BLASTER',
  mag: 8, reserve: 48,
  fireDelay: 0.42, reloadTime: 1.5,
  pellets: 6, spread: 0.032, range: 90,
};

function buildViewModel() {
  const gun = new THREE.Group();
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); gun.add(m); return m; };
  const teal = L(0x2f8f83), rust = L(0xa0521d), metal = L(0x6d7278), dark = L(0x2a2c2f), copper = L(0xc27a3a), wood = L(0x7a4e2a), tape = L(0x9aa0a6), red = L(0xd3302b), duck = L(0xffd21f), beak = L(0xff7a00);
  // biscuit-tin receiver
  add(new THREE.BoxGeometry(0.11, 0.11, 0.3), teal, 0, 0, 0);
  add(new THREE.BoxGeometry(0.04, 0.03, 0.06), rust, 0.056, 0.02, 0.05);   // rust patch
  add(new THREE.BoxGeometry(0.03, 0.04, 0.05), rust, -0.056, -0.02, -0.08);
  add(new THREE.BoxGeometry(0.115, 0.012, 0.31), L(0xe8d36b), 0, 0.03, 0);  // painted tin stripe
  // scaffold-pipe barrel
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), metal, 0, 0.02, -0.34, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 10), copper, 0, 0.02, -0.56, Math.PI / 2); // muzzle "brake" (a pipe fitting)
  add(new THREE.CylinderGeometry(0.036, 0.036, 0.07, 10), tape, 0, 0.02, -0.26, Math.PI / 2);  // gaffer tape
  add(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 10), tape, 0, 0.02, -0.44, Math.PI / 2);
  // bean-can drum mag
  const mag = add(new THREE.CylinderGeometry(0.065, 0.065, 0.13, 12), red, 0, -0.1, -0.08, 0, 0, Math.PI / 2);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.067, 0.067, 0.05, 12), L(0xf2efe6)); mag.add(label);
  // pump slide
  const pump = add(new THREE.BoxGeometry(0.07, 0.05, 0.14), dark, 0, -0.035, -0.3);
  // grip (wooden, slightly raked)
  add(new THREE.BoxGeometry(0.07, 0.18, 0.08), wood, 0, -0.12, 0.1, 0.3);
  add(new THREE.BoxGeometry(0.02, 0.06, 0.08), dark, 0, -0.07, 0.02); // trigger guard-ish
  // rubber duck front sight (yes, really)
  const duckBody = add(new THREE.BoxGeometry(0.05, 0.035, 0.06), duck, 0, 0.075, -0.46);
  add(new THREE.BoxGeometry(0.035, 0.035, 0.035), duck, 0, 0.105, -0.48);
  add(new THREE.BoxGeometry(0.02, 0.012, 0.025), beak, 0, 0.1, -0.505);
  add(new THREE.BoxGeometry(0.006, 0.008, 0.008), dark, 0.018, 0.112, -0.49);
  add(new THREE.BoxGeometry(0.006, 0.008, 0.008), dark, -0.018, 0.112, -0.49);
  // rear sight: a bent spoon
  add(new THREE.BoxGeometry(0.05, 0.03, 0.012), metal, 0, 0.07, 0.1);
  // hands (simple chunky gloves)
  const glove = L(0x2b2b2b);
  add(new THREE.BoxGeometry(0.1, 0.1, 0.12), glove, 0, -0.1, 0.12, 0.3);
  const leftHand = add(new THREE.BoxGeometry(0.09, 0.08, 0.12), glove, 0, -0.07, -0.3);
  // muzzle flash sprite
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  flash.position.set(0, 0.02, -0.66); flash.scale.set(0.35, 0.35, 1); gun.add(flash);
  const flash2 = new THREE.Sprite(flash.material); flash2.position.set(0, 0.02, -0.8); flash2.scale.set(0.2, 0.2, 1); gun.add(flash2);
  return { gun, mag, pump, leftHand, flash, flash2, duckBody };
}

export class ScrapBlaster {
  constructor(game) {
    this.game = game;
    this.stats = STATS;
    this.ammo = STATS.mag; this.reserve = STATS.reserve;
    this.cooldown = 0; this.reloading = 0; this.pumpT = 0; this.kick = 0; this.emptyClick = 0;
    this.vm = buildViewModel();
    this.holder = new THREE.Group();
    this.holder.add(this.vm.gun);
    this.basePos = new THREE.Vector3(0.21, -0.2, -0.6);
    this.vm.gun.scale.setScalar(0.82);
    this.sway = new THREE.Vector2();
    this.tmpDir = new THREE.Vector3(); this.tmpO = new THREE.Vector3(); this.tmpP = new THREE.Vector3(); this.tmpN = new THREE.Vector3();
    this.flashLight = new THREE.PointLight(0xffb060, 0, 14, 2);
    game.scene.add(this.flashLight);
  }

  get name() { return STATS.name; }

  tryReload() {
    if (this.reloading > 0 || this.ammo >= STATS.mag || this.reserve <= 0) return;
    this.reloading = STATS.reloadTime;
    sfx.scrapReload();
  }

  update(dt, onTarget) {
    this.cooldown -= dt; this.emptyClick -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = STATS.mag - this.ammo, take = Math.min(need, this.reserve);
        this.ammo += take; this.reserve -= take;
      }
    }
    if (input.reload) this.tryReload();
    const wantFire = input.fire || (settings.autoFire && onTarget);
    if (wantFire && this.cooldown <= 0 && this.reloading <= 0) {
      if (this.ammo > 0) this.fire();
      else if (this.emptyClick <= 0) {
        sfx.scrapEmpty(); this.emptyClick = 0.35;
        if (this.reserve > 0) this.tryReload();
        else this.game.hud.toast('OUT OF SCRAP!');
      }
    }
    this.animate(dt);
  }

  fire() {
    const g = this.game;
    this.ammo--; this.cooldown = STATS.fireDelay; this.pumpT = 0; this.kick = 1;
    g.player.recoil = 1;
    sfx.scrapShot();
    const origin = this.tmpO.copy(g.camera.position);
    const fwd = g.player.forward(new THREE.Vector3());
    // Aim assist: gently bend the shot towards a target near the crosshair.
    if (settings.aimAssist) {
      const t = g.findAimTarget(origin, fwd, 0.09);
      if (t) fwd.lerp(t.dir, 0.75).normalize();
    }
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const muzzleWorld = origin.clone().addScaledVector(fwd, 0.6).addScaledVector(right, 0.2).addScaledVector(up, -0.15);
    let soundDone = false, anyHit = false, points = 0;
    const shotEntities = new Set();
    for (let i = 0; i < STATS.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * STATS.spread * (i === 0 ? 0.2 : 1);
      const dir = this.tmpDir.copy(fwd).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const res = g.world.raycastBoxes(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, STATS.range);
      const pr = g.props.raycast(origin, dir, res.dist);
      const hitDist = pr ? pr.dist : res.dist;
      const p = this.tmpP.copy(origin).addScaledVector(dir, hitDist);
      if (i < 3) g.effects.tracer(muzzleWorld, p);
      if (pr) {
        points += g.props.hit(pr.prop, dir, 1);
        g.effects.sparks(p, this.tmpN.copy(dir).negate(), 6);
        anyHit = true;
        continue;
      }
      if (hitDist >= STATS.range) continue;
      const n = this.tmpN.set(0, 0, 0);
      if (res.normalAxis >= 0) n.setComponent(res.normalAxis, res.normalSign); else n.set(0, 1, 0);
      const box = res.box, tag = box ? box.tag : 'ground';
      if (box && box.owner && (tag === 'car' || tag === 'npc')) {
        shotEntities.add(box.owner);
        g.effects.sparks(p, n, tag === 'car' ? 10 : 4, tag === 'car' ? [1, 0.85, 0.5] : [1, 1, 1]);
        if (!soundDone) { sfx.impact(p.x, p.y, p.z, tag === 'car' ? 'metal' : 'soft'); soundDone = true; }
        anyHit = true;
        continue;
      }
      const metal = ['lamp', 'bin', 'postbox', 'pole', 'shelter', 'parked-car', 'bollard', 'barrier', 'skip', 'loo'].includes(tag);
      g.effects.sparks(p, n, metal ? 7 : 3, metal ? [1, 0.8, 0.4] : [0.9, 0.7, 0.5]);
      if (!metal) g.effects.dust(p, n);
      if (tag !== 'edge') g.effects.hole(p, n);
      if (!soundDone) { sfx.impact(p.x, p.y, p.z, metal ? 'metal' : (tag === 'tree' ? 'soft' : 'brick')); soundDone = true; }
    }
    for (const e of shotEntities) e.onShot?.();
    if (anyHit) g.hud.hitmarker();
    if (points > 0) g.addScore(points, points >= 25 ? 'CAN-TASTIC!' : 'CONE-GRATULATIONS!');
    g.onGunfire();
    // muzzle light
    this.flashLight.position.copy(muzzleWorld); this.flashLight.intensity = 30;
  }

  animate(dt) {
    const vm = this.vm, t = performance.now() / 1000;
    // flash
    const fo = Math.max(0, this.kick - 0.6) * 2.5;
    vm.flash.material.opacity = fo; vm.flash.material.rotation = Math.random() * 6;
    vm.flash.scale.setScalar(0.25 + Math.random() * 0.2);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 400);
    // recoil kick
    this.kick = Math.max(0, this.kick - dt * 5);
    // pump action after each shot
    this.pumpT += dt;
    const pumpBack = this.pumpT > 0.12 && this.pumpT < 0.34 ? Math.sin((this.pumpT - 0.12) / 0.22 * Math.PI) : 0;
    vm.pump.position.z = -0.3 + pumpBack * 0.1;
    vm.leftHand.position.z = -0.3 + pumpBack * 0.1;
    // sway from look input + bob from movement
    const p = this.game.player;
    this.sway.x += (THREE.MathUtils.clamp(-input.lookX * 0.0009, -0.04, 0.04) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(input.lookY * 0.0009, -0.04, 0.04) - this.sway.y) * Math.min(1, dt * 10);
    const hs = Math.hypot(p.vel.x, p.vel.z) / 7.4;
    const bobX = Math.sin(p.bob) * 0.012 * hs, bobY = -Math.abs(Math.cos(p.bob)) * 0.012 * hs;
    // reload: tilt the gun, drop the can, slap a new one in
    let rl = 0, magDrop = 0;
    if (this.reloading > 0) {
      const k = 1 - this.reloading / STATS.reloadTime;
      rl = Math.sin(Math.min(1, k * 1.15) * Math.PI);
      magDrop = k < 0.45 ? k / 0.45 : (k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.2));
    }
    vm.mag.position.y = -0.1 - magDrop * 0.35; vm.mag.visible = magDrop < 0.98;
    const idle = Math.sin(t * 1.6) * 0.004;
    this.holder.position.set(
      this.basePos.x + this.sway.x + bobX,
      this.basePos.y + this.sway.y + bobY + idle - rl * 0.08,
      this.basePos.z + this.kick * 0.09);
    this.holder.rotation.set(this.kick * 0.35 + rl * 0.5, 0.06 + this.sway.x * 2, rl * 0.6);
  }
}
