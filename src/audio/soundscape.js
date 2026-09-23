// Soundscape: plays the rendered sound library with
// - true 3D positioning (HRTF panning: left/right, front/behind, distance)
// - distance behaviour: speed-of-sound delay, air absorption (high
//   frequencies fade first), and occlusion muffling
// - environment: an outdoor street reverb, an enclosed-space reverb blended
//   by how boxed-in you are, and discrete echoes off nearby buildings
// - variation: random take, pitch and level on every play
import { getCtx, getMaster } from './audio.js';
import { buildLibrary, makeIR } from './soundLibrary.js';

const SPEED_OF_SOUND = 343;
let S = null;

export function soundscapeReady() { return !!(S && S.lib); }

export async function initSoundscape({ quality = 'medium', onProgress } = {}) {
  const ctx = getCtx();
  if (!ctx || S) return;
  S = { ctx, lib: null, last: {}, hrtf: quality !== 'low', listener: { x: 0, y: 0, z: 0 } };
  // buses
  S.guns = ctx.createGain(); S.guns.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.12;
  S.guns.connect(limiter); limiter.connect(getMaster());
  S.fx = ctx.createGain(); S.fx.connect(getMaster());
  S.outdoor = ctx.createConvolver(); S.outdoor.buffer = makeIR(ctx, 'outdoor');
  S.enclosed = ctx.createConvolver(); S.enclosed.buffer = makeIR(ctx, 'enclosed');
  S.outSend = ctx.createGain(); S.outSend.gain.value = 0.55; S.outSend.connect(S.outdoor); S.outdoor.connect(getMaster());
  S.inSend = ctx.createGain(); S.inSend.gain.value = 0.0; S.inSend.connect(S.enclosed); S.enclosed.connect(getMaster());
  S.lib = await buildLibrary(ctx, onProgress);
}

// Update from the game each frame: listener position + how enclosed.
export function setEnvironment(listenerPos, enclosure) {
  if (!S) return;
  S.listener.x = listenerPos.x; S.listener.y = listenerPos.y; S.listener.z = listenerPos.z;
  const t = S.ctx.currentTime;
  S.inSend.gain.setTargetAtTime(enclosure * 0.9, t, 0.3);
  S.outSend.gain.setTargetAtTime(0.55 * (1 - enclosure * 0.6), t, 0.3);
}

function pick(name) {
  const list = S.lib && S.lib[name]; if (!list || !list.length) return null;
  let i = (Math.random() * list.length) | 0;
  if (list.length > 1 && i === S.last[name]) i = (i + 1) % list.length; // never the same take twice in a row
  S.last[name] = i;
  return list[i];
}

function panner(x, y, z, ref = 2, rolloff = 1) {
  const p = S.ctx.createPanner();
  p.panningModel = S.hrtf ? 'HRTF' : 'equalpower';
  p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 1000;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  return p;
}

// Generic one-shot. opts: pos (world), gain, rate, jitter, bus, send,
// delay (s), lowpass (Hz), ref, rolloff.
export function play(name, opts = {}) {
  if (!S || !S.lib) return null;
  const buf = pick(name); if (!buf) return null;
  const ctx = S.ctx;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const j = opts.jitter ?? 0.06;
  src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
  const g = ctx.createGain(); g.gain.value = (opts.gain ?? 1) * (1 + (Math.random() * 2 - 1) * 0.12);
  let node = src;
  let dist = 0;
  if (opts.pos) {
    const L = S.listener; dist = Math.hypot(opts.pos.x - L.x, opts.pos.y - L.y, opts.pos.z - L.z);
    // air absorption: highs roll off with distance
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = Math.min(opts.lowpass ?? 20000, 18000 * Math.exp(-dist / 90) + 500);
    node.connect(lp); node = lp;
  } else if (opts.lowpass) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opts.lowpass; node.connect(lp); node = lp;
  }
  node.connect(g);
  let out = g;
  if (opts.pos) { const p = panner(opts.pos.x, opts.pos.y, opts.pos.z, opts.ref ?? 2, opts.rolloff ?? 1); g.connect(p); out = p; }
  out.connect(opts.bus ?? S.fx);
  const send = opts.send ?? 0.25;
  if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; out.connect(sg); sg.connect(S.outSend); sg.connect(S.inSend); }
  const delay = (opts.delay ?? 0) + (opts.pos && opts.physicalDelay !== false ? dist / SPEED_OF_SOUND : 0);
  src.start(ctx.currentTime + delay);
  src.onended = () => { try { out.disconnect(); } catch (e) { /* gone */ } };
  return src;
}

// The player's own gunshot. env.echoes = [{dist, dir:{x,z}}] from raycasts.
export function playerShot(weapon, env) {
  if (!S || !S.lib) return;
  const ctx = S.ctx, t = ctx.currentTime;
  const buf = pick('shot_' + weapon); if (!buf) return;
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.035;
  const g = ctx.createGain(); g.gain.value = 0.95 + Math.random() * 0.1;
  src.connect(g); g.connect(S.guns);
  // environment sends: louder, denser reflections when boxed in
  const wet = ctx.createGain(); wet.gain.value = 0.9 + env.enclosure * 0.6; g.connect(wet); wet.connect(S.outSend); wet.connect(S.inSend);
  // discrete slap-back echoes from the buildings around you
  for (const e of env.echoes) {
    const d = ctx.createDelay(1.5); d.delayTime.value = Math.min(1.4, (2 * e.dist) / SPEED_OF_SOUND);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200 * Math.exp(-e.dist / 60) + 600;
    const eg = ctx.createGain(); eg.gain.value = 0.55 / (1 + e.dist / 12);
    const p = panner(S.listener.x + e.dir.x * e.dist, S.listener.y, S.listener.z + e.dir.z * e.dist, 1, 0);
    g.connect(d); d.connect(lp); lp.connect(eg); eg.connect(p); p.connect(S.guns);
    setTimeout(() => { try { d.disconnect(); p.disconnect(); } catch (err) { /* gone */ } }, 3000);
  }
  // a low "rolling" layer far down the street
  const far = pick('far_' + weapon);
  if (far) { const s2 = ctx.createBufferSource(); s2.buffer = far; const g2 = ctx.createGain(); g2.gain.value = 0.35 * (1 - env.enclosure * 0.5); s2.connect(g2); g2.connect(S.outSend); s2.start(t + 0.08 + Math.random() * 0.05); }
  src.start(t);
}

// Somebody else's gunshot at a world position (enemies, events). Distance
// changes everything: arrival delay, muffling, level, and wet/dry balance.
export function shotAt(weapon, pos, { occluded = false } = {}) {
  if (!S || !S.lib) return;
  const L = S.listener, d = Math.hypot(pos.x - L.x, pos.y - L.y, pos.z - L.z);
  const near = Math.max(0, 1 - d / 60);
  if (near > 0.05) play('shot_' + weapon, { pos, gain: near * (occluded ? 0.5 : 1), lowpass: occluded ? 900 : 20000, ref: 6, rolloff: 1.2, send: 0.6, bus: S.guns, jitter: 0.03 });
  play('far_' + weapon, { pos, gain: Math.min(1, 0.4 + d / 150) * (occluded ? 0.7 : 1), lowpass: occluded ? 600 : 20000, ref: 20, rolloff: 0.8, send: 0.9, bus: S.guns, jitter: 0.03 });
}

export function mech(name, gain = 0.8) { return play(name, { gain, jitter: 0.04, send: 0.05 }); }
