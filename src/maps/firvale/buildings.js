// Victorian/Edwardian terraces and shop conversions lining the real streets.
// Each house is assembled from dozens of pieces in its own local frame
// (front faces +Z, toward the road), then merged into chunked batches.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { tiledBox } from '../../models/builders.js';
import { boxUV } from '../../models/shapes.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// A local coordinate frame that emits pieces into a StaticBatch.
export class Frame {
  constructor(batch, cx, cz, ry, y0) { this.batch = batch; this.cx = cx; this.cz = cz; this.ry = ry; this.y0 = y0; this.c = Math.cos(ry); this.s = Math.sin(ry); _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); this.q = _q.clone(); }
  world(lx, lz) { return [this.cx + lx * this.c + lz * this.s, this.cz - lx * this.s + lz * this.c]; }
  geo(mat, g, lx, ly, lz, { rx = 0, ry = 0, rz = 0, color, detail = false, sx = 1, sy = 1, sz = 1 } = {}) {
    const [x, z] = this.world(lx, lz);
    _e.set(rx, ry, rz); _q2.setFromEuler(_e);
    _m.compose(_p.set(x, this.y0 + ly, z), this.q.clone().multiply(_q2), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    this.batch.add(mat, g, { color, detail });
  }
  box(mat, lx, ly, lz, w, h, d, o = {}) { this.geo(mat, tiledBox(w, h, d, o.tile ?? 0), lx, ly, lz, o); }
}

// ---------------------------------------------------------------- textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// Sash / uPVC window: frame, glazing bars, glass with sky reflection and
// curtains or blinds behind. 4 variants side-by-side in one texture.
export function windowAtlas() {
  const [c, g] = canvas(256, 128);
  const R = rng(77);
  for (let v = 0; v < 4; v++) {
    const ox = v * 64;
    g.fillStyle = '#ecebe4'; g.fillRect(ox, 0, 64, 128);               // frame (white uPVC / painted)
    const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, '#5d7288'); grd.addColorStop(0.5, '#1d2630'); grd.addColorStop(1, '#2a2f33');
    g.fillStyle = grd; g.fillRect(ox + 5, 5, 54, 118);                 // glass
    // what's behind the glass: curtains, nets, blinds
    const kind = v % 4;
    if (kind === 0) { g.fillStyle = `hsl(${R() * 360 | 0},35%,40%)`; g.fillRect(ox + 5, 5, 14, 118); g.fillRect(ox + 45, 5, 14, 118); }
    if (kind === 1) { g.fillStyle = 'rgba(235,235,225,.55)'; g.fillRect(ox + 5, 60, 54, 63); }       // nets
    if (kind === 2) { g.fillStyle = 'rgba(210,200,180,.7)'; for (let y = 8; y < 60; y += 4) g.fillRect(ox + 5, y, 54, 2); } // blind
    if (kind === 3) { g.fillStyle = 'rgba(120,20,30,.7)'; g.fillRect(ox + 5, 5, 54, 20); }
    g.fillStyle = '#ecebe4'; g.fillRect(ox, 60, 64, 6); g.fillRect(ox + 30, 5, 4, 118);   // transom + mullion
    // sky reflection streak
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(ox + 8, 120); g.lineTo(ox + 30, 8); g.lineTo(ox + 38, 8); g.lineTo(ox + 16, 120); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Shop signs (fictional names, true-to-type for the area) in one atlas.
export const SHOPS = [
  ['FIR VALE MINI MART', 'OPEN LATE · FRESH SAMOSAS · PHONE TOP-UP', '#15603a', '#ffcc00'],
  ['POTRAVINY', 'SLOVENSKÉ · ČESKÉ · POLSKIE POTRAVINY', '#b3121f', '#ffffff'],
  ['PHONE DOCTOR 24/7', 'SCREENS · UNLOCKING · ACCESSORIES', '#0d3b66', '#7fd1ff'],
  ['VALE CUTZ', 'GENTS BARBERS · WALK-INS WELCOME', '#111111', '#ff3b3b'],
  ['GOLDEN SPOON', 'SWEET CENTRE · CAKES · PARTY TRAYS', '#7a1b1b', '#ffd36b'],
  ['BARGAIN PALACE', 'HOUSEHOLD · TOYS · EVERYTHING', '#4b1c78', '#ffe14d'],
  ['TO LET', 'ALL ENQUIRIES 0114 000 0000', '#e9e6dd', '#c0392b'],
  ['FRESH FRUIT & VEG', 'DAILY · WHOLESALE PRICES', '#2f7d2f', '#ffffff'],
  ['HALAL MEATS', 'FRESH CHICKEN · LAMB · MUTTON', '#0e5e4a', '#f7e27a'],
  ['SPICE KITCHEN', 'CURRIES · GRILLS · DELIVERY', '#1a1a1a', '#ff8c1a'],
  ['PERI & PIZZA', 'PIZZA · WINGS · BURGERS', '#c1121f', '#fff1c1'],
  ['MONEY TRANSFER', 'TRAVEL · CARGO · PHONE CARDS', '#0b6e99', '#ffffff'],
  ['EUROPA FOODS', 'POLISH · SLOVAK · ROMANIAN', '#1e3a8a', '#fcd34d'],
  ['TAILORING', 'ALTERATIONS · SUITS · DRESSES', '#5b2a86', '#f5d0fe'],
  ['LAUNDERETTE', 'SERVICE WASH · DRY CLEANING', '#0f766e', '#ccfbf1'],
  ['CAFE KARPATY', 'HOT FOOD · COFFEE · CAKES', '#78350f', '#fde68a'],
  ['DOLLAR & POUND', 'EVERYTHING £1 AND UP', '#be123c', '#fff'],
  ['PAGE HALL NEWS', 'NEWSAGENT · LOTTERY · SWEETS', '#14532d', '#fef08a'],
  ['FIR VALE FABRICS', 'SILKS · SUITS · WEDDING WEAR', '#831843', '#fbcfe8'],
  ['CORNER BAKERY', 'NAAN · ROTI · PASTRIES', '#92400e', '#ffedd5'],
  ['VALE MOTOR SPARES', 'EXHAUSTS · TYRES · MOT', '#1f2937', '#fbbf24'],
  ['DENTAL SURGERY', 'NHS & PRIVATE PATIENTS', '#f8fafc', '#0369a1'],
  ['ESTATE AGENTS', 'SALES · LETTINGS · VALUATIONS', '#0c4a6e', '#bae6fd'],
  ['KEBAB HOUSE', 'DONERS · WRAPS · CHIPS', '#7f1d1d', '#fde047'],
];
export function signAtlas() {
  const cols = 4, rows = Math.ceil(SHOPS.length / cols), W = 512, H = 96;
  const [c, g] = canvas(cols * W, rows * H);
  SHOPS.forEach(([name, sub, bg, fg], i) => {
    const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    g.fillStyle = bg; g.fillRect(x, y, W, H);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x, y + H - 10, W, 10);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 50px "Arial Narrow", Arial, sans-serif'; g.fillText(name, x + W / 2, y + 38, W - 30);
    g.font = 'bold 17px Arial, sans-serif'; g.fillText(sub, x + W / 2, y + 76, W - 30);
    // light weathering
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(x + Math.random() * W, y + Math.random() * H, 2 + Math.random() * 20, 1 + Math.random() * 3); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, cols, rows, count: SHOPS.length };
}
export function displayAtlas() {
  const [c, g] = canvas(1024, 256);
  const R = rng(5);
  for (let v = 0; v < 4; v++) {
    const ox = v * 256;
    const bg = g.createLinearGradient(0, 0, 0, 256); bg.addColorStop(0, '#2a3238'); bg.addColorStop(1, '#10161a');
    g.fillStyle = bg; g.fillRect(ox, 0, 256, 256);
    // shelving with packets, tins, bottles
    for (let sh = 0; sh < 7; sh++) {
      const y = 24 + sh * 32; g.fillStyle = '#a49c90'; g.fillRect(ox, y + 22, 256, 3);
      for (let x = 2; x < 252;) {
        const w = 3 + R() * 7, h = 8 + R() * 13, hue = R() * 360 | 0;
        g.fillStyle = `hsl(${hue},${45 + R() * 45 | 0}%,${30 + R() * 35 | 0}%)`; g.fillRect(ox + x, y + 22 - h, w, h);
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(ox + x, y + 22 - h, 1, h);
        x += w + 0.5;
      }
    }
    // window stickers and a poster
    g.fillStyle = ['#ffd200', '#ff3d3d', '#3ddc84', '#ffffff'][v]; g.fillRect(ox + 10, 150, 60, 40);
    g.fillStyle = '#111'; g.font = 'bold 14px Arial'; g.fillText(['OPEN', 'SALE', '£1', 'OFFERS'][v], ox + 16, 176);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 11px Arial'; g.fillText('WE ACCEPT CARD · TOP UP HERE', ox + 90, 245);
    // glass reflections
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(ox + 20, 256); g.lineTo(ox + 120, 0); g.lineTo(ox + 150, 0); g.lineTo(ox + 50, 256); g.fill();
    g.fillStyle = 'rgba(200,220,255,.08)'; g.fillRect(ox, 0, 256, 60);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Plane with UVs picking one cell out of an atlas.
export function atlasQuad(w, h, u0, v0, u1, v1) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  return g;
}
// Box whose front (+Z) face shows an atlas cell (other faces use a corner of it).
function atlasBox(w, h, d, u0, v0, u1, v1) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; const a = uv.getX(i), b = uv.getY(i);
    if (f === 4) uv.setXY(i, u0 + (u1 - u0) * a, v0 + (v1 - v0) * b); else uv.setXY(i, u0 + 0.01, v0 + 0.01);
  }
  return g;
}

// ---------------------------------------------------------------- occupancy
export class Occupancy {
  constructor(b) { this.b = b; this.W = Math.ceil(b.maxX - b.minX); this.H = Math.ceil(b.maxZ - b.minZ); this.a = new Uint8Array(this.W * this.H); }
  idx(x, z) { const i = Math.floor(x - this.b.minX), j = Math.floor(z - this.b.minZ); return (i < 0 || j < 0 || i >= this.W || j >= this.H) ? -1 : j * this.W + i; }
  get(x, z) { const i = this.idx(x, z); return i < 0 ? 1 : this.a[i]; }
  set(x, z, v = 1) { const i = this.idx(x, z); if (i >= 0) this.a[i] = v; }
  // rotated rectangle test/mark (frame local x in [-hw,hw], z in [z0,z1])
  rect(f, hw, z0, z1, mark) {
    for (let lx = -hw; lx <= hw + 0.01; lx += 0.9) for (let lz = z0; lz <= z1 + 0.01; lz += 0.9) {
      const [x, z] = f.world(lx, lz);
      if (mark) this.set(x, z, 1); else if (this.get(x, z)) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------- houses
const BRICK = ['#ffffff', '#f4ddd0', '#e9cbbb', '#dcb9a6', '#fbe4d6', '#cfae9c', '#d9c2b5'];
const RENDER = ['#e8e4da', '#d9d6cf', '#cfc9bd', '#efe6d2', '#bfc4c6'];
const DOORS = ['#6e1d1d', '#1d3a6e', '#1f5a2c', '#161616', '#f1f1ec', '#4f2a63', '#9a6b22', '#3b3b3b'];

function roofGeo(w, depth, height) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).toNonIndexed();
  g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);
  g.scale(w, height / 1.5, depth / 1.732); g.translate(0, 0.5 * height / 1.5, 0);
  return boxUV(g, 0.9);
}

export function house(batch, M, f, R, o) {
  const W = o.w, D = 8, H = o.shop ? 6.4 : 5.9;
  const rendered = !o.shop && R() < 0.14;
  const wallMat = rendered ? M.render : M.brick, tint = rendered ? RENDER[(R() * RENDER.length) | 0] : o.brickTint ?? BRICK[(R() * BRICK.length) | 0];
  // body (extends below ground so slopes never show gaps) + stone plinth
  f.box(wallMat, 0, (H - 2.6) / 2, 0, W, H + 2.6, D, { tile: rendered ? 2 : 1.3, color: tint });
  f.box(M.stone, 0, 0.18, D / 2 + 0.02, W, 0.36, 0.06, { tile: 1, color: '#cfc3ad' });
  // roof, ridge, eaves
  f.geo(M.slate, roofGeo(W + 0.02, D + 0.5, 2.5), 0, H, 0, { color: '#9aa0a8' });
  f.box(M.ridge, 0, H + 2.47, 0, W + 0.02, 0.14, 0.3, { color: '#7a4a3a' });
  // gutters front/back + downpipe
  f.box(M.darkMetal, 0, H - 0.05, D / 2 + 0.3, W, 0.12, 0.12, { color: '#1c1c1c', detail: true });
  f.box(M.darkMetal, 0, H - 0.05, -D / 2 - 0.3, W, 0.12, 0.12, { color: '#1c1c1c', detail: true });
  if (o.pipe) f.box(M.darkMetal, W / 2 - 0.08, H / 2, D / 2 + 0.06, 0.08, H, 0.08, { color: '#1c1c1c', detail: true });
  // chimney on the party wall with pots
  if (o.chimney) {
    f.box(wallMat, W / 2, H + 2.1, -0.3, 0.9, 1.6, 1.5, { tile: 1.3, color: tint });
    f.box(M.stone, W / 2, H + 2.95, -0.3, 1.0, 0.12, 1.6, { color: '#b8ae9c' });
    for (const dz of [-0.35, 0.05, 0.4]) { if (R() < 0.8) f.geo(M.clay, new THREE.CylinderGeometry(0.1, 0.13, 0.45, 8), W / 2, H + 3.2, -0.3 + dz, { color: '#b35a3a', detail: true }); }
    if (R() < 0.3) { f.box(M.metal, W / 2, H + 3.8, -0.3, 0.03, 1.4, 0.03, { detail: true }); f.box(M.metal, W / 2, H + 4.3, -0.3, 0.7, 0.03, 0.03, { detail: true }); } // TV aerial
  }
  const m = o.mirror ? -1 : 1;
  const winMat = M.win;
  const win = (lx, ly, w, h, v, lz = D / 2) => {
    const u0 = v * 0.25, u1 = u0 + 0.25;
    f.geo(winMat, atlasBox(w, h, 0.1, u0 + 0.004, 0, u1 - 0.004, 1), lx, ly, lz - 0.02);
    f.box(M.stone, lx, ly + h / 2 + 0.1, lz + 0.03, w + 0.3, 0.2, 0.14, { tile: 1, color: '#d6cbb5', detail: true });   // lintel
    f.box(M.stone, lx, ly - h / 2 - 0.06, lz + 0.06, w + 0.24, 0.1, 0.22, { tile: 1, color: '#d6cbb5', detail: true }); // sill
  };
  const v = (R() * 4) | 0;
  if (!o.shop) {
    // front door + fanlight + step
    f.box(M.door, -1.55 * m, 1.1, D / 2 + 0.01, 0.95, 2.1, 0.1, { color: DOORS[(R() * DOORS.length) | 0] });
    f.geo(winMat, atlasBox(0.95, 0.35, 0.08, 0.26, 0.05, 0.49, 0.3), -1.55 * m, 2.4, D / 2);
    f.box(M.stone, -1.55 * m, 2.7, D / 2 + 0.04, 1.3, 0.22, 0.14, { color: '#d6cbb5', detail: true });
    f.box(M.stone, -1.55 * m, 0.07, D / 2 + 0.3, 1.2, 0.18, 0.5, { tile: 1, color: '#bfb6a4' });
    // ground floor: canted bay window (on many) or a flat window
    if (o.bay) {
      const bx = 0.95 * m, bw = 1.5, proj = 0.65;
      f.box(M.stone, bx, 0.4, D / 2 + proj / 2, bw + 0.9, 0.8, proj, { tile: 1, color: '#cdc2ad' });
      f.geo(winMat, atlasBox(bw, 1.5, 0.08, v * 0.25 + 0.004, 0, v * 0.25 + 0.246, 1), bx, 1.6, D / 2 + proj);
      for (const sd of [-1, 1]) f.geo(winMat, atlasBox(0.65, 1.5, 0.08, v * 0.25 + 0.05, 0, v * 0.25 + 0.2, 1), bx + sd * (bw / 2 + 0.2), 1.6, D / 2 + proj / 2, { ry: sd * 0.78 });
      f.box(M.stone, bx, 2.45, D / 2 + proj / 2, bw + 0.95, 0.18, proj + 0.1, { color: '#d6cbb5' });
      f.box(M.slate, bx, 2.6, D / 2 + proj / 2 - 0.05, bw + 0.9, 0.14, proj, { color: '#6e737a', rx: -0.3 });
    } else win(0.95 * m, 1.55, 1.4, 1.5, v);
    // upstairs windows
    win(0.95 * m, 4.25, 1.2, 1.35, (v + 1) % 4);
    if (W > 5) win(-1.55 * m, 4.25, 0.8, 1.3, (v + 2) % 4);
    // front garden: low brick wall with stone coping and a gate gap
    if (o.garden > 0.6) {
      const z = D / 2 + o.garden;
      for (const [a, b] of [[-W / 2, -1.55 * m - 0.6], [-1.55 * m + 0.6, W / 2]].map(([a, b]) => [Math.min(a, b), Math.max(a, b)])) {
        if (b - a < 0.2) continue;
        f.box(M.brick, (a + b) / 2, 0.45, z, b - a, 0.9, 0.24, { tile: 1.3, color: tint, detail: true });
        f.box(M.stone, (a + b) / 2, 0.95, z, b - a + 0.02, 0.1, 0.3, { color: '#c8bca6', detail: true });
      }
      if (R() < 0.5) { const bc = ['#2a2a2a', '#2d4f8c', '#6b4a2b', '#2f6b36'][(R() * 4) | 0]; f.box(M.plastic, 1.8 * m, 0.55, D / 2 + o.garden - 0.5, 0.6, 1.05, 0.7, { color: bc, detail: true }); }
      if (R() < 0.2) f.box(M.hedge, 1.2 * m, 0.7, D / 2 + o.garden - 0.25, 1.8, 1.2, 0.5, { color: '#3f6b35', detail: true });
    }
  } else {
    // ---- shop conversion: shopfront, fascia, shutter box, door, stall ----
    const S = o.shop, cell = o.signCell; // atlas cell for the sign
    f.box(M.darkMetal, 0, 1.55, D / 2 + 0.05, W - 0.3, 3.1, 0.12, { color: '#2a2a2a' });                       // frame
    f.geo(M.display, atlasQuad(W - 1.8, 2.2, (o.disp) * 0.25, 0, (o.disp) * 0.25 + 0.25, 1), 0.55, 1.55, D / 2 + 0.13);
    f.box(M.glass, -W / 2 + 0.75, 1.2, D / 2 + 0.1, 0.95, 2.3, 0.06, { color: '#ffffff' });                      // glass door
    f.box(M.stone, 0, 0.2, D / 2 + 0.12, W - 0.3, 0.4, 0.14, { color: '#3a3a3a' });                              // stall riser
    f.geo(M.sign, atlasBox(W - 0.2, 0.85, 0.2, cell.u0, cell.v0, cell.u1, cell.v1), 0, 3.55, D / 2 + 0.2);        // fascia sign
    f.box(M.metal, 0, 3.05, D / 2 + 0.2, W - 0.4, 0.22, 0.25, { color: '#9aa0a3', detail: true });                // roller shutter box
    if (o.shutter) f.box(M.metal, 0.55, 2.4, D / 2 + 0.16, W - 1.8, 1.1, 0.04, { color: '#8e9497' });             // half-down shutter
    if (S.awning) {
      for (let i = 0; i < 6; i++) f.box(M.fabric, -W / 2 + 0.35 + (i + 0.5) * (W - 0.7) / 6, 2.85, D / 2 + 0.95, (W - 0.7) / 6, 0.05, 1.6, { color: i % 2 ? '#f2efe6' : S.awning, rx: 0.32, detail: true });
    }
    if (S.stall) { // fruit & veg on crates outside
      for (let i = 0; i < 4; i++) {
        const x = -W / 2 + 1.6 + i * 0.95;
        f.box(M.wood, x, 0.35, D / 2 + 0.9, 0.85, 0.7, 0.6, { color: '#8a6a44', detail: true });
        f.box(M.fruit, x, 0.78, D / 2 + 0.9, 0.78, 0.18, 0.52, { color: ['#e35d1a', '#4caf50', '#f4d03f', '#c0392b', '#7d3c98'][(R() * 5) | 0], detail: true });
      }
    }
    if (S.aboard) f.box(M.wood, W / 2 - 0.8, 0.5, D / 2 + 1.4, 0.6, 0.95, 0.12, { color: '#222', rx: 0.12, detail: true });
    // upstairs flat windows
    win(1.2, 5.0, 1.2, 1.35, v); win(-1.2, 5.0, 1.2, 1.35, (v + 2) % 4);
  }
  // rear: two-storey outrigger + back windows + yard wall
  f.box(wallMat, W / 2 - 1.3, (H - 0.8 - 2.6) / 2, -D / 2 - 2.1, 2.5, H - 0.8 + 2.6, 4.2, { tile: 1.3, color: tint, detail: true });
  f.geo(M.slate, roofGeo(2.5, 4.4, 1.2).rotateY(Math.PI / 2), W / 2 - 1.3, H - 0.8, -D / 2 - 2.1, { color: '#9aa0a8', detail: true });
  win(-1.0, 1.5, 1.0, 1.2, (v + 3) % 4, -D / 2 - 0.12 - 0.0);
  f.box(M.brick, 0, 0.9, -D / 2 - 4.6, W, 1.8, 0.22, { tile: 1.3, color: tint, detail: true });
  if (o.dish) f.geo(M.dish, new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, 0.9), -W / 2 + 0.7, H - 0.9, D / 2 + 0.25, { rx: Math.PI / 2 - 0.3, color: '#cfd2d4', detail: true });
}

// ---------------------------------------------------------------- terraces
export function buildTerraces(batch, M, net, occ, world, isBlocked, shopsCfg, signs) {
  const R = rng(1904);
  let shopIdx = 0; const shopSpots = [];
  const roads = [...net.roads].sort((a, b) => (a.kind === 'r') - (b.kind === 'r'));
  for (const r of roads) {
    for (const side of [1, -1]) {
      // which sides get frontage
      let housesHere = 0;
      for (let s = 4; s < r.length - 4;) {
        const P = net.pointAt(r, s, 0, {});
        const out = [side * P.tz, -side * P.tx]; // outward normal from the road on this side
        if (r.frontage === 'east' && out[0] < 0.2) { s += 5; continue; }
        if (r.frontage === 'south' && out[1] < 0.2) { s += 5; continue; }
        const t = s / r.length;
        const isShop = (r.shops || []).some(([a, b]) => t >= a && t <= b);
        const W = isShop ? 5.6 : (r.kind === 'a' ? 5.8 : 5.2);
        const setback = isShop ? 0 : (r.kind === 'a' ? 2.6 + R() * 1.5 : (r.kind === 'b' ? 1.6 : (R() < 0.5 ? 0 : 1.4)));
        const dist = r.half + r.pave + 0.35 + setback + 4;
        const cx = P.x + out[0] * dist, cz = P.z + out[1] * dist;
        const ry = Math.atan2(-out[0], -out[1]); // front (+Z local) faces the road
        const f = new Frame(batch, cx, cz, ry, 0);
        if (isBlocked(cx, cz) || !occ.rect(f, W / 2 - 0.25, -4 - 4.6, 4 + setback - 0.2, false)) { s += 2; housesHere = 0; continue; }
        // ginnel (passage) now and then in long rows
        if (housesHere > 0 && housesHere % 8 === 0 && !isShop && R() < 0.7) { housesHere++; s += 1.6; continue; }
        f.y0 = G(cx, cz) - 0.12;
        occ.rect(f, W / 2 + 0.05, -4 - 4.8, 4 + setback, true);
        const sh = isShop ? SHOP_ORDER[shopIdx++ % SHOP_ORDER.length] : null;
        let signCell = null;
        if (sh) { const i = sh.sign; signCell = { u0: (i % signs.cols) / signs.cols, u1: ((i % signs.cols) + 1) / signs.cols, v1: 1 - Math.floor(i / signs.cols) / signs.rows, v0: 1 - (Math.floor(i / signs.cols) + 1) / signs.rows }; shopSpots.push({ x: cx, z: cz, ry, front: f.world(0, 4 + 1.8), sign: i, road: r.name }); }
        house(batch, M, f, R, {
          w: W, shop: sh, signCell, disp: (R() * 4) | 0, shutter: R() < 0.12, bay: !isShop && r.kind !== 'b' && R() < 0.55,
          mirror: housesHere % 2 === 1, chimney: housesHere % 2 === 0, pipe: housesHere % 2 === 1, garden: setback, dish: R() < 0.3,
        });
        world.addOBB(cx, cz, W / 2, 4, ry, f.y0 - 2, f.y0 + 8, 'building', null).shop = !!sh;
        if (sh) world.boxes[world.boxes.length - 1].shopFront = f.world(0, 4);
        housesHere++;
        s += W;
      }
    }
  }
  return shopSpots;
}

// Shop line-up (index into SHOPS + extras). Mini mart early so it's near spawn.
const SHOP_ORDER = [
  { sign: 2 }, { sign: 1, stall: true, awning: '#b3121f' }, { sign: 0, awning: '#1f8a4c', stall: true, aboard: true, miniMart: true },
  { sign: 4, awning: '#b8862b' }, { sign: 3, aboard: true }, { sign: 7, stall: true, awning: '#2f7d2f' }, { sign: 8 }, { sign: 12, awning: '#1e3a8a', stall: true },
  { sign: 11 }, { sign: 9, aboard: true }, { sign: 15 }, { sign: 5 }, { sign: 6 }, { sign: 13 }, { sign: 16 }, { sign: 17, aboard: true },
  { sign: 18 }, { sign: 10 }, { sign: 19, awning: '#92400e' }, { sign: 14 }, { sign: 23 }, { sign: 20 }, { sign: 21 }, { sign: 22 }, { sign: 6 },
];
