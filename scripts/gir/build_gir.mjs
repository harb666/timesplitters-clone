// GIR (SIR unit, Invader Zim) — procedural game-ready model, exported as GLB.
// Fan asset for private, non-commercial use.
//
// Units: metres, +Y up, character faces +Z, feet on y = 0, total height 0.60 m
// (antenna tip). Built from closed primitives (rounded boxes, lathes,
// capsules, spheres) so every part is watertight and UV-mapped.
// One skeleton (humanoid naming) drives several skinned meshes, one per
// logical part; each part is rigidly bound to its bone (robot joints).
// Animations: Idle, Walk, Run (bouncy, arms flailing), Jump, Duty (red eyes pose).
//
// Usage (needs `npm i three@0.186` in this folder; writes src/models/gir.glb):
//   node build_gir.mjs ../../src/models/gir.glb --variant=green
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'node:fs';

// --- Node has Blob but not FileReader (the exporter uses it for .glb)
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend && this.onloadend(); this.onload && this.onload({ target: this }); }); } readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); } };

const out = process.argv[2] || 'gir.glb';
const variant = (process.argv.find((a) => a.startsWith('--variant=')) || '').split('=')[1] || 'canon';

// ------------------------------------------------------------------ materials
const PAL = variant === 'green'
  ? { metal: '#4f9c83', dark: '#23332e', light: '#2ee6d6', eye: '#f4f6f6', pupils: true }
  : { metal: '#a3adb5', dark: '#3a4046', light: '#39f2ea', eye: '#39f2ea', pupils: false };
const MAT = {
  Metal: new THREE.MeshStandardMaterial({ name: 'GIR_Metal', color: PAL.metal, metalness: 0.25, roughness: 0.42 }),
  Joint: new THREE.MeshStandardMaterial({ name: 'GIR_Joint', color: PAL.dark, metalness: 0.4, roughness: 0.5 }),
  Light: new THREE.MeshStandardMaterial({ name: 'GIR_Light', color: PAL.light, emissive: PAL.light, emissiveIntensity: 0.8, roughness: 0.3 }),
  Eye: new THREE.MeshStandardMaterial({ name: 'GIR_Eye', color: PAL.eye, emissive: PAL.pupils ? '#000000' : PAL.eye, emissiveIntensity: PAL.pupils ? 0 : 1.0, roughness: 0.25 }),
  EyeRim: new THREE.MeshStandardMaterial({ name: 'GIR_EyeRim', color: '#101315', roughness: 0.5 }),
  Pupil: new THREE.MeshStandardMaterial({ name: 'GIR_Pupil', color: '#050505', roughness: 0.3 }),
  Mouth: new THREE.MeshStandardMaterial({ name: 'GIR_Mouth', color: '#0b0d0e', roughness: 0.6 }),
};

// ------------------------------------------------------------------ proportions
// GIR is mostly head: big squat rounded head (~45% of height incl. antenna),
// small boxy torso, thin tube arms and legs with ball joints, stubby feet.
const H = {
  footY: 0.0, ankleY: 0.035, kneeY: 0.095, hipY: 0.155, hipX: 0.035,
  torsoY0: 0.15, torsoY1: 0.28, torsoW: 0.14, torsoD: 0.105,
  shoulderY: 0.262, shoulderX: 0.083,
  neckY: 0.285, headY0: 0.30, headY1: 0.52, headW: 0.30, headD: 0.225,
  antennaY: 0.52,
};
const armLen = { upper: 0.07, fore: 0.065 };

// ------------------------------------------------------------------ skeleton
const bones = {};
function bone(name, parent, pos) {
  const b = new THREE.Bone(); b.name = name;
  const wp = new THREE.Vector3(...pos);
  if (parent) { b.position.copy(wp).sub(bones[parent].userData.wp); bones[parent].add(b); } else b.position.copy(wp);
  b.userData.wp = wp; bones[name] = b; return b;
}
bone('Hips', null, [0, H.hipY, 0]);
bone('Spine', 'Hips', [0, 0.2, 0]);
bone('Chest', 'Spine', [0, 0.25, 0]);
bone('Neck', 'Chest', [0, H.neckY, 0]);
bone('Head', 'Neck', [0, H.headY0 + 0.02, 0]);
bone('Jaw', 'Head', [0, 0.37, 0.1]);
bone('Eye_L', 'Head', [0.062, 0.43, 0.105]);
bone('Eye_R', 'Head', [-0.062, 0.43, 0.105]);
bone('Antenna', 'Head', [0, H.antennaY, -0.01]);
bone('Antenna_Tip', 'Antenna', [0, 0.575, -0.01]);
for (const [s, n] of [[1, 'Left'], [-1, 'Right']]) {
  const x = s * H.shoulderX;
  bone(n + 'Shoulder', 'Chest', [s * 0.068, H.shoulderY, 0]);
  bone(n + 'UpperArm', n + 'Shoulder', [x, H.shoulderY, 0]);
  bone(n + 'LowerArm', n + 'UpperArm', [x, H.shoulderY - armLen.upper, 0]);
  bone(n + 'Hand', n + 'LowerArm', [x, H.shoulderY - armLen.upper - armLen.fore, 0]);
  bone(n + 'UpperLeg', 'Hips', [s * H.hipX, H.hipY, 0]);
  bone(n + 'LowerLeg', n + 'UpperLeg', [s * H.hipX, H.kneeY, 0]);
  bone(n + 'Foot', n + 'LowerLeg', [s * H.hipX, H.ankleY, 0]);
  bone(n + 'Toes', n + 'Foot', [s * H.hipX, 0.012, 0.045]);
}

// ------------------------------------------------------------------ parts
const parts = []; // { name, geo (world space), mat, bone }
function add(name, geo, mat, boneName) { parts.push({ name, geo: dropDegenerate(geo), mat, bone: boneName }); }
// Remove zero-area triangles (the collapsed poles of spheres, capsules and lathes)
function dropDegenerate(g) {
  if (!g.index) g = mergeVertices(g, 1e-7);
  const p = g.attributes.position, id = new Map(), key = new Int32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`;
    if (!id.has(k)) id.set(k, id.size); key[i] = id.get(k);
  }
  const src = g.index.array, out = [];
  for (let i = 0; i < src.length; i += 3) {
    const a = key[src[i]], b = key[src[i + 1]], c = key[src[i + 2]];
    if (a !== b && b !== c && a !== c) out.push(src[i], src[i + 1], src[i + 2]);
  }
  if (out.length !== src.length) {
    const groups = g.groups; g.setIndex(out); g.clearGroups();
    if (groups.length > 1) console.warn('dropDegenerate: groups cleared');
  }
  return g;
}
const T = (g, x, y, z) => g.translate(x, y, z);
function capsuleBetween(a, b, r, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, L), 3, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return T(g, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

// Head: squat rounded box, very slightly wider at the top and flattened at the
// back of the face so the eyes sit on a nearly flat front.
{
  const h = H.headY1 - H.headY0;
  const g = new RoundedBoxGeometry(H.headW, h, H.headD, 7, 0.075);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h + 0.5;                      // 0 bottom .. 1 top
    p.setX(i, p.getX(i) * (0.94 + 0.08 * y));
  }
  // keep RoundedBox's own smooth normals (the taper is tiny); recomputing them
  // would split the rounded edges into visible facets
  add('Head', T(g, 0, (H.headY0 + H.headY1) / 2, 0), MAT.Metal, 'Head');
}
// Eyes: large round lenses in dark rims, almost touching, upper half of the face
for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
  const ex = s * 0.062, ey = 0.43, ez = H.headD / 2 - 0.004;
  const rim = new THREE.CylinderGeometry(0.056, 0.056, 0.014, 32); rim.rotateX(Math.PI / 2);
  add('EyeRim_' + n, T(rim, ex, ey, ez), MAT.EyeRim, 'Head');
  // lens: shallow dome (lathe, closed at the axis)
  const prof = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI / 2; prof.push(new THREE.Vector2(Math.sin(a) * 0.047, Math.cos(a) * 0.012)); }
  prof.push(new THREE.Vector2(0.047, -0.004), new THREE.Vector2(0, -0.004));
  const lens = new THREE.LatheGeometry(prof.reverse(), 32); lens.rotateX(Math.PI / 2);
  add('Eye_' + n, T(lens, ex, ey, ez + 0.007), MAT.Eye, 'Eye_' + n);
  if (PAL.pupils) {
    const pu = new THREE.SphereGeometry(0.018, 16, 10); pu.scale(1, 1, 0.35);
    add('Pupil_' + n, T(pu, ex - s * 0.006, ey - 0.004, ez + 0.02), MAT.Pupil, 'Eye_' + n);
  }
}
// Mouth: thin dark slot under the eyes (bound to Jaw for talking/screaming)
{
  const g = new RoundedBoxGeometry(0.075, 0.012, 0.012, 2, 0.005);
  add('Mouth', T(g, 0, 0.352, H.headD / 2 - 0.002), MAT.Mouth, 'Jaw');
}
// Antenna: thin stalk with a ball on the end
add('Antenna_Stalk', capsuleBetween([0, H.antennaY - 0.005, -0.01], [0, 0.575, -0.01], 0.006, 8), MAT.Joint, 'Antenna');
add('Antenna_Ball', T(new THREE.SphereGeometry(0.014, 14, 10), 0, 0.584, -0.01), MAT.Light, 'Antenna_Tip');
// Neck
add('Neck', T(new THREE.CylinderGeometry(0.022, 0.026, 0.035, 14), 0, H.neckY + 0.005, 0), MAT.Joint, 'Neck');
// Torso: small rounded box, lit square panel on the chest
{
  const h = H.torsoY1 - H.torsoY0;
  const g = new RoundedBoxGeometry(H.torsoW, h, H.torsoD, 4, 0.03);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h + 0.5; p.setX(i, p.getX(i) * (0.9 + 0.12 * y)); }   // slightly wider at the shoulders
  add('Torso', T(g, 0, (H.torsoY0 + H.torsoY1) / 2, 0), MAT.Metal, 'Chest');
  add('ChestLight', T(new RoundedBoxGeometry(0.038, 0.038, 0.008, 2, 0.004), 0, 0.226, H.torsoD / 2 + 0.001), MAT.Light, 'Chest');
  add('Pelvis', T(new RoundedBoxGeometry(0.1, 0.03, 0.08, 3, 0.012), 0, H.torsoY0 + 0.005, 0), MAT.Joint, 'Hips');
}
// Arms: shoulder ball, thin tube segments, elbow ball, little three-fingered hands
for (const [s, n] of [[1, 'Left'], [-1, 'Right']]) {
  const x = s * H.shoulderX, y0 = H.shoulderY, y1 = y0 - armLen.upper, y2 = y1 - armLen.fore;
  add(n + '_ShoulderBall', T(new THREE.SphereGeometry(0.02, 14, 10), x, y0, 0), MAT.Joint, n + 'UpperArm');
  add(n + '_UpperArm', capsuleBetween([x, y0, 0], [x, y1, 0], 0.011), MAT.Metal, n + 'UpperArm');
  add(n + '_Elbow', T(new THREE.SphereGeometry(0.014, 12, 8), x, y1, 0), MAT.Joint, n + 'LowerArm');
  add(n + '_LowerArm', capsuleBetween([x, y1, 0], [x, y2, 0], 0.011), MAT.Metal, n + 'LowerArm');
  const palm = new THREE.SphereGeometry(0.019, 14, 10); palm.scale(1, 0.85, 0.8);
  add(n + '_Palm', T(palm, x, y2 - 0.012, 0), MAT.Metal, n + 'Hand');
  for (const [fx, fz] of [[-0.009, 0.008], [0.009, 0.008], [0, -0.012]]) {   // two fingers + thumb
    add(n + '_Finger', capsuleBetween([x + fx * s, y2 - 0.018, fz], [x + fx * s * 1.3, y2 - 0.042, fz * 1.25], 0.0055, 6), MAT.Metal, n + 'Hand');
  }
}
// Legs: hip ball, thin tubes, knee ball, rounded boot-like feet pointing forward
for (const [s, n] of [[1, 'Left'], [-1, 'Right']]) {
  const x = s * H.hipX;
  add(n + '_HipBall', T(new THREE.SphereGeometry(0.017, 12, 8), x, H.hipY - 0.005, 0), MAT.Joint, n + 'UpperLeg');
  add(n + '_Thigh', capsuleBetween([x, H.hipY, 0], [x, H.kneeY, 0], 0.012), MAT.Metal, n + 'UpperLeg');
  add(n + '_Knee', T(new THREE.SphereGeometry(0.015, 12, 8), x, H.kneeY, 0), MAT.Joint, n + 'LowerLeg');
  add(n + '_Shin', capsuleBetween([x, H.kneeY, 0], [x, H.ankleY + 0.01, 0], 0.012), MAT.Metal, n + 'LowerLeg');
  const foot = new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);   // dome
  foot.scale(0.95, 1.1, 1.55);
  const sole = new THREE.CircleGeometry(0.03, 16); sole.rotateX(Math.PI / 2); sole.scale(0.95, 1, 1.55);      // closes the dome
  const fg = mergeParts([foot, sole]);
  add(n + '_Foot', T(fg, x, 0.0, 0.018), MAT.Metal, n + 'Foot');
}
function mergeParts(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = [], nor = [], uv = [], idx = []; let off = 0;
  for (const g0 of list) { const g = g0.index ? g0 : g0; const p = g.attributes.position, q = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(q.getX(i), q.getY(i), q.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    const I = g.index ? g.index.array : [...Array(p.count).keys()]; for (const i of I) idx.push(i + off); off += p.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); void n; return g;
}

// ------------------------------------------------------------------ assemble
const scene = new THREE.Scene(); scene.name = 'GIR';
const root = new THREE.Group(); root.name = 'GIR'; scene.add(root);
root.add(bones.Hips);
root.updateMatrixWorld(true);
const boneList = Object.values(bones);
const skeleton = new THREE.Skeleton(boneList);
let tris = 0;
for (const pt of parts) {
  // weld duplicate seam vertices where the primitive allows (keeps UV seams)
  let g = pt.geo.index ? pt.geo : pt.geo;
  g = mergeVertices(g, 1e-6);
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  const n = g.attributes.position.count, bi = boneList.indexOf(bones[pt.bone]);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.computeBoundingBox(); g.computeBoundingSphere();
  tris += (g.index ? g.index.count : n) / 3;
  const m = new THREE.SkinnedMesh(g, pt.mat); m.name = pt.name;
  root.add(m); m.bind(skeleton, new THREE.Matrix4());
}

// ------------------------------------------------------------------ animations
const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
function clip(name, dur, keys) {
  // keys: { boneName: { rot: t => [x,y,z], pos: t => [dx,dy,dz] } } sampled at 30 fps
  const tracks = [], N = Math.round(dur * 30);
  for (const [bn, k] of Object.entries(keys)) {
    const b = bones[bn], times = [], q = [], p = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * dur, ph = (i / N) * Math.PI * 2; times.push(t);
      if (k.rot) { const r = k.rot(ph, t); const qq = b.quaternion.clone().multiply(E(...r)); q.push(qq.x, qq.y, qq.z, qq.w); }
      if (k.pos) { const d = k.pos(ph, t); p.push(b.position.x + d[0], b.position.y + d[1], b.position.z + d[2]); }
    }
    if (k.rot) tracks.push(new THREE.QuaternionKeyframeTrack(bn + '.quaternion', times, q));
    if (k.pos) tracks.push(new THREE.VectorKeyframeTrack(bn + '.position', times, p));
  }
  return new THREE.AnimationClip(name, dur, tracks);
}
const S = Math.sin, C = Math.cos;
const clips = [
  clip('Idle', 2.4, {
    Hips: { pos: (p) => [0, S(p * 2) * 0.002, 0] },
    Head: { rot: (p) => [S(p) * 0.04, S(p * 0.5) * 0.12, S(p) * 0.05] },
    Antenna: { rot: (p) => [0, 0, S(p * 2) * 0.12] },
    Antenna_Tip: { rot: (p) => [0, 0, S(p * 2 + 1) * 0.15] },
    LeftUpperArm: { rot: (p) => [S(p) * 0.08, 0, 0.1] }, RightUpperArm: { rot: (p) => [-S(p) * 0.08, 0, -0.1] },
    LeftLowerArm: { rot: () => [-0.2, 0, 0] }, RightLowerArm: { rot: () => [-0.2, 0, 0] },
  }),
  clip('Walk', 0.8, {
    Hips: { pos: (p) => [0, Math.abs(S(p)) * 0.008, 0], rot: (p) => [0, S(p) * 0.08, 0] },
    Head: { rot: (p) => [0.04, -S(p) * 0.06, S(p) * 0.04] },
    Antenna: { rot: (p) => [S(p * 2) * 0.15, 0, 0] },
    LeftUpperLeg: { rot: (p) => [S(p) * 0.55, 0, 0] }, RightUpperLeg: { rot: (p) => [-S(p) * 0.55, 0, 0] },
    LeftLowerLeg: { rot: (p) => [Math.max(0, -C(p)) * 0.6, 0, 0] }, RightLowerLeg: { rot: (p) => [Math.max(0, C(p)) * 0.6, 0, 0] },
    LeftUpperArm: { rot: (p) => [-S(p) * 0.6, 0, 0.12] }, RightUpperArm: { rot: (p) => [S(p) * 0.6, 0, -0.12] },
    LeftLowerArm: { rot: () => [-0.3, 0, 0] }, RightLowerArm: { rot: () => [-0.3, 0, 0] },
  }),
  // GIR's run: fast, bouncy, arms flailing up over his head
  clip('Run', 0.4, {
    Hips: { pos: (p) => [0, Math.abs(S(p)) * 0.03, 0], rot: (p) => [0.18, S(p) * 0.12, S(p) * 0.08] },
    Chest: { rot: (p) => [0.1, -S(p) * 0.1, 0] },
    Head: { rot: (p) => [-0.15 + S(p * 2) * 0.08, S(p) * 0.15, S(p) * 0.12] },
    Jaw: { pos: () => [0, -0.004, 0] },
    Antenna: { rot: (p) => [-0.5 + S(p * 2) * 0.35, 0, S(p) * 0.3] },
    Antenna_Tip: { rot: (p) => [-0.4 + S(p * 2 + 1) * 0.4, 0, 0] },
    LeftUpperLeg: { rot: (p) => [S(p) * 0.9 - 0.15, 0, 0] }, RightUpperLeg: { rot: (p) => [-S(p) * 0.9 - 0.15, 0, 0] },
    LeftLowerLeg: { rot: (p) => [Math.max(0, -C(p)) * 1.1, 0, 0] }, RightLowerLeg: { rot: (p) => [Math.max(0, C(p)) * 1.1, 0, 0] },
    LeftUpperArm: { rot: (p) => [-2.6 + S(p * 2) * 0.7, S(p) * 0.4, 0.5 + C(p * 2) * 0.35] },
    RightUpperArm: { rot: (p) => [-2.6 - S(p * 2) * 0.7, -S(p) * 0.4, -0.5 - C(p * 2) * 0.35] },
    LeftLowerArm: { rot: (p) => [-0.4 + S(p * 2 + 1) * 0.5, 0, 0] }, RightLowerArm: { rot: (p) => [-0.4 - S(p * 2 + 1) * 0.5, 0, 0] },
  }),
  clip('Jump', 0.9, {
    Hips: { pos: (p, t) => { const k = t / 0.9; return [0, k < 0.15 ? -k * 0.12 : Math.max(0, S((k - 0.15) / 0.85 * Math.PI)) * 0.18 - (k < 0.15 ? 0 : 0), 0]; } },
    LeftUpperLeg: { rot: (p, t) => [t < 0.14 ? -0.6 : -0.3, 0, 0] }, RightUpperLeg: { rot: (p, t) => [t < 0.14 ? -0.6 : -0.3, 0, 0] },
    LeftLowerLeg: { rot: (p, t) => [t < 0.14 ? 1.1 : 0.6, 0, 0] }, RightLowerLeg: { rot: (p, t) => [t < 0.14 ? 1.1 : 0.6, 0, 0] },
    LeftUpperArm: { rot: (p, t) => [t < 0.14 ? 0.3 : -2.8, 0, 0.3] }, RightUpperArm: { rot: (p, t) => [t < 0.14 ? 0.3 : -2.8, 0, -0.3] },
    Antenna: { rot: (p) => [S(p) * 0.4, 0, 0] },
  }),
  // "Duty mode": stands to attention, salute
  clip('Duty', 1.0, {
    Hips: { pos: () => [0, 0.004, 0] },
    Head: { rot: () => [-0.05, 0, 0] },
    RightUpperArm: { rot: () => [-2.2, 0, -0.9] }, RightLowerArm: { rot: () => [-1.6, 0, 0] },
    LeftUpperArm: { rot: () => [0, 0, 0.05] },
    Antenna: { rot: () => [0, 0, 0] },
  }),
];

// ------------------------------------------------------------------ export
const exporter = new GLTFExporter();
exporter.parse(scene, (buf) => {
  fs.writeFileSync(out, Buffer.from(buf));
  console.log(JSON.stringify({ out, variant, bytes: buf.byteLength, triangles: tris, meshes: parts.length, bones: boneList.length, clips: clips.map((c) => c.name) }));
}, (e) => { console.error(e); process.exit(1); }, { binary: true, animations: clips });
