// Photoreal sky, rendered once at load into a cube map:
//  * physically based atmosphere: Rayleigh + Mie single scattering through
//    a spherical atmosphere (the real reason the sky is blue, the horizon
//    pale and the sun's surroundings bright),
//  * volumetric cumulus: a cloud layer 1.2-2.6 km up, ray-marched through
//    3-D noise, lit by the sun with self-shadowing, forward scattering
//    (silver linings), powder darkening and sky/ground ambient light, and
//    faded into the haze with distance,
//  * the sun disc.
// The same cube lights the world (pre-filtered environment map) and gives
// the fog/haze its colour, so buildings, guns and sky all match.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;
uniform float coverage, seed, steps, scale, probe;
const float PI = 3.14159265;
const float Re = 6360e3, Ra = 6420e3, Hr = 8000.0, Hm = 1200.0;
const vec3 bR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float bM = 21e-6;
const float SUN = 22.0;

vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d); return vec2(-b - d, -b + d);
}
// optical depth (Rayleigh, Mie) from p towards the sun
vec2 lightDepth(vec3 p, vec3 l) {
  float t = sphere(p, l, Ra).y, st = t / 6.0; vec2 od = vec2(0.0);
  for (int i = 0; i < 6; i++) { vec3 q = p + l * (st * (float(i) + 0.5)); float h = length(q) - Re; od += exp(-h / vec2(Hr, Hm)) * st; }
  return od;
}
vec3 transmittanceTo(vec3 p, vec3 l) { vec2 od = lightDepth(p, l); return exp(-(bR * od.x + bM * 1.1 * od.y)); }

vec3 atmosphere(vec3 rd, float tMax) {
  vec3 ro = vec3(0.0, Re + 120.0, 0.0);
  float t = min(sphere(ro, rd, Ra).y, tMax);
  float st = t / 16.0; vec2 od = vec2(0.0); vec3 sR = vec3(0.0), sM = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    vec3 p = ro + rd * (st * (float(i) + 0.5));
    float h = max(0.0, length(p) - Re);
    vec2 d = exp(-h / vec2(Hr, Hm)) * st; od += d;
    vec2 ld = lightDepth(p, sunDir);
    vec3 tau = bR * (od.x + ld.x) + bM * 1.1 * (od.y + ld.y);
    vec3 tr = exp(-tau);
    sR += d.x * tr; sM += d.y * tr;
  }
  float mu = dot(rd, sunDir), g = 0.76;
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  return SUN * (sR * bR * pR + sM * bM * pM);
}

// --- noise ---
float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }

const float CB = 1300.0, CT = 2700.0;     // cloud base / top (m)
float cloudDensity(vec3 p, bool cheap) {
  float h = (length(p) - Re - CB) / (CT - CB);
  if (h < 0.0 || h > 1.0) return 0.0;
  vec3 q = p * 0.00022 + vec3(seed, 0.0, seed * 0.7);
  float cov = fbm(vec3(q.x, 0.0, q.z) * 0.9, 4);                            // where the clouds are
  float thr = mix(1.0 - coverage, 0.98, pow(h, 1.3));                         // cumulus: wide flat base, rounded towers
  float d = smoothstep(thr, thr + 0.07, cov);
  d *= smoothstep(0.0, 0.05, h);
  if (d <= 0.0) return 0.0;
  if (!cheap) {
    // billowy cauliflower detail, eroding the edges more than the cores
    float e = fbm(p * 0.0042 + vec3(seed), 5);
    d = clamp((d - (e - 0.3) * 0.75 * (1.0 - h * 0.3)) * 1.6, 0.0, 1.0);
  }
  return d * 0.03;
}

vec4 clouds(vec3 rd, vec3 skyTop, vec3 ground, out float dist) {
  vec3 ro = vec3(0.0, Re + 120.0, 0.0);
  dist = 1e9;
  if (rd.y < -0.02) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0 = sphere(ro, rd, Re + CB).y, t1 = sphere(ro, rd, Re + CT).y;
  t1 = min(t1, t0 + 25000.0);
  if (t0 > 70000.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float n = steps, st = (t1 - t0) / n;
  float jitter = hash(rd * 1000.0);
  vec3 sunC = SUN * 0.07 * transmittanceTo(ro + rd * t0, sunDir);
  float mu = dot(rd, sunDir);
  float ph = mix(pow(1.0 - 0.64, 2.0) / pow(1.0 + 0.64 - 1.6 * mu, 1.5), (1.0 - 0.04) / pow(1.0 + 0.04 + 0.4 * mu, 1.5), 0.45) / (4.0 * PI) * 4.0;
  vec3 L = vec3(0.0); float T = 1.0; float wsum = 0.0, wd = 0.0;
  for (int i = 0; i < 64; i++) {
    if (float(i) >= n || T < 0.02) break;
    float t = t0 + st * (float(i) + jitter);
    vec3 p = ro + rd * t;
    float d = cloudDensity(p, false);
    if (d > 0.0) {
      // light march towards the sun
      float od = 0.0; float ls = 90.0;
      for (int k = 0; k < 5; k++) { od += cloudDensity(p + sunDir * ls * (float(k) + 0.5) * (1.0 + float(k)), true) * ls * (1.0 + float(k)); }
      float h = (length(p) - Re - CB) / (CT - CB);
      od *= 0.24;                                                           // (multiple scattering lets light further in)
      vec3 amb = mix(ground * 0.9 + skyTop * 0.35, skyTop * 2.2, pow(h, 0.7)) + vec3(0.02);
      vec3 sunL = sunC * (exp(-od) + 0.45 * exp(-od * 0.2) + 0.2 * exp(-od * 0.05)) * ph * (1.0 - 0.55 * exp(-od * 2.0)) * 2.4;   // beer + multi-scatter + powder
      vec3 S = (sunL + amb * 0.9) * d;
      float Ti = exp(-d * st);
      L += T * (S - S * Ti) / max(d, 1e-5);
      wsum += T * (1.0 - Ti); wd += T * (1.0 - Ti) * t;
      T *= Ti;
    }
  }
  if (wsum > 0.0) dist = wd / wsum;
  return vec4(L, T);
}

void main() {
  vec3 rd = normalize(vDir);
  if (probe > 0.5) rd = normalize(vec3(vDir.x, 0.035, vDir.z));
  vec3 rdA = rd; rdA.y = max(rd.y, 0.004); rdA = normalize(rdA);
  vec3 rdS = rd; rdS.y = max(rd.y, 0.045); rdS = normalize(rdS);
  vec3 sky = atmosphere(rdS, 1e9);
  vec3 skyTop = atmosphere(vec3(0.0, 1.0, 0.0), 1e9);
  vec3 groundC = vec3(0.09, 0.095, 0.08) * (0.5 + 1.2 * max(sunDir.y, 0.0));
  float dist;
  vec4 c = clouds(rdA, skyTop, groundC, dist);
  vec3 col = sky * c.a + c.rgb;
  // aerial perspective over distant clouds: fade towards the sky colour behind
  if (dist < 1e8) { float f = 1.0 - exp(-dist / 55000.0); col = mix(col, sky, f * 0.85); }
  // sun disc (behind clouds)
  float mu = dot(rd, sunDir);
  col += smoothstep(0.99995, 0.99998, mu) * SUN * 40.0 * transmittanceTo(vec3(0.0, Re + 120.0, 0.0), sunDir) * c.a;
  // below the horizon: dim ground-ish colour for reflections, blended at the horizon
  if (rd.y < 0.0) col = mix(col, vec3(0.16, 0.17, 0.16) * (0.5 + max(sunDir.y, 0.0)) + sky * 0.25, smoothstep(0.0, -0.1, rd.y));
  col *= scale;
  if (probe > 0.5) col /= 8.0;
  gl_FragColor = vec4(col, 1.0);
}`;

function params() {
  try { const u = new URLSearchParams(location.search); return { res: +u.get('sky') || 0 }; } catch (e) { return { res: 0 }; }
}

// Sun from the south-west, mid-afternoon (south = +Z, west = -X).
export const SUN_DIR = new THREE.Vector3(-0.52, 0.5, 0.69).normalize();

export function makeSky(renderer, { quality = 'medium', sunDir = SUN_DIR, coverage = 0.62, seed = 3.7 } = {}) {
  const res = params().res || (quality === 'low' ? 256 : quality === 'high' ? 1024 : 512);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { sunDir: { value: sunDir.clone().normalize() }, coverage: { value: coverage }, seed: { value: seed }, steps: { value: res >= 512 ? 40 : 28 }, scale: { value: 1.0 }, probe: { value: 0 } },
  });
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(5, 64, 32), mat));
  const rt = new THREE.WebGLCubeRenderTarget(res, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cam = new THREE.CubeCamera(0.1, 20, rt);
  const prevTM = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  cam.update(renderer, skyScene);

  // horizon colour (for fog + distant haze): render a ring of horizon
  // samples into a tiny 8-bit target and read it back
  const probeRT = new THREE.WebGLRenderTarget(64, 1, { type: THREE.UnsignedByteType });
  mat.uniforms.probe.value = 1; mat.uniforms.steps.value = 16;
  const pScene = new THREE.Scene();
  const ring = new THREE.BufferGeometry();
  { const pos = [], dir = []; for (let i = 0; i <= 64; i++) { const x = -1 + 2 * i / 64, a = i / 64 * Math.PI * 2; pos.push(x, -1, 0, x, 1, 0); dir.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 0, Math.sin(a)); }
    const idx = []; for (let i = 0; i < 64; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    ring.setAttribute('position', new THREE.Float32BufferAttribute(dir, 3)); ring.setAttribute('screen', new THREE.Float32BufferAttribute(pos, 3)); ring.setIndex(idx); }
  const probeMat = mat.clone();
  probeMat.side = THREE.DoubleSide;
  probeMat.vertexShader = 'attribute vec3 screen; varying vec3 vDir; void main(){ vDir = position; gl_Position = vec4(screen, 1.0); }';
  pScene.add(new THREE.Mesh(ring, probeMat));
  const orthoCam = new THREE.Camera();
  renderer.setRenderTarget(probeRT); renderer.clear(); renderer.render(pScene, orthoCam); renderer.setRenderTarget(null);
  const px = new Uint8Array(64 * 4); renderer.readRenderTargetPixels(probeRT, 0, 0, 64, 1, px);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < 64; i++) { const k = i * 4; if (px[k] + px[k + 1] + px[k + 2] === 0) continue; r += px[k]; g += px[k + 1]; b += px[k + 2]; n++; }
  const horizon = n ? new THREE.Color(r / n / 255 * 8, g / n / 255 * 8, b / n / 255 * 8) : new THREE.Color(0.75, 0.8, 0.86);
  { const l = horizon.r * 0.3 + horizon.g * 0.55 + horizon.b * 0.15; horizon.lerp(new THREE.Color(l * 0.97, l, l * 1.06), 0.45); }
  probeRT.dispose(); ring.dispose(); probeMat.dispose();
  renderer.toneMapping = prevTM;

  // pre-filtered environment for image-based lighting
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromCubemap(rt.texture).texture;
  pm.dispose();
  mat.dispose();
  return { background: rt.texture, env, horizon, sunDir: sunDir.clone().normalize() };
}
