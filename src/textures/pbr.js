// Procedural PBR texture sets (colour + roughness + normal), painted in
// code at load time. Used for weapons, hands, casings and the world.
// Every map is generated from seeded noise — no photos, no downloads.
import * as THREE from 'three';

// ---------- noise ----------
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const P = (a) => ((a % period) + period) % period;
  const a = hash(P(xi), P(yi), s), b = hash(P(xi + 1), P(yi), s);
  const c = hash(P(xi), P(yi + 1), s), d = hash(P(xi + 1), P(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Tileable fractal noise, returns 0..1. (x,y in 0..1)
export function fbm(x, y, { freq = 8, oct = 4, seed = 1, gain = 0.5 } = {}) {
  let amp = 1, sum = 0, norm = 0, f = freq;
  for (let o = 0; o < oct; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 17, f) * amp;
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- helpers ----------
function makeCanvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }

function texFromRGBA(n, data, srgb) {
  const c = makeCanvas(n); const g = c.getContext('2d');
  const img = g.createImageData(n, n); img.data.set(data); g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

// height (Float32Array n*n, 0..1) -> tangent-space normal map
function normalFromHeight(n, h, strength) {
  const out = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const xl = h[y * n + ((x - 1 + n) % n)], xr = h[y * n + ((x + 1) % n)];
    const yu = h[((y - 1 + n) % n) * n + x], yd = h[((y + 1) % n) * n + x];
    let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * n + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

// Build a PBR set from a per-pixel function returning {r,g,b, rough, h}.
function buildSet(n, fn, normalStrength = 2) {
  const col = new Uint8ClampedArray(n * n * 4), rough = new Uint8ClampedArray(n * n * 4), h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = fn(x / n, y / n, x, y);
    const i = (y * n + x) * 4;
    col[i] = p.r; col[i + 1] = p.g; col[i + 2] = p.b; col[i + 3] = 255;
    // three.js reads roughness from G and metalness from B
    rough[i] = 0; rough[i + 1] = Math.max(0, Math.min(255, p.rough * 255)); rough[i + 2] = Math.max(0, Math.min(255, (p.metal ?? 0) * 255)); rough[i + 3] = 255;
    h[y * n + x] = p.h ?? 0;
  }
  return {
    map: texFromRGBA(n, col, true),
    roughnessMap: texFromRGBA(n, rough, false),
    normalMap: texFromRGBA(n, normalFromHeight(n, h, normalStrength * n / 256), false),
  };
}

// Random scratch field: returns function (u,v)->0..1 intensity
function scratchField(n, count, seed, maxLen = 0.25) {
  const r = rng(seed);
  const buf = new Float32Array(n * n);
  for (let s = 0; s < count; s++) {
    let x = r() * n, y = r() * n;
    const a = r() * Math.PI * 2, len = (0.02 + r() * maxLen) * n, w = r() * 0.6 + 0.4;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let k = 0; k < len; k++) {
      const xi = ((Math.round(x + dx * k) % n) + n) % n, yi = ((Math.round(y + dy * k) % n) + n) % n;
      buf[yi * n + xi] = Math.max(buf[yi * n + xi], w * (1 - Math.abs(k / len - 0.5) * 1.6));
    }
  }
  return (x, y) => buf[y * n + x];
}

const cache = new Map();
function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }

// ---------- material sets ----------
// Blued / parkerised steel with handling wear, fine scratches and pitting.
export function gunSteel(n = 512, { tint = [42, 44, 50], wear = 0.5, seed = 3 } = {}) {
  return cached(`steel${n}${tint}${wear}${seed}`, () => {
    const sc = scratchField(n, 260, seed, 0.12);
    return buildSet(n, (u, v, x, y) => {
      const mott = fbm(u, v, { freq: 6, oct: 5, seed });
      const fine = fbm(u, v, { freq: 64, oct: 2, seed: seed + 5 });
      const worn = Math.max(0, fbm(u, v, { freq: 3, oct: 4, seed: seed + 9 }) - (1 - wear * 0.45)) * 4;
      const s = sc(x, y);
      const bright = Math.min(1, worn * 0.8 + s * 0.7);
      const base = 0.85 + mott * 0.3;
      return {
        r: tint[0] * base + bright * 120, g: tint[1] * base + bright * 118, b: tint[2] * base + bright * 112,
        rough: 0.42 + (fine - 0.5) * 0.18 - bright * 0.22 + mott * 0.06, metal: 1,
        h: fine * 0.15 - s * 0.35 + mott * 0.2,
      };
    }, 1.2);
  });
}

// Polished bright steel (cylinder faces, hammer, trigger, bolt).
export function brightSteel(n = 256) {
  return cached('bright' + n, () => {
    const sc = scratchField(n, 120, 11, 0.1);
    return buildSet(n, (u, v, x, y) => {
      const b = fbm(u, v, { freq: 20, oct: 3, seed: 12 });
      const s = sc(x, y);
      const c = 150 + b * 30 + s * 40;
      return { r: c, g: c, b: c + 6, rough: 0.2 + b * 0.1 - s * 0.05, metal: 1, h: b * 0.1 - s * 0.2 };
    }, 1);
  });
}

// Oiled walnut / laminated birch furniture with grain.
export function woodSet(n = 512, { base = [118, 56, 30], seed = 21, laminate = false } = {}) {
  return cached(`wood${n}${base}${seed}${laminate}`, () => {
    const sc = scratchField(n, 90, seed + 1, 0.08);
    return buildSet(n, (u, v, x, y) => {
      const warp = fbm(u, v, { freq: 2, oct: 3, seed }) * 1.2;
      const grain = Math.sin((v * 5 + warp * 0.35 + fbm(u, v, { freq: 24, oct: 2, seed: seed + 7 }) * 0.25) * Math.PI * 2) * 0.5 + 0.5;
      const fine = fbm(u * 0.25, v * 6, { freq: 16, oct: 3, seed: seed + 3 });
      const lam = laminate ? (Math.floor(v * 3 + warp * 0.2) % 2) * 0.1 : 0;
      const g = 0.7 + grain * 0.25 + fine * 0.2 - lam;
      const s = sc(x, y);
      return {
        r: base[0] * g + s * 60, g: base[1] * g + s * 40, b: base[2] * g + s * 25,
        rough: 0.38 + grain * 0.15 + s * 0.25, metal: 0, h: grain * 0.25 + fine * 0.2 - s * 0.4,
      };
    }, 1.5);
  });
}

// Moulded polymer / bakelite with fine stipple.
export function polymerSet(n = 256, { base = [26, 26, 28], seed = 31, stipple = 0.6 } = {}) {
  return cached(`poly${n}${base}${seed}`, () => buildSet(n, (u, v) => {
    const st = fbm(u, v, { freq: 96, oct: 2, seed });
    const m = fbm(u, v, { freq: 5, oct: 3, seed: seed + 1 });
    const c = 0.9 + m * 0.2;
    return { r: base[0] * c, g: base[1] * c, b: base[2] * c, rough: 0.55 + st * 0.2, metal: 0, h: st * stipple };
  }, 2.5));
}

// Diamond checkering (grips).
export function checkeredSet(n = 256, { base = [40, 22, 14], seed = 41 } = {}) {
  return cached(`check${n}${base}`, () => buildSet(n, (u, v) => {
    const k = 22;
    const a = Math.abs(((u + v) * k) % 1 - 0.5), b = Math.abs(((u - v + 4) * k) % 1 - 0.5);
    const d = Math.min(a, b);
    const peak = Math.min(1, d * 4);
    const m = fbm(u, v, { freq: 6, oct: 3, seed });
    const c = 0.75 + peak * 0.35 + m * 0.1;
    return { r: base[0] * c, g: base[1] * c, b: base[2] * c, rough: 0.5 + (1 - peak) * 0.2, metal: 0, h: peak };
  }, 3));
}

// Brass (cartridge cases, medallions).
export function brassSet(n = 128) {
  return cached('brass' + n, () => buildSet(n, (u, v) => {
    const m = fbm(u, v, { freq: 8, oct: 3, seed: 51 });
    return { r: 205 + m * 30, g: 150 + m * 25, b: 70 + m * 15, rough: 0.28 + m * 0.15, metal: 1, h: m * 0.1 };
  }, 1));
}

// Leather/synthetic tactical glove.
export function gloveSet(n = 256) {
  return cached('glove' + n, () => buildSet(n, (u, v) => {
    const grain = fbm(u, v, { freq: 48, oct: 3, seed: 61 });
    const m = fbm(u, v, { freq: 4, oct: 3, seed: 62 });
    const c = 0.8 + m * 0.3;
    return { r: 34 * c, g: 33 * c, b: 31 * c, rough: 0.72 + grain * 0.15, metal: 0, h: grain * 0.9 };
  }, 2));
}

// Woven jacket fabric for sleeves.
export function fabricSet(n = 256, base = [52, 60, 48]) {
  return cached('fabric' + n + base, () => buildSet(n, (u, v) => {
    const wx = Math.sin(u * n * Math.PI * 0.5) * 0.5 + 0.5, wy = Math.sin(v * n * Math.PI * 0.5) * 0.5 + 0.5;
    const weave = (Math.floor(u * n / 2) + Math.floor(v * n / 2)) % 2 ? wx : wy;
    const m = fbm(u, v, { freq: 5, oct: 4, seed: 71 });
    const c = 0.75 + weave * 0.15 + m * 0.25;
    return { r: base[0] * c, g: base[1] * c, b: base[2] * c, rough: 0.9, metal: 0, h: weave * 0.6 + m * 0.3 };
  }, 1.5));
}

// ---------- world surfaces ----------
export function brickPBR(n = 512) {
  return cached('brick' + n, () => {
    const rows = 16, cols = 4;
    const r = rng(7);
    const tints = []; for (let i = 0; i < rows * (cols + 1); i++) tints.push([(r() - 0.5) * 40, r() < 0.12 ? -40 : 0]);
    return buildSet(n, (u, v) => {
      const row = Math.floor(v * rows), off = (row % 2) * 0.5;
      const bu = u * cols + off, col = Math.floor(bu);
      const fu = bu - col, fv = v * rows - row;
      const mortar = Math.min(fu, 1 - fu) < 0.035 || Math.min(fv, 1 - fv) < 0.09;
      const t = tints[(row * (cols + 1) + ((col % cols) + cols) % cols) % tints.length];
      const n1 = fbm(u, v, { freq: 32, oct: 3, seed: 8 });
      const edge = Math.min(Math.min(fu, 1 - fu) * cols * 2, Math.min(fv, 1 - fv) * 2.5, 1);
      if (mortar) { const m = 120 + n1 * 40; return { r: m, g: m * 0.96, b: m * 0.9, rough: 0.95, h: 0.1 + n1 * 0.1 }; }
      const b = 0.8 + n1 * 0.35;
      return { r: (170 + t[0] + t[1]) * b, g: (88 + t[0] * 0.6 + t[1]) * b, b: (64 + t[0] * 0.5 + t[1]) * b, rough: 0.82 + n1 * 0.12, h: 0.55 + edge * 0.3 + n1 * 0.25 };
    }, 5);
  });
}

// Dressed (sawn) sandstone / concrete: sills, lintels, copings, kerbs.
// Fine speckled grain, faint weathering, no joints.
export function dressedPBR(n = 256) {
  return cached('dressed' + n, () => buildSet(n, (u, v) => {
    const g = fbm(u, v, { freq: 64, oct: 3, seed: 31 }), w = fbm(u, v, { freq: 6, oct: 3, seed: 32 });
    const speck = (Math.sin(u * 2113.1 + v * 977.7) * 43758.5) % 1;
    const c = 0.86 + g * 0.16 - w * 0.1 + (Math.abs(speck) > 0.93 ? -0.12 : 0);
    return { r: 214 * c, g: 206 * c, b: 190 * c, rough: 0.85, h: g * 0.6 + w * 0.2 };
  }, 1.2));
}

export function stonePBR(n = 256) {
  return cached('stone' + n, () => {
    const r = rng(9); const blocks = [];
    let y = 0; while (y < 1) { const h = 0.12 + r() * 0.1; let x = -r() * 0.2; while (x < 1.2) { const w = 0.18 + r() * 0.25; blocks.push([x, y, w, h, (r() - 0.5) * 40]); x += w; } y += h; }
    return buildSet(n, (u, v) => {
      const n1 = fbm(u, v, { freq: 24, oct: 4, seed: 10 });
      for (const [bx, by, bw, bh, t] of blocks) {
        const uu = ((u - bx) % 1 + 1) % 1;
        if (uu < bw && v >= by && v < by + bh) {
          const fu = uu / bw, fv = (v - by) / bh;
          const d = Math.min(fu * bw, (1 - fu) * bw, fv * bh, (1 - fv) * bh);
          if (d < 0.008) break;
          const c = 0.8 + n1 * 0.4;
          return { r: (140 + t) * c, g: (128 + t) * c, b: (104 + t) * c, rough: 0.9, h: Math.min(1, d * 30) * 0.5 + n1 * 0.5 };
        }
      }
      return { r: 70, g: 66, b: 60, rough: 1, h: 0 };
    }, 5);
  });
}

export function asphaltPBR(n = 512) {
  return cached('asphalt' + n, () => buildSet(n, (u, v) => {
    const agg = fbm(u, v, { freq: 128, oct: 2, seed: 13 });
    const m = fbm(u, v, { freq: 4, oct: 4, seed: 14 });
    const patch = fbm(u, v, { freq: 2, oct: 3, seed: 15 }) > 0.62 ? -12 : 0;
    const c = 52 + agg * 40 + m * 18 + patch;
    return { r: c, g: c, b: c * 1.04, rough: 0.85 + agg * 0.1 - (m > 0.7 ? 0.25 : 0), h: agg };
  }, 2.5));
}

export function pavingPBR(n = 256) {
  return cached('paving' + n, () => buildSet(n, (u, v) => {
    const fu = (u * 2) % 1, fv = (v * 2) % 1;
    const joint = Math.min(fu, 1 - fu, fv, 1 - fv) < 0.012;
    const slab = Math.floor(u * 2) + Math.floor(v * 2) * 2;
    const n1 = fbm(u, v, { freq: 48, oct: 3, seed: 16 });
    const stain = fbm(u, v, { freq: 3, oct: 3, seed: 17 });
    const c = (150 + (slab * 7) % 18 - 9) * (0.85 + n1 * 0.25) - (stain > 0.66 ? 25 : 0);
    if (joint) return { r: 70, g: 68, b: 64, rough: 1, h: 0 };
    return { r: c, g: c * 0.98, b: c * 0.94, rough: 0.8 + n1 * 0.15, h: 0.6 + n1 * 0.3 };
  }, 4));
}

// Close-mown lawn seen from above: thousands of painted blades in mixed
// greens over a thatch of dry dead blades and dark soil, with clover
// patches; tiles seamlessly.
export function grassPBR(n = 256) {
  return cached('grass2' + n, () => {
    const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
    const r = rng(181), k = n / 256;
    g.fillStyle = 'rgb(52,58,34)'; g.fillRect(0, 0, n, n);
    const line = (x, y, a, len, w, col) => {
      const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
      g.strokeStyle = col; g.lineWidth = w;
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
        if (x + ox + len < 0 || x + ox - len > n || y + oy + len < 0 || y + oy - len > n) continue;
        g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + dx, y + oy + dy); g.stroke();
      }
    };
    g.lineCap = 'round';
    for (let i = 0; i < 1800 * k * k; i++) line(r() * n, r() * n, r() * 6.3, (3 + r() * 6) * k, (0.7 + r() * 0.6) * k, `hsl(${40 + r() * 18},${28 + r() * 18}%,${26 + r() * 18}%)`);   // thatch
    for (let i = 0; i < 26; i++) {                                                                                                   // clover patches
      const cx = r() * n, cy = r() * n, rad = (6 + r() * 12) * k;
      for (let j = 0; j < 40 * k; j++) { const a = r() * 6.3, d = r() * rad; g.fillStyle = `hsl(${95 + r() * 15},${40 + r() * 15}%,${22 + r() * 12}%)`; g.beginPath(); g.arc((cx + Math.cos(a) * d + n) % n, (cy + Math.sin(a) * d + n) % n, (1.2 + r()) * k, 0, 7); g.fill(); }
    }
    for (let i = 0; i < 7000 * k * k; i++) {                                                                                         // live blades
      const lum = 20 + r() * 26, tip = r() < 0.12;
      line(r() * n, r() * n, r() * 6.3, (2.5 + r() * 5) * k, (0.6 + r() * 0.7) * k, tip ? `hsl(${62 + r() * 12},${35 + r() * 15}%,${lum + 10}%)` : `hsl(${78 + r() * 26},${34 + r() * 26}%,${lum}%)`);
    }
    const px = g.getImageData(0, 0, n, n).data;
    return buildSet(n, (u, v, x, y) => {
      const i = (y * n + x) * 4, R = px[i], G = px[i + 1], B = px[i + 2];
      return { r: R, g: G, b: B, rough: 0.92, h: (R + G * 1.4 + B) / (3.4 * 255) };
    }, 3);
  });
}

export function slatePBR(n = 256) {
  return cached('slate' + n, () => buildSet(n, (u, v) => {
    const row = Math.floor(v * 10), off = (row % 2) * 0.5;
    const fu = (u * 6 + off) % 1, fv = (v * 10) % 1;
    const n1 = fbm(u, v, { freq: 32, oct: 3, seed: 20 });
    const edge = fv < 0.08 ? 0 : 1;
    const gap = fu < 0.03;
    const c = (gap ? 35 : 72) * (0.85 + n1 * 0.3);
    return { r: c * 0.95, g: c, b: c * 1.08, rough: 0.6 + n1 * 0.2, h: edge * (0.5 + fv * 0.3) + n1 * 0.2 };
  }, 4));
}

// Apply a set to a MeshStandardMaterial.
export function standard(set, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: set.map, roughnessMap: set.roughnessMap, metalnessMap: opts.metalness !== undefined ? null : set.roughnessMap,
    normalMap: set.normalMap, roughness: 1, metalness: opts.metalness ?? 1,
    normalScale: new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1),
    envMapIntensity: opts.env ?? 1, color: opts.color ?? 0xffffff, vertexColors: !!opts.vertexColors,
  });
}
