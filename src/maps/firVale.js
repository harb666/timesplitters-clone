// FIR VALE — the playable district, rebuilt on the real street layout.
//
// Streets: Barnsley Road, Herries Road, Firth Park Road, Owler Lane,
// Page Hall Road, Rushby Street, Hinde House Lane, Popple Street, Wensley
// Street, Robey Street, Hinde Street, Skinnerthorpe Road and back streets.
// Landmarks: the Fir Vale junction by St Cuthbert's Church, the Northern
// General Hospital campus, Fir Vale School on Owler Lane, the Page Hall Road
// shops. See ./firvale/data.js for sources. Coordinates are metres, +X east,
// -Z north.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { StaticBatch, pbr, tiledBox, CHUNK } from '../models/builders.js';
import * as PB from '../textures/pbr.js';
import { ROADS, SITES, PLACES, ROUTES, JUNCTION, BOUNDS } from './firvale/data.js';
import { RoadNetwork, infillStreets } from './firvale/roads.js';
import { Occupancy, buildTerraces, windowAtlas, signAtlas, displayAtlas, Frame, rng } from './firvale/buildings.js';
import { buildChurch, buildHospital, buildSchool, inPoly } from './firvale/landmarks.js';
import { buildStreetscape, plantTrees, parkCars } from './firvale/streetscape.js';

export { JUNCTION };

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
  };
  M.wood.metalness = 0; M.bark.metalness = 0;
  // Share materials wherever only the tint differs: fewer materials = fewer
  // draw calls per chunk, which matters most on phones.
  const matte = std({ roughness: 0.75 }), metal = std({ roughness: 0.4, metalness: 0.75 }), gloss = std({ roughness: 0.18, metalness: 0.35, envMapIntensity: 1.3 });
  for (const k of ['ridge', 'clay', 'door', 'plastic', 'hedge', 'fabric', 'fruit', 'panel', 'louvre', 'postbox', 'cabinet', 'leaves', 'tyre', 'plate', 'line']) M[k] = matte;
  for (const k of ['darkMetal', 'metal', 'galv', 'dish']) M[k] = metal;
  for (const k of ['glass', 'officeGlass', 'carGlass', 'lampLens', 'signalLens', 'lampHead', 'carPaint']) M[k] = gloss;
  M.kerb = M.stone; M.ashlar = M.stone; M.tile = M.slate; M.bark = M.wood; M.roadFlat = M.road;
  return { M, signs };
}

function signTexture(lines, bg, fg, w = 512, h = 256) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center';
    lines.forEach(([t, size, y]) => { g.font = `bold ${size}px Arial`; g.fillText(t, w / 2, y, w - 30); });
  });
}

export function buildFirVale(scene, world, quality = 'medium') {
  const t0 = performance.now();
  const { M, signs } = makeMaterials(quality);
  const batch = new StaticBatch();
  const hospitalPoly0 = SITES.hospital.poly, schoolPoly0 = SITES.school.poly;
  const blocked0 = (x, z) => inPoly(hospitalPoly0, x, z) || inPoly(schoolPoly0, x, z) || Math.hypot(x - SITES.church.at[0], z - SITES.church.at[1]) < 40;
  const net = new RoadNetwork([...ROADS, ...infillStreets(blocked0, BOUNDS)]);
  const occ = new Occupancy({ minX: BOUNDS.minX - 150, maxX: BOUNDS.maxX + 150, minZ: BOUNDS.minZ - 150, maxZ: BOUNDS.maxZ + 150 });
  const interactables = [], props = [];

  const hospitalPoly = SITES.hospital.poly, schoolPoly = SITES.school.poly;
  const nearChurch = (x, z) => Math.hypot(x - SITES.church.at[0], z - SITES.church.at[1]) < 30;
  const isBlocked = (x, z, sitesOnly = false) => inPoly(hospitalPoly, x, z) || inPoly(schoolPoly, x, z) || nearChurch(x, z) || (!sitesOnly && false);

  // ---- terrain (chunked grid following the hills) ----
  const X0 = BOUNDS.minX - 140, X1 = BOUNDS.maxX + 140, Z0 = BOUNDS.minZ - 140, Z1 = BOUNDS.maxZ + 140, ST = 8;
  for (let cx = X0; cx < X1; cx += CHUNK) for (let cz = Z0; cz < Z1; cz += CHUNK) {
    const pos = [], uv = [], idx = []; const n = CHUNK / ST;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = cx + i * ST, z = cz + j * ST; pos.push(x, G(x, z) - 0.05, z); uv.push(x / 4, -z / 4); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    batch.add(M.grass, g, { color: '#9aa87e' });
  }

  // ---- roads: mark them in the occupancy grid, then build ----
  for (const r of net.roads) for (const smp of r.samples) {
    const w = r.half + r.pave + 0.3;
    for (let o = -w; o <= w; o += 0.8) { const x = smp.x + smp.tz * o, z = smp.z - smp.tx * o; for (let d = -1.6; d <= 1.6; d += 0.8) occ.set(x + smp.tx * d, z + smp.tz * d); }
  }
  net.build(batch, M);

  // ---- landmarks ----
  const churchBoard = signTexture([["ST CUTHBERT'S", 44, 70], ['CHURCH · FIR VALE', 30, 118], ['Community meal & food bank', 24, 170], ['All welcome', 24, 210]], '#1f3b73', '#fff');
  const church = buildChurch(batch, M, world, SITES.church, churchBoard, scene);
  interactables.push({ ...church.interact, prompt: "Read St Cuthbert's notice board", lines: ["<b>Notice board:</b> \"St Cuthbert's, Fir Vale. Community meal every week. All welcome.\"", '<b>Notice board:</b> "Lost: one Scrap Blaster. If found, please do not return it."'] });
  const nghSign = signTexture([['NORTHERN GENERAL HOSPITAL', 30, 70], ['Main Entrance  →', 34, 130], ['Emergency Department  →', 30, 190]], '#f4f4f0', '#0a4a8a', 512, 220);
  const hosp = buildHospital(batch, M, world, hospitalPoly, net, scene, nghSign);
  buildSchool(batch, M, world, schoolPoly, net);
  // mark landmark areas as occupied
  for (let x = BOUNDS.minX - 150; x < BOUNDS.maxX + 150; x += 1) for (let z = BOUNDS.minZ - 150; z < BOUNDS.maxZ + 150; z += 1) if (isBlocked(x, z)) occ.set(x, z);

  // ---- terraces & shops on every street ----
  const shopSpots = buildTerraces(batch, M, net, occ, world, isBlocked, null, signs);

  // ---- street furniture, trees, parked cars ----
  const scape = buildStreetscape(batch, M, world, net, JUNCTION, occ, isBlocked, PLACES);
  plantTrees(batch, M, world, [...hosp.trees, ...scape.trees, [-30, 200, 1.1], [0, 215, 0.9], [-80, 210, 1.2]]);
  const parked = parkCars(batch, M, world, net, JUNCTION, isBlocked);

  // ---- zebra crossing on Page Hall Road with flashing globes ----
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffa020 });
  const phr = net.byName('Page Hall Road');
  const zs = phr.length * 0.55;
  for (let o = -phr.half + 0.5; o < phr.half - 0.3; o += 1.0) {
    const p = net.pointAt(phr, zs, o + 0.25, {});
    batch.box(M.line, p.x, G(p.x, p.z) + 0.05, p.z, 0.5, 0.02, 3.2, { color: '#f4f4ee', ry: Math.atan2(p.tx, p.tz) + Math.PI / 2 });
  }
  const beaconGeo = new THREE.SphereGeometry(0.2, 12, 8);
  for (const sd of [1, -1]) for (const ds of [-2.2, 2.2]) {
    const p = net.pointAt(phr, zs + ds, sd * (phr.half + 0.45), {}), g = G(p.x, p.z);
    for (let i = 0; i < 6; i++) batch.box(M.plastic, p.x, g + 0.25 + i * 0.45, p.z, 0.1, 0.45, 0.1, { color: i % 2 ? '#111' : '#f4f4f4' });
    const m = new THREE.Mesh(beaconGeo, beaconMat); m.position.set(p.x, g + 2.9, p.z); scene.add(m);
    world.addBox(p.x - 0.08, p.x + 0.08, g - 1, g + 2.9, p.z - 0.08, p.z + 0.08, 'pole');
  }

  // ---- the Fir Vale Mini Mart (our shop), shopkeeper ----
  const mm = shopSpots.find((s) => s.sign === 0) || shopSpots[0];
  interactables.push({ x: mm.front[0], z: mm.front[1], radius: 3, prompt: 'Talk to the shopkeeper', lines: [
    '<b>Shopkeeper:</b> "Welcome to Fir Vale Mini Mart! Everything you need, except what you came in for."',
    '<b>Shopkeeper:</b> "That rifle? Found it in a skip on Owler Lane with a revolver and a note saying SORRY. No refunds."',
    '<b>Shopkeeper:</b> "Lad in the racing chair doing laps of Page Hall Road? That\'s Dez. Don\'t race him. He cheats. With skill."',
    '<b>Shopkeeper:</b> "Samosas are fresh. Fresh-ish. Fresh in spirit."',
  ] });

  // ---- cans on the low wall in front of Fir Vale School ----
  { const { x0, x1 } = PLACES.cansWall;
    const wz = (x) => 205 + (x - 70) * 30 / 115 - 0.8, ry = Math.atan2(115, 30);
    for (let x = x0; x < x1; x += 2) { const xc = x + 1, z = wz(xc), g = G(xc, z); batch.box(M.brick, xc, g + 0.55, z, 0.35, 1.1, 2.08, { tile: 1.3, color: '#e0c4b4', ry }); batch.box(M.stone, xc, g + 1.15, z, 0.42, 0.1, 2.1, { color: '#cfc3ad', ry }); world.addOBB(xc, z, 0.2, 1.04, ry, g - 1, g + 1.2, 'wall'); }
    for (let i = 0; i < 6; i++) { const x = x0 + 16 + i * 1.3, z = wz(x); props.push({ type: 'can', x, z, y: G(x, z) + 1.2 + 0.02 }); } }

  // ---- roadworks on Owler Lane (half the carriageway closed) ----
  { const ow = net.byName('Owler Lane'), s0 = ow.length * PLACES.roadworks.t;
    const P = (s, o) => net.pointAt(ow, s, o, {});
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
  }
  // a couple of cones outside the shops too
  { const p = net.pointAt(phr, phr.length * 0.3, -(phr.half + 0.7), {}); props.push({ type: 'cone', x: p.x, z: p.z }); }

  // ---- distant hills: Wincobank to the north-east, the city to the south ----
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x8aa0a8, fog: false }), hillMat2 = new THREE.MeshBasicMaterial({ color: 0x9fb2b6, fog: false });
  const R = rng(3);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, r = 900 + R() * 120, h = 40 + R() * 60 + (Math.cos(a - 0.6) > 0.7 ? 50 : 0);
    const m = new THREE.Mesh(new THREE.ConeGeometry(160 + R() * 120, h, 6), i % 2 ? hillMat : hillMat2);
    m.position.set(Math.cos(a) * r, -25 + h / 2, Math.sin(a) * r); scene.add(m);
  }

  // ---- invisible map edges ----
  world.addBox(BOUNDS.minX - 2, BOUNDS.maxX + 2, -50, 200, BOUNDS.minZ - 2, BOUNDS.minZ, 'edge');
  world.addBox(BOUNDS.minX - 2, BOUNDS.maxX + 2, -50, 200, BOUNDS.maxZ, BOUNDS.maxZ + 2, 'edge');
  world.addBox(BOUNDS.minX - 2, BOUNDS.minX, -50, 200, BOUNDS.minZ, BOUNDS.maxZ, 'edge');
  world.addBox(BOUNDS.maxX, BOUNDS.maxX + 2, -50, 200, BOUNDS.minZ, BOUNDS.maxZ, 'edge');

  const meshes = batch.build(scene);
  for (const m of meshes) { m.castShadow = !m.userData.detail; m.receiveShadow = true; m.geometry.computeBoundingSphere(); }

  // distance culling: hide far chunks (fog hides them anyway) and far detail
  const detailRange = quality === 'low' ? 45 : quality === 'high' ? 110 : 75, farRange = quality === 'low' ? 150 : quality === 'high' ? 260 : 200;
  let lodT = 0, lx = 1e9, lz = 1e9;
  function updateLOD(pos, dt = 1) {
    lodT -= dt;
    const jumped = Math.hypot(pos.x - lx, pos.z - lz) > 15; // teleport/respawn: refresh now
    if (lodT > 0 && !jumped) return;
    lodT = 0.25; lx = pos.x; lz = pos.z;
    for (const m of meshes) {
      const s = m.geometry.boundingSphere; if (!s) continue;
      const d = Math.hypot(s.center.x - pos.x, s.center.z - pos.z) - s.radius * 0.55;
      m.visible = d < (m.userData.detail ? detailRange : farRange);
      if (!m.userData.detail) m.castShadow = d < 45; // only nearby chunks draw into the shadow map
    }
  }

  console.log(`Fir Vale built in ${Math.round(performance.now() - t0)} ms: ${meshes.length} meshes, ${world.boxes.length} colliders, ${parked} parked cars, ${shopSpots.length} shops`);

  const surfaceAt = (x, z) => {
    if (inPoly(schoolPoly, x, z)) return 'grass';
    return net.surfaceAt(x, z);
  };
  // spawn on the Page Hall Road pavement looking down the shops; Dez laps
  // the opposite pavement
  const sp = net.pointAt(phr, phr.length * 0.32, -(phr.half + phr.pave * 0.45), {});
  const spawn = { x: sp.x, z: sp.z, yaw: Math.atan2(-sp.tx, -sp.tz) - 0.12 };
  const dezPath = []; for (let k = 0.12; k <= 0.9; k += 0.06) { const p = net.pointAt(phr, phr.length * k, -(phr.half + 1.3), {}); dezPath.push([p.x, p.z]); }
  return {
    spawn,
    startShop: { x: mm.front[0], zc: mm.front[1] },
    interactables, props, beaconMat, meshCount: meshes.length,
    surfaceAt, net, routes: ROUTES, dezPath, updateLOD,
    roadsForMap: ROADS, junction: JUNCTION, bounds: BOUNDS, sites: SITES,
  };
}
