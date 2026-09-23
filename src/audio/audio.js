// Fir Vale sound system — 100% procedural. Every sound is synthesised live
// with the Web Audio API (oscillators, filtered noise, a generated reverb),
// so there are no audio files to download and nothing ripped from anywhere.

let ctx = null;
let master, sfxBus, ambBus, reverb, reverbSend, noiseBuf, brownBuf;
let volume = 0.8;

export function audioReady() { return !!ctx; }
export function getCtx() { return ctx; }
export function getSfxBus() { return sfxBus; }
export function getReverbSend() { return reverbSend; }
export function getNoise() { return noiseBuf; }

// Must be called from a tap/click (iOS rule).
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  // Let sound play even if the iPhone's silent switch is on (Safari 16.4+).
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
  ctx = new AC({ latencyHint: 'interactive' });

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
  comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = volume;
  master.connect(comp); comp.connect(ctx.destination);

  sfxBus = ctx.createGain(); sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.55; ambBus.connect(master);

  // Street reverb: a short, bright slap off brick walls.
  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(1.4, 2.6);
  reverbSend = ctx.createGain(); reverbSend.gain.value = 0.5;
  reverbSend.connect(reverb); reverb.connect(master);

  noiseBuf = makeNoise(2, 'white');
  brownBuf = makeNoise(4, 'brown');

  // Unlock on iOS: play one silent buffer inside the gesture.
  const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  ctx.resume();
  startAmbience();
}

export function setVolume(v) { volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }

export function suspendAudio(yes) { if (!ctx) return; if (yes) ctx.suspend(); else ctx.resume(); }

function makeNoise(seconds, kind) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

function makeImpulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // early reflections (walls across the street) + diffuse tail
      const early = (i % 1900 < 30 && t < 0.15) ? 0.6 : 0;
      d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay)) * 0.6 + early * (Math.random() - 0.5);
    }
  }
  return buf;
}

// ---------- tiny synthesis helpers ----------
function env(g, t, a, peak, dec, end = 0.0001) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + dec);
}

function noise(t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.5, a = 0.002, out = sfxBus, rate = 1, rev = 0 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dur);
  src.connect(f); f.connect(g); g.connect(out);
  if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(reverbSend); }
  src.start(t, Math.random() * 1.5); src.stop(t + a + dur + 0.05);
  return g;
}

function tone(t, dur, { type = 'sine', f0 = 440, f1 = f0, gain = 0.3, a = 0.002, out = sfxBus, rev = 0, curve = 'exp' } = {}) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  else o.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dur);
  o.connect(g); g.connect(out);
  if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(reverbSend); }
  o.start(t); o.stop(t + a + dur + 0.05);
  return g;
}

// A spatial output at a world position (cheap equal-power panner).
// It disconnects itself after `life` seconds (0 = keep forever).
export function spatial(x, y, z, ref = 4, rolloff = 1.1, life = 4) {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
  p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 400;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  p.connect(sfxBus);
  if (life > 0) setTimeout(() => { try { p.disconnect(); } catch (e) { /* already gone */ } }, life * 1000);
  return p;
}

export function updateListener(pos, forward) {
  if (!ctx) return;
  const L = ctx.listener, t = ctx.currentTime;
  if (L.positionX) {
    L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
    L.forwardX.setTargetAtTime(forward.x, t, 0.02); L.forwardY.setTargetAtTime(forward.y, t, 0.02); L.forwardZ.setTargetAtTime(forward.z, t, 0.02);
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else {
    L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
  }
}

// ================== WEAPON: Scrap Blaster ==================
// Personality: a junkyard hand-cannon. Big low thump, a tinny rattle from
// the loose bits bolted to it, and a clanky pump action after every shot.
export const sfx = {
  scrapShot() {
    if (!ctx) return; const t = ctx.currentTime;
    tone(t, 0.16, { type: 'sine', f0: 150, f1: 42, gain: 0.9, rev: 0.25 });               // body thump
    noise(t, 0.2, { type: 'lowpass', f0: 7000, f1: 500, q: 0.7, gain: 0.8, rev: 0.6 });   // blast
    noise(t, 0.05, { type: 'highpass', f0: 3000, f1: 2000, gain: 0.35 });                // crack
    // tinny scrap rattle
    for (let i = 0; i < 3; i++) tone(t + 0.01 + i * 0.012, 0.05, { type: 'square', f0: 1700 + Math.random() * 900, f1: 1200, gain: 0.05 });
    // pump "clack-clunk" (mechanical sound)
    noise(t + 0.13, 0.03, { type: 'bandpass', f0: 2600, q: 4, gain: 0.35 });
    noise(t + 0.2, 0.05, { type: 'bandpass', f0: 900, q: 3, gain: 0.4 });
    tone(t + 0.2, 0.05, { type: 'triangle', f0: 320, f1: 180, gain: 0.15 });
  },
  scrapEmpty() {
    if (!ctx) return; const t = ctx.currentTime;
    noise(t, 0.025, { type: 'bandpass', f0: 3200, q: 6, gain: 0.45 });
    tone(t, 0.04, { type: 'square', f0: 900, f1: 600, gain: 0.05 });
  },
  scrapReload() {
    if (!ctx) return; const t = ctx.currentTime;
    // pop the tin-can drum out
    noise(t + 0.05, 0.06, { type: 'bandpass', f0: 1400, q: 5, gain: 0.4 });
    tone(t + 0.05, 0.12, { type: 'triangle', f0: 700, f1: 500, gain: 0.12 });
    // drum clatters on the floor
    for (let i = 0; i < 4; i++) tone(t + 0.35 + i * 0.07 * (1 - i * 0.15), 0.06, { type: 'square', f0: 1200 - i * 90, f1: 900, gain: 0.05 / (i + 1) });
    // slap new drum in
    noise(t + 0.7, 0.08, { type: 'lowpass', f0: 1800, f1: 500, gain: 0.6 });
    tone(t + 0.7, 0.08, { type: 'sine', f0: 200, f1: 90, gain: 0.3 });
    // ratchet crank
    for (let i = 0; i < 5; i++) noise(t + 1.0 + i * 0.05, 0.018, { type: 'bandpass', f0: 3800, q: 8, gain: 0.35 });
    // final clunk
    noise(t + 1.35, 0.06, { type: 'bandpass', f0: 800, q: 2, gain: 0.5 });
  },
  impact(x, y, z, kind = 'brick') {
    if (!ctx) return; const t = ctx.currentTime; const out = spatial(x, y, z, 3);
    if (kind === 'metal') {
      tone(t, 0.25, { type: 'square', f0: 1900 + Math.random() * 600, f1: 1400, gain: 0.08, out });
      noise(t, 0.05, { type: 'bandpass', f0: 4000, q: 3, gain: 0.5, out });
    } else if (kind === 'soft') {
      noise(t, 0.08, { type: 'lowpass', f0: 900, f1: 300, gain: 0.6, out });
    } else {
      noise(t, 0.07, { type: 'bandpass', f0: 1800, f1: 700, q: 1.5, gain: 0.7, out });
      noise(t + 0.01, 0.2, { type: 'highpass', f0: 5000, f1: 3000, gain: 0.08, out }); // dust
    }
    if (Math.random() < 0.3) this.ricochet(x, y, z);
  },
  ricochet(x, y, z) {
    if (!ctx) return; const t = ctx.currentTime + 0.02; const out = spatial(x, y, z, 4);
    const f0 = 2600 + Math.random() * 1600;
    tone(t, 0.35 + Math.random() * 0.2, { type: 'sine', f0, f1: f0 * 0.45, gain: 0.12, out, rev: 0.4 });
    tone(t, 0.3, { type: 'sine', f0: f0 * 1.02, f1: f0 * 0.5, gain: 0.06, out });
  },
  canHit(x, y, z) {
    if (!ctx) return; const t = ctx.currentTime; const out = spatial(x, y, z, 3);
    tone(t, 0.3, { type: 'triangle', f0: 1300 + Math.random() * 400, f1: 900, gain: 0.25, out });
    noise(t, 0.04, { type: 'bandpass', f0: 5000, q: 2, gain: 0.3, out });
  },
  coneHit(x, y, z) {
    if (!ctx) return; const t = ctx.currentTime; const out = spatial(x, y, z, 3);
    tone(t, 0.12, { type: 'sine', f0: 240, f1: 110, gain: 0.5, out });
    noise(t, 0.06, { type: 'lowpass', f0: 1200, f1: 400, gain: 0.4, out });
  },
  clatter(x, y, z, strength = 0.5) {
    if (!ctx || strength < 0.08) return; const t = ctx.currentTime; const out = spatial(x, y, z, 2);
    tone(t, 0.08, { type: 'triangle', f0: 900 + Math.random() * 700, f1: 600, gain: 0.12 * strength, out });
  },
  hitmarker() {
    if (!ctx) return; const t = ctx.currentTime;
    tone(t, 0.05, { type: 'sine', f0: 1900, f1: 1700, gain: 0.12 });
  },
  footstep(left, speed = 1) {
    if (!ctx) return; const t = ctx.currentTime;
    noise(t, 0.06, { type: 'lowpass', f0: left ? 700 : 620, f1: 180, gain: 0.22 * speed });
    noise(t, 0.025, { type: 'highpass', f0: 3500, f1: 3000, gain: 0.03 * speed }); // grit
  },
  jump() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.08, { type: 'lowpass', f0: 500, f1: 200, gain: 0.25 }); },
  land(h = 1) { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.12, { type: 'lowpass', f0: 600, f1: 120, gain: Math.min(0.7, 0.25 * h) }); tone(t, 0.1, { f0: 90, f1: 50, gain: 0.25 * Math.min(2, h) }); },
  hurt() {
    if (!ctx) return; const t = ctx.currentTime;
    // player grunt: short voiced "ugh"
    voiceSyllable(t, 120, 'u', 0.18, 0.35, sfxBus);
    noise(t, 0.15, { type: 'lowpass', f0: 400, f1: 100, gain: 0.5 });
  },
  horn(x, y, z) {
    if (!ctx) return; const t = ctx.currentTime; const out = spatial(x, y, z, 8);
    for (const f of [392, 494]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.setValueAtTime(0.12, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.6);
    }
  },
  pickup() {
    if (!ctx) return; const t = ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => tone(t + i * 0.06, 0.12, { type: 'triangle', f0: f, gain: 0.15 }));
  },
  score() {
    if (!ctx) return; const t = ctx.currentTime;
    tone(t, 0.1, { type: 'square', f0: 988, gain: 0.05 }); tone(t + 0.08, 0.18, { type: 'square', f0: 1319, gain: 0.05 });
  },
  uiTap() { if (!ctx) return; tone(ctx.currentTime, 0.04, { type: 'triangle', f0: 1200, f1: 900, gain: 0.1 }); },
  beaconTick(x, y, z) { /* silent in real life; kept for later missions */ },
};

// ================== VOICES ==================
// Characters talk in a made-up "babble" (think cartoon mumbling), with a
// pitch and speed that are unique to each character. Subtitles carry words.
const VOWELS = { a: [800, 1200], e: [500, 1900], i: [320, 2400], o: [500, 900], u: [350, 800] };
function voiceSyllable(t, pitch, vowel, dur, gain, out) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(pitch * (0.9 + Math.random() * 0.25), t);
  o.frequency.linearRampToValueAtTime(pitch * (0.8 + Math.random() * 0.4), t + dur);
  const [f1, f2] = VOWELS[vowel];
  const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = f1; b1.Q.value = 6;
  const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = f2; b2.Q.value = 8;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

export function babble(voice, text, x, y, z) {
  if (!ctx) return 0;
  const out = spatial(x, y, z, 3, 1.2, 8);
  const syllables = Math.min(22, Math.max(3, Math.round(text.replace(/<[^>]+>/g, '').length / 5)));
  let t = ctx.currentTime + 0.02;
  const keys = Object.keys(VOWELS);
  for (let i = 0; i < syllables; i++) {
    const d = voice.speed * (0.07 + Math.random() * 0.07);
    const pitch = voice.pitch * (i === syllables - 1 && text.includes('?') ? 1.35 : 1) * (text.includes('!') ? 1.12 : 1);
    voiceSyllable(t, pitch, keys[(Math.random() * keys.length) | 0], d, voice.gain ?? 0.5, out);
    t += d + (Math.random() < 0.18 ? 0.09 : 0.015);
  }
  return t - ctx.currentTime;
}

export function voiceBark(voice, kind, x, y, z) {
  if (!ctx) return;
  const t = ctx.currentTime; const out = spatial(x, y, z, 4, 1);
  if (kind === 'yelp') { voiceSyllable(t, voice.pitch * 1.6, 'a', 0.22, 0.6, out); voiceSyllable(t + 0.2, voice.pitch * 1.3, 'o', 0.18, 0.4, out); }
  else if (kind === 'hurt') { voiceSyllable(t, voice.pitch * 1.1, 'u', 0.2, 0.6, out); }
  else if (kind === 'laugh') { for (let i = 0; i < 4; i++) voiceSyllable(t + i * 0.13, voice.pitch * (1.4 - i * 0.05), 'a', 0.1, 0.45, out); }
  else if (kind === 'hmm') { voiceSyllable(t, voice.pitch * 0.9, 'u', 0.35, 0.3, out); }
}

// ================== AMBIENCE ==================
let ambNodes = null;
function startAmbience() {
  const t = ctx.currentTime;
  // Wind: filtered noise with a slow wandering filter.
  const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = 0.06;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(wf.frequency);
  wind.connect(wf); wf.connect(wg); wg.connect(ambBus); wind.start(t); lfo.start(t);
  // Distant traffic rumble: brown noise, low-passed. Sheffield never sleeps.
  const rum = ctx.createBufferSource(); rum.buffer = brownBuf; rum.loop = true;
  const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 260;
  const rg = ctx.createGain(); rg.gain.value = 0.22;
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.045;
  const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.08; lfo2.connect(lfo2G); lfo2G.connect(rg.gain);
  rum.connect(rf); rf.connect(rg); rg.connect(ambBus); rum.start(t); lfo2.start(t);
  ambNodes = { wind, rum };
  scheduleAmbientEvents();
}

// Random one-shots: birds, a far-off car horn, a dog, a distant shout.
function scheduleAmbientEvents() {
  const tick = () => {
    if (!ctx || ctx.state !== 'running') { setTimeout(tick, 1500); return; }
    const r = Math.random();
    const t = ctx.currentTime;
    if (r < 0.5) bird(t);
    else if (r < 0.62) { // distant horn
      const g = ctx.createGain(); g.gain.value = 0.25; g.connect(ambBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g);
      tone(t, 0.3, { type: 'square', f0: 350 + Math.random() * 100, gain: 0.04, out: lp, curve: 'lin' });
    } else if (r < 0.72) { // dog barking somewhere
      for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(ambBus);
        voiceSyllable(t + i * 0.32, 260 + Math.random() * 40, 'a', 0.13, 0.12, lp);
      }
    } else if (r < 0.8) { // distant motorbike / hot hatch on another street
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = 70 + Math.random() * 30; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 2.2, t + 2.2);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(lp); lp.connect(g); g.connect(ambBus); o.start(t); o.stop(t + 2.7);
    } else if (r < 0.88) { // far-off NPC chatter
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(ambBus);
      let tt = t; const p = 110 + Math.random() * 120;
      for (let i = 0; i < 6; i++) { const d = 0.08 + Math.random() * 0.08; voiceSyllable(tt, p, 'aeiou'[(Math.random() * 5) | 0], d, 0.08, lp); tt += d + 0.03; }
    }
    setTimeout(tick, 1800 + Math.random() * 4200);
  };
  setTimeout(tick, 1200);
}

function bird(t) {
  const n = 2 + (Math.random() * 4 | 0); const base = 2800 + Math.random() * 1800;
  const g = ctx.createGain(); g.gain.value = 0.5; g.connect(ambBus);
  for (let i = 0; i < n; i++) {
    const s = t + i * (0.09 + Math.random() * 0.08);
    tone(s, 0.06 + Math.random() * 0.05, { type: 'sine', f0: base * (0.9 + Math.random() * 0.3), f1: base * (1.2 + Math.random() * 0.4), gain: 0.035, out: g });
  }
}

// Electrical hum (e.g. the mini mart fridge sign). Returns a node to position.
export function makeHum(x, y, z) {
  if (!ctx) return null;
  const out = spatial(x, y, z, 2, 2, 0);
  const g = ctx.createGain(); g.gain.value = 0.05; g.connect(out);
  for (const [f, a] of [[50, 1], [100, 0.6], [150, 0.25], [250, 0.1]]) {
    const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a;
    o.connect(og); og.connect(g); o.start();
  }
  return out;
}
