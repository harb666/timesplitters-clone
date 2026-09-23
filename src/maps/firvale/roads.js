// Road network built from the real Fir Vale street centre-lines (open map
// data, see scripts/import-map). Turns them into carriageways, pavements,
// kerbs, footpaths and markings that follow the terrain, answers "what road
// am I near?" for traffic, footsteps, bullets and building layout, and
// keeps the junction graph the traffic drives around.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { CHUNK } from '../../models/builders.js';

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
        const keep = (x, z) => !this.onCarriageway(x, z, r, 0.3);
        this.ribbon(batch, M.pave, r, inner, outer, 0.15, 1.8, r.kind === 'r' ? '#8e8e8e' : '#ffffff', keep, r.kind === 'r' ? M.road : null);
        this.kerb(batch, M.kerb, r, side, keep);
      }
      if (r.kind !== 's') this.markings(batch, M.line, r);
    });
  }

  // Strip between lateral offsets o0..o1 following the road and terrain,
  // split per map chunk so distance culling works on long roads.
  ribbon(batch, mat, r, o0, o1, lift, tile, color, keep, altMat = null) {
    const S = r.samples, parts = new Map();
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      const mo = (o0 + o1) / 2, mx = (a.x + b.x) / 2 + (a.tz + b.tz) / 2 * mo, mz = (a.z + b.z) / 2 - (a.tx + b.tx) / 2 * mo;
      if (keep && !keep(mx, mz)) continue;
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
      if (keep && !keep(x, z)) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.05;
      batch.box(mat, x, G(x, z) + 0.06, z, 0.22, 0.3, len, { color: '#c9c4b8', tile: 1, ry: Math.atan2(a.tx, a.tz) });
    }
  }

  markings(batch, mat, r) {
    const put = (s0, s1, off, w, color, lift = 0.045) => {
      const A = this.pointAt(r, s0, off, {}), B = this.pointAt(r, s1, off, {});
      if (this.onCarriageway((A.x + B.x) / 2, (A.z + B.z) / 2, r, -0.2)) return; // not across junctions
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, len = Math.hypot(B.x - A.x, B.z - A.z);
      batch.add(mat, flat(w, len), { x: mx, y: G(mx, mz) + lift + RANK[r.kind] * 0.012 + 0.01, z: mz, color, ry: Math.atan2(A.tx, A.tz) });
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
      for (let o = -r.half + 0.6; o < 0; o += 1.2) {
        const A = this.pointAt(r, back + (end ? -n.road.half : n.road.half) * 0.0, o + 0.3, {});
        batch.add(mat, flat(0.6, 0.2), { x: A.x, y: G(A.x, A.z) + 0.055 + RANK[r.kind] * 0.012, z: A.z, color: '#f1f0e8', ry: Math.atan2(A.tx, A.tz) });
      }
    }
  }
}
