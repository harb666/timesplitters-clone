// Buildings from the real Fir Vale footprints (open map data).
//
// Victorian terrace rows are split into individual ~5 m houses along the
// street they face; every house steps with the hill, gets a slate roof with
// its ridge parallel to the street, rear outriggers where the footprint
// has them, chimney stacks on the party walls, and a dressed front: door,
// fanlight, bay or sash windows, stone lintels and sills, gutters, garden
// walls. Real shop locations (by category only) become shopfronts with
// invented names. Hospital, school, church and other big buildings are
// extruded from their footprints with window bands and flat roofs.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { tiledBox, StaticBatch, CHUNK } from '../../models/builders.js';
import { Frame, rng, atlasQuad, DISPLAY } from './buildings.js';
import { area, centroid, obb, clip, triangulate, Mesher, flatToPts, inPoly } from './geom.js';

const RES = new Set(['house', 'terrace', 'semidetached_house', 'detached', 'residential', 'apartments', 'bungalow']);
const SHED = new Set(['garage', 'garages', 'roof', 'service', 'shed', 'hut']);
const BRICK = ['#ffffff', '#f4ddd0', '#e9cbbb', '#dcb9a6', '#fbe4d6', '#cfae9c', '#d9c2b5', '#c9a48f'];
const MODERN_BRICK = ['#e8c9b0', '#f0d8c0', '#d8b39a', '#caa088'];
const RENDER = ['#e8e4da', '#d9d6cf', '#cfc9bd', '#efe6d2', '#bfc4c6', '#e6dcc5', '#d5c9b0'];
const DOORS = ['#6e1d1d', '#1d3a6e', '#1f5a2c', '#161616', '#f1f1ec', '#4f2a63', '#9a6b22', '#3b3b3b', '#7a7a7a'];
const FLOOR = 2.75;

// wall quad from p0->p1 (2-D) between bottom y and top heights, facing n
function wall(ms, mat, col, p0, p1, yb, yt0, yt1, n, tile, u0 = 0) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  ms.poly(mat, col, [[p0[0], yb, p0[1]], [p1[0], yb, p1[1]], [p1[0], yt1, p1[1]], [p0[0], yt0, p0[1]]],
    [[u0 / tile, yb / tile], [(u0 + L) / tile, yb / tile], [(u0 + L) / tile, yt1 / tile], [u0 / tile, yt0 / tile]], [n[0], 0, n[1]]);
}
// window quad on a wall: centre (x,z) on the wall line, facing n
function winQuad(ms, M, x, z, y, w, h, n, v, out = 0.03) {
  const tx = n[1], tz = -n[0], ox = x + n[0] * out, oz = z + n[1] * out;
  const u0 = v * 0.25 + 0.004, u1 = v * 0.25 + 0.246;
  ms.poly(M.win, '#ffffff', [[ox - tx * w / 2, y - h / 2, oz - tz * w / 2], [ox + tx * w / 2, y - h / 2, oz + tz * w / 2], [ox + tx * w / 2, y + h / 2, oz + tz * w / 2], [ox - tx * w / 2, y + h / 2, oz - tz * w / 2]],
    [[u1, 0], [u0, 0], [u0, 1], [u1, 1]], [n[0], 0, n[1]]);
}
function bandQuad(ms, mat, col, p0, p1, y0, y1, n, out = 0.04, uvScale = 3) {
  const a = [p0[0] + n[0] * out, p0[1] + n[1] * out], b = [p1[0] + n[0] * out, p1[1] + n[1] * out], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  ms.poly(mat, col, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [[0, 0], [L / uvScale, 0], [L / uvScale, (y1 - y0) / uvScale], [0, (y1 - y0) / uvScale]], [n[0], 0, n[1]]);
}
function atlasBox(w, h, d, u0, v0, u1, v1) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; const a = uv.getX(i), b = uv.getY(i);
    if (f === 4) uv.setXY(i, u0 + (u1 - u0) * a, v0 + (v1 - v0) * b); else uv.setXY(i, u0 + 0.01, v0 + 0.01);
  }
  return g;
}

// ------------------------------------------------------------------ analysis
// Work out, for every footprint, what it is, which way it faces and how it
// splits into houses. No geometry yet (shops are assigned in between).
function analyse(osm, net, special) {
  const out = [];
  osm.buildings.forEach((b, bi) => {
    let P = flatToPts(b.p);
    if (P.length < 3) return;
    const A = area(P); if (Math.abs(A) < 6) return;
    const o = obb(P); if (!o) return;
    const c = centroid(P);
    const fill = Math.abs(A) / (4 * o.hu * o.hv);
    const cls = b.c || '';
    const sp = special(c[0], c[1], Math.abs(A));
    let type;
    if (sp) type = sp;
    else if (SHED.has(cls) || (!cls && Math.abs(A) < 22)) type = 'shed';
    else if (RES.has(cls) && !(cls === 'apartments' && Math.abs(A) > 500)) type = 'res';
    else if (!cls && (o.hv * 2 <= 13 && fill > 0.55) && Math.abs(A) < 1400) type = 'res';
    // long rows one house deep (terraces drawn as a single outline, with rear outriggers)
    else if ((!cls || cls === 'building') && o.hv * 2 <= 17.5 && o.hu * 2 >= 20 && o.hu / o.hv > 2.6 && fill > 0.5) type = 'res';
    else if (!cls && Math.abs(A) < 160) type = 'res';
    else type = 'big';
    // orientation: outward normal test so walls face out
    const ccw = A > 0;
    const B = { i: bi, b, P, A: Math.abs(A), o, c, cls, type, fill, ccw };
    if (type === 'res') {
      // which side faces the street? try the 4 OBB sides
      const sides = [[o.vx, o.vz, o.hv, o.hu], [-o.vx, -o.vz, o.hv, o.hu], [o.ux, o.uz, o.hu, o.hv], [-o.ux, -o.uz, o.hu, o.hv]];
      let best = null;
      for (const [nx, nz, dist, along] of sides) {
        const tx = nz, tz = -nx; let score = 0, k = 0, main = 0;
        for (const f of [-0.6, 0, 0.6]) {
          const x = o.cx + nx * (dist + 3) + tx * along * f, z = o.cz + nz * (dist + 3) + tz * along * f;
          const r = net.nearestStreet(x, z);
          score += r ? Math.max(0, r.dist - r.road.half - r.road.pave) : 40; k++;
          // is that street a main road running alongside this side of the row?
          if (r && (r.road.kind === 'a' || r.road.kind === 'b') && r.dist - r.road.half - r.road.pave < 22 && Math.abs(r.tx * tx + r.tz * tz) > 0.8) main++;
        }
        score /= k;
        // the terraces along Firth Park Road, Barnsley Road, Page Hall Road,
        // Herries Road... face the main road, even with a back street nearer
        if (main >= 2 && along >= 3.6) score -= 14;
        if (along < 3.6 && (sides[0][3] > 9)) score += 8;    // short end of a long terrace: rarely the front
        if (!best || score < best.score) best = { nx, nz, dist, along, score };
      }
      B.front = best;
      const len = best.along * 2;
      let pw = cls === 'semidetached_house' ? 7.5 : cls === 'detached' || cls === 'bungalow' ? 99 : 5.1;
      let n = Math.max(1, Math.round(len / pw));
      if (len / n < 3.6) n = Math.max(1, Math.floor(len / 3.6));
      B.nPlots = n;
      B.storeys = b.l ? Math.min(4, b.l) : b.h ? Math.max(cls === 'bungalow' ? 1 : 2, Math.min(4, Math.round((b.h - 2.5) / 2.9))) : cls === 'apartments' ? 3 : cls === 'bungalow' ? 1 : 2;   // (estimated heights run low: houses here are two-storey)
    }
    out.push(B);
  });
  return out;
}

// local frame of a residential footprint: a = along the front, d = towards the front
function localFrame(B) {
  const { nx, nz } = B.front, tx = nz, tz = -nx, { cx, cz } = B.o;
  const toL = ([x, z]) => [(x - cx) * tx + (z - cz) * tz, (x - cx) * nx + (z - cz) * nz];
  const toW = (a, d) => [cx + tx * a + nx * d, cz + tz * a + nz * d];
  return { tx, tz, nx, nz, toL, toW };
}

// ------------------------------------------------------------------ build
export function buildFootprints(batch, M, world, net, osm, { signs, shopCells, special, miniMartAt, shell }) {
  const R = rng(1904);
  const list = analyse(osm, net, special);
  // petrol station canopies are mapped as 'buildings': find them (low, open-sided, at a fuel point)
  const fuel = osm.shops.filter((q) => q[2] === 'petrol');
  for (const B of list) if (B.b.h && B.b.h < 6 && B.A > 150 && B.A < 700 && fuel.some(([x, z]) => Math.hypot(B.c[0] - x, B.c[1] - z) < 14)) B.type = 'canopy';
  const detailMs = new Mesher(), ms = new Mesher();
  const plots = [], pending = [];

  // ---- pass 1: split residential footprints into houses ----
  for (const B of list) {
    if (B.type !== 'res') continue;
    const F = localFrame(B); B.F = F;
    const L = B.P.map(F.toL);
    let dMin = Infinity, dMax = -Infinity, aMin = Infinity, aMax = -Infinity;
    for (const [a, d] of L) { dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); }
    const depth = dMax - dMin;
    const Dm = depth > 11.5 ? 8.6 : depth;               // main body depth (rest = rear outriggers)
    B.L = L; B.dMax = dMax; B.dMin = dMin; B.Dm = Dm; B.dR = dMax - Dm / 2;
    B.rise = Math.min(Dm / 2 * 0.72, 3.4);
    B.tint = BRICK[(R() * BRICK.length) | 0];
    B.modern = B.cls === 'semidetached_house' || B.cls === 'detached' || B.cls === 'bungalow';
    if (B.modern) B.tint = MODERN_BRICK[(R() * MODERN_BRICK.length) | 0];
    const w = (aMax - aMin) / B.nPlots;
    B.plots = [];
    for (let k = 0; k < B.nPlots; k++) {
      const a0 = aMin + k * w, a1 = a0 + w;
      let piece = clip(L, (p) => p[0] - a0 + (k === 0 ? 1 : 0));
      piece = clip(piece, (p) => a1 - p[0] + (k === B.nPlots - 1 ? 1 : 0));
      if (piece.length < 3 || Math.abs(area(piece)) < 3) continue;
      // each house's own front (long terraces follow curving roads, so the
      // row's frontmost point says little about any one house)
      const pdMax = Math.max(...piece.map(([, d]) => d));
      const fm = F.toW((a0 + a1) / 2, pdMax);
      const gF = G(fm[0], fm[1]);
      const pl = { B, k, a0, a1, w, piece, gF, front: fm, shop: null, mirror: k % 2 === 1, dMax: pdMax };
      pl.hasFront = pdMax > dMax - 6;
      B.plots.push(pl); plots.push(pl);
    }
  }

  // ---- pass 2: shops at the real shop locations (categories only) ----
  const shopSpots = [];
  const cellFor = (cat) => { const arr = shopCells[cat] || shopCells.office; return arr[(R() * arr.length) | 0]; };
  const fronts = plots.filter((p) => p.hasFront);
  const grid = new Map(); const GK = (x, z) => Math.floor(x / 20) * 7919 + Math.floor(z / 20);
  for (const p of fronts) { const k = GK(p.front[0], p.front[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const nearPlot = (x, z, maxD) => {
    let best = null, bd = maxD;
    for (let ix = -2; ix <= 2; ix++) for (let iz = -2; iz <= 2; iz++) for (const p of grid.get(GK(x + ix * 20, z + iz * 20)) || []) {
      if (p.shop) continue;
      const d = Math.hypot(p.front[0] - x, p.front[1] - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  let miniMart = null;
  if (miniMartAt) { miniMart = nearPlot(miniMartAt[0], miniMartAt[1], 25); if (miniMart) miniMart.shop = { cat: 'grocer', cell: shopCells.miniMart[0], miniMart: true, awning: '#1f8a4c', stall: true, aboard: true }; }
  const missed = [], petrol = [];
  for (const [x, z, cat] of osm.shops) {
    if (cat === 'petrol') { petrol.push([x, z]); continue; }
    // a shop inside a bigger building (flats over shops, units) goes on that building's street wall
    const big = bigWallNear(list, net, x, z);
    if (big) { missed.push({ x, z, cat, wall: big }); continue; }
    const p = nearPlot(x, z, 26) || nearPlot(x, z, 45);
    if (!p) continue;
    p.shop = { cat, cell: cellFor(cat) };
    if (cat === 'grocer' && R() < 0.7) { p.shop.stall = true; p.shop.awning = ['#b3121f', '#2f7d2f', '#1e3a8a'][(R() * 3) | 0]; }
    if ((cat === 'takeaway' || cat === 'cafe' || cat === 'barber') && R() < 0.5) p.shop.aboard = true;
    if ((cat === 'sweets' || cat === 'bakery') && R() < 0.6) p.shop.awning = ['#b8862b', '#92400e', '#7a1b1b'][(R() * 3) | 0];
  }
  // parades: houses sandwiched between shops in the same row are shops too
  for (const B of list) if (B.plots) {
    const P = B.plots;
    for (let i = 1; i < P.length - 1; i++) if (!P[i].shop && P[i].hasFront) {
      const l = P.slice(0, i).reverse().find((q) => q.shop), r = P.slice(i + 1).find((q) => q.shop);
      if (l && r && Math.abs(l.k - r.k) <= 4) P[i].shop = { cat: R() < 0.2 ? 'tolet' : (R() < 0.5 ? l : r).shop.cat, cell: null };
    }
    for (const p of P) if (p.shop && !p.shop.cell) p.shop.cell = p.shop.cat === 'tolet' ? shopCells.tolet[0] : cellFor(p.shop.cat);
  }

  // ---- pass 3: geometry ----
  // Houses: here only their colliders, data and a light far version (walls,
  // roofs, windows, chimney stacks) go in `shell`; the full detail is built
  // later, streamed in round the player (houseDetail).
  const det = new StaticBatch({ discard: true });
  for (const B of list) if (B.type === 'res') {
    const msS = new Mesher(), dmsD = new Mesher(); dmsD.discard = true;
    shell.force = homeChunk(B);
    buildResidential(B, msS, dmsD, det, M, world, net, houseRng(B), signs, shopSpots, shell);
    msS.flush(shell); shell.force = null;
  }
  for (const B of list) {
    if (B.type === 'res') continue;
    else if (B.type === 'shed') buildBlock(B, ms, batch, M, world, R, { h: 2.6, wall: M.brick, col: '#b9a597', roofCol: '#4a4d52', windows: false });
    else if (B.type !== 'skip' && B.type !== 'canopy') buildBig(B, ms, batch, M, world, R, net, pending);
    if (ms.m.size > 40) ms.flush(batch);
    if (detailMs.m.size > 40) detailMs.flush(batch, true);
  }
  ms.flush(batch); detailMs.flush(batch, true);
  finishHospital(batch, M, world, pending);
  // ---- shops on the walls of bigger buildings, and the petrol stations ----
  const used = [];
  for (const m of missed) {
    const { a, b, n, L } = m.wall;
    const W = Math.min(L - 0.6, m.cat === 'office' || m.cat === 'community' ? 5 : 6.2);
    if (W < 3.2) continue;
    const ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L;
    let t = (m.x - a[0]) * ex + (m.z - a[1]) * ez;
    t = Math.max(W / 2 + 0.3, Math.min(L - W / 2 - 0.3, t));
    // next to (not on top of) another shop already put on this wall
    for (let k = 0; k < 4; k++) { const hit = used.find((u) => u.wall === m.wall.key && Math.abs(u.t - t) < (u.W + W) / 2 + 0.3); if (!hit) break; t = hit.t + (t >= hit.t ? 1 : -1) * ((hit.W + W) / 2 + 0.4); }
    if (t < W / 2 || t > L - W / 2) continue;
    used.push({ wall: m.wall.key, t, W });
    const cx = a[0] + ex * t + n[0] * 0.02, cz = a[1] + ez * t + n[1] * 0.02, ry = Math.atan2(n[0], n[1]);
    const f = new Frame(batch, cx, cz, ry, G(cx + n[0] * 1.2, cz + n[1] * 1.2));
    const S = { cat: m.cat, cell: cellFor(m.cat) };
    if ((m.cat === 'takeaway' || m.cat === 'cafe' || m.cat === 'barber') && R() < 0.5) S.aboard = true;
    shopFront(f, W, S, M, signs, R, 0);
    shopSpots.push({ x: cx, z: cz, ry, front: [cx + n[0] * 1.8, cz + n[1] * 1.8], cat: m.cat, sign: S.cell, gF: f.y0 });
  }
  const stations = []; for (const [x, z] of petrol) if (!stations.some(([a, b]) => Math.hypot(a - x, b - z) < 40)) stations.push([x, z]);   // (shop + fuel points of one station)
  for (const [x, z] of stations) {
    const can = list.find((B) => B.type === 'canopy' && Math.hypot(B.c[0] - x, B.c[1] - z) < 20);
    if (can) jetStation(batch, M, world, net, can, list); else petrolStation(batch, M, world, net, x, z);
  }
  // ---- pass 4: yards and gardens (now every building has its colliders): colliders + data only ----
  for (const B of list) if (B.type === 'res' && B.plots) houseGardens(B, det, M, world, net);
  roadsideBoundaries(list, batch, M, world, net);
  NOTE = false;                    // (the boundary registry is complete: streamed rebuilds only read it)
  const residential = list.filter((b) => b.type === 'res');
  return { shopSpots, miniMart: shopSpots.find((s) => s.miniMart), residential, list };
}

// ------------------------------------------------------------------ streaming
// Each house has its own random stream, so it comes out identical however
// many times (and in whatever order) it is rebuilt.
function houseRng(B) { return rng(B.i * 7919 + 13); }
export function homeChunk(B) { return [Math.floor(B.o.cx / CHUNK), Math.floor(B.o.cz / CHUNK)]; }
function houseGardens(B, batch, M, world, net) {
  if (!B.modern) backYards(B, batch, M, world, net, rng(B.i * 31 + 7)); else rearGardens(B, batch, M, world, net);
  frontGardens(B, batch, M, world, net, rng(B.i * 17 + 3));
}
// Full detail of one house row (facades, doors, bays, sills, gutters, yards,
// gardens...) into `batch`, all in the row's home chunk. The world should be
// muted: its colliders were made at load.
export function houseDetail(B, batch, M, world, net, signs) {
  batch.force = homeChunk(B);
  const ms = new Mesher(), dms = new Mesher();
  buildResidential(B, ms, dms, batch, M, world, net, houseRng(B), signs, null, batch);
  ms.flush(batch); dms.flush(batch, true);
  if (B.plots) houseGardens(B, batch, M, world, net);
  batch.force = null;
}

// ------------------------------------------------------------------ houses
function buildResidential(B, ms, dms, batch, M, world, net, R, signs, shopSpots, shell = batch) {
  const F = B.F, { dMax, Dm, dR, rise } = B, dOut = dMax - Dm;
  const n2 = [F.nx, F.nz], back = [-F.nx, -F.nz];
  const eaveH = B.storeys * FLOOR + 0.45;
  const renderRow = !B.modern && B.nPlots <= 6 && R() < 0.1;   // (long Victorian rows are red brick; the odd house is rendered)
  let maxTop = -Infinity, minG = Infinity;
  B.plots.forEach((pl, idx) => {
    const { piece, gF } = pl;
    // roof lines from this house's own front (see pass 1)
    const dMax = pl.dMax ?? B.dMax, dR = dMax - Dm / 2, dOut = dMax - Dm;
    const rendered = renderRow || (!pl.shop && !B.modern && R() < 0.08);
    const wallMat = rendered ? M.render : M.brick, tint = rendered ? RENDER[(R() * RENDER.length) | 0] : B.tint, wtile = rendered ? 2 : 1.3;
    const eave = gF + eaveH + (pl.shop ? 0.3 : 0), ridge = eave + rise;
    const hMain = (d) => eave + rise * Math.max(0, 1 - Math.abs(d - dR) / (Dm / 2));
    const hOut = (d) => Math.max(gF + 3.2, eave - 0.7 - (dOut - d) * 0.22);
    const hAt = (d) => (d >= dOut - 1e-6 ? hMain(d) : hOut(d));
    let gMin = Infinity; for (const [a, d] of piece) { const w = F.toW(a, d); gMin = Math.min(gMin, G(w[0], w[1])); }
    gMin = Math.min(gMin, gF) - 0.6; minG = Math.min(minG, gMin); maxTop = Math.max(maxTop, ridge);
    pl.eave = eave; pl.ridge = ridge;
    const W = (a, d) => F.toW(a, d);
    // --- walls (split where the roof changes) ---
    for (let i = 0; i < piece.length; i++) {
      const A = piece[i], Bp = piece[(i + 1) % piece.length];
      const onCut = (Math.abs(A[0] - pl.a0) < 1e-3 && Math.abs(Bp[0] - pl.a0) < 1e-3 && pl.k > 0) || (Math.abs(A[0] - pl.a1) < 1e-3 && Math.abs(Bp[0] - pl.a1) < 1e-3 && pl.k < B.nPlots - 1);
      if (onCut) {
        // party wall: only visible where this house is higher than its neighbour
        const nb = B.plots.find((q) => q.k === (Math.abs(A[0] - pl.a0) < 1e-3 ? pl.k - 1 : pl.k + 1));
        if (!nb || gF - nb.gF < 0.12) continue;
      }
      const ts = [0, 1];
      for (const dl of [dR, dOut]) { const t = (dl - A[1]) / (Bp[1] - A[1]); if (t > 1e-4 && t < 1 - 1e-4 && isFinite(t)) ts.push(t); }
      ts.sort((x, y) => x - y);
      const ex = Bp[0] - A[0], ed = Bp[1] - A[1], el = Math.hypot(ex, ed) || 1;
      // outward normal in local (a,d): polygon orientation decides
      let na = ed / el, nd = -ex / el; if (!B.ccwLocal) { const s = localCCW(piece); B._s = s; if (!s) { na = -na; nd = -nd; } }
      const nW = [F.tx * na + F.nx * nd, F.tz * na + F.nz * nd];
      for (let k = 0; k < ts.length - 1; k++) {
        const t0 = ts[k], t1 = ts[k + 1];
        const p0 = [A[0] + ex * t0, A[1] + ed * t0], p1 = [A[0] + ex * t1, A[1] + ed * t1];
        const mid = (p0[1] + p1[1]) / 2, useOut = mid < dOut - 1e-3;
        const h0 = useOut ? hOut(p0[1]) : hMain(p0[1]), h1 = useOut ? hOut(p1[1]) : hMain(p1[1]);
        const w0 = W(...p0), w1 = W(...p1);
        wall(ms, wallMat, tint, w0, w1, gMin, h0, h1, nW, wtile, (p0[0] + p0[1]) * 1);
        // back/side windows
        const segL = el * (t1 - t0), facingFront = nd > 0.9;
        if (!facingFront && segL > 2.2 && !onCut) {
          const nWin = Math.max(1, Math.floor(segL / 3.4));
          for (let j = 0; j < nWin; j++) {
            const f = (j + 0.5) / nWin, wx = w0[0] + (w1[0] - w0[0]) * f, wz = w0[1] + (w1[1] - w0[1]) * f, top = Math.min(h0, h1);
            const gl = G(wx + nW[0] * 1.5, wz + nW[1] * 1.5);
            for (let fl = 0; fl < B.storeys; fl++) {
              const y = Math.max(gF, gl) + 1.5 + fl * FLOOR;
              if (y + 0.8 < top && R() < 0.75) winQuad(ms, M, wx, wz, y, 1.0, 1.2, nW, (R() * 4) | 0);
            }
          }
        }
      }
    }
    // step wall between the outrigger roof and the main roof
    const outPart = clip(piece, (p) => dOut - p[1]);
    if (outPart.length >= 3 && dOut > B.dMin + 0.5) {
      for (let i = 0; i < outPart.length; i++) {
        const A = outPart[i], Bp = outPart[(i + 1) % outPart.length];
        if (Math.abs(A[1] - dOut) < 1e-3 && Math.abs(Bp[1] - dOut) < 1e-3) wall(ms, wallMat, tint, W(...A), W(...Bp), hOut(dOut) - 0.05, hMain(dOut), hMain(dOut), back, wtile);
      }
    }
    // --- roof: front slope, back slope, outrigger ---
    const roofCol = B.modern ? '#8a5a48' : '#9aa0a8', roofMat = B.modern ? M.tile : M.slate;
    for (const [reg, hf] of [[clip(piece, (p) => p[1] - dR), hMain], [clip(clip(piece, (p) => dR - p[1]), (p) => p[1] - dOut), hMain], [outPart, hOut]]) {
      if (reg.length < 3 || Math.abs(area(reg)) < 0.05) continue;
      const T = triangulate(reg); if (!T.length) continue;
      const V = reg.map(([a, d]) => { const w = W(a, d); return [w[0], hf(d) + 0.02, w[1]]; });
      const UV = reg.map(([a, d]) => [a / 0.9, (d - dR) / 0.9 * 1.25]);
      ms.tris(roofMat, roofCol, V, UV, T, true);
    }
    // loft conversions: rear box dormer, or roof lights
    if (Dm > 6 && pl.a1 - pl.a0 > 3.8) {
      const u = R();
      if (u < 0.09) {
        const a0 = pl.a0 + 0.5, a1 = pl.a1 - 0.5, dIn = dR - 0.25, dOut = dR - Dm / 2 + 0.9, top = ridge - 0.15, low = hMain(dOut);
        const q = (a, d, y) => lift(W(a, d), y);
        const dcol = R() < 0.5 ? '#3c3f44' : '#d9d6cf', dmat = dcol === '#3c3f44' ? M.slate : M.render;
        ms.poly(dmat, dcol, [q(a0, dOut, low), q(a1, dOut, low), q(a1, dOut, top), q(a0, dOut, top)], [[0, 0], [2, 0], [2, 1], [0, 1]], [-F.nx, 0, -F.nz]);
        for (const [a, sgn] of [[a0, -1], [a1, 1]]) ms.poly(dmat, dcol, [q(a, dOut, low), q(a, dIn, hMain(dIn)), q(a, dIn, top), q(a, dOut, top)], [[0, 0], [1, 0], [1, 1], [0, 1]], [F.tx * sgn, 0, F.tz * sgn]);
        ms.poly(M.roofFlat, '#3a3c40', [q(a0, dOut, top), q(a1, dOut, top), q(a1, dIn, top), q(a0, dIn, top)], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
        const nW = [-F.nx, -F.nz], [wx, wz] = W((a0 + a1) / 2, dOut);
        winQuad(ms, M, wx, wz, (low + top) / 2 + 0.1, Math.min(2.2, a1 - a0 - 0.6), Math.max(0.6, top - low - 0.6), nW, (R() * 4) | 0, 0.02);
      } else if (u < 0.3) {
        for (const dd of [dR - Dm * 0.28, ...(R() < 0.4 ? [dR + Dm * 0.25] : [])]) {
          const ac = (pl.a0 + pl.a1) / 2 + (R() - 0.5) * 1.2, h0 = hMain(dd - 0.45), h1 = hMain(dd + 0.45);
          ms.poly(M.glass, '#2a343c', [lift(W(ac - 0.38, dd - 0.45), h0 + 0.06), lift(W(ac + 0.38, dd - 0.45), h0 + 0.06), lift(W(ac + 0.38, dd + 0.45), h1 + 0.06), lift(W(ac - 0.38, dd + 0.45), h1 + 0.06)], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
        }
      }
    }
    // ridge tiles
    if (!B.modern || R() < 0.5) dms.poly(M.ridge, '#6a3b30', [[...lift(W(pl.a0, dR - 0.14), ridge + 0.02)], [...lift(W(pl.a1, dR - 0.14), ridge + 0.02)], [...lift(W(pl.a1, dR), ridge + 0.12)], [...lift(W(pl.a0, dR), ridge + 0.12)]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
    // chimney on the party wall
    if (idx % 2 === 0 && Dm > 5) {
      const f = new Frame(batch, ...W(pl.a0 + (pl.k === 0 ? 0.5 : 0), dR - 0.2), Math.atan2(F.nx, F.nz), 0);
      f.y0 = ridge - 0.6;
      const fS = new Frame(shell, ...W(pl.a0 + (pl.k === 0 ? 0.5 : 0), dR - 0.2), Math.atan2(F.nx, F.nz), 0); fS.y0 = f.y0;
      fS.box(wallMat, 0, 0.8, 0, 0.8, 1.9, 1.3, { tile: wtile, color: tint });                // (stack: part of the far version too)
      f.box(M.dressed, 0, 1.8, 0, 0.9, 0.12, 1.4, { color: '#b8ae9c', detail: true });
      for (const dz of [-0.35, 0.05, 0.4]) if (R() < 0.75) f.box(M.clay, 0, 2.05, dz, 0.2, 0.4, 0.2, { color: '#b35a3a', detail: true, skip: 8 });
      if (R() < 0.2) { f.box(M.metal, 0, 2.6, 0, 0.03, 1.4, 0.03, { detail: true }); f.box(M.metal, 0, 3.1, 0, 0.7, 0.03, 0.03, { detail: true }); }
    }
    // --- the front ---
    if (pl.hasFront) facade(batch, M, F, pl, B, R, eave, wallMat, tint, net, signs, shopSpots, shell);
  });
  // colliders: the real footprint's outer walls
  const P = B.P, s = B.ccw ? 1 : -1;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) continue;
    const ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L;
    let nx = ez * s, nz = -ex * s;                                    // outward
    const cx = (a[0] + b[0]) / 2 - nx * 0.2, cz = (a[1] + b[1]) / 2 - nz * 0.2;
    const shopPl = B.plots.find((p) => p.shop && Math.hypot(p.front[0] - (a[0] + b[0]) / 2, p.front[1] - (a[1] + b[1]) / 2) < L / 2 + 1 && nx * F.nx + nz * F.nz > 0.8);
    const gy = shopPl ? shopPl.gF : minG + 0.6;
    const box = world.addOBB(cx, cz, L / 2 + 0.05, 0.2, Math.atan2(nx, nz), gy - 2, maxTop, 'building');
    if (shopPl) box.shop = true;
  }
}
// Victorian back yards: brick walls between neighbours and along the back,
// a wooden gate onto the alley, and the bins.
const BINS = ['#1e1f21', '#1e1f21', '#1f4e9a', '#6b4a2e'];   // Sheffield: black (general), blue (paper), brown (glass/cans)
function backYards(B, batch, M, world, net, R) {
  const F = B.F;
  for (const pl of B.plots) {
    let dBack = Infinity; for (const [, d] of pl.piece) dBack = Math.min(dBack, d);
    const am = (pl.a0 + pl.a1) / 2, [bx, bz] = F.toW(am, dBack - 0.05), g = G(bx, bz);
    // how much room behind: next building / wall / road
    const hit = world.raycastBoxes(bx, g + 1, bz, -F.nx, 0, -F.nz, 26, (b) => b.tag === 'building');
    const rr = net.nearest(bx - F.nx * 4, bz - F.nz * 4, null, (q) => q.kind !== 'f');
    let room = hit.dist;
    if (rr) { const edge = Math.hypot(bx - rr.px, bz - rr.pz) - rr.road.half - rr.road.pave; if (edge < room) room = Math.max(0, edge) * 2 + 2.2; } // a street right behind: yard up to its pavement
    const depth = room >= 24 ? 6 : Math.max(0, Math.min(7, (room - 2.2) / 2));
    if (depth < 2) continue;
    const dEnd = dBack - depth, W = pl.a1 - pl.a0, wh = 1.75, col = B.tint;
    // flagged yard + half the back entry behind it, for the ground mask
    const dAlley = dBack - (room >= 24 ? depth + 1.5 : Math.max(depth, room / 2));
    if (!world.muted) (B.yards ||= []).push([F.toW(pl.a0, dBack), F.toW(pl.a1, dBack), F.toW(pl.a1, dAlley), F.toW(pl.a0, dAlley)]);
    const f = new Frame(batch, ...F.toW(am, dEnd), Math.atan2(-F.nx, -F.nz), G(...F.toW(am, dEnd)));
    // rear wall with a gate (local +Z = away from the house, X runs along the row, mirrored)
    const gx = (R() < 0.5 ? -1 : 1) * (W / 2 - 0.9), gw = 0.95;
    const segs = [[-W / 2, gx - gw / 2], [gx + gw / 2, W / 2]];
    for (const [a, b] of segs) if (b - a > 0.1) {
      f.run(M.brick, -b, -a, 0, 0.22, -0.4, wh, { tile: 1.3, color: col, detail: true });
      f.run(M.dressed, -b - 0.01, -a + 0.01, 0, 0.3, wh - 0.01, wh + 0.07, { color: '#b9ae9a', detail: true });
    }
    f.run(M.wood, -gx - gw / 2, -gx + gw / 2, -0.02, 0.06, 0.03, wh * 0.9, { color: ['#3d5a3a', '#5a3b2a', '#2f3e5c', '#6b6b6b'][(R() * 4) | 0], detail: true });
    noteBound(...f.world(-W / 2, 0), ...f.world(W / 2, 0));
    const [wx, wz] = f.world(0, 0); world.addOBB(wx, wz, W / 2, 0.12, Math.atan2(-F.nx, -F.nz), f.y0 - 1, f.y0 + wh, 'wall');
    // party wall down the side of the yard (one per plot, on its a0 edge; the row end gets both)
    const sides = pl.k === B.nPlots - 1 ? [pl.a0, pl.a1] : [pl.a0];
    for (const a of sides) {
      const [sx, sz] = F.toW(a, dBack - depth / 2), sg = G(sx, sz), ry = Math.atan2(F.nx, F.nz);
      const [px0, pz0] = F.toW(a, dBack), [px1, pz1] = F.toW(a, dEnd), pg0 = G(px0, pz0), pg1 = G(px1, pz1);
      batch.sloped(M.brick, px0, pz0, px1, pz1, 0.22, pg0 - 0.4, pg1 - 0.4, pg0 + wh, pg1 + wh, { tile: 1.3, color: col, detail: true });
      world.addOBB(sx, sz, 0.11, depth / 2, ry, sg - 1, sg + wh, 'wall');
    }
    // bins by the gate (outside, in the alley) or in the yard
    if (R() < 0.55) for (let k = 0; k < 1 + (R() < 0.5 ? 1 : 0); k++) {
      const out = room > depth * 2 + 1.2 ? 0.55 : -0.6;
      f.box(M.plastic, -gx + (k - 0.5) * 0.7 + (gx > 0 ? -0.9 : 0.9), 0.53, out, 0.58, 1.06, 0.7, { color: BINS[(R() * BINS.length) | 0], detail: true });
    }
  }
}
function lift(w, y) { return [w[0], y, w[1]]; }
function localCCW(piece) { return area(piece) > 0; }

// Dress the street face of one house (Frame: origin on the front wall,
// +Z out of the wall, X along the street, y0 = pavement level).
function facade(batch, M, F, pl, B, R, eave, wallMat, tint, net, signs, shopSpots, shell = batch) {
  const W = pl.a1 - pl.a0, am = (pl.a0 + pl.a1) / 2;
  // this house's own front wall (real footprints are often set back or a
  // little skewed from the row): the facade sits exactly on it
  let dF = B.dMax, phi = 0;
  { let best = -Infinity; const P = pl.piece;
    for (let i = 0; i < P.length; i++) {
      const A = P[i], Bq = P[(i + 1) % P.length], lo = Math.min(A[0], Bq[0]), hi = Math.max(A[0], Bq[0]);
      if (hi - lo < 1e-4 || am < lo || am > hi) continue;
      const d = A[1] + (Bq[1] - A[1]) * (am - A[0]) / (Bq[0] - A[0]);
      if (d > best) { best = d; let ea = Bq[0] - A[0], ed = Bq[1] - A[1]; if (ea < 0) { ea = -ea; ed = -ed; } phi = Math.atan2(ed, ea); }
    }
    if (best > -Infinity) dF = best;
    if (Math.abs(phi) > 0.5) phi = 0; }
  const [fx, fz] = F.toW(am, dF), c = Math.cos(phi), sn = Math.sin(phi);
  const f = new Frame(batch, fx, fz, Math.atan2(F.nx * c - F.tx * sn, F.nz * c - F.tz * sn), pl.gF);
  const fW = new Frame(shell, fx, fz, f.ry, pl.gF);                  // windows: part of the far version too
  const m = pl.mirror ? -1 : 1, v = (R() * 4) | 0, D = 0;
  const eH = eave - pl.gF;
  const win = (lx, ly, w, h, vv) => {
    fW.geo(M.win, atlasQuad(w, h, vv * 0.25 + 0.004, 0, vv * 0.25 + 0.246, 1), lx, ly, D + 0.025);
    f.box(M.dressed, lx, ly + h / 2 + 0.1, D + 0.05, w + 0.3, 0.2, 0.12, { tile: 1, color: '#d6cbb5', detail: true, skip: 32 | 3 });
    f.box(M.dressed, lx, ly - h / 2 - 0.06, D + 0.08, w + 0.24, 0.1, 0.2, { tile: 1, color: '#d6cbb5', detail: true, skip: 32 | 3 });
  };
  // ginnel: the covered passage through the terrace to the back yards, on the
  // party wall between every other pair of houses (dark opening, brick arch)
  if (!B.modern && !pl.shop && pl.k > 0 && pl.k % 4 === 2 && B.nPlots > 3) {
    const gx = -W / 2;
    f.box(M.door, gx, 1.05, D + 0.012, 0.9, 2.1, 0.02, { color: '#0d0d0e' });
    f.box(M.dressed, gx, 2.22, D + 0.05, 1.3, 0.24, 0.1, { color: '#cdbfa6', detail: true });
    f.box(M.dressed, gx, 2.36, D + 0.06, 0.28, 0.2, 0.12, { color: '#d9ccb4', detail: true });          // keystone
  }
  // gutter + downpipe
  f.box(M.darkMetal, 0, eH - 0.05, D + 0.12, W, 0.12, 0.14, { color: '#1c1c1c', detail: true, skip: 32 | 3 });
  if (pl.k % 2) f.box(M.darkMetal, W / 2 - 0.08, eH / 2, D + 0.06, 0.08, eH, 0.08, { color: '#1c1c1c', detail: true });
  // plinth
  f.box(M.dressed, 0, 0.1, D + 0.02, W, 0.5, 0.06, { tile: 1, color: '#cfc3ad', detail: true, skip: 32 | 8 | 3 });
  const upper = (y) => { if (y + 0.7 > eH) return; win(W > 4.4 ? 0.95 * m : 0, y, 1.2, 1.35, (v + 1) % 4); if (W > 4.6) win(-(W / 2 - 1.0) * m, y, 0.8, 1.3, (v + 2) % 4); };
  if (!pl.shop) {
    const dx = -(W / 2 - 0.85) * m;
    f.box(M.door, dx, 1.2, D + 0.01, 0.95, 2.1, 0.1, { color: DOORS[(R() * DOORS.length) | 0], skip: 32 | 8 });
    fW.geo(M.win, atlasQuad(0.95, 0.35, 0.26, 0.05, 0.49, 0.3), dx, 2.48, D + 0.03);
    f.box(M.dressed, dx, 2.78, D + 0.04, 1.3, 0.22, 0.14, { color: '#d6cbb5', detail: true, skip: 32 | 3 });
    f.box(M.dressed, dx, 0.1, D + 0.28, 1.2, 0.22, 0.5, { tile: 1, color: '#bfb6a4', skip: 32 | 8 });
    const bx = W > 4.2 ? 0.95 * m : 0.4 * m;
    // the big c.1900-1910 terraces on the main roads (Firth Park Road, Barnsley
    // Road) have canted bays, often up both storeys; Page Hall's small
    // terraces mostly have flat fronts with the odd ground-floor bay
    const fs = net.nearestStreet(fx + F.nx * 4, fz + F.nz * 4), mainRoad = !!fs && (fs.road.kind === 'a' || fs.road.kind === 'b') && fs.dist < 25;
    const hasBay = !B.modern && W > 4.2 && (mainRoad ? R() < 0.9 : R() < 0.35), bay2 = hasBay && mainRoad && B.storeys >= 2 && R() < 0.6;
    const bay = (y0, base) => {
      const bw = 1.5, proj = 0.65, h = 1.5;
      if (base) f.box(M.dressed, bx, y0 - 1.2, D + proj / 2, bw + 0.9, 0.9, proj, { tile: 1, color: '#cdc2ad' });
      else { f.box(wallMat, bx, y0 - 0.95, D + proj / 2, bw + 0.9, 0.5, proj, { tile: 1.3, color: tint }); }
      fW.geo(M.win, atlasQuad(bw, h, v * 0.25 + 0.004, 0, v * 0.25 + 0.246, 1), bx, y0, D + proj + 0.01);
      for (const sd of [-1, 1]) fW.geo(M.win, atlasQuad(0.65, h, v * 0.25 + 0.05, 0, v * 0.25 + 0.2, 1), bx + sd * (bw / 2 + 0.2), y0, D + proj / 2, { ry: sd * 0.78 });
      for (const sd of [-1, 1]) f.box(M.dressed, bx + sd * (bw / 2 + 0.43), y0, D + 0.1, 0.12, h + 0.1, 0.2, { color: '#d6cbb5', detail: true });   // stone mullions at the corners
      f.box(M.dressed, bx, y0 + 0.85, D + proj / 2, bw + 0.95, 0.18, proj + 0.1, { color: '#d6cbb5' });
    };
    if (hasBay) {
      bay(1.65, true);
      if (bay2) { bay(1.65 + FLOOR, false); f.box(M.slate, bx, 1.65 + FLOOR + 1.05, D + 0.28, 2.4, 0.14, 0.62, { color: '#6e737a', rx: -0.35 }); }
      else f.box(M.slate, bx, 2.66, D + 0.28, 2.4, 0.14, 0.65, { color: '#6e737a', rx: -0.3 });
    } else win(bx, 1.6, B.modern ? 1.8 : 1.4, 1.5, v);
    const upperRow = (y) => { if (y + 0.7 > eH) return; if (!bay2 || y > 1.6 + FLOOR + 0.1) { upper(y); return; } if (W > 4.6) win(-(W / 2 - 1.0) * m, y, 0.8, 1.3, (v + 2) % 4); };
    upperRow(1.6 + FLOOR); if (B.storeys >= 3) upperRow(1.6 + FLOOR * 2);
    if (R() < 0.25) f.geo(M.dish, new THREE.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, 0.9), -W / 2 + 0.7, eH - 0.9, D + 0.25, { rx: Math.PI / 2 - 0.3, color: '#cfd2d4', detail: true });
    // (front gardens, walls, hedges and paths are laid out per terrace later: frontGardens)
    pl.doorW = f.world(dx, 0);
  } else {
    // ---- shopfront: frame, display, door, stall riser, fascia sign, shutter box ----
    const S = pl.shop;
    shopFront(f, W, S, M, signs, R, D);
    upper(4.9 - (eH < 6.3 ? 0.4 : 0)); if (B.storeys >= 3) upper(4.9 + FLOOR);
    if (shopSpots) shopSpots.push({ x: fx, z: fz, ry: f.ry, front: f.world(0, 1.8), cat: S.cat, sign: S.cell, miniMart: !!S.miniMart, gF: pl.gF });
  }
}

// Boundaries already built (garden walls, yard walls, fences), so the
// roadside pass doesn't double them up.
const BOUND = new Map();
const bKey = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
let NOTE = true;
function noteBound(x0, z0, x1, z1) {
  if (!NOTE) return;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
  for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n, key = bKey(x, z); if (!BOUND.has(key)) BOUND.set(key, []); BOUND.get(key).push([x, z]); }
}
function nearBound(x, z, r) {
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [a, b] of BOUND.get(bKey(x + i * 4, z + j * 4)) || []) if ((a - x) ** 2 + (b - z) ** 2 < r * r) return true;
  return false;
}

// Front gardens, laid out per terrace along the back of the pavement (so the
// walls are continuous and line up), from the real gap between each house
// and the pavement:
//  - under ~2 m: straight to the street (Page Hall): a paved forecourt, no wall
//  - deeper: a low brick wall with stone coping on the pavement line, a gate
//    opposite each front door with piers, dividing walls between neighbours,
//    a flagged path to the door; some with a privet hedge behind the wall;
//    semis and newer houses get hedges, low fences or walls.
function frontGardens(B, batch, M, world, net, R) {
  const F = B.F, nx = F.nx, nz = F.nz;
  const frontD = (P, a) => { let best = -Infinity; for (let i = 0; i < P.length; i++) { const A = P[i], Q = P[(i + 1) % P.length], lo = Math.min(A[0], Q[0]), hi = Math.max(A[0], Q[0]); if (hi - lo < 1e-4 || a < lo || a > hi) continue; const d = A[1] + (Q[1] - A[1]) * (a - A[0]) / (Q[0] - A[0]); if (d > best) best = d; } return best; };
  const march = (x, z) => { for (let t = 0.2; t < 24; t += 0.2) if (net.onRoadOrPavement(x + nx * t, z + nz * t, 0)) return t; return null; };
  const piece = (mat, x0, z0, x1, z1, t, lo, hi, color, tile = 0) => { const g0 = G(x0, z0), g1 = G(x1, z1); batch.sloped(mat, x0, z0, x1, z1, t, g0 + lo, g1 + lo, g0 + hi, g1 + hi, { color, tile, detail: true }); };
  const brickWall = (x0, z0, x1, z1, h) => {
    if (Math.hypot(x1 - x0, z1 - z0) < 0.15) return;
    piece(M.brick, x0, z0, x1, z1, 0.23, -0.4, h, B.tint, 1.3);
    piece(M.kerb, x0, z0, x1, z1, 0.32, h, h + 0.08, '#d4ccbb');                                 // stone coping
    noteBound(x0, z0, x1, z1);
    const g = G((x0 + x1) / 2, (z0 + z1) / 2); world.addOBB((x0 + x1) / 2, (z0 + z1) / 2, 0.12, Math.hypot(x1 - x0, z1 - z0) / 2, Math.atan2(x1 - x0, z1 - z0), g - 1, g + h, 'wall');
  };
  const hedge = (x0, z0, x1, z1, h) => {
    if (Math.hypot(x1 - x0, z1 - z0) < 0.3) return;
    piece(M.hedge, x0, z0, x1, z1, 0.75, -0.1, h - 0.12, '#3b6531');
    piece(M.hedge, x0, z0, x1, z1, 0.6, h - 0.14, h, '#446f37');                                 // rounded-off top
    noteBound(x0, z0, x1, z1);
  };
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) return;
    for (let k = 0; k <= Math.floor(L / 1.8); k++) { const t = Math.min(1, k * 1.8 / L), x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; batch.box(M.wood, x, G(x, z) + 0.42, z, 0.08, 0.95, 0.08, { color: '#6b5a44', detail: true }); }
    piece(M.wood, x0, z0, x1, z1, 0.03, 0.3, 0.85, '#7a6850'); noteBound(x0, z0, x1, z1);
  };
  const pts = [];
  for (const pl of B.plots) {
    if (!pl.hasFront || pl.shop) { pts.push(null); continue; }
    const d0 = frontD(pl.piece, pl.a0 + 0.05), d1 = frontD(pl.piece, pl.a1 - 0.05);
    if (!isFinite(d0) || !isFinite(d1)) { pts.push(null); continue; }
    const H0 = F.toW(pl.a0, d0), H1 = F.toW(pl.a1, d1), g0 = march(...H0), g1 = march(...H1);
    pts.push(g0 === null || g1 === null || Math.abs(g0 - g1) > 3 ? null : { pl, H0, H1, g0, g1 });
  }
  const style = B.modern ? 'modern' : R() < 0.3 ? 'hedge' : 'wall';
  const first = pts.find(Boolean), fr = first && net.nearestStreet(first.H0[0] + nx * (first.g0 + 1), first.H0[1] + nz * (first.g0 + 1));
  const onMain = !!fr && (fr.road.kind === 'a' || fr.road.kind === 'b');
  const wallH = onMain ? 1.0 : 0.85;                          // taller walls in front of the big houses on the main roads
  pts.forEach((q, i) => {
    if (!q) return;
    const { pl, H0, H1, g0, g1 } = q, g = Math.min(g0, g1);
    if (g < 2.0) {                                                                  // straight to the street: paved forecourt
      if (g > 0.3 && !world.muted) (B.forecourts ||= []).push([H0, H1, [H1[0] + nx * g1, H1[1] + nz * g1], [H0[0] + nx * g0, H0[1] + nz * g0]]);
      return;
    }
    const W0 = [H0[0] + nx * (g0 - 0.14), H0[1] + nz * (g0 - 0.14)], W1 = [H1[0] + nx * (g1 - 0.14), H1[1] + nz * (g1 - 0.14)];
    const L = Math.hypot(W1[0] - W0[0], W1[1] - W0[1]), ex = (W1[0] - W0[0]) / L, ez = (W1[1] - W0[1]) / L;
    // gate opposite the front door
    const dw = pl.doorW || [(H0[0] + H1[0]) / 2, (H0[1] + H1[1]) / 2];
    let u = (dw[0] - W0[0]) * ex + (dw[1] - W0[1]) * ez; u = Math.max(0.7, Math.min(L - 0.7, u));
    const Ga = [W0[0] + ex * (u - 0.5), W0[1] + ez * (u - 0.5)], Gb = [W0[0] + ex * (u + 0.5), W0[1] + ez * (u + 0.5)];
    const kind = style === 'modern' ? ['hedge', 'fence', 'wall'][pl.k % 3] : style;
    const run = (a, b) => {
      if (kind === 'fence') fence(...a, ...b);
      else if (kind === 'hedge' && B.modern) hedge(...a, ...b, 1.1);
      else { brickWall(...a, ...b, kind === 'hedge' ? 0.55 : wallH); if (kind === 'hedge') hedge(a[0] - nx * 0.5, a[1] - nz * 0.5, b[0] - nx * 0.5, b[1] - nz * 0.5, 1.35); }
    };
    run(W0, Ga); run(Gb, W1);
    if (kind !== 'fence' && !(kind === 'hedge' && B.modern)) for (const P of [Ga, Gb]) {         // gate piers
      const gp = G(...P), ph = (kind === 'hedge' ? 0.55 : wallH) + 0.22;
      batch.add(M.brick, tiledBox(0.36, ph + 0.4, 0.36, 1.3, 12), { x: P[0], y: gp + ph / 2 - 0.2, z: P[1], color: B.tint, ry: Math.atan2(ex, ez), detail: true });
      batch.add(M.kerb, tiledBox(0.44, 0.1, 0.44, 0, 8), { x: P[0], y: gp + ph + 0.05, z: P[1], color: '#d4ccbb', ry: Math.atan2(ex, ez), detail: true });
    }
    // dividing wall with the house to the left (and the right at the end of a row)
    const side = (Hp, Wp) => { if (B.modern) fence(...Hp, ...Wp); else brickWall(...Hp, ...Wp, 0.7); };
    side(H0, W0);
    if (!pts[i + 1]) side(H1, W1);
    // flagged path from the gate to the door
    const gm = [W0[0] + ex * u, W0[1] + ez * u], dp = [dw[0] + nx * 0.25, dw[1] + nz * 0.25], gD = G(...dp), gG = G(...gm);
    batch.sloped(M.pave, dp[0], dp[1], gm[0], gm[1], 0.95, gD - 0.1, gG - 0.1, gD + 0.03, gG + 0.03, { color: '#c9c3b8', detail: true });
    // a wheelie bin or two in the garden
    if (R() < 0.55) { const t = u > L / 2 ? 0.55 : L - 0.55, bx = W0[0] + ex * t - nx * 0.5, bz = W0[1] + ez * t - nz * 0.5; batch.box(M.plastic, bx, G(bx, bz) + 0.53, bz, 0.58, 1.06, 0.7, { color: BINS[(R() * BINS.length) | 0], ry: Math.atan2(ex, ez), detail: true }); }
  });
}

// Where the side or back of a house faces a street across a strip of
// garden, the plot is walled (terraces: 1.5 m brick wall with coping) or
// fenced (semis: close-board fence / hedge) along the back of the pavement.
function roadsideBoundaries(list, batch, M, world, net) {
  const grid = new Map(), GK = (x, z) => Math.floor(x / 30) * 7919 + Math.floor(z / 30);
  for (const B of list) if (B.type === 'res' && B.front) { const k = GK(B.o.cx, B.o.cz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(B); }
  const houseAt = (x, z) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const B of grid.get(GK(x + i * 30, z + j * 30)) || []) {
      const dx = x - B.o.cx, dz = z - B.o.cz; if (dx * dx + dz * dz > (B.o.hu + 1) ** 2) continue;
      if (inPoly(B.P, x, z)) return B;
    }
    return null;
  };
  for (const r of net.roads) {
    if (!(r.kind === 'a' || r.kind === 'b' || r.kind === 'r') || r.pave <= 0 || r.length < 8) continue;
    for (const side of [1, -1]) {
      let run = null;
      const flush = () => { if (run && run.pts.length >= 2) {
        const { B, pts } = run;
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
          if (B.modern) { if (B.i % 3 === 0) { const g0 = G(x0, z0), g1 = G(x1, z1); batch.sloped(M.hedge, x0, z0, x1, z1, 0.8, g0 - 0.2, g1 - 0.2, g0 + 1.6, g1 + 1.6, { color: '#3f6b35' }); world.addOBB((x0 + x1) / 2, (z0 + z1) / 2, 0.4, Math.hypot(x1 - x0, z1 - z0) / 2, Math.atan2(x1 - x0, z1 - z0), g0 - 1, g0 + 1.5, 'hedge'); }
            else fenceRun(batch, M, world, x0, z0, x1, z1); }
          else {
            const g0 = G(x0, z0), g1 = G(x1, z1);
            batch.sloped(M.brick, x0, z0, x1, z1, 0.24, g0 - 0.4, g1 - 0.4, g0 + 1.45, g1 + 1.45, { color: B.tint, tile: 1.3, detail: true });
            batch.sloped(M.dressed, x0, z0, x1, z1, 0.32, g0 + 1.45, g1 + 1.45, g0 + 1.55, g1 + 1.55, { color: '#b9ae9a', detail: true });
            world.addOBB((x0 + x1) / 2, (z0 + z1) / 2, 0.12, Math.hypot(x1 - x0, z1 - z0) / 2, Math.atan2(x1 - x0, z1 - z0), g0 - 1, g0 + 1.5, 'wall');
          }
        }
      } run = null; };
      for (let s = 1; s < r.length - 1; s += 2) {
        const p = net.pointAt(r, s, side * (r.half + r.pave + 0.2), {});
        const nx = p.tz * side, nz = -p.tx * side;                                          // away from the road
        let ok = !net.onRoadOrPavement(p.x, p.z, -0.05) && !nearBound(p.x, p.z, 1.6) && !houseAt(p.x, p.z);
        let B = null;
        if (ok) {
          const hit = world.raycastBoxes(p.x, G(p.x, p.z) + 1, p.z, nx, 0, nz, 16);
          B = hit.box && hit.box.tag === 'building' && hit.dist > 2.5 && hit.dist < 13 ? houseAt(p.x + nx * (hit.dist + 0.3), p.z + nz * (hit.dist + 0.3)) : null;
          // the front of a house has its own garden wall (or none): only sides and backs
          if (!B || B.front.nx * -nx + B.front.nz * -nz > 0.7) ok = false;
        }
        if (ok && run && run.B !== B && run.B.modern !== B.modern) flush();
        if (ok) { if (!run) run = { B, pts: [] }; run.pts.push([p.x, p.z]); } else flush();
      }
      flush();
    }
  }
}

// Close-board garden fence (1.8 m panels between concrete posts on a gravel
// board), following the ground.
function fenceRun(batch, M, world, x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.3) return;
  noteBound(x0, z0, x1, z1);
  const n = Math.max(1, Math.round(L / 1.83));
  for (let k = 0; k < n; k++) {
    const ax = x0 + (x1 - x0) * k / n, az = z0 + (z1 - z0) * k / n, bx = x0 + (x1 - x0) * (k + 1) / n, bz = z0 + (z1 - z0) * (k + 1) / n;
    const ga = G(ax, az), gb = G(bx, bz);
    batch.sloped(M.wood, ax, az, bx, bz, 0.04, ga + 0.14, gb + 0.14, ga + 1.8, gb + 1.8, { color: '#6e5238', tile: 1, detail: true });
    batch.sloped(M.dressed, ax, az, bx, bz, 0.05, ga - 0.2, gb - 0.2, ga + 0.15, gb + 0.15, { color: '#9d9a93', detail: true });
    batch.box(M.dressed, ax, ga + 0.85, az, 0.1, 2.1, 0.1, { color: '#a7a49c', detail: true });
  }
  batch.box(M.dressed, x1, G(x1, z1) + 0.85, z1, 0.1, 2.1, 0.1, { color: '#a7a49c', detail: true });
  const g = G((x0 + x1) / 2, (z0 + z1) / 2);
  world.addOBB((x0 + x1) / 2, (z0 + z1) / 2, 0.05, L / 2, Math.atan2(x1 - x0, z1 - z0), g - 1, g + 1.8, 'fence');
}

// Rear gardens of the semis and detached houses: fenced at the back (up to
// the pavement where the garden backs onto a road), down both sides and
// between the pair, with a side gate.
function rearGardens(B, batch, M, world, net) {
  const F = B.F, P = B.plots;
  let a0 = Infinity, a1 = -Infinity, dBack = Infinity;
  for (const pl of P) { a0 = Math.min(a0, pl.a0); a1 = Math.max(a1, pl.a1); for (const [, d] of pl.piece) dBack = Math.min(dBack, d); }
  const am = (a0 + a1) / 2, [bx, bz] = F.toW(am, dBack - 0.05), g = G(bx, bz);
  const hit = world.raycastBoxes(bx, g + 1, bz, -F.nx, 0, -F.nz, 30, (b) => b.tag === 'building');
  let room = hit.box && hit.box.tag === 'building' ? hit.dist / 2 : hit.dist - 0.3;          // halfway to the house behind
  const rr = net.nearest(bx - F.nx * 4, bz - F.nz * 4, null, (q) => q.kind !== 'f');
  if (rr) { const edge = Math.hypot(bx - rr.px, bz - rr.pz) - rr.road.half - rr.road.pave; if (edge < room + 0.2) room = Math.max(0, edge - 0.3); }
  const depth = Math.min(14, room);
  if (depth < 2.5) return;
  // side room: stop at the next building or road either side
  const side = (dir) => {
    const [sx, sz] = F.toW(dir > 0 ? a1 : a0, dBack - depth / 2);
    const h = world.raycastBoxes(sx, G(sx, sz) + 1, sz, F.tx * dir, 0, F.tz * dir, 6, (b) => b.tag === 'building');
    let r = h.box && h.box.tag === 'building' ? h.dist / 2 : 1.4;
    const rs = net.nearest(sx + F.tx * dir * 2, sz + F.tz * dir * 2, null, (q) => q.kind !== 'f');
    if (rs) { const e = Math.hypot(sx - rs.px, sz - rs.pz) - rs.road.half - rs.road.pave; if (e < r) r = Math.max(0.2, e - 0.2); }
    return Math.min(1.4, r);
  };
  const s0 = a0 - side(-1), s1 = a1 + side(1), dEnd = dBack - depth;
  const W = (a, d) => F.toW(a, d);
  fenceRun(batch, M, world, ...W(s0, dEnd), ...W(s1, dEnd));
  fenceRun(batch, M, world, ...W(s0, dBack + 0.6), ...W(s0, dEnd));
  fenceRun(batch, M, world, ...W(s1, dBack + 0.6), ...W(s1, dEnd));
  for (let i = 1; i < P.length; i++) fenceRun(batch, M, world, ...W(P[i].a0, dBack - 0.05), ...W(P[i].a0, dEnd));
  // side returns to the house corners, each with a gate (gap)
  if (a0 - s0 > 0.9) fenceRun(batch, M, world, ...W(s0, dBack + 0.6), ...W(a0 - 0.05, dBack + 0.6));
  if (s1 - a1 > 0.9) fenceRun(batch, M, world, ...W(a1 + 0.05, dBack + 0.6), ...W(s1, dBack + 0.6));
}

// Street-facing wall of a big (non-house) building within reach of a shop point.
function bigWallNear(list, net, x, z) {
  let best = null, bd = 18;
  for (const B of list) {
    if (B.type !== 'big' || !B.P || Math.hypot(B.o.cx - x, B.o.cz - z) > B.o.hu + 20) continue;
    const P = B.P, s = B.ccw ? 1 : -1;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 4) continue;
      const ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L, n = [ez * s, -ex * s];
      const t = Math.max(0, Math.min(L, (x - a[0]) * ex + (z - a[1]) * ez)), px = a[0] + ex * t, pz = a[1] + ez * t;
      const r = net.nearestStreet(px + n[0] * 3, pz + n[1] * 3);
      const toStreet = r ? Math.max(0, r.dist - r.road.half - r.road.pave) : 40;
      if (toStreet > 14) continue;                                                  // only walls that face a street
      const d = Math.hypot(px - x, pz - z) + toStreet * 0.5;
      if (d < bd) { bd = d; best = { a, b, n, L, key: B.i + ':' + i }; }
    }
  }
  return best;
}

// ---- the JET filling station on Owler Lane, built on its real mapped
// canopy footprint: white canopy on columns with the blue/yellow JET
// fascia and LED strip, two pump islands, the SPAR shop next door, the
// four-price pole sign at the road, air & water and the car wash.
let JETTEX = null;
function jetTextures() {
  if (JETTEX) return JETTEX;
  const cv = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const logo = (g, x, y, w, h) => {
    g.fillStyle = '#ffd100'; const r = h * 0.18;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill();
    g.fillStyle = '#0a3d91'; g.font = `italic 900 ${h * 0.78}px Arial Black, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('JET', x + w / 2, y + h * 0.54, w * 0.9);
  };
  JETTEX = {
    // canopy fascia: white, blue lower band, LED line, logo at centre
    fascia: cv(1024, 64, (g, w, h) => { g.fillStyle = '#f5f6f7'; g.fillRect(0, 0, w, h); g.fillStyle = '#0a3d91'; g.fillRect(0, h * 0.72, w, h * 0.28); g.fillStyle = '#ffd100'; g.fillRect(0, h * 0.66, w, h * 0.06); logo(g, w / 2 - 70, 4, 140, h * 0.6); }),
    // price pole: logo on top, four prices in LED digits
    pole: cv(256, 512, (g, w, h) => {
      g.fillStyle = '#0a3d91'; g.fillRect(0, 0, w, h); logo(g, 18, 16, w - 36, 90);
      const rows = [['Unleaded', '139.9'], ['Super Unl', '154.9'], ['Diesel', '146.9'], ['Premium D', '162.9']];
      rows.forEach(([n, p], i) => { const y = 130 + i * 92; g.fillStyle = '#111'; g.fillRect(14, y, w - 28, 80); g.fillStyle = '#fff'; g.font = 'bold 20px Arial'; g.textAlign = 'left'; g.fillText(n, 24, y + 26); g.fillStyle = '#ffb000'; g.font = 'bold 44px Courier New, monospace'; g.textAlign = 'right'; g.fillText(p, w - 22, y + 68); });
    }),
    // pump header
    pump: cv(256, 64, (g, w, h) => { g.fillStyle = '#0a3d91'; g.fillRect(0, 0, w, h); logo(g, w / 2 - 50, 8, 100, h - 16); }),
    // SPAR shop fascia
    spar: cv(512, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#00843d'; g.fillRect(0, h - 12, w, 12); g.fillStyle = '#e30613'; g.fillRect(0, h - 18, w, 6); g.fillStyle = '#e30613'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SPAR', w / 2, h * 0.42); g.fillStyle = '#00843d'; g.beginPath(); g.moveTo(w / 2 - 80, h * 0.7); g.lineTo(w / 2 - 68, h * 0.12); g.lineTo(w / 2 - 56, h * 0.7); g.fill(); }),
    wash: cv(256, 64, (g, w, h) => { g.fillStyle = '#0a3d91'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CAR WASH', w / 2, h / 2); }),
  };
  JETTEX.mat = {}; for (const k of ['fascia', 'pole', 'pump', 'spar', 'wash']) JETTEX.mat[k] = new THREE.MeshStandardMaterial({ map: JETTEX[k], roughness: 0.45, emissive: 0xffffff, emissiveMap: JETTEX[k], emissiveIntensity: 0.25, name: 'jet-' + k });
  return JETTEX;
}
function jetStation(batch, M, world, net, B, list) {
  const T = jetTextures(), o = B.o, H = B.b.h || 4.7;
  // long axis along Owler Lane; v points away from the road
  const r = net.nearestStreet(o.cx, o.cz);
  let ux = o.ux, uz = o.uz, vx = o.vx, vz = o.vz;
  if (r && (o.cx - r.px) * vx + (o.cz - r.pz) * vz < 0) { vx = -vx; vz = -vz; ux = -ux; uz = -uz; }
  const ry = Math.atan2(-vx, -vz);                       // local +Z faces the road
  let gMin = Infinity; for (const [x, z] of B.P) gMin = Math.min(gMin, G(x, z));
  const g0 = G(o.cx, o.cz);
  const f = new Frame(batch, o.cx, o.cz, ry, g0), hu = o.hu, hv = o.hv;
  const fq = (mat, w, h, x, y, z, rot = 0) => f.geo(mat, new THREE.PlaneGeometry(w, h), x, y, z, { ry: rot, color: '#ffffff' });
  // forecourt: concrete slab under the canopy and out to the road
  batch.add(M.pave, new THREE.PlaneGeometry(hu * 2 + 8, hv * 2 + 10).rotateX(-Math.PI / 2), { x: o.cx - vx * 1, y: g0 + 0.06, z: o.cz - vz * 1, ry, color: '#b9b8b3' });
  // canopy: deck, white soffit, fascia all round with the branding
  f.box(M.cladding, 0, H - 0.45, 0, hu * 2, 0.9, hv * 2, { color: '#f2f3f4', tile: 3 });
  for (const [w, x, z, rot] of [[hu * 2, 0, hv + 0.012, 0], [hu * 2, 0, -hv - 0.012, Math.PI], [hv * 2, hu + 0.012, 0, Math.PI / 2], [hv * 2, -hu - 0.012, 0, -Math.PI / 2]]) fq(T.mat.fascia, w, 0.9, x, H - 0.45, z, rot);
  for (let i = -2; i <= 2; i++) for (const zz of [-hv / 2, hv / 2]) f.box(M.lampHead, i * hu / 2.6, H - 0.93, zz, 1.2, 0.04, 0.5, { color: '#ffffff', detail: true });
  // two pump islands along the canopy, a column in each, three dispensers each
  for (const zz of [-hv * 0.42, hv * 0.42]) {
    f.box(M.dressed, 0, 0.1, zz, hu * 1.5, 0.22, 1.3, { color: '#cfcfca' });
    for (const x of [-hu * 0.75, hu * 0.75]) { f.box(M.metal, x, 0.4, zz, 0.18, 0.8, 0.18, { color: '#ffd100' }); }      // bollards
    f.box(M.metal, 0, H / 2, zz, 0.45, H, 0.45, { color: '#dfe1e3' });                                            // column
    const [cx, cz] = f.world(0, zz); world.addBox(cx - 0.3, cx + 0.3, g0 - 1, g0 + H, cz - 0.3, cz + 0.3, 'pole');
    for (const x of [-hu * 0.5, hu * 0.5]) {
      f.box(M.metal, x, 1.0, zz, 1.1, 1.8, 0.55, { color: '#e9ebed' });                                         // dispenser body
      f.box(M.darkMetal, x, 0.28, zz, 1.14, 0.4, 0.58, { color: '#2a2d31' });                                    // plinth
      for (const sd of [-1, 1]) {
        fq(T.mat.pump, 1.1, 0.28, x, 1.78, zz + sd * 0.281, sd > 0 ? 0 : Math.PI);                               // header
        f.box(M.darkMetal, x, 1.3, zz + sd * 0.29, 0.5, 0.36, 0.02, { color: '#0d0e10' });                        // screen
        for (const [nx, col] of [[-0.35, '#1e8e3e'], [0, '#1a1a1a'], [0.35, '#0a3d91']]) f.box(M.plastic, x + nx, 0.95, zz + sd * 0.3, 0.1, 0.18, 0.06, { color: col, detail: true });   // nozzles
      }
      const [px, pz] = f.world(x, zz); world.addOBB(px, pz, 0.6, 0.35, ry, g0 - 1, g0 + 1.9, 'pump');
    }
    const [ix, iz] = f.world(0, zz); world.addOBB(ix, iz, hu * 0.75, 0.65, ry, g0 - 1, g0 + 0.3, 'island');
  }
  // four-price pole sign at the road edge, by the entrance
  const [sx, sz] = f.world(hu + 1.5, hv + 3.5), sg = G(sx, sz);
  const pf = new Frame(batch, sx, sz, ry, sg);
  pf.box(M.darkMetal, 0, 2.7, 0, 1.5, 5.4, 0.35, { color: '#0a3d91' });
  for (const sd of [1, -1]) pf.geo(T.mat.pole, new THREE.PlaneGeometry(1.4, 2.8), 0, 3.8, sd * 0.18, { ry: sd > 0 ? 0 : Math.PI, color: '#ffffff' });
  world.addOBB(sx, sz, 0.75, 0.2, ry, sg - 1, sg + 5.4, 'sign');
  // air & water machine at the far end of the forecourt
  const [ax, az] = f.world(hu + 1.8, -hv + 1.5);
  const af = new Frame(batch, ax, az, ry, G(ax, az));
  af.box(M.plastic, 0, 0.8, 0, 0.6, 1.6, 0.45, { color: '#0a3d91' }); af.box(M.plastic, 0, 1.25, 0.23, 0.45, 0.35, 0.01, { color: '#ffd100' });
  // car wash: a roll-over bay behind the forecourt
  const [wx, wz] = f.world(hu + 4.5, -hv - 6), wg = G(wx, wz);
  if (!world.near(wx, wz, 6, []).some((b) => b.tag === 'building')) {
    const wf = new Frame(batch, wx, wz, ry + Math.PI / 2, wg);
    for (const sd of [-1, 1]) wf.box(M.cladding, sd * 2.4, 1.9, 0, 0.25, 3.8, 9, { color: '#e9ebee', tile: 3 });
    wf.box(M.cladding, 0, 3.9, 0, 5.1, 0.35, 9, { color: '#e9ebee', tile: 3 });
    for (const sd of [-1, 1]) wf.geo(T.mat.wash, new THREE.PlaneGeometry(4.4, 1.1), 0, 3.3, sd * 4.52, { ry: sd > 0 ? 0 : Math.PI, color: '#ffffff' });
    wf.box(M.plastic, 0, 1.6, 0, 3.6, 3.2, 0.5, { color: '#1c5fb8' });                                           // the brush gantry
    for (const sd of [-1, 1]) { const [cx, cz] = wf.world(sd * 2.4, 0); world.addOBB(cx, cz, 0.15, 4.5, ry + Math.PI / 2, wg - 1, wg + 4, 'building'); }
  }
  // SPAR sign on the shop next door (its wall facing the road)
  const shop = list.find((q) => q !== B && q.type === 'big' && Math.hypot(q.c[0] - o.cx, q.c[1] - o.cz) < 30);
  if (shop) {
    const P = shop.P, s = shop.ccw ? 1 : -1; let best = null;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 4) continue;
      const n = [(b[1] - a[1]) / L * s, -(b[0] - a[0]) / L * s], face = n[0] * -vx + n[1] * -vz;
      if (!best || face > best.face) best = { a, b, n, L, face };
    }
    if (best && best.face > 0.5) {
      const m = [(best.a[0] + best.b[0]) / 2 + best.n[0] * 0.05, (best.a[1] + best.b[1]) / 2 + best.n[1] * 0.05], sgy = G(m[0] + best.n[0], m[1] + best.n[1]);
      const sf = new Frame(batch, m[0], m[1], Math.atan2(best.n[0], best.n[1]), sgy), W = Math.min(best.L - 1, 12);
      sf.geo(T.mat.spar, new THREE.PlaneGeometry(W, 1.1), 0, (shop.b.h || 5.8) - 1.0, 0.02, { color: '#ffffff' });
      sf.box(M.glass, 0, 1.3, 0.03, W - 1, 2.4, 0.04, { color: '#ffffff' });                                     // glazed shop front
      sf.box(M.darkMetal, 0, 1.3, 0.05, 1.6, 2.2, 0.03, { color: '#3a3d40' });                                   // sliding doors
    }
  }
}

// Petrol station forecourt: canopy on four columns, two pump islands, a
// kiosk, price sign (unbranded).
function petrolStation(batch, M, world, net, x, z) {
  const r = net.nearestStreet(x, z); if (!r) return;
  const ry = Math.atan2(r.tx, r.tz), g = G(x, z);
  const f = new Frame(batch, x, z, ry, g);
  f.box(M.pave, 0, -0.1, 0, 12, 0.3, 18, { color: '#8d8d8a' });                                         // forecourt
  for (const [cx, cz] of [[-4.2, -6], [4.2, -6], [-4.2, 6], [4.2, 6]]) f.box(M.metal, cx, 2.6, cz, 0.35, 5.2, 0.35, { color: '#e8e8e8' });
  f.box(M.metal, 0, 5.4, 0, 11, 0.7, 16, { color: '#f4f4f2' });                                          // canopy
  f.box(M.plastic, 0, 5.4, 0, 11.06, 0.3, 16.06, { color: '#1f7a4a' });                                  // canopy band
  f.box(M.lampHead, 0, 5.03, 0, 9, 0.04, 14, { color: '#ffffff', detail: true });
  for (const cz of [-4, 4]) {
    f.box(M.dressed, 0, 0.1, cz, 1.2, 0.2, 6, { color: '#c9c4b8' });                                      // island
    for (const pz of [-1.5, 1.5]) {
      f.box(M.metal, 0, 0.95, cz + pz, 0.5, 1.7, 0.9, { color: '#e4e6e8' });                             // pump
      f.box(M.plastic, 0, 1.3, cz + pz, 0.52, 0.5, 0.6, { color: '#1b1b1b' });                           // screen panel
      f.box(M.plastic, 0, 1.78, cz + pz, 0.54, 0.16, 0.92, { color: '#1f7a4a' });
    }
    world.addOBB(...f.world(0, cz), 0.6, 3, ry, g - 1, g + 1.8, 'pump');
  }
  // kiosk behind, price totem at the kerb
  f.box(M.render, -9, 1.6, 0, 6, 3.2, 10, { color: '#e9e6df' });
  f.box(M.glass, -5.95, 1.4, 0, 0.06, 2.2, 6, { color: '#ffffff' });
  f.box(M.plastic, -9, 3.35, 0, 6.1, 0.3, 10.1, { color: '#1f7a4a' });
  world.addOBB(...f.world(-9, 0), 3, 5, ry, g - 1, g + 3.2, 'building');
  f.box(M.metal, 7, 1.6, -8, 0.3, 3.2, 1.6, { color: '#f4f4f2' });
  f.box(M.plastic, 7.16, 2.3, -8, 0.02, 1.4, 1.3, { color: '#111' });
  for (const [k, c] of ['#f2c30f', '#3fbf4a'].entries()) f.box(M.plastic, 7.17, 2.75 - k * 0.5, -8, 0.02, 0.3, 1.1, { color: c });  // unleaded / diesel price lines
  for (const [cx, cz] of [[-4.2, -6], [4.2, -6], [-4.2, 6], [4.2, 6]]) { const [wx, wz] = f.world(cx, cz); world.addBox(wx - 0.2, wx + 0.2, g - 1, g + 5, wz - 0.2, wz + 0.2, 'pole'); }
}

// Shopfront on a wall (Frame: +Z out of the wall, X along it, y0 = pavement):
// frame, display window, door, stall riser, fascia sign, shutter box, extras.
function shopFront(f, W, S, M, signs, R, D = 0) {
  const cell = signs.cell(S.cell);
  f.box(M.darkMetal, 0, 1.4, D + 0.05, W - 0.3, 3.6, 0.12, { color: '#2a2a2a' });                 // (reaches below the pavement on slopes)
  const dv = DISPLAY[S.miniMart ? 'miniMart' : S.cat] ?? 0, du = (dv % 4) * 0.25, dvv = dv < 4 ? 0.5 : 0;
  f.geo(M.display, atlasQuad(W - 1.8, 2.2, du, dvv, du + 0.25, dvv + 0.5), 0.55, 1.6, D + 0.13);
  f.box(M.glass, -W / 2 + 0.75, 1.25, D + 0.1, 0.95, 2.3, 0.06, { color: '#ffffff' });
  f.box(M.dressed, 0, -0.03, D + 0.12, W - 0.3, 0.96, 0.14, { color: '#3a3a3a' });
  f.geo(M.sign, atlasBox(W - 0.2, 0.85, 0.2, cell.u0, cell.v0, cell.u1, cell.v1), 0, 3.6, D + 0.2);
  f.box(M.metal, 0, 3.1, D + 0.2, W - 0.4, 0.22, 0.25, { color: '#9aa0a3', detail: true });
  if (S.cat === 'tolet' || R() < 0.1) f.box(M.metal, 0.55, 2.45, D + 0.16, W - 1.8, 1.1, 0.04, { color: '#8e9497' });
  if (S.awning) for (let i = 0; i < 6; i++) f.box(M.fabric, -W / 2 + 0.35 + (i + 0.5) * (W - 0.7) / 6, 2.9, D + 0.95, (W - 0.7) / 6, 0.05, 1.6, { color: i % 2 ? '#f2efe6' : S.awning, rx: 0.32, detail: true });
  if (S.stall) for (let i = 0; i < Math.floor((W - 1.6) / 0.95); i++) {
    const x = -W / 2 + 1.6 + i * 0.95;
    f.box(M.wood, x, 0.35, D + 0.9, 0.85, 0.7, 0.6, { color: '#8a6a44', detail: true });
    f.box(M.fruit, x, 0.78, D + 0.9, 0.78, 0.18, 0.52, { color: ['#e35d1a', '#4caf50', '#f4d03f', '#c0392b', '#7d3c98'][(R() * 5) | 0], detail: true });
  }
  if (S.aboard) f.box(M.wood, W / 2 - 0.8, 0.5, D + 1.4, 0.6, 0.95, 0.12, { color: '#222', rx: 0.12, detail: true });
  if (S.cat === 'pharmacy') { f.box(M.signalLens, W / 2 - 0.3, 4.1, D + 0.45, 0.1, 0.7, 0.7, { color: '#19c24a' }); }
}

// ------------------------------------------------------------------ big buildings
function buildBlock(B, ms, batch, M, world, R, { h, wall: wallMat, col, roofCol, windows, band, tile = 1.3, floors, glass, floorH = 3.5, winW = 1.3, winH = 1.5, winGap = 3, courses = null, pitched = false, plant = false, accent = null }) {
  const P = B.P, s = B.ccw ? 1 : -1;
  let gMin = Infinity, gSum = 0; for (const [x, z] of P) { const g = G(x, z); gMin = Math.min(gMin, g); gSum += g; }
  const gAvg = gSum / P.length, top = gAvg + h, bot = gMin - 0.6;
  const nf = floors || Math.max(1, Math.floor((h - 1) / floorH));
  let u = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L, n = [ez * s, -ex * s];
    wall(ms, wallMat, col, a, b, bot, top, top, n, tile, u); u += L;
    const ga = G((a[0] + b[0]) / 2 + n[0] * 2, (a[1] + b[1]) / 2 + n[1] * 2), base = Math.max(ga, gAvg);
    if (windows && L > 3) {
      for (let fl = 0; fl < nf; fl++) {
        const y0 = base + 0.9 + fl * floorH; if (y0 + winH > top - 0.3) break;
        if (band) { const m = 0.8 / L; bandQuad(ms, glass || M.officeGlass, '#3c4a54', [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m], [b[0] - (b[0] - a[0]) * m, b[1] - (b[1] - a[1]) * m], y0, y0 + winH, n); }
        else { const k = Math.floor(L / winGap); for (let j = 0; j < k; j++) { const f = (j + 0.5) / k; if (R() < 0.92) winQuad(ms, M, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, y0 + winH / 2, winW, winH, n, (R() * 4) | 0); } }
      }
    }
    // stone string courses at each floor (Victorian) / concrete spandrel lines
    if (courses && L > 1) for (let fl = 1; fl <= nf; fl++) { const y = base + fl * floorH - 0.25; if (y > top - 0.2) break; bandQuad(ms, M.dressed, courses, a, b, y, y + 0.22, n, 0.05, 1); }
    // accent panel strips on modern cladding
    if (accent && L > 8 && R() < 0.5) { const f = 0.15 + R() * 0.6, w = 2.4 / L; bandQuad(ms, M.cladding, accent, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], [a[0] + (b[0] - a[0]) * (f + w), a[1] + (b[1] - a[1]) * (f + w)], base + 0.3, top - 0.3, n, 0.06, 3); }
    world.addOBB((a[0] + b[0]) / 2 - n[0] * 0.2, (a[1] + b[1]) / 2 - n[1] * 0.2, L / 2 + 0.05, 0.2, Math.atan2(n[0], n[1]), bot - 1.4, top + (pitched ? 3 : 0), B.tag || 'building');
  }
  const o = B.o;
  if (pitched && B.fill > 0.78 && o.hv < 11) {
    // slate roof over the main rectangle, ridge along the long axis
    const rise = Math.min(o.hv * 0.75, 4.5), c = [o.cx, o.cz], U = [o.ux * o.hu, o.uz * o.hu], V = [o.vx * (o.hv + 0.25), o.vz * (o.hv + 0.25)];
    const pt = (su, sv, y) => [c[0] + U[0] * su + V[0] * sv, y, c[1] + U[1] * su + V[1] * sv];
    for (const sv of [1, -1]) ms.poly(M.slate, '#8f959d', [pt(1, sv, top), pt(-1, sv, top), pt(-1, 0, top + rise), pt(1, 0, top + rise)], [[o.hu / 0.9, 0], [-o.hu / 0.9, 0], [-o.hu / 0.9, rise * 1.4], [o.hu / 0.9, rise * 1.4]], [o.vx * sv, 1, o.vz * sv]);
    for (const su of [1, -1]) ms.poly(wallMat, col, [pt(su, 1, top), pt(su, -1, top), pt(su, 0, top + rise)], [[0, 0], [2 * o.hv / tile, 0], [o.hv / tile, rise / tile]], [o.ux * su, 0, o.uz * su]);
    ms.tris(M.roofFlat, roofCol, P.map(([x, z]) => [x, top - 0.02, z]), P.map(([x, z]) => [x / 4, z / 4]), triangulate(P), true);
  } else {
    // flat roof + parapet coping
    const T = triangulate(P);
    if (T.length) ms.tris(M.roofFlat, roofCol, P.map(([x, z]) => [x, top, z]), P.map(([x, z]) => [x / 4, z / 4]), T, true);
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) continue;
      batch.box(M.dressed, (a[0] + b[0]) / 2, top + 0.2, (a[1] + b[1]) / 2, 0.3, 0.4, L + 0.25, { color: '#b8b2a6', ry: Math.atan2(b[0] - a[0], b[1] - a[1]), detail: true });
    }
    // rooftop plant rooms, flues and air handling units
    if (plant && B.A > 600) {
      const k = 1 + Math.min(3, Math.floor(B.A / 1500));
      for (let j = 0; j < k; j++) {
        const u0 = (R() - 0.5) * o.hu, v0 = (R() - 0.5) * o.hv * 0.8, x = o.cx + o.ux * u0 + o.vx * v0, z = o.cz + o.uz * u0 + o.vz * v0;
        const w = 4 + R() * 6, d = 3 + R() * 4, hh = 2.2 + R() * 1.6;
        batch.box(M.cladding, x, top + hh / 2, z, w, hh, d, { color: '#9aa1a6', tile: 3, ry: Math.atan2(o.ux, o.uz) });
        for (let f = 0; f < 3; f++) batch.box(M.metal, x + (R() - 0.5) * w, top + hh + 0.6, z + (R() - 0.5) * d, 0.35, 1.2, 0.35, { color: '#b8bcc0', detail: true });
      }
    }
  }
  return { top, gMin, base: gAvg };
}

// Blue site signs with the real building names (public buildings).
let SIGNS = null;
function hospitalSign(name) {
  if (!SIGNS) { const c = document.createElement('canvas'); c.width = 1024; c.height = 2048; SIGNS = { c, g: c.getContext('2d'), n: 0, tex: null, idx: new Map() }; }
  if (SIGNS.idx.has(name)) return SIGNS.idx.get(name);
  const i = SIGNS.n++, x = (i % 2) * 512, y = Math.floor(i / 2) * 64, g = SIGNS.g;
  const red = /EMERGENCY/.test(name);
  g.fillStyle = red ? '#c8102e' : '#005eb8'; g.fillRect(x, y, 512, 64);
  g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, x + 256, y + 33, 490);
  const cell = { u0: x / 1024, u1: (x + 512) / 1024, v0: 1 - (y + 64) / 2048, v1: 1 - y / 2048 };
  SIGNS.idx.set(name, cell); return cell;
}
export function hospitalSignMaterial() {
  if (!SIGNS) return null;
  const t = new THREE.CanvasTexture(SIGNS.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, vertexColors: true, name: 'hospSign' });
}
const HOSP_OLD = /Clock Tower|Coleridge|North House|Estate|Laundry|Vickers|Nurses|Community House|Occupational|Rivermead|Therapy|Unison|Longley/;
const HOSP_70S = /Huntsman|Firth Building|Chesterman|Brearley|Medical Education|Cystic|Critical Care|Nuclear|Kidney|Hand Centre|Radiology|Laboratory|Spinal/;
const HOSP_FLOORS = { 'Huntsman Building': 6, 'Chesterman Wing': 6, 'Firth Building': 5, 'Brearley Wing': 4, 'Critical Care Department': 3 };
function buildHospitalBlock(B, ms, batch, M, world, R, net, pending) {
  const name = B.b.n || '', hh = B.b.h;
  const style = HOSP_OLD.test(name) || (!name && B.c[1] < -200 && B.A < 1500) ? 'victorian' : HOSP_70S.test(name) || (!name && B.A > 2500) ? 'seventies' : 'modern';
  let res;
  if (style === 'victorian') {
    const nf = hh ? Math.max(1, Math.round((hh - 1) / 3.7)) : B.A > 1200 ? 3 : 2;
    res = buildBlock(B, ms, batch, M, world, R, { h: hh || nf * 3.7 + 0.8, floors: nf, floorH: 3.7, wall: M.brick, col: ['#dcb9a6', '#cfae9c', '#e2c2ad'][B.i % 3], roofCol: '#4f5256', windows: true, winW: 1.15, winH: 1.9, winGap: 2.7, courses: '#d8ccb4', pitched: true });
  } else if (style === 'seventies') {
    const nf = HOSP_FLOORS[name] || (hh ? Math.max(1, Math.round(hh / 3.8)) : B.A > 2500 ? 5 : 3);
    res = buildBlock(B, ms, batch, M, world, R, { h: hh || nf * 3.8 + 1, floors: nf, floorH: 3.8, wall: M.render, col: ['#cdc6b6', '#c2bcae', '#d6d0c2'][B.i % 3], roofCol: '#55585c', windows: true, band: true, winH: 1.7, glass: M.officeGlass, courses: '#b3ad9f', plant: true, tile: 2 });
  } else {
    const nf = hh ? Math.max(1, Math.round(hh / 3.8)) : B.A > 2000 ? 4 : B.A > 700 ? 3 : 2;
    res = buildBlock(B, ms, batch, M, world, R, { h: hh || nf * 3.8 + 0.8, floors: nf, floorH: 3.8, wall: M.cladding, col: ['#e9e7e1', '#dde2e4', '#d3dad6'][B.i % 3], roofCol: '#55585c', windows: true, band: true, winH: 1.8, glass: M.officeGlass, plant: true, tile: 3, accent: ['#2f7fb5', '#3a9d8f', '#6aa84f', '#8c5fa8'][B.i % 4] });
  }
  // the Clock Tower building: its tower
  if (/Clock Tower/.test(name)) pending.push({ kind: 'clock', x: B.o.cx, z: B.o.cz, y: res.top, ry: Math.atan2(B.o.ux, B.o.uz) });
  // name sign on the wall facing the nearest road; A&E at the Huntsman Building
  if (name && B.A > 300) {
    let best = null;
    const P = B.P, s = B.ccw ? 1 : -1;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 6) continue;
      const n = [(b[1] - a[1]) / L * s, -(b[0] - a[0]) / L * s], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const r = net.nearest(m[0] + n[0] * 6, m[1] + n[1] * 6, null, (q) => q.kind !== 'f');
      const d = r ? r.dist : 99; if (!best || d < best.d) best = { d, m, n, L };
    }
    if (best) {
      pending.push({ kind: 'sign', name, x: best.m[0], z: best.m[1], n: best.n, y: G(best.m[0] + best.n[0] * 2, best.m[1] + best.n[1] * 2) + Math.min(res.top - res.base - 1.2, 4.2), w: Math.min(best.L - 2, 7) });
      if (/Huntsman/.test(name)) pending.push({ kind: 'ae', x: best.m[0], z: best.m[1], n: best.n, y: G(best.m[0] + best.n[0] * 3, best.m[1] + best.n[1] * 3) });
    }
  }
  return res;
}

// signs, canopies and the clock tower (added once the sign texture exists)
export function finishHospital(batch, M, world, pending, scene) {
  if (!pending.length) return;
  for (const p of pending) if (p.kind === 'ae') hospitalSign('EMERGENCY DEPARTMENT  ·  A&E');
  for (const p of pending) if (p.kind === 'sign') hospitalSign(p.name);
  const mat = hospitalSignMaterial();
  for (const p of pending) {
    if (p.kind === 'sign' || p.kind === 'ae') {
      const cell = hospitalSign(p.kind === 'ae' ? 'EMERGENCY DEPARTMENT  ·  A&E' : p.name), ry = Math.atan2(p.n[0], p.n[1]);
      const f = new Frame(batch, p.x + p.n[0] * 0.08, p.z + p.n[1] * 0.08, ry, p.y);
      if (p.kind === 'sign') f.geo(mat, atlasQuad(p.w, p.w / 8, cell.u0, cell.v0, cell.u1, cell.v1), 0, 0, 0.02, { color: '#ffffff' });
      else {
        // drop-off canopy on columns with the red A&E sign on its fascia
        const W = 14, D = 6;
        f.box(M.cladding, 0, 3.6, D / 2, W, 0.4, D, { color: '#e8e8e4', tile: 3 });
        for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) f.box(M.metal, x, 1.8, D - 0.4, 0.25, 3.6, 0.25, { color: '#c9ccd0' });
        f.geo(mat, atlasQuad(W - 1, (W - 1) / 8, cell.u0, cell.v0, cell.u1, cell.v1), 0, 3.6, D + 0.02, { color: '#ffffff' });
        f.box(M.glass, 0, 1.3, 0.08, 4, 2.6, 0.08, { color: '#ffffff' });                       // sliding doors
        const [cx, cz] = f.world(0, D / 2);
        for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) { const [wx, wz] = f.world(x, D - 0.4); world.addBox(wx - 0.15, wx + 0.15, p.y - 1, p.y + 3.6, wz - 0.15, wz + 0.15, 'pole'); }
        void cx; void cz;
      }
    } else if (p.kind === 'clock') {
      // square brick tower rising through the roof: stone quoins, clock faces, pyramid roof, finial
      const f = new Frame(batch, p.x, p.z, p.ry, p.y - 2), T = 5.2, H = 13;
      f.box(M.brick, 0, H / 2, 0, T, H, T, { color: '#d9b49e', tile: 1.3 });
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(M.dressed, x * T / 2, H / 2, z * T / 2, 0.5, H, 0.5, { color: '#d8ccb4', tile: 1 });
      f.box(M.dressed, 0, H + 0.2, 0, T + 0.5, 0.4, T + 0.5, { color: '#d8ccb4' });
      const face = clockTexture();
      for (const [dx, dz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
        f.geo(face, new THREE.CircleGeometry(1.35, 24), dx * (T / 2 + 0.03), H - 2.4, dz * (T / 2 + 0.03), { ry, color: '#ffffff' });
        f.box(M.dressed, dx * (T / 2 + 0.02), H - 2.4, dz * (T / 2 + 0.02), dx ? 0.1 : 3.1, 3.1, dz ? 0.1 : 3.1, { color: '#d8ccb4' });
      }
      const roof = new THREE.ConeGeometry(T * 0.78, 5.5, 4, 1).rotateY(Math.PI / 4);
      f.geo(M.slate, roof, 0, H + 3.15, 0, { color: '#7e858d' });
      f.box(M.metal, 0, H + 6.5, 0, 0.12, 1.6, 0.12, { color: '#3a3d40' });
      world.addBox(p.x - T / 2, p.x + T / 2, p.y - 3, p.y + H + 4, p.z - T / 2, p.z + T / 2, 'building');
    }
  }
}
let CLOCK = null;
function clockTexture() {
  if (CLOCK) return CLOCK;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((t, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.fillText(t, 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); });
  g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 50, 128 - 30); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 10, 128 - 88); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  CLOCK = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, vertexColors: true });
  return CLOCK;
}

function buildBig(B, ms, batch, M, world, R, net, pending) {
  const { b, cls } = B, hash = (B.i * 2654435761) % 1000 / 1000;
  const lv = b.l, hh = b.h;
  if (cls === 'hospital' || B.type === 'hospital') return buildHospitalBlock(B, ms, batch, M, world, R, net, pending);
  if (cls === 'school' || cls === 'college' || B.type === 'school') {
    const h = hh || (lv ? lv * 3.8 : 8);
    return buildBlock(B, ms, batch, M, world, R, { h, wall: hash < 0.5 ? M.brick : M.cladding, col: hash < 0.5 ? '#e0bda6' : '#e6e3da', roofCol: '#4a4d52', windows: true, band: true, glass: M.officeGlass });
  }
  if (cls === 'church' || cls === 'chapel' || cls === 'mosque') {
    B.tag = 'church';
    return buildBlock(B, ms, batch, M, world, R, { h: hh || 8, wall: M.ashlar, col: '#c9bfa8', roofCol: '#6d5048', windows: true, tile: 2 });
  }
  if (cls === 'industrial' || cls === 'warehouse' || (!cls && B.A > 1500)) {
    return buildBlock(B, ms, batch, M, world, R, { h: hh || 7.5, wall: M.cladding, col: ['#8f9a92', '#9aa4ad', '#b5b0a5', '#7d8a7f'][(hash * 40 | 0) % 4], roofCol: '#5d6166', windows: false, tile: 3 });
  }
  if (cls === 'retail' || cls === 'commercial' || cls === 'office' || cls === 'apartments') {
    const h = hh || (lv ? lv * 3.3 : 7);
    return buildBlock(B, ms, batch, M, world, R, { h, wall: M.brick, col: '#dcb9a6', roofCol: '#4f5256', windows: true, band: cls !== 'apartments' });
  }
  // unclassified large building: brick, a couple of storeys
  const h = hh || (lv ? lv * 3.2 : B.A > 600 ? 8 : 6.5);
  return buildBlock(B, ms, batch, M, world, R, { h, wall: hash < 0.7 ? M.brick : M.render, col: hash < 0.7 ? BRICK[(hash * 70 | 0) % BRICK.length] : '#d9d6cf', roofCol: '#4f5256', windows: true });
}
