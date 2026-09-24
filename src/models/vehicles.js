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
    lightF: std({ map: frontLights(), roughness: 0.08, metalness: 0.3, emissive: 0x2a2824, name: 'vehLightF' }),
    lightR: std({ map: rearLights(), roughness: 0.15, emissive: 0x2a0000, name: 'vehLightR' }),
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

// Headlight units (projector, reflector, LED daytime-running strip), left and
// right in the top half; bus destination display in the bottom right.
function frontLights() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#141517'; g.fillRect(0, 0, 256, 128);
  for (const side of [0, 1]) {
    g.save(); if (side) { g.translate(256, 0); g.scale(-1, 1); }
    const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#e9eef2'); grd.addColorStop(1, '#8d969d');
    g.fillStyle = grd; g.beginPath(); g.moveTo(4, 12); g.lineTo(120, 4); g.lineTo(124, 40); g.lineTo(30, 60); g.lineTo(6, 52); g.closePath(); g.fill();
    for (const [x, rr] of [[36, 15], [84, 13]]) { const rg = g.createRadialGradient(x - 3, 28, 1, x, 30, rr); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.5, '#c9d4dc'); rg.addColorStop(1, '#5c666e'); g.fillStyle = rg; g.beginPath(); g.arc(x, 30, rr, 0, 7); g.fill(); }
    g.strokeStyle = '#f4fbff'; g.lineWidth = 4; g.beginPath(); g.moveTo(10, 50); g.lineTo(34, 56); g.lineTo(118, 36); g.stroke();   // DRL strip
    g.fillStyle = '#e39a1a'; g.fillRect(104, 12, 14, 8);                                                                         // indicator
    g.restore();
  }
  g.fillStyle = '#0a0a0a'; g.fillRect(128, 64, 128, 64);
  g.fillStyle = '#ffb000'; g.font = 'bold 22px Arial'; g.fillText('75', 134, 104); g.font = 'bold 12px Arial'; g.fillText('City Centre', 168, 92); g.fillText('via Fir Vale', 168, 108);
  return tex(c);
}
// Tail light clusters (red with reversing lamp and indicator), both sides.
function rearLights() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#240404'; g.fillRect(0, 0, 256, 128);
  for (const side of [0, 1]) {
    g.save(); if (side) { g.translate(256, 0); g.scale(-1, 1); }
    const grd = g.createLinearGradient(0, 64, 0, 128); grd.addColorStop(0, '#b3140f'); grd.addColorStop(1, '#6d0806');
    g.fillStyle = grd; g.fillRect(2, 66, 124, 60);
    g.strokeStyle = '#ff5a48'; g.lineWidth = 5; g.beginPath(); g.moveTo(10, 78); g.lineTo(118, 74); g.lineTo(118, 110); g.stroke();   // LED outline
    g.fillStyle = '#e8e8e8'; g.fillRect(14, 100, 30, 16);                                                                          // reversing lamp
    g.fillStyle = '#d9861a'; g.fillRect(52, 102, 26, 12);                                                                          // indicator
    g.restore();
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

// double-deck bus livery (invented operator "Vale Travel"): v runs up the
// whole height of the bus, u along its length
function busLivery() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#eef0f0'; g.fillRect(0, 0, 1024, 256);
  const grd = g.createLinearGradient(0, 0, 1024, 0); grd.addColorStop(0, '#0f4c81'); grd.addColorStop(1, '#1b7fc4');
  g.fillStyle = grd; g.fillRect(0, 256 - 70, 1024, 70);                                     // skirt up to ~1.15 m
  g.fillStyle = '#f0b400'; g.beginPath(); g.moveTo(0, 186); g.bezierCurveTo(360, 150, 640, 205, 1024, 160); g.lineTo(1024, 172); g.bezierCurveTo(640, 217, 360, 162, 0, 198); g.fill();
  g.fillStyle = '#0f4c81'; g.fillRect(0, 118, 1024, 10);                                     // between-decks band
  g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.fillText('Vale Travel', 60, 244);
  g.font = 'bold 18px Arial'; g.fillText('Fir Vale · Firth Park · City Centre', 560, 240);
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

// ---------------------------------------------------------------- models
// Templates taken from the real dimensions and silhouettes of the cars you
// actually see parked on Fir Vale's streets (generic, unbadged):
//   mini   – Fiesta/Corsa-size supermini      3.97 x 1.72 x 1.48, wb 2.49
//   hatch  – Golf/Focus-size family hatch     4.26 x 1.80 x 1.45, wb 2.64
//   taxi   – Prius-style hybrid liftback      4.54 x 1.76 x 1.47, wb 2.70 (private hire)
//   saloon – Octavia-style liftback saloon    4.67 x 1.81 x 1.46, wb 2.69
//   estate – Octavia/Passat-size estate       4.77 x 1.83 x 1.47, wb 2.79
//   suv    – Qashqai-size crossover           4.39 x 1.81 x 1.59, wb 2.65
//   van    – Transit Custom-size panel van    4.97 x 1.99 x 1.98, wb 2.93
//   bus    – Enviro400-size double-decker    10.8  x 2.55 x 4.25, wb 5.5
// top: silhouette [d, y] with d measured back from the front bumper;
// belt: beltline; gA/ws/rs/gR: windscreen base, windscreen top, roof end,
// rear-screen base; sg: side glass [start, end]; bP: B-pillar; fo: front overhang.
const MODELS = {
  mini: { L: 3.97, W: 1.72, H: 1.48, wb: 2.49, fo: 0.8, r: 0.305, sill: 0.3,
    top: [[0, 0.5], [0.05, 0.64], [0.2, 0.76], [0.6, 0.83], [1.1, 0.96], [1.55, 1.25], [1.95, 1.44], [2.45, 1.48], [3.2, 1.44], [3.6, 1.39], [3.72, 1.2], [3.82, 1.0], [3.94, 0.94], [3.97, 0.5]],
    belt: [[1.1, 0.95], [3.6, 1.05]], gA: 1.1, ws: 1.95, rs: 3.6, gR: 3.82, sg: [1.2, 3.35], bP: 2.32, doors: 5, tumble: 0.2 },
  hatch: { L: 4.26, W: 1.8, H: 1.45, wb: 2.64, fo: 0.87, r: 0.315, sill: 0.3,
    top: [[0, 0.5], [0.05, 0.63], [0.22, 0.76], [0.7, 0.83], [1.25, 0.96], [1.7, 1.24], [2.1, 1.42], [2.6, 1.45], [3.5, 1.42], [3.85, 1.37], [3.98, 1.18], [4.08, 1.0], [4.23, 0.95], [4.26, 0.5]],
    belt: [[1.25, 0.95], [3.85, 1.03]], gA: 1.25, ws: 2.1, rs: 3.85, gR: 4.08, sg: [1.36, 3.62], bP: 2.5, doors: 5, tumble: 0.2 },
  taxi: { L: 4.54, W: 1.76, H: 1.47, wb: 2.7, fo: 0.92, r: 0.315, sill: 0.28,
    top: [[0, 0.48], [0.05, 0.6], [0.25, 0.72], [0.75, 0.8], [1.3, 0.92], [1.75, 1.22], [2.1, 1.42], [2.45, 1.47], [3.1, 1.43], [3.7, 1.28], [4.2, 1.08], [4.36, 1.05], [4.5, 0.94], [4.54, 0.48]],
    belt: [[1.3, 0.93], [4.2, 1.04]], gA: 1.3, ws: 2.1, rs: 3.2, gR: 4.22, sg: [1.42, 3.72], bP: 2.62, doors: 5, tumble: 0.19, kamm: true },
  saloon: { L: 4.67, W: 1.81, H: 1.46, wb: 2.69, fo: 0.93, r: 0.32, sill: 0.3,
    top: [[0, 0.5], [0.05, 0.64], [0.25, 0.77], [0.8, 0.84], [1.35, 0.96], [1.8, 1.24], [2.2, 1.42], [2.7, 1.46], [3.4, 1.42], [3.75, 1.3], [4.1, 1.08], [4.45, 1.03], [4.63, 0.98], [4.67, 0.5]],
    belt: [[1.35, 0.95], [4.1, 1.03]], gA: 1.35, ws: 2.2, rs: 3.45, gR: 4.12, sg: [1.46, 3.85], bP: 2.63, doors: 5, tumble: 0.19 },
  estate: { L: 4.77, W: 1.83, H: 1.47, wb: 2.79, fo: 0.94, r: 0.32, sill: 0.3,
    top: [[0, 0.5], [0.05, 0.64], [0.25, 0.77], [0.8, 0.84], [1.35, 0.96], [1.8, 1.24], [2.2, 1.43], [2.7, 1.47], [4.3, 1.44], [4.58, 1.38], [4.68, 1.1], [4.74, 1.0], [4.77, 0.5]],
    belt: [[1.35, 0.95], [4.55, 1.03]], gA: 1.35, ws: 2.2, rs: 4.55, gR: 4.7, sg: [1.46, 4.45], bP: 2.66, doors: 5, tumble: 0.19, quarter: 3.85 },
  suv: { L: 4.39, W: 1.81, H: 1.59, wb: 2.65, fo: 0.92, r: 0.345, sill: 0.42,
    top: [[0, 0.58], [0.05, 0.76], [0.25, 0.9], [0.75, 0.97], [1.25, 1.08], [1.7, 1.38], [2.05, 1.55], [2.5, 1.59], [3.6, 1.55], [3.95, 1.48], [4.08, 1.3], [4.2, 1.12], [4.36, 1.06], [4.39, 0.58]],
    belt: [[1.25, 1.07], [3.95, 1.16]], gA: 1.25, ws: 2.05, rs: 3.95, gR: 4.2, sg: [1.36, 3.72], bP: 2.48, doors: 5, tumble: 0.18, cladding: true },
  van: { L: 4.97, W: 1.99, H: 1.98, wb: 2.93, fo: 0.93, r: 0.33, sill: 0.38,
    top: [[0, 0.58], [0.05, 0.8], [0.3, 0.98], [0.85, 1.1], [1.3, 1.6], [1.6, 1.9], [1.95, 1.98], [4.9, 1.98], [4.97, 1.9], [4.97, 0.58]],
    belt: [[0.85, 1.1], [2.35, 1.15], [4.9, 1.15]], gA: 0.85, ws: 1.62, rs: 4.9, gR: 4.9, sg: [0.98, 2.3], bP: 2.35, doors: 2, tumble: 0.07, van: true },
};
const TYPES = { ...MODELS, bus: { L: 10.8, W: 2.55, H: 4.25, wb: 5.5, fo: 2.45, r: 0.5 } };
export const GLASS = '#1d252c';
export const PAINT_UK = ['#f2f2ef', '#e9eaea', '#111214', '#1c1d20', '#6f757b', '#8e959c', '#b5bbc0', '#c9cdd0', '#1d3f7a', '#2a5db0', '#7a1d1d', '#b71c1c', '#2f4f3a', '#3a3f55', '#8a6a3a', '#d8d2c2'];
const PAINT_TAXI = ['#c9cdd0', '#b5bbc0', '#111214', '#e9eaea', '#8e959c', '#1c1d20'];
export const TYPE_MIX = [['mini', 0.22], ['hatch', 0.18], ['taxi', 0.14], ['saloon', 0.1], ['estate', 0.08], ['suv', 0.2], ['van', 0.08]];
export function pickType(R) { let u = R(); for (const [t, p] of TYPE_MIX) { if ((u -= p) <= 0) return t; } return 'hatch'; }
export function pickPaint(type, R) { const P = type === 'taxi' ? PAINT_TAXI : PAINT_UK; return P[(R() * P.length) | 0]; }

// smooth silhouette y(d) through the template points
function curveFn(pts) {
  const c = new THREE.CatmullRomCurve3(pts.map(([d, y]) => new THREE.Vector3(d, y, 0)), false, 'centripetal');
  const S = c.getPoints(pts.length * 24);
  return (d) => {
    if (d <= S[0].x) return S[0].y;
    for (let i = 1; i < S.length; i++) if (S[i].x >= d) { const a = S[i - 1], b = S[i], k = (d - a.x) / Math.max(1e-6, b.x - a.x); return a.y + (b.y - a.y) * k; }
    return S[S.length - 1].y;
  };
}
function lerpFn(pts) {
  return (d) => {
    if (d <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (pts[i][0] >= d) { const [a, ya] = pts[i - 1], [b, yb] = pts[i]; return ya + (yb - ya) * (d - a) / (b - a); }
    return pts[pts.length - 1][1];
  };
}

// Lofted body: cross-sections along the car (plan rounding, bulging flanks,
// shoulder, tumblehome glasshouse, crowned roof and bonnet) with arches cut
// into the lower edge. Returns per-material geometry + a raycast helper.
function loftBody(T, paint, lod = false) {
  const { L, W, r, sill, fo, wb } = T, hL = L / 2, Wh = W / 2;
  const top = curveFn(T.top), belt = lerpFn(T.belt);
  const dF = fo, dR = fo + wb, ra = r + 0.07;
  const planW = (d) => {
    const rf = 0.55, rr = T.van ? 0.25 : 0.42;
    if (d < rf) { const t = 1 - d / rf; return Wh * (0.66 + 0.34 * Math.sqrt(1 - t * t)); }
    if (d > L - rr) { const t = 1 - (L - d) / rr; return Wh * (0.72 + 0.28 * Math.sqrt(1 - t * t)); }
    return Wh;
  };
  const bottom = (d) => {
    let y = sill;
    if (d < dF - ra - 0.05) y = 0.22 + (T.van ? 0.08 : 0); else if (d > dR + ra + 0.05) y = 0.26 + (T.van ? 0.06 : 0);
    for (const c of [dF, dR]) { const e = d - c; if (Math.abs(e) < ra) y = Math.max(y, r + Math.sqrt(ra * ra - e * e)); }
    return y;
  };
  const inGlass = (d) => d >= T.gA && d <= T.gR;
  // stations: every boundary (glass edges, pillars, arches) plus an even
  // spread in between, tighter at the rounded ends
  const bnd = [T.gA, T.ws, T.rs, T.gR, T.sg[0], T.sg[1], ...(lod === 2 ? [0, L] : lod ? [0, 0.12, L - 0.1, L] : [T.bP - 0.05, T.bP + 0.05, T.quarter ?? -1, (T.quarter ?? -1) + 0.07, 0, 0.02, 0.06, 0.12, L - 0.12, L - 0.06, L - 0.02, L]),
    ...(lod === 2 ? [1] : lod ? [1, 0.55] : [1, 0.97, 0.9, 0.78, 0.6, 0.38, 0.18]).flatMap((k) => [dF - ra * k, dF + ra * k, dR - ra * k, dR + ra * k]), dF, dR].filter((d) => d >= 0 && d <= L);
  const st = [...bnd];
  const step = lod === 2 ? 9 : lod ? 1.4 : 0.2;
  for (let d = step; d < L; d += step) if (!bnd.some((b) => Math.abs(b - d) < 0.07)) st.push(d);   // (arch stations are packed close: the arch edge is a smooth curve)
  const D = st.sort((a, b) => a - b).filter((d, i, a) => i === 0 || d - a[i - 1] > 0.008);
  // section points (x >= 0) for station d
  const KEEP = lod === 2 ? [0, 3, 5, 8, 11] : lod ? [0, 1, 3, 5, 7, 8, 10, 11] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];   // (far model: fewer points round each section)
  const NS = KEEP.length;
  const section = (d) => KEEP.map((j) => section12(d)[j]);
  const section12 = (d) => {
    const w = planW(d), yt = top(d), gh = inGlass(d) ? 1 : 0, yb = Math.min(bottom(d), yt - 0.08);
    const crown = gh ? 0.055 : 0.035, yedge = yt - crown;
    const yBelt = Math.max(yb + 0.1, Math.min(belt(d), yedge - (gh ? 0.004 : 0.03)));
    const tumble = gh ? T.tumble * Math.min(1, Math.max(0.25, (yedge - yBelt) / 0.45)) : 0;
    const wE = gh ? w * 0.965 - tumble : w * 0.9;
    const yBulge = yb + (yBelt - yb) * 0.5;
    return [
      [0, yb + 0.02], [w * 0.9, yb], [w * 0.975, yb + 0.07], [w, yBulge], [w * 0.99, yBelt - 0.07], [w * 0.965, yBelt],
      [w * 0.965 - (w * 0.965 - wE) * 0.1, yBelt + 0.012], [w * 0.965 - (w * 0.965 - wE) * 0.62, yBelt + (yedge - yBelt) * 0.6], [wE, yedge],
      [wE * 0.78, yedge + crown * 0.62], [wE * 0.42, yedge + crown * 0.95], [0, yt],
    ];
  };
  // which material a band between section points j..j+1 at station d is
  const matOf = (d, j) => {
    if (j === 0) return 'under';
    if (j === 5) return inGlass(d) ? 'seal' : 'paint';
    if (T.cladding && j === 1 && (d < dF + ra + 0.1 || d > dR - ra - 0.1 || true)) return 'clad';
    if (j === 6 || j === 7) {
      if (!inGlass(d)) return 'paint';
      if (d < T.sg[0] || d > T.sg[1]) return T.van && d > T.sg[1] ? 'paint' : (d > T.sg[1] && T.kamm && d > T.rs + 0.4 ? 'glass' : 'paint');
      if (Math.abs(d - T.bP) < 0.05) return 'seal';
      if (T.quarter && d > T.quarter && d < T.quarter + 0.07) return 'seal';
      return 'glass';
    }
    if (j >= 8) {
      if (!inGlass(d)) return 'paint';
      if (d < T.ws || d > T.rs) return j === 8 ? (T.van ? 'paint' : 'pillar') : 'glass';
      return 'paint';
    }
    return 'paint';
  };
  // grid of both sides
  const pos = [], idx = [], mats = [];
  const nS = NS, row = nS * 2 - 1;                           // +x points 0..11, then mirrored -x 10..0 (centre-top shared)
  for (const d of D) {
    const S = section(d), z = hL - d;
    for (let j = 0; j < nS; j++) pos.push(S[j][0], S[j][1], z);
    for (let j = nS - 2; j >= 0; j--) pos.push(-S[j][0], S[j][1], z);
  }
  // column index k along the row -> band material index j
  const bandJ = (k) => { const b = k < nS - 1 ? k : row - 2 - k; return KEEP[b + 1] - 1; };   // material of the band below the upper point
  for (let i = 0; i + 1 < D.length; i++) {
    const dm = (D[i] + D[i + 1]) / 2;
    for (let k = 0; k < row - 1; k++) {
      const a = i * row + k, b = a + 1, c = a + row, e = c + 1;
      const m = matOf(dm, bandJ(k));
      idx.push(a, c, b, b, c, e);                             // (the mirrored half is listed in reverse, so one winding fits both)
      mats.push(m, m);
    }
  }
  // end caps (nose / tail): fan to the section centre
  for (const [i, front] of [[0, true], [D.length - 1, false]]) {
    const S = section(D[i]); let cy = 0; for (const p of S) cy += p[1]; cy /= S.length;
    const ci = pos.length / 3; pos.push(0, cy, hL - D[i]);
    for (let k = 0; k < row - 1; k++) { const a = i * row + k, b = a + 1; front ? idx.push(ci, a, b) : idx.push(ci, b, a); mats.push('paint'); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // (normals point outwards? flip the winding if not)
  { const n = g.attributes.normal, p = g.attributes.position; let out = 0; for (let v = 0; v < p.count; v += 7) out += n.getX(v) * p.getX(v) + n.getY(v) * (p.getY(v) - 0.7) + n.getZ(v) * p.getZ(v) * 0.3; if (out < 0) { for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } g.setIndex(idx); g.computeVertexNormals(); } }
  // split into materials (non-indexed, keeping the smooth normals)
  const P = g.attributes.position.array, N = g.attributes.normal.array, groups = {};
  for (let t = 0; t < idx.length / 3; t++) {
    const m = mats[t]; (groups[m] ||= { p: [], n: [] });
    for (let v = 0; v < 3; v++) { const q = idx[t * 3 + v]; groups[m].p.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]); groups[m].n.push(N[q * 3], N[q * 3 + 1], N[q * 3 + 2]); }
  }
  const out = [];
  const MAP = { paint: ['paint', paint], glass: ['glass', GLASS], seal: ['trim', '#141517'], pillar: ['glass', '#101418'], under: ['trim', '#0c0c0d'], clad: ['trim', '#222326'] };
  for (const [m, G2] of Object.entries(groups)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G2.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(G2.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(G2.p.length / 3 * 2), 2));
    out.push({ mat: MAP[m][0], geo, color: MAP[m][1] });
  }
  // surface probe: cast a ray at the body, get point + normal
  const probeMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const rc = new THREE.Raycaster();
  const probe = (ox, oy, oz, dx, dy, dz) => {
    rc.set(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize());
    const h = rc.intersectObject(probeMesh, false)[0]; if (!h) return null;
    const n = h.face.normal.clone(); if (n.dot(rc.ray.direction) > 0) n.negate();
    return { p: h.point, n, dir: rc.ray.direction.clone() };
  };
  return { parts: out, probe, top, belt, planW, dF, dR, ra, hL, section };
}

// A piece laid on the body at a probe hit (w across, h up; uv = atlas
// rect): a fine grid pressed onto the curved panel so nothing sticks out
// past the bodywork at rounded corners.
let PROBE = null, COARSE = false;
function onSurface(hit, w, h, uv = null, off = 0.006) {
  const sx = COARSE ? 2 : Math.max(1, Math.min(10, Math.round(w / 0.07))), sy = COARSE ? 1 : Math.max(1, Math.min(4, Math.round(h / 0.07)));
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  if (uv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1])); }
  const n = hit.n, up = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3().crossVectors(up, n); if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0); xAxis.normalize();
  const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, n); m.setPosition(hit.p);
  g.applyMatrix4(m);
  const P = g.attributes.position, N = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    // project straight along the ray that found the spot (like a projector), so it stays in one piece
    const d = hit.dir || n.clone().negate();
    const q = PROBE && PROBE(v.x - d.x * 0.6, v.y - d.y * 0.6, v.z - d.z * 0.6, d.x, d.y, d.z);
    if (q && q.p.distanceTo(v) < 0.45) { v.copy(q.p).addScaledVector(q.n, off); N.setXYZ(i, q.n.x, q.n.y, q.n.z); }
    else { v.addScaledVector(n, off); N.setXYZ(i, n.x, n.y, n.z); }
    P.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// Returns { parts: [{ mat, geo, color }], wheels: [{ x, y, z, r, w }], dims }
export function vehicleParts(type, { paint = '#8e959c', plate = 0, alloy = 0, lod = false } = {}) {
  if (type === 'bus') return busParts(TYPES.bus, paint, plate);
  const T = MODELS[type] || MODELS.hatch;
  const B = loftBody(T, paint, lod), parts = B.parts, add = (mat, geo, color) => { if (geo) parts.push({ mat, geo, color }); };
  const { L, W, H, r } = T, hL = L / 2, probe = B.probe, trim = '#161719';
  PROBE = probe; COARSE = lod;
  const Z = (d) => hL - d;
  // ---- front: headlights, grille, lower intake, plate, fog lights ----
  const yBon = B.top(0.25);
  for (const sx of [-1, 1]) {
    const h = probe(sx * W * 0.33, (yBon + B.top(0.02)) / 2 + 0.03, hL + 2, 0, 0, -1);
    if (h) { const g = onSurface(h, W * 0.24, T.van ? 0.2 : 0.12, [sx > 0 ? 0 : 0.5, 0.5, sx > 0 ? 0.5 : 1, 1]); add('lightF', g, '#ffffff'); }
    const fl = probe(sx * W * 0.36, 0.34, hL + 2, 0, 0, -1); if (fl) add('trim', onSurface(fl, 0.14, 0.07), '#2a2c2f');
  }
  const gr = probe(0, B.top(0.02) - 0.05, hL + 2, 0, 0, -1); if (gr) add('trim', onSurface(gr, W * (T.van ? 0.62 : 0.44), T.van ? 0.3 : 0.15), '#0f1011');
  const li = probe(0, 0.33, hL + 2, 0, 0, -1); if (li) add('trim', onSurface(li, W * 0.48, 0.12), '#141516');
  const pf = probe(0, 0.47, hL + 2, 0, 0, -1); if (pf) add('plate', onSurface(pf, 0.52, 0.11, plateUV(plate, 0), 0.012), '#ffffff');
  // ---- rear: tail lights, plate, bumper diffuser, high brake light ----
  const yTail = T.van ? 1.05 : Math.min(B.belt(L - 0.2), B.top(L - 0.12)) - 0.06;
  for (const sx of [-1, 1]) {
    const h = probe(sx * W * (T.van ? 0.44 : 0.36), yTail, -hL - 2, 0, 0, 1);
    if (h) add('lightR', onSurface(h, T.van ? 0.13 : W * 0.22, T.van ? 0.45 : 0.13, [sx > 0 ? 0 : 0.5, 0, sx > 0 ? 0.5 : 1, 0.5]), '#ffffff');
  }
  const pr = probe(0, T.van ? 0.62 : yTail - 0.3, -hL - 2, 0, 0, 1); if (pr) add('plate', onSurface(pr, 0.52, 0.11, plateUV(plate, 1), 0.012), '#ffffff');
  const df = probe(0, 0.32, -hL - 2, 0, 0, 1); if (df) add('trim', onSurface(df, W * 0.6, 0.08), trim);
  if (!T.van) { const hb = probe(0, B.top(T.rs) - 0.04, Z(T.rs) - 1.5, 0, 0.3, 1); if (hb) add('lightR', onSurface(hb, 0.36, 0.03, [0.2, 0.2, 0.3, 0.3]), '#ffffff'); }
  if (T.van) {
    const rw = probe(0, 1.5, -hL - 2, 0, 0, 1); if (rw) add('glass', onSurface(rw, 1.4, 0.42), GLASS);
    const rd = probe(0, 1.12, -hL - 2, 0, 0, 1); if (rd) add('trim', onSurface(rd, 0.02, 1.4, null, 0.012), trim);   // rear doors split
  }
  // ---- sides: door shut lines, handles, mirrors, sill, rubbing strip ----
  const gapLine = (d, x0, x1, sx) => {
    if (lod) return;
    const hs = []; for (let k = 0; k <= 4; k++) { const y = x0 + (x1 - x0) * k / 4, h = probe(sx * 3, y, Z(d), -sx, 0, 0); if (h) hs.push(h); }
    for (let k = 0; k + 1 < hs.length; k++) {
      const a = hs[k].p, b = hs[k + 1].p, len = a.distanceTo(b); if (len < 0.01) continue;
      const mid = { p: a.clone().add(b).multiplyScalar(0.5), n: hs[k].n.clone().add(hs[k + 1].n).normalize() };
      add('trim', onSurface(mid, 0.012, len + 0.004), '#0e0f10');
    }
  };
  for (const sx of [-1, 1]) {
    const yb = T.sill + 0.06;
    const doorsD = T.doors === 5 ? [T.sg[0] - 0.08, T.bP + 0.02, T.sg[1] + 0.02] : [T.sg[0] - 0.08, T.bP + 0.02];
    for (const d of doorsD) gapLine(d, yb, B.belt(d) - 0.02, sx);
    for (const d of (lod ? [] : T.doors === 5 ? [T.bP - 0.28, T.sg[1] - 0.3] : [T.bP - 0.3])) {
      const h = probe(sx * 3, B.belt(d) - 0.12, Z(d), -sx, 0, 0); if (h) add('chrome', onSurface(h, 0.17, 0.03, null, 0.012), T.cladding ? '#9aa0a6' : '#d0d4d8');
    }
    if (T.van) { const h = probe(sx * 3, 1.0, Z(3.1), -sx, 0, 0); if (h && sx > 0) add('trim', onSurface(h, 0.02, 1.3), '#0e0f10'); }   // sliding door rail line (nearside)
    // door mirror: on the front corner of the door at the beltline, arm out
    // past the body side, housing with the glass facing back
    const dm = T.gA + 0.2, hm = probe(sx * 3, B.belt(dm) - 0.04, Z(dm), -sx, 0, 0);
    if (hm) {
      const mx = hm.p.x + sx * 0.17, my = hm.p.y + 0.09, mz = hm.p.z;
      add('trim', place(new THREE.BoxGeometry(0.16, 0.05, 0.07), hm.p.x + sx * 0.07, hm.p.y + 0.02, mz + 0.02, 0, 0, sx * 0.35), trim);
      const hs = new THREE.SphereGeometry(0.5, 10, 6); hs.scale(0.2, 0.12, 0.1);
      add('paint', place(hs, mx, my, mz), paint);
      add('glass', place(quad(0.16, 0.09), mx, my, mz - 0.051, Math.PI), '#aab4bc');
    }
  }
  // ---- wheel wells, roof rails ----
  for (const d of [B.dF, B.dR]) add('trim', place(new THREE.BoxGeometry(W - 0.34, B.ra * 1.2, B.ra * 1.9), 0, r + 0.12, Z(d)), '#0a0a0b');
  if (type === 'estate' || type === 'suv') for (const sx of [-1, 1]) {
    // roof rails: short segments following the roof line, on feet
    const d0 = T.ws + 0.25, d1 = T.rs - 0.2, n = 5, x = sx * (B.planW(2) * 0.965 - T.tumble - 0.07);
    for (let k = 0; k < n; k++) {
      const a = d0 + (d1 - d0) * k / n, b = d0 + (d1 - d0) * (k + 1) / n, ya = B.top(a) + 0.015, yb = B.top(b) + 0.015;
      add('trim', bar([Z(a), ya], [Z(b), yb], x, 0.03, 0.035), '#2a2b2e');
    }
    for (const d of [d0 + 0.05, d1 - 0.05]) add('trim', place(new THREE.BoxGeometry(0.04, 0.05, 0.1), x, B.top(d) - 0.01, Z(d)), '#2a2b2e');
  }
  const wheels = [];
  const track = W / 2 - 0.15;
  for (const sx of [-1, 1]) for (const d of [B.dF, B.dR]) wheels.push({ x: sx * track, y: r, z: Z(d), r, w: T.van ? 0.23 : r > 0.33 ? 0.23 : 0.2, alloy: T.van ? 0 : alloy });
  return { parts, wheels, dims: { L, W, H } };
}

// Double-decker (Enviro400-size): two decks of glazing, front screens, destination
// display, nearside doors, livery of the invented operator.
function busParts(T, paint, plate) {
  const parts = [], add = (mat, geo, color) => parts.push({ mat, geo, color });
  const { L, W, H, wb, r } = T, hL = L / 2, zF = hL - T.fo, zR = zF - wb, ra = r + 0.08, y0 = 0.3;
  const body = [[hL - 0.08, y0 + 0.05], [hL, 0.45], [hL + 0.02, 1.2], [hL, 2.5], [hL - 0.06, H - 0.3], [hL - 0.25, H], [-hL + 0.2, H], [-hL + 0.02, H - 0.2], [-hL, y0 + 0.12]];
  arch(body, zR, r, ra, y0, 8); arch(body, zF, r, ra, y0, 8);
  const g = sideExtrude(body, W, { bevel: 0.09, curve: 4 });
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const u = (p.getZ(i) + hL) / L; uv.setXY(i, p.getX(i) > 0 ? 1 - u : u, Math.min(1, Math.max(0, p.getY(i) / H))); }
  add('livery', g, '#ffffff');
  for (const sx of [-1, 1]) {
    // lower deck (behind the doors on the nearside) and upper deck window bands
    const x = sx * (W / 2 + 0.012);
    add('glass', place(quad(L - (sx > 0 ? 3.3 : 1.6), 1.0), x, 1.85, sx > 0 ? -1.25 : -0.45, sx * Math.PI / 2), GLASS);
    add('glass', place(quad(L - 0.9, 1.0), x, 3.25, -0.1, sx * Math.PI / 2), GLASS);
    for (let k = 0; k < 7; k++) add('trim', place(quad(0.08, 1.0), x + sx * 0.002, 3.25, -hL + 0.9 + k * 1.52, sx * Math.PI / 2), '#101214'); // window pillars upstairs
  }
  add('glass', place(quad(0.9, 2.0), W / 2 + 0.013, 1.45, hL - 1.25, Math.PI / 2), '#2a3440');       // front doors (nearside)
  add('trim', place(quad(0.03, 2.0), W / 2 + 0.016, 1.45, hL - 1.25, Math.PI / 2), '#0e0f10');
  add('glass', place(quad(W - 0.18, 1.55), 0, 1.6, hL + 0.03), GLASS);                                    // lower windscreen
  add('glass', place(quad(W - 0.22, 1.0), 0, 3.3, hL - 0.04, 0, -0.08), GLASS);                          // upper front window
  add('lightF', place(quad(W - 0.7, 0.3, 0.5, 0, 1, 0.5), 0, 2.58, hL + 0.02), '#ffb000');             // destination display
  add('trim', place(new THREE.BoxGeometry(W - 0.06, 0.3, 0.08), 0, 0.42, hL - 0.01), '#1b1c1e');
  for (const sx of [-1, 1]) {
    add('lightF', place(quad(0.34, 0.16, sx > 0 ? 0 : 0.5, 0.5, sx > 0 ? 0.5 : 1, 1), sx * (W / 2 - 0.32), 0.7, hL + 0.025), '#ffffff');
    add('lightR', place(quad(0.2, 0.55, 0, 0, 0.5, 0.5), sx * (W / 2 - 0.2), 1.05, -hL - 0.012, Math.PI), '#ffffff');
    add('paint', place(new THREE.BoxGeometry(0.05, 0.05, 0.5), sx * (W / 2 + 0.2), 2.3, hL - 0.2), '#111');                 // mirror arm
    add('paint', place(new THREE.BoxGeometry(0.1, 0.4, 0.22), sx * (W / 2 + 0.42), 2.1, hL - 0.2), '#111');
  }
  add('plate', place(quad(0.52, 0.12, ...plateUV(plate, 0)), 0, 0.62, hL + 0.05), '#ffffff');
  add('plate', place(quad(0.52, 0.12, ...plateUV(plate, 1)), 0, 0.8, -hL - 0.02, Math.PI), '#ffffff');
  add('glass', place(quad(W - 0.5, 0.8), 0, 3.3, -hL - 0.012, Math.PI), GLASS);
  add('trim', place(new THREE.BoxGeometry(W - 0.2, 0.9, 0.05), 0, 1.3, -hL - 0.01), '#26282b');           // engine grille
  for (const zc of [zF, zR]) add('trim', place(new THREE.BoxGeometry(W - 0.4, ra * 1.1, ra * 2), 0, r + 0.1, zc), '#0c0c0d');
  const wheels = [];
  for (const sx of [-1, 1]) for (const zc of [zF, zR]) wheels.push({ x: sx * (W / 2 - 0.2), y: r, z: zc, r, w: 0.3, alloy: 0 });
  void paint;
  return { parts, wheels, dims: { L, W, H } };
}

// wheel geometry: tyre (with rounded shoulders) + alloy face on the outer side
let WG = null, WGL = null;
export function wheelGeos(lod = false) {
  if (lod) { if (!WGL) { const prof = [[0.64, -0.5], [1, -0.4], [1, 0.4], [0.64, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)); const tyre = new THREE.LatheGeometry(prof, 8); tyre.rotateZ(Math.PI / 2); const face = new THREE.CircleGeometry(0.66, 8); face.rotateY(Math.PI / 2); WGL = { tyre, face }; } return WGL; }
  if (WG) return WG;
  const prof = [[0.64, -0.5], [0.93, -0.48], [1, -0.28], [1, 0.28], [0.93, 0.48], [0.64, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = new THREE.LatheGeometry(prof, 12); tyre.rotateZ(Math.PI / 2);
  const face = new THREE.CircleGeometry(0.66, 12); face.rotateY(Math.PI / 2);
  WG = { tyre, face };
  return WG;
}
// place a wheel's geometry (unit radius/width scaled) -> {tyre, face} geometries in vehicle space
export function wheelParts(w, spin = 0, lod = false) {
  const { tyre, face } = wheelGeos(lod);
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
  const V = vehicleParts(type, { paint: paint ?? pickPaint(type, Math.random), plate, alloy });
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
  // range: how far cars are drawn at all; near: detailed model inside this, lighter model beyond
  constructor(scene, { range = 90, near = 90, variants = 2, ground = null } = {}) { this.scene = scene; this.range = range; this.near = near; this.variants = variants; this.ground = ground; this.list = []; this.models = new Map(); }
  add(x, y, z, ry, type, paint) {
    const v = this.list.length % this.variants, key = type + v, T = TYPES[type] || TYPES.hatch;
    // sit on the ground under the wheels: pitch from the axles, roll from the sides
    const q = new THREE.Quaternion();
    if (this.ground) {
      const G = this.ground, fx = Math.sin(ry), fz = Math.cos(ry), sx = fz, sz = -fx, a = T.wb / 2, t = T.W / 2 - 0.15;
      const hf = G(x + fx * a, z + fz * a), hb = G(x - fx * a, z - fz * a), hl = G(x - sx * t, z - sz * t), hr = G(x + sx * t, z + sz * t);
      const pitch = Math.atan2(hf - hb, 2 * a), roll = Math.atan2(hr - hl, 2 * t);
      y = (hf + hb + hl + hr) / 4;
      q.setFromEuler(new THREE.Euler(-pitch, ry, roll, 'YXZ'));
    } else q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    this.list.push({ x, y, z, q, key, paint: new THREE.Color(paint) });
    return { L: T.L, W: T.W, H: T.H };
  }
  build() {
    const M = vehicleMaterials(), count = new Map();
    for (const c of this.list) count.set(c.key, (count.get(c.key) || 0) + 1);
    for (const [key, n] of count) {
      const type = key.slice(0, -1), v = +key.slice(-1);
      const lods = [0, 1, 2].map((lod) => {
        const V = vehicleParts(type, { paint: '#ffffff', plate: 3 + v * 7, alloy: (v * 2 + type.length) % 4, lod });
        const byMat = new Map(), put = (k, g) => { if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(g); };
        for (const p of V.parts) put(p.mat, colorize(p.geo, p.color));
        for (const w of V.wheels) { const { tyre, face } = wheelParts(w, 0.7 * v, lod); put('tyre', colorize(tyre, '#1c1c1c')); put('rim', colorize(face, '#ffffff')); }
        const meshes = [];
        for (const [k, list] of byMat) {
          const mesh = new THREE.InstancedMesh(mergeList(list), M[k], n);
          mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = lod === 0 && (k === 'paint' || k === 'trim'); mesh.receiveShadow = true;
          if (k === 'paint') mesh.setColorAt(0, new THREE.Color(1, 1, 1));
          this.scene.add(mesh); meshes.push({ k, mesh });
        }
        return { meshes, n: 0 };
      });
      this.models.set(key, { lods, members: this.list.filter((c) => c.key === key) });
    }
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  // yaw: the player's view direction; cars well behind the view aren't drawn
  // (anything within 15 m always is, for turning round)
  update(pos, yaw = null) {
    const R2 = this.range * this.range, N2 = this.near * this.near, F2 = (this.near * 2.6) ** 2, fx = yaw === null ? 0 : -Math.sin(yaw), fz = yaw === null ? 0 : -Math.cos(yaw);
    for (const m of this.models.values()) {
      for (const L of m.lods) L.n = 0;
      for (const c of m.members) {
        const dx = c.x - pos.x, dz = c.z - pos.z, d2 = dx * dx + dz * dz; if (d2 > R2) continue;
        if (yaw !== null && d2 > 225 && dx * fx + dz * fz < -0.35 * Math.sqrt(d2)) continue;
        const L = m.lods[d2 < N2 ? 0 : d2 < F2 ? 1 : 2], i = L.n++;
        this._m.compose(this._p.set(c.x, c.y, c.z), c.q, this._s);
        for (const { k, mesh } of L.meshes) { mesh.setMatrixAt(i, this._m); if (k === 'paint') mesh.setColorAt(i, c.paint); }
      }
      for (const L of m.lods) for (const { mesh } of L.meshes) { mesh.count = L.n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    }
  }
}
