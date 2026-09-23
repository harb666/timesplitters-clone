// DEZ "FULL TILT" HARTLEY
// Fir Vale's self-appointed fastest resident. Does laps of the shop parade
// in his racing chair, pops wheelies when bored, challenges everyone to
// races, and is outraged by pavement parking. The joke is his ego — not his
// chair.
import * as THREE from 'three';
import { buildDez } from '../models/characters.js';
import { groundHeight as G } from '../core/world.js';
import { babble, voiceBark } from '../audio/audio.js';

const VOICE = { pitch: 170, speed: 0.8, gain: 0.55 };

const LINES = {
  ambient: [
    'Mind yer toes! Personal best attempt in progress!',
    'Lap forty-three. I swear this pavement\'s getting faster.',
    'Someone\'s parked on the kerb AGAIN. Ruining my racing line.',
    'You look like someone who\'s never been overtaken on a hill.',
    'Wheelie o\'clock!',
    'Beep beep! That\'s me. I don\'t have a horn, I just say it.',
  ],
  talk: [
    'Dez "Full Tilt" Hartley. Fastest thing in Fir Vale. Four wheels: two big, two tiny.',
    'That Falcon R keeps trying to race me up Barnsley Road. Lost six times. Says he wasn\'t racing. He was.',
    'I\'m training for the Sheffield Downhill Invitational. It doesn\'t exist yet. I\'m inventing it.',
    'Race? Not today. Just had me bearings greased. Letting them settle. Like a fine wine.',
    'Is that a gun made from a kettle? ...Respect.',
    'Word of advice: never buy the samosas after 9pm. Or before. Just admire them.',
  ],
  shot: [
    'OI! These rims are CARBON!',
    'Right. That\'s a formal complaint to the council!',
    'Not the paintwork! I\'ve got sponsors! Well, one. It\'s me nan!',
  ],
  flee: [
    'Nope! Nope! FULL TILT!',
    'I\'m off! Tell the Mini Mart I want me samosa refunded!',
    'Gunfire? On a Tuesday?!',
  ],
  calm: ['Right. Where was I. Oh yeah — being brilliant.', 'That wasn\'t fear. That was interval training.'],
  blocked: ['Beep beep! Coming through!', 'Racing line, pal! Shift!'],
};
const pick = (a) => a[(Math.random() * a.length) | 0];

export class Dez {
  constructor(scene, world, { x, z0, z1, hud }) {
    this.m = buildDez();
    scene.add(this.m.root);
    this.world = world; this.hud = hud;
    this.name = 'Dez';
    this.x = x; this.baseX = x; this.z = (z0 + z1) / 2; this.z0 = z0; this.z1 = z1;
    this.dir = 1; this.speed = 0; this.heading = 0;
    this.state = 'patrol'; this.stateT = 0;
    this.wheelie = 0; this.wheelieT = 5 + Math.random() * 5;
    this.barkT = 3; this.talkIndex = 0; this.sprint = 0;
    this.pushPhase = 0;
    this.collider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, tag: 'npc', owner: this };
    world.dynamic.push(this.collider);
    this.hitFlash = 0;
    this.interactRadius = 2.6;
  }

  say(text, dur = 3) {
    this.hud.bubble(this, text, 'Dez', dur);
    babble(VOICE, text, this.x, G(this.x, this.z) + 1.3, this.z);
  }

  bubbleAnchor(v) { return v.set(this.x, G(this.x, this.z) + 1.9 + this.wheelie * 0.2, this.z); }

  // Player pressed USE near Dez.
  interact(player) {
    this.state = 'talk'; this.stateT = 4.5;
    this.say(LINES.talk[this.talkIndex % LINES.talk.length], 4.2);
    this.talkIndex++;
    return true;
  }

  onShot() {
    this.hitFlash = 0.25;
    voiceBark(VOICE, 'yelp', this.x, G(this.x, this.z) + 1.2, this.z);
    this.say(pick(LINES.shot), 2.4);
    this.startFlee(null, true);
  }

  onLoudNoise(px, pz) {
    if (this.state === 'flee') return;
    const d = Math.hypot(px - this.x, pz - this.z);
    if (d < 28) this.startFlee(pz);
  }

  startFlee(fromZ, silent = false) {
    this.state = 'flee'; this.stateT = 6;
    // roll away from the danger along the pavement
    const from = fromZ ?? this.z;
    this.dir = (this.z >= from) ? 1 : -1;
    if (this.z + this.dir * 10 > this.z1 + 20 || this.z + this.dir * 10 < this.z0 - 20) this.dir *= -1;
    this.wheelie = 0;
    if (!silent) this.say(pick(LINES.flee), 2.2);
  }

  update(dt, player) {
    this.stateT -= dt; this.barkT -= dt; this.hitFlash -= dt;
    const toP = Math.hypot(player.pos.x - this.x, player.pos.z - this.z);
    let target = 0;

    if (this.state === 'patrol') {
      this.sprint -= dt;
      if (this.sprint <= 0 && Math.random() < dt * 0.08) this.sprint = 2 + Math.random() * 2;
      target = this.sprint > 0 ? 5.5 : 1.9;
      if (this.z > this.z1) this.dir = -1;
      if (this.z < this.z0) this.dir = 1;
      // idle wheelie tricks every so often
      this.wheelieT -= dt;
      if (this.wheelieT <= 0) { this.state = 'wheelie'; this.stateT = 2.5 + Math.random() * 2; this.wheelieT = 8 + Math.random() * 10; if (toP < 14 && Math.random() < 0.5) this.say('Wheelie o\'clock!', 2); }
      // ambient chatter when the player is close
      if (toP < 7 && this.barkT <= 0) { this.say(pick(LINES.ambient), 3); this.barkT = 9 + Math.random() * 6; }
      // blocked by the player: stop & complain
      const ahead = (player.pos.z - this.z) * this.dir;
      if (Math.abs(player.pos.x - this.x) < 1.0 && ahead > 0 && ahead < 1.8) {
        target = 0;
        if (this.barkT <= 0) { this.say(pick(LINES.blocked), 2); this.barkT = 5; }
      }
    } else if (this.state === 'wheelie') {
      target = 0.4;
      if (this.stateT <= 0) this.state = 'patrol';
    } else if (this.state === 'talk') {
      target = 0;
      if (this.stateT <= 0) this.state = 'patrol';
    } else if (this.state === 'flee') {
      target = 7.5;
      if (this.stateT <= 0) { this.state = 'patrol'; this.dir *= -1; if (toP < 20) this.say(pick(LINES.calm), 3); }
    }

    // keep within the district so he doesn't vanish forever
    if (this.z > this.z1 + 22) { this.dir = -1; }
    if (this.z < this.z0 - 22) { this.dir = 1; }

    this.speed += (target - this.speed) * Math.min(1, dt * (this.state === 'flee' ? 3 : 2));
    const nz = this.z + this.dir * this.speed * dt;
    // don't roll into the player
    if (Math.hypot(player.pos.x - this.x, player.pos.z - nz) > 0.9 || this.state === 'flee') this.z = nz;

    // face travel direction, or face the player while talking
    let wantHeading = this.dir > 0 ? 0 : Math.PI;
    if (this.state === 'talk') wantHeading = Math.atan2(player.pos.x - this.x, player.pos.z - this.z);
    let dh = wantHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * Math.min(1, dt * 6);

    // wheelie angle (exaggerated, with a wobble)
    const wantWheelie = this.state === 'wheelie' ? 1 : (this.state === 'flee' && this.speed > 5 ? 0.35 : 0);
    this.wheelie += (wantWheelie - this.wheelie) * Math.min(1, dt * 4);

    // ---- animate ----
    const m = this.m, gy = G(this.x, this.z);
    m.root.position.set(this.x, gy + 0.02, this.z);
    m.root.rotation.y = this.heading;
    const wob = Math.sin(performance.now() * 0.009) * 0.08 * this.wheelie;
    m.tilt.rotation.x = -(0.42 * this.wheelie + wob);
    const spin = this.speed * dt / 0.33;
    m.wheels[0].rotation.x += spin; m.wheels[1].rotation.x += spin;
    m.caster.rotation.x += spin * 4;
    // push stroke: arms swing forward and back with speed
    this.pushPhase += dt * (2 + this.speed * 1.6);
    const push = this.speed > 0.3 ? Math.sin(this.pushPhase) * 0.9 : 0;
    m.arms[0].rotation.x = -push - 0.2; m.arms[1].rotation.x = -push - 0.2;
    m.body.rotation.x = this.speed > 0.3 ? Math.max(0, Math.sin(this.pushPhase)) * 0.25 : -0.05;
    // head bob, eyebrow waggle when talking
    m.head.rotation.y = this.state === 'talk' ? Math.sin(performance.now() * 0.004) * 0.15 : 0;
    m.brows.position.y = 0.065 + (this.hud.isSpeaking(this) ? Math.abs(Math.sin(performance.now() * 0.02)) * 0.03 : 0);
    m.mouth.scale.y = this.hud.isSpeaking(this) ? 1 + Math.abs(Math.sin(performance.now() * 0.03)) * 3 : 1;
    // hit flash: jiggle
    m.root.scale.setScalar(this.hitFlash > 0 ? 1 + Math.sin(this.hitFlash * 60) * 0.06 : 1);

    const c = this.collider;
    c.minX = this.x - 0.45; c.maxX = this.x + 0.45; c.minZ = this.z - 0.55; c.maxZ = this.z + 0.55;
    c.minY = gy; c.maxY = gy + 1.35;
  }
}
