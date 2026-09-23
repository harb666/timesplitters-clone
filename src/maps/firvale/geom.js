// Small 2-D polygon helpers for footprints (points are [x, z] arrays).
import * as THREE from 'three';
import { CHUNK } from '../../models/builders.js';

export function area(P) { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return a / 2; }
export function centroid(P) { let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; }
export function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}
export function flatToPts(f) { const P = []; for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]); return P; }

function hull(P) {
  const S = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of S) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = S.length - 1; i >= 0; i--) { const p = S[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}

// Minimum-area oriented bounding rectangle: centre, unit axes u (long) and
// v, half extents hu >= hv.
export function obb(P) {
  const H = hull(P); let best = null;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    let ux = b[0] - a[0], uz = b[1] - a[1]; const L = Math.hypot(ux, uz); if (L < 1e-6) continue; ux /= L; uz /= L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of H) { const du = p[0] * ux + p[1] * uz, dv = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, du); u1 = Math.max(u1, du); v0 = Math.min(v0, dv); v1 = Math.max(v1, dv); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  let { ux, uz, u0, u1, v0, v1 } = best;
  let hu = (u1 - u0) / 2, hv = (v1 - v0) / 2, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  let vx = -uz, vz = ux;
  const cx = cu * ux + cv * vx, cz = cu * uz + cv * vz;
  if (hv > hu) { [hu, hv] = [hv, hu]; [ux, uz, vx, vz] = [vx, vz, -ux, -uz]; }
  return { cx, cz, ux, uz, vx, vz, hu, hv, A: best.A };
}

// Sutherland-Hodgman: keep the part of P where f(p) >= 0 (f is linear).
export function clip(P, f) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const A = P[i], B = P[(i + 1) % P.length], fa = f(A), fb = f(B);
    if (fa >= 0) out.push(A);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
  }
  // drop duplicate points
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return out.length < 2 || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
}

// Triangles (index triples) of a simple polygon.
export function triangulate(P) {
  if (P.length < 3) return [];
  const v = P.map((p) => new THREE.Vector2(p[0], p[1]));
  try { return THREE.ShapeUtils.triangulateShape(v, []); } catch (e) { return []; }
}

// Geometry collector: world-space quads/triangles per material+tint,
// flushed into the StaticBatch as one geometry each.
export class Mesher {
  constructor() { this.m = new Map(); }
  // geometry is grouped per material + tint + map chunk, so distance culling works
  _g(mat, color, v) {
    const cx = Math.floor(v[0] / CHUNK), cz = Math.floor(v[2] / CHUNK), k = mat.uuid + color + cx + ',' + cz;
    let g = this.m.get(k); if (!g) { g = { mat, color, cx, cz, pos: [], uv: [], idx: [] }; this.m.set(k, g); } return g;
  }
  // vertices [[x,y,z]...] with uvs [[u,v]...]; `n` = wanted facing (vec3-ish) or null
  poly(mat, color, V, UV, n = null) {
    const g = this._g(mat, color, V[0]), base = g.pos.length / 3;
    for (let i = 0; i < V.length; i++) { g.pos.push(V[i][0], V[i][1], V[i][2]); g.uv.push(UV[i][0], UV[i][1]); }
    let flip = false;
    if (n) {
      const a = V[0], b = V[1], c = V[2];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      flip = nx * n[0] + ny * n[1] + nz * n[2] < 0;
    }
    for (let i = 1; i < V.length - 1; i++) flip ? g.idx.push(base, base + i + 1, base + i) : g.idx.push(base, base + i, base + i + 1);
  }
  tris(mat, color, V, UV, T, up = true) {
    const g = this._g(mat, color, V[0]), base = g.pos.length / 3;
    for (let i = 0; i < V.length; i++) { g.pos.push(V[i][0], V[i][1], V[i][2]); g.uv.push(UV[i][0], UV[i][1]); }
    for (const [a, b, c] of T) {
      const A = V[a], B = V[b], C = V[c];
      const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      (ny >= 0) === up ? g.idx.push(base + a, base + b, base + c) : g.idx.push(base + a, base + c, base + b);
    }
  }
  flush(batch, detail = false) {
    for (const g of this.m.values()) {
      if (!g.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.idx); geo.computeVertexNormals();
      batch.add(g.mat, geo, { color: g.color, detail, chunk: [g.cx, g.cz] });
    }
    this.m.clear();
  }
}
