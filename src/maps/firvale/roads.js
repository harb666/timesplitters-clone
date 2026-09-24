// Road network built from the real Fir Vale street centre-lines (open map
// data, see scripts/import-map). Turns them into carriageways, pavements,
// kerbs, footpaths and markings that follow the terrain, answers "what road
// am I near?" for traffic, footsteps, bullets and building layout, and
// keeps the junction graph the traffic drives around.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { CHUNK } from '../../models/builders.js';
import { triangulate } from './geom.js';

// Street classes: carriageway width, pavement width, rendering kind.
// kind: a = A-road, b = B/C road, r = residential, s = service lane/back
// alley, f = footpath/steps.
const CLS = {
  primary: { kind: 'a', w: 10, pave: 3 }, trunk: { kind: 'a', w: 10.5, pave: 3 }, secondary: { kind: 'a', w: 9.2, pave: 2.8 },
  tertiary: { kind: 'b', w: 8, pave: 2.4 }, residential: { kind: 'r', w: 6.4, pave: 1.9 }, unclassified: { kind: 'r', w: 6, pave: 1.7 },
  living_street: { kind: 'r', w: 5.5, pave: 1.4 }, service: { kind: 's', w: 3.8, pave: 0 }, unknown: { kind: 's', w: 4, pave: 0 },
  track: { kind: 's', w: 3, pave: 0 }, footway: { kind: 'f', w: 1.8, pave: 0 }, path: { kind: 'f', w: 1.6, pave: 0 },
  cycleway: { kind: 'f', w: 2, pave: 0 }, steps: { kind: 'f', w: 2, pave: 0 }, pedestrian: { kind: 'f', w: 3.5, pave: 0 },
};
const RANK = { f: 0, s: 1, r: 2, b: 3, a: 4 };
export { RANK };
export const DRIVABLE = new Set(['a', 'b', 'r']);

// flat 2-triangle strip (w across, l along +Z), facing up
export function flat(w, l) { return new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2); }

// Centripetal Catmull-Rom resample of a polyline every `step` metres.
function resample(pts, step) {
  const P = [];
  for (const [x, z] of pts) { const l = P[P.length - 1]; if (!l || Math.hypot(l.x - x, l.z - z) > 0.3) P.push(new THREE.Vector3(x, 0, z)); }
  if (P.length < 2) P.push(P[0].clone().add(new THREE.Vector3(0.5, 0, 0)));
  if (P.length === 2) { const m = P[0].clone().lerp(P[1], 0.5); P.splice(1, 0, m); }
  const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal', 0.5);
  const len = curve.getLength(), n = Math.max(2, Math.ceil(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    out.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, s: u * len });
  }
  return { samples: out, length: len };
}

export class RoadNetwork {
  constructor(ways) {
    this.roads = ways.map((w, i) => {
      const c = CLS[w.c] || CLS.unknown;
      const pts = []; for (let k = 0; k < w.p.length; k += 2) pts.push([w.p[k], w.p[k + 1]]);
      let half = c.w / 2, pave = c.pave;
      // fit carriageway + pavements between the real house fronts
      if (w.fw && c.kind !== 'f') {
        const room = w.fw - 0.15;
        if (room < half + pave) { pave = Math.max(c.pave ? 1.2 : 0, Math.min(pave, room - half)); if (room < half + pave) half = Math.max(c.kind === 's' ? 1.6 : 2.5, room - pave); }
      }
      const { samples, length } = resample(pts, c.kind === 'f' ? 2 : 3);
      return { id: i, name: w.n || '', cls: w.c, kind: c.kind, width: half * 2, half, pave, samples, length, a: w.a, b: w.b, bridge: !!w.br };
    });
    // name#k lookup
    const counts = {};
    for (const r of this.roads) { const k = r.name || 'unnamed'; counts[k] = (counts[k] ?? -1) + 1; r.key = `${k}#${counts[k]}`; }
    // junction graph for traffic (drivable roads only)
    this.nodes = new Map();
    for (const r of this.roads) if (DRIVABLE.has(r.kind)) for (const end of ['a', 'b']) {
      if (r[end] === undefined) continue;
      let n = this.nodes.get(r[end]); if (!n) { n = { id: r[end], roads: [] }; this.nodes.set(r[end], n); }
      n.roads.push({ road: r, end });
    }
    // segment grid for nearest-road queries
    this.CELL = 20; this.grid = new Map();
    for (const r of this.roads) {
      for (let i = 0; i < r.samples.length - 1; i++) {
        const a = r.samples[i], b = r.samples[i + 1];
        const seg = { r, a, b, i };
        const pad = r.half + r.pave + 2;
        const x0 = Math.floor((Math.min(a.x, b.x) - pad) / this.CELL), x1 = Math.floor((Math.max(a.x, b.x) + pad) / this.CELL);
        const z0 = Math.floor((Math.min(a.z, b.z) - pad) / this.CELL), z1 = Math.floor((Math.max(a.z, b.z) + pad) / this.CELL);
        for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
          const k = ix * 92821 + iz; let c = this.grid.get(k); if (!c) { c = []; this.grid.set(k, c); } c.push(seg);
        }
      }
    }
  }

  byKey(key) { return this.roads.find((r) => r.key === key); }
  byName(name, i = 0) { return this.roads.filter((r) => r.name === name)[i]; }
  allNamed(name) { return this.roads.filter((r) => r.name === name); }
  // longest piece of a named street
  longest(name) { return this.allNamed(name).sort((a, b) => b.length - a.length)[0]; }

  // Nearest road centre-line: {road, dist, s, side, px, pz, tx, tz}.
  // `filter(road)` limits which roads count (default: everything).
  nearest(x, z, ignore = null, filter = null) {
    const c = this.grid.get(Math.floor(x / this.CELL) * 92821 + Math.floor(z / this.CELL));
    let best = null, bd = Infinity;
    if (!c) return null;
    for (const seg of c) {
      if (seg.r === ignore || (filter && !filter(seg.r))) continue;
      const { a, b } = seg;
      const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / L2; t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t, pz = a.z + vz * t, d = Math.hypot(x - px, z - pz);
      const score = d - seg.r.half - RANK[seg.r.kind] * 0.01;
      if (score < bd) {
        bd = score;
        const L = Math.sqrt(L2);
        best = { road: seg.r, dist: d, s: a.s + (b.s - a.s) * t, px, pz, tx: vx / L, tz: vz / L, side: Math.sign(vx * (z - a.z) - vz * (x - a.x)) || 1 };
      }
    }
    return best;
  }
  nearestStreet(x, z) { return this.nearest(x, z, null, (r) => DRIVABLE.has(r.kind)); }

  // Is (x,z) on a carriageway (not footpaths/pavements) of some road other than `except`?
  onCarriageway(x, z, except = null, margin = 0) {
    const n = this.nearest(x, z, except, (r) => r.kind !== 'f');
    return !!n && n.dist < n.road.half + margin;
  }
  // Is (x,z) on any road, pavement or path?
  onRoadOrPavement(x, z, margin = 0) {
    const n = this.nearest(x, z);
    return !!n && n.dist < n.road.half + n.road.pave + margin;
  }

  surfaceAt(x, z) {
    const n = this.nearest(x, z);
    if (n) {
      if (n.dist < n.road.half) return n.road.kind === 'f' ? 'paving' : 'asphalt';
      if (n.dist < n.road.half + n.road.pave) return n.road.kind === 'r' ? 'asphalt' : 'paving'; // Sheffield back streets have tarmac pavements
    }
    return null;
  }

  // Point along a road at distance s, offset sideways by `off` (+ = left of travel).
  pointAt(road, s, off = 0, out = {}) {
    const S = road.samples; s = Math.max(0, Math.min(road.length, s));
    let i = Math.min(S.length - 2, Math.floor(s / road.length * (S.length - 1)));
    while (i > 0 && S[i].s > s) i--; while (i < S.length - 2 && S[i + 1].s < s) i++;
    const a = S[i], b = S[i + 1], k = (s - a.s) / Math.max(1e-6, b.s - a.s);
    const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
    let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    out.x = x + tz * off; out.z = z - tx * off; out.tx = tx; out.tz = tz;
    return out;
  }

  // Shortest route along the drivable streets between two points: a
  // polyline of [x, z] (Dijkstra over the junction graph).
  route(ax, az, bx, bz) {
    const nodePos = (id) => { const e = this.nodes.get(id).roads[0], S = e.road.samples, p = e.end === 'a' ? S[0] : S[S.length - 1]; return [p.x, p.z]; };
    const closest = (x, z) => { let best = null, bd = Infinity; for (const id of this.nodes.keys()) { const [nx, nz] = nodePos(id), d = (nx - x) ** 2 + (nz - z) ** 2; if (d < bd) { bd = d; best = id; } } return best; };
    const A = closest(ax, az), B = closest(bx, bz);
    const dist = new Map([[A, 0]]), prev = new Map(), done = new Set();
    const open = [A];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
      const u = open.splice(bi, 1)[0]; if (done.has(u)) continue; done.add(u);
      if (u === B) break;
      for (const e of this.nodes.get(u).roads) {
        const r = e.road, v = e.end === 'a' ? r.b : r.a; if (v === undefined || !this.nodes.has(v)) continue;
        const nd = dist.get(u) + r.length * (r.kind === 'a' ? 0.9 : 1);
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, { u, r, fwd: e.end === 'a' }); open.push(v); }
      }
    }
    const out = [];
    if (!prev.has(B) && A !== B) return [[ax, az], [bx, bz]];
    const legs = []; for (let v = B; v !== A; v = prev.get(v).u) legs.push(prev.get(v));
    legs.reverse();
    out.push([ax, az]);
    for (const { r, fwd } of legs) { const S = fwd ? r.samples : [...r.samples].reverse(); for (const p of S) out.push([p.x, p.z]); }
    out.push([bx, bz]);
    return out;
  }

  // ------------------------------------------------------------ geometry
  build(batch, M) {
    const corners = this.corners(), cut = corners.cut;
    const roads = [...this.roads].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    roads.forEach((r, rank) => {
      const lift = 0.02 + RANK[r.kind] * 0.012 + (rank % 7) * 0.0015; // higher roads draw over lower ones at junctions
      if (r.kind === 'f') {
        const keep = (x, z) => !this.onRoadOrPavement(x, z, -0.2) || this.nearest(x, z)?.road === r;
        this.ribbon(batch, r.cls === 'steps' ? M.kerb : M.pave, r, -r.half, r.half, 0.04, 1.6, r.cls === 'steps' ? '#b9b2a4' : '#9c9a94', keep);
        return;
      }
      this.ribbon(batch, M.road, r, -r.half, r.half, lift, 4, r.kind === 's' ? '#d8d4ce' : '#ffffff', null);
      if (r.pave > 0) for (const side of [1, -1]) {
        const inner = side > 0 ? r.half : -r.half - r.pave, outer = side > 0 ? r.half + r.pave : -r.half;
        const ca = cut.get(r.id + ':a:' + side) || 0, cb = cut.get(r.id + ':b:' + side) || 0;
        // (trimmed back where a rounded corner takes over at a junction)
        const keep = (x, z, sm) => !this.onCarriageway(x, z, r, 0.3) && !(sm !== undefined && (sm < ca || sm > r.length - cb));
        this.ribbon(batch, M.pave, r, inner, outer, 0.15, 1.8, '#ffffff', keep, r.kind === 'r' ? (M.paveTar || M.road) : null);
        this.kerb(batch, M.kerb, r, side, keep);
      }
      if (r.kind !== 's') this.markings(batch, M.line, r);
      this.furniture(batch, M, r);
    });
    this.buildCorners(batch, M, corners.list);
  }

  // Rounded kerbs at junction corners: for each pair of neighbouring streets
  // at a junction, a kerb radius (≈4 m on side streets, 6 m on main roads)
  // tangent to both kerb lines; the pavement follows the curve and the road
  // surface fills the corner it cuts off.
  corners() {
    const cut = new Map(), list = [];
    const X = (p, d, q, e) => { const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-6) return null; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return [p[0] + d[0] * t, p[1] + d[1] * t]; };
    for (const node of this.nodes.values()) {
      const legs = [];
      for (const e of node.roads) {
        const r = e.road; if (!DRIVABLE.has(r.kind) || r.length < 10) continue;
        const S = r.samples, P0 = e.end === 'a' ? S[0] : S[S.length - 1], q = this.pointAt(r, e.end === 'a' ? Math.min(6, r.length / 2) : Math.max(r.length - 6, r.length / 2), 0, {});
        let ox = q.x - P0.x, oz = q.z - P0.z; const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L;
        legs.push({ r, end: e.end, P: [P0.x, P0.z], o: [ox, oz], ang: Math.atan2(oz, ox) });
      }
      if (legs.length < 2) continue;
      legs.sort((a, b) => a.ang - b.ang);
      for (let i = 0; i < legs.length; i++) {
        const A = legs[i], B = legs[(i + 1) % legs.length];
        if (legs.length === 2 && i === 1) break;
        let th = B.ang - A.ang; if (th <= 0) th += Math.PI * 2;
        if (th < 0.6 || th > 2.6) continue;                                   // straight on, or too sharp
        const pA = A.r.pave, pB = B.r.pave; if (pA <= 0.5 || pB <= 0.5) continue;
        const nA = [-A.o[1], A.o[0]], nB = [B.o[1], -B.o[0]];                  // normals into the corner
        const sideA = A.end === 'a' ? -1 : 1, sideB = B.end === 'a' ? 1 : -1;
        const hA = A.r.half, hB = B.r.half, sn = Math.sin(th / 2);
        const p = Math.min(pA, pB);
        let R = A.r.kind === 'r' && B.r.kind === 'r' ? 4 : 6; R = Math.min(R, 0.85 * p / Math.max(0.05, 1 - sn));
        if (R < 1.2) continue;
        const off = (P, n, d) => [P[0] + n[0] * d, P[1] + n[1] * d];
        const O = X(off(A.P, nA, hA + R), A.o, off(B.P, nB, hB + R), B.o); if (!O) continue;
        const Ta = off(O, nA, -R), Tb = off(O, nB, -R);
        const tA = (Ta[0] - A.P[0]) * A.o[0] + (Ta[1] - A.P[1]) * A.o[1], tB = (Tb[0] - B.P[0]) * B.o[0] + (Tb[1] - B.P[1]) * B.o[1];
        if (tA < 0.3 || tB < 0.3 || tA > A.r.length * 0.45 || tB > B.r.length * 0.45) continue;
        const C = X(off(A.P, nA, hA), A.o, off(B.P, nB, hB), B.o), Co = X(off(A.P, nA, hA + pA), A.o, off(B.P, nB, hB + pB), B.o);
        if (!C || !Co || Math.hypot(Co[0] - O[0], Co[1] - O[1]) > R - 0.1) continue;
        const kA = A.r.id + ':' + A.end + ':' + sideA, kB = B.r.id + ':' + B.end + ':' + sideB;
        cut.set(kA, Math.max(cut.get(kA) || 0, tA)); cut.set(kB, Math.max(cut.get(kB) || 0, tB));
        // arc from Ta to Tb round O (the short way)
        let a0 = Math.atan2(Ta[1] - O[1], Ta[0] - O[0]), a1 = Math.atan2(Tb[1] - O[1], Tb[0] - O[0]), da = a1 - a0;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const arc = []; const n = Math.max(4, Math.ceil(Math.abs(da) * R / 0.6));
        for (let k = 0; k <= n; k++) { const a = a0 + da * k / n; arc.push([O[0] + Math.cos(a) * R, O[1] + Math.sin(a) * R]); }
        list.push({ A, B, arc, C, Co, TaO: off(Ta, nA, pA), TbO: off(Tb, nB, pB), lift: 0.02 + Math.max(RANK[A.r.kind], RANK[B.r.kind]) * 0.012 + 0.009, tar: A.r.kind === 'r' && B.r.kind === 'r' });
      }
    }
    return { cut, list };
  }

  buildCorners(batch, M, list) {
    const fill = (mat, P, lift, tile, color) => {
      const T = triangulate(P); if (!T.length) return;
      const pos = [], uv = [], idx = [];
      for (const [x, z] of P) { pos.push(x, G(x, z) + lift, z); uv.push(x / tile, z / tile); }
      for (const [a, b, c] of T) {
        const A = P[a], B = P[b], C = P[c], up = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);
        up >= 0 ? idx.push(a, b, c) : idx.push(a, c, b);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      batch.add(mat, g, { color });
    };
    for (const c of list) {
      // pavement: between the curved kerb and the outer edges
      fill(c.tar ? (M.paveTar || M.road) : M.pave, [...c.arc, c.TbO, c.Co, c.TaO], 0.15, 1.8, '#ffffff');
      // road surface in the corner the curve cuts off
      fill(M.road, [c.C, ...[...c.arc].reverse()], c.lift, 4, '#ffffff');
      // curved kerb
      for (let k = 0; k + 1 < c.arc.length; k++) {
        const [ax, az] = c.arc[k], [bx, bz] = c.arc[k + 1], ga = G(ax, az), gb = G(bx, bz);
        batch.sloped(M.kerb, ax, az, bx, bz, 0.22, ga - 0.09, gb - 0.09, ga + 0.21, gb + 0.21, { color: '#b9b7b1', tile: 1 });
      }
    }
  }

  // Road-surface detail: gully grates along the kerbs, manhole covers,
  // patched tarmac (all flat, drawn only up close).
  furniture(batch, M, r) {
    if (r.kind === 'f' || r.length < 12) return;
    let seed = r.id * 9301 + 49297; const R = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const lift = 0.02 + RANK[r.kind] * 0.012 + 0.012;
    const put = (mat, s, off, w, l, color) => {
      const p = this.pointAt(r, s, off, {});
      if (this.onCarriageway(p.x, p.z, r, -0.3)) return;
      this.decal(batch, mat, r, s - l / 2, s + l / 2, off, w, lift, color, true);
    };
    if (r.pave > 0) for (let s = 8 + R() * 10; s < r.length - 4; s += 22 + R() * 14) for (const side of [1, -1]) put(M.metal, s + side * 3, side * (r.half - 0.28), 0.42, 0.6, '#2b2d30');
    for (let s = 20 + R() * 30; s < r.length - 5; s += 45 + R() * 50) {
      const off = (R() - 0.5) * r.half; if (R() < 0.6) put(M.metal, s, off, 0.7, 0.7, '#3a3c3f'); else put(M.metal, s, off, 0.6, 0.9, '#3a3c3f');
    }
    for (let s = 15 + R() * 40; s < r.length - 5; s += 35 + R() * 70) { const w = 1 + R() * 2.2, l = 1.2 + R() * 4; put(M.road, s, (R() - 0.5) * (r.half * 2 - w), w, l, R() < 0.5 ? '#6f6f6f' : '#9a9a9a'); }
  }

  // Strip between lateral offsets o0..o1 following the road and terrain,
  // split per map chunk so distance culling works on long roads.
  ribbon(batch, mat, r, o0, o1, lift, tile, color, keep, altMat = null) {
    const S = r.samples, parts = new Map();
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      const mo = (o0 + o1) / 2, mx = (a.x + b.x) / 2 + (a.tz + b.tz) / 2 * mo, mz = (a.z + b.z) / 2 - (a.tx + b.tx) / 2 * mo;
      if (keep && !keep(mx, mz, (a.s + b.s) / 2)) continue;
      const ck = Math.floor(mx / CHUNK) + ',' + Math.floor(mz / CHUNK);
      let P = parts.get(ck); if (!P) { P = { pos: [], uv: [], idx: [], vi: 0 }; parts.set(ck, P); }
      for (const [p, o] of [[a, o0], [a, o1], [b, o0], [b, o1]]) {
        const x = p.x + p.tz * o, z = p.z - p.tx * o;
        P.pos.push(x, G(x, z) + lift, z); P.uv.push(o / tile, p.s / tile);
      }
      const v = P.vi; P.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); P.vi += 4;
    }
    for (const P of parts.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
      g.setIndex(P.idx); g.computeVertexNormals();
      const nArr = g.attributes.normal.array; if (nArr[1] < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
      batch.add(altMat || mat, g, { color });
    }
  }

  kerb(batch, mat, r, side, keep) {
    const S = r.samples, o = side * r.half;
    for (let i = 0; i < S.length - 1; i += 1) {
      const a = S[i], b = S[i + 1];
      const x = (a.x + b.x) / 2 + a.tz * o, z = (a.z + b.z) / 2 - a.tx * o;
      if (keep && !keep(x, z, (a.s + b.s) / 2)) continue;
      const ax = a.x + a.tz * o, az = a.z - a.tx * o, bx = b.x + b.tz * o, bz = b.z - b.tx * o, ga = G(ax, az), gb = G(bx, bz);
      batch.sloped(mat, ax, az, bx, bz, 0.22, ga - 0.09, gb - 0.09, ga + 0.21, gb + 0.21, { color: '#b9b7b1', tile: 1 });
    }
  }

  // Height of the carriageway surface itself (exactly as the road ribbon
  // triangulates it) at distance s along the road, `off` metres to the left.
  surfY(r, s, off) {
    const S = r.samples; s = Math.max(0, Math.min(r.length, s));
    let i = Math.min(S.length - 2, Math.floor(s / r.length * (S.length - 1)));
    while (i > 0 && S[i].s > s) i--; while (i < S.length - 2 && S[i + 1].s < s) i++;
    const a = S[i], b = S[i + 1], k = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s)));
    const h = (p, o) => G(p.x + p.tz * o, p.z - p.tx * o);
    const aL = h(a, -r.half), aR = h(a, r.half), bL = h(b, -r.half), bR = h(b, r.half);
    const u = Math.max(0, Math.min(1, (off + r.half) / (2 * r.half)));
    return u + k <= 1 ? aL + u * (aR - aL) + k * (bL - aL) : bR + (1 - u) * (bL - bR) + (1 - k) * (aR - bR);
  }
  // A paint mark / cover lying on the carriageway: from s0 to s1 along the
  // road at lateral offset `off`, w wide; split so it hugs the surface.
  // (off1: lateral offset at s1, for slanted marks like zig-zags)
  decal(batch, mat, r, s0, s1, off, w, lift, color, detail = false, off1 = off) {
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 1.5)), pos = [], uv = [], idx = [], P = {};
    for (let j = 0; j <= n; j++) {
      const s = s0 + (s1 - s0) * j / n, o = off + (off1 - off) * j / n;
      for (const e of [-w / 2, w / 2]) { this.pointAt(r, s, o + e, P); pos.push(P.x, this.surfY(r, s, o + e) + lift, P.z); uv.push(e > 0 ? 1 : 0, j / n); }
    }
    for (let j = 0; j < n; j++) { const v = j * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.array[1] < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
    batch.add(mat, g, { color, detail });
  }

  markings(batch, mat, r) {
    const put = (s0, s1, off, w, color, lift = 0.045) => {
      const A = this.pointAt(r, s0, off, {}), B = this.pointAt(r, s1, off, {});
      if (this.onCarriageway((A.x + B.x) / 2, (A.z + B.z) / 2, r, -0.2)) return; // not across junctions
      if (this.xings && this.xings.some(([x, z]) => (A.x - x) ** 2 + (A.z - z) ** 2 < 400)) return; // zig-zag zone of a crossing
      this.decal(batch, mat, r, s0, s1, off, w, 0.02 + RANK[r.kind] * 0.012 + 0.012, color);
    };
    // centre line: long dashes on main roads, short on wide residential streets
    if (r.kind !== 'r' || r.width >= 7) {
      const dash = r.kind === 'r' ? 2 : 4, gap = r.kind === 'r' ? 4 : 5;
      for (let s = 3; s < r.length - 3; s += dash + gap) put(s, s + dash, 0, 0.12, '#f1f0e8');
    }
    // double yellows along the main roads
    if (r.kind === 'a' || r.kind === 'b') for (const side of [1, -1]) for (let s = 0; s < r.length - 2; s += 2) {
      put(s, s + 2, side * (r.half - 0.25), 0.1, '#e6b81c'); put(s, s + 2, side * (r.half - 0.42), 0.1, '#e6b81c');
    }
    // give-way lines where a side street meets a bigger road
    for (const end of [0, 1]) {
      const p = this.pointAt(r, end ? r.length - 1 : 1, 0, {});
      const n = this.nearest(p.x, p.z, r, (o) => o.kind !== 'f' && o.kind !== 's');
      if (!n || n.dist > n.road.half + 2 || RANK[n.road.kind] < RANK[r.kind]) continue;
      const back = end ? r.length - (n.dist < n.road.half ? n.road.half - n.dist : 0) - 1.5 : (n.dist < n.road.half ? n.road.half - n.dist : 0) + 1.5;
      for (let o = -r.half + 0.6; o < 0; o += 1.2) this.decal(batch, mat, r, back - 0.1, back + 0.1, o + 0.3, 0.6, 0.02 + RANK[r.kind] * 0.012 + 0.014, '#f1f0e8');
    }
  }
}
