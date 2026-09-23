// Weapon manager: owns the guns, switching, hitscan ballistics with
// material-aware impacts, and the acoustic environment of each shot.
import * as THREE from 'three';
import { weaponMaterials } from './materials.js';
import { Kestrel, HallamSix } from './guns.js';
import { play } from '../audio/soundscape.js';
import { settings } from '../core/settings.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

const METAL = new Set(['drone', 'lamp', 'postbox', 'pole', 'shelter', 'bollard', 'barrier', 'skip', 'loo', 'parked-car', 'car']);
const WOOD = new Set(['tree', 'bench']);

export class Arsenal {
  constructor(game, vmScene, quality) {
    this.game = game;
    const M = this.M = weaponMaterials(quality);
    this.weapons = [new Kestrel(game, M), new HallamSix(game, M)];
    for (const w of this.weapons) { vmScene.add(w.rig); vmScene.add(w.arms); }
    this.index = 0; this.pending = -1;
    this.weapons[0].draw();
    this._echoDirs = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this._echoDirs.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
    this.env = { enclosure: 0, echoes: [] }; this.envT = 0;
  }

  get current() { return this.weapons[this.index]; }
  get name() { return this.current.name; }
  get ammo() { return this.current.ammo; }
  get reserve() { return this.current.reserve; }
  get adsK() { return this.current.adsK; }

  swap() {
    const w = this.current;
    if (w.state === 'holster' || w.state === 'draw' || this.pending >= 0) return;
    const next = (this.index + 1) % this.weapons.length;
    this.pending = next;
    if (w.tl) w.tl.playing = false;
    w.lhOverride = null;
    w.holster(() => { this.index = next; this.pending = -1; this.current.draw(); this.game.hud.toast(this.current.name, 1.2); });
  }

  update(dt, inp) {
    if (inp.swap) this.swap();
    for (const w of this.weapons) if (w.rig.visible) w.update(dt, w === this.current ? inp : { ...inp, fire: false, firePressed: false, reload: false, inspect: false });
    // refresh acoustic environment a few times a second
    this.envT -= dt;
    if (this.envT <= 0) { this.envT = 0.25; this.env = this.computeEnvironment(); }
  }

  // How boxed-in the player is + where the nearest walls are (for echoes).
  computeEnvironment() {
    const p = this.game.player.pos, w = this.game.world;
    const echoes = []; let close = 0;
    for (const d of this._echoDirs) {
      const r = w.raycastBoxes(p.x, p.y - 0.3, p.z, d.x, 0, d.z, 90);
      if (r.box && r.dist < 90) { echoes.push({ dist: r.dist, dir: { x: d.x, z: d.z } }); if (r.dist < 9) close++; }
    }
    echoes.sort((a, b) => a.dist - b.dist);
    return { enclosure: Math.min(1, Math.max(0, (close - 2) / 4)), echoes: echoes.slice(0, 4) };
  }
  shotEnvironment() { return this.env; }

  movementSpread() {
    const p = this.game.player; const hs = Math.hypot(p.vel.x, p.vel.z);
    return (p.onGround ? 0 : 0.04) + Math.min(0.02, hs * 0.0025) * (1 - this.current.adsK * 0.7);
  }

  // Surface material at a hit.
  material(box, point) {
    if (!box) return this.game.map.surfaceAt(point.x, point.z);
    const tag = box.tag;
    if (tag === 'car') return point.y - box.minY > 0.95 ? 'glass' : 'metal';
    if (tag === 'parked-car') return point.y - box.minY > 0.95 ? 'glass' : 'metal';
    if (tag === 'npc') return 'flesh';
    if (tag === 'bin' || tag === 'loo') return 'plastic';
    if (METAL.has(tag)) return 'metal';
    if (WOOD.has(tag)) return 'wood';
    if (tag === 'wall') return 'stone';
    if (tag === 'building') {
      // shopfront glass: the road-facing wall of a shop, at window height
      const h = point.y - box.minY - 2;
      if (box.shop && h > 0.4 && h < 2.9) {
        const lz = box.rot ? (point.x - box.cx) * box.s + (point.z - box.cz) * box.c : 0;
        if (lz > box.hd - 0.1) return 'glass';
      }
      return 'brick';
    }
    if (tag === 'church') return 'stone';
    return 'concrete';
  }

  // One bullet. Returns true if it hit something interesting.
  fireRay(weapon, spread, damage) {
    const g = this.game, cam = g.camera;
    cam.updateMatrixWorld(true);
    const origin = _o.copy(cam.position);
    const fwd = g.player.forward(_d.clone());
    if (settings.aimAssist) {
      const t = g.findAimTarget(origin, fwd, 0.07);
      if (t) fwd.lerp(t.dir, 0.7).normalize();
    }
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
    const dir = fwd.addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
    const range = 250;
    const res = g.world.raycastBoxes(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    const pr = g.props.raycast(origin, dir, res.dist);
    const dist = pr ? pr.dist : res.dist;
    const p = _p.copy(origin).addScaledVector(dir, dist);
    const muzzle = weapon.muzzleWorld(new THREE.Vector3());
    if (Math.random() < 0.5) g.effects.tracer(muzzle.clone().addScaledVector(dir, 2), p.clone().addScaledVector(dir, -0.5));
    g.onGunfire();
    if (pr) {
      const pts = g.props.hit(pr.prop, dir, damage / 34);
      const mat = pr.prop.kind === 'can' ? 'metal' : 'plastic';
      g.effects.impact(p.clone(), _n.copy(dir).negate(), mat);
      play('impact_' + mat, { pos: p.clone(), gain: 0.9 });
      if (pts > 0) g.addScore(pts, pts >= 25 ? 'CAN-TASTIC!' : 'CONE-GRATULATIONS!');
      g.hud.hitmarker();
      return true;
    }
    if (dist >= range) return false;
    const n = _n.set(0, 0, 0);
    if (res.normal) n.fromArray(res.normal); else if (res.normalAxis >= 0) n.setComponent(res.normalAxis, res.normalSign); else n.set(0, 1, 0);
    const box = res.box, mat = this.material(box, p);
    if (box && box.owner && (box.tag === 'car' || box.tag === 'npc' || box.tag === 'drone')) { box.owner.onShot?.(p, damage); g.hud.hitmarker(); }
    g.effects.impact(p.clone(), n.clone(), mat);
    const impactName = { stone: 'concrete', paving: 'concrete', grass: 'dirt' }[mat] || mat;
    play('impact_' + impactName, { pos: p.clone(), gain: 1 });
    // ricochets off hard surfaces at shallow angles
    const graze = Math.abs(dir.dot(n));
    if ((mat === 'metal' || mat === 'concrete' || mat === 'stone' || mat === 'asphalt' || mat === 'brick' || mat === 'paving') && (graze < 0.45 ? Math.random() < 0.6 : Math.random() < 0.12)) {
      play('ricochet', { pos: p.clone(), gain: 0.7, delay: 0.02 });
    }
    return !!(box && box.owner);
  }
}
