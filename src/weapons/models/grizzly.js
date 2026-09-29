// LAR Grizzly Mark V .50 AE, from an imported 3-D model ("LAR Grizzly Mark V
// .50AE Handgun" by 8sianDude, CC BY 4.0). The model is one piece, so it's
// cut into the parts that move: the slide (runs back on each shot and locks
// open on empty), the magazine (drops out on a reload), and the frame. One of
// the loose cartridges that came with the model gives the brass case that is
// ejected from the port.
//
// Gun space (same as the other guns): metres, bore on y = 0 pointing -Z,
// right = +X, rear sight at z ~ 0.
import * as THREE from 'three';
import { GLTFLoader } from '../../lib/addons/loaders/GLTFLoader.js';
import GLB from '../../models/grizzly.glb.js';

// model units -> gun space: the model's barrel points 8.1 degrees up, and one
// unit is 113.6 mm (its .50 AE case is 0.287 units; the real one is 32.6 mm)
const K = 0.1136, TH = -0.1418, MC = new THREE.Vector3(0, 1.3206, -1.1596);
export const MUZZLE_Z = -0.233;
// where the slide is (gun space, measured off a gridded side view): above the
// frame rails (it reaches lower in front of the dust cover), from its front
// end back to just in front of the hammer
export const SLIDE = { y: -0.019, yFront: -0.0265, zDust: -0.155, z0: -0.199, z1: 0.009 };
const inSlide = ([, y, z]) => z > SLIDE.z0 && z < SLIDE.z1 && y > (z < SLIDE.zDust ? SLIDE.yFront : SLIDE.y);

function toGun() {
  const m = new THREE.Matrix4().makeTranslation(0, 0, MUZZLE_Z)
    .multiply(new THREE.Matrix4().makeScale(K, K, K))
    .multiply(new THREE.Matrix4().makeRotationX(TH))
    .multiply(new THREE.Matrix4().makeTranslation(-MC.x, -MC.y, -MC.z));
  return m;
}

function parse() {
  const bin = atob(GLB), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

// split an indexed geometry's triangles by a test on their centre
function split(geo, test) {
  const p = geo.attributes.position, I = geo.index.array, a = [], b = [];
  for (let i = 0; i < I.length; i += 3) {
    const u = I[i], v = I[i + 1], w = I[i + 2];
    const c = [(p.getX(u) + p.getX(v) + p.getX(w)) / 3, (p.getY(u) + p.getY(v) + p.getY(w)) / 3, (p.getZ(u) + p.getZ(v) + p.getZ(w)) / 3];
    (test(c) ? a : b).push(u, v, w);
  }
  const A = geo.clone(); A.setIndex(a); const B = geo.clone(); B.setIndex(b);
  return [A, B];
}

// connected pieces of a mesh (the loose rounds: separate cases and bullets)
function pieces(geo) {
  const P = geo.attributes.position, I = geo.index.array, parent = [...Array(P.count).keys()];
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const key = new Map();
  for (let i = 0; i < P.count; i++) { const k = `${P.getX(i).toFixed(5)},${P.getY(i).toFixed(5)},${P.getZ(i).toFixed(5)}`; if (key.has(k)) parent[find(i)] = find(key.get(k)); else key.set(k, i); }
  for (let i = 0; i < I.length; i += 3) { parent[find(I[i + 1])] = find(I[i]); parent[find(I[i + 2])] = find(I[i]); }
  const tris = new Map();
  for (let i = 0; i < I.length; i += 3) { const r = find(I[i]); if (!tris.has(r)) tris.set(r, []); tris.get(r).push(I[i], I[i + 1], I[i + 2]); }
  // each piece gets only its own vertices (so its bounding box is its own)
  return [...tris.values()].map((t) => {
    const remap = new Map(), pos = [], nor = [], uv = [], idx = [], N = geo.attributes.normal, U = geo.attributes.uv;
    for (const i of t) {
      if (!remap.has(i)) { remap.set(i, remap.size); pos.push(P.getX(i), P.getY(i), P.getZ(i)); if (N) nor.push(N.getX(i), N.getY(i), N.getZ(i)); if (U) uv.push(U.getX(i), U.getY(i)); }
      idx.push(remap.get(i));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (N) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
  });
}

export function buildGrizzly() {
  const root = new THREE.Group(); root.name = 'grizzly';
  const frame = new THREE.Group(), slide = new THREE.Group(), magPivot = new THREE.Group(), mag = new THREE.Group();
  root.add(frame, slide, magPivot); magPivot.add(mag);
  const anchor = (name, x, y, z, parent = root) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const muzzle = anchor('muzzle', 0, 0, MUZZLE_Z - 0.004);
  const rearSight = anchor('rearSight', 0, 0.0215, 0.004);
  const frontSight = anchor('frontSight', 0, 0.02, -0.19);
  const ejectPort = anchor('ejectPort', 0.012, 0.009, -0.085, slide);
  magPivot.position.set(0, -0.008, -0.03);
  const model = { root, frame, slide, mag, magPivot, muzzle, rearSight, frontSight, ejectPort, caseGeo: null, caseMat: null };

  model.ready = parse().then((gltf) => {
    const T = toGun(); gltf.scene.updateMatrixWorld(true);
    const meshes = {}; gltf.scene.traverse((o) => { if (o.isMesh) meshes[o.name] = o; });
    const bake = (o) => { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(T, o.matrixWorld)); return g; };
    const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; parent.add(m); return m; };
    // body -> slide + frame (the barrel sticking out the front stays with the frame)
    const body = meshes.lar_grizzly_mkv_lar_grizzly_mkv_0;
    const [sg, fg] = split(bake(body), inSlide);
    add(slide, sg, body.material); add(frame, fg, body.material);
    // magazine, re-centred on its pivot (the top of the mag well) so it can drop out
    const magMesh = meshes.lar_grizzly_mkv_lar_grizzly_mkv_mag_0, mg = bake(magMesh);
    mg.computeBoundingBox(); const bb = mg.boundingBox;
    magPivot.position.set(0, bb.max.y, (bb.min.z + bb.max.z) / 2 - 0.012);
    mg.translate(-magPivot.position.x, -magPivot.position.y, -magPivot.position.z);
    add(mag, mg, magMesh.material);
    // the brass: the tallest loose case, stood upright, base at the origin
    const bul = meshes.bullets_lar_grizzly_mkv_mag_0, parts = pieces(bul.geometry.clone().applyMatrix4(bul.matrixWorld));
    let best = null, bh = 0;
    for (const g of parts) { g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3()); if (s.y > bh && s.y > s.x * 1.8) { bh = s.y; best = g; } }
    if (best) {
      const b = best.boundingBox, c = b.getCenter(new THREE.Vector3());
      best.translate(-c.x, -b.min.y, -c.z); best.scale(K, K, K);
      model.caseGeo = best; model.caseMat = bul.material;
    }
    // sights from the real geometry: top of the rear blade, top of the front post
    sg.computeBoundingBox();
    const P = sg.attributes.position; let ry = -1, rz = 0, fy = -1, fz = 0;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i), z = P.getZ(i); if (z > -0.02 && y > ry) { ry = y; rz = z; } if (z < -0.12 && y > fy) { fy = y; fz = z; } }
    if (ry > 0) rearSight.position.set(0, ry - 0.0015, rz);
    if (fy > 0) frontSight.position.set(0, fy, fz);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return model;
  });
  return model;
}
