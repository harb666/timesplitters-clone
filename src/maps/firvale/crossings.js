// Pedestrian crossings and traffic signals, built to the UK layouts on the
// real crossing points (OpenStreetMap tags say which kind each one is):
//  - zebra: white stripes, give-way lines, zig-zags, Belisha beacons,
//    red tactile paving;
//  - signal-controlled (pelican/puffin/toucan): studs, stop lines,
//    zig-zags, poles with back-to-back three-aspect heads (black backplates
//    with the white border), red/green man and push-button boxes;
//  - uncontrolled: dropped kerbs with buff tactile paving;
//  - signalled junctions: a stop line and primary signal on every approach,
//    run in two stages. Traffic stops for red (see SIGNALS.stops).
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { Frame } from './buildings.js';
import { DRIVABLE, RANK } from './roads.js';
import { inBox } from './streetscape.js';

// ---- signal timing (seconds in a 44 s cycle) ----
const CYCLE = 44;
// vehicle aspect for a group at time t: 'g' | 'a' | 'r' | 'ra'
function aspect(group, t) {
  t = ((t % CYCLE) + CYCLE) % CYCLE;
  if (group === 'X') return t < 31 ? 'g' : t < 34 ? 'a' : t < 42 ? 'r' : 'ra';                      // stand-alone puffin crossing
  if (group === 'A') return t < 14 ? 'g' : t < 17 ? 'a' : t < 42 ? 'r' : 'ra';                      // junction: main road
  return t < 18 ? 'r' : t < 20 ? 'ra' : t < 31 ? 'g' : t < 34 ? 'a' : 'r';                           // junction: side roads
}
// green man for everyone while all traffic is held (35-41 s)
const walking = (t) => { t = ((t % CYCLE) + CYCLE) % CYCLE; return t >= 35 && t < 41; };
export const SIGNALS = {
  t: 0,
  stops: [],             // { x, z, hx, hz, g }: stop line in a lane, direction of travel, group
  mats: null,
  aspect(g) { return aspect(g, this.t); },
  update(dt) {
    this.t += dt;
    if (!this.mats) return;
    for (const g of ['X', 'A', 'B']) {
      const a = aspect(g, this.t), m = this.mats[g];
      m.r.color.setHex(a === 'r' || a === 'ra' ? 0xff2a14 : 0x2a0806);
      m.a.color.setHex(a === 'a' || a === 'ra' ? 0xffa010 : 0x2a1a04);
      m.g.color.setHex(a === 'g' ? 0x2dffb0 : 0x06221a);
    }
    const walk = walking(this.t);
    this.mats.man.r.color.setHex(walk ? 0x301010 : 0xffffff);
    this.mats.man.g.color.setHex(walk ? 0xffffff : 0x103018);
  },
};

// red standing man / green walking man, side by side
function manTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#050505'; g.fillRect(0, 0, 128, 64);
  const man = (ox, col, walking) => {
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
    g.beginPath(); g.arc(ox + 32, 12, 5, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.beginPath(); g.moveTo(ox + 32, 20); g.lineTo(ox + 32, 38); g.stroke();
    g.lineWidth = 4;
    if (walking) {
      g.beginPath(); g.moveTo(ox + 32, 23); g.lineTo(ox + 22, 33); g.moveTo(ox + 32, 23); g.lineTo(ox + 42, 31); g.stroke();
      g.beginPath(); g.moveTo(ox + 32, 38); g.lineTo(ox + 22, 56); g.moveTo(ox + 32, 38); g.lineTo(ox + 42, 56); g.stroke();
    } else {
      g.beginPath(); g.moveTo(ox + 28, 22); g.lineTo(ox + 27, 38); g.moveTo(ox + 36, 22); g.lineTo(ox + 37, 38); g.stroke();
      g.beginPath(); g.moveTo(ox + 30, 38); g.lineTo(ox + 30, 57); g.moveTo(ox + 34, 38); g.lineTo(ox + 34, 57); g.stroke();
    }
  };
  man(0, '#ff3a2a', false); man(64, '#3aff8a', true);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildCrossings(batch, M, world, net, osm, beaconMat) {
  const lens = () => new THREE.MeshBasicMaterial({ color: 0x222222 });
  const manTex = manTexture();
  const mats = {};
  for (const g of ['X', 'A', 'B']) mats[g] = { r: lens(), a: lens(), g: lens() };
  mats.man = { r: new THREE.MeshBasicMaterial({ map: manTex }), g: new THREE.MeshBasicMaterial({ map: manTex }) };
  SIGNALS.mats = mats; SIGNALS.stops.length = 0; SIGNALS.t = 0;
  const lensGeo = () => new THREE.CircleGeometry(0.1, 16);
  const manGeo = (u0) => { const g = new THREE.PlaneGeometry(0.26, 0.26); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.5); return g; };
  const beacons = [];
  const lift = (r) => 0.02 + RANK[r.kind] * 0.012 + 0.016;
  const white = '#f1f0e8';
  const inBuilding = (x, z) => world.near(x, z, 0.5, []).some((o) => o.tag === 'building' && inBox(o, x, z, 0.3));

  // ---- pieces ----
  const pole = (x, z, h, color = '#2e3134') => {
    const g = G(x, z);
    batch.add(M.darkMetal, new THREE.CylinderGeometry(0.057, 0.065, h + 0.3, 8), { x, y: g + h / 2 - 0.15, z, color });
    world.addBox(x - 0.1, x + 0.1, g - 1, g + h, z - 0.1, z + 0.1, 'pole');
    return g;
  };
  // three-aspect head on a pole at (x, z), facing yaw `ry` (local +Z), group set m
  const head = (x, z, gy, ry, m, y = 3.0) => {
    const f = new Frame(batch, x, z, ry, gy);
    f.box(M.darkMetal, 0, y, 0.12, 0.3, 0.94, 0.22, { color: '#161616' });                          // housing
    f.box(M.darkMetal, 0, y, 0.005, 0.56, 1.18, 0.02, { color: '#0e0e0e' });                        // backplate
    f.box(M.plastic, 0, y, -0.008, 0.62, 1.24, 0.012, { color: '#eeeeee' });                        // white border
    [m.r, m.a, m.g].forEach((mat, i) => {
      const ly = y + 0.3 - i * 0.3;
      f.geo(mat, lensGeo(), 0, ly, 0.235);
      f.box(M.darkMetal, 0, ly + 0.12, 0.3, 0.25, 0.02, 0.16, { color: '#161616', detail: true });     // hood
      for (const sx of [-1, 1]) f.box(M.darkMetal, sx * 0.12, ly + 0.03, 0.3, 0.015, 0.2, 0.16, { color: '#161616', detail: true });
    });
    f.box(M.darkMetal, 0, y - 0.55, 0.04, 0.09, 0.16, 0.09, { color: '#2e3134' });                  // bracket
  };
  const manHead = (x, z, gy, ry) => {
    const f = new Frame(batch, x, z, ry, gy);
    f.box(M.darkMetal, 0, 2.35, 0.1, 0.34, 0.66, 0.2, { color: '#161616' });
    f.geo(mats.man.r, manGeo(0), 0, 2.5, 0.205); f.geo(mats.man.g, manGeo(0.5), 0, 2.2, 0.205);
  };
  const button = (x, z, gy, ry) => {
    const f = new Frame(batch, x, z, ry, gy);
    f.box(M.darkMetal, 0, 1.08, 0.1, 0.19, 0.34, 0.1, { color: '#8d9296' });
    f.box(M.plastic, 0, 1.14, 0.152, 0.13, 0.1, 0.01, { color: '#f0c419' });                        // WAIT panel
    f.box(M.plastic, 0, 1.0, 0.152, 0.06, 0.06, 0.012, { color: '#c8ccd0' });                       // button
  };
  const tactile = (r, s, sd, color) => {
    const o = sd * (r.half + 0.6), a = net.pointAt(r, s - 1.2, o, {}), b = net.pointAt(r, s + 1.2, o, {});
    const ga = G(a.x, a.z), gb = G(b.x, b.z);
    batch.sloped(M.pave, a.x, a.z, b.x, b.z, 0.8, ga + 0.08, gb + 0.08, ga + 0.172, gb + 0.172, { color });
  };
  const zigzags = (r, sFrom, dir, twoWay) => {
    const lines = [r.half - 0.45, -(r.half - 0.45)]; if (twoWay && r.half > 2.6) lines.push(0);
    for (const o of lines) for (let k = 0; k < 8; k++) {
      const s0 = sFrom + dir * k * 2, s1 = s0 + dir * 2;
      if (s1 < 0.5 || s1 > r.length - 0.5 || s0 < 0.5 || s0 > r.length - 0.5) break;
      const a = k % 2 ? 0.22 : -0.22;
      net.decal(batch, M.line, r, s0, s1, o + a, 0.1, lift(r), white, false, o - a);
    }
  };
  const stopLine = (r, s, sd) => net.decal(batch, M.line, r, s - 0.15, s + 0.15, sd * r.half / 2, r.half - 0.25, lift(r), white);

  // ---- signalled junctions (found from the signal points) ----
  const nodePos = (node) => { const e = node.roads[0], S = e.road.samples, p = e.end === 'a' ? S[0] : S[S.length - 1]; return [p.x, p.z]; };
  const junctions = new Set();
  for (const it of osm.furniture) {
    if (it.k !== 'signal' || it.p.length !== 2) continue;
    const [x, z] = it.p;
    let best = null, bd = 30 * 30;
    for (const node of net.nodes.values()) {
      if (node.roads.filter((e) => DRIVABLE.has(e.road.kind)).length < 3) continue;
      const [nx, nz] = nodePos(node), d = (nx - x) ** 2 + (nz - z) ** 2;
      if (d < bd) { bd = d; best = node; }
    }
    // signal heads of a mid-block crossing are not a junction unless one is right there
    const nearX = osm.furniture.some((f) => f.k === 'crossing' && f.t === 'sig' && (f.p[0] - x) ** 2 + (f.p[1] - z) ** 2 < 12 * 12);
    if (best && !(nearX && bd > 15 * 15)) junctions.add(best);
  }
  const J = [];                  // { x, z, legs: [{ r, atB, g }] }
  for (const node of junctions) {
    const [jx, jz] = nodePos(node);
    const legs = node.roads.filter((e) => DRIVABLE.has(e.road.kind) && e.road.length > 12).map((e) => {
      const r = e.road, S = r.samples, i = e.end === 'a' ? Math.min(3, S.length - 1) : Math.max(0, S.length - 4);
      const dx = S[i].x - jx, dz = S[i].z - jz, l = Math.hypot(dx, dz) || 1;
      return { r, atB: e.end === 'b', out: [dx / l, dz / l] };
    });
    if (legs.length < 3) continue;
    // stage A: the straightest pair of legs (the main road through); the rest run in stage B
    let pair = [0, 1], bestDot = 2;
    for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
      const d = legs[i].out[0] * legs[j].out[0] + legs[i].out[1] * legs[j].out[1] - (RANK[legs[i].r.kind] + RANK[legs[j].r.kind]) * 0.05;
      if (d < bestDot) { bestDot = d; pair = [i, j]; }
    }
    legs.forEach((l, i) => { l.g = pair.includes(i) ? 'A' : 'B'; l.crossing = false; });
    J.push({ x: jx, z: jz, legs, clear: Math.max(...legs.map((l) => l.r.half)) + 2.5 });
  }
  // a signal crossing on the arm of a signalled junction runs with that arm
  const armOf = (r, x, z) => { for (const j of J) if ((j.x - x) ** 2 + (j.z - z) ** 2 < 40 * 40) for (const l of j.legs) if (l.r === r) return l; return null; };

  // ---- crossings ----
  const done = [];
  for (const it of osm.furniture) {
    if (it.k !== 'crossing' || it.p.length !== 2) continue;
    const n = net.nearest(it.p[0], it.p[1], null, (r) => DRIVABLE.has(r.kind) || (it.t === 'zeb' && r.kind === 's'));  // (hospital zebras are on service roads)
    if (!n || n.dist > n.road.half + 1.5) continue;
    const r = n.road, sc = Math.max(4, Math.min(r.length - 4, n.s));
    const P = net.pointAt(r, sc, 0, {});
    if (done.some(([x, z]) => (x - P.x) ** 2 + (z - P.z) ** 2 < 36)) continue;     // one crossing drawn once
    done.push([P.x, P.z]);
    const t = it.t || 'unm';
    if (t === 'zeb') {
      for (let o = -r.half + 0.5; o < r.half - 0.3; o += 1.1) net.decal(batch, M.line, r, sc - 1.5, sc + 1.5, o + 0.28, 0.55, lift(r), '#f4f4ee');
      for (const ds of [-2.5, 2.5]) for (let o = -r.half + 0.3; o < r.half - 0.3; o += 0.9) net.decal(batch, M.line, r, sc + ds - 0.1, sc + ds + 0.1, o + 0.3, 0.6, lift(r), white);
      zigzags(r, sc - 2.8, -1, true); zigzags(r, sc + 2.8, 1, true);
      for (const sd of [1, -1]) {
        tactile(r, sc, sd, '#b3574a');
        const b = net.pointAt(r, sc + sd * 1.8, sd * (r.half + 0.45), {}), gb = G(b.x, b.z);
        if (inBuilding(b.x, b.z)) continue;
        for (let i = 0; i < 6; i++) batch.add(M.plastic, new THREE.CylinderGeometry(0.055, 0.055, 0.45, 8), { x: b.x, y: gb + 0.225 + i * 0.45, z: b.z, color: i % 2 ? '#111111' : '#f4f4f4' });
        batch.add(beaconMat, new THREE.SphereGeometry(0.2, 12, 8), { x: b.x, y: gb + 2.95, z: b.z });
        world.addBox(b.x - 0.08, b.x + 0.08, gb - 1, gb + 2.9, b.z - 0.08, b.z + 0.08, 'pole');
        beacons.push([b.x, gb + 2.95, b.z]);
      }
      continue;
    }
    if (t === 'sig') {
      const arm = armOf(r, P.x, P.z); if (arm) arm.crossing = true;
      const grp = arm ? arm.g : 'X';
      for (const ds of [-1.3, 1.3]) for (let o = -r.half + 0.2; o < r.half - 0.1; o += 0.45) net.decal(batch, M.line, r, sc + ds - 0.1, sc + ds + 0.1, o + 0.1, 0.1, lift(r), white);
      stopLine(r, sc - 3, 1); stopLine(r, sc + 3, -1);
      zigzags(r, sc - 3.3, -1, true); zigzags(r, sc + 3.3, 1, true);
      for (const sd of [1, -1]) {
        tactile(r, sc, sd, '#b3574a');
        // pole on the nearside kerb for traffic heading `sd` (+1 = along +s), just before the crossing
        const q = net.pointAt(r, sc - sd * 2.0, sd * (r.half + 0.5), {});
        const face = Math.atan2(-q.tx * sd, -q.tz * sd);                                   // towards oncoming traffic
        const gy = pole(q.x, q.z, 3.6);
        head(q.x, q.z, gy, face, mats[grp]);
        head(q.x, q.z, gy, face + Math.PI, mats[grp]);                                         // secondary for the other way
        manHead(q.x, q.z, gy, Math.atan2(-q.tz * sd, q.tx * sd));                          // across the road
        button(q.x, q.z, gy, Math.atan2(q.tz * sd, -q.tx * sd));                           // facing the pavement
        const L = net.pointAt(r, sc - sd * 3, sd * r.half * 0.5, {});
        SIGNALS.stops.push({ x: L.x, z: L.z, hx: L.tx * sd, hz: L.tz * sd, g: grp });
      }
      continue;
    }
    // uncontrolled: dropped kerbs with buff tactile (not on quiet back streets without markings)
    if (t === 'mk' || r.kind !== 'r') for (const sd of [1, -1]) tactile(r, sc, sd, '#c7ae78');
  }

  // stop line + primary signal on every approach without its own signal crossing
  for (const j of J) for (const l of j.legs) {
    if (l.crossing) continue;
    const r = l.r, sd = l.atB ? 1 : -1;                                                 // travel direction towards the junction
    const s = l.atB ? r.length - j.clear : j.clear;
    if (s < 2 || s > r.length - 2) continue;
    stopLine(r, s, sd);
    const q = net.pointAt(r, s + sd * 0.8, sd * (r.half + 0.5), {});
    if (inBuilding(q.x, q.z)) continue;
    const gy = pole(q.x, q.z, 3.6);
    head(q.x, q.z, gy, Math.atan2(-q.tx * sd, -q.tz * sd), mats[l.g]);
    const L = net.pointAt(r, s, sd * r.half * 0.5, {});
    SIGNALS.stops.push({ x: L.x, z: L.z, hx: L.tx * sd, hz: L.tz * sd, g: l.g });
  }
  return { beacons, signals: SIGNALS };
}
