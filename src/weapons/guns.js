// The two weapons, with their mechanical animation choreography.
import * as THREE from 'three';
import { FPWeapon } from './fpWeapon.js';
import { Timeline, sample } from './anim.js';
import { buildAK } from './models/ak.js';
import { buildRevolver, buildSpeedloader } from './models/revolver.js';
import { mech, playerShot } from '../audio/soundscape.js';

const R = () => Math.random() - 0.5;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// =====================================================================
// VK-9 KESTREL — AK-pattern rifle, 7.62 x 39-style, 600 rpm full auto.
// =====================================================================
export class Kestrel extends FPWeapon {
  constructor(game, M) {
    const model = buildAK(M);
    super(game, M, model, {
      id: 'ak', name: 'VK-9 KESTREL', magSize: 30, reserve: 150, flashSize: 0.16,
      hip: { pos: [0.13, -0.105, -0.23], rot: [0.04, 0.06, -0.04] },
      sprint: { pos: [-0.07, -0.02, 0.05], rot: [-0.3, 0.9, 0.42] },
      eyeRelief: 0.42, aimFov: 50,
      rightHand: { pos: [0.028, -0.108, 0.058], finger: [0, 0.42, -1], palm: [-1, 0.05, 0], pose: 'trigger' },
      leftHand: { pos: [-0.066, -0.03, -0.37], finger: [1, -0.25, -0.35], palm: [0.65, -0.75, 0], pose: 'support' },
      recoilStiff: 190, recoilDamp: 17, bloomRecover: 0.09, pivotPoint: [0, -0.05, -0.2],
    });
    this.boltT = 1; this.trigger = 0; this.ejected = true; this.chambered = true;
    this.magHome = model.magPivot.position.clone();
  }

  updateFire(dt, inp) {
    const g = this.game;
    this.trigger = inp.fire ? Math.min(1, this.trigger + dt * 20) : Math.max(0, this.trigger - dt * 14);
    if (!inp.fire || this.cooldown > 0 || this.sprintK > 0.35 || this.lowerK > 0.1) return;
    if (this.ammo <= 0) {
      if (inp.firePressed) { mech('ak_dry'); this.cooldown = 0.25; if (this.reserve > 0) setTimeout(() => { if (this.state === 'idle') this.startReload(); }, 300); else g.hud.toast('NO AMMO'); }
      return;
    }
    this.ammo--; this.cooldown = 0.1; this.boltT = 0; this.ejected = false;
    this.flashOn();
    playerShot('ak', g.arsenal.shotEnvironment());
    this.kick(0.03 + Math.random() * 0.01, 0.045 + Math.random() * 0.02, R() * 0.02, R() * 0.04);
    g.player.addRecoil(0.011 + Math.random() * 0.006, R() * 0.007);
    const spread = (this.adsK > 0.5 ? 0.002 : 0.022) + this.bloom * (1 - this.adsK * 0.6) + g.arsenal.movementSpread();
    this.bloom = Math.min(0.04, this.bloom + 0.0045);
    g.arsenal.fireRay(this, spread, 34);
    g.effects.muzzleSmoke(this.muzzleWorld(_a), g.player.forward(_b), 1);
  }

  animateParts(dt) {
    const m = this.model;
    // bolt carrier: slams back and returns in ~70 ms each shot
    this.boltT += dt;
    let boltZ = 0;
    if (this.boltT < 0.075) { const k = this.boltT / 0.075; boltZ = Math.sin(Math.min(1, k * 1.25) * Math.PI) * 0.09; }
    if (!this.ejected && this.boltT > 0.022) { this.ejected = true; this.ejectCasing(); }
    if (this.tl && this.tl.playing && this.tl.tracks.bolt) boltZ = this.tl.get('bolt', 0);
    m.bolt.position.z = boltZ;
    m.trigger.rotation.x = -0.28 * this.trigger;
    // magazine (reload tracks)
    if (this.tl && this.tl.playing && this.tl.tracks.magRot) {
      m.magPivot.rotation.x = this.tl.get('magRot', 0);
      const mp = this.tl.get('magPos', [0, 0, 0]);
      m.magPivot.position.set(this.magHome.x + mp[0], this.magHome.y + mp[1], this.magHome.z + mp[2]);
    } else { m.magPivot.rotation.x = 0; m.magPivot.position.copy(this.magHome); }
    m.selector.rotation.x = this.tl && this.tl.playing && this.tl.tracks.sel ? this.tl.get('sel', 0) : 0;
  }

  ejectCasing() {
    const g = this.game, cam = g.camera;
    const p = this.vmToWorld(this.model.ejectPort, _a);
    const right = _b.set(1, 0, 0).applyQuaternion(cam.quaternion), up = _c.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const v = new THREE.Vector3().addScaledVector(right, 3.2 + Math.random()).addScaledVector(up, 1.8 + Math.random() * 0.8);
    v.add(new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion).multiplyScalar(0.4));
    v.x += g.player.vel.x; v.z += g.player.vel.z;
    g.casings.spawn('rifle', p, v);
  }

  startReload() {
    const empty = this.ammo === 0;
    const grip = [-0.034, -0.14, -0.155]; // where the left hand grabs the mag (pivot space)
    const knob = [0.05, -0.002, -0.21];
    const tracks = {
      pivotRot: [[0, [0, 0, 0]], [0.35, [0.3, 0.12, -0.5]], [1.62, [0.3, 0.12, -0.5]]],
      pivotPos: [[0, [0, 0, 0]], [0.35, [-0.06, 0.085, 0.02]], [1.62, [-0.06, 0.085, 0.02]]],
      lhW: [[0, 0], [0.32, 1, 'inOut']],
      lhPos: [[0, this.cfg.leftHand.pos], [0.32, grip]],
      lhFinger: [[0, this.cfg.leftHand.finger], [0.32, [0.2, 0.2, -1]]],
      lhPalm: [[0, this.cfg.leftHand.palm], [0.32, [1, 0, 0]]],
      lhPose: [[0, 0], [0.32, 1]],
      magRot: [[0, 0], [0.42, 0], [0.62, 0.55, 'inOut'], [1.2, 0.5], [1.46, 0.45], [1.6, 0, 'back']],
      magPos: [[0, [0, 0, 0]], [0.62, [0, 0, 0]], [0.95, [-0.06, -0.5, 0.12], 'in'], [1.05, [-0.06, -0.5, 0.12]], [1.4, [0, -0.006, -0.01], 'out'], [1.46, [0, 0, 0]]],
    };
    const events = [[0.02, 'sound', 'cloth'], [0.35, 'lhMag', true], [0.4, 'sound', 'ak_mag_out'], [1.0, 'sound', 'cloth'], [1.58, 'sound', 'ak_mag_in'], [1.59, 'kick', 1], [1.62, 'lhMag', false]];
    let dur;
    if (!empty) {
      tracks.pivotRot.push([2.05, [0, 0, 0]]); tracks.pivotPos.push([2.05, [0, 0, 0]]);
      tracks.lhW.push([1.62, 1], [2.02, 0, 'inOut']); tracks.lhPos.push([1.62, grip], [2.02, this.cfg.leftHand.pos]);
      tracks.lhPose.push([1.62, 1], [2.0, 0]);
      events.push([1.6, 'ammo', 1]);
      dur = 2.15;
    } else {
      // empty: rock the new mag in, then reach over and rack the charging handle
      tracks.pivotRot.push([1.9, [0.12, -0.2, 0.5]], [2.35, [0.12, -0.2, 0.5]], [2.7, [0, 0, 0]]);
      tracks.pivotPos.push([1.9, [-0.05, 0.05, 0.02]], [2.35, [-0.05, 0.05, 0.02]], [2.7, [0, 0, 0]]);
      tracks.lhW.push([1.62, 1], [2.4, 1], [2.72, 0, 'inOut']);
      tracks.lhPos.push([1.62, grip], [1.95, [knob[0] + 0.012, knob[1] + 0.03, knob[2] + 0.02]], [2.02, [knob[0] + 0.012, knob[1] + 0.02, knob[2] + 0.02]], [2.12, [knob[0] + 0.012, knob[1] + 0.02, knob[2] + 0.115], 'inOut'], [2.2, [knob[0] + 0.03, knob[1] + 0.05, knob[2] + 0.12]], [2.72, this.cfg.leftHand.pos]);
      tracks.lhFinger.push([1.62, [0.2, 0.2, -1]], [1.95, [-0.3, -1, -0.4]], [2.2, [-0.3, -1, -0.4]], [2.6, this.cfg.leftHand.finger]);
      tracks.lhPalm.push([1.62, [1, 0, 0]], [1.95, [-1, 0.2, 0]], [2.2, [-1, 0.2, 0]], [2.6, this.cfg.leftHand.palm]);
      tracks.lhPose.push([1.62, 1], [1.9, 0.2], [2.0, 1], [2.14, 1], [2.2, 0.1], [2.6, 0]);
      tracks.bolt = [[0, 0], [2.02, 0], [2.12, 0.095, 'inOut'], [2.14, 0.095], [2.175, 0, 'snap']];
      events.push([1.6, 'ammo', 0], [2.06, 'sound', 'ak_rack_back'], [2.16, 'sound', 'ak_rack_fwd'], [2.17, 'kick', 1.4], [2.17, 'ammo', 1]);
      dur = 2.85;
    }
    this.state = 'reload';
    this.tl = new Timeline(dur, tracks, events).start();
  }

  onEvent(type, arg) {
    if (type === 'lhMag') {
      this.lhOverride = arg ? { obj: this.model.mag, offset: new THREE.Vector3(-0.035, -0.1, 0.03), finger: [0.2, 0.2, -1], palm: [1, 0, 0], pose: 'grip' } : null;
      return;
    }
    if (type === 'kick') { this.kick(0.012 * arg, -0.03 * arg, 0, 0.02 * arg); return; }
    if (type === 'ammo') {
      if (arg === 0) return; // mag seated but not chambered yet
      const need = this.magSize - this.ammo, take = Math.min(need, this.reserve);
      this.ammo += take; this.reserve -= take;
      return;
    }
    super.onEvent(type, arg);
  }

  startInspect() {
    this.state = 'inspect';
    this.tl = new Timeline(3.3, {
      pivotRot: [[0, [0, 0, 0]], [0.55, [0.22, 0.95, 0.35]], [1.45, [0.28, 1.0, 0.42]], [2.0, [0.08, -0.75, -0.32]], [2.75, [0.1, -0.8, -0.35]], [3.25, [0, 0, 0]]],
      pivotPos: [[0, [0, 0, 0]], [0.55, [-0.09, 0.05, 0.1]], [2.75, [-0.07, 0.05, 0.1]], [3.25, [0, 0, 0]]],
      sel: [[0, 0], [2.15, 0], [2.22, -0.38, 'snap'], [2.5, -0.38], [2.57, 0, 'snap']],
      lhW: [[0, 0], [0.4, 1], [2.8, 1], [3.2, 0]],
      lhPos: [[0, this.cfg.leftHand.pos], [0.4, [-0.04, -0.075, -0.3]], [1.1, [-0.035, -0.07, -0.32]], [2.8, [-0.04, -0.075, -0.3]]],
      lhFinger: [[0, this.cfg.leftHand.finger]], lhPalm: [[0, this.cfg.leftHand.palm]], lhPose: [[0, 0]],
    }, [[0.05, 'sound', 'cloth'], [0.6, 'sound', 'handling'], [2.2, 'sound', 'ak_selector'], [2.55, 'sound', 'ak_selector'], [2.9, 'sound', 'cloth']]).start();
  }
}

// =====================================================================
// HALLAM SIX — double-action six-shot revolver with speedloader reloads.
// =====================================================================
export class HallamSix extends FPWeapon {
  constructor(game, M) {
    const model = buildRevolver(M);
    super(game, M, model, {
      id: 'revolver', name: 'HALLAM SIX', magSize: 6, reserve: 42, flashSize: 0.2,
      hip: { pos: [0.1, -0.1, -0.3], rot: [0.02, 0.05, 0.0] },
      sprint: { pos: [0.0, -0.1, 0.08], rot: [-0.95, 0.3, 0.3] },
      eyeRelief: 0.36, aimFov: 58,
      rightHand: { pos: [0.026, -0.1, 0.095], finger: [0, 0.3, -1], palm: [-1, 0.05, 0], pose: 'trigger' },
      leftHand: { pos: [-0.04, -0.09, 0.055], finger: [0.9, 0.25, -0.5], palm: [1, 0.2, 0.3], pose: 'support' },
      recoilStiff: 150, recoilDamp: 13, bloomRecover: 0.25, pivotPoint: [0, -0.03, -0.02], lhAltPose: 'pinch',
    });
    this.chambers = ['live', 'live', 'live', 'live', 'live', 'live'];
    this.top = 0; this.cylRot = 0; this.cylTarget = 0; this.pullT = -1; this.hammer = 0; this.trig = 0; this.dryCount = 0;
    this.spin = 0; this.spinV = 0;
    this.spentPrimer = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, metalness: 1, roughness: 0.5 });
    this.loader = buildSpeedloader(M); this.loader.visible = false; model.cylAxis.add(this.loader);
    this.loadedAmmo();
  }

  loadedAmmo() { this.ammo = this.chambers.filter((c) => c === 'live').length; }

  updateFire(dt, inp) {
    if (this.pullT >= 0) return; // mid trigger stroke
    if (!inp.fire || this.cooldown > 0 || this.sprintK > 0.35 || this.lowerK > 0.1) return;
    if (!inp.firePressed && this.cfg.semiOnly) return;
    // Double action: pulling the trigger cocks the hammer and turns the cylinder.
    this.pullT = 0; this.cooldown = 0.36;
    mech('rev_cock', 0.35);
  }

  finishPull() {
    const g = this.game;
    this.top = (this.top + 1) % 6;
    const state = this.chambers[this.top];
    if (state !== 'live') {
      mech('rev_dry'); this.dryCount++;
      if (this.reserve > 0 && this.dryCount >= 1) setTimeout(() => { if (this.state === 'idle') this.startReload(); }, 350);
      else if (this.reserve <= 0) g.hud.toast('NO AMMO');
      return;
    }
    this.dryCount = 0;
    this.chambers[this.top] = 'spent';
    this.model.rounds[this.top].userData.primer.material = this.spentPrimer;
    this.loadedAmmo();
    this.flashOn(); this.flashT = 0.06;
    playerShot('revolver', g.arsenal.shotEnvironment());
    this.kick(0.07, 0.24 + Math.random() * 0.04, R() * 0.04, 0.06 + R() * 0.04);
    g.player.addRecoil(0.042 + Math.random() * 0.012, R() * 0.01);
    const spread = (this.adsK > 0.5 ? 0.0015 : 0.016) + this.bloom + g.arsenal.movementSpread();
    this.bloom = Math.min(0.03, this.bloom + 0.012);
    g.arsenal.fireRay(this, spread, 70);
    g.effects.muzzleSmoke(this.muzzleWorld(_a), g.player.forward(_b), 2);
  }

  animateParts(dt) {
    const m = this.model;
    // trigger stroke: 0-75 ms cock & index, then release
    if (this.pullT >= 0) {
      this.pullT += dt;
      const k = Math.min(1, this.pullT / 0.075);
      this.trig = k; this.hammer = k * 0.62;
      this.cylRot = -(this.top + k) * Math.PI / 3;
      if (this.pullT >= 0.075) { this.finishPull(); this.pullT = -1; this.hammer = 0; }
    } else {
      this.trig = Math.max(0, this.trig - dt * 8);
      this.cylRot = -this.top * Math.PI / 3;
    }
    m.trigger.rotation.x = -0.42 * this.trig;
    m.hammer.rotation.x = this.hammer;
    // free spin while open (inspect)
    this.spinV *= Math.max(0, 1 - dt * 1.2); this.spin += this.spinV * dt;
    m.cylinder.rotation.z = this.cylRot + this.spin;
    const tl = this.tl && this.tl.playing ? this.tl : null;
    m.crane.rotation.z = tl && tl.tracks.crane ? tl.get('crane', 0) : 0;
    m.ejector.position.z = tl && tl.tracks.eject ? tl.get('eject', 0) : 0;
    if (tl && tl.tracks.loaderZ) this.loader.position.z = tl.get('loaderZ', 0.3);
  }

  startReload() {
    const L = this.cfg.leftHand.pos;
    const tracks = {
      pivotRot: [[0, [0, 0, 0]], [0.3, [0.15, 0.2, 0.55]], [0.55, [0.25, 0.25, 0.6]], [0.75, [1.15, 0.2, 0.4]], [0.95, [1.1, 0.2, 0.4]], [1.25, [-0.6, 0.25, 0.5]], [1.95, [-0.55, 0.25, 0.5]], [2.25, [0.1, 0.1, 0.3]], [2.7, [0, 0, 0]]],
      pivotPos: [[0, [0, 0, 0]], [0.3, [-0.07, 0.04, 0.05]], [2.3, [-0.07, 0.04, 0.05]], [2.7, [0, 0, 0]]],
      crane: [[0, 0], [0.3, 0], [0.48, 1.35, 'back'], [2.05, 1.35], [2.14, 0, 'snap']],
      eject: [[0, 0], [0.62, 0], [0.74, 0.02, 'out'], [0.86, 0.02], [0.95, 0]],
      loaderZ: [[0, 0.3], [1.05, 0.3], [1.45, 0.04, 'out'], [1.52, 0.004, 'in'], [1.62, 0.004], [1.85, 0.3, 'in']],
      lhW: [[0, 0], [0.25, 1], [2.4, 1], [2.72, 0, 'inOut']],
      lhPos: [[0, L], [0.25, [-0.034, -0.02, 0.01]], [0.5, [-0.055, -0.03, 0.0]], [0.62, [-0.03, -0.05, -0.2]], [0.74, [-0.03, -0.05, -0.178]], [0.95, [-0.12, -0.38, 0.1]], [1.85, [-0.12, -0.38, 0.1]], [1.97, [-0.05, -0.028, 0.0]], [2.1, [-0.02, -0.028, 0.0]], [2.72, L]],
      lhFinger: [[0, this.cfg.leftHand.finger], [0.25, [0.3, 0.9, -0.2]], [0.62, [0.1, 0.1, 1]], [0.95, [0.3, 0.3, -1]], [1.97, [0.4, 0.9, -0.3]], [2.72, this.cfg.leftHand.finger]],
      lhPalm: [[0, this.cfg.leftHand.palm], [0.25, [1, 0, 0]], [0.62, [0.2, 0.2, -1]], [0.95, [1, 0, 0]], [1.97, [1, 0, 0]], [2.72, this.cfg.leftHand.palm]],
      lhPose: [[0, 0], [0.25, 0.4], [0.62, 0.8], [0.95, 1], [2.1, 0.4], [2.7, 0]],
    };
    const events = [[0.02, 'sound', 'cloth'], [0.28, 'sound', 'rev_open'], [0.7, 'sound', 'rev_eject'], [0.72, 'dump', 0], [1.0, 'sound', 'cloth'], [1.04, 'loader', 1], [1.5, 'sound', 'rev_load'], [1.52, 'load', 0], [1.82, 'loader', 0], [2.12, 'sound', 'rev_close'], [2.13, 'kick', 1]];
    this.state = 'reload';
    this.tl = new Timeline(2.85, tracks, events).start();
  }

  startInspect() {
    this.state = 'inspect';
    this.tl = new Timeline(2.7, {
      pivotRot: [[0, [0, 0, 0]], [0.4, [0.3, 0.35, 0.75]], [1.9, [0.35, 0.4, 0.8]], [2.2, [0.1, 0.1, 0.2]], [2.65, [0, 0, 0]]],
      pivotPos: [[0, [0, 0, 0]], [0.4, [-0.08, 0.05, 0.06]], [2.2, [-0.06, 0.04, 0.05]], [2.65, [0, 0, 0]]],
      crane: [[0, 0], [0.45, 0], [0.6, 1.3, 'back'], [1.85, 1.3], [1.95, 0, 'snap']],
      lhW: [[0, 0], [0.4, 1], [2.3, 1], [2.65, 0]],
      lhPos: [[0, this.cfg.leftHand.pos], [0.4, [-0.05, -0.03, 0.0]], [0.75, [-0.07, -0.035, -0.02]], [0.85, [-0.075, -0.06, -0.02]], [1.7, [-0.07, -0.05, 0.0]], [1.85, [-0.02, -0.03, 0.0]], [2.3, [-0.045, -0.1, 0.07]]],
      lhFinger: [[0, this.cfg.leftHand.finger], [0.4, [0.3, 0.9, -0.2]], [0.85, [0.2, -0.3, -1]], [1.7, [0.4, 0.9, -0.3]], [2.3, this.cfg.leftHand.finger]],
      lhPalm: [[0, this.cfg.leftHand.palm], [0.4, [1, 0, 0]], [0.85, [0.4, 1, 0]], [1.7, [1, 0, 0]], [2.3, this.cfg.leftHand.palm]],
      lhPose: [[0, 0], [0.4, 0.3], [2.3, 0]],
    }, [[0.05, 'sound', 'cloth'], [0.45, 'sound', 'rev_open'], [0.82, 'spin', 1], [0.82, 'sound', 'rev_spin'], [1.93, 'sound', 'rev_close'], [1.94, 'kick', 1]]).start();
  }

  onEvent(type, arg) {
    const g = this.game, m = this.model;
    if (type === 'spin') { this.spinV = 22; return; }
    if (type === 'kick') { this.kick(0.01, -0.05, 0, -0.04); return; }
    if (type === 'dump') {
      // push the ejector: spent cases (and any live rounds) fall out
      const cam = g.camera;
      for (let k = 0; k < 6; k++) {
        const st = this.chambers[k]; if (st === 'empty') continue;
        if (st === 'live') this.reserve++; // live rounds go back in your pocket
        const rnd = m.rounds[k]; rnd.visible = false;
        const p = this.vmToWorld(rnd, new THREE.Vector3());
        const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, -1.2 - Math.random(), (Math.random() - 0.5) * 0.6).add(new THREE.Vector3(0, 0, 0.5).applyQuaternion(cam.quaternion));
        g.casings.spawn('pistol', p, v);
        this.chambers[k] = 'empty';
      }
      this.loadedAmmo();
      return;
    }
    if (type === 'loader') {
      this.loader.visible = !!arg;
      if (arg) {
        const n = Math.min(6, this.reserve);
        this.loader.userData.rounds.forEach((r, i) => { r.visible = i < n; });
        this.lhOverride = { obj: this.loader, offset: new THREE.Vector3(0, -0.005, 0.05), finger: [0.3, 0.3, -1], palm: [0.9, 0.2, 0.3], pose: 'pinch' };
      } else { this.lhOverride = null; }
      return;
    }
    if (type === 'load') {
      const n = Math.min(6, this.reserve);
      for (let k = 0; k < 6; k++) {
        const idx = (this.top + 1 + k) % 6; // fill from the next chamber to come under the hammer
        const rnd = m.rounds[idx];
        if (k < n) { this.chambers[idx] = 'live'; rnd.visible = true; rnd.userData.primer.material = this.M.primer; }
      }
      this.reserve -= n; this.loadedAmmo(); this.dryCount = 0;
      this.loader.userData.rounds.forEach((r) => { r.visible = false; });
      return;
    }
    super.onEvent(type, arg);
  }
}
