// Street furniture, trees and parked cars.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { Frame, rng } from './buildings.js';
import { boxUV } from '../../models/shapes.js';

// Street-name plate texture (Sheffield style: black on white, district
// underneath). One atlas for every named road.
export function nameAtlas(names) {
  const W = 384, H = 96, cols = 2, rows = Math.ceil(names.length / cols);
  const c = document.createElement('canvas'); c.width = W * cols; c.height = H * rows; const g = c.getContext('2d');
  names.forEach((n, i) => {
    const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    g.fillStyle = '#fbfbf6'; g.fillRect(x, y, W, H); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(x + 4, y + 4, W - 8, H - 8);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 42px Arial, sans-serif'; g.fillText(n.toUpperCase(), x + W / 2, y + 38, W - 30);
    g.font = 'bold 18px Arial, sans-serif'; g.fillText(n.includes('Herries') || n.includes('Firth') || (n.includes('Barnsley') && false) ? 'S5' : 'S4', x + W / 2, y + 74);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, cell: (i) => ({ u0: (i % cols) / cols, u1: ((i % cols) + 1) / cols, v1: 1 - Math.floor(i / cols) / rows, v0: 1 - (Math.floor(i / cols) + 1) / rows }) };
}
function quadUV(w, h, c) {
  const g = new THREE.BoxGeometry(w, h, 0.04); const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; const a = uv.getX(i), b = uv.getY(i); if (f === 4 || f === 5) uv.setXY(i, c.u0 + (c.u1 - c.u0) * (f === 5 ? 1 - a : a), c.v0 + (c.v1 - c.v0) * b); else uv.setXY(i, c.u0 + 0.001, c.v0 + 0.001); }
  return g;
}

export function buildStreetscape(batch, M, world, net, J, occ, isBlocked, places) {
  const R = rng(4242);
  const trees = [];
  // ---- lamp posts: tall galvanised columns with LED heads ----
  for (const r of net.roads) {
    const gap = r.kind === 'r' ? 34 : 28;
    let side = 1;
    for (let s = 10; s < r.length - 5; s += gap) {
      const off = side * (r.half + r.pave - 0.45);
      const p = net.pointAt(r, s, off, {});
      if (net.onCarriageway(p.x, p.z, r, 1) || isBlocked(p.x, p.z, true)) { side = -side; continue; }
      const f = new Frame(batch, p.x, p.z, Math.atan2(p.tx, p.tz), G(p.x, p.z));
      const h = r.kind === 'r' ? 6 : 8;
      f.geo(M.galv, new THREE.CylinderGeometry(0.07, 0.11, h, 8), 0, h / 2, 0, { color: '#9ea4a8' });
      f.box(M.galv, -side * 0.5, h - 0.05, 0, 1.1, 0.08, 0.1, { color: '#9ea4a8' });
      f.box(M.lampHead, -side * 1.0, h - 0.12, 0, 0.55, 0.12, 0.28, { color: '#ffffff' });
      world.addBox(p.x - 0.12, p.x + 0.12, f.y0 - 1, f.y0 + h, p.z - 0.12, p.z + 0.12, 'lamp');
      side = -side;
    }
  }
  // ---- traffic lights + guard railings at the Fir Vale junction ----
  const [jx, jz] = J;
  for (const r of net.roads) {
    const S = r.samples; const atStart = Math.hypot(S[0].x - jx, S[0].z - jz) < 3, atEnd = Math.hypot(S[S.length - 1].x - jx, S[S.length - 1].z - jz) < 3;
    if (!atStart && !atEnd) continue;
    const s = atStart ? 16 : r.length - 16;
    const p = net.pointAt(r, s, (atStart ? -1 : 1) * (r.half + 0.6), {});
    const f = new Frame(batch, p.x, p.z, Math.atan2(p.tx, p.tz) + (atStart ? Math.PI : 0), G(p.x, p.z));
    f.geo(M.darkMetal, new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8), 0, 1.8, 0, { color: '#222' });
    f.box(M.darkMetal, 0, 3.2, 0.15, 0.32, 0.95, 0.22, { color: '#1a1a1a' });
    const lit = ['#ff2a1a', '#402a00', '#003a10'];
    [3.5, 3.2, 2.9].forEach((y, i) => f.box(M.signalLens, 0, y, 0.27, 0.18, 0.18, 0.03, { color: lit[i] }));
    f.box(M.darkMetal, 0, 1.1, -0.12, 0.22, 0.32, 0.12, { color: '#dcdc50', detail: true }); // push-button box
    world.addBox(p.x - 0.15, p.x + 0.15, f.y0 - 1, f.y0 + 3.6, p.z - 0.15, p.z + 0.15, 'pole');
    // pedestrian guard railings along the pavement edge near the junction
    for (let k = 0; k < 5; k++) {
      const ss = atStart ? 8 + k * 2 : r.length - 8 - k * 2;
      for (const sd of [1, -1]) {
        const q = net.pointAt(r, ss, sd * (r.half + 0.35), {});
        if (net.onCarriageway(q.x, q.z, r, 0.2)) continue;
        batch.box(M.galv, q.x, G(q.x, q.z) + 0.95, q.z, 0.05, 0.9, 2.0, { color: '#c2c7ca', ry: Math.atan2(q.tx, q.tz), detail: true });
        batch.box(M.galv, q.x, G(q.x, q.z) + 0.55, q.z, 0.06, 1.1, 0.06, { color: '#c2c7ca', ry: Math.atan2(q.tx, q.tz), detail: true });
        world.addOBB(q.x, q.z, 0.08, 1.0, Math.atan2(q.tx, q.tz), G(q.x, q.z) - 1, G(q.x, q.z) + 1.0, 'barrier');
      }
    }
  }
  // blue direction sign at the junction
  { const r = net.byName('Barnsley Road', 0), p = net.pointAt(r, r.length - 45, r.half + 2.2, {}), g = G(p.x, p.z);
    const f = new Frame(batch, p.x, p.z, Math.atan2(p.tx, p.tz) + Math.PI, g);
    for (const x of [-1.2, 1.2]) f.box(M.galv, x, 1.6, 0, 0.1, 3.2, 0.1, { color: '#9ea4a8' });
    f.box(M.roadSign, 0, 2.6, 0.06, 3.2, 1.8, 0.06, { color: '#ffffff' });
    world.addOBB(p.x, p.z, 1.6, 0.2, Math.atan2(p.tx, p.tz), g - 1, g + 3.5, 'pole'); }
  // ---- bus stops ----
  const stops = [];
  for (const b of places.busStops) {
    const r = net.byName(b.road, b.i); if (!r) continue;
    const p = net.pointAt(r, r.length * b.t, b.side * (r.half + r.pave - 0.9), {});
    const ry = Math.atan2(p.tx, p.tz) + (b.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const f = new Frame(batch, p.x, p.z, ry, G(p.x, p.z));
    f.box(M.shelterGlass, 0, 1.3, -0.7, 3.6, 2.2, 0.04, { color: '#ffffff' });
    for (const sx of [-1.8, 1.8]) f.box(M.shelterGlass, sx, 1.3, 0, 0.04, 2.2, 1.4, { color: '#ffffff' });
    for (const [sx, sz] of [[-1.8, -0.7], [1.8, -0.7], [-1.8, 0.7], [1.8, 0.7]]) f.box(M.darkMetal, sx, 1.25, sz, 0.08, 2.5, 0.08, { color: '#3b3f44' });
    f.box(M.darkMetal, 0, 2.55, 0, 3.8, 0.1, 1.6, { color: '#3b3f44' });
    f.box(M.darkMetal, 0, 0.55, -0.5, 2.4, 0.06, 0.3, { color: '#6e7b87' });
    f.box(M.busFlag, 2.5, 2.6, 0.5, 0.6, 0.45, 0.04, { color: '#ffffff' }); f.box(M.galv, 2.5, 1.5, 0.5, 0.08, 3, 0.08, { color: '#888' });
    world.addOBB(p.x, p.z, 1.9, 0.75, ry, G(p.x, p.z) - 1, G(p.x, p.z) + 2.6, 'shelter');
    stops.push({ x: p.x, z: p.z });
  }
  // ---- street name plates on posts near each named road's ends ----
  const names = [...new Set(net.roads.map((r) => r.name).filter(Boolean))];
  const plates = nameAtlas(names);
  M.names.map = plates.tex; M.names.needsUpdate = true;
  for (const r of net.roads) {
    if (!r.name) continue;
    const idx = names.indexOf(r.name);
    for (const s of [8, r.length - 8]) {
      const p = net.pointAt(r, s, (s < 10 ? 1 : -1) * (r.half + r.pave - 0.3), {});
      if (net.onCarriageway(p.x, p.z, r, 0.5)) continue;
      const g = G(p.x, p.z), ry = Math.atan2(p.tx, p.tz) + Math.PI / 2;
      const f = new Frame(batch, p.x, p.z, ry, g);
      for (const x of [-0.8, 0.8]) f.box(M.darkMetal, x, 0.55, 0, 0.07, 1.1, 0.07, { color: '#222', detail: true });
      f.geo(M.names, quadUV(1.9, 0.48, plates.cell(idx)), 0, 1.15, 0, {});
    }
  }
  // ---- litter bins, post box, cabinets outside the shops ----
  for (const r of net.roads) for (const [a, b] of r.shops || []) {
    for (let s = r.length * a + 12; s < r.length * b; s += 36) {
      const p = net.pointAt(r, s, (R() < 0.5 ? 1 : -1) * (r.half + 0.6), {});
      if (net.onCarriageway(p.x, p.z, r, 0.3)) continue;
      const g = G(p.x, p.z);
      batch.box(M.darkMetal, p.x, g + 0.5, p.z, 0.55, 1.0, 0.55, { color: '#1f3b2a' });
      world.addBox(p.x - 0.3, p.x + 0.3, g - 1, g + 1, p.z - 0.3, p.z + 0.3, 'bin');
    }
  }
  { const r = net.byName('Page Hall Road'); const p = net.pointAt(r, r.length * 0.7, -(r.half + 0.8), {}); const g = G(p.x, p.z);
    const f = new Frame(batch, p.x, p.z, 0, g);
    f.geo(M.postbox, new THREE.CylinderGeometry(0.3, 0.3, 1.45, 16), 0, 0.72, 0, { color: '#c4161c' });
    f.geo(M.postbox, new THREE.CylinderGeometry(0.34, 0.34, 0.12, 16), 0, 1.5, 0, { color: '#a01217' });
    world.addBox(p.x - 0.35, p.x + 0.35, g - 1, g + 1.6, p.z - 0.35, p.z + 0.35, 'postbox'); }
  for (const r of net.roads) if (r.kind !== 'a') {
    for (let s = 25; s < r.length; s += 90) {
      const p = net.pointAt(r, s, -(r.half + r.pave - 0.35), {}); if (net.onCarriageway(p.x, p.z, r, 1)) continue;
      const g = G(p.x, p.z);
      batch.box(M.cabinet, p.x, g + 0.6, p.z, 1.2, 1.2, 0.45, { color: '#2e5e3e', ry: Math.atan2(p.tx, p.tz) + Math.PI / 2 });
      world.addOBB(p.x, p.z, 0.6, 0.25, Math.atan2(p.tx, p.tz) + Math.PI / 2, g - 1, g + 1.2, 'cabinet');
    }
  }
  // ---- street trees along Herries Road verge ----
  { const r = net.byName('Herries Road'); for (let s = 25; s < r.length; s += 14) { const p = net.pointAt(r, s, (r.half + r.pave + 2.5), {}); if (!isBlocked(p.x, p.z, true)) continue; trees.push([p.x, p.z, 0.9 + R() * 0.3]); } }
  return { trees, stops };
}

// ------------------------------------------------------------------ trees
// Broadleaf street trees: trunk + several lumpy crown blobs.
export function plantTrees(batch, M, world, list) {
  const R = rng(31);
  for (const [x, z, s] of list) {
    const g = G(x, z);
    const f = new Frame(batch, x, z, R() * 6, g);
    f.geo(M.bark, boxUV(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 4.5 * s, 7), 2), 0, 2.25 * s, 0, { color: '#6b5645' });
    for (let k = 0; k < 5; k++) {
      const geo = new THREE.IcosahedronGeometry((1.6 + R() * 1.1) * s, k < 2 ? 1 : 0);
      const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const n = 0.85 + Math.sin(p.getX(i) * 3 + k) * 0.08 + Math.cos(p.getZ(i) * 4) * 0.07; p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.9, p.getZ(i) * n); }
      geo.computeVertexNormals();
      f.geo(M.leaves, geo, (R() - 0.5) * 2.6 * s, (5 + R() * 2.2) * s, (R() - 0.5) * 2.6 * s, { color: ['#4f7d3a', '#5e8a41', '#43702f', '#6b9446'][(R() * 4) | 0] });
    }
    world.addBox(x - 0.3 * s, x + 0.3 * s, g - 1, g + 4 * s, z - 0.3 * s, z + 0.3 * s, 'tree');
  }
}

// --------------------------------------------------------------- parked cars
// Generic hatchbacks, saloons, estates and vans parked nose-to-tail along
// the terraced streets. Merged into the static batches (no draw-call cost).
const PAINT = ['#1b1c1f', '#e8e8e8', '#9aa1a8', '#6b7075', '#1d3f7a', '#7a1d1d', '#2f5d3a', '#c7b27a', '#3a3f55', '#d0d4d6', '#b71c1c', '#0f4c81'];
export function parkedCar(batch, M, x, z, ry, R) {
  const kind = R() < 0.14 ? 'van' : (R() < 0.45 ? 'saloon' : 'hatch');
  const paint = PAINT[(R() * PAINT.length) | 0];
  const f = new Frame(batch, x, z, ry, G(x, z));
  const L = kind === 'van' ? 5.0 : kind === 'saloon' ? 4.6 : 4.1, Wd = kind === 'van' ? 1.95 : 1.78;
  f.box(M.carPaint, 0, 0.62, 0, Wd, 0.62, L, { color: paint });                                         // lower body
  if (kind === 'van') { f.box(M.carPaint, 0, 1.45, -0.35, Wd - 0.05, 1.1, L - 1.4, { color: paint }); f.box(M.carGlass, 0, 1.5, L / 2 - 1.04, Wd - 0.2, 0.6, 0.06, { color: '#fff', rx: -0.25 }); }
  else {
    const cl = kind === 'saloon' ? 2.3 : 2.1, cz = kind === 'saloon' ? -0.1 : -0.35;
    f.box(M.carPaint, 0, 1.18, cz, Wd - 0.14, 0.5, cl, { color: paint });
    f.box(M.carGlass, 0, 1.18, cz + cl / 2 + 0.02, Wd - 0.24, 0.42, 0.06, { color: '#fff', rx: -0.5 });
    f.box(M.carGlass, 0, 1.18, cz - cl / 2 - 0.02, Wd - 0.24, 0.38, 0.06, { color: '#fff', rx: 0.4 });
    for (const sx of [-1, 1]) f.box(M.carGlass, sx * (Wd / 2 - 0.06), 1.2, cz, 0.04, 0.36, cl - 0.3, { color: '#fff', detail: true });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.geo(M.tyre, new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8, 1, true).rotateZ(Math.PI / 2), sx * (Wd / 2 - 0.1), 0.32, sz * (L / 2 - 0.8), { color: '#1a1a1a', detail: true });
  for (const sx of [-0.55, 0.55]) { f.box(M.lampLens, sx, 0.78, L / 2 + 0.01, 0.4, 0.13, 0.03, { color: '#fff5e0', detail: true }); f.box(M.lampLens, sx, 0.82, -L / 2 - 0.01, 0.4, 0.13, 0.03, { color: '#8a0d0d', detail: true }); }
  f.box(M.plate, 0, 0.5, L / 2 + 0.02, 0.52, 0.11, 0.02, { color: '#f4f4ee', detail: true }); f.box(M.plate, 0, 0.6, -L / 2 - 0.02, 0.52, 0.11, 0.02, { color: '#f2c318', detail: true });
  return { L, Wd };
}

export function parkCars(batch, M, world, net, J, isBlocked) {
  const R = rng(77);
  let n = 0;
  for (const r of net.roads) {
    if (r.kind === 'a') continue; // double yellows on the main roads
    for (const side of [1, -1]) {
      for (let s = 12; s < r.length - 12;) {
        const p = net.pointAt(r, s, side * (r.half - 1.05), {});
        const clear = !net.onCarriageway(p.x, p.z, r, 10) && Math.hypot(p.x - J[0], p.z - J[1]) > 40 && !isBlocked(p.x, p.z, true);
        if (!clear || R() < (r.infill ? 0.55 : 0.22)) { s += 3 + R() * (r.infill ? 12 : 5); continue; }
        const ry = Math.atan2(p.tx, p.tz) + (side > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.05;
        const { L, Wd } = parkedCar(batch, M, p.x, p.z, ry, R);
        world.addOBB(p.x, p.z, Wd / 2, L / 2, ry, G(p.x, p.z) - 0.5, G(p.x, p.z) + 1.45, 'parked-car');
        n++; s += L + 0.8 + R() * 1.5;
      }
    }
  }
  return n;
}
