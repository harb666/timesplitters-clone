// Street furniture, trees and parked cars.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { Frame, rng } from './buildings.js';
import { boxUV } from '../../models/shapes.js';
import { DRIVABLE } from './roads.js';
import { addParkedVehicle, pickType, PAINT_UK } from '../../models/vehicles.js';

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
        // yellow bus stop box on the carriageway (hugs the road surface)
        const lo = side * (r.half - 1.2), yl = 0.06;
        for (const ds of [-7, 7]) net.decal(batch, M.line, r, n.s + ds - 0.075, n.s + ds + 0.075, lo, 2.2, yl, '#e6b81c');
        for (const o of [-1, 1]) for (let s = -7; s < 7; s += 2) net.decal(batch, M.line, r, n.s + s, n.s + s + 2, lo + o * 1.05, 0.12, yl, '#e6b81c');
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
          // pieces follow the slope of the ground (tops parallel to it, no steps or gaps)
          const g0 = G(x0, z0), g1 = G(x1, z1);
          if (it.k === 'wall') { batch.sloped(M.stone, x0, z0, x1, z1, 0.35, g0 - 0.4, g1 - 0.4, g0 + 1.19, g1 + 1.19, { color: '#b9ad98', tile: 1 }); batch.sloped(M.stone, x0, z0, x1, z1, 0.42, g0 + 1.19, g1 + 1.19, g0 + 1.29, g1 + 1.29, { color: '#cfc3ad', detail: true }); world.addOBB(mx, mz, 0.18, l / 2, ry, g - 1, g + 1.2, 'wall'); }
          else if (it.k === 'fence') { batch.sloped(M.fence, x0, z0, x1, z1, 0.05, g0 - 0.1, g1 - 0.1, g0 + 1.8, g1 + 1.8, { color: '#3d4a44' }); world.addOBB(mx, mz, 0.05, l / 2, ry, g - 1, g + 1.8, 'fence'); }
          else { batch.sloped(M.hedge, x0, z0, x1, z1, 0.9, g0 - 0.2, g1 - 0.2, g0 + 1.4, g1 + 1.4, { color: '#3f6b35' }); world.addOBB(mx, mz, 0.45, l / 2, ry, g - 1, g + 1.3, 'hedge'); }
        }
      }
    }
  }
  // ---- telegraph poles with overhead phone lines (terraced streets) ----
  const wire = (x0, y0, z0, x1, y1, z1, sag) => {
    const n = 4;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p0 = [x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0 - sag * 4 * t0 * (1 - t0), z0 + (z1 - z0) * t0];
      const p1 = [x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1 - sag * 4 * t1 * (1 - t1), z0 + (z1 - z0) * t1];
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], L = Math.hypot(dx, dy, dz);
      const g = new THREE.BoxGeometry(0.018, 0.018, L);
      g.rotateX(-Math.asin(dy / L)); g.rotateY(Math.atan2(dx, dz));
      batch.add(M.darkMetal, g, { x: (p0[0] + p1[0]) / 2, y: (p0[1] + p1[1]) / 2, z: (p0[2] + p1[2]) / 2, color: '#151515', detail: true });
    }
  };
  for (const r of net.roads) {
    if (r.kind !== 'r' || r.length < 40 || R() < 0.25) continue;
    const side = R() < 0.5 ? 1 : -1, poles = [];
    for (let s = 12 + R() * 10; s < r.length - 8; s += 34 + R() * 10) {
      const p = net.pointAt(r, s, side * (r.half + r.pave - 0.25), {});
      if (net.onCarriageway(p.x, p.z, r, 1) || onBuilding(p.x, p.z)) continue;
      const g = G(p.x, p.z), H = 8.5;
      batch.add(M.wood, new THREE.CylinderGeometry(0.1, 0.14, H, 6), { x: p.x, y: g + H / 2, z: p.z, color: '#5c4630' });
      batch.box(M.wood, p.x, g + H - 0.35, p.z, 0.9, 0.1, 0.1, { color: '#4d3a28', ry: Math.atan2(p.tx, p.tz) + Math.PI / 2, detail: true });
      world.addBox(p.x - 0.14, p.x + 0.14, g - 1, g + H, p.z - 0.14, p.z + 0.14, 'pole');
      poles.push({ x: p.x, y: g + H - 0.3, z: p.z, tx: p.tx, tz: p.tz });
      // drop wires to a few house fronts on both sides
      // (only where the wire really reaches a house wall: it ends on a bracket under the eaves)
      for (const dside of [side, -side]) if (R() < 0.7) {
        const a = (R() - 0.5) * 0.9, nx = p.tz * dside, nz = -p.tx * dside;
        const dx = nx * Math.cos(a) + p.tx * Math.sin(a), dz = nz * Math.cos(a) + p.tz * Math.sin(a);
        const hit = world.raycastBoxes(p.x, g + 5, p.z, dx, 0, dz, 24);
        if (!hit.box || hit.box.tag !== 'building' || hit.dist < 2) continue;
        const hx = p.x + dx * (hit.dist - 0.04), hz = p.z + dz * (hit.dist - 0.04);
        const hy = Math.min(hit.box.maxY - 0.6, G(hx, hz) + 5.3);
        if (hy < g + 3) continue;
        wire(p.x, g + H - 0.4, p.z, hx, hy, hz, 0.2);
        batch.box(M.darkMetal, hx - dx * 0.05, hy - 0.03, hz - dz * 0.05, 0.06, 0.12, 0.1, { color: '#222', ry: Math.atan2(dx, dz), detail: true });
      }
    }
    for (let i = 0; i + 1 < poles.length; i++) {
      const a = poles[i], b = poles[i + 1]; if (Math.hypot(a.x - b.x, a.z - b.z) > 60) continue;
      for (const o of [-0.35, 0.35]) wire(a.x + a.tz * o, a.y, a.z - a.tx * o, b.x + b.tz * o, b.y, b.z - b.tx * o, 0.6);
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
    else if (l.k === 'wood') scatter(P, 1 / 45, 1.15, woods);
    else if (l.k === 'scrub') scatter(P, 1 / 120, 0.6, woods);
    else if (l.k === 'park' || l.k === 'churchyard') scatter(P, 1 / 700, 1.1, trees);
  }
  return { trees, woods, beacons };
}
const _near = [];
export function inBox(b, x, z, pad) {
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
// Broadleaf trees: tapered trunk and main limbs in bark, and a crown made of
// clusters of crossed leaf cards (alpha-cut leaf texture) whose normals point
// out from the crown centre, so the canopy lights softly like real foliage
// instead of looking like faceted blobs. Species vary in shape and colour.
let FOLIAGE = null;
function foliageMaterial() {
  if (FOLIAGE) return FOLIAGE;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const R = rng(9);
  for (let i = 0; i < 520; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 118, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    const l = 22 + R() * 34, h = 80 + R() * 40;
    g.fillStyle = `hsla(${h},${38 + R() * 25}%,${l}%,1)`;
    g.save(); g.translate(x, y); g.rotate(R() * Math.PI); g.beginPath(); g.ellipse(0, 0, 3 + R() * 5, 1.6 + R() * 2.4, 0, 0, 7); g.fill(); g.restore();
  }
  // a few twigs
  g.strokeStyle = 'rgba(70,55,40,.9)'; g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + (R() - 0.5) * 200, 128 + (R() - 0.5) * 200); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  FOLIAGE = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, vertexColors: true, name: 'foliage' });
  return FOLIAGE;
}
const SPECIES = [
  { name: 'plane', h: [9, 14], crown: [4.2, 3.6], trunk: 0.3, tint: ['#6f9446', '#7aa04e', '#62883e'] },
  { name: 'lime', h: [8, 12], crown: [3.4, 4.2], trunk: 0.26, tint: ['#7da84c', '#86ad55', '#6d9a43'] },
  { name: 'sycamore', h: [7, 11], crown: [3.8, 3.2], trunk: 0.26, tint: ['#557d34', '#5f8838', '#4b732e'] },
  { name: 'birch', h: [7, 10], crown: [2.2, 3.4], trunk: 0.14, tint: ['#8fb258', '#99bb60', '#86a852'], bark: '#d9d4c8' },
  { name: 'oak', h: [8, 12], crown: [4.6, 3.4], trunk: 0.36, tint: ['#51702f', '#5a7a34', '#4a6a2c'] },
];
function crossedCards(size) {
  const geos = [];
  for (let k = 0; k < 3; k++) { const q = new THREE.PlaneGeometry(size, size); q.rotateY(k * Math.PI / 3); if (k === 2) q.rotateX(Math.PI / 2); geos.push(q); }
  return geos;
}
export function plantTrees(batch, M, world, list, cheap = false) {
  const R = rng(31), fol = foliageMaterial();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [x, z, s0] of list) {
    const sp = SPECIES[(R() * SPECIES.length) | 0], s = s0 * (cheap ? 0.85 : 1);
    const g = G(x, z), H = (sp.h[0] + R() * (sp.h[1] - sp.h[0])) * s, cb = H * 0.42;
    const f = new Frame(batch, x, z, R() * 6, g);
    const barkCol = sp.bark || '#5f5043', tr = sp.trunk * s;
    f.geo(M.bark, boxUV(new THREE.CylinderGeometry(tr * 0.7, tr, cb + 0.6, 7), 1.5), 0, (cb + 0.6) / 2 - 0.3, 0, { color: barkCol });
    // main limbs
    const nl = cheap ? 2 : 4;
    for (let k = 0; k < nl; k++) {
      const a = k / nl * Math.PI * 2 + R(), tilt = 0.45 + R() * 0.35, L = H * 0.38;
      const limb = new THREE.CylinderGeometry(tr * 0.3, tr * 0.6, L, 5); limb.translate(0, L / 2, 0); limb.rotateZ(tilt); limb.rotateY(a);
      f.geo(M.bark, limb, 0, cb, 0, { color: barkCol, detail: true });
    }
    // crown of leaf clusters in an ellipsoid; normals point out from the crown centre
    const [rx, ry] = sp.crown, crx = rx * s * (0.85 + R() * 0.3), cry = ry * s, cy = cb + cry * 0.95;
    const n = cheap ? 7 : 14, tint = sp.tint[(R() * sp.tint.length) | 0];
    const parts = [];
    for (let k = 0; k < n; k++) {
      // spread points through the crown volume, biased to the surface
      const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = 0.55 + 0.45 * Math.sqrt(R());
      const px = Math.sqrt(1 - u * u) * Math.cos(th) * crx * rr, py = u * cry * rr * 0.85, pz = Math.sqrt(1 - u * u) * Math.sin(th) * crx * rr;
      const size = (2.4 + R() * 1.4) * s * (cheap ? 1.25 : 1);
      for (const q of crossedCards(size)) {
        q.rotateY(R() * Math.PI); q.translate(px, cy + py, pz);
        const pos = q.attributes.position, nor = q.attributes.normal;
        for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3(pos.getX(i), pos.getY(i) - cy * 0.97, pos.getZ(i)).normalize(); nor.setXYZ(i, v.x, v.y + 0.25, v.z); }
        parts.push(q);
      }
    }
    for (const q of parts) { f.geo(fol, q, 0, 0, 0, { color: tint }); }
    world.addBox(x - tr, x + tr, g - 1, g + cb, z - tr, z + tr, 'tree');
    void up;
  }
}

// --------------------------------------------------------------- parked cars
// Everyday cars and vans parked along the terraced streets: the detailed
// models (see models/vehicles.js) close up, plus a simple two-box proxy
// (just inside the detailed body) that stays visible further away.
const PAINT = PAINT_UK;
let FLEET = null;
export function setFleet(f) { FLEET = f; }
export function parkedCar(batch, M, x, z, ry, R, type = pickType(R)) {
  const paint = PAINT[(R() * PAINT.length) | 0], g = G(x, z);
  const dims = FLEET ? FLEET.add(x, g, z, ry, type, paint) : addParkedVehicle(batch, x, g, z, ry, type, { paint, plate: (R() * 16) | 0, alloy: (R() * 4) | 0 }, true);
  const f = new Frame(batch, x, z, ry, g);
  const L = dims.L * 0.95, Wd = dims.W * 0.94, van = type === 'van';
  const Ld = L * 0.93, Wp = Wd * 0.94;
  f.box(M.carPaint, 0, 0.55, 0, Wp, 0.6, Ld, { color: paint });
  if (van) f.box(M.carPaint, 0, 1.45, -0.3, Wp, 1.1, Ld - 1.4, { color: paint });
  else f.box(M.carGlass, 0, (dims.H + 0.9) / 2 - 0.08, -0.25, Wp - 0.3, dims.H - 1.05, Ld * 0.42, { color: '#1d252c' });
  return { L: dims.L, Wd: dims.W };
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


// ---------------------------------------------------------------- car parks
// The real car parks (hospital, shops, schools): marked bays in rows with
// aisles between, most bays taken.
export function parkLots(batch, M, world, net, osm, maxCars = 700) {
  const R = rng(515); let n = 0;
  const lots = osm.furniture.filter((f) => f.k === 'parking' && f.p.length >= 6).map((f) => flat2(f.p)).filter((P) => Math.abs(area2(P)) > 150);
  for (const P of lots) {
    const o = obb2(P); if (!o) continue;
    // rows run along the long axis; the pattern across it: bay | aisle | bay bay | aisle | ...
    const along = [o.ux, o.uz], across = [o.vx, o.vz];
    const rows = []; let v = -o.hv + 2.5, k = 0;
    while (v < o.hv - 2.3) { rows.push({ v, face: k % 2 ? 1 : -1 }); v += (k % 2 ? 7.4 : 4.9); k++; }
    for (const row of rows) for (let u = -o.hu + 1.6; u < o.hu - 1.2; u += 2.5) {
      const x = o.cx + along[0] * u + across[0] * row.v, z = o.cz + along[1] * u + across[1] * row.v;
      if (!inPoly(P, x, z) || !inPoly(P, x + along[0] * 1.2, z + along[1] * 1.2) || net.onRoadOrPavement(x, z, 0.5)) continue;
      if (world.near(x, z, 3, _near).some((b) => b.tag === 'building' && inBox(b, x, z, 2.6))) continue;
      const ry = Math.atan2(across[0] * row.face, across[1] * row.face), g = G(x, z);
      // bay lines either side
      for (const du of [-1.25, 1.25]) {
        const lx = x + along[0] * du, lz = z + along[1] * du;
        batch.box(M.line, lx, G(lx, lz) + 0.03, lz, 0.1, 0.02, 4.6, { color: '#e9e7df', ry, detail: true });
      }
      if (n < maxCars && R() < 0.68) {
        const { L, Wd } = parkedCar(batch, M, x + (R() - 0.5) * 0.2, z + (R() - 0.5) * 0.2, ry + (R() - 0.5) * 0.06 + (R() < 0.2 ? Math.PI : 0), R);
        world.addOBB(x, z, Wd / 2, L / 2, ry, g - 0.5, g + 1.45, 'parked-car');
        n++;
      }
    }
  }
  return n;
}
function flat2(f) { const P = []; for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]); return P; }
function area2(P) { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return a / 2; }
function obb2(P) {
  let best = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length]; let ux = b[0] - a[0], uz = b[1] - a[1]; const L = Math.hypot(ux, uz); if (L < 1) continue; ux /= L; uz /= L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of P) { const du = p[0] * ux + p[1] * uz, dv = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, du); u1 = Math.max(u1, du); v0 = Math.min(v0, dv); v1 = Math.max(v1, dv); }
    const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { ux, uz, u0, u1, v0, v1 } = best, vx = -uz, vz = ux, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  let o = { cx: cu * ux + cv * vx, cz: cu * uz + cv * vz, ux, uz, vx, vz, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 };
  if (o.hv > o.hu) o = { ...o, ux: vx, uz: vz, vx: -ux, vz: -uz, hu: o.hv, hv: o.hu };
  return o;
}
