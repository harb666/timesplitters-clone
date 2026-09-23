// First-person weapon rig shared by every gun.
//
//   rig (camera space: hip/ADS/sprint pose + sway + bob + recoil springs)
//    └ pivot (reload / inspect / draw moves from timelines)
//       ├ model.root (the gun and its moving parts)
//       ├ right hand (fixed to the grip, fingers posed; index finger on trigger)
//       └ left hand  (supports, or animates to the magazine / cylinder / bolt)
//   forearms stretch from fixed elbow points to each wrist.
import * as THREE from 'three';
import { Spring3, Timeline } from './anim.js';
import { buildHand, poseHand, POSES, Forearm } from './hands.js';
import { mech } from '../audio/soundscape.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const lerp = (a, b, k) => a + (b - a) * k;

// Orient a hand from where its fingers point and where its palm faces.
export function orientHand(obj, finger, palm) {
  const z = _v.set(-finger[0], -finger[1], -finger[2]).normalize();
  const y0 = _v2.set(-palm[0], -palm[1], -palm[2]);
  const x = new THREE.Vector3().crossVectors(y0, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  _m.makeBasis(x, y, z.clone());
  obj.quaternion.setFromRotationMatrix(_m);
}

// Muzzle flash: crossed quads with a procedural star/petal texture.
let flashTex = null;
function muzzleFlashTexture() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.translate(64, 64);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7 + Math.random() * 0.3);
    const grd = g.createLinearGradient(0, 0, 60, 0);
    grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.35, 'rgba(255,190,90,.85)'); grd.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(30, -10 - Math.random() * 6, 58 + Math.random() * 6, 0); g.quadraticCurveTo(30, 10, 0, 6); g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 26); core.addColorStop(0, 'rgba(255,255,240,1)'); core.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, 26, 0, 6.28); g.fill();
  flashTex = new THREE.CanvasTexture(c); flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}
function buildFlash(size) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: muzzleFlashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); grp.add(front); // facing the camera
  for (let i = 0; i < 2; i++) { // side petals (seen in profile)
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.8, size * 0.8), mat);
    p.rotation.y = Math.PI / 2; p.rotation.x = i * Math.PI / 2; p.position.z = -size * 0.7; grp.add(p);
  }
  grp.visible = false;
  return { grp, mat };
}

export class FPWeapon {
  constructor(game, M, model, cfg) {
    this.game = game; this.M = M; this.model = model; this.cfg = cfg;
    this.name = cfg.name; this.id = cfg.id;
    this.magSize = cfg.magSize; this.ammo = cfg.magSize; this.reserve = cfg.reserve;
    this.rig = new THREE.Group(); this.pivot = new THREE.Group(); this.rig.add(this.pivot); this.pivot.add(model.root);
    // hands
    this.handR = buildHand(M, false); this.pivot.add(this.handR.root);
    this.handL = buildHand(M, true); this.pivot.add(this.handL.root);
    this.handR.root.position.fromArray(cfg.rightHand.pos); orientHand(this.handR.root, cfg.rightHand.finger, cfg.rightHand.palm);
    poseHand(this.handR, POSES[cfg.rightHand.pose]);
    this.armR = new Forearm(M); this.armL = new Forearm(M);
    // forearms live directly in viewmodel (camera) space, next to the rig
    this.arms = new THREE.Group(); this.arms.add(this.armR.mesh, this.armR.cuff, this.armL.mesh, this.armL.cuff);
    // muzzle flash + light (lights the gun and hands for a frame)
    this.flash = buildFlash(cfg.flashSize ?? 0.12); model.muzzle.add(this.flash.grp);
    this.flashLight = new THREE.PointLight(0xffa850, 0, 3, 2); model.muzzle.add(this.flashLight);
    // springs
    this.recoilPos = new Spring3(cfg.recoilStiff ?? 170, cfg.recoilDamp ?? 16);
    this.recoilRot = new Spring3(cfg.recoilStiff ?? 170, cfg.recoilDamp ?? 15);
    this.sway = new Spring3(90, 13);
    this.land = new Spring3(120, 12);
    // state
    this.state = 'hidden'; this.tl = null; this.adsK = 0; this.sprintK = 0; this.lowerK = 1; this.cooldown = 0;
    this.bloom = 0; this.flashT = 0; this.lhOverride = null; this.idleT = Math.random() * 10;
    this.elbowR = new THREE.Vector3(0.28, -0.42, 0.28); this.elbowL = new THREE.Vector3(-0.2, -0.46, 0.2);
    this.lh = { pos: new THREE.Vector3().fromArray(cfg.leftHand.pos), finger: cfg.leftHand.finger.slice(), palm: cfg.leftHand.palm.slice(), pose: cfg.leftHand.pose };
    this.rig.visible = false;
    this.aimFov = cfg.aimFov ?? 55;
  }

  // ---------------- lifecycle ----------------
  draw() {
    this.rig.visible = true; this.state = 'draw';
    this.tl = new Timeline(0.55, { lower: [[0, 1], [0.5, 0, 'out']] }, [[0.05, 'sound', 'handling'], [0.3, 'sound', 'cloth']]).start();
  }
  holster(done) {
    this.state = 'holster'; this.adsK = Math.min(this.adsK, 0.3);
    this.tl = new Timeline(0.3, { lower: [[0, 0], [0.3, 1, 'in']] }, [[0, 'sound', 'cloth']]).start();
    this.onHolstered = done;
  }
  get busy() { return this.state !== 'idle'; }

  // ---------------- per-frame ----------------
  update(dt, inp) {
    this.cooldown -= dt; this.idleT += dt; this.flashT -= dt;
    const p = this.game.player;
    // timelines
    if (this.tl && this.tl.playing) {
      const finished = this.tl.update(dt, (type, arg) => this.onEvent(type, arg));
      if (finished) this.onTimelineEnd();
    }
    // blends
    const canAim = inp.aim && (this.state === 'idle' || this.state === 'fire') && !inp.sprinting;
    this.adsK += ((canAim ? 1 : 0) - this.adsK) * Math.min(1, dt * 11);
    const wantSprint = inp.sprinting && !canAim && this.state !== 'draw';
    this.sprintK += ((wantSprint ? 1 : 0) - this.sprintK) * Math.min(1, dt * 7);
    this.lowerK = this.tl && this.tl.tracks.lower ? this.tl.get('lower', 0) : (this.state === 'hidden' ? 1 : 0);
    this.bloom = Math.max(0, this.bloom - dt * (this.cfg.bloomRecover ?? 0.12));
    if (this.state === 'idle' || this.state === 'fire') this.updateFire(dt, inp);
    if (inp.reload && this.state === 'idle') { if (this.ammo < this.magSize && this.reserve > 0) this.startReload(); else this.startInspect(); }
    if (inp.inspect && this.state === 'idle') this.startInspect();
    this.animateParts(dt);
    this.compose(dt, inp, p);
    // muzzle flash
    this.flash.grp.visible = this.flashT > 0;
    this.flashLight.intensity = this.flashT > 0 ? 6 : 0;
  }

  updateFire() { /* per weapon */ }
  animateParts() { /* per weapon */ }
  onTimelineEnd() {
    if (this.state === 'holster') { this.rig.visible = false; this.state = 'hidden'; this.onHolstered?.(); return; }
    this.state = 'idle'; this.lhOverride = null;
  }
  onEvent(type, arg) { if (type === 'sound') mech(arg, arg === 'cloth' || arg === 'handling' ? 0.5 : 0.9); }

  startInspect() {}
  startReload() {}

  // ---------------- composing the view pose ----------------
  compose(dt, inp, p) {
    const c = this.cfg, t = this.idleT;
    const hip = c.hip, sprint = c.sprint;
    // ADS pose: line up the sights with the centre of the screen
    const rs = this.model.rearSight.position;
    const adsPos = [-rs.x, -rs.y, -c.eyeRelief - rs.z];
    const a = this.adsK, s = this.sprintK * (1 - a), lo = this.lowerK;
    const pos = [0, 1, 2].map((i) => lerp(hip.pos[i], adsPos[i], a) + sprint.pos[i] * s + [0.02, -0.28, 0.05][i] * lo);
    const rot = [0, 1, 2].map((i) => lerp(hip.rot[i], 0, a) + sprint.rot[i] * s + [-0.9, 0.3, 0.2][i] * lo);
    // idle breathing + sway from looking around
    const breathe = (1 - a * 0.85);
    pos[1] += Math.sin(t * 1.3) * 0.0022 * breathe; rot[0] += Math.sin(t * 1.3 + 0.6) * 0.004 * breathe;
    this.sway.target.set(-inp.lookX * 0.0009 * (1 - a * 0.7), inp.lookY * 0.0009 * (1 - a * 0.7), 0);
    this.sway.target.clampScalar(-0.06, 0.06);
    const sw = this.sway.update(dt);
    rot[1] += sw.x * 1.4; rot[0] += sw.y * 1.4; pos[0] += sw.x * 0.05; pos[1] -= sw.y * 0.05; rot[2] += sw.x * 0.6;
    // walk / sprint bob (much less when aiming)
    const hs = Math.min(1.4, Math.hypot(p.vel.x, p.vel.z) / 7.4) * (p.onGround ? 1 : 0.2);
    const bobA = (1 - a * 0.85) * (1 + s * 1.6);
    pos[0] += Math.sin(p.bob) * 0.011 * hs * bobA; pos[1] += -Math.abs(Math.cos(p.bob)) * 0.012 * hs * bobA;
    rot[2] += Math.sin(p.bob) * 0.012 * hs * bobA; rot[1] += Math.cos(p.bob) * 0.006 * hs * bobA;
    // jumping/landing weight
    if (inp.landed) this.land.impulse(0, -Math.min(0.6, inp.landed * 0.12), 0);
    const ld = this.land.update(dt);
    pos[1] += ld.y * 0.08 + (p.onGround ? 0 : 0.012); rot[0] += ld.y * 0.3;
    // recoil springs
    const rp = this.recoilPos.update(dt), rr = this.recoilRot.update(dt);
    pos[0] += rp.x; pos[1] += rp.y; pos[2] += rp.z; rot[0] += rr.x; rot[1] += rr.y; rot[2] += rr.z;
    this.rig.position.fromArray(pos); this.rig.rotation.set(rot[0], rot[1], rot[2], 'YXZ');
    // timeline pivot moves (reload / inspect)
    const tp = this.tl && this.tl.playing ? this.tl.get('pivotPos', [0, 0, 0]) : [0, 0, 0];
    const tr = this.tl && this.tl.playing ? this.tl.get('pivotRot', [0, 0, 0]) : [0, 0, 0];
    const pv = c.pivotPoint ?? [0, -0.05, -0.15]; // rotate reload moves about the gun's middle
    this.pivot.position.set(tp[0], tp[1], tp[2]);
    this.pivot.rotation.set(tr[0], tr[1], tr[2]);
    this.pivot.position.add(_v.fromArray(pv)).sub(_v2.fromArray(pv).applyEuler(this.pivot.rotation));
    // left hand: support pose, or animated by the timeline / a target object
    this.updateLeftHand();
    // forearms (in rig-parent space = camera space; rig children live in rig space, so convert)
    this.rig.updateMatrixWorld(true);
    this.updateArm(this.armR, this.handR, this.elbowR);
    this.updateArm(this.armL, this.handL, this.elbowL);
  }

  updateLeftHand() {
    const L = this.handL.root, tl = this.tl && this.tl.playing ? this.tl : null;
    let w = tl ? tl.get('lhW', 0) : 0;
    const base = this.lh;
    if (this.lhOverride) { // follow an object (e.g. speedloader, magazine) with an offset
      const o = this.lhOverride;
      o.obj.updateMatrixWorld(true);
      _v.copy(o.offset).applyMatrix4(o.obj.matrixWorld);
      this.pivot.worldToLocal(_v);
      L.position.lerpVectors(L.position, _v, 1);
      orientHand(L, o.finger, o.palm);
      poseHand(this.handL, POSES[o.pose]);
      return;
    }
    if (w > 0.001) {
      const p = tl.get('lhPos', base.pos.toArray()), f = tl.get('lhFinger', base.finger), pa = tl.get('lhPalm', base.palm);
      L.position.set(lerp(base.pos.x, p[0], w), lerp(base.pos.y, p[1], w), lerp(base.pos.z, p[2], w));
      orientHand(L, [0, 1, 2].map((i) => lerp(base.finger[i], f[i], w)), [0, 1, 2].map((i) => lerp(base.palm[i], pa[i], w)));
      const pose = tl.get('lhPose', 0);
      poseHand(this.handL, POSES[base.pose], POSES[this.cfg.lhAltPose ?? 'grip'], pose);
    } else {
      L.position.copy(base.pos); orientHand(L, base.finger, base.palm); poseHand(this.handL, POSES[base.pose]);
    }
  }

  updateArm(arm, hand, elbow) {
    // The viewmodel scene's world space IS camera space, so world matrices
    // give camera-space positions directly. Elbows stay put; wrists move.
    hand.root.updateMatrixWorld(true);
    _v.set(0, 0, 0.022).applyMatrix4(hand.root.matrixWorld);
    arm.update(elbow, _v);
    this.arms.visible = this.rig.visible;
  }

  // ---------------- shooting helpers ----------------
  muzzleWorld(out) {
    // viewmodel space == camera space, so map through the real camera
    this.model.muzzle.updateMatrixWorld(true);
    out.setFromMatrixPosition(this.model.muzzle.matrixWorld);
    return this.game.camera.localToWorld(out);
  }
  vmToWorld(obj, out) { obj.updateMatrixWorld(true); out.setFromMatrixPosition(obj.matrixWorld); return this.game.camera.localToWorld(out); }

  kick(posZ, rotX, rotY = 0, rotZ = 0) {
    const a = 1 - this.adsK * 0.55;
    this.recoilPos.impulse((Math.random() - 0.5) * 0.02 * a, posZ * 0.25 * a, posZ * a);
    this.recoilRot.impulse(rotX * a, rotY * a, rotZ * a);
  }

  flashOn() { this.flashT = 0.045; this.flash.grp.rotation.z = Math.random() * Math.PI * 2; this.flash.grp.scale.setScalar(0.8 + Math.random() * 0.5); }
}
