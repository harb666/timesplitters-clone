// Everyday vehicles of a Sheffield street, built from real-proportion side
// profiles (not boxes): hatchbacks, saloons, estates, SUVs, panel vans and
// single-deck buses. Curved bonnet/roof lines, wheel-arch cut-outs,
// tumblehome glasshouse, pillars, bumpers, grilles, lights, mirrors,
// alloy wheels and UK number plates. Generic shapes, invented badges and
// plates, no real brands.
//
// vehicleParts() returns geometry per material in the vehicle's own frame
// (+Z forward, ground at y = 0) so the same model can be merged into the
// static scenery (parked cars) or assembled as a moving vehicle (traffic).
import * as THREE from 'three';
import { glowTexture, blobShadowTexture } from '../textures/procedural.js';

// ---------------------------------------------------------------- materials
let MATS = null;
export function vehicleMaterials() {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  MATS = {
    paint: std({ roughness: 0.28, metalness: 0.55, envMapIntensity: 1.25, name: 'vehPaint' }),
    glass: std({ roughness: 0.04, metalness: 0.2, envMapIntensity: 1.6, name: 'vehGlass' }),
    trim: std({ roughness: 0.7, metalness: 0.05, name: 'vehTrim' }),
    chrome: std({ roughness: 0.18, metalness: 1, name: 'vehChrome' }),
    tyre: std({ roughness: 0.92, name: 'vehTyre' }),
    rim: std({ map: alloyTexture(), roughness: 0.3, metalness: 0.85, name: 'vehRim' }),
    lightF: std({ roughness: 0.1, metalness: 0.4, emissive: 0x3a3830, name: 'vehLightF' }),
    lightR: std({ roughness: 0.2, emissive: 0x2a0000, name: 'vehLightR' }),
    plate: std({ map: plateAtlas(), roughness: 0.45, name: 'vehPlate' }),
    livery: std({ map: busLivery(), roughness: 0.35, metalness: 0.2, name: 'vehLivery' }),
  };
  return MATS;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// 4 alloy wheel designs side by side
function alloyTexture() {
  const [c, g] = canvas(512, 128);
  for (let v = 0; v < 4; v++) {
    const cx = v * 128 + 64, cy = 64;
    g.fillStyle = '#1a1a1a'; g.fillRect(v * 128, 0, 128, 128);
    const grd = g.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, 62); grd.addColorStop(0, '#f2f4f6'); grd.addColorStop(1, v === 3 ? '#3a3d42' : '#9aa1a8');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 60, 0, 7); g.fill();
    g.fillStyle = '#16181a';
    const n = [5, 10, 6, 5][v];
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + Math.PI / n;
      g.save(); g.translate(cx, cy); g.rotate(a); g.beginPath();
      if (v === 1) { g.moveTo(18, -4); g.lineTo(54, -7); g.lineTo(54, 7); g.lineTo(18, 4); }
      else if (v === 2) { g.moveTo(20, -9); g.lineTo(52, -14); g.lineTo(52, 14); g.lineTo(20, 9); }
      else { g.moveTo(18, -8); g.lineTo(54, -20); g.lineTo(54, 20); g.lineTo(18, 8); }
      g.fill(); g.restore();
    }
    if (v === 0) { g.strokeStyle = '#7d848b'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 56, 0, 7); g.stroke(); } // steel-look rim lip
    g.fillStyle = '#c9ced3'; g.beginPath(); g.arc(cx, cy, 13, 0, 7); g.fill();
    g.fillStyle = '#555'; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 2.5, 0, 7); g.fill(); }
  }
  return tex(c);
}

// UK plates: white front / yellow rear, 16 invented registrations in an atlas
const PLATES = [];
function plateAtlas() {
  const [c, g] = canvas(1024, 256);
  const L = 'ABCDEFGHJKLMNOPRSTUVWXYZ', rnd = mulberry(42);
  const pick = () => L[(rnd() * L.length) | 0];
  for (let i = 0; i < 16; i++) {
    const age = [15, 65, 16, 66, 17, 67, 18, 68, 19, 69, 20, 70, 21, 71, 22, 72, 23, 73, 24, 74][(rnd() * 20) | 0];
    const reg = `Y${'ABCDEFGHJKLMNOPRSTUVWXY'[(rnd() * 23) | 0]}${String(age).padStart(2, '0')} ${pick()}${pick()}${pick()}`;
    PLATES.push(reg);
    for (const rear of [0, 1]) {
      const x = (i % 8) * 128, y = Math.floor(i / 8) * 64 + rear * 128;
      g.fillStyle = rear ? '#f5c518' : '#f5f5f1'; g.fillRect(x + 1, y + 1, 126, 30);
      g.fillStyle = '#1d4f9c'; g.fillRect(x + 1, y + 1, 10, 30);                       // side band
      g.fillStyle = '#fff'; g.font = 'bold 6px Arial'; g.fillText('UK', x + 2, y + 27);
      g.fillStyle = '#111'; g.font = 'bold 21px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(reg, x + 69, y + 17, 110); g.textAlign = 'left';
    }
  }
  return tex(c);
}

// single-deck bus livery (invented operator "Vale Travel")
function busLivery() {
  const [c, g] = canvas(512, 128);
  const grd = g.createLinearGradient(0, 0, 512, 0); grd.addColorStop(0, '#0f4c81'); grd.addColorStop(1, '#1b7fc4');
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = grd; g.fillRect(0, 70, 512, 58);
  g.fillStyle = '#f0b400'; g.beginPath(); g.moveTo(0, 70); g.bezierCurveTo(180, 40, 330, 100, 512, 60); g.lineTo(512, 70); g.bezierCurveTo(330, 110, 180, 50, 0, 80); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.fillText('Vale Travel', 30, 112);
  g.font = 'bold 14px Arial'; g.fillText('Fir Vale · Firth Park · City Centre', 250, 110);
  return tex(c);
}
// atlas cell [u0, v0, u1, v1] of plate i (front or rear)
function plateUV(i, rear) { i = ((i % 16) + 16) % 16; const x = (i % 8) * 128, y = Math.floor(i / 8) * 64 + rear * 128; return [x / 1024, 1 - (y + 32) / 256, (x + 128) / 1024, 1 - y / 256]; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- shapes
// Extrude a side profile ([z, y] points) across the width.
function sideExtrude(pts, width, { bevel = 0.05, curve = 6, round = null } = {}) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const w = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 2, curveSegments: curve });
  g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0);
  if (round) {
    // round the plan view at the nose and tail, and pull the sides in towards
    // the top (tumblehome), so it isn't a box
    const p = g.attributes.position, hl = round.hL, sh = round.shoulder ?? 0.5, top = round.top ?? 1.5;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), y = p.getY(i), e = Math.max(0, (Math.abs(z) - (hl - 0.55)) / 0.55);
      let k = 1 - 0.13 * e * e;
      if (y > sh) k *= 1 - 0.07 * Math.min(1, (y - sh) / (top - sh));
      p.setX(i, p.getX(i) * k);
    }
    g.computeVertexNormals();
  }
  g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function arch(out, zc, r, ra, y0, seg = 7) {
  out.push([zc - ra, y0], [zc - ra, r]);
  for (let i = 1; i < seg; i++) { const t = Math.PI - i / seg * Math.PI; out.push([zc + Math.cos(t) * ra, r + Math.sin(t) * ra]); }
  out.push([zc + ra, r], [zc + ra, y0]);
}
// a bar between two profile points, on one side of the car
function bar(p0, p1, x, thick, deep) {
  const dz = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dz, dy);
  const g = new THREE.BoxGeometry(deep, thick, L + thick * 0.5);
  g.rotateX(-Math.atan2(dy, dz)); g.translate(x, (p0[1] + p1[1]) / 2, (p0[0] + p1[0]) / 2);
  return g;
}
function quad(w, h, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); return g;
}
const place = (g, x, y, z, ry = 0, rx = 0, rz = 0) => { if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

// ---------------------------------------------------------------- types
const TYPES = {
  hatch:  { L: 4.05, W: 1.76, H: 1.47, wb: 2.52, r: 0.31, y0: 0.17, belt: 0.95, bonnet: 0.78, zA: 0.62, zWs: -0.28, zRoof: -1.45, tail: 'hatch' },
  saloon: { L: 4.65, W: 1.8, H: 1.45, wb: 2.75, r: 0.32, y0: 0.16, belt: 0.93, bonnet: 0.74, zA: 0.78, zWs: -0.02, zRoof: -0.95, tail: 'boot' },
  estate: { L: 4.7, W: 1.8, H: 1.5, wb: 2.75, r: 0.32, y0: 0.16, belt: 0.95, bonnet: 0.75, zA: 0.8, zWs: 0.0, zRoof: -2.05, tail: 'estate' },
  suv:    { L: 4.45, W: 1.85, H: 1.68, wb: 2.65, r: 0.36, y0: 0.24, belt: 1.08, bonnet: 0.92, zA: 0.72, zWs: -0.12, zRoof: -1.85, tail: 'estate' },
  van:    { L: 5.3, W: 2.0, H: 2.3, wb: 3.3, r: 0.34, y0: 0.2, belt: 1.12, bonnet: 1.0, zA: 1.45, zWs: 0.95, zRoof: -2.6, tail: 'van' },
  bus:    { L: 11.6, W: 2.5, H: 3.1, wb: 5.9, r: 0.5, y0: 0.3, belt: 1.25, bonnet: 1.2, zA: 5.7, zWs: 5.6, zRoof: -5.7, tail: 'bus', zOff: -0.9 },
};
export const GLASS = '#1d252c';
export const PAINT_UK = ['#f2f2ef', '#e9eaea', '#111214', '#1c1d20', '#6f757b', '#8e959c', '#b5bbc0', '#c9cdd0', '#1d3f7a', '#2a5db0', '#7a1d1d', '#b71c1c', '#2f4f3a', '#3a3f55', '#8a6a3a', '#d8d2c2'];
export const TYPE_MIX = [['hatch', 0.36], ['saloon', 0.14], ['estate', 0.12], ['suv', 0.26], ['van', 0.12]];
export function pickType(R) { let u = R(); for (const [t, p] of TYPE_MIX) { if ((u -= p) <= 0) return t; } return 'hatch'; }

// Returns { parts: [{ mat, geo, color }], wheels: [{ x, y, z, r, w }], dims }
export function vehicleParts(type, { paint = '#8e959c', plate = 0, alloy = 0 } = {}) {
  const T = TYPES[type] || TYPES.hatch;
  const { L, W, H, wb, r, y0, belt, bonnet, zA, zWs, zRoof } = T, zo = T.zOff || 0.05;
  const parts = [], add = (mat, geo, color) => parts.push({ mat, geo, color });
  const zF = wb / 2 + zo, zR = -wb / 2 + zo, ra = r + 0.05, hL = L / 2;
  const trim = '#1b1c1e';

  if (type === 'bus') { const b = busParts(T, add, paint, plate, alloy); return { parts, wheels: b.wheels, dims: b.dims }; }

  // ---- lower body profile (bumpers, bonnet, flanks, wheel arches) ----
  const lower = [];
  lower.push([hL - 0.16, y0 + 0.06], [hL - 0.04, 0.24], [hL, 0.4], [hL - 0.01, bonnet - 0.12], [hL - 0.05, bonnet - 0.03], [hL - 0.16, bonnet], [hL - 0.5, bonnet + 0.035]);
  if (T.tail === 'van') lower.push([zA, bonnet + 0.05], [zA - 0.05, belt]);
  else lower.push([(zA + hL - 0.5) / 2, bonnet + (belt - bonnet) * 0.45], [zA + 0.25, bonnet + (belt - bonnet) * 0.8], [zA, belt]);
  if (T.tail === 'boot') lower.push([-hL + 0.45, belt + 0.07], [-hL + 0.12, belt + 0.05], [-hL + 0.02, belt - 0.05], [-hL, 0.62]);
  else if (T.tail === 'van') lower.push([-hL + 0.02, H - 0.08], [-hL, 0.6]);
  else lower.push([-hL + 0.1, belt + 0.02], [-hL + 0.02, belt - 0.1], [-hL, 0.62]);
  lower.push([-hL + 0.02, 0.3], [-hL + 0.12, y0 + 0.06]);
  arch(lower, zR, r, ra, y0); arch(lower, zF, r, ra, y0);
  if (T.tail === 'van') {
    // van: the whole silhouette is one pressed-steel body
    const body = [[hL - 0.14, y0 + 0.08], [hL, 0.38], [hL - 0.03, bonnet - 0.05], [hL - 0.25, bonnet + 0.02], [zA, bonnet + 0.12], [zWs, H - 0.12], [zWs - 0.3, H], [-hL + 0.05, H], [-hL, H - 0.05], [-hL, 0.55], [-hL + 0.1, y0 + 0.08]];
    arch(body, zR, r, ra, y0); arch(body, zF, r, ra, y0);
    add('paint', sideExtrude(body, W, { bevel: 0.06 }), paint);
    // windscreen + cab side windows
    const ws = bar([zA, bonnet + 0.14], [zWs, H - 0.14], 0, 0.02, W - 0.16); add('glass', ws, GLASS);
    for (const sx of [-1, 1]) {
      const g = quad(0.9, 0.62); place(g, sx * (W / 2 + 0.005), belt + 0.42, zWs - 0.2, sx * Math.PI / 2); add('glass', g, GLASS);
      add('trim', place(new THREE.BoxGeometry(0.02, 0.05, L - 1.6), sx * (W / 2 + 0.01), 1.0, -0.6), trim); // side rubbing strip
    }
  } else {
    add('paint', sideExtrude(lower, W, { bevel: 0.07, round: { hL, shoulder: belt * 0.6, top: belt + 0.1 } }), paint);
    // ---- glasshouse (tumblehome) ----
    const Wg = W - 0.2, gh = [[zA, belt], [zWs, H - 0.02]];
    gh.push([zWs - 0.25, H], [(zWs + zRoof) / 2, H + 0.005], [zRoof + 0.15, H - 0.02]);
    if (T.tail === 'hatch') gh.push([zRoof - 0.12, H - 0.08], [-hL + 0.14, belt + 0.03]);
    else if (T.tail === 'boot') gh.push([zRoof - 0.35, belt + 0.1]);
    else gh.push([zRoof - 0.05, H - 0.06], [-hL + 0.04, belt + 0.04]);
    add('glass', sideExtrude(gh, Wg, { bevel: 0.04, round: { hL, shoulder: belt, top: H } }), GLASS);
    // roof skin
    const roof = [[zWs - 0.06, H - 0.035], [zWs - 0.25, H + 0.012], [(zWs + zRoof) / 2, H + 0.018], [zRoof + 0.12, H - 0.012], [zRoof + 0.12, H - 0.045]];
    add('paint', sideExtrude(roof, Wg + 0.03, { bevel: 0.015, round: { hL, shoulder: belt, top: H } }), paint);
    // pillars (A, B, C/D) on both sides + screen surrounds
    const last = gh[gh.length - 1], preLast = gh[gh.length - 2];
    for (const sx of [-1, 1]) {
      const x = sx * (Wg / 2 * 0.95 + 0.01);
      add('paint', bar([zA, belt], [zWs, H - 0.02], x, 0.07, 0.05), paint);                                  // A pillar
      const zB = (zA + zRoof) / 2 + (T.tail === 'boot' ? 0.2 : 0.05);
      add('trim', bar([zB, belt], [zB - 0.04, H - 0.03], x, 0.1, 0.045), trim);                             // B pillar
      if (T.tail === 'hatch') { add('paint', bar(preLast, last, x, 0.07, 0.05), paint); const zc = zRoof + 0.2; add('paint', bar([zc + 0.25, belt], [zc, H - 0.04], x, 0.16, 0.045), paint); }
      else if (T.tail === 'boot') add('paint', bar([zRoof + 0.12, H - 0.03], [zRoof - 0.35, belt + 0.1], x, 0.07, 0.05), paint);
      else { const zC = zRoof + 0.55; add('trim', bar([zC, belt], [zC - 0.05, H - 0.04], x, 0.08, 0.045), trim); add('paint', bar(preLast, last, x, 0.07, 0.05), paint); }
      add('trim', place(new THREE.BoxGeometry(0.018, 0.035, zA - (T.tail === 'boot' ? -hL + 0.35 : -hL + 0.15)), x + sx * 0.03, belt - 0.01, (zA + (T.tail === 'boot' ? -hL + 0.35 : -hL + 0.15)) / 2), trim); // window seal
      // mirror
      const m = place(new THREE.BoxGeometry(0.18, 0.12, 0.1), sx * (W / 2 + 0.07), belt + 0.08, zA - 0.08); add('paint', m, paint);
      add('glass', place(quad(0.14, 0.09), sx * (W / 2 + 0.07), belt + 0.08, zA - 0.132, Math.PI), '#9aa3ab');
      // door shut lines + handles
      for (const zd of [zA - 0.05, zB, T.tail === 'hatch' ? null : zB - 1.0].filter((v) => v !== null)) add('trim', place(new THREE.BoxGeometry(0.01, belt - 0.32, 0.012), sx * (W / 2 + 0.005), (belt + 0.28) / 2 + 0.03, zd), trim);
      add('chrome', place(new THREE.BoxGeometry(0.02, 0.025, 0.16), sx * (W / 2 + 0.012), belt - 0.12, zB - 0.25), '#ffffff');
      add('chrome', place(new THREE.BoxGeometry(0.02, 0.025, 0.16), sx * (W / 2 + 0.012), belt - 0.12, zA - 0.3), '#ffffff');
      // side skirt
      add('trim', place(new THREE.BoxGeometry(0.03, 0.08, zF - zR - ra * 2 - 0.1), sx * (W / 2 - 0.01), y0 + 0.06, (zF + zR) / 2), trim);
    }
  }
  // ---- front: grille, lights, bumper, plate, badge ----
  const fz = hL + 0.005;
  add('trim', place(new THREE.BoxGeometry(W * 0.55, type === 'van' ? 0.28 : 0.18, 0.04), 0, type === 'van' ? bonnet - 0.2 : bonnet - 0.2, fz - 0.03), trim);
  add('trim', place(new THREE.BoxGeometry(W * 0.7, 0.12, 0.05), 0, 0.3, fz - 0.06), trim);         // lower intake
  for (const sx of [-1, 1]) {
    const hl = quad(W * 0.22, type === 'van' ? 0.2 : 0.12); place(hl, sx * W * 0.33, bonnet - 0.1, fz - 0.03, sx * 0.3); add('lightF', hl, '#dfe6ec');
    add('trim', place(new THREE.BoxGeometry(0.1, 0.06, 0.04), sx * W * 0.4, 0.32, fz - 0.05), '#26282b');  // fog light surround
  }
  add('plate', place(quad(0.52, 0.12, ...plateUV(plate, 0)), 0, 0.42, fz + 0.01), '#ffffff');
  add('chrome', place(new THREE.CircleGeometry(0.045, 10), 0, bonnet - 0.2, fz + 0.001), '#ffffff');
  // ---- rear: tail lights, plate, bumper ----
  const bz = -hL - 0.005, rearY = T.tail === 'boot' ? belt - 0.08 : T.tail === 'van' ? 1.1 : belt - 0.06;
  for (const sx of [-1, 1]) {
    const tl = quad(type === 'van' ? 0.14 : W * 0.2, type === 'van' ? 0.5 : 0.12); place(tl, sx * W * (type === 'van' ? 0.45 : 0.36), rearY, bz, Math.PI + sx * 0.2); add('lightR', tl, '#ffffff');
  }
  add('trim', place(new THREE.BoxGeometry(W * 0.94, 0.14, 0.06), 0, 0.36, bz + 0.03), trim);
  add('plate', place(quad(0.52, 0.12, ...plateUV(plate, 1)), 0, T.tail === 'van' ? 0.55 : 0.62, bz - 0.005, Math.PI), '#ffffff');
  if (type !== 'van') add('lightR', place(new THREE.BoxGeometry(0.4, 0.03, 0.02), 0, T.tail === 'boot' ? belt + 0.12 : H - 0.06, T.tail === 'boot' ? zRoof - 0.33 : -hL + 0.18), '#ffffff'); // high brake light
  if (type === 'estate' || type === 'suv') for (const sx of [-1, 1]) add('trim', place(new THREE.BoxGeometry(0.04, 0.04, -zRoof + zWs - 0.3), sx * (W / 2 - 0.2), H + 0.035, (zRoof + zWs) / 2), '#2a2b2e'); // roof rails
  // ---- wheel wells ----
  for (const zc of [zF, zR]) add('trim', place(new THREE.BoxGeometry(W - 0.3, ra * 1.1, ra * 2), 0, r + 0.08, zc), '#0c0c0d');
  const wheels = [];
  for (const sx of [-1, 1]) for (const zc of [zF, zR]) wheels.push({ x: sx * (W / 2 - 0.13), y: r, z: zc, r, w: type === 'van' ? 0.22 : 0.21, alloy });
  return { parts, wheels, dims: { L, W, H } };
}

function busParts(T, add, paint, plate, alloy) {
  const { L, W, H, wb, r, y0 } = T, hL = L / 2, zo = T.zOff, zF = hL - 2.6, zR = zF - wb, ra = r + 0.08;
  const body = [[hL - 0.1, y0 + 0.05], [hL, 0.5], [hL, H - 0.35], [hL - 0.2, H], [-hL + 0.15, H], [-hL, H - 0.25], [-hL, y0 + 0.1]];
  arch(body, zR, r, ra, y0, 8); arch(body, zF, r, ra, y0, 8);
  const g = sideExtrude(body, W, { bevel: 0.08, curve: 4 });
  // livery via side UVs: map z to u, y to v
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  g.computeVertexNormals();
  for (let i = 0; i < p.count; i++) { const u = (p.getZ(i) + hL) / L; uv.setXY(i, p.getX(i) > 0 ? 1 - u : u, Math.min(1, Math.max(0, p.getY(i) / 1.3 * 0.55))); }
  void n; void zo;
  add('livery', g, '#ffffff');
  // window band both sides + front screen + destination blind
  for (const sx of [-1, 1]) add('glass', place(quad(L - 1.6, 1.25), sx * (W / 2 + 0.012), 2.1, -0.4, sx * Math.PI / 2), GLASS);
  add('glass', place(quad(W - 0.2, 1.6), 0, 1.95, hL + 0.012), GLASS);
  add('lightF', place(quad(W - 0.5, 0.25), 0, H - 0.22, hL + 0.015), '#ffb000');
  add('trim', place(new THREE.BoxGeometry(W - 0.1, 0.3, 0.06), 0, 0.42, hL - 0.01), '#1b1c1e');
  for (const sx of [-1, 1]) { add('lightF', place(quad(0.3, 0.14), sx * (W / 2 - 0.3), 0.72, hL + 0.012), '#ffffff'); add('lightR', place(quad(0.2, 0.5), sx * (W / 2 - 0.2), 1.0, -hL - 0.012, Math.PI), '#ffffff'); }
  add('plate', place(quad(0.52, 0.12, ...plateUV(plate, 0)), 0, 0.62, hL + 0.03), '#ffffff');
  add('glass', place(quad(W - 0.4, 0.9), 0, 2.2, -hL - 0.012, Math.PI), GLASS);
  for (const zc of [zF, zR]) add('trim', place(new THREE.BoxGeometry(W - 0.4, ra * 1.1, ra * 2), 0, r + 0.1, zc), '#0c0c0d');
  const wheels = [];
  for (const sx of [-1, 1]) for (const zc of [zF, zR]) wheels.push({ x: sx * (W / 2 - 0.18), y: r, z: zc, r, w: 0.3, alloy: 0 });
  return { parts: [], busParts: true, wheels, dims: { L, W, H } };
}

// wheel geometry: tyre (with rounded shoulders) + alloy face on the outer side
let WG = null;
export function wheelGeos() {
  if (WG) return WG;
  const prof = [[0.64, -0.5], [0.93, -0.48], [1, -0.28], [1, 0.28], [0.93, 0.48], [0.64, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = new THREE.LatheGeometry(prof, 12); tyre.rotateZ(Math.PI / 2);
  const face = new THREE.CircleGeometry(0.66, 12); face.rotateY(Math.PI / 2);
  WG = { tyre, face };
  return WG;
}
// place a wheel's geometry (unit radius/width scaled) -> {tyre, face} geometries in vehicle space
export function wheelParts(w, spin = 0) {
  const { tyre, face } = wheelGeos();
  const side = Math.sign(w.x) || 1;
  const t = tyre.clone(); t.scale(w.w, w.r, w.r);
  const f = face.clone(); f.scale(1, w.r, w.r);
  if (side < 0) f.rotateY(Math.PI);
  // pick the alloy design from the atlas
  const uv = f.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (w.alloy + (side < 0 ? 1 - uv.getX(i) : uv.getX(i))) / 4);
  if (spin) { t.rotateX(spin); f.rotateX(spin); }
  t.translate(w.x, w.y, w.z); f.translate(w.x + side * (w.w / 2 + 0.002), w.y, w.z);
  return { tyre: t, face: f };
}

// ---------------------------------------------------------------- assembly
function colorize(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g.index ? g.toNonIndexed() : g;
}
function mergeList(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [k, s] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    const a = new Float32Array(n * s); let o = 0;
    for (const g of list) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, s));
  }
  return out;
}

// Parked vehicle: add its parts to a StaticBatch at (x, gy, z) facing ry.
export function addParkedVehicle(batch, x, gy, z, ry, type, opts, detail = true) {
  const M = vehicleMaterials(), V = vehicleParts(type, opts);
  const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, gy, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  for (const p of V.parts) { p.geo.applyMatrix4(m4); batch.add(M[p.mat], p.geo, { color: p.color, detail }); }
  for (const w of V.wheels) { const { tyre, face } = wheelParts(w, Math.random() * 6); tyre.applyMatrix4(m4); face.applyMatrix4(m4); batch.add(M.tyre, tyre, { color: '#1c1c1c', detail }); batch.add(M.rim, face, { color: '#ffffff', detail }); }
  return V.dims;
}

// Moving vehicle: same interface as buildFalconR (car, body, wheels, lights...).
export function buildVehicle(type, { paint, plate = (Math.random() * 16) | 0, alloy = (Math.random() * 4) | 0 } = {}) {
  const M = vehicleMaterials();
  const V = vehicleParts(type, { paint: paint ?? PAINT_UK[(Math.random() * PAINT_UK.length) | 0], plate, alloy });
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);
  const byMat = new Map();
  for (const p of V.parts) { if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat).push(colorize(p.geo, p.color)); }
  let tailMat = null;
  for (const [k, list] of byMat) {
    let mat = M[k];
    if (k === 'lightR') { tailMat = mat.clone(); tailMat.emissive = new THREE.Color(0x2a0000); mat = tailMat; }
    const mesh = new THREE.Mesh(mergeList(list), mat); mesh.castShadow = k !== 'glass'; body.add(mesh);
  }
  if (!tailMat) tailMat = M.lightR.clone();
  const wheels = [];
  for (const w of V.wheels) {
    const grp = new THREE.Group(); grp.position.set(w.x, w.y, w.z);
    const { tyre, face } = wheelParts({ ...w, x: Math.sign(w.x) * 1e-5, y: 0, z: 0 }, 0);
    grp.add(new THREE.Mesh(colorize(tyre, '#1c1c1c'), M.tyre), new THREE.Mesh(colorize(face, '#ffffff'), M.rim));
    car.add(grp); wheels.push(grp);
  }
  const glow = glowTexture();
  const brakeGlowMat = new THREE.SpriteMaterial({ map: glow, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const hL = V.dims.L / 2;
  for (const sx of [-1, 1]) { const s = new THREE.Sprite(brakeGlowMat); s.scale.set(0.8, 0.5, 1); s.position.set(sx * V.dims.W * 0.36, 0.9, -hL - 0.1); body.add(s); }
  const flameMat = new THREE.SpriteMaterial({ map: glow, color: 0xff9030, transparent: true, opacity: 0, depthWrite: false });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(V.dims.W + 0.8, V.dims.L + 0.8), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04; car.add(sh);
  const paintMat = M.paint;
  return { car, body, wheels, tailMat, brakeGlowMat, flameMat, flames: [], headL: null, headR: null, paintMat, dims: V.dims, type };
}

// ---------------------------------------------------------------- parked fleet
// Thousands of parked vehicles without the memory cost: each model variant
// is built once and drawn instanced; only the ones near the player are put
// in the instance buffers (refreshed a few times a second).
export class ParkedFleet {
  constructor(scene, { range = 90, variants = 2 } = {}) { this.scene = scene; this.range = range; this.variants = variants; this.list = []; this.models = new Map(); }
  add(x, y, z, ry, type, paint) {
    const v = this.list.length % this.variants, key = type + v;
    this.list.push({ x, y, z, ry, key, paint: new THREE.Color(paint) });
    return TYPES[type] ? { L: TYPES[type].L, W: TYPES[type].W, H: TYPES[type].H } : { L: 4, W: 1.8, H: 1.5 };
  }
  build() {
    const M = vehicleMaterials(), count = new Map();
    for (const c of this.list) count.set(c.key, (count.get(c.key) || 0) + 1);
    for (const [key, n] of count) {
      const type = key.slice(0, -1), v = +key.slice(-1);
      const V = vehicleParts(type, { paint: '#ffffff', plate: 3 + v * 7, alloy: (v * 2 + type.length) % 4 });
      const byMat = new Map();
      for (const p of V.parts) { if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat).push(colorize(p.geo, p.color)); }
      for (const w of V.wheels) { const { tyre, face } = wheelParts(w, 0.7 * v); if (!byMat.has('tyre')) byMat.set('tyre', []); if (!byMat.has('rim')) byMat.set('rim', []); byMat.get('tyre').push(colorize(tyre, '#1c1c1c')); byMat.get('rim').push(colorize(face, '#ffffff')); }
      const meshes = [];
      const cap = Math.min(n, 160);
      for (const [k, list] of byMat) {
        const mesh = new THREE.InstancedMesh(mergeList(list), M[k], cap);
        mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = k === 'paint' || k === 'trim'; mesh.receiveShadow = true;
        if (k === 'paint') { mesh.setColorAt(0, new THREE.Color(1, 1, 1)); }
        this.scene.add(mesh); meshes.push({ k, mesh });
      }
      this.models.set(key, { meshes, cap, members: this.list.filter((c) => c.key === key) });
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._up = new THREE.Vector3(0, 1, 0);
  }
  update(pos) {
    const R2 = this.range * this.range;
    for (const m of this.models.values()) {
      let n = 0;
      for (const c of m.members) {
        if (n >= m.cap) break;
        const dx = c.x - pos.x, dz = c.z - pos.z; if (dx * dx + dz * dz > R2) continue;
        this._q.setFromAxisAngle(this._up, c.ry); this._m.compose(this._p.set(c.x, c.y, c.z), this._q, this._s);
        for (const { k, mesh } of m.meshes) { mesh.setMatrixAt(n, this._m); if (k === 'paint') mesh.setColorAt(n, c.paint); }
        n++;
      }
      for (const { mesh } of m.meshes) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    }
  }
}
