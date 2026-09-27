// Traffic islands: the small pieces of ground boxed in by main-road
// carriageways where one-way links split and rejoin (e.g. Owler Lane /
// Rushby Street at Page Hall). Built like the real ones: a raised tarmac
// island inside a stone kerb with a band of granite setts, white
// pedestrian guard railing, a tall lamp column with the "Proud of Page
// Hall" banner, keep-left signs and chevron boards at the noses, a street
// cabinet. Found automatically from the road graph: short closed loops of
// drivable roads (at least one of them a main road) with no building inside.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { area, inPoly, triangulate } from './geom.js';
import { Frame } from './buildings.js';

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const cv = (w, h, fn, alpha = false) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (alpha) { t.wrapS = THREE.RepeatWrapping; } return t; };
  const railing = cv(128, 64, (g, w, h) => {                    // guard railing: top/bottom rails, vertical bars (repeats every 1 m)
    g.clearRect(0, 0, w, h); g.fillStyle = '#f2f2ee';
    g.fillRect(0, 2, w, 5); g.fillRect(0, h - 9, w, 4);
    for (let x = 4; x < w; x += 13) g.fillRect(x, 5, 3, h - 12);
  }, true);
  const banner = cv(128, 384, (g, w, h) => {
    g.fillStyle = '#1b7f9a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8f6f8'; g.textAlign = 'center';
    g.font = 'italic 26px Georgia, serif'; g.fillText('Proud', w / 2, 70); g.font = 'italic 22px Georgia, serif'; g.fillText('of', w / 2, 100);
    g.font = 'bold 34px Arial'; g.fillText('PAGE', w / 2, 150); g.fillText('HALL', w / 2, 190);
    g.fillStyle = '#f2c23a'; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? 26 : 34; g.lineTo(w / 2 + Math.cos(a) * r, 262 + Math.sin(a) * r); } g.fill();
    g.fillStyle = '#1b7f9a'; g.font = 'bold 13px Arial'; g.fillText('S4', w / 2, 266);
    g.fillStyle = '#e8f6f8'; g.font = '14px Arial'; g.fillText('sheffield.gov.uk', w / 2, 350);
  });
  const keepLeft = cv(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill();
    g.fillStyle = '#1f5fbf'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4 - Math.PI / 2);        // arrow pointing down-left
    g.fillRect(-9, -8, 18, 44); g.beginPath(); g.moveTo(-26, -6); g.lineTo(0, -38); g.lineTo(26, -6); g.fill(); g.restore();
  });
  const chevron = cv(256, 64, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5f5f5';
    for (let k = 0; k < 3; k++) { const x = 30 + k * 72; g.beginPath(); g.moveTo(x + 36, 6); g.lineTo(x, h / 2); g.lineTo(x + 36, h - 6); g.lineTo(x + 58, h - 6); g.lineTo(x + 22, h / 2); g.lineTo(x + 58, 6); g.fill(); }
  });
  const mat = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.55, ...o });
  TEX = { railing: mat(railing, { alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.3, name: 'railing' }), banner: mat(banner, { side: THREE.DoubleSide, name: 'banner' }),
    keepLeft: mat(keepLeft, { name: 'keepLeft' }), chevron: mat(chevron, { name: 'chevron' }), railingTex: railing };
  return TEX;
}

// closed loops of drivable roads -> island polygons
function findIslands(net, osm, buildings) {
  const out = [], seen = new Set();
  const edgesOf = (id) => (net.nodes.get(id)?.roads || []);
  for (const start of net.nodes.keys()) {
    const stack = [[start, [], 0]];
    while (stack.length) {
      const [node, path, len] = stack.pop();
      if (path.length > 7 || len > 170) continue;
      for (const e of edgesOf(node)) {
        const r = e.road; if (path.some((p) => p.r === r)) continue;
        const next = e.end === 'a' ? r.b : r.a; if (next === undefined) continue;
        const np = [...path, { r, fwd: e.end === 'a' }];
        if (next === start && np.length >= 2) {
          const key = np.map((p) => p.r.id).sort((a, b) => a - b).join(',');
          if (!seen.has(key)) { seen.add(key); out.push(np); }
          continue;
        }
        if (np.some((p, i) => i < np.length - 1 && (p.fwd ? p.r.b : p.r.a) === next)) continue;   // no figure-eights
        stack.push([next, np, len + r.length]);
      }
    }
  }
  const islands = [];
  for (const loop of out) {
    if (!loop.some((p) => p.r.kind === 'a' || p.r.kind === 'b')) continue;
    // polygon from the real centrelines, remembering each point's road
    const P = [], H = [];
    for (const { r, fwd } of loop) {
      const w = osm.roads[r.id].p, pts = []; for (let k = 0; k < w.length; k += 2) pts.push([w[k], w[k + 1]]);
      if (!fwd) pts.reverse();
      for (let i = 0; i < pts.length - 1; i++) { const q = pts[i]; if (!P.length || Math.hypot(q[0] - P[P.length - 1][0], q[1] - P[P.length - 1][1]) > 0.3) { P.push(q); H.push(r.half); } }
    }
    const A = area(P);
    if (Math.abs(A) < 25 || Math.abs(A) > 1600) continue;
    if (buildings.some((B) => B.c && inPoly(P, B.c[0], B.c[1]))) continue;
    // no other road runs through it
    let crossed = false;
    for (const r of net.roads) if (!loop.some((p) => p.r === r) && r.kind !== 'f') { const m = r.samples[r.samples.length >> 1]; if (inPoly(P, m.x, m.z)) { crossed = true; break; } }
    if (crossed) continue;
    if (A < 0) { P.reverse(); H.reverse(); }
    islands.push({ P, H, loop });
  }
  return islands;
}

// inset a CCW polygon by a per-vertex distance (mitred, clamped at sharp noses)
function inset(P, D) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    let e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1; e1 = [e1[0] / l1, e1[1] / l1]; e2 = [e2[0] / l2, e2[1] / l2];
    const n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]];                         // inward normals (CCW)
    let m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(...m) || 1; m = [m[0] / ml, m[1] / ml];
    const cosh = Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
    out.push([b[0] + m[0] * D[i] / cosh, b[1] + m[1] * D[i] / cosh]);
  }
  return out;
}

// Islands before the roads are built: road loops with room inside, plus
// pedestrian islands whose guard railing is mapped as a closed ring of fence
// lines in the road (those fences become the island's railings).
export function prepareIslands(net, osm, buildings) {
  const list = findIslands(net, osm, buildings).map((q) => ({ ...q, kind: 'loop' }));
  const fences = osm.furniture.filter((f) => f.k === 'fence' && f.p.length >= 4);
  const pts = (f) => { const P = []; for (let k = 0; k < f.p.length; k += 2) P.push([f.p[k], f.p[k + 1]]); return P; };
  const nearRoad = (P) => P.every(([x, z]) => { const n = net.nearest(x, z, null, (r) => r.kind === 'a' || r.kind === 'b' || r.kind === 'r'); return n && n.dist < n.road.half + n.road.pave + 8; });
  const used = new Set();
  for (let i = 0; i < fences.length; i++) for (let j = i + 1; j < fences.length; j++) {
    if (used.has(i) || used.has(j)) continue;
    const A = pts(fences[i]), B = pts(fences[j]);
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    // join end-to-end into a ring (either orientation)
    let ring = null;
    if (d(A[A.length - 1], B[0]) < 6 && d(B[B.length - 1], A[0]) < 6) ring = [...A, ...B];
    else if (d(A[A.length - 1], B[B.length - 1]) < 6 && d(B[0], A[0]) < 6) ring = [...A, ...[...B].reverse()];
    if (!ring || !nearRoad(ring)) continue;
    const ar = area(ring); if (Math.abs(ar) < 15 || Math.abs(ar) > 900) continue;
    if (ar < 0) ring.reverse();
    used.add(i); used.add(j); fences[i].island = fences[j].island = true;
    list.push({ kind: 'rail', rail: [A, B], P: ring });
  }
  return list;
}

export function buildIslands(batch, M, world, net, list) {
  const T = textures(), made = [];
  for (const isl of list) {
    const { P } = isl;
    let I = [];
    if (isl.kind === 'rail') {
      // kerb: out from the railing to where the carriageway begins (at least 0.55 m, at most 9 m)
      const out = inset(P, P.map(() => -1));
      const raw = P.map((p, i) => {
        const dx = out[i][0] - p[0], dz = out[i][1] - p[1];
        let t = 0.55; while (t < 9 && !net.onCarriageway(p[0] + dx * (t + 0.15), p[1] + dz * (t + 0.15), null, 0.05)) t += 0.15;
        if (t >= 9) t = 0.55;
        return [p[0] + dx * t, p[1] + dz * t];
      });
      // densify + smooth so the kerb curves
      const dense = []; raw.forEach((q, i) => { const r = raw[(i + 1) % raw.length]; for (let k = 0; k < 3; k++) dense.push([q[0] + (r[0] - q[0]) * k / 3, q[1] + (r[1] - q[1]) * k / 3]); });
      for (let pass = 0; pass < 2; pass++) { const c = dense.map((q) => q.slice()); for (let i = 0; i < dense.length; i++) { const a = c[(i - 1 + c.length) % c.length], b = c[(i + 1) % c.length]; dense[i] = [(a[0] + 2 * c[i][0] + b[0]) / 4, (a[1] + 2 * c[i][1] + b[1]) / 4]; } }
      I = dense;
    } else {
    // the kerb line: from each centreline point, walk inwards until off every carriageway
    const dir = inset(P, P.map(() => 1));
    P.forEach((p, i) => {
      const dx = dir[i][0] - p[0], dz = dir[i][1] - p[1];
      for (let t = 0.5; t < 14; t += 0.1) {
        const x = p[0] + dx * t, z = p[1] + dz * t;
        if (!inPoly(P, x, z)) return;
        if (!net.onCarriageway(x, z, null, 0.15)) { I.push([x, z]); return; }
      }
    });
    // smooth, and drop points that fold back
    const S = I.map((q, i) => { const a = I[(i - 1 + I.length) % I.length], b = I[(i + 1) % I.length]; return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4]; });
    I.length = 0; for (const q of S) if (!I.length || Math.hypot(q[0] - I[I.length - 1][0], q[1] - I[I.length - 1][1]) > 0.4) I.push(q);
    }
    if (I.length < 3 || area(I) < 8) continue;
    made.push(I);
    const lift = 0.175;                                  // (just above the pavement ribbons it covers)
    // island top: tarmac, and a band of granite setts just inside the kerb
    const fill = (mat, poly, y, color, tile) => {
      const Tr = triangulate(poly); if (!Tr.length) return;
      const pos = [], uv = [], idx = [];
      for (const [x, z] of poly) { pos.push(x, G(x, z) + y, z); uv.push(x / tile, z / tile); }
      for (const [a, b, c] of Tr) { const A = poly[a], B = poly[b], C = poly[c]; ((B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1])) >= 0 ? idx.push(a, b, c) : idx.push(a, c, b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      batch.add(mat, g, { color });
    };
    const inner = inset(I, I.map(() => 0.55));
    const innerOk = area(inner) > 4 && !inner.some((p) => !inPoly(I, p[0], p[1]));
    fill(M.pave, I, lift - 0.005, '#6d655c', 0.6);                                          // setts band (under)
    if (innerOk) fill(M.paveTar || M.road, inner, lift, '#ffffff', 4);                     // tarmac top
    // kerb all round
    for (let i = 0; i < I.length; i++) {
      const [ax, az] = I[i], [bx, bz] = I[(i + 1) % I.length], ga = G(ax, az), gb = G(bx, bz);
      batch.sloped(M.kerb, ax, az, bx, bz, 0.25, ga - 0.12, gb - 0.12, ga + lift + 0.01, gb + lift + 0.01, { color: '#a9a7a1', tile: 1 });
    }
    // noses: the sharp corners get a keep-left sign and a chevron board facing the traffic
    const n = I.length, noses = [];
    for (let i = 0; i < n; i++) {
      const a = I[(i - 1 + n) % n], b = I[i], c = I[(i + 1) % n];
      const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]], ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1))));
      if (ang < 1.35) noses.push({ p: b, out: (() => { const m = [-(u[0] / Math.hypot(...u) + v[0] / Math.hypot(...v)), -(u[1] / Math.hypot(...u) + v[1] / Math.hypot(...v))]; const l = Math.hypot(...m) || 1; return [m[0] / l, m[1] / l]; })() });
    }
    if (noses.length < 2) {                                         // blunt ends: use the two ends of the island's long axis
      let best = null; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(I[i][0] - I[j][0], I[i][1] - I[j][1]); if (!best || d > best.d) best = { d, i, j }; }
      let mx = 0, mz = 0; for (const [x, z] of I) { mx += x; mz += z; } mx /= n; mz /= n;
      noses.length = 0;
      for (const k of [best.i, best.j]) { const p = I[k], l = Math.hypot(p[0] - mx, p[1] - mz) || 1; noses.push({ p, out: [(p[0] - mx) / l, (p[1] - mz) / l] }); }
    }
    for (const { p, out } of noses) {
      const x = p[0] - out[0] * 1.2, z = p[1] - out[1] * 1.2, g = G(x, z) + lift, ry = Math.atan2(out[0], out[1]);
      const f = new Frame(batch, x, z, ry, g);
      f.box(M.darkMetal, 0, 0.7, 0, 0.08, 1.4, 0.08, { color: '#1c1c1c' });
      f.geo(T.keepLeft, new THREE.CircleGeometry(0.3, 24), 0, 1.25, 0.05, { color: '#ffffff' });
      f.geo(M.darkMetal, new THREE.CircleGeometry(0.31, 24), 0, 1.25, 0.04, { ry: Math.PI, color: '#2a2a2a' });
      // chevron board a little further in, on two posts
      const cx = x - out[0] * 1.6, cz = z - out[1] * 1.6, cf = new Frame(batch, cx, cz, ry, G(cx, cz) + lift);
      for (const sx of [-0.5, 0.5]) cf.box(M.darkMetal, sx, 0.45, 0, 0.07, 0.9, 0.07, { color: '#1c1c1c' });
      cf.geo(T.chevron, new THREE.PlaneGeometry(1.5, 0.4), 0, 1.0, 0.04, { color: '#ffffff' });
      cf.box(M.darkMetal, 0, 1.0, 0.0, 1.52, 0.42, 0.04, { color: '#111111' });
      world.addBox(x - 0.15, x + 0.15, g - 1, g + 1.6, z - 0.15, z + 0.15, 'pole');
    }
    // guard railing along the long sides (gaps at the noses and where people cross)
    const railAt = (x, z) => isl.kind === 'rail' || !noses.some(({ p }) => Math.hypot(p[0] - x, p[1] - z) < 5.5);
    const segs = [];
    if (isl.kind === 'rail') for (const F of isl.rail) for (let i = 0; i + 1 < F.length; i++) segs.push([F[i], F[i + 1]]);
    else { const R = inset(I, I.map(() => 0.45)); for (let i = 0; i < R.length; i++) segs.push([R[i], R[(i + 1) % R.length]]); }
    for (const [a, b] of segs) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.round(L / 2));
      for (let j = 0; j < k; j++) {
        const x0 = a[0] + (b[0] - a[0]) * j / k, z0 = a[1] + (b[1] - a[1]) * j / k, x1 = a[0] + (b[0] - a[0]) * (j + 1) / k, z1 = a[1] + (b[1] - a[1]) * (j + 1) / k;
        if (!railAt((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        const l = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, g = G(mx, mz) + lift;
        const pg = new THREE.PlaneGeometry(l, 1.0); const uv = pg.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) * l);
        batch.add(T.railing, pg, { x: mx, y: g + 0.55, z: mz, ry: ry + Math.PI / 2, color: '#ffffff', detail: true });
        batch.box(M.metal, x0, G(x0, z0) + lift + 0.55, z0, 0.06, 1.1, 0.06, { color: '#f0f0ec', detail: true });
        world.addOBB(mx, mz, 0.05, l / 2, ry, g - 1, g + 1.1, 'fence');
      }
    }
    // tall lamp column in the middle with the banner, and a street cabinet
    let cx = 0, cz = 0; for (const [x, z] of I) { cx += x; cz += z; } cx /= I.length; cz /= I.length;
    if (!inPoly(I, cx, cz)) continue;
    const gl = G(cx, cz) + lift, Hc = 12;
    batch.add(M.darkMetal, new THREE.CylinderGeometry(0.09, 0.16, Hc, 10), { x: cx, y: gl + Hc / 2, z: cz, color: '#2b2e31' });
    const lf = new Frame(batch, cx, cz, 0, gl);
    for (const sd of [-1, 1]) {
      lf.box(M.darkMetal, sd * 0.7, Hc - 0.2, 0, 1.4, 0.07, 0.07, { color: '#2b2e31' });
      lf.box(M.lampHead, sd * 1.35, Hc - 0.3, 0, 0.6, 0.1, 0.25, { color: '#ffffff' });
    }
    for (const y of [Hc * 0.62, Hc * 0.62 - 2.1]) lf.box(M.darkMetal, 0.45, y, 0, 0.9, 0.04, 0.04, { color: '#2b2e31', detail: true });
    lf.geo(T.banner, new THREE.PlaneGeometry(0.75, 2.1), 0.5, Hc * 0.62 - 1.05, 0, { color: '#ffffff' });
    world.addBox(cx - 0.18, cx + 0.18, gl - 1, gl + Hc, cz - 0.18, cz + 0.18, 'lamp');
    const kx = cx + 2.2, kz = cz + 0.6;
    if (inPoly(inner, kx, kz)) { batch.box(M.cabinet, kx, G(kx, kz) + lift + 0.7, kz, 1.1, 1.4, 0.55, { color: '#1b1c1e' }); world.addBox(kx - 0.6, kx + 0.6, gl - 1, gl + 1.4, kz - 0.3, kz + 0.3, 'cabinet'); }
  }
  return made;
}
