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

// Shop signs: invented names, true to the kind of shop that is really at
// each spot (the map data gives the category, never the real name).
export const SHOPS = [
  ['FIR VALE MINI MART', 'OPEN LATE · FRESH SAMOSAS · PHONE TOP-UP', '#15603a', '#ffcc00', 'miniMart'],
  ['POTRAVINY', 'SLOVENSKÉ · ČESKÉ · POLSKIE POTRAVINY', '#b3121f', '#ffffff', 'grocer'],
  ['EUROPA FOODS', 'POLISH · SLOVAK · ROMANIAN', '#1e3a8a', '#fcd34d', 'grocer'],
  ['VALE SUPERSTORE', 'GROCERY · HALAL MEAT · FRESH VEG', '#0e5e4a', '#f7e27a', 'grocer'],
  ['FRESH FRUIT & VEG', 'DAILY · WHOLESALE PRICES', '#2f7d2f', '#ffffff', 'grocer'],
  ['BARGAIN PALACE', 'HOUSEHOLD · TOYS · EVERYTHING', '#4b1c78', '#ffe14d', 'bargain'],
  ['DOLLAR & POUND', 'EVERYTHING £1 AND UP', '#be123c', '#ffffff', 'bargain'],
  ['VALE DIY', 'TOOLS · PAINT · KEYS CUT', '#f59e0b', '#1f2937', 'hardware'],
  ['CORNER BAKERY', 'NAAN · ROTI · PASTRIES', '#92400e', '#ffedd5', 'bakery'],
  ['GOLDEN CRUST', 'BAKERS · CAKES TO ORDER', '#7c2d12', '#fde68a', 'bakery'],
  ['GOLDEN SPOON', 'SWEET CENTRE · CAKES · PARTY TRAYS', '#7a1b1b', '#ffd36b', 'sweets'],
  ['SUGAR RUSH', 'DESSERTS · SHAKES · WAFFLES', '#db2777', '#fff1f2', 'sweets'],
  ['CAFE KARPATY', 'HOT FOOD · COFFEE · CAKES', '#78350f', '#fde68a', 'cafe'],
  ['CHAI CORNER', 'KARAK CHAI · SNACKS', '#065f46', '#fef3c7', 'cafe'],
  ['PERI & PIZZA', 'PIZZA · WINGS · BURGERS', '#c1121f', '#fff1c1', 'takeaway'],
  ['SPICE KITCHEN', 'CURRIES · GRILLS · DELIVERY', '#1a1a1a', '#ff8c1a', 'takeaway'],
  ['KEBAB HOUSE', 'DONERS · WRAPS · CHIPS', '#7f1d1d', '#fde047', 'kebab'],
  ['PIZZA VALE', 'FREE DELIVERY OVER £15', '#b91c1c', '#ffffff', 'pizza'],
  ['CLUCK STOP', 'FRIED CHICKEN · PERI · RICE', '#ea580c', '#ffffff', 'chicken'],
  ['CHARCOAL GRILL', 'KARAHI · TIKKA · SEEKH', '#111827', '#f97316', 'grill'],
  ['SMOKEHOUSE', 'SMOKED MEATS · SAUSAGES', '#3f1d0b', '#fcd34d', 'grill'],
  ['VALE PHARMACY', 'NHS PRESCRIPTIONS · ADVICE', '#f0fdf4', '#15803d', 'pharmacy'],
  ['PHONE DOCTOR 24/7', 'SCREENS · UNLOCKING · ACCESSORIES', '#0d3b66', '#7fd1ff', 'phones'],
  ['UNLOCK ZONE', 'PHONES · LAPTOPS · REPAIRS', '#111111', '#22d3ee', 'phones'],
  ['FIR VALE FABRICS', 'SILKS · SUITS · WEDDING WEAR', '#831843', '#fbcfe8', 'fashion'],
  ['SILK & THREAD', 'LADIES WEAR · ABAYAS · SCARVES', '#5b2a86', '#f5d0fe', 'fashion'],
  ['BRIDAL BOUTIQUE', 'PARTY · BRIDAL · MENSWEAR', '#9d174d', '#fde68a', 'fashion'],
  ['GOLD HOUSE', 'JEWELLERS · 22CT GOLD', '#1c1917', '#facc15', 'jeweller'],
  ['SKYLINE TRAVEL', 'FLIGHTS · VISAS · CARGO', '#075985', '#e0f2fe', 'travel'],
  ['MONEY TRANSFER', 'SEND MONEY HOME · PHONE CARDS', '#0b6e99', '#ffffff', 'money'],
  ['FIRST PAST THE POST', 'BETTING · RACING · FOOTBALL', '#14532d', '#ffffff', 'bookie'],
  ['GLAM & GO', 'HAIR · BEAUTY · THREADING', '#be185d', '#ffffff', 'salon'],
  ['VALE CUTZ', 'GENTS BARBERS · WALK-INS WELCOME', '#111111', '#ff3b3b', 'barber'],
  ['ESTATE AGENTS', 'SALES · LETTINGS · VALUATIONS', '#0c4a6e', '#bae6fd', 'estate'],
  ['CLAIMS & COUNSEL', 'SOLICITORS · ACCOUNTANTS', '#1e293b', '#e2e8f0', 'office'],
  ['SOFA CITY', 'FURNITURE · CARPETS · BEDS', '#7c3aed', '#ffffff', 'furniture'],
  ['LAUNDERETTE', 'SERVICE WASH · DRY CLEANING', '#0f766e', '#ccfbf1', 'laundry'],
  ['TAILORING', 'ALTERATIONS · SUITS · DRESSES', '#4c1d95', '#ede9fe', 'tailor'],
  ['DENTAL SURGERY', 'NHS & PRIVATE PATIENTS', '#f8fafc', '#0369a1', 'dentist'],
  ['MEDICAL CENTRE', 'GP SURGERY · APPOINTMENTS', '#f8fafc', '#1d4ed8', 'doctor'],
  ['COMMUNITY HUB', 'ADVICE · CLASSES · FOOD BANK', '#155e75', '#ecfeff', 'community'],
  ['TO LET', 'ALL ENQUIRIES 0114 000 0000', '#e9e6dd', '#c0392b', 'tolet'],
];
export function signAtlas() {
  const cols = 4, rows = Math.ceil(SHOPS.length / cols), W = 512, H = 96;
  const [c, g] = canvas(cols * W, rows * H);
  const cells = {};
  SHOPS.forEach(([name, sub, bg, fg, cat], i) => {
    (cells[cat] = cells[cat] || []).push(i);
    const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    g.fillStyle = bg; g.fillRect(x, y, W, H);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x, y + H - 10, W, 10);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 50px "Arial Narrow", Arial, sans-serif'; g.fillText(name, x + W / 2, y + 38, W - 30);
    g.font = 'bold 17px Arial, sans-serif'; g.fillText(sub, x + W / 2, y + 76, W - 30);
    if (cat === 'pharmacy') { g.fillStyle = '#16a34a'; g.fillRect(x + 14, y + 28, 36, 12); g.fillRect(x + 26, y + 16, 12, 36); }
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(x + Math.random() * W, y + Math.random() * H, 2 + Math.random() * 20, 1 + Math.random() * 3); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const cell = (i) => ({ u0: (i % cols) / cols, u1: ((i % cols) + 1) / cols, v1: 1 - Math.floor(i / cols) / rows, v0: 1 - (Math.floor(i / cols) + 1) / rows });
  return { tex: t, cols, rows, count: SHOPS.length, cells, cell };
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

