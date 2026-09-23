// Terrain height + collision. Solid things are boxes, optionally rotated
// about Y (buildings follow the real, angled streets). A uniform grid keeps
// queries fast with thousands of buildings.

// Fir Vale's real lie of the land: a heightmap sampled from open elevation
// data (see scripts/import-map), relative to the Page Hall/Owler Lane area.
// The ground falls from Firth Park and Barnsley Road down to the Owler Brook
// valley and climbs again towards Wincobank.
import OSM from '../maps/firvale/osm.js';
const HM = (() => {
  const h = OSM.height, bin = atob(h.d), n = h.nx * h.nz, f = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; f[i] = v / 10; }
  return { ...h, f };
})();
export const TERRAIN = HM;
export function groundHeight(x, z) {
  let u = (x - HM.x0) / HM.step, v = (z - HM.z0) / HM.step;
  u = Math.max(0, Math.min(HM.nx - 1.001, u)); v = Math.max(0, Math.min(HM.nz - 1.001, v));
  const i = u | 0, j = v | 0, a = u - i, b = v - j, F = HM.f, k = j * HM.nx + i;
  return (F[k] * (1 - a) + F[k + 1] * a) * (1 - b) + (F[k + HM.nx] * (1 - a) + F[k + HM.nx + 1] * a) * b;
}

const CELL = 24;

export class World {
  constructor() {
    this.boxes = [];      // static boxes
    this.dynamic = [];    // moving boxes (cars, NPCs) — owners update them in place
    this.grid = new Map();
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  _insert(b) {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL), z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this._key(ix, iz); let c = this.grid.get(k); if (!c) { c = []; this.grid.set(k, c); } c.push(b);
    }
  }

  // Axis-aligned box.
  addBox(minX, maxX, minY, maxY, minZ, maxZ, tag = 'static', owner = null) {
    const b = { minX, maxX, minY, maxY, minZ, maxZ, tag, owner, rot: 0 };
    this.boxes.push(b); this._insert(b);
    return b;
  }

  // Box of half-size (hw, hd) centred at (cx, cz) rotated by `ry` (radians,
  // same convention as Object3D.rotation.y).
  addOBB(cx, cz, hw, hd, ry, minY, maxY, tag = 'static', owner = null) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
    const b = { minX: cx - ex, maxX: cx + ex, minY, maxY, minZ: cz - ez, maxZ: cz + ez, tag, owner, rot: ry, cx, cz, hw, hd, c, s };
    this.boxes.push(b); this._insert(b);
    return b;
  }

  addFootprint(x, z, w, d, h, tag, owner, baseOffset = 0) {
    const g = groundHeight(x, z) + baseOffset;
    return this.addBox(x - w / 2, x + w / 2, g - 2, g + h, z - d / 2, z + d / 2, tag, owner);
  }

  // Candidate boxes near a point / radius.
  near(x, z, r, out) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const c = this.grid.get(this._key(ix, iz)); if (c) for (const b of c) if (b._q !== this._qid) { b._q = this._qid; out.push(b); } }
    this._qid = (this._qid || 0) + 1;
    for (const b of this.dynamic) out.push(b);
    return out;
  }

  // Point -> box local frame (for rotated boxes).
  static local(b, x, z) {
    if (!b.rot) return [x, z, b];
    const dx = x - b.cx, dz = z - b.cz;
    // inverse rotation
    return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
  }

  // Highest surface under a point that could be stood on.
  floorAt(x, z, feetY, step, radius = 0) {
    let y = groundHeight(x, z);
    for (const b of this.near(x, z, radius + 1, this._tmp || (this._tmp = []))) {
      if (b.maxY > feetY + step || b.maxY <= y) continue;
      if (b.rot) {
        const [lx, lz] = World.local(b, x, z);
        if (Math.abs(lx) >= b.hw + radius || Math.abs(lz) >= b.hd + radius) continue;
      } else if (x + radius <= b.minX || x - radius >= b.maxX || z + radius <= b.minZ || z - radius >= b.maxZ) continue;
      y = b.maxY;
    }
    return y;
  }

  // Push a vertical cylinder out of every box it overlaps (XZ plane only).
  collideCylinder(pos, radius, feetY, height, step) {
    let hit = null;
    for (const b of this.near(pos.x, pos.z, radius + 1, this._tmp2 || (this._tmp2 = []))) {
      if (b.maxY <= feetY + step || b.minY >= feetY + height) continue;
      let px, pz, minX, maxX, minZ, maxZ;
      if (b.rot) { [px, pz] = World.local(b, pos.x, pos.z); minX = -b.hw; maxX = b.hw; minZ = -b.hd; maxZ = b.hd; }
      else { px = pos.x; pz = pos.z; minX = b.minX; maxX = b.maxX; minZ = b.minZ; maxZ = b.maxZ; }
      const cx = Math.max(minX, Math.min(px, maxX)), cz = Math.max(minZ, Math.min(pz, maxZ));
      let dx = px - cx, dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); px = cx + dx / d * radius; pz = cz + dz / d * radius; }
      else {
        const m = Math.min(px - minX, maxX - px, pz - minZ, maxZ - pz);
        if (m === px - minX) px = minX - radius; else if (m === maxX - px) px = maxX + radius; else if (m === pz - minZ) pz = minZ - radius; else pz = maxZ + radius;
      }
      if (b.rot) { pos.x = b.cx + px * b.c + pz * b.s; pos.z = b.cz - px * b.s + pz * b.c; }
      else { pos.x = px; pos.z = pz; }
      hit = b;
    }
    return hit;
  }

  // Ray vs boxes: nearest hit within maxDist.
  raycastBoxes(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, bestBox = null, bestN = null;
    // gather candidates along the ray from the grid
    const cand = this._rc || (this._rc = []); cand.length = 0; const qid = (this._qid = (this._qid || 0) + 1);
    const stepLen = CELL * 0.5, steps = Math.ceil(maxDist / stepLen) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxDist, i * stepLen);
      const x = ox + dx * t, z = oz + dz * t;
      for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
        const c = this.grid.get(this._key(Math.floor(x / CELL) + ax, Math.floor(z / CELL) + az));
        if (c) for (const b of c) if (b._q !== qid) { b._q = qid; cand.push(b); }
      }
    }
    for (const b of this.dynamic) cand.push(b);
    for (const b of cand) {
      let o = [ox, oy, oz], d = [dx, dy, dz], mn, mx;
      if (b.rot) {
        const [lx, lz] = World.local(b, ox, oz);
        o = [lx, oy, lz]; d = [dx * b.c - dz * b.s, dy, dx * b.s + dz * b.c];
        mn = [-b.hw, b.minY, -b.hd]; mx = [b.hw, b.maxY, b.hd];
      } else { mn = [b.minX, b.minY, b.minZ]; mx = [b.maxX, b.maxY, b.maxZ]; }
      let tmin = 0, tmax = best, nAxis = -1, nSign = 0, ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) { ok = false; break; } continue; }
        let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i], s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; nAxis = i; nSign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin > 0 && tmin < best) { best = tmin; bestBox = b; bestN = [nAxis, nSign]; }
    }
    // ground (march)
    if (dy < 0) {
      for (let t = 0.5; t < best; t += 0.5) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (y < groundHeight(x, z)) { best = t; bestBox = null; bestN = [1, 1]; break; }
      }
    }
    let normalAxis = bestN ? bestN[0] : -1, normalSign = bestN ? bestN[1] : 0, normal = null;
    if (bestBox && bestBox.rot && normalAxis !== 1) {
      // rotate local normal back to world
      const nx = normalAxis === 0 ? normalSign : 0, nz = normalAxis === 2 ? normalSign : 0;
      normal = [nx * bestBox.c + nz * bestBox.s, 0, -nx * bestBox.s + nz * bestBox.c];
    }
    return { dist: best, box: bestBox, normalAxis, normalSign, normal };
  }
}
