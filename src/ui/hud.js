// HUD: health/armour, ammo, score, objectives, prompts, subtitles, toasts
// and floating speech bubbles above characters.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(camera) {
    this.camera = camera;
    this.el = {
      hud: $('hud'), hp: $('hp-fill'), hpNum: $('hp-num'), ar: $('ar-fill'), arNum: $('ar-num'),
      mag: $('ammo-mag'), reserve: $('ammo-reserve'), weapon: $('weapon-name'), score: $('score'),
      objective: $('objective'), missionTitle: $('mission-title'), subtitle: $('subtitle'), prompt: $('prompt'),
      toast: $('toast'), hit: $('hitmarker'), dmg: $('damage-flash'), bubbles: $('bubbles'), crosshair: $('crosshair'),
      compass: $('compass-strip'), pips: $('ammo-pips'), blood: $('blood'),
    };
    this.bubbleMap = new Map(); // owner -> { el, t }
    this.v = new THREE.Vector3();
    this.cache = {};
    this.subT = 0; this.toastT = 0; this.hitT = 0; this.dmgT = 0;
    this.buildCompass();
    this.dir = new THREE.Vector3();
  }

  // compass strip: ticks every 5°, labels every 15°, repeated so it can wrap
  buildCompass() {
    const el = this.el.compass; if (!el) return;
    const PX = 3, names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let d = -180; d <= 540; d += 5) {
      const b = ((d % 360) + 360) % 360, x = (d + 180) * PX, card = names[b] !== undefined;
      html += `<i class="${b % 15 ? 't' : 'T'}" style="left:${x}px"></i>`;
      if (b % 15 === 0) html += `<b class="${card ? 'c' : 'n'}" style="left:${x}px">${card ? names[b] : b}</b>`;
    }
    el.innerHTML = html; this.compassPx = PX;
  }

  set(key, el, value, fn) { if (this.cache[key] !== value) { this.cache[key] = value; fn(el, value); } }

  vitals(hp, ar) {
    // blood at the edges of the screen when hurt (like health regen shooters)
    this.set('blood', this.el.blood, Math.round(hp / 5), (e) => { e.style.opacity = hp >= 70 ? 0 : String(Math.min(0.85, (70 - hp) / 60)); });
    this.set('hp', this.el.hp, hp, (e, v) => { e.style.width = v + '%'; this.el.hpNum.textContent = v; });
    this.set('ar', this.el.ar, ar, (e, v) => { e.style.width = Math.min(100, v) + '%'; this.el.arNum.textContent = v; });
  }
  ammo(weapon) {
    this.set('mag', this.el.mag, weapon.ammo, (e, v) => { e.textContent = v; e.classList.toggle('low', v <= Math.max(2, (weapon.magSize || 30) * 0.2)); });
    const pk = weapon.ammo + '/' + (weapon.magSize || 30);
    this.set('pips', this.el.pips, pk, (e) => {
      const n = weapon.magSize || 30; let h = '';
      for (let i = 0; i < n; i++) h += `<i class="${i < weapon.ammo ? 'f' : ''}"></i>`;
      e.innerHTML = h;
    });
    this.set('res', this.el.reserve, weapon.reserve, (e, v) => { e.textContent = v; });
    this.set('wn', this.el.weapon, weapon.name, (e, v) => { e.textContent = v; });
  }
  score(v) { this.set('score', this.el.score, v, (e, val) => { e.textContent = val; }); }
  objective(title, text) {
    this.el.missionTitle.textContent = title;
    this.el.objective.innerHTML = text;
  }
  prompt(text) {
    this.set('prompt', this.el.prompt, text || '', (e, v) => { if (v) e.textContent = v; e.classList.toggle('show', !!v); });
  }
  subtitle(html, dur = 3.5) { this.el.subtitle.innerHTML = html; this.el.subtitle.classList.add('show'); this.subT = dur; }
  toast(text, dur = 1.4) { this.el.toast.textContent = text; this.el.toast.classList.add('show'); this.toastT = dur; }
  hitmarker() { this.el.hit.classList.add('show'); this.hitT = 0.12; }
  damageFlash() { this.el.dmg.classList.add('show'); this.dmgT = 0.15; }
  onTarget(v) { this.set('ontarget', this.el.crosshair, v, (e, val) => e.classList.toggle('on-target', val)); }

  // Speech bubble that follows a character. owner must have bubbleAnchor(v).
  bubble(owner, text, who, dur = 3) {
    let b = this.bubbleMap.get(owner);
    if (!b) {
      const el = document.createElement('div'); el.className = 'bubble';
      this.el.bubbles.appendChild(el);
      b = { el, t: 0 }; this.bubbleMap.set(owner, b);
    }
    b.el.innerHTML = `<span class="who">${who}</span>${text}`;
    b.t = dur; b.el.style.display = '';
  }
  isSpeaking(owner) { const b = this.bubbleMap.get(owner); return !!b && b.t > 0.3; }

  update(dt) {
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.subtitle.classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.el.hit.classList.remove('show'); }
    if (this.dmgT > 0) { this.dmgT -= dt; if (this.dmgT <= 0) this.el.dmg.classList.remove('show'); }
    if (this.el.compass && this.compassPx) {
      this.camera.getWorldDirection(this.dir);
      const bearing = ((Math.atan2(this.dir.x, -this.dir.z) * 180 / Math.PI) + 360) % 360;
      this.el.compass.style.transform = `translateX(${-(bearing + 180) * this.compassPx}px)`;
    }
    const w = window.innerWidth, h = window.innerHeight;
    for (const [owner, b] of this.bubbleMap) {
      b.t -= dt;
      if (b.t <= 0) { b.el.style.display = 'none'; continue; }
      owner.bubbleAnchor(this.v);
      const dist = this.v.distanceTo(this.camera.position);
      this.v.project(this.camera);
      if (this.v.z > 1 || dist > 40) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      const half = b.el.offsetWidth / 2 + 6;
      b.el.style.left = Math.max(half, Math.min(w - half, x)) + 'px';
      b.el.style.top = Math.max(60, y) + 'px';
      b.el.style.opacity = dist > 25 ? String(Math.max(0, 1 - (dist - 25) / 15)) : '1';
    }
  }
}
