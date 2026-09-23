// Sound design recipes. Every effect is rendered from DSP building blocks
// into several randomised variations, so repeated sounds never match
// exactly. Rendering happens in small chunks after the first tap so the
// game stays responsive.
import { Rand, filter, mix, noiseBuf, modal, burst, granular, saturate, normalize, fadeOut, sweep } from './dsp.js';

// ---------------------------------------------------------------- gunshots
// Close-up (shooter's perspective) rifle/handgun report. Layers:
// 1 supersonic N-wave crack, 2 muzzle blast (saturated, swept low-pass),
// 3 low "punch" body resonance, 4 sub thump, 5 action/mechanism.
function gunshot(sr, rnd, P) {
  const dur = P.dur, n = Math.floor(sr * dur);
  const L = new Float32Array(n), R = new Float32Array(n);
  // 1. N-wave (the sharp "crack" of a supersonic bullet / high-pressure blast front)
  const nw = Math.floor(sr * P.nwave * rnd.range(0.85, 1.15));
  const crack = new Float32Array(nw + 64);
  for (let i = 0; i < nw; i++) crack[i] = 1 - 2 * i / nw;
  filter(crack, sr, 'highpass', 700);
  mix(L, crack, 0, P.crack); mix(R, crack, 0, P.crack);
  // 2. blast: decorrelated noise per channel for width
  for (const [ch, seed] of [[L, 1], [R, 2]]) {
    const r2 = new Rand(Math.floor(rnd.next() * 1e9) + seed);
    const b = noiseBuf(n, r2);
    const t1 = P.tau1 * rnd.range(0.85, 1.2), t2 = P.tau2 * rnd.range(0.85, 1.2);
    for (let i = 0; i < n; i++) { const t = i / sr; b[i] *= (Math.exp(-t / t1) * 0.85 + Math.exp(-t / t2) * 0.15) * Math.min(1, t / 0.00025); }
    const fTop = P.bright * rnd.range(0.85, 1.15);
    filter(b, sr, 'lowpass', (t) => 300 + fTop * Math.exp(-t / P.sweep), 0.8);
    filter(b, sr, 'peak', P.bodyF * rnd.range(0.9, 1.1), 1.2, P.bodyDb);
    mix(ch, b, 0, P.blast);
  }
  // 3/4. sub thump
  const thump = new Float32Array(Math.floor(sr * 0.25));
  let ph = 0;
  for (let i = 0; i < thump.length; i++) { const t = i / sr; const f = P.subF * (1 + 1.6 * Math.exp(-t / 0.012)); ph += 2 * Math.PI * f / sr; thump[i] = Math.sin(ph) * Math.exp(-t / P.subTau); }
  mix(L, thump, 0, P.sub); mix(R, thump, 0, P.sub);
  // 5. mechanism
  if (P.mech) for (const m of P.mech) {
    const at = Math.floor(sr * (m.t + rnd.range(-0.002, 0.003)));
    const s = modal(sr, m.dur ?? 0.08, m.modes, rnd, { jitter: 0.05 });
    const nb = burst(sr, 0.02, rnd, { tau: 0.004, freq: m.click ?? 3500, q: 1.5 });
    mix(s, nb, 0, 0.6);
    mix(L, s, at, m.gain * rnd.range(0.8, 1.1)); mix(R, s, at + 8, m.gain * rnd.range(0.8, 1.1));
  }
  // saturation = loudness/pressure; then shape the very start
  saturate(L, P.drive); saturate(R, P.drive);
  normalize(L, 0.98); normalize(R, 0.98);
  fadeOut(L, sr, 0.05); fadeOut(R, sr, 0.05);
  return [L, R];
}

export const GUNS = {
  ak: { dur: 0.7, nwave: 0.0009, crack: 1.2, tau1: 0.012, tau2: 0.11, bright: 9000, sweep: 0.035, bodyF: 190, bodyDb: 7, blast: 1.0, subF: 48, subTau: 0.07, sub: 0.9, drive: 2.6,
    mech: [{ t: 0.012, modes: [[1850, 0.02, 0.5], [2760, 0.03, 0.4], [4300, 0.015, 0.3], [6100, 0.01, 0.2]], gain: 0.22 },
      { t: 0.052, modes: [[950, 0.03, 0.5], [1420, 0.025, 0.4], [2350, 0.02, 0.3]], gain: 0.26, click: 1800 }] },
  revolver: { dur: 0.9, nwave: 0.0012, crack: 1.0, tau1: 0.018, tau2: 0.16, bright: 7000, sweep: 0.05, bodyF: 240, bodyDb: 9, blast: 1.1, subF: 42, subTau: 0.1, sub: 1.1, drive: 3.0,
    mech: [{ t: 0.0, modes: [[2400, 0.012, 0.5], [4700, 0.008, 0.3]], gain: 0.08 }] },
};

// Far-away version: crack gone, low-mid "boom" and long roll.
function distantShot(sr, rnd, P) {
  const n = Math.floor(sr * 1.4), b = noiseBuf(n, rnd);
  for (let i = 0; i < n; i++) { const t = i / sr; b[i] *= (Math.exp(-t / 0.03) + 0.25 * Math.exp(-t / 0.4)) * Math.min(1, t / 0.002); }
  filter(b, sr, 'lowpass', (t) => 200 + 1600 * Math.exp(-t / 0.08), 0.9);
  filter(b, sr, 'peak', P.bodyF * 0.8, 1, 6);
  saturate(b, 1.5); normalize(b, 0.9); fadeOut(b, sr, 0.2);
  return [b];
}

// ---------------------------------------------------------------- mechanics
const clack = (sr, rnd, modes, { dur = 0.12, click = 3000, noiseGain = 0.5, thump = 0 } = {}) => {
  const s = modal(sr, dur, modes, rnd, { jitter: 0.06 });
  mix(s, burst(sr, 0.03, rnd, { tau: 0.004, freq: click * rnd.range(0.85, 1.15), q: 1.2 }), 0, noiseGain);
  if (thump) { const th = burst(sr, 0.06, rnd, { tau: 0.012, type: 'lowpass', freq: 400 }); mix(s, th, 0, thump); }
  return s;
};
const scrape = (sr, rnd, dur, f0, f1, gain = 0.3) => {
  const b = noiseBuf(Math.floor(sr * dur), rnd);
  for (let i = 0; i < b.length; i++) { const t = i / b.length; b[i] *= Math.sin(Math.PI * t) * (0.7 + 0.3 * Math.sin(i * 0.013)) * gain; }
  return filter(b, sr, 'bandpass', (t) => f0 + (f1 - f0) * (t / dur), 3);
};
const ticks = (sr, rnd, times, modes, gain = 0.3) => {
  const n = Math.floor(sr * (times[times.length - 1] + 0.1)), b = new Float32Array(n);
  for (const t of times) mix(b, clack(sr, rnd, modes, { dur: 0.05 }), Math.floor(t * sr), gain * rnd.range(0.7, 1.1));
  return b;
};
const seq = (sr, parts) => { // parts: [time, buffer, gain]
  let end = 0; for (const [t, b] of parts) end = Math.max(end, Math.floor(t * sr) + b.length);
  const out = new Float32Array(end);
  for (const [t, b, g = 1] of parts) mix(out, b, Math.floor(t * sr), g);
  return out;
};
const M_SMALL = [[2600, 0.02, 0.5], [4100, 0.015, 0.4], [6300, 0.01, 0.25]];
const M_HEAVY = [[900, 0.05, 0.6], [1500, 0.04, 0.45], [2600, 0.03, 0.3], [4200, 0.02, 0.2]];
const M_BRASS = [[3300, 0.09, 0.5], [5800, 0.07, 0.35], [8900, 0.05, 0.25], [12100, 0.03, 0.15]];

const MECH = {
  ak_mag_out: (sr, r) => seq(sr, [[0, clack(sr, r, M_SMALL, { click: 4000 }), 0.5], [0.03, scrape(sr, r, 0.16, 1400, 2600, 0.35)], [0.17, clack(sr, r, [[700, 0.04, 0.5], [1300, 0.03, 0.3]], { thump: 0.4 }), 0.35]]),
  ak_mag_in: (sr, r) => seq(sr, [[0, clack(sr, r, M_SMALL), 0.3], [0.02, scrape(sr, r, 0.12, 1800, 1200, 0.3)], [0.14, clack(sr, r, M_HEAVY, { click: 2500, thump: 0.8 }), 0.9]]),
  ak_rack_back: (sr, r) => seq(sr, [[0, clack(sr, r, M_SMALL), 0.35], [0.01, scrape(sr, r, 0.12, 2200, 3200, 0.45)], [0.005, sweep(sr, 0.12, 2800, 3600, r, { tau: 0.08, amp: 0.05 })], [0.13, clack(sr, r, M_HEAVY, { thump: 0.3 }), 0.6]]),
  ak_rack_fwd: (sr, r) => seq(sr, [[0, scrape(sr, r, 0.05, 3000, 1800, 0.35)], [0.05, clack(sr, r, [[1150, 0.06, 0.6], [2550, 0.04, 0.45], [4100, 0.025, 0.3], [5900, 0.02, 0.2]], { thump: 1.0, click: 2200 }), 1.0], [0.06, sweep(sr, 0.18, 3200, 2400, r, { tau: 0.08, amp: 0.05 })]]),
  ak_selector: (sr, r) => clack(sr, r, [[1700, 0.05, 0.6], [3100, 0.03, 0.4], [5200, 0.02, 0.2]], { thump: 0.3, click: 2600 }),
  ak_dry: (sr, r) => seq(sr, [[0, clack(sr, r, [[3000, 0.015, 0.5], [5200, 0.01, 0.3]]), 0.5], [0.012, clack(sr, r, [[1900, 0.02, 0.4], [3400, 0.015, 0.3]], { thump: 0.2 }), 0.6]]),
  rev_cock: (sr, r) => ticks(sr, r, [0, 0.035, 0.06], [[3900, 0.012, 0.5], [6200, 0.008, 0.3]], 0.35),
  rev_dry: (sr, r) => seq(sr, [[0, clack(sr, r, [[2400, 0.03, 0.6], [4800, 0.02, 0.35], [7100, 0.01, 0.2]], { thump: 0.25, click: 3500 }), 0.8]]),
  rev_open: (sr, r) => seq(sr, [[0, clack(sr, r, M_SMALL), 0.35], [0.03, scrape(sr, r, 0.14, 1600, 900, 0.25)], [0.17, clack(sr, r, [[1300, 0.04, 0.5], [2600, 0.03, 0.3]]), 0.45]]),
  rev_eject: (sr, r) => { const parts = [[0, scrape(sr, r, 0.1, 2400, 3400, 0.3)]]; for (let i = 0; i < 6; i++) parts.push([0.08 + r.next() * 0.06, modal(sr, 0.12, M_BRASS, r, { jitter: 0.08 }), 0.25]); return seq(sr, parts); },
  rev_load: (sr, r) => { const parts = []; for (let i = 0; i < 7; i++) parts.push([i * 0.012 + r.next() * 0.02, modal(sr, 0.07, M_BRASS, r, { jitter: 0.1 }), 0.15]); parts.push([0.16, clack(sr, r, [[1500, 0.03, 0.5], [3300, 0.02, 0.3]]), 0.5]); return seq(sr, parts); },
  rev_close: (sr, r) => seq(sr, [[0, clack(sr, r, [[1250, 0.05, 0.6], [2450, 0.035, 0.45], [3900, 0.02, 0.3]], { thump: 0.6 }), 0.9], [0.05, ticks(sr, r, [0, 0.04, 0.075, 0.1, 0.12], [[4200, 0.01, 0.5], [6800, 0.006, 0.3]], 0.15)]]),
  rev_spin: (sr, r) => { const t = []; let x = 0, dt = 0.03; while (x < 0.9) { t.push(x); x += dt; dt *= 1.09; } return ticks(sr, r, t, [[4400, 0.008, 0.5], [7000, 0.005, 0.3]], 0.12); },
  handling: (sr, r) => { const b = noiseBuf(Math.floor(sr * 0.35), r); for (let i = 0; i < b.length; i++) { const t = i / b.length; b[i] *= Math.sin(Math.PI * t) * (0.5 + 0.5 * Math.sin(t * 40 + r.next())) * 0.25; } filter(b, sr, 'bandpass', 1400, 0.7); mix(b, clack(sr, r, [[800, 0.04, 0.4], [1900, 0.03, 0.25]], { thump: 0.3 }), Math.floor(sr * 0.2), 0.3); return b; },
  trigger: (sr, r) => clack(sr, r, [[3800, 0.008, 0.5], [6100, 0.005, 0.3]], { dur: 0.03 }),
};

// ---------------------------------------------------------------- impacts
function impact(sr, rnd, mat) {
  const D = 0.6, n = Math.floor(sr * D), b = new Float32Array(n);
  const hit = (tau, freq, q, g, type = 'bandpass') => mix(b, burst(sr, tau * 8, rnd, { tau, freq: freq * rnd.range(0.85, 1.15), q, type }), 0, g);
  switch (mat) {
    case 'metal':
      hit(0.003, 5000, 1, 0.8);
      mix(b, modal(sr, D, [[rnd.range(900, 1600), 0.12, 0.35], [rnd.range(2300, 3200), 0.09, 0.3], [rnd.range(4200, 5600), 0.06, 0.2], [rnd.range(7000, 9000), 0.03, 0.12]], rnd), 0, 0.8);
      break;
    case 'glass':
      hit(0.002, 6000, 0.8, 0.9);
      mix(b, granular(sr, D, rnd, { density: 900, tau: 0.09, grain: 0.0015, freq: 7000, q: 1.2, gain: 0.8 }), 0, 1);
      mix(b, modal(sr, 0.3, [[rnd.range(3000, 4200), 0.05, 0.3], [rnd.range(6500, 8000), 0.03, 0.2]], rnd), 0, 0.5);
      break;
    case 'wood':
      hit(0.004, 900, 2, 1.0); hit(0.01, 350, 3, 0.8);
      mix(b, granular(sr, 0.3, rnd, { density: 250, tau: 0.03, grain: 0.003, freq: 2500, q: 1.5, gain: 0.5 }), Math.floor(sr * 0.004), 0.7);
      break;
    case 'dirt':
    case 'grass':
      hit(0.008, 500, 1, 1.0, 'lowpass');
      mix(b, granular(sr, 0.4, rnd, { density: 300, tau: 0.06, grain: 0.004, freq: 1800, q: 0.8, gain: 0.5 }), Math.floor(sr * 0.01), 0.8);
      break;
    case 'flesh':
      hit(0.006, 400, 1, 1.0, 'lowpass'); hit(0.02, 180, 2, 0.6);
      break;
    case 'plastic':
      hit(0.003, 2500, 1.5, 0.9);
      mix(b, modal(sr, 0.15, [[rnd.range(600, 900), 0.03, 0.5], [rnd.range(1500, 2100), 0.02, 0.3]], rnd), 0, 0.6);
      break;
    default: // concrete, brick, asphalt, paving, stone
      hit(0.0025, 3500, 0.8, 1.0); hit(0.006, 1200, 1.2, 0.6);
      mix(b, granular(sr, D, rnd, { density: 420, tau: mat === 'asphalt' ? 0.05 : 0.09, grain: 0.0025, freq: mat === 'brick' ? 2800 : 3600, q: 1.3, gain: 0.6 }), Math.floor(sr * 0.003), 0.9);
  }
  saturate(b, 1.4); normalize(b, 0.9); fadeOut(b, sr, 0.05);
  return [b];
}

function ricochet(sr, rnd) {
  const d = rnd.range(0.35, 0.7);
  const b = sweep(sr, d, rnd.range(2600, 4200), rnd.range(700, 1300), rnd, { tau: d * 0.6, vibrato: 0.015, vibRate: rnd.range(20, 40), amp: 0.6 });
  const nb = noiseBuf(b.length, rnd); filter(nb, sr, 'bandpass', (t) => 5000 - t * 5000, 6);
  for (let i = 0; i < b.length; i++) b[i] += nb[i] * 0.15 * Math.exp(-i / sr / (d * 0.4));
  normalize(b, 0.8); fadeOut(b, sr, 0.05);
  return [b];
}

function casing(sr, rnd, soft) {
  const b = modal(sr, soft ? 0.08 : 0.25, soft ? [[1200, 0.01, 0.4], [2200, 0.008, 0.2]] : M_BRASS, rnd, { jitter: 0.12 });
  mix(b, burst(sr, 0.01, rnd, { tau: 0.002, freq: soft ? 800 : 6000, q: 1 }), 0, 0.4);
  if (soft) filter(b, sr, 'lowpass', 1500);
  normalize(b, 0.8);
  return [b];
}

// ---------------------------------------------------------------- body
function footstep(sr, rnd, surf) {
  const b = new Float32Array(Math.floor(sr * 0.22));
  const heel = (at, g) => {
    if (surf === 'grass') {
      mix(b, burst(sr, 0.12, rnd, { tau: 0.03, type: 'bandpass', freq: 2800, q: 0.5 }), at, g * 0.5);
      mix(b, burst(sr, 0.05, rnd, { tau: 0.01, type: 'lowpass', freq: 350 }), at, g);
    } else if (surf === 'metal') {
      mix(b, burst(sr, 0.04, rnd, { tau: 0.008, type: 'lowpass', freq: 600 }), at, g);
      mix(b, modal(sr, 0.15, [[rnd.range(400, 600), 0.05, 0.3], [rnd.range(1100, 1500), 0.03, 0.2]], rnd), at, g * 0.5);
    } else {
      mix(b, burst(sr, 0.04, rnd, { tau: 0.007, type: 'lowpass', freq: 700 }), at, g);
      mix(b, granular(sr, 0.08, rnd, { density: 300, tau: 0.02, grain: 0.0015, freq: surf === 'asphalt' ? 3000 : 4500, q: 1, gain: 0.35 }), at, g);
    }
  };
  heel(0, 1); heel(Math.floor(sr * rnd.range(0.035, 0.06)), 0.55);
  normalize(b, 0.8); fadeOut(b, sr, 0.02);
  return [b];
}

function breath(sr, rnd, inhale) {
  const d = inhale ? rnd.range(0.35, 0.5) : rnd.range(0.3, 0.45), b = noiseBuf(Math.floor(sr * d), rnd);
  for (let i = 0; i < b.length; i++) { const t = i / b.length; b[i] *= Math.pow(Math.sin(Math.PI * Math.pow(t, inhale ? 0.8 : 0.5)), 1.5); }
  filter(b, sr, 'bandpass', inhale ? 1600 : 1100, 1.2); filter(b, sr, 'peak', inhale ? 2800 : 700, 2, 6);
  normalize(b, 0.6);
  return [b];
}

function cloth(sr, rnd) {
  const b = noiseBuf(Math.floor(sr * 0.25), rnd);
  for (let i = 0; i < b.length; i++) { const t = i / b.length; b[i] *= Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(t * 60 + rnd.next() * 3)); }
  filter(b, sr, 'bandpass', 2200, 0.6); normalize(b, 0.5);
  return [b];
}

function explosion(sr, rnd) {
  const n = Math.floor(sr * 3), L = noiseBuf(n, rnd), R = noiseBuf(n, new Rand(rnd.next() * 1e9));
  for (const b of [L, R]) {
    for (let i = 0; i < n; i++) { const t = i / sr; b[i] *= (Math.exp(-t / 0.08) + 0.3 * Math.exp(-t / 0.8)) * Math.min(1, t / 0.002); }
    filter(b, sr, 'lowpass', (t) => 150 + 5000 * Math.exp(-t / 0.15), 0.8);
    mix(b, granular(sr, 2.5, rnd, { density: 120, tau: 0.6, grain: 0.004, freq: 2500, q: 0.8, gain: 0.3 }), Math.floor(sr * 0.1), 1);
    saturate(b, 3); normalize(b, 0.98); fadeOut(b, sr, 0.3);
  }
  return [L, R];
}

// ---------------------------------------------------------------- builder
export async function buildLibrary(ctx, progress) {
  const sr = ctx.sampleRate;
  const lib = {};
  const jobs = [];
  const add = (name, count, make) => { lib[name] = []; for (let v = 0; v < count; v++) jobs.push(() => { const rnd = new Rand(hashName(name) + v * 7919); lib[name].push(toBuffer(ctx, make(rnd))); }); };
  for (const g of Object.keys(GUNS)) { add('shot_' + g, 6, (r) => gunshot(sr, r, GUNS[g])); add('far_' + g, 3, (r) => distantShot(sr, r, GUNS[g])); }
  for (const k of Object.keys(MECH)) add(k, 3, (r) => [MECH[k](sr, r)]);
  for (const m of ['concrete', 'brick', 'asphalt', 'metal', 'glass', 'wood', 'dirt', 'flesh', 'plastic']) add('impact_' + m, 4, (r) => impact(sr, r, m));
  add('ricochet', 5, (r) => ricochet(sr, r));
  add('casing', 8, (r) => casing(sr, r, false)); add('casing_soft', 4, (r) => casing(sr, r, true));
  for (const s of ['paving', 'asphalt', 'grass', 'metal']) add('step_' + s, 6, (r) => footstep(sr, r, s));
  add('breath_in', 4, (r) => breath(sr, r, true)); add('breath_out', 4, (r) => breath(sr, r, false));
  add('cloth', 4, (r) => cloth(sr, r));
  add('explosion', 2, (r) => explosion(sr, r));
  // run jobs in slices so the page never freezes
  let i = 0;
  while (i < jobs.length) {
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 12) jobs[i++]();
    progress?.(i / jobs.length);
    await new Promise((res) => setTimeout(res, 0));
  }
  return lib;
}

function hashName(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function toBuffer(ctx, chans) {
  const b = ctx.createBuffer(chans.length, chans[0].length, ctx.sampleRate);
  chans.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}

// ---------------------------------------------------------------- rooms
// Generated impulse responses: outdoor street (sparse facade echoes + long,
// darkening roll-off) and enclosed space (dense, bright, short).
export function makeIR(ctx, kind) {
  const sr = ctx.sampleRate, rnd = new Rand(kind === 'outdoor' ? 99 : 77);
  const dur = kind === 'outdoor' ? 2.6 : 1.1, n = Math.floor(sr * dur);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = new Float32Array(n);
    if (kind === 'outdoor') {
      // discrete early echoes off building faces
      for (let k = 0; k < 14; k++) { const t = rnd.range(0.015, 0.25); const at = Math.floor(t * sr); const g = 0.5 * Math.exp(-t / 0.18) * rnd.range(0.4, 1); for (let i = 0; i < 40; i++) if (at + i < n) d[at + i] += rnd.bi() * g * (1 - i / 40); }
      // rolling tail: noise with slowly varying amplitude, darker over time
      const tail = noiseBuf(n, rnd);
      for (let i = 0; i < n; i++) { const t = i / sr; tail[i] *= 0.18 * Math.exp(-t / 0.7) * (0.6 + 0.4 * Math.sin(t * 7 + c)) * Math.min(1, t / 0.03); }
      filter(tail, sr, 'lowpass', (t) => 300 + 4500 * Math.exp(-t / 0.35), 0.7);
      mix(d, tail);
    } else {
      const tail = noiseBuf(n, rnd);
      for (let i = 0; i < n; i++) { const t = i / sr; tail[i] *= Math.exp(-t / 0.22) * Math.min(1, t / 0.002); }
      for (let k = 0; k < 30; k++) { const at = Math.floor(rnd.range(0.002, 0.06) * sr); tail[at] += rnd.bi() * 0.9; }
      filter(tail, sr, 'lowpass', (t) => 1500 + 7000 * Math.exp(-t / 0.15), 0.7);
      mix(d, tail, 0, 0.6);
    }
    buf.copyToChannel(d, c);
  }
  return buf;
}
