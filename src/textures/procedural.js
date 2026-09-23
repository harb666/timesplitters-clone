// Every texture in the game is painted here in code at start-up, so there
// are no image downloads and nothing copied from photos. Small sizes keep
// GPU memory low on iPhone.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Tiny seeded random so textures look the same every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 2;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Sheffield red/brown brick. One texture tile = 2m x 2m of wall.
export function brickTexture(seed = 1, base = [150, 70, 50]) {
  const [c, g] = canvas(128, 128);
  const r = rng(seed);
  g.fillStyle = '#8e8373'; g.fillRect(0, 0, 128, 128); // mortar
  const rows = 16, bw = 32, bh = 128 / rows;
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * (bw / 2);
    for (let x = -1; x < 128 / bw + 1; x++) {
      const v = (r() - 0.5) * 34;
      const soot = r() < 0.12 ? -35 : 0;
      g.fillStyle = `rgb(${base[0] + v + soot | 0},${base[1] + v * 0.6 + soot | 0},${base[2] + v * 0.5 + soot | 0})`;
      g.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, bh - 2);
    }
  }
  return toTexture(c);
}

// Gritstone blocks for garden walls and older buildings.
export function stoneTexture(seed = 7) {
  const [c, g] = canvas(128, 128);
  const r = rng(seed);
  g.fillStyle = '#5b5750'; g.fillRect(0, 0, 128, 128);
  let y = 0;
  while (y < 128) {
    const h = 14 + r() * 12; let x = -r() * 20;
    while (x < 128) {
      const w = 22 + r() * 30, v = (r() - 0.5) * 40;
      g.fillStyle = `rgb(${128 + v | 0},${118 + v | 0},${98 + v | 0})`;
      g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
      x += w;
    }
    y += h;
  }
  return toTexture(c);
}

// Pavement flags: 1 tile = 2m.
export function pavementTexture() {
  const [c, g] = canvas(64, 64);
  const r = rng(3);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const v = (r() - 0.5) * 18;
    g.fillStyle = `rgb(${150 + v | 0},${148 + v | 0},${142 + v | 0})`;
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  g.strokeStyle = 'rgba(60,60,60,.6)'; g.lineWidth = 1;
  for (let i = 0; i <= 64; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,40,40,${r() * 0.25})`; g.fillRect(r() * 64, r() * 64, 2, 2); }
  return toTexture(c);
}

// Asphalt: 1 tile = 4m.
export function asphaltTexture() {
  const [c, g] = canvas(128, 128);
  const r = rng(11);
  g.fillStyle = '#3a3b3e'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = 40 + r() * 50;
    g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; g.fillRect(r() * 128, r() * 128, 1, 1);
  }
  // patch repairs — every Sheffield road has them
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(20,20,22,.35)'; g.fillRect(r() * 100, r() * 100, 16 + r() * 20, 10 + r() * 16); }
  return toTexture(c);
}

export function grassTexture() {
  const [c, g] = canvas(64, 64);
  const r = rng(5);
  g.fillStyle = '#4f7a36'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 500; i++) { const v = (r() - 0.5) * 50; g.fillStyle = `rgb(${80 + v | 0},${122 + v | 0},${54 + v * 0.5 | 0})`; g.fillRect(r() * 64, r() * 64, 1, 2); }
  return toTexture(c);
}

// Generic painted sign. Returns a texture sized to the text.
export function signTexture({ text, sub = '', bg = '#1d5c3a', fg = '#ffffff', accent = '#ffcc00', w = 512, h = 96, font = 'bold 54px "Trebuchet MS", sans-serif' }) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, h - 8, w, 8);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = font;
  g.fillText(text, w / 2, sub ? h * 0.4 : h * 0.47, w - 20);
  if (sub) { g.font = `bold ${Math.round(h * 0.2)}px "Trebuchet MS", sans-serif`; g.fillStyle = accent; g.fillText(sub, w / 2, h * 0.78, w - 20); }
  return toTexture(c, false);
}

// Shop window: shelves of colourful stuff seen through glass.
export function shopWindowTexture(seed = 2) {
  const [c, g] = canvas(128, 64);
  const r = rng(seed);
  g.fillStyle = '#20303a'; g.fillRect(0, 0, 128, 64);
  for (let s = 0; s < 3; s++) {
    const y = 12 + s * 18;
    g.fillStyle = '#6b5b45'; g.fillRect(0, y + 10, 128, 3);
    for (let x = 2; x < 126;) {
      const w = 4 + r() * 7, hh = 5 + r() * 6;
      g.fillStyle = `hsl(${r() * 360 | 0},70%,${45 + r() * 20 | 0}%)`;
      g.fillRect(x, y + 10 - hh, w, hh); x += w + 1;
    }
  }
  // glass sheen
  const grd = g.createLinearGradient(0, 0, 128, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.22)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(0.7, 'rgba(255,255,255,.12)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
  return toTexture(c, false);
}

// Posters stuck in the shop window — original silly adverts.
export function posterTexture(title, line, color = '#ff3d7f') {
  const [c, g] = canvas(64, 96);
  g.fillStyle = '#fff8e6'; g.fillRect(0, 0, 64, 96);
  g.fillStyle = color; g.fillRect(0, 0, 64, 30);
  g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
  g.fillText(title, 32, 20, 60);
  g.fillStyle = '#222'; g.font = 'bold 9px sans-serif';
  const words = line.split(' '); let row = '', y = 44;
  for (const w of words) {
    if (g.measureText(row + w).width > 58) { g.fillText(row, 32, y); row = ''; y += 11; }
    row += w + ' ';
  }
  g.fillText(row, 32, y);
  return toTexture(c, false);
}

// Terraced house window (sash style) with random curtains.
export function houseWindowTexture(seed = 4) {
  const [c, g] = canvas(32, 48);
  const r = rng(seed);
  g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 32, 48);
  g.fillStyle = '#1f2a33'; g.fillRect(3, 3, 26, 42);
  const curtain = `hsl(${r() * 360 | 0},${30 + r() * 40 | 0}%,${35 + r() * 25 | 0}%)`;
  g.fillStyle = curtain; g.fillRect(3, 3, 7, 42); g.fillRect(22, 3, 7, 42);
  g.fillStyle = '#f2efe6'; g.fillRect(3, 22, 26, 3); g.fillRect(15, 3, 2, 42);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(10, 5, 4, 15);
  return toTexture(c, false);
}

// Original badge for the fictional "Falcon R" hot hatch: a stylised wing
// chevron in a hexagon. No real manufacturer marks.
export function falconBadgeTexture() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#d7dde3';
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); }
  g.closePath(); g.fill();
  g.fillStyle = '#15181c';
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25); }
  g.closePath(); g.fill();
  g.fillStyle = '#e63b2e';
  g.beginPath(); g.moveTo(12, 24); g.lineTo(32, 44); g.lineTo(52, 24); g.lineTo(44, 24); g.lineTo(32, 36); g.lineTo(20, 24); g.closePath(); g.fill();
  g.fillStyle = '#d7dde3';
  g.beginPath(); g.moveTo(20, 18); g.lineTo(32, 30); g.lineTo(44, 18); g.lineTo(38, 18); g.lineTo(32, 24); g.lineTo(26, 18); g.closePath(); g.fill();
  const t = toTexture(c, false);
  return t;
}

// UK-style number plate with a made-up registration.
export function plateTexture(text, rear = false) {
  const [c, g] = canvas(128, 28);
  g.fillStyle = rear ? '#f5c518' : '#f4f4f0'; g.fillRect(0, 0, 128, 28);
  g.fillStyle = '#111'; g.font = 'bold 20px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 15, 120);
  return toTexture(c, false);
}

// Soft round glow used for muzzle flash, lamps and headlights.
export function glowTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,240,200,.8)');
  grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

// Soft dark blob used as a cheap shadow under cars and characters.
export function blobShadowTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

// Sky gradient for the scene background.
export function skyTexture() {
  const [c, g] = canvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#5f8fc4'); grd.addColorStop(0.55, '#a9c3db'); grd.addColorStop(1, '#e6dccb');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
