// First-person gloved hands and sleeved forearms.
// A hand is a jointed rig: palm + four 3-segment fingers + a 3-segment
// thumb, each joint a pivot so poses (grip, trigger finger, open, cup) can
// be blended. Forearms stretch from the wrist to a fixed elbow point
// behind the camera, so hands can move freely during reloads.
import * as THREE from 'three';
import { roundedBox, boxUV } from '../models/shapes.js';

// Finger layout for a RIGHT hand, palm facing -Y, fingers pointing -Z,
// thumb on the -X side. [x offset, length scale, thickness]
const FINGERS = [
  { x: -0.024, len: [0.026, 0.019, 0.016], r: 0.0092 }, // index
  { x: -0.008, len: [0.028, 0.021, 0.017], r: 0.0094 }, // middle
  { x: 0.008, len: [0.026, 0.019, 0.016], r: 0.009 },   // ring
  { x: 0.023, len: [0.021, 0.015, 0.014], r: 0.0082 },  // little
];

function segment(M, len, r) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 12);
  g.rotateX(Math.PI / 2); g.translate(0, 0, -len / 2);  // pivot at the knuckle, pointing -Z
  return new THREE.Mesh(boxUV(g, 40), M.glove);
}

export function buildHand(M, left = false) {
  const root = new THREE.Group(); root.name = left ? 'handL' : 'handR';
  const inner = new THREE.Group(); root.add(inner);
  if (left) inner.scale.x = -1; // mirror
  // palm (slightly tapered, rounded) + knuckle ridge + back-of-hand padding
  const palm = new THREE.Mesh(roundedBox(0.078, 0.028, 0.088, 0.011, 3, 40), M.glove);
  palm.position.set(0, 0, -0.044); inner.add(palm);
  const knuckles = new THREE.Mesh(roundedBox(0.074, 0.012, 0.018, 0.005, 2, 40), M.cuff);
  knuckles.position.set(0, 0.012, -0.08); inner.add(knuckles);
  const cuff = new THREE.Mesh(boxUV(new THREE.CylinderGeometry(0.036, 0.038, 0.035, 18).rotateX(Math.PI / 2).scale(1.05, 0.72, 1), 40), M.cuff);
  cuff.position.set(0, 0, 0.012); inner.add(cuff);
  const fingers = [];
  for (const f of FINGERS) {
    const joints = [];
    let parent = inner, z = -0.086;
    for (let j = 0; j < 3; j++) {
      const pivot = new THREE.Group();
      pivot.position.set(j === 0 ? f.x : 0, j === 0 ? -0.002 : 0, j === 0 ? z : -f.len[j - 1]);
      parent.add(pivot);
      pivot.add(segment(M, f.len[j], f.r * (1 - j * 0.08)));
      joints.push(pivot); parent = pivot;
    }
    fingers.push(joints);
  }
  // thumb: base on the palm side near the wrist, angled forward/inward
  const thumbBase = new THREE.Group(); thumbBase.position.set(-0.036, -0.006, -0.026); inner.add(thumbBase);
  const thumbMount = new THREE.Group(); thumbMount.rotation.set(0, 0.75, -0.35); thumbBase.add(thumbMount);
  const thumb = []; let tp = thumbMount;
  const tl = [0.026, 0.022, 0.018];
  for (let j = 0; j < 3; j++) {
    const pivot = new THREE.Group(); pivot.position.set(0, 0, j === 0 ? 0 : -tl[j - 1]);
    tp.add(pivot); pivot.add(segment(M, tl[j], 0.0105 - j * 0.0008)); thumb.push(pivot); tp = pivot;
  }
  // thenar pad (thumb muscle) to fill the palm
  const pad = new THREE.Mesh(roundedBox(0.03, 0.022, 0.05, 0.01, 2, 40), M.glove);
  pad.position.set(-0.026, -0.006, -0.03); pad.rotation.y = 0.35; inner.add(pad);
  return { root, inner, fingers, thumb, thumbMount, left };
}

// Poses: per finger [base, mid, tip] curl in radians (negative = towards
// palm), thumb [spread(y), base, mid, tip].
export const POSES = {
  open: { f: [[-0.1, -0.1, -0.05], [-0.1, -0.1, -0.05], [-0.1, -0.1, -0.05], [-0.1, -0.1, -0.05]], t: [0.75, -0.1, -0.1, -0.05] },
  grip: { f: [[-1.3, -1.4, -0.9], [-1.35, -1.45, -0.9], [-1.35, -1.45, -0.9], [-1.3, -1.4, -0.9]], t: [0.5, -0.5, -0.6, -0.4] },
  trigger: { f: [[-0.55, -0.9, -0.5], [-1.35, -1.45, -0.9], [-1.35, -1.45, -0.9], [-1.3, -1.4, -0.9]], t: [0.45, -0.5, -0.7, -0.5] },
  support: { f: [[-0.9, -1.1, -0.6], [-1.0, -1.15, -0.6], [-1.05, -1.2, -0.6], [-1.1, -1.2, -0.6]], t: [0.9, -0.2, -0.3, -0.2] },
  cup: { f: [[-0.6, -0.7, -0.4], [-0.6, -0.7, -0.4], [-0.6, -0.7, -0.4], [-0.6, -0.7, -0.4]], t: [0.8, -0.3, -0.4, -0.3] },
  pinch: { f: [[-0.9, -1.0, -0.6], [-1.1, -1.3, -0.8], [-1.3, -1.5, -0.9], [-1.4, -1.5, -0.9]], t: [0.35, -0.6, -0.8, -0.5] },
  point: { f: [[-0.1, -0.1, -0.05], [-1.35, -1.45, -0.9], [-1.35, -1.45, -0.9], [-1.3, -1.4, -0.9]], t: [0.45, -0.5, -0.7, -0.5] },
};

// Apply (and optionally blend between) poses.
export function poseHand(h, a, b = null, k = 0) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const va = a.f[i][j], vb = b ? b.f[i][j] : va;
    h.fingers[i][j].rotation.x = va + (vb - va) * k;
  }
  const t = (idx) => a.t[idx] + ((b ? b.t[idx] : a.t[idx]) - a.t[idx]) * k;
  h.thumbMount.rotation.y = t(0);
  for (let j = 0; j < 3; j++) h.thumb[j].rotation.x = t(j + 1);
}

// Sleeve/forearm that stretches from an elbow point to the wrist.
export class Forearm {
  constructor(M) {
    const g = new THREE.CylinderGeometry(0.036, 0.05, 1, 16, 1, true);
    g.translate(0, 0.5, 0); // base at elbow (0), top at wrist (1)
    this.mesh = new THREE.Mesh(boxUV(g, 25), M.sleeve);
    this.mesh.material = M.sleeve;
    this.mesh.frustumCulled = false;
    const cuffG = new THREE.CylinderGeometry(0.04, 0.038, 0.03, 16); cuffG.translate(0, -0.012, 0);
    this.cuff = new THREE.Mesh(cuffG, M.sleeve);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._d = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  // elbow and wrist in the same (viewmodel) space
  update(elbow, wrist) {
    const d = this._d.subVectors(wrist, elbow); const len = d.length();
    this.mesh.position.copy(elbow);
    this.mesh.quaternion.setFromUnitVectors(this.up, d.normalize());
    this.mesh.scale.set(1, len, 1);
    this.cuff.position.copy(wrist); this.cuff.quaternion.copy(this.mesh.quaternion);
  }
}
