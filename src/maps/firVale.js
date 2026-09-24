// FIR VALE — the playable district, built from real open map data.
//
// Every street, building footprint, shop location, bus stop, crossing,
// wall, park and wood comes from Overture Maps / OpenStreetMap, and the
// ground from open elevation data (see scripts/import-map and
// ./firvale/osm.js). The game adds its own detail on top: Victorian
// terrace fronts, invented shop names, textures and street furniture.
// Coordinates are metres, +X east, -Z north.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { StaticBatch } from '../models/builders.js';
import * as PB from '../textures/pbr.js';
import OSM from './firvale/osm.js';
import { PLACES } from './firvale/data.js';
import { RoadNetwork, DRIVABLE } from './firvale/roads.js';
import { windowAtlas, signAtlas, displayAtlas, Frame, rng } from './firvale/buildings.js';
import { buildFootprints } from './firvale/footprints.js';
import { buildChurch } from './firvale/landmarks.js';
import { buildStreetscape, plantTrees, parkCars, parkLots, setFleet } from './firvale/streetscape.js';
import { ParkedFleet } from '../models/vehicles.js';
import { buildCrossings, SIGNALS } from './firvale/crossings.js';
import { landMask, groundMaterial, buildGround, buildFarTerrain } from './firvale/terrain.js';
import { inPoly, flatToPts, centroid } from './firvale/geom.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function makeMaterials(quality) {
  const n = quality === 'low' ? 256 : 512;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, ...o });
  const win = windowAtlas(), signs = signAtlas(), disp = displayAtlas();
  const stained = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
    for (let y = 2; y < h; y += 10) for (let x = 2; x < w; x += 10) { g.fillStyle = `hsl(${[210, 45, 0, 130, 280][(x * 7 + y * 3) % 5]},60%,${30 + (x + y) % 25}%)`; g.fillRect(x, y, 8, 8); }
    g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  });
  const roadSign = canvasTex(512, 288, (g, w, h) => {
    g.fillStyle = '#1d4fa3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.textAlign = 'left';
    g.fillText('↑  Barnsley  (A6135)', 36, 70); g.fillText('←  Herries Road  (A6102)', 36, 130); g.fillText('↗  Firth Park  (B6086)', 36, 190);
    g.fillStyle = '#fff'; g.fillRect(36, 220, 250, 44); g.fillStyle = '#1d4fa3'; g.font = 'bold 26px Arial'; g.fillText('H  Northern General', 44, 252);
  });
  const busFlag = canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b5e20'; g.beginPath(); g.arc(64, 44, 32, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('BUS', 64, 54); g.fillStyle = '#222'; g.font = 'bold 13px Arial'; g.fillText('STOP', 64, 90); });
  const set = (s, o = {}) => std({ map: s.map, roughnessMap: s.roughnessMap, normalMap: s.normalMap, roughness: 1, ...o });
  const M = {
    road: set(PB.asphaltPBR(n), { normalScale: new THREE.Vector2(0.8, 0.8) }),
    roadFlat: set(PB.asphaltPBR(256)),
    pave: set(PB.pavingPBR(256)),
    kerb: set(PB.stonePBR(256)),
    line: std({ roughness: 0.6 }),
    grass: set(PB.grassPBR(256), { envMapIntensity: 0.4 }),
    brick: set(PB.brickPBR(n), { normalScale: new THREE.Vector2(1.2, 1.2) }),
    render: set(PB.polymerSet(256, { base: [200, 198, 190], seed: 91, stipple: 1.2 })),
    stone: set(PB.stonePBR(256)),
    dressed: set(PB.dressedPBR(256)),
    ashlar: set(PB.stonePBR(256)),
    slate: set(PB.slatePBR(256)),
    tile: set(PB.slatePBR(256)),
    ridge: std({ roughness: 0.7 }), clay: std({ roughness: 0.7 }),
    darkMetal: std({ roughness: 0.45, metalness: 0.6 }), metal: std({ roughness: 0.35, metalness: 0.8 }), galv: std({ roughness: 0.4, metalness: 0.9 }),
    door: std({ roughness: 0.35 }), plastic: std({ roughness: 0.55 }), hedge: std({ roughness: 0.95 }), dish: std({ roughness: 0.4, metalness: 0.3 }),
    win: std({ map: win, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.3 }),
    glass: std({ color: 0x3a4a55, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.5 }),
    display: std({ map: disp, roughness: 0.06, envMapIntensity: 1.3 }),
    sign: std({ map: signs.tex, roughness: 0.4 }),
    fabric: std({ roughness: 0.9 }), wood: set(PB.woodSet(256, { base: [120, 90, 60], seed: 3 }), { metalnessMap: null }), fruit: std({ roughness: 0.6 }),
    stainedGlass: std({ map: stained, roughness: 0.1, emissive: 0x111111 }), louvre: std({ roughness: 0.8 }),
    cladding: set(PB.polymerSet(256, { base: [220, 220, 215], seed: 51, stipple: 0.3 }), { roughness: 0.6 }),
    officeGlass: std({ color: 0x7890a0, roughness: 0.05, metalness: 0.4, envMapIntensity: 1.4 }),
    panel: std({ roughness: 0.4 }), fence: std({ roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.55 }),
    lampHead: std({ color: 0x9ea4a8, emissive: 0x222018, roughness: 0.3 }), signalLens: std({ roughness: 0.2, emissive: 0x220000 }),
    roadSign: std({ map: roadSign, roughness: 0.4 }), shelterGlass: std({ color: 0xa8c4d4, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }),
    busFlag: std({ map: busFlag, roughness: 0.5 }), names: std({ roughness: 0.5 }), postbox: std({ roughness: 0.35 }), cabinet: std({ roughness: 0.55 }),
    bark: set(PB.woodSet(128, { base: [90, 75, 60], seed: 8 }), { metalnessMap: null }), leaves: std({ roughness: 0.9, flatShading: false }),
    carPaint: std({ roughness: 0.28, metalness: 0.5, envMapIntensity: 1.2 }), carGlass: std({ color: 0x1b242c, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.5 }),
    tyre: std({ roughness: 0.9 }), lampLens: std({ roughness: 0.2, emissive: 0x111111 }), plate: std({ roughness: 0.5 }),
    roofFlat: set(PB.asphaltPBR(128), { roughness: 1 }),
  };
  M.wood.metalness = 0; M.bark.metalness = 0;
  // Share materials wherever only the tint differs: fewer materials = fewer
  // draw calls per chunk, which matters most on phones.
  const matte = std({ roughness: 0.75 }), metal = std({ roughness: 0.4, metalness: 0.75 }), gloss = std({ roughness: 0.18, metalness: 0.35, envMapIntensity: 1.3 });
  for (const k of ['ridge', 'clay', 'door', 'plastic', 'hedge', 'fabric', 'fruit', 'panel', 'louvre', 'postbox', 'cabinet', 'leaves', 'tyre', 'plate', 'line']) M[k] = matte;
  for (const k of ['darkMetal', 'metal', 'galv', 'dish']) M[k] = metal;
  for (const k of ['glass', 'officeGlass', 'carGlass', 'lampLens', 'signalLens', 'lampHead', 'carPaint']) M[k] = gloss;
  // tarmac footways: the same asphalt, but worn paler and finer than the carriageway
  M.paveTar = M.road.clone(); M.paveTar.color.setRGB(1.3, 1.28, 1.24); M.paveTar.normalScale = new THREE.Vector2(0.45, 0.45);
  for (const k in M) if (!M[k].name) M[k].name = k;
  M.kerb = M.dressed; M.ashlar = M.stone; M.tile = M.slate; M.bark = M.wood; M.roadFlat = M.road;
  return { M, signs };
}

function signTexture(lines, bg, fg, w = 512, h = 256) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center';
    lines.forEach(([t, size, y]) => { g.font = `bold ${size}px Arial`; g.fillText(t, w / 2, y, w - 30); });
  });
}

export function buildFirVale(scene, world, quality = 'medium', { haze = 0xc9ced3, sunDir = new THREE.Vector3(0.45, 0.6, 0.3) } = {}) {
  const t0 = performance.now();
  const { M, signs } = makeMaterials(quality);
  const batch = new StaticBatch();
  const BOUNDS = OSM.bounds;
  const interactables = [], props = [];
  const net = new RoadNetwork(OSM.roads);
  // controlled crossings get zig-zags instead of yellow lines / centre dashes
  net.xings = OSM.furniture.filter((f) => f.k === 'crossing' && (f.t === 'zeb' || f.t === 'sig')).map((f) => f.p);

  // ---- special sites from the land-use map ----
  const hospPolys = OSM.landuse.filter((l) => l.k === 'hospital').map((l) => flatToPts(l.p));
  const schoolPolys = OSM.landuse.filter((l) => l.k === 'school').map((l) => ({ P: flatToPts(l.p), n: l.n || '' }));
  const church = PLACES.church;
  const special = (x, z, A) => {
    if (Math.hypot(x - church[0], z - church[1]) < 25 && A > 400) return 'skip';
    if (A > 120 && hospPolys.some((P) => inPoly(P, x, z))) return 'hospital';
    if (A > 150 && schoolPolys.some((s) => inPoly(s.P, x, z))) return 'school';
    return null;
  };

  // ---- buildings from the real footprints ----
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffa020 });
  const fp = buildFootprints(batch, M, world, net, OSM, { signs, shopCells: signs.cells, special, miniMartAt: PLACES.miniMart });

  // ---- ground: real terrain + land-cover mask ----
  const mask = landMask(OSM, fp.residential, fp.list);
  const gmat = groundMaterial(mask, quality === 'low' ? 256 : 512);
  buildGround(batch, gmat);
  buildFarTerrain(scene, OSM.far, haze, sunDir);

  // ---- streets ----
  net.build(batch, M);

  // ---- St Cuthbert's Church on its real footprint ----
  const churchB = fp.list.find((b) => b.type === 'skip');
  if (churchB) {
    const o = churchB.o;
    const churchBoard = signTexture([["ST CUTHBERT'S", 44, 70], ['CHURCH · FIR VALE', 30, 118], ['Community meal & food bank', 24, 170], ['All welcome', 24, 210]], '#1f3b73', '#fff');
    const ch = buildChurch(batch, M, world, { at: [o.cx, o.cz], rot: Math.atan2(o.ux, o.uz) }, churchBoard, scene);
    interactables.push({ ...ch.interact, prompt: "Read St Cuthbert's notice board", lines: ["<b>Notice board:</b> \"St Cuthbert's, Fir Vale. Community meal every week. All welcome.\"", '<b>Notice board:</b> "Warm space open weekdays. Tea, toast and a natter. Nobody asks why you\'re here."'] });
  }

  // ---- street furniture, trees, parked cars ----
  const scape = buildStreetscape(batch, M, world, net, OSM, beaconMat);
  const xings = buildCrossings(batch, M, world, net, OSM, beaconMat);
  scape.beacons.push(...xings.beacons);
  plantTrees(batch, M, world, scape.trees);
  plantTrees(batch, M, world, scape.woods, true);
  const junctions = [...net.nodes.values()].filter((n) => n.roads.length >= 3).map((n) => { const e = n.roads[0], S = e.road.samples, p = e.end === 'a' ? S[0] : S[S.length - 1]; return [p.x, p.z]; });
  const nearJunction = (x, z, r) => junctions.some(([jx, jz]) => (jx - x) ** 2 + (jz - z) ** 2 < r * r);
  const busStops = OSM.furniture.filter((f) => f.k === 'bus').map((f) => f.p);
  const keepClear = (x, z) => nearJunction(x, z, 11) || Math.hypot(x - PLACES.miniMart[0], z - PLACES.miniMart[1]) < 22 || busStops.some(([bx, bz]) => (bx - x) ** 2 + (bz - z) ** 2 < 144) || world.near(x, z, 1, []).some((b) => b.tag !== 'edge' && b.tag !== 'building' && b.tag !== 'lamp' && Math.hypot(((b.minX + b.maxX) / 2) - x, ((b.minZ + b.maxZ) / 2) - z) < 2.5);
  const fleet = new ParkedFleet(scene, { range: quality === 'low' ? 45 : quality === 'high' ? 95 : 60 });
  setFleet(fleet);
  const parked = parkCars(batch, M, world, net, keepClear) + parkLots(batch, M, world, net, OSM, quality === 'low' ? 300 : 700);

  // ---- key places for the missions ----
  const phr = net.longest('Page Hall Road');
  const owl = net.allNamed('Owler Lane');
  // Mini Mart: the grocer on Page Hall Road
  const mm = fp.miniMart || fp.shopSpots.find((s) => s.cat === 'grocer') || fp.shopSpots[0];
  interactables.push({ x: mm.front[0], z: mm.front[1], radius: 3, prompt: 'Talk to the shopkeeper', lines: [
    '<b>Shopkeeper:</b> "Welcome to Fir Vale Mini Mart! Everything you need, except what you came in for."',
    '<b>Shopkeeper:</b> "That rifle? Found it in a skip on Owler Lane with a revolver and a note saying SORRY. No refunds."',
    '<b>Shopkeeper:</b> "Lad in the racing chair doing laps of Page Hall Road? That\'s Dez. Don\'t race him. He cheats. With skill."',
    '<b>Shopkeeper:</b> "Samosas are fresh. Fresh-ish. Fresh in spirit."',
    '<b>Shopkeeper:</b> "Dobrý deň, as my Slovak regulars taught me. I\'ve learned more Slovak than they\'ve learned Sheffield. Nobody learns Sheffield."',
  ] });

  // Cans on a low wall by Fir Vale School on Owler Lane
  const school = schoolPolys.find((s) => /Fir Vale Academy|Fir Vale School/.test(s.n)) || schoolPolys[0];
  const sc = school ? centroid(school.P) : [150, 260];
  let cansAt = null;
  { let best = null;
    for (const r of owl) for (let s = 5; s < r.length - 5; s += 3) { const p = net.pointAt(r, s, 0, {}); const d = Math.hypot(p.x - sc[0], p.z - sc[1]); if (!best || d < best.d) best = { d, r, s }; }
    if (best) {
      const r = best.r, c0 = net.pointAt(r, best.s, 0, {}), side = Math.sign((sc[0] - c0.x) * c0.tz - (sc[1] - c0.z) * c0.tx) || 1;
      // + offset is to the left of travel: (tz, -tx)
      const sgn = ((sc[0] - c0.x) * c0.tz + (sc[1] - c0.z) * -c0.tx) > 0 ? 1 : -1;
      const off = sgn * (r.half + r.pave + 0.35);
      for (let k = -6; k <= 6; k++) {
        const q = net.pointAt(r, best.s + k * 2, off, {}), g = G(q.x, q.z), ry = Math.atan2(q.tx, q.tz);
        batch.box(M.brick, q.x, g + 0.55, q.z, 0.35, 1.1, 2.08, { tile: 1.3, color: '#e0c4b4', ry }); batch.box(M.stone, q.x, g + 1.15, q.z, 0.42, 0.1, 2.1, { color: '#cfc3ad', ry });
        world.addOBB(q.x, q.z, 1.04, 0.2, ry + Math.PI / 2, g - 1, g + 1.2, 'wall');
      }
      for (let i = 0; i < 6; i++) { const q = net.pointAt(r, best.s - 4 + i * 1.4, off, {}); props.push({ type: 'can', x: q.x, z: q.z, y: G(q.x, q.z) + 1.2 + 0.02 }); }
      cansAt = [c0.x, c0.z];
      void side;
    } }

  // Roadworks on Owler Lane (half the carriageway closed) + portaloo
  { const ow = owl.sort((a, b) => b.length - a.length)[Math.min(1, owl.length - 1)] || owl[0];
    if (ow) {
      const s0 = ow.length * 0.5, P = (s, o) => net.pointAt(ow, s, o, {});
      const c = P(s0, -ow.half / 2), ry = Math.atan2(c.tx, c.tz), g = G(c.x, c.z);
      const f = new Frame(batch, c.x, c.z, ry, g);
      f.box(M.plastic, 0, 0.7, 0, 1.8, 1.4, 3.6, { color: '#e2b007' }); f.box(M.stone, 0, 1.2, 0, 1.4, 0.5, 3.2, { color: '#6d655a' });
      world.addOBB(c.x, c.z, 0.9, 1.8, ry, g - 1, g + 1.4, 'skip');
      for (let k = -3; k <= 3; k++) {
        const b = P(s0 + k * 2.2, -0.4), bg = G(b.x, b.z);
        batch.box(M.plastic, b.x, bg + 0.8, b.z, 0.08, 0.25, 2, { color: k % 2 ? '#d33' : '#f4f4f4', ry: Math.atan2(b.tx, b.tz) });
        world.addOBB(b.x, b.z, 0.1, 1, Math.atan2(b.tx, b.tz), bg - 1, bg + 0.95, 'barrier');
        const cn = P(s0 + k * 2.2, 0.8); props.push({ type: 'cone', x: cn.x, z: cn.z, tag: 'roadworks' });
      }
      const lp = P(s0 + 12, -(ow.half + ow.pave - 0.9)), lg = G(lp.x, lp.z);
      batch.box(M.plastic, lp.x, lg + 1.2, lp.z, 1.2, 2.4, 1.2, { color: '#2f7fd0' });
      world.addBox(lp.x - 0.6, lp.x + 0.6, lg - 1, lg + 2.5, lp.z - 0.6, lp.z + 0.6, 'loo');
      interactables.push({ x: lp.x, z: lp.z, radius: 2.2, prompt: 'Knock on the portaloo', lines: ['<b>Voice inside:</b> "OCCUPIED! Been occupied since Tuesday, love."', '<b>Voice inside:</b> "I\'m not coming out till they\'ve finished Owler Lane."', '<b>Voice inside:</b> "...Is it still Tuesday?"'] });
    } }
  { const p = net.pointAt(phr, phr.length * 0.3, -(phr.half + 0.7), {}); props.push({ type: 'cone', x: p.x, z: p.z }); }

  // ---- invisible map edges ----
  world.addBox(BOUNDS.minX - 2, BOUNDS.maxX + 2, -80, 300, BOUNDS.minZ - 2, BOUNDS.minZ, 'edge');
  world.addBox(BOUNDS.minX - 2, BOUNDS.maxX + 2, -80, 300, BOUNDS.maxZ, BOUNDS.maxZ + 2, 'edge');
  world.addBox(BOUNDS.minX - 2, BOUNDS.minX, -80, 300, BOUNDS.minZ, BOUNDS.maxZ, 'edge');
  world.addBox(BOUNDS.maxX, BOUNDS.maxX + 2, -80, 300, BOUNDS.minZ, BOUNDS.maxZ, 'edge');

  fleet.build(); setFleet(null);
  const meshes = batch.build(scene);
  for (const m of meshes) { m.castShadow = !m.userData.detail && m.material !== gmat; m.receiveShadow = true; m.geometry.computeBoundingSphere(); }

  // distance culling: hide far chunks (fog hides them anyway) and far detail
  const detailRange = quality === 'low' ? 45 : quality === 'high' ? 110 : 75, farRange = quality === 'low' ? 150 : quality === 'high' ? 230 : 195;
  let lodT = 0, lx = 1e9, lz = 1e9;
  function updateLOD(pos, dt = 1) {
    lodT -= dt;
    const jumped = Math.hypot(pos.x - lx, pos.z - lz) > 15; // teleport/respawn: refresh now
    if (lodT > 0 && !jumped) return;
    lodT = 0.25; lx = pos.x; lz = pos.z;
    fleet.update(pos);
    for (const m of meshes) {
      const c = m.userData.wc; if (!c) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z) - m.userData.wr * 0.55;
      m.visible = d < (m.userData.detail ? detailRange : m.material === gmat ? farRange + 150 : farRange);
      if (!m.userData.detail && m.material !== gmat) m.castShadow = d < 45; // only nearby chunks draw into the shadow map
    }
  }

  const surfaceAt = (x, z) => {
    const s = net.surfaceAt(x, z); if (s) return s;
    const px = Math.floor(x - mask.x0), pz = Math.floor(z - mask.z0);
    const d = maskData(mask, px, pz);
    return d[0] > 120 ? 'grass' : d[1] > 120 ? 'dirt' : 'paving';
  };

  // how grassy the ground is here (0..1), for the 3-D grass: not on roads/pavements/paths
  const grassAt = (x, z) => {
    const d = maskData(mask, Math.floor(x - mask.x0), Math.floor(z - mask.z0));
    const a = d[0] / 255 * (1 - d[2] / 255) * (1 - d[1] / 510);
    if (a < 0.45 || net.onRoadOrPavement(x, z, 0.35)) return 0;
    return a;
  };

  // spawn on the Page Hall Road pavement outside the Mini Mart, looking down the shops
  const mmN = net.nearest(mm.front[0], mm.front[1], null, (r) => r.name === 'Page Hall Road') || net.nearestStreet(mm.front[0], mm.front[1]);
  const spR = mmN ? mmN.road : phr;
  const sp = net.pointAt(spR, (mmN ? mmN.s : spR.length * 0.4) - 6, (mmN ? mmN.side : 1) * (spR.half + spR.pave * 0.5), {});
  const spawn = { x: sp.x, z: sp.z, yaw: Math.atan2(-sp.tx, -sp.tz) + Math.PI };
  const dezPath = []; for (let k = 0.1; k <= 0.9; k += 0.05) { const p = net.pointAt(phr, phr.length * k, -(mmN ? mmN.side : 1) * (phr.half + phr.pave * 0.55), {}); dezPath.push([p.x, p.z]); }

  console.log(`Fir Vale built in ${Math.round(performance.now() - t0)} ms: ${meshes.length} meshes, ${world.boxes.length} colliders, ${parked} parked cars, ${fp.shopSpots.length} shops, ${fp.list.length} buildings`);
  return {
    spawn,
    startShop: { x: mm.front[0], zc: mm.front[1], y: mm.gF },
    interactables, props, beaconMat, signals: SIGNALS, meshCount: meshes.length,
    surfaceAt, grassAt, net, dezPath, updateLOD, cansAt, churchAt: churchB ? [churchB.o.cx, churchB.o.cz] : null,
    bounds: BOUNDS, shopSpots: fp.shopSpots, buildings: fp.list, landuse: OSM.landuse, junctions, nearJunction,
  };
}

let _maskPix = null;
function maskData(mask, px, pz) {
  const W = mask.canvas.width, H = mask.canvas.height;
  if (!_maskPix) _maskPix = mask.canvas.getContext('2d').getImageData(0, 0, W, H).data;
  if (px < 0 || pz < 0 || px >= W || pz >= H) return [0, 0, 0];
  const i = (pz * W + px) * 4; return [_maskPix[i], _maskPix[i + 1], _maskPix[i + 2]];
}
