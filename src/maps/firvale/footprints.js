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
import { Frame, rng, atlasQuad } from './buildings.js';
import { area, centroid, obb, clip, triangulate, Mesher, flatToPts } from './geom.js';

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
        const tx = nz, tz = -nx; let score = 0, k = 0;
        for (const f of [-0.6, 0, 0.6]) {
          const x = o.cx + nx * (dist + 3) + tx * along * f, z = o.cz + nz * (dist + 3) + tz * along * f;
          const r = net.nearestStreet(x, z);
          score += r ? Math.max(0, r.dist - r.road.half - r.road.pave) : 40; k++;
        }
        score /= k;
        if (along < 3.6 && (sides[0][3] > 9)) score += 8;    // short end of a long terrace: rarely the front
        if (!best || score < best.score) best = { nx, nz, dist, along, score };
      }
      B.front = best;
      const len = best.along * 2;
      let pw = cls === 'semidetached_house' ? 7.5 : cls === 'detached' || cls === 'bungalow' ? 99 : 5.1;
      let n = Math.max(1, Math.round(len / pw));
      if (len / n < 3.6) n = Math.max(1, Math.floor(len / 3.6));
      B.nPlots = n;
      B.storeys = b.l ? Math.min(4, b.l) : b.h ? Math.max(1, Math.min(4, Math.round((b.h - 2.5) / 2.9))) : cls === 'apartments' ? 3 : 2;
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
export function buildFootprints(batch, M, world, net, osm, { signs, shopCells, special, miniMartAt }) {
  const R = rng(1904);
  const list = analyse(osm, net, special);
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
      const fm = F.toW((a0 + a1) / 2, dMax);
      const gF = G(fm[0], fm[1]);
      const pl = { B, k, a0, a1, w, piece, gF, front: fm, shop: null, mirror: k % 2 === 1 };
      pl.hasFront = piece.some(([, d]) => d > dMax - 0.35);
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
  for (const [x, z, cat] of osm.shops) {
    if (cat === 'petrol') continue;
    const p = nearPlot(x, z, 26);
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
  for (const B of list) {
    if (B.type === 'res') buildResidential(B, ms, detailMs, batch, M, world, net, R, signs, shopSpots);
    else if (B.type === 'shed') buildBlock(B, ms, batch, M, world, R, { h: 2.6, wall: M.brick, col: '#b9a597', roofCol: '#4a4d52', windows: false });
    else if (B.type !== 'skip') buildBig(B, ms, batch, M, world, R, net, pending);
    if (ms.m.size > 40) ms.flush(batch);
    if (detailMs.m.size > 40) detailMs.flush(batch, true);
  }
  ms.flush(batch); detailMs.flush(batch, true);
  finishHospital(batch, M, world, pending);
  // ---- pass 4: back yards behind the terraces (now every building has its colliders) ----
  const RY = rng(77);
  for (const B of list) if (B.type === 'res' && !B.modern && B.plots) backYards(B, batch, M, world, net, RY);
  const residential = list.filter((b) => b.type === 'res');
  return { shopSpots, miniMart: shopSpots.find((s) => s.miniMart), residential, list };
}

// ------------------------------------------------------------------ houses
function buildResidential(B, ms, dms, batch, M, world, net, R, signs, shopSpots) {
  const F = B.F, { dMax, Dm, dR, rise } = B, dOut = dMax - Dm;
  const n2 = [F.nx, F.nz], back = [-F.nx, -F.nz];
  const eaveH = B.storeys * FLOOR + 0.45;
  const renderRow = !B.modern && R() < 0.1;
  let maxTop = -Infinity, minG = Infinity;
  B.plots.forEach((pl, idx) => {
    const { piece, gF } = pl;
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
      f.box(wallMat, 0, 0.8, 0, 0.8, 1.9, 1.3, { tile: wtile, color: tint });
      f.box(M.stone, 0, 1.8, 0, 0.9, 0.12, 1.4, { color: '#b8ae9c', detail: true });
      for (const dz of [-0.35, 0.05, 0.4]) if (R() < 0.75) f.box(M.clay, 0, 2.05, dz, 0.2, 0.4, 0.2, { color: '#b35a3a', detail: true });
      if (R() < 0.2) { f.box(M.metal, 0, 2.6, 0, 0.03, 1.4, 0.03, { detail: true }); f.box(M.metal, 0, 3.1, 0, 0.7, 0.03, 0.03, { detail: true }); }
    }
    // --- the front ---
    if (pl.hasFront) facade(batch, M, F, pl, B, R, eave, wallMat, tint, net, signs, shopSpots);
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
    const hit = world.raycastBoxes(bx, g + 1, bz, -F.nx, 0, -F.nz, 26);
    const rr = net.nearest(bx - F.nx * 4, bz - F.nz * 4, null, (q) => q.kind !== 'f');
    let room = hit.dist;
    if (rr) { const edge = Math.hypot(bx - rr.px, bz - rr.pz) - rr.road.half - rr.road.pave; if (edge < room) room = Math.max(0, edge) * 2 + 2.2; } // a street right behind: yard up to its pavement
    const depth = room >= 24 ? 6 : Math.max(0, Math.min(7, (room - 2.2) / 2));
    if (depth < 2) continue;
    const dEnd = dBack - depth, W = pl.a1 - pl.a0, wh = 1.75, col = B.tint;
    const f = new Frame(batch, ...F.toW(am, dEnd), Math.atan2(-F.nx, -F.nz), G(...F.toW(am, dEnd)));
    // rear wall with a gate (local +Z = away from the house, X runs along the row, mirrored)
    const gx = (R() < 0.5 ? -1 : 1) * (W / 2 - 0.9), gw = 0.95;
    const segs = [[-W / 2, gx - gw / 2], [gx + gw / 2, W / 2]];
    for (const [a, b] of segs) if (b - a > 0.1) {
      f.box(M.brick, -(a + b) / 2, wh / 2 - 0.3, 0, b - a, wh + 0.6, 0.22, { tile: 1.3, color: col, detail: true });
      f.box(M.stone, -(a + b) / 2, wh + 0.03, 0, b - a + 0.02, 0.08, 0.3, { color: '#b9ae9a', detail: true });
    }
    f.box(M.wood, -gx, wh * 0.45, -0.02, gw, wh * 0.9, 0.06, { color: ['#3d5a3a', '#5a3b2a', '#2f3e5c', '#6b6b6b'][(R() * 4) | 0], detail: true });
    const [wx, wz] = f.world(0, 0); world.addOBB(wx, wz, W / 2, 0.12, Math.atan2(-F.nx, -F.nz), f.y0 - 1, f.y0 + wh, 'wall');
    // party wall down the side of the yard (one per plot, on its a0 edge; the row end gets both)
    const sides = pl.k === B.nPlots - 1 ? [pl.a0, pl.a1] : [pl.a0];
    for (const a of sides) {
      const [sx, sz] = F.toW(a, dBack - depth / 2), sg = G(sx, sz), ry = Math.atan2(F.nx, F.nz);
      batch.box(M.brick, sx, sg + wh / 2 - 0.3, sz, 0.22, wh + 0.6, depth, { tile: 1.3, color: col, ry, detail: true });
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
function facade(batch, M, F, pl, B, R, eave, wallMat, tint, net, signs, shopSpots) {
  const W = pl.a1 - pl.a0, am = (pl.a0 + pl.a1) / 2, [fx, fz] = F.toW(am, B.dMax);
  const f = new Frame(batch, fx, fz, Math.atan2(F.nx, F.nz), pl.gF);
  const m = pl.mirror ? -1 : 1, v = (R() * 4) | 0, D = 0;
  const eH = eave - pl.gF;
  const win = (lx, ly, w, h, vv) => {
    f.geo(M.win, atlasQuad(w, h, vv * 0.25 + 0.004, 0, vv * 0.25 + 0.246, 1), lx, ly, D + 0.025);
    f.box(M.stone, lx, ly + h / 2 + 0.1, D + 0.05, w + 0.3, 0.2, 0.12, { tile: 1, color: '#d6cbb5', detail: true });
    f.box(M.stone, lx, ly - h / 2 - 0.06, D + 0.08, w + 0.24, 0.1, 0.2, { tile: 1, color: '#d6cbb5', detail: true });
  };
  // gutter + downpipe
  f.box(M.darkMetal, 0, eH - 0.05, D + 0.12, W, 0.12, 0.14, { color: '#1c1c1c', detail: true });
  if (pl.k % 2) f.box(M.darkMetal, W / 2 - 0.08, eH / 2, D + 0.06, 0.08, eH, 0.08, { color: '#1c1c1c', detail: true });
  // plinth
  f.box(M.stone, 0, 0.1, D + 0.02, W, 0.5, 0.06, { tile: 1, color: '#cfc3ad', detail: true });
  const upper = (y) => { if (y + 0.7 > eH) return; win(W > 4.4 ? 0.95 * m : 0, y, 1.2, 1.35, (v + 1) % 4); if (W > 4.6) win(-(W / 2 - 1.0) * m, y, 0.8, 1.3, (v + 2) % 4); };
  if (!pl.shop) {
    const dx = -(W / 2 - 0.85) * m;
    f.box(M.door, dx, 1.2, D + 0.01, 0.95, 2.1, 0.1, { color: DOORS[(R() * DOORS.length) | 0] });
    f.geo(M.win, atlasQuad(0.95, 0.35, 0.26, 0.05, 0.49, 0.3), dx, 2.48, D + 0.03);
    f.box(M.stone, dx, 2.78, D + 0.04, 1.3, 0.22, 0.14, { color: '#d6cbb5', detail: true });
    f.box(M.stone, dx, 0.1, D + 0.28, 1.2, 0.22, 0.5, { tile: 1, color: '#bfb6a4' });
    const bx = W > 4.2 ? 0.95 * m : 0.4 * m;
    if (!B.modern && W > 4.2 && R() < 0.5) {
      const bw = 1.5, proj = 0.65;
      f.box(M.stone, bx, 0.45, D + proj / 2, bw + 0.9, 0.9, proj, { tile: 1, color: '#cdc2ad' });
      f.geo(M.win, atlasQuad(bw, 1.5, v * 0.25 + 0.004, 0, v * 0.25 + 0.246, 1), bx, 1.65, D + proj + 0.01);
      for (const sd of [-1, 1]) f.geo(M.win, atlasQuad(0.65, 1.5, v * 0.25 + 0.05, 0, v * 0.25 + 0.2, 1), bx + sd * (bw / 2 + 0.2), 1.65, D + proj / 2, { ry: sd * 0.78 });
      f.box(M.stone, bx, 2.5, D + proj / 2, bw + 0.95, 0.18, proj + 0.1, { color: '#d6cbb5' });
      f.box(M.slate, bx, 2.66, D + proj / 2 - 0.05, bw + 0.9, 0.14, proj, { color: '#6e737a', rx: -0.3 });
    } else win(bx, 1.6, B.modern ? 1.8 : 1.4, 1.5, v);
    upper(1.6 + FLOOR); if (B.storeys >= 3) upper(1.6 + FLOOR * 2);
    if (R() < 0.25) f.geo(M.dish, new THREE.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, 0.9), -W / 2 + 0.7, eH - 0.9, D + 0.25, { rx: Math.PI / 2 - 0.3, color: '#cfd2d4', detail: true });
    // front garden wall (where there's a garden between the house and the pavement)
    const r = net.nearestStreet(fx + F.nx * 2, fz + F.nz * 2);
    if (r) {
      const gd = r.dist - 2 - r.road.half - r.road.pave;         // front of the house to the back of the pavement
      const toFront = Math.hypot(fx - r.px, fz - r.pz) - r.road.half - r.road.pave;
      if (toFront > 1.1 && toFront < 9) {
        const z = toFront - 0.15;
        for (const [a, b] of [[-W / 2, dx - 0.6], [dx + 0.6, W / 2]].map(([a, b]) => [Math.min(a, b), Math.max(a, b)])) {
          if (b - a < 0.2) continue;
          const gy = G(...F.toW(am + (a + b) / 2, B.dMax + z)) - pl.gF;
          if (B.modern && pl.k % 3 !== 2) {
            if (pl.k % 3 === 0) f.box(M.hedge, (a + b) / 2, gy + 0.55, z, b - a, 1.1, 0.7, { color: '#3f6b35', detail: true });       // privet hedge
            else { for (let x = a + 0.1; x < b; x += 1.8) f.box(M.wood, x, gy + 0.45, z, 0.08, 0.9, 0.08, { color: '#6b5a44', detail: true }); f.box(M.wood, (a + b) / 2, gy + 0.6, z, b - a, 0.5, 0.03, { color: '#7a6850', detail: true }); } // low fence
            continue;
          }
          f.box(M.brick, (a + b) / 2, gy + 0.4, z, b - a, 0.8 + 0.6, 0.24, { tile: 1.3, color: tint, detail: true });
          f.box(M.stone, (a + b) / 2, gy + 0.85, z, b - a + 0.02, 0.1, 0.3, { color: '#c8bca6', detail: true });
        }
        if (R() < 0.5) { const bc = ['#2a2a2a', '#2d4f8c', '#6b4a2b', '#2f6b36'][(R() * 4) | 0]; f.box(M.plastic, 1.6 * m, 0.55, Math.min(z - 0.5, 1.2), 0.6, 1.05, 0.7, { color: bc, detail: true }); }
        if (R() < 0.2) f.box(M.hedge, 1.2 * m, 0.7, z - 0.3, 1.6, 1.2, 0.5, { color: '#3f6b35', detail: true });
      }
      void gd;
    }
  } else {
    // ---- shopfront: frame, display, door, stall riser, fascia sign, shutter box ----
    const S = pl.shop, cell = signs.cell(S.cell);
    f.box(M.darkMetal, 0, 1.6, D + 0.05, W - 0.3, 3.2, 0.12, { color: '#2a2a2a' });
    f.geo(M.display, atlasQuad(W - 1.8, 2.2, (S.cell % 4) * 0.25, 0, (S.cell % 4) * 0.25 + 0.25, 1), 0.55, 1.6, D + 0.13);
    f.box(M.glass, -W / 2 + 0.75, 1.25, D + 0.1, 0.95, 2.3, 0.06, { color: '#ffffff' });
    f.box(M.stone, 0, 0.25, D + 0.12, W - 0.3, 0.4, 0.14, { color: '#3a3a3a' });
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
    upper(4.9 - (eH < 6.3 ? 0.4 : 0)); if (B.storeys >= 3) upper(4.9 + FLOOR);
    shopSpots.push({ x: fx, z: fz, ry: Math.atan2(F.nx, F.nz), front: F.toW(am, B.dMax + 1.8), cat: S.cat, sign: S.cell, miniMart: !!S.miniMart, gF: pl.gF });
  }
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
    if (courses && L > 1) for (let fl = 1; fl <= nf; fl++) { const y = base + fl * floorH - 0.25; if (y > top - 0.2) break; bandQuad(ms, M.stone, courses, a, b, y, y + 0.22, n, 0.05, 1); }
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
      batch.box(M.stone, (a[0] + b[0]) / 2, top + 0.2, (a[1] + b[1]) / 2, 0.3, 0.4, L + 0.25, { color: '#b8b2a6', ry: Math.atan2(b[0] - a[0], b[1] - a[1]), detail: true });
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
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.box(M.stone, x * T / 2, H / 2, z * T / 2, 0.5, H, 0.5, { color: '#d8ccb4', tile: 1 });
      f.box(M.stone, 0, H + 0.2, 0, T + 0.5, 0.4, T + 0.5, { color: '#d8ccb4' });
      const face = clockTexture();
      for (const [dx, dz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
        f.geo(face, new THREE.CircleGeometry(1.35, 24), dx * (T / 2 + 0.03), H - 2.4, dz * (T / 2 + 0.03), { ry, color: '#ffffff' });
        f.box(M.stone, dx * (T / 2 + 0.02), H - 2.4, dz * (T / 2 + 0.02), dx ? 0.1 : 3.1, 3.1, dz ? 0.1 : 3.1, { color: '#d8ccb4' });
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
