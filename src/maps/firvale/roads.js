// Road network: turns the street centre-lines into carriageways, pavements,
// kerbs and markings that follow the terrain, and answers "what road am I
// near?" queries for traffic, footsteps, bullet impacts and building layout.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { ROADS } from './data.js';

// Centripetal Catmull-Rom resample of a polyline every `step` metres.
function resample(pts, step) {
  const P = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
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

// Fir Vale's blocks are packed with terraced back streets. Generate them:
// lines parallel to each road, set back one terrace-plus-yards, kept only
// where they're clear of other streets and special sites.
export function infillStreets(isBlocked, bounds) {
  const base = new RoadNetwork(ROADS);
  const extra = [];
  const farFromExtra = (x, z, min) => extra.every((e) => e.pts.every(([ex, ez]) => (ex - x) ** 2 + (ez - z) ** 2 > min * min));
  for (const r of base.roads) {
    for (const side of [1, -1]) for (const D of [34, 68, 102]) {
      let run = [];
      const flush = () => {
        if (run.length >= 5) { const pts = run.filter((_, i) => i % 3 === 0 || i === run.length - 1); extra.push({ name: '', kind: 'r', width: 6, pave: 1.8, pts, infill: true }); }
        run = [];
      };
      for (let s = 6; s < r.length - 6; s += 4) {
        const p = base.pointAt(r, s, side * D, {});
        const n = base.nearest(p.x, p.z);
        const ok = p.x > bounds.minX + 20 && p.x < bounds.maxX - 20 && p.z > bounds.minZ + 20 && p.z < bounds.maxZ - 20
          && (!n || n.dist > 26) && !isBlocked(p.x, p.z) && farFromExtra(p.x, p.z, 26);
        if (ok) run.push([p.x, p.z]); else flush();
      }
      flush();
    }
  }
  return extra;
}

export class RoadNetwork {
  constructor(list = ROADS) {
    this.roads = list.map((r, i) => {
      const { samples, length } = resample(r.pts, 3);
      return { ...r, id: i, samples, length, half: r.width / 2 };
    });
    // name#k lookup for routes
    const counts = {};
    for (const r of this.roads) { const k = r.name || 'unnamed'; counts[k] = (counts[k] ?? -1) + 1; r.key = `${k}#${counts[k]}`; }
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

  // Nearest road centre-line: {road, dist, s (distance along), side (+1 left/-1 right), px, pz, tx, tz}
  nearest(x, z, ignore = null) {
    const c = this.grid.get(Math.floor(x / this.CELL) * 92821 + Math.floor(z / this.CELL));
    let best = null, bd = Infinity;
    if (!c) return null;
    for (const seg of c) {
      if (seg.r === ignore) continue;
      const { a, b } = seg;
      const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / L2; t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t, pz = a.z + vz * t, d = Math.hypot(x - px, z - pz);
      // score relative to road width so a wide road's edge beats a lane's centre
      const score = d - seg.r.half;
      if (score < bd) {
        bd = score;
        const L = Math.sqrt(L2);
        best = { road: seg.r, dist: d, s: a.s + (b.s - a.s) * t, px, pz, tx: vx / L, tz: vz / L, side: Math.sign(vx * (z - a.z) - vz * (x - a.x)) || 1 };
      }
    }
    return best;
  }

  // Is (x,z) on the carriageway of some road other than `except`?
  onCarriageway(x, z, except = null, margin = 0) {
    const n = this.nearest(x, z, except);
    return !!n && n.dist < n.road.half + margin;
  }

  surfaceAt(x, z) {
    const n = this.nearest(x, z);
    if (n) {
      if (n.dist < n.road.half) return 'asphalt';
      if (n.dist < n.road.half + n.road.pave) return n.road.kind === 'r' ? 'asphalt' : 'paving'; // Sheffield back streets have tarmac pavements
    }
    return 'grass';
  }

  // Point along a road at distance s, offset sideways by `off` (+ = left of travel).
  pointAt(road, s, off = 0, out = {}) {
    const S = road.samples; s = Math.max(0, Math.min(road.length, s));
    let i = Math.min(S.length - 2, Math.floor(s / road.length * (S.length - 1)));
    while (i > 0 && S[i].s > s) i--; while (i < S.length - 2 && S[i + 1].s < s) i++;
    const a = S[i], b = S[i + 1], k = (s - a.s) / Math.max(1e-6, b.s - a.s);
    const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
    let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    // left normal (for travel along +tangent): (tz, -tx) points to the left when -Z is north? compute generically
    out.x = x + tz * off; out.z = z - tx * off; out.tx = tx; out.tz = tz;
    return out;
  }

  // ------------------------------------------------------------ geometry
  build(batch, M) {
    const roads = [...this.roads].sort((a, b) => (a.kind === 'r') - (b.kind === 'r'));
    roads.forEach((r, rank) => {
      const lift = 0.02 + rank * 0.006; // tiny per-road offset avoids flicker where roads overlap
      this.ribbon(batch, M.road, r, -r.half, r.half, lift, 4, '#ffffff', null);
      // pavements, clipped where another carriageway crosses
      for (const side of [1, -1]) {
        const inner = side > 0 ? r.half : -r.half - r.pave, outer = side > 0 ? r.half + r.pave : -r.half;
        const keep = (x, z) => !this.onCarriageway(x, z, r, 0.3);
        this.ribbon(batch, M.pave, r, inner, outer, 0.15, 1.8, r.kind === 'r' ? '#8e8e8e' : '#ffffff', keep, r.kind === 'r' ? M.road : null);
        this.kerb(batch, M.kerb, r, side, keep);
      }
      this.markings(batch, M.line, r);
    });
  }

  // Strip between lateral offsets o0..o1 following the road and terrain.
  ribbon(batch, mat, r, o0, o1, lift, tile, color, keep, altMat = null) {
    const S = r.samples, pos = [], nor = [], uv = [], idx = [];
    let vi = 0;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      if (keep) { const mo = (o0 + o1) / 2; const mx = (a.x + b.x) / 2 + (a.tz + b.tz) / 2 * mo, mz = (a.z + b.z) / 2 - (a.tx + b.tx) / 2 * mo; if (!keep(mx, mz)) continue; }
      for (const [p, o] of [[a, o0], [a, o1], [b, o0], [b, o1]]) {
        const x = p.x + p.tz * o, z = p.z - p.tx * o;
        pos.push(x, G(x, z) + lift, z); nor.push(0, 1, 0);
        uv.push(o / tile, p.s / tile);
      }
      idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3); vi += 4;
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // make winding face up
    g.computeVertexNormals();
    const nArr = g.attributes.normal.array; if (nArr[1] < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
    batch.add(altMat || mat, g, { color });
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
    const S = r.samples;
    const put = (s0, s1, off, w, color, lift = 0.045) => {
      const A = this.pointAt(r, s0, off, {}), B = this.pointAt(r, s1, off, {});
      if (this.onCarriageway((A.x + B.x) / 2, (A.z + B.z) / 2, r, -0.2)) return; // not across junctions
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, len = Math.hypot(B.x - A.x, B.z - A.z);
      batch.box(mat, mx, G(mx, mz) + lift, mz, w, 0.02, len, { color, ry: Math.atan2(A.tx, A.tz) });
    };
    // centre line: long dashes on A/B roads, short on residential
    if (r.kind !== 'r' || r.width >= 7) {
      const dash = r.kind === 'r' ? 2 : 4, gap = r.kind === 'r' ? 4 : 5;
      for (let s = 3; s < r.length - 3; s += dash + gap) put(s, s + dash, 0, 0.12, '#f1f0e8');
    }
    // double yellows along both kerbs on the main roads near shops/junctions
    if (r.kind !== 'r') for (const side of [1, -1]) for (let s = 0; s < r.length - 2; s += 2) {
      put(s, s + 2, side * (r.half - 0.25), 0.1, '#e6b81c'); put(s, s + 2, side * (r.half - 0.42), 0.1, '#e6b81c');
    }
    // give-way lines where this road's ends meet another road
    for (const end of [0, 1]) {
      const s = end ? r.length - 1 : 1;
      const p = this.pointAt(r, s, 0, {});
      if (!this.onCarriageway(p.x, p.z, r, 2)) continue;
      const back = end ? r.length - r.half - 2.5 : r.half + 2.5;
      for (let o = -r.half + 0.6; o < 0; o += 1.2) {
        const A = this.pointAt(r, back, o + 0.3, {});
        batch.box(mat, A.x, G(A.x, A.z) + 0.045, A.z, 0.6, 0.02, 0.2, { color: '#f1f0e8', ry: Math.atan2(A.tx, A.tz) });
      }
    }
  }
}
