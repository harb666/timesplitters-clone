// Procedural hot-hatch engine: a 4-cylinder "brap" built from detuned
// oscillators, a burble modulator, distortion and a throttle-controlled
// filter. Plus tyre roar, brake squeal and random exhaust pops & bangs.
import { getCtx, getSfxBus, getReverbSend, getNoise } from './audio.js';

function distortionCurve(amount) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
  return c;
}

export class EngineSound {
  constructor() {
    const ctx = getCtx();
    this.ok = !!ctx;
    if (!ctx) return;
    this.ctx = ctx;
    const out = this.out = ctx.createPanner();
    out.panningModel = 'equalpower'; out.distanceModel = 'inverse';
    out.refDistance = 5; out.rolloffFactor = 1.3; out.maxDistance = 300;
    out.connect(getSfxBus());
    const rev = ctx.createGain(); rev.gain.value = 0.25; out.connect(rev); rev.connect(getReverbSend());

    this.master = ctx.createGain(); this.master.gain.value = 0.0001; this.master.connect(out);
    // engine tone
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 700; this.lp.Q.value = 2.5;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = distortionCurve(18); this.shaper.oversample = 'none';
    this.eng = ctx.createGain(); this.eng.gain.value = 0.35;
    this.shaper.connect(this.lp); this.lp.connect(this.eng); this.eng.connect(this.master);
    // burble: amplitude modulation for that uneven hot-hatch rasp
    this.am = ctx.createGain(); this.am.gain.value = 0.6; this.am.connect(this.shaper);
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
    const g1 = ctx.createGain(); g1.gain.value = 0.5; const g2 = ctx.createGain(); g2.gain.value = 0.35; const g3 = ctx.createGain(); g3.gain.value = 0.2;
    this.o1.connect(g1); this.o2.connect(g2); this.o3.connect(g3); g1.connect(this.am); g2.connect(this.am); g3.connect(this.am);
    this.mod = ctx.createOscillator(); this.mod.type = 'triangle';
    this.modG = ctx.createGain(); this.modG.gain.value = 0.4; this.mod.connect(this.modG); this.modG.connect(this.am.gain);
    // exhaust hiss / intake
    this.hiss = ctx.createBufferSource(); this.hiss.buffer = getNoise(); this.hiss.loop = true;
    this.hissF = ctx.createBiquadFilter(); this.hissF.type = 'bandpass'; this.hissF.frequency.value = 1200; this.hissF.Q.value = 0.8;
    this.hissG = ctx.createGain(); this.hissG.gain.value = 0.02;
    this.hiss.connect(this.hissF); this.hissF.connect(this.hissG); this.hissG.connect(this.master);
    // tyre roar
    this.roar = ctx.createBufferSource(); this.roar.buffer = getNoise(); this.roar.loop = true; this.roar.playbackRate.value = 0.5;
    this.roarF = ctx.createBiquadFilter(); this.roarF.type = 'lowpass'; this.roarF.frequency.value = 400;
    this.roarG = ctx.createGain(); this.roarG.gain.value = 0;
    this.roar.connect(this.roarF); this.roarF.connect(this.roarG); this.roarG.connect(this.master);
    const t = ctx.currentTime;
    [this.o1, this.o2, this.o3, this.mod].forEach((o) => o.start(t));
    this.hiss.start(t); this.roar.start(t);
    this.master.gain.setTargetAtTime(1, t, 0.3);
  }

  setPosition(x, y, z) {
    if (!this.ok) return;
    const p = this.out, t = this.ctx.currentTime;
    if (p.positionX) { p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03); }
    else p.setPosition(x, y, z);
  }

  // rpm: 800..7200, throttle 0..1, speed m/s
  update(rpm, throttle, speed) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, k = 0.04;
    const f = rpm / 30; // firing frequency of a 4-pot
    this.o1.frequency.setTargetAtTime(f, t, k);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, k);
    this.o3.frequency.setTargetAtTime(f * 2.01, t, k);
    this.mod.frequency.setTargetAtTime(f * 0.25 + 3, t, k);
    this.lp.frequency.setTargetAtTime(350 + throttle * 2200 + rpm * 0.12, t, k);
    this.eng.gain.setTargetAtTime(0.22 + throttle * 0.35, t, k);
    this.hissG.gain.setTargetAtTime(0.01 + throttle * 0.05, t, k);
    this.hissF.frequency.setTargetAtTime(600 + rpm * 0.25, t, k);
    this.roarG.gain.setTargetAtTime(Math.min(0.18, speed * 0.012), t, 0.1);
  }

  // Overrun pop: crack + low boom + a burst of crackle.
  pop(big = false) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = big ? 1 : 1 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.04 + Math.random() * 0.06);
      const src = ctx.createBufferSource(); src.buffer = getNoise();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(big ? 2500 : 4000, s); f.frequency.exponentialRampToValueAtTime(300, s + 0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(big ? 1.4 : 0.7, s + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, s + (big ? 0.25 : 0.1));
      src.connect(f); f.connect(g); g.connect(this.out);
      src.start(s, Math.random()); src.stop(s + 0.3);
      if (big) {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, s); o.frequency.exponentialRampToValueAtTime(35, s + 0.2);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.9, s); og.gain.exponentialRampToValueAtTime(0.0001, s + 0.25);
        o.connect(og); og.connect(this.out); o.start(s); o.stop(s + 0.3);
      }
    }
  }

  // Brief rev dip for gear changes (with a little "whoosh" from the turbo).
  shift() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = getNoise();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(f); f.connect(g); g.connect(this.out); src.start(t, Math.random()); src.stop(t + 0.35);
  }

  squeal(dur = 0.6) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(950, t); o.frequency.linearRampToValueAtTime(780, t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 23; const vg = ctx.createGain(); vg.gain.value = 40; vib.connect(vg); vg.connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(this.out); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  dispose() {
    if (!this.ok) return;
    try { [this.o1, this.o2, this.o3, this.mod, this.hiss, this.roar].forEach((o) => o.stop()); this.out.disconnect(); } catch (e) { /* ignore */ }
  }
}
