// Procedural sky dome: a typical Sheffield sky — broken cumulus and
// stratocumulus over pale blue, brighter towards the sun, hazy near the
// horizon so it melts into the distance fog.
import * as THREE from 'three';
import { fbm } from '../textures/pbr.js';

export function makeSky({ night = false, horizon = 0xd3d6d2 } = {}) {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const hz = new THREE.Color(horizon), zen = new THREE.Color(night ? 0x0b1020 : 0x6f98c8), cloudLit = new THREE.Color(night ? 0x303544 : 0xf4f3ef), cloudDark = new THREE.Color(night ? 0x15171e : 0x9aa2ab);
  const sunU = 0.1, sunV = 0.28;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;                 // v: 0 = zenith, 0.5 = horizon
    const elev = Math.max(0, 1 - v * 2);        // 1 at zenith, 0 at horizon
    const base = hz.clone().lerp(zen, Math.pow(elev, 0.55));
    // clouds: stretched fbm, thinner near the horizon for perspective
    const n = fbm(u * 2, v * 1.3, { freq: 6, oct: 5, seed: 17 }), n2 = fbm(u * 2 + 0.3, v * 1.3, { freq: 18, oct: 3, seed: 29 });
    const cover = Math.max(0, Math.min(1, (n * 0.8 + n2 * 0.25 - 0.47) * 3.2)) * (0.35 + 0.65 * Math.min(1, elev * 3 + 0.2));
    const shade = cloudDark.clone().lerp(cloudLit, Math.min(1, Math.max(0, (n2 - 0.35) * 2 + 0.3)));
    const col = base.lerp(shade, cover * (v < 0.5 ? 1 : 0));
    // sun glow
    const du = Math.min(Math.abs(u - sunU), 1 - Math.abs(u - sunU)), dv = v - sunV, sd = Math.sqrt(du * du * 4 + dv * dv);
    const glow = night ? 0 : Math.exp(-sd * 18) * 0.6 * (1 - cover * 0.7);
    const i = (y * W + x) * 4;
    d[i] = Math.min(255, (col.r + glow) * 255); d[i + 1] = Math.min(255, (col.g + glow * 0.95) * 255); d[i + 2] = Math.min(255, (col.b + glow * 0.85) * 255); d[i + 3] = 255;
    if (v >= 0.5) { d[i] = hz.r * 255 * 0.92; d[i + 1] = hz.g * 255 * 0.92; d[i + 2] = hz.b * 255 * 0.92; }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.LinearSRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(650, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  return sky;
}
