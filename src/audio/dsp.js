// Sample-level DSP toolkit used to render sound effects into buffers.
// Working on raw samples (instead of live oscillators) lets us build
// physically-inspired sounds: N-wave shock cracks, modal metal resonances,
// saturated muzzle blasts, granular debris, and generated room responses.

export class Rand {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  bi() { return this.next() * 2 - 1; }
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) * 0.87; }
}

// RBJ biquad, processed sample by sample; params can change per block.
export class Biquad {
  constructor(sr) { this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set('lowpass', 1000, 0.707); }
  set(type, freq, q = 0.707, gainDb = 0) {
    const w = 2 * Math.PI * Math.min(freq, this.sr * 0.45) / this.sr, cs = Math.cos(w), sn = Math.sin(w);
    const alpha = sn / (2 * q), A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'highpass': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; break;
      case 'lowshelf': { const sq = 2 * Math.sqrt(A) * alpha; b0 = A * ((A + 1) - (A - 1) * cs + sq); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - sq); a0 = (A + 1) + (A - 1) * cs + sq; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - sq; break; }
      case 'highshelf': { const sq = 2 * Math.sqrt(A) * alpha; b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq); a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq; break; }
      default: b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// Filter a buffer in place. `freq` may be a function of time (seconds).
export function filter(buf, sr, type, freq, q = 0.707, gainDb = 0, from = 0, to = buf.length) {
  const f = new Biquad(sr);
  const dynamic = typeof freq === 'function';
  if (!dynamic) f.set(type, freq, q, gainDb);
  for (let i = from; i < to; i++) {
    if (dynamic && (i - from) % 32 === 0) f.set(type, freq((i - from) / sr), q, gainDb);
    buf[i] = f.tick(buf[i]);
  }
  return buf;
}

export const expEnv = (t, tau) => Math.exp(-t / tau);

// Mix `src` into `dst` at offset (samples) with gain.
export function mix(dst, src, offset = 0, gain = 1) {
  const n = Math.min(src.length, dst.length - offset);
  for (let i = 0; i < n; i++) if (i + offset >= 0) dst[i + offset] += src[i] * gain;
  return dst;
}

export function noiseBuf(n, rnd) { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = rnd.bi(); return b; }

// Damped sum of sinusoids — the sound of a struck metal object.
export function modal(sr, dur, modes, rnd, { attack = 0.0005, jitter = 0.03 } = {}) {
  const n = Math.floor(sr * dur), b = new Float32Array(n);
  for (const [f0, tau, amp] of modes) {
    const f = f0 * (1 + rnd.bi() * jitter), ph = rnd.next() * Math.PI * 2, w = 2 * Math.PI * f / sr;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const a = amp * Math.exp(-t / tau) * Math.min(1, t / attack);
      b[i] += Math.sin(w * i + ph) * a;
    }
  }
  return b;
}

// A short burst of filtered noise with an exponential envelope.
export function burst(sr, dur, rnd, { tau = 0.01, attack = 0.0003, type = 'bandpass', freq = 2000, q = 1, gain = 1 } = {}) {
  const n = Math.floor(sr * dur), b = noiseBuf(n, rnd);
  for (let i = 0; i < n; i++) { const t = i / sr; b[i] *= Math.exp(-t / tau) * Math.min(1, t / attack) * gain; }
  if (type) filter(b, sr, type, freq, q);
  return b;
}

// Scattered tiny impulses (grit, debris, glass shards).
export function granular(sr, dur, rnd, { density = 200, tau = 0.08, grain = 0.002, freq = 4000, q = 2, gain = 0.5 } = {}) {
  const n = Math.floor(sr * dur), b = new Float32Array(n);
  const count = Math.floor(density * dur);
  for (let k = 0; k < count; k++) {
    const t = -Math.log(1 - rnd.next() * 0.995) * tau; // more grains early
    const start = Math.floor(t * sr); if (start >= n) continue;
    const gl = Math.floor(grain * sr * (0.5 + rnd.next())), amp = gain * Math.exp(-t / (tau * 1.5)) * (0.3 + rnd.next());
    for (let i = 0; i < gl && start + i < n; i++) b[start + i] += rnd.bi() * amp * (1 - i / gl);
  }
  return filter(b, sr, 'bandpass', freq, q);
}

export function saturate(buf, drive = 2) { const k = Math.tanh(drive); for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / k; return buf; }

export function normalize(buf, peak = 0.95) {
  let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) { const g = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  return buf;
}

export function fadeOut(buf, sr, dur = 0.01) { const n = Math.floor(sr * dur); for (let i = 0; i < n && i < buf.length; i++) buf[buf.length - 1 - i] *= i / n; return buf; }

// Swept sine (for ricochet whines, spring zings).
export function sweep(sr, dur, f0, f1, rnd, { tau = 0.2, vibrato = 0, vibRate = 30, amp = 1 } = {}) {
  const n = Math.floor(sr * dur), b = new Float32Array(n);
  let ph = rnd.next() * 6;
  for (let i = 0; i < n; i++) {
    const t = i / sr, k = t / dur;
    const f = f0 * Math.pow(f1 / f0, k) * (1 + Math.sin(t * vibRate * 6.283) * vibrato);
    ph += 2 * Math.PI * f / sr;
    b[i] = Math.sin(ph) * Math.exp(-t / tau) * Math.min(1, t / 0.002) * amp;
  }
  return b;
}
