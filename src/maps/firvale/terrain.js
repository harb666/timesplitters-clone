// Ground: the real Fir Vale terrain (open elevation data), textured by a
// land-cover mask painted from the open land-use map: lawns, parks,
// playing fields and woods are grass; car parks are tarmac; scrub and waste
// ground are worn earth; the yards behind the terraces and the forecourts
// round shops and works are flagged/concrete; left-over ground is verges. Beyond the district, the real hills out
// to 8 km (Wincobank, Grenoside, the Don valley, the city) fade into haze.
import * as THREE from 'three';
import { groundHeight as G, TERRAIN } from '../../core/world.js';
import { CHUNK } from '../../models/builders.js';
import * as PB from '../../textures/pbr.js';
import { flatToPts } from './geom.js';

const GRASSY = { grass: [235, 0, 0], park: [255, 0, 0], pitch: [255, 0, 0], churchyard: [230, 20, 0], wood: [190, 110, 0], scrub: [170, 120, 0],
  allot: [150, 140, 0], rough: [60, 210, 0], tree: [200, 60, 0], play: [0, 0, 255], paved: [0, 0, 150] };

export function landMask(osm, residential, all = []) {
  const T = TERRAIN, x0 = T.x0, z0 = T.z0, w = (T.nx - 1) * T.step, h = (T.nz - 1) * T.step;
  const S = 1; // pixels per metre
  const c = document.createElement('canvas'); c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
  const g = c.getContext('2d');
  // open ground left over between the streets and the buildings is verges,
  // front lawns and scrubby grass, a bit worn in places
  g.fillStyle = 'rgb(175,55,0)'; g.fillRect(0, 0, c.width, c.height);
  const path = (P) => { g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo((x - x0) * S, (z - z0) * S) : g.moveTo((x - x0) * S, (z - z0) * S))); g.closePath(); };
  g.lineJoin = 'round';
  // flagged/concrete back yards round the terraces, forecourts round shops,
  // flats and works (a little moss and grass in the cracks)
  for (const B of all) {
    if (!B.P || B.modern || B.type === 'skip') continue;
    const wide = B.type === 'res' ? 5 : B.type === 'hospital' || B.type === 'school' ? 10 : 14;
    g.strokeStyle = g.fillStyle = 'rgb(40,10,0)';
    path(B.P); g.lineWidth = wide * S; g.stroke(); g.fill();
    if (B.yards) for (const Y of B.yards) { path(Y); g.lineWidth = 1; g.fill(); g.stroke(); }
    if (B.forecourts) for (const Y of B.forecourts) { path(Y); g.lineWidth = 1; g.fill(); g.stroke(); }
  }
  // gardens round the semis/detached houses of the estates
  for (const B of residential) if (B.modern) { path(B.P); g.strokeStyle = 'rgb(215,15,0)'; g.lineWidth = 18 * S; g.stroke(); }
  const order = ['school', 'hospital', 'paved', 'rough', 'allot', 'scrub', 'wood', 'grass', 'churchyard', 'park', 'pitch', 'tree', 'play'];
  const lu = [...osm.landuse].filter((l) => l.p.length >= 6).sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  for (const l of lu) { const col = GRASSY[l.k]; if (!col) continue; path(flatToPts(l.p)); g.fillStyle = `rgb(${col})`; g.fill(); }
  for (const f of osm.furniture) if (f.k === 'parking' && f.p.length >= 6) { path(flatToPts(f.p)); g.fillStyle = 'rgb(0,0,255)'; g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return { tex: t, x0, z0, w, h, canvas: c };
}

// MeshStandardMaterial that blends grass / earth / tarmac / yard textures by the mask.
export function groundMaterial(mask, n = 256) {
  const grass = PB.grassPBR(n), yard = PB.pavingPBR(256), tar = PB.asphaltPBR(256);
  const earth = PB.polymerSet(128, { base: [96, 80, 62], seed: 77, stipple: 1.6 });
  const mat = new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughness: 0.95, metalness: 0, vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.maskMap = { value: mask.tex }; sh.uniforms.maskRect = { value: new THREE.Vector4(mask.x0, mask.z0, 1 / mask.w, 1 / mask.h) };
    sh.uniforms.yardMap = { value: yard.map }; sh.uniforms.tarMap = { value: tar.map }; sh.uniforms.earthMap = { value: earth.map };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 maskRect; varying vec2 vMaskUv; varying vec2 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec2 wXZ = (modelMatrix * vec4(position, 1.0)).xz; vMaskUv = (wXZ - maskRect.xy) * maskRect.zw; vWorldXZ = wXZ;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D maskMap, yardMap, tarMap, earthMap; varying vec2 vMaskUv; varying vec2 vWorldXZ;')
      .replace('#include <map_fragment>', `
        vec3 m = texture2D(maskMap, vMaskUv).rgb;
        vec2 uv = vWorldXZ / 4.0;
        // break up tiling: large-scale brightness/tint variation
        float big = texture2D(earthMap, vWorldXZ / 173.0).r * 1.6 + texture2D(earthMap, vWorldXZ / 61.0).g * 0.8;
        vec3 gr = texture2D(map, uv).rgb * mix(vec3(0.82, 0.9, 0.78), vec3(1.12, 1.05, 0.92), clamp(big - 0.4, 0.0, 1.0));
        vec3 yd = texture2D(yardMap, uv * 0.6).rgb * vec3(0.78, 0.76, 0.72);
        vec3 ea = texture2D(earthMap, uv * 0.8).rgb * 1.4;
        vec3 ta = texture2D(tarMap, uv).rgb * 0.9;
        vec3 base = mix(yd, ea, 0.25 * clamp(big - 0.3, 0.0, 1.0));
        base = mix(base, ta, m.b);
        base = mix(base, ea, m.g);
        base = mix(base, gr, m.r);
        diffuseColor.rgb *= base;
      `);
  };
  return mat;
}

export function buildGround(batch, mat) {
  const T = TERRAIN, ST = T.step;
  const X0 = T.x0, Z0 = T.z0, X1 = T.x0 + (T.nx - 1) * ST, Z1 = T.z0 + (T.nz - 1) * ST;
  for (let cx = X0; cx < X1; cx += CHUNK) for (let cz = Z0; cz < Z1; cz += CHUNK) {
    const nx = Math.round(Math.min(CHUNK, X1 - cx) / ST), nz = Math.round(Math.min(CHUNK, Z1 - cz) / ST);
    if (nx < 1 || nz < 1) continue;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = cx + i * ST, z = cz + j * ST; pos.push(x, G(x, z) - 0.06, z); uv.push(x / 4, z / 4); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    batch.add(mat, g, { color: '#ffffff', chunk: [Math.floor((cx + CHUNK / 2) / CHUNK), Math.floor((cz + CHUNK / 2) / CHUNK)] });
  }
}

// The real landscape beyond the playable area, out to 8 km, with aerial
// perspective baked into the vertex colours.
export function buildFarTerrain(scene, far, haze, sunDir) {
  const bin = atob(far.d), n = far.nx * far.nz, H = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; H[i] = v / 2; }
  const T = TERRAIN, nearX0 = T.x0 + 60, nearX1 = T.x0 + (T.nx - 1) * T.step - 60, nearZ0 = T.z0 + 60, nearZ1 = T.z0 + (T.nz - 1) * T.step - 60;
  const pos = [], col = [], idx = [];
  const hz = new THREE.Color(haze), c = new THREE.Color();
  const urban = new THREE.Color(0x7d766c), green = new THREE.Color(0x5f7349), wood = new THREE.Color(0x3f5234), roofs = new THREE.Color(0x8a6f63);
  const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi; const a = hash(xi, zi), b = hash(xi + 1, zi), cc = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); return a * (1 - u) * (1 - v) + b * u * (1 - v) + cc * (1 - u) * v + d * u * v; };
  for (let j = 0; j < far.nz; j++) for (let i = 0; i < far.nx; i++) {
    const x = far.x0 + i * far.step, z = far.z0 + j * far.step, d = Math.hypot(x, z);
    let y = H[j * far.nx + i];
    // blend into the detailed terrain at the edge of the district
    const inside = x > nearX0 - 200 && x < nearX1 + 200 && z > nearZ0 - 200 && z < nearZ1 + 200;
    if (inside) y = Math.min(y, G(x, z)) - 2.5;
    pos.push(x, y - 1, z);
    const nU = noise(x / 900, z / 900), nW = noise(x / 400 + 7, z / 400 + 3), nR = noise(x / 150, z / 150);
    c.copy(urban).lerp(roofs, nR * 0.5);
    if (nU > 0.55) c.lerp(green, Math.min(1, (nU - 0.55) * 4));
    if (nW > 0.7 && nU > 0.45) c.lerp(wood, 0.8);
    if (y > 150) c.lerp(green, 0.5);                            // higher ground: more fields and woods
    const k = 1 - Math.exp(-Math.max(0, d - 250) / 2600);          // aerial perspective
    col.push(c.r, c.g, c.b, k);
  }
  for (let j = 0; j < far.nz - 1; j++) for (let i = 0; i < far.nx - 1; i++) {
    const x = far.x0 + (i + 0.5) * far.step, z = far.z0 + (j + 0.5) * far.step;
    if (x > nearX0 && x < nearX1 && z > nearZ0 && z < nearZ1) continue; // detailed terrain covers this
    const a = j * far.nx + i, b = a + far.nx;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // bake simple sun shading, then haze (unlit material: the colours are final)
  const N = g.attributes.normal, out = new Float32Array(n * 3), sd = sunDir.clone().normalize();
  for (let i = 0; i < n; i++) {
    const sh = 0.62 + 0.5 * Math.max(0, N.getX(i) * sd.x + N.getY(i) * sd.y + N.getZ(i) * sd.z);
    c.setRGB(col[i * 4] * sh, col[i * 4 + 1] * sh, col[i * 4 + 2] * sh).lerp(hz, Math.min(0.9, col[i * 4 + 3]));
    out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = -0.5;
  scene.add(m);
  return m;
}
