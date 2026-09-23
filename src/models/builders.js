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

export class StaticBatch {
  constructor() { this.groups = new Map(); }

  // Add any geometry (it is consumed) with a transform and tint colour.
  add(material, geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color } = {}) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    geometry.applyMatrix4(_m);
    ensureAttrs(geometry, color);
    let grp = this.groups.get(material);
    if (!grp) { grp = []; this.groups.set(material, grp); }
    grp.push(geometry);
  }

  // Box by its centre position.
  box(material, x, y, z, w, h, d, { color, tile = 0, ry = 0, rx = 0, rz = 0 } = {}) {
    this.add(material, tiledBox(w, h, d, tile), { x, y, z, rx, ry, rz, color });
  }

  build(parent) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      // Split very large groups to keep index buffers modest.
      for (let i = 0; i < list.length; i += 4000) {
        const mesh = new THREE.Mesh(mergeGeometries(list.slice(i, i + 4000)), mat);
        mesh.matrixAutoUpdate = false;
        parent.add(mesh); meshes.push(mesh);
      }
      list.forEach((g) => g.dispose());
    }
    this.groups.clear();
    return meshes;
  }
}

// Shared materials. Lambert = cheapest lit material, perfect for low-poly.
export function lambert(opts = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
}
