// Real 3-D grass close to the player: clumps of thin, tapered, curved blades
// on the lawns, verges and parks (wherever the land-cover mask says grass
// and there's no road or pavement), swaying in the wind. Clumps are laid out
// in world-fixed tiles (so they don't swim as you walk) and only the ones
// within ~24 m are drawn; they shrink into the ground towards the edge so
// there's no pop.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';

const TILE = 12;

function clumpGeometry() {
  // 6 blades, each a 2-segment tapered strip bending over towards its tip
  const pos = [], col = [], idx = [];
  let seed = 7; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < 6; b++) {
    const a = R() * Math.PI * 2, lean = 0.12 + R() * 0.2, h = 0.13 + R() * 0.12, w = 0.009 + R() * 0.006;
    const ox = (R() - 0.5) * 0.12, oz = (R() - 0.5) * 0.12, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const base = pos.length / 3, tint = 0.85 + R() * 0.3;
    for (let s = 0; s <= 2; s++) {
      const t = s / 2, y = h * t, bend = lean * h * t * t, half = w * (1 - t * 0.85);
      for (const side of [-1, 1]) {
        pos.push(ox + dx * bend + px * half * side, y, oz + dz * bend + pz * half * side);
        col.push(0.13 + t * 0.2 * tint, 0.23 + t * 0.27 * tint, 0.07 + t * 0.06, t);      // rgb + height factor (for sway)
      }
    }
    for (let s = 0; s < 2; s++) { const v = base + s * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  // normals point up so the blades light like the lawn they grow from
  const n = new Float32Array(pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setIndex(idx);
  return g;
}

export class GrassField {
  constructor(scene, grassAt, quality = 'medium') {
    this.grassAt = grassAt;
    this.max = quality === 'low' ? 0 : quality === 'high' ? 7000 : 4000;
    this.radius = quality === 'high' ? 28 : 22;
    this.spacing = quality === 'high' ? 0.42 : 0.5;
    this.tiles = new Map();
    this.last = null;
    if (!this.max) return;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.uniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uRad: { value: this.radius } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uRad; uniform vec3 uCenter;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float fade = 1.0 - smoothstep(uRad * 0.7, uRad, distance(wp.xz, uCenter.xz));
          transformed.y *= fade;
          float k = color.a;                                           // 0 at the root, 1 at the tip
          float gust = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.5 + sin(uTime * 3.1 + wp.x * 1.3) * 0.2;
          transformed.x += gust * 0.05 * k * k; transformed.z += gust * 0.03 * k * k;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a = 1.0;');
    };
    mat.customProgramCacheKey = () => 'grass-v1';
    this.mesh = new THREE.InstancedMesh(clumpGeometry(), mat, this.max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  // clumps in one tile (computed once, kept while near)
  tile(ix, iz) {
    const key = ix * 100003 + iz; let t = this.tiles.get(key);
    if (t) return t;
    t = []; let seed = (ix * 73856093) ^ (iz * 19349663); const R = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const sp = this.spacing;
    for (let x = 0; x < TILE; x += sp) for (let z = 0; z < TILE; z += sp) {
      const wx = ix * TILE + x + (R() - 0.5) * sp, wz = iz * TILE + z + (R() - 0.5) * sp, a = this.grassAt(wx, wz);
      if (a < 0.45 || R() > a) { R(); R(); continue; }
      t.push([wx, G(wx, wz) - 0.02, wz, R() * 6.28, 0.7 + R() * 0.7 * a]);
    }
    this.tiles.set(key, t);
    if (this.tiles.size > 120) for (const k of this.tiles.keys()) { this.tiles.delete(k); if (this.tiles.size <= 80) break; }
    return t;
  }
  update(dt, pos) {
    if (!this.max) return;
    this.uniforms.uTime.value += dt; this.uniforms.uCenter.value.copy(pos);
    if (this.last && Math.hypot(pos.x - this.last.x, pos.z - this.last.z) < 1.5) return;
    this.last = { x: pos.x, z: pos.z };
    const R = this.radius, R2 = R * R, list = [];
    const i0 = Math.floor((pos.x - R) / TILE), i1 = Math.floor((pos.x + R) / TILE), j0 = Math.floor((pos.z - R) / TILE), j1 = Math.floor((pos.z + R) / TILE);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const c of this.tile(i, j)) {
      const d2 = (c[0] - pos.x) ** 2 + (c[2] - pos.z) ** 2; if (d2 < R2) list.push([d2, c]);
    }
    if (list.length > this.max) { list.sort((a, b) => a[0] - b[0]); list.length = this.max; }
    let n = 0;
    for (const [, c] of list) {
      this._q.setFromAxisAngle(this._up, c[3]); this._s.set(c[4], c[4] * (0.8 + (c[3] % 1) * 0.5), c[4]);
      this._m.compose(this._p.set(c[0], c[1], c[2]), this._q, this._s); this.mesh.setMatrixAt(n++, this._m);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }
}
