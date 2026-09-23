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

export function mergeGeometries(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2), col = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    col.set(g.attributes.color.array, vo * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    vo += n; io += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// Collects static scenery and merges it into one mesh per material per
// map chunk (so the camera only draws nearby chunks). Pieces flagged
// `detail` go in a separate layer that is hidden beyond DETAIL_RANGE.
export const CHUNK = 128;
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

  build(parent) {
    const meshes = [];
    for (const grp of this.groups.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(grp.list), grp.material);
      mesh.matrixAutoUpdate = false;
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
