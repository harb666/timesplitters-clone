// Low-poly building blocks. Static scenery is merged into a handful of big
// meshes (one per material) so the iPhone only has a few draw calls to do.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

// Box whose UVs are in metres / tile, so textures tile at a constant scale
// no matter how big the box is.
export function tiledBox(w, h, d, tile = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile > 0) {
    const uv = g.attributes.uv;
    // BoxGeometry faces: +x, -x, +y, -y, +z, -z (4 verts each)
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
      }
    }
  }
  return g;
}

function ensureAttrs(g, color) {
  if (g.index === null) {
    const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
    g.setIndex(idx);
  }
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const col = new Float32Array(n * 3);
  _c.set(color ?? 0xffffff);
  // (Color.set converts sRGB hex into the renderer's linear space for us.)
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Merged scenery in compact form (phones have little memory, ~19 bytes a
// vertex instead of 44): positions as 16-bit integers relative to the
// piece of map (the mesh's position/scale undo it), normals as bytes, tint
// colours as 16-bit, texture coordinates as half floats (each piece's UVs
// shifted by whole tiles first so they stay small and precise).
export function mergeGeometries(list, { compact = true } = {}) {
  let vCount = 0, iCount = 0;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const g of list) {
    vCount += g.attributes.position.count; iCount += g.index.count;
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) { const x = a[i], y = a[i + 1], z = a[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, S = Math.max(x1 - x0, y1 - y0, z1 - z0, 0.01) / 2 * 1.0001;
  const pos = compact ? new Int16Array(vCount * 3) : new Float32Array(vCount * 3), nor = new Int8Array(vCount * 3);
  const uv = compact ? new Uint16Array(vCount * 2) : new Float32Array(vCount * 2), col = new Uint16Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  const half = THREE.DataUtils.toHalfFloat;
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count, o3 = vo * 3, o2 = vo * 2;
    const pa = g.attributes.position.array, na = g.attributes.normal.array, ca = g.attributes.color.array, ua = g.attributes.uv.array;
    for (let i = 0; i < n * 3; i += 3) {
      if (compact) { pos[o3 + i] = Math.round((pa[i] - cx) / S * 32767); pos[o3 + i + 1] = Math.round((pa[i + 1] - cy) / S * 32767); pos[o3 + i + 2] = Math.round((pa[i + 2] - cz) / S * 32767); }
      else { pos[o3 + i] = pa[i]; pos[o3 + i + 1] = pa[i + 1]; pos[o3 + i + 2] = pa[i + 2]; }
    }
    for (let i = 0; i < n * 3; i++) { nor[o3 + i] = Math.round(Math.max(-1, Math.min(1, na[i])) * 127); col[o3 + i] = Math.round(Math.max(0, Math.min(1, ca[i])) * 65535); }
    if (compact) {
      let mu = Infinity, mv = Infinity; for (let i = 0; i < n * 2; i += 2) { if (ua[i] < mu) mu = ua[i]; if (ua[i + 1] < mv) mv = ua[i + 1]; }
      mu = Math.floor(mu); mv = Math.floor(mv);
      for (let i = 0; i < n * 2; i += 2) { uv[o2 + i] = half(ua[i] - mu); uv[o2 + i + 1] = half(ua[i + 1] - mv); }
    } else uv.set(ua, o2);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    vo += n; io += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3, compact));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  out.setAttribute('uv', compact ? new THREE.Float16BufferAttribute(uv, 2) : new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.userData.q = compact ? { cx, cy, cz, S } : null;
  return out;
}

// Collects static scenery and merges it into one mesh per material per
// map chunk (so the camera only draws nearby chunks). Pieces flagged
// `detail` go in a separate layer that is hidden beyond DETAIL_RANGE.
export const CHUNK = 128;
function dropArray() { this.array = null; }
export class StaticBatch {
  constructor() { this.groups = new Map(); }

  // Add any geometry (it is consumed) with a transform and tint colour.
  add(material, geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color, detail = false, chunk } = {}) {
    if (x || y || z || rx || ry || rz || sx !== 1 || sy !== 1 || sz !== 1) {
      _e.set(rx, ry, rz); _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
      geometry.applyMatrix4(_m);
    }
    ensureAttrs(geometry, color);
    let cx, cz;
    if (chunk) { [cx, cz] = chunk; } else {
      const pa = geometry.attributes.position.array; let mx = 0, mz = 0; const n = pa.length / 3, st = Math.max(1, Math.floor(n / 8)); let k = 0;
      for (let i = 0; i < n; i += st) { mx += pa[i * 3]; mz += pa[i * 3 + 2]; k++; }
      cx = Math.floor(mx / k / CHUNK); cz = Math.floor(mz / k / CHUNK);
    }
    const key = material.uuid + '|' + cx + '|' + cz + '|' + (detail ? 1 : 0);
    let grp = this.groups.get(key);
    if (!grp) { grp = { material, list: [], detail, count: 0 }; this.groups.set(key, grp); }
    grp.list.push(geometry); grp.count += geometry.attributes.position.count;
    return this;
  }

  // Box by its centre position.
  box(material, x, y, z, w, h, d, { color, tile = 0, ry = 0, rx = 0, rz = 0, detail = false } = {}) {
    this.add(material, tiledBox(w, h, d, tile), { x, y, z, rx, ry, rz, color, detail });
  }

  // Box running from (x0,z0) to (x1,z1), `t` thick, whose bottom and top
  // edges slope independently (b0/b1, t0/t1 = heights at each end): walls,
  // copings and kerbs that follow the ground instead of stepping.
  sloped(material, x0, z0, x1, z1, t, b0, b1, t0, t1, { color, tile = 0, detail = false } = {}) {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-3) return;
    const g = tiledBox(t, ((t0 - b0) + (t1 - b1)) / 2, L, tile), P = g.attributes.position;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    for (let i = 0; i < P.count; i++) {
      const lx = P.getX(i), lz = P.getZ(i), k = lz / L + 0.5, top = P.getY(i) > 0;
      P.setXYZ(i, x0 + ux * (k * L) + uz * lx, top ? t0 + (t1 - t0) * k : b0 + (b1 - b0) * k, z0 + uz * (k * L) - ux * lx);
    }
    g.computeVertexNormals();
    this.add(material, g, { color, detail });
  }

  build(parent) {
    const meshes = [];
    for (const grp of this.groups.values()) {
      const geo = mergeGeometries(grp.list);
      // once the GPU has the scenery, drop the JavaScript copy (it's never read back)
      for (const k in geo.attributes) geo.attributes[k].onUpload(dropArray);
      geo.index.onUpload(dropArray);
      const mesh = new THREE.Mesh(geo, grp.material), q = geo.userData.q;
      if (q) { mesh.position.set(q.cx, q.cy, q.cz); mesh.scale.setScalar(q.S); }
      mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
      // world-space bounds for the distance culling
      const bs = geo.boundingSphere; mesh.userData.wc = bs.center.clone().multiplyScalar(q ? q.S : 1).add(mesh.position); mesh.userData.wr = bs.radius * (q ? q.S : 1);
      mesh.userData.detail = grp.detail;
      parent.add(mesh); meshes.push(mesh);
      grp.list.forEach((g) => g.dispose());
    }
    this.groups.clear();
    return meshes;
  }
}

// Shared materials. Lambert = cheapest lit material, perfect for low-poly.
export function lambert(opts = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
}

// Physically based material for world surfaces: colour, roughness and
// normal maps from a procedural PBR set, tinted per-vertex.
export function pbr(set, opts = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: set?.map ?? null, roughnessMap: set?.roughnessMap ?? null, normalMap: set?.normalMap ?? null,
    normalScale: new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1),
    roughness: opts.roughness ?? 1, metalness: opts.metalness ?? 0, envMapIntensity: opts.env ?? 0.8,
    flatShading: !!opts.flatShading,
  });
}
