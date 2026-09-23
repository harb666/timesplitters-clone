// Missions 1-5, run one after another, then free roam. Each mission is a
// list of steps; a step has text (can be live), a done() check, an optional
// intro line, and an optional target() the waypoint beacon points at.
import * as THREE from 'three';
import { sfx } from '../audio/audio.js';
import { groundHeight as G } from './world.js';
import { Trolley } from '../entities/trolley.js';
import { Zip } from '../entities/zip.js';
import { Drones } from '../entities/drones.js';

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- waypoint
// A tall glowing beam over the objective (visible from streets away) and a
// ring on the ground; the HUD shows the distance and the minimap an arrow.
export class Waypoint {
  constructor(scene) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 120, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2fe0c8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
    beam.position.y = 60;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2fe0c8, transparent: true, opacity: 0.8, fog: false }));
    this.g = new THREE.Group(); this.g.add(beam, ring); this.ring = ring; this.g.visible = false; scene.add(this.g);
    this.pos = null;
  }
  set(p) {
    this.pos = p;
    this.g.visible = !!p;
    if (p) this.g.position.set(p[0], G(p[0], p[1]) + 0.2, p[1]);
  }
  update(t) { if (this.pos) { this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08); this.ring.rotation.y = t; } }
}

// ---------------------------------------------------------------- missions
export function allMissions(game) {
  const map = game.map, net = map.net;
  const cans = () => game.props.list.filter((p) => p.kind === 'can' && p.everHit).length;
  const canTotal = () => game.props.list.filter((p) => p.kind === 'can').length;
  const roadCones = () => game.props.list.filter((p) => p.tag === 'roadworks' && p.everHit).length;
  const roadConeTotal = () => game.props.list.filter((p) => p.tag === 'roadworks').length;
  const firstCan = () => { const c = game.props.list.find((p) => p.kind === 'can'); return c ? [c.home.x, c.home.z] : null; };
  const firstCone = () => { const c = game.props.list.find((p) => p.tag === 'roadworks' && !p.everHit); return c ? [c.home.x, c.home.z] : null; };
  const mm = [map.startShop.x, map.startShop.zc];
  const church = map.churchAt || [-105, 165];
  const S = {};                                   // per-mission state

  const m1 = {
    title: 'Mission 1 — Welcome to Fir Vale',
    steps: [
      { text: () => 'Have a look around. Move with the left stick, look with the right side.', done: () => game.stats.moved > 12, intro: '<b>Welcome to Fir Vale!</b> You\'re on Page Hall Road. Follow the <b style="color:#2fe0c8">teal beam</b> to each objective.' },
      { text: () => 'Talk to <b>Dez</b> — the lad in the racing chair doing laps of the Page Hall Road shops (USE)', done: () => game.stats.talkedToDez, target: () => [game.dez.x, game.dez.z] },
      { text: () => `Say hello to some locals — walk up to anyone and press USE (${Math.min(2, game.stats.talkedToLocals || 0)}/2)`, done: () => (game.stats.talkedToLocals || 0) >= 2, intro: 'Page Hall\'s a friendly place: Slovak, Ukrainian, Polish, Pakistani, Yemeni and Sheffield-born neighbours. Say hello.' },
      { text: () => `Knock the cans off the wall outside Fir Vale School on Owler Lane (${cans()}/${canTotal()})`, done: () => cans() >= canTotal(), intro: 'Someone\'s lined tins up on the wall outside Fir Vale School on Owler Lane. Rude not to.', target: firstCan },
      { text: () => `Flatten the cones at the Owler Lane roadworks (${roadCones()}/${roadConeTotal()})`, done: () => roadCones() >= roadConeTotal(), intro: 'Further along Owler Lane there\'s a hole in the road and nobody working. Follow the beam.', target: firstCone },
    ],
  };

  const m2 = {
    title: 'Mission 2 — Trolley Dash',
    start() {
      // the Mini Mart trolley escapes down the street, downhill
      const r = net.nearest(mm[0], mm[1], null, (x) => x.name === 'Page Hall Road') || net.nearestStreet(mm[0], mm[1]);
      const road = r.road, dh = G(...xz(net.pointAt(road, Math.min(road.length, r.s + 30)))) < G(...xz(net.pointAt(road, Math.max(0, r.s - 30)))) ? 1 : -1;
      const path = []; const off = r.side * (road.half - 1.3);
      for (let s = r.s; s >= 0 && s <= road.length && path.length < 60; s += dh * 3) { const p = net.pointAt(road, s, off, {}); path.push([p.x, p.z]); }
      if (path.length < 5) for (let k = 1; k < 40; k++) path.push([path[0][0] + k * 3, path[0][1]]);
      S.trolley = new Trolley(game.scene, game.world, path, mm);
      S.t = 0;
    },
    update(dt) { S.trolley?.update(dt, game.player); S.t += dt; },
    end() { if (S.trolley) setTimeout(() => S.trolley.dispose(game.scene), 8000); },
    steps: [
      { text: () => 'The Mini Mart\'s trolley is off down the hill — <b>catch it!</b>', done: () => S.trolley.caught, target: () => [S.trolley.x, S.trolley.z],
        intro: '<b>Shopkeeper:</b> "MY TROLLEY! It\'s got the good bread in it! After it!"' },
      { text: () => 'Push the trolley back to the Mini Mart', done: () => S.trolley.state === 'home', target: () => mm,
        intro: '<b>Shopkeeper:</b> "Bring her home gently. She\'s got a bad wheel and a worse attitude."' },
    ],
  };

  const m3 = {
    title: 'Mission 3 — Zip!',
    start() {
      // Zip runs a loop of real streets: Mini Mart -> three hiding spots -> away
      const pick = (dx, dz) => { const r = net.nearestStreet(mm[0] + dx, mm[1] + dz); return r ? [r.px, r.pz] : [mm[0] + dx, mm[1] + dz]; };
      const pts = [mm, pick(160, 90), pick(260, -140), pick(-60, -170), pick(-220, 40)];
      let route = [];
      for (let i = 0; i < pts.length - 1; i++) { const seg = net.route(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); route = route.concat(i ? seg.slice(1) : seg); }
      const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
      // stops: the real ends of each leg (nearest route vertex to each hiding spot)
      const stops = [0, ...pts.slice(1, -1).map((p) => { let bi = 0, bd = Infinity; route.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); return cum[bi] / cum[cum.length - 1]; })];
      S.zip = new Zip(game.scene, game.hud, route, stops);
    },
    update(dt) { S.zip?.update(dt, game.player); },
    end() { const z = S.zip; setTimeout(() => z?.dispose(), 4000); },
    steps: [
      { text: () => `Catch <b>Zip</b> — get close when it stops (${S.zip.tags}/${S.zip.stops.length})`, done: () => S.zip.tags >= S.zip.stops.length, target: () => [S.zip.x, S.zip.z],
        intro: '<b>Shopkeeper:</b> "Something BLUE just had away with a whole tray of samosas! Goggles! Ears! Scarf! GET IT!"' },
    ],
  };

  const m4 = {
    title: 'Mission 4 — The Fir Vale Grand Prix',
    start() {
      const path = net.route(game.dez.x, game.dez.z, church[0] + 12, church[1] + 12);
      S.race = path;
      const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      const L = cum[cum.length - 1], n = Math.max(3, Math.min(8, Math.round(L / 110)));
      S.cps = []; for (let k = 1; k <= n; k++) { const t = L * k / n; let i = 0; while (i < cum.length - 1 && cum[i + 1] < t) i++; S.cps.push(path[Math.min(path.length - 1, i + 1)]); }
      S.cp = 0; S.t = 0; S.lost = false; S.started = false;
    },
    update(dt) {
      if (!S.cps) return;
      if (!S.started && Math.hypot(game.player.pos.x - game.dez.x, game.player.pos.z - game.dez.z) < 6) { S.started = true; game.dez.startRace(S.race); game.hud.toast('GO!', 1.2); sfx.score(); }
      if (!S.started) return;
      S.t += dt;
      const c = S.cps[S.cp];
      if (c && Math.hypot(game.player.pos.x - c[0], game.player.pos.z - c[1]) < 7) { S.cp++; sfx.pickup(); if (S.cp < S.cps.length) game.hud.toast(`CHECKPOINT ${S.cp}/${S.cps.length}`, 1); }
      if (game.dez.raceDone && S.cp < S.cps.length) {
        // Dez won: line up again
        game.hud.subtitle('<b>Dez:</b> "Too slow! Best of three? Meet me back at the start!"', 4);
        game.dez.endRace(); S.cp = 0; S.t = 0; S.started = false;
      }
    },
    end() { game.dez.endRace(); game.dez.say('Rematch. Tomorrow. Same time. I\'ll have new tyres.', 3.5); },
    steps: [
      { text: () => S.started ? `Beat Dez to St Cuthbert's! Checkpoint ${S.cp}/${S.cps.length} · ${fmt(S.t)}` : 'Meet <b>Dez</b> on Page Hall Road to start the race',
        done: () => S.cps && S.cp >= S.cps.length, target: () => (S.started ? S.cps[S.cp] : [game.dez.x, game.dez.z]),
        intro: '<b>Dez:</b> "You. Me. Page Hall Road to St Cuthbert\'s. Loser buys the samosas. Tip: sprint by pushing the stick all the way."' },
    ],
  };

  const m5 = {
    title: 'Mission 5 — Parcel Panic',
    start() { S.drones = new Drones(game, { center: map.cansAt || [150, 250], count: 10, radius: 60 }); game.drones = S.drones; },
    update(dt) { S.drones?.update(dt); },
    end() { setTimeout(() => { S.drones?.dispose(); }, 3000); },
    steps: [
      { text: () => `Shoot down the rogue delivery drones over Fir Vale School (${S.drones.killed}/${S.drones.total})`, done: () => S.drones.done,
        target: () => { const a = S.drones.alive(); if (!a.length) return null; const p = game.player.pos; a.sort((x, y) => x.pos.distanceToSquared(p) - y.pos.distanceToSquared(p)); return [a[0].pos.x, a[0].pos.z]; },
        intro: '<b>News flash:</b> "VALE PARCELS drones have gone rogue after a software update and are delivering parcels to people\'s heads. Residents are advised to stay indoors and to stop ordering flip-flops."' },
    ],
  };

  const free = {
    title: 'Free roam — Fir Vale is yours',
    steps: [{ text: () => 'All missions complete! Explore: Barnsley Road, Herries Road, Hinde House Lane, the Northern General, Firth Park…', done: () => false,
      intro: '<b>ALL MISSIONS COMPLETE!</b> Zip is still out there somewhere. So is the trolley. Mostly the trolley.' }],
  };
  return [m1, m2, m3, m4, m5, free];
}
const xz = (p) => [p.x, p.z];

export class MissionRunner {
  constructor(game, missions) {
    this.game = game; this.list = missions; this.mi = 0; this.i = 0; this.lastText = '';
    this.wp = new Waypoint(game.scene); this.t = 0;
    this.enterMission();
  }
  get m() { return this.list[this.mi]; }
  enterMission() { this.m.start?.(); this.i = 0; this.enter(); }
  enter() {
    const s = this.m.steps[this.i];
    if (s.intro) this.game.hud.subtitle(s.intro, 6);
  }
  target() { const s = this.m.steps[this.i]; return s.target ? s.target() : null; }
  update(dt = 1 / 30) {
    this.t += dt;
    this.m.update?.(dt);
    const s = this.m.steps[this.i];
    const tgt = s.target ? s.target() : null;
    this.wp.set(tgt); this.wp.update(this.t);
    let text = s.text();
    if (tgt) { const p = this.game.player.pos; text += ` <span class="dist">· ${Math.round(Math.hypot(tgt[0] - p.x, tgt[1] - p.z))} m</span>`; }
    if (text !== this.lastText) { this.lastText = text; this.game.hud.objective(this.m.title, text); }
    if (s.done()) {
      sfx.pickup();
      if (this.i < this.m.steps.length - 1) { this.i++; this.game.addScore(100, 'OBJECTIVE COMPLETE'); this.enter(); }
      else if (this.mi < this.list.length - 1) {
        this.m.end?.();
        this.game.addScore(250, 'MISSION COMPLETE');
        this.mi++;
        this.enterMission();
      }
    }
  }
}
