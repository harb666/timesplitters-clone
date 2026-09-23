// Geometry helpers for building detailed hard-surface models (weapons,
// hands, props) from real-world style profiles: side-profile extrusions
// with bevels, lathes for round parts, tubes, rounded boxes, and a
// box-projection UV pass so procedural PBR textures map evenly.
import * as THREE from 'three';

// Re-map UVs by projecting along the dominant normal axis (tri-planar-ish).
// `scale` = texture repeats per metre.
export function boxUV(geo, scale = 20) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    // use the face normal so a triangle never straddles two projections
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { nx += Math.abs(n.getX(i + k)); ny += Math.abs(n.getY(i + k)); nz += Math.abs(n.getZ(i + k)); }
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u, v;
      if (nx >= ny && nx >= nz) { u = z; v = y; } else if (ny >= nz) { u = x; v = z; } else { u = x; v = y; }
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Round every corner of a polygon (like a machined/forged part). Each
// point may carry its own radius as a third value: [x, y, r].
export function fillet(points, radius = 0.003, steps = 4) {
  const out = [], n = points.length;
  for (let i = 0; i < n; i++) {
    const P = points[i], A = points[(i - 1 + n) % n], C = points[(i + 1) % n];
    const r = P[2] ?? radius;
    const ax = A[0] - P[0], ay = A[1] - P[1], cx = C[0] - P[0], cy = C[1] - P[1];
    const la = Math.hypot(ax, ay), lc = Math.hypot(cx, cy);
    const d = Math.min(r, la * 0.45, lc * 0.45);
    if (d <= 1e-6) { out.push([P[0], P[1]]); continue; }
    const s = [P[0] + ax / la * d, P[1] + ay / la * d], e = [P[0] + cx / lc * d, P[1] + cy / lc * d];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push([u * u * s[0] + 2 * u * t * P[0] + t * t * e[0], u * u * s[1] + 2 * u * t * P[1] + t * t * e[1]]);
    }
  }
  return out;
}

function shapeFrom(points, holes = []) {
  const s = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))));
  return s;
}

// Side profile: points are [forward, up] in metres (forward = towards the
// muzzle). Extruded `width` across the gun (x axis), centred, bevelled.
// Result: forward -> -Z, up -> +Y, width -> X.
export function sideProfile(points, width, { bevel = 0.0015, holes = [], curveSegments = 12, uv = 30, round = 0 } = {}) {
  if (round > 0 && !(points instanceof THREE.Shape)) { points = fillet(points, round); holes = holes.map((h) => fillet(h, round)); }
  const shape = points instanceof THREE.Shape ? points : shapeFrom(points, holes);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  return boxUV(g, uv);
}

// Cross-section extruded along the barrel axis. Section points are [x, y];
// the part runs from forward=f0 to forward=f1.
export function section(points, f0, f1, { bevel = 0.001, holes = [], uv = 30 } = {}) {
  const shape = shapeFrom(points, holes);
  const len = f1 - f0;
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0001, len - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -f1 + bevel); // spans forward f0..f1 (i.e. z = -f1..-f0)
  return boxUV(g, uv);
}

// Round part along the barrel axis. Points are [radius, forward].
export function lathe(points, segments = 32, { uv = 30, phi = 0, phiLength = Math.PI * 2 } = {}) {
  const g = new THREE.LatheGeometry(points.map(([r, f]) => new THREE.Vector2(r, f)), segments, phi, phiLength);
  g.rotateX(-Math.PI / 2); // lathe Y -> forward (-Z)
  return boxUV(g, uv);
}

// Cylinder along the barrel axis between two forward positions.
export function rod(r, f0, f1, segments = 20, { uv = 30 } = {}) {
  const g = new THREE.CylinderGeometry(r, r, f1 - f0, segments);
  g.rotateX(-Math.PI / 2); g.translate(0, 0, -(f0 + f1) / 2);
  return boxUV(g, uv);
}

// Cylinder across the gun (along X) — pins, screws, rivets.
export function pin(r, len, segments = 12, { uv = 60 } = {}) {
  const g = new THREE.CylinderGeometry(r, r, len, segments);
  g.rotateZ(Math.PI / 2);
  return boxUV(g, uv);
}

// Slotted screw head facing +X.
export function screwHead(r = 0.0028, h = 0.0012) {
  const head = new THREE.CylinderGeometry(r, r * 1.05, h, 16); head.rotateZ(Math.PI / 2);
  return boxUV(head, 60);
}

export function tube(points, radius, { segments = 48, radial = 12, closed = false, uv = 30 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), closed, 'centripetal');
  return boxUV(new THREE.TubeGeometry(curve, segments, radius, radial, closed), uv);
}

// Rounded box (for hands, pads, receivers' softer parts).
export function roundedBox(w, h, d, r, seg = 3, uv = 30) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const dir = v.clone().sub(inner);
    if (dir.lengthSq() > 1e-12) { dir.normalize().multiplyScalar(r); v.copy(inner).add(dir); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return boxUV(g, uv);
}

// Capsule between two points (for fingers and forearms).
export function capsule(r, len, radial = 12) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.0001, len), 4, radial);
  return g; // along +Y, centred
}

// Bake a transform into a geometry (returns it).
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  geo.applyMatrix4(m); return geo;
}

// Merge geometries that share a material into one (fewer draw calls).
export function mergeSame(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// Small builder: collects geometry per material and emits meshes.
export class PartBuilder {
  constructor() { this.buckets = new Map(); }
  add(mat, geo) { if (!this.buckets.has(mat)) this.buckets.set(mat, []); this.buckets.get(mat).push(geo); return this; }
  build(parent) {
    for (const [mat, list] of this.buckets) {
      const m = new THREE.Mesh(mergeSame(list), mat);
      parent.add(m);
    }
    this.buckets.clear();
    return parent;
  }
}
