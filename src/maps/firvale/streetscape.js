// Street furniture, trees and parked cars.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { Frame, rng } from './buildings.js';
import { boxUV } from '../../models/shapes.js';
import { DRIVABLE } from './roads.js';

// Street-name plate texture (Sheffield style: black on white, district
// underneath). One atlas for every named road.
export function nameAtlas(names) {
  const W = 384, H = 96, cols = 5, rows = Math.ceil(names.length / cols);
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

// Street furniture, placed where the open map data has it (bus stops,
// traffic signals, crossings, benches, post boxes, bins, bollards, walls,
// fences, hedges) plus lamp columns, name plates and cabinets along every
// street.
export function buildStreetscape(batch, M, world, net, osm, beaconMat) {
  const R = rng(4242);
  const onBuilding = (x, z) => world.near(x, z, 0.5, _near).some((b) => b.tag === 'building' && inBox(b, x, z, 0.4));
  // ---- lamp columns along the streets ----
  for (const r of net.roads) {
    if (r.kind === 'f' || r.kind === 's' || r.length < 20) continue;
    const gap = r.kind === 'r' ? 36 : 30;
    let side = 1;
    for (let s = 10; s < r.length - 5; s += gap) {
      const off = side * (r.half + 0.45);
      const p = net.pointAt(r, s, off, {});
      if (net.onCarriageway(p.x, p.z, r, 1) || onBuilding(p.x, p.z)) { side = -side; continue; }
      const f = new Frame(batch, p.x, p.z, Math.atan2(p.tx, p.tz), G(p.x, p.z));
      const h = r.kind === 'r' ? 6 : 8;
      f.geo(M.galv, new THREE.CylinderGeometry(0.07, 0.11, h, 6), 0, h / 2, 0, { color: '#9ea4a8' });
      f.box(M.galv, side * 0.5, h - 0.05, 0, 1.1, 0.08, 0.1, { color: '#9ea4a8' });
      f.box(M.lampHead, side * 1.0, h - 0.12, 0, 0.55, 0.12, 0.28, { color: '#ffffff' });
      world.addBox(p.x - 0.12, p.x + 0.12, f.y0 - 1, f.y0 + h, p.z - 0.12, p.z + 0.12, 'lamp');
      side = -side;
    }
  }
  const at = (pt, filter) => { const n = net.nearest(pt[0], pt[1], null, filter || ((r) => r.kind !== 'f')); return n; };
  const beacons = [];
  const beaconGeo = () => new THREE.SphereGeometry(0.2, 10, 6);
  let shelters = 0;
  for (const it of osm.furniture) {
    const p = it.p;
    if (p.length === 2) {
      const [x, z] = p, g = G(x, z);
      if (it.k === 'bus') {
        const n = at(p, (r) => DRIVABLE.has(r.kind)); if (!n || n.dist > n.road.half + n.road.pave + 6) continue;
        const r = n.road, side = n.side, q = net.pointAt(r, n.s, side * (r.half + Math.max(0.6, r.pave - 0.9)), {});
        const ry = Math.atan2(q.tx, q.tz) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), gq = G(q.x, q.z);
        const f = new Frame(batch, q.x, q.z, ry, gq);
        if (r.kind !== 'r' && r.pave >= 2.2 && shelters < 30 && !onBuilding(q.x, q.z)) {
          shelters++;
          f.box(M.shelterGlass, 0, 1.3, -0.7, 3.6, 2.2, 0.04, { color: '#ffffff' });
          for (const sx of [-1.8, 1.8]) f.box(M.shelterGlass, sx, 1.3, 0, 0.04, 2.2, 1.4, { color: '#ffffff' });
          for (const [sx, sz] of [[-1.8, -0.7], [1.8, -0.7], [-1.8, 0.7], [1.8, 0.7]]) f.box(M.darkMetal, sx, 1.25, sz, 0.08, 2.5, 0.08, { color: '#3b3f44' });
          f.box(M.darkMetal, 0, 2.55, 0, 3.8, 0.1, 1.6, { color: '#3b3f44' });
          f.box(M.darkMetal, 0, 0.55, -0.5, 2.4, 0.06, 0.3, { color: '#6e7b87' });
          world.addOBB(q.x, q.z, 1.9, 0.75, ry, gq - 1, gq + 2.6, 'shelter');
        }
        f.box(M.busFlag, 2.5, 2.6, 0.5, 0.6, 0.45, 0.04, { color: '#ffffff' }); f.box(M.galv, 2.5, 1.5, 0.5, 0.08, 3, 0.08, { color: '#888' });
        // yellow BUS STOP box marking on the carriageway
        const m0 = net.pointAt(r, n.s, side * (r.half - 1.2), {});
        for (const [ds, w, l] of [[-7, 2.2, 0.15], [7, 2.2, 0.15]]) { const m1 = net.pointAt(r, n.s + ds, side * (r.half - 1.2), {}); batch.box(M.line, m1.x, G(m1.x, m1.z) + 0.1, m1.z, w, 0.02, l, { color: '#e6b81c', ry: Math.atan2(m1.tx, m1.tz) }); }
        for (const o of [-1, 1]) for (let s = -7; s < 7; s += 2) { const m1 = net.pointAt(r, n.s + s + 1, side * (r.half - 1.2) + o * 1.05, {}); batch.box(M.line, m1.x, G(m1.x, m1.z) + 0.1, m1.z, 0.12, 0.02, 2, { color: '#e6b81c', ry: Math.atan2(m1.tx, m1.tz) }); }
        void m0;
      } else if (it.k === 'signal') {
        const n = at(p, (r) => DRIVABLE.has(r.kind)); if (!n || n.dist > n.road.half + 3) continue;
        for (const sd of [1, -1]) {
          const q = net.pointAt(n.road, n.s - sd * 6, sd * (n.road.half + 0.6), {});
          if (net.onCarriageway(q.x, q.z, null, 0.2) || onBuilding(q.x, q.z)) continue;
          const f = new Frame(batch, q.x, q.z, Math.atan2(q.tx, q.tz) + (sd > 0 ? Math.PI : 0), G(q.x, q.z));
          f.geo(M.darkMetal, new THREE.CylinderGeometry(0.07, 0.07, 3.6, 6), 0, 1.8, 0, { color: '#222' });
          f.box(M.darkMetal, 0, 3.2, 0.15, 0.32, 0.95, 0.22, { color: '#1a1a1a' });
          ['#ff2a1a', '#402a00', '#003a10'].forEach((c, i) => f.box(M.signalLens, 0, 3.5 - i * 0.3, 0.27, 0.18, 0.18, 0.03, { color: c }));
          f.box(M.darkMetal, 0, 1.1, -0.12, 0.22, 0.32, 0.12, { color: '#dcdc50', detail: true });
          world.addBox(q.x - 0.15, q.x + 0.15, f.y0 - 1, f.y0 + 3.6, q.z - 0.15, q.z + 0.15, 'pole');
        }
      } else if (it.k === 'crossing') {
        const n = at(p, (r) => DRIVABLE.has(r.kind)); if (!n || n.dist > n.road.half + 1) continue;
        const r = n.road, zebra = r.kind !== 'r' && R() < 0.6;
        for (let o = -r.half + 0.5; o < r.half - 0.3; o += 1.0) {
          const q = net.pointAt(r, n.s, o + 0.25, {});
          if (zebra) batch.box(M.line, q.x, G(q.x, q.z) + 0.1, q.z, 0.5, 0.02, 3.2, { color: '#f4f4ee', ry: Math.atan2(q.tx, q.tz) + Math.PI / 2 });
        }
        if (!zebra) for (const ds of [-1.6, 1.6]) for (let o = -r.half + 0.3; o < r.half; o += 0.6) { const q = net.pointAt(r, n.s + ds, o, {}); batch.box(M.line, q.x, G(q.x, q.z) + 0.1, q.z, 0.3, 0.02, 0.1, { color: '#f4f4ee', ry: Math.atan2(q.tx, q.tz) }); }
        // dropped kerbs + tactile paving
        for (const sd of [1, -1]) {
          const q = net.pointAt(r, n.s, sd * (r.half + 0.6), {});
          batch.box(M.pave, q.x, G(q.x, q.z) + 0.17, q.z, 2.4, 0.02, 0.8, { color: zebra ? '#b8a07a' : '#b85a4a', ry: Math.atan2(q.tx, q.tz) + Math.PI / 2 });
          if (zebra) {
            const b = net.pointAt(r, n.s + 2.2, sd * (r.half + 0.45), {}), gb = G(b.x, b.z);
            for (let i = 0; i < 6; i++) batch.box(M.plastic, b.x, gb + 0.25 + i * 0.45, b.z, 0.1, 0.45, 0.1, { color: i % 2 ? '#111' : '#f4f4f4' });
            batch.add(beaconMat, beaconGeo(), { x: b.x, y: gb + 2.9, z: b.z });
            world.addBox(b.x - 0.08, b.x + 0.08, gb - 1, gb + 2.9, b.z - 0.08, b.z + 0.08, 'pole');
            beacons.push([b.x, gb + 2.9, b.z]);
          }
        }
      } else if (it.k === 'bench') {
        const n = at(p); const ry = n ? Math.atan2(n.tx, n.tz) + Math.PI / 2 : 0;
        const f = new Frame(batch, x, z, ry, g);
        f.box(M.wood, 0, 0.45, 0, 1.8, 0.06, 0.45, { color: '#7a5a3a' }); f.box(M.wood, 0, 0.75, -0.22, 1.8, 0.4, 0.05, { color: '#7a5a3a' });
        for (const sx of [-0.8, 0.8]) f.box(M.darkMetal, sx, 0.25, 0, 0.06, 0.5, 0.45, { color: '#222', detail: true });
        world.addOBB(x, z, 0.9, 0.3, ry, g - 1, g + 0.5, 'bench');
      } else if (it.k === 'postbox') {
        const f = new Frame(batch, x, z, 0, g);
        f.geo(M.postbox, new THREE.CylinderGeometry(0.3, 0.3, 1.45, 12), 0, 0.72, 0, { color: '#c4161c' });
        f.geo(M.postbox, new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), 0, 1.5, 0, { color: '#a01217' });
        world.addBox(x - 0.35, x + 0.35, g - 1, g + 1.6, z - 0.35, z + 0.35, 'postbox');
      } else if (it.k === 'bin') {
        batch.box(M.darkMetal, x, g + 0.5, z, 0.55, 1.0, 0.55, { color: '#1f3b2a' });
        world.addBox(x - 0.3, x + 0.3, g - 1, g + 1, z - 0.3, z + 0.3, 'bin');
      } else if (it.k === 'bollard') {
        batch.box(M.darkMetal, x, g + 0.5, z, 0.16, 1.0, 0.16, { color: '#1b1b1b', detail: true });
      }
    } else if (it.k === 'wall' || it.k === 'fence' || it.k === 'hedge') {
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(L / 4));
        for (let k = 0; k < steps; k++) {
          const x0 = ax + (bx - ax) * k / steps, z0 = az + (bz - az) * k / steps, x1 = ax + (bx - ax) * (k + 1) / steps, z1 = az + (bz - az) * (k + 1) / steps;
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, l = L / steps, ry = Math.atan2(x1 - x0, z1 - z0), g = G(mx, mz);
          if (net.onCarriageway(mx, mz, null, 0.2)) continue;
          if (it.k === 'wall') { batch.box(M.stone, mx, g + 0.5, mz, 0.35, 1.4, l + 0.05, { color: '#b9ad98', ry, tile: 1 }); batch.box(M.stone, mx, g + 1.24, mz, 0.42, 0.1, l + 0.05, { color: '#cfc3ad', ry, detail: true }); world.addOBB(mx, mz, 0.18, l / 2, ry, g - 1, g + 1.2, 'wall'); }
          else if (it.k === 'fence') { batch.box(M.fence, mx, g + 0.9, mz, 0.05, 1.8, l, { color: '#3d4a44', ry }); world.addOBB(mx, mz, 0.05, l / 2, ry, g - 1, g + 1.8, 'fence'); }
          else { batch.box(M.hedge, mx, g + 0.65, mz, 0.9, 1.5, l + 0.2, { color: '#3f6b35', ry }); world.addOBB(mx, mz, 0.45, l / 2, ry, g - 1, g + 1.3, 'hedge'); }
        }
      }
    }
  }
  // ---- street name plates near each named street's ends ----
  const names = [...new Set(net.roads.filter((r) => DRIVABLE.has(r.kind)).map((r) => r.name).filter(Boolean))];
  const plates = nameAtlas(names);
  M.names.map = plates.tex; M.names.needsUpdate = true;
  for (const r of net.roads) {
    if (!r.name || !DRIVABLE.has(r.kind) || r.length < 25) continue;
    const idx = names.indexOf(r.name);
    for (const s of [7, r.length - 7]) {
      const p = net.pointAt(r, s, (s < 10 ? 1 : -1) * (r.half + r.pave - 0.3), {});
      if (net.onCarriageway(p.x, p.z, r, 0.5) || onBuilding(p.x, p.z)) continue;
      const g = G(p.x, p.z), ry = Math.atan2(p.tx, p.tz) + Math.PI / 2;
      const f = new Frame(batch, p.x, p.z, ry, g);
      for (const x of [-0.8, 0.8]) f.box(M.darkMetal, x, 0.55, 0, 0.07, 1.1, 0.07, { color: '#222', detail: true });
      f.geo(M.names, quadUV(1.9, 0.48, plates.cell(idx)), 0, 1.15, 0, {});
    }
  }
  // ---- green telecoms cabinets now and then ----
  for (const r of net.roads) if (r.kind === 'r' || r.kind === 'b') {
    for (let s = 25; s < r.length; s += 110) {
      const p = net.pointAt(r, s, -(r.half + Math.max(0.35, r.pave - 0.35)), {}); if (net.onCarriageway(p.x, p.z, r, 1) || onBuilding(p.x, p.z)) continue;
      const g = G(p.x, p.z);
      batch.box(M.cabinet, p.x, g + 0.6, p.z, 1.2, 1.2, 0.45, { color: '#2e5e3e', ry: Math.atan2(p.tx, p.tz) + Math.PI / 2 });
      world.addOBB(p.x, p.z, 0.6, 0.25, Math.atan2(p.tx, p.tz) + Math.PI / 2, g - 1, g + 1.2, 'cabinet');
    }
  }
  // ---- trees: mapped trees, tree rows, woods and scrub ----
  const trees = [];
  const scatter = (P, density, scale, out) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const n = Math.min(900, Math.round((x1 - x0) * (z1 - z0) * density));
    for (let i = 0; i < n; i++) { const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (inPoly(P, x, z) && !net.onRoadOrPavement(x, z, 1.5) && !onBuilding(x, z)) out.push([x, z, scale * (0.75 + R() * 0.5)]); }
  };
  const woods = [];
  for (const l of osm.landuse) {
    if (l.k === 'tree1') { trees.push([l.p[0], l.p[1], 1 + R() * 0.3]); continue; }
    const P = []; for (let i = 0; i < l.p.length; i += 2) P.push([l.p[i], l.p[i + 1]]);
    if (l.k === 'tree') scatter(P, 1 / 45, 1.0, trees);
    else if (l.k === 'wood') scatter(P, 1 / 70, 1.15, woods);
    else if (l.k === 'scrub') scatter(P, 1 / 120, 0.6, woods);
    else if (l.k === 'park' || l.k === 'churchyard') scatter(P, 1 / 700, 1.1, trees);
  }
  return { trees, woods, beacons };
}
const _near = [];
function inBox(b, x, z, pad) {
  if (!b.rot) return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
  const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  return Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad;
}
function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; }
  return c;
}

// ------------------------------------------------------------------ trees
// Broadleaf street trees: trunk + several lumpy crown blobs.
export function plantTrees(batch, M, world, list, cheap = false) {
  const R = rng(31);
  for (const [x, z, s] of list) {
    if (cheap) { plantCheap(batch, M, world, x, z, s, R); continue; }
    const g = G(x, z);
    const f = new Frame(batch, x, z, R() * 6, g);
    f.geo(M.bark, boxUV(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 4.5 * s, 7), 2), 0, 2.25 * s, 0, { color: '#6b5645' });
    for (let k = 0; k < 5; k++) {
      const geo = new THREE.IcosahedronGeometry((1.6 + R() * 1.1) * s, k < 1 ? 1 : 0);
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

export function parkCars(batch, M, world, net, keepClear) {
  const R = rng(77);
  let n = 0;
  for (const r of net.roads) {
    if (r.kind !== 'r' && r.kind !== 'b') continue; // double yellows on the main roads
    const narrow = r.width < 6.2;                    // narrow terraced streets: half up on the pavement, one side
    for (const side of narrow ? [R() < 0.5 ? 1 : -1] : [1, -1]) {
      const off = narrow ? r.half - 0.4 : r.half - 1.05;
      for (let s = 12; s < r.length - 12;) {
        const p = net.pointAt(r, s, side * off, {});
        const clear = !net.onCarriageway(p.x, p.z, r, 10) && !keepClear(p.x, p.z);
        if (!clear || R() < (r.kind === 'b' ? 0.55 : 0.5)) { s += 3 + R() * 6; continue; }
        const ry = Math.atan2(p.tx, p.tz) + (side > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.05;
        const { L, Wd } = parkedCar(batch, M, p.x, p.z, ry, R);
        world.addOBB(p.x, p.z, Wd / 2, L / 2, ry, G(p.x, p.z) - 0.5, G(p.x, p.z) + 1.45, 'parked-car');
        n++; s += L + 0.8 + R() * 1.5;
      }
    }
  }
  return n;
}

// Cheap woodland tree: trunk + two crown blobs (woods have hundreds).
function plantCheap(batch, M, world, x, z, s, R) {
  const g = G(x, z);
  const f = new Frame(batch, x, z, R() * 6, g);
  const h = (5 + R() * 4) * s;
  f.geo(M.bark, new THREE.CylinderGeometry(0.14 * s, 0.24 * s, h * 0.6, 5), 0, h * 0.3, 0, { color: '#5e4c3c' });
  for (let k = 0; k < 2; k++) {
    const geo = new THREE.IcosahedronGeometry((1.8 + R() * 1.4) * s, 0);
    f.geo(M.leaves, geo, (R() - 0.5) * 1.5 * s, h * (0.62 + k * 0.22), (R() - 0.5) * 1.5 * s, { color: ['#3f6b30', '#4f7d3a', '#557a36', '#46703a'][(R() * 4) | 0], sy: 1.15 });
  }
  if (s > 0.8) world.addBox(x - 0.25 * s, x + 0.25 * s, g - 1, g + h * 0.6, z - 0.25 * s, z + 0.25 * s, 'tree');
}
