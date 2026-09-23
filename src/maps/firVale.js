// FIR VALE — prototype district.
//
// A fictional, game-ified take on the Barnsley Road / Page Hall Road corner
// of Fir Vale, Sheffield: a main road climbing a hill, a parade of small
// shops, red-brick terraces stepping down the slope, a little rec ground
// behind a gritstone wall, double yellows, a zebra crossing and a bus stop.
// Built only from general layout knowledge; every model and texture here is
// original and generated in code. No real businesses or homes are depicted.
//
// Coordinates are metres. +X = east, -Z = north (uphill), +Y = up.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { StaticBatch, pbr } from '../models/builders.js';
import * as PB from '../textures/pbr.js';
import { boxUV } from '../models/shapes.js';
import * as TX from '../textures/procedural.js';

export const ROAD = { halfWidth: 5, pave: 3.5, zMin: -150, zMax: 150 };
export const LANES = { north: -2.4, south: 2.4 }; // UK: drive on the left

const BRICK_TINTS = ['#ffffff', '#f0d8cc', '#e6c4b4', '#d9b8a8', '#fde2d4', '#c9a898'];
const DOOR_COLOURS = ['#7a1f1f', '#1f3f7a', '#245a2c', '#1b1b1b', '#f2f2ee', '#5a2d6b', '#b8862b'];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// What the ground is made of at (x, z) — drives footsteps, bullet impacts
// and casing bounces.
export function surfaceAt(x, z) {
  const ax = Math.abs(x);
  if (z > ROAD.zMin && z < ROAD.zMax) { if (ax < ROAD.halfWidth) return 'asphalt'; if (ax < ROAD.halfWidth + ROAD.pave) return 'paving'; }
  if (x > 1 && x < 112 && z > -48.5 && z < -35.5) return Math.abs(z + 42) < 4 ? 'asphalt' : 'paving';     // Page Hall Rd
  if (x < -1 && x > -112 && z > 44.2 && z < 55.8) return Math.abs(z - 50) < 3.6 ? 'asphalt' : 'paving';   // Owler Lane
  if (x > 8.5 && x < 24 && z > 34 && z < 48) return 'asphalt';                                            // car park
  if (x > 22.5 && x < 26 && z > -36 && z < 32) return 'asphalt';                                          // gennel
  if (z > 4 && z < 8 && x > -30 && x < -8.7) return 'paving';                                             // rec path
  return 'grass';
}

export function buildFirVale(scene, world, quality = 'medium') {
  const R = rng(1234);
  const batch = new StaticBatch();

  // ---------- materials (shared, few of them) ----------
  const tex = { win: [TX.houseWindowTexture(4), TX.houseWindowTexture(9), TX.houseWindowTexture(21)] };

  const hq = quality !== 'low';
  const n = hq ? 512 : 256;
  const M = {
    color: pbr(null, { roughness: 0.8 }),
    brick: pbr(PB.brickPBR(n), { normal: 1.2 }),
    stone: pbr(PB.stonePBR(256), { normal: 1.2 }),
    pave: pbr(PB.pavingPBR(256), { normal: 1.0 }),
    road: pbr(PB.asphaltPBR(n), { normal: 0.8 }),
    grass: pbr(PB.grassPBR(256), { normal: 0.8, env: 0.4 }),
    roof: pbr(PB.slatePBR(256), { normal: 1.0 }),
    // window glass: glossy so it reflects the sky and street
    win: tex.win.map((t) => { const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.4, vertexColors: true }); return m; }),
    leaves: pbr(null, { flatShading: true, roughness: 0.9 }),
    metal: pbr(PB.gunSteel(256, { tint: [120, 124, 128], wear: 0.2, seed: 40 }), { metalness: 0.9, normal: 0.3 }),
  };


  const interactables = [];
  const props = [];      // spots for shootable props { type, x, y, z }
  const beacons = [];    // blinking zebra-crossing globes

  // ---------- helpers ----------
  // Ground-hugging strip (roads, pavements, lines). Follows the hill.
  function strip(mat, x0, x1, z0, z1, lift, tile, color, seg = 4) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / seg));
    const nz = Math.max(1, Math.ceil((z1 - z0) / seg));
    const pos = [], uv = [], nor = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      pos.push(x, G(x, z) + lift, z); nor.push(0, 1, 0);
      uv.push(tile ? x / tile : 0, tile ? -z / tile : 0);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + nx + 1, c = a + 1, d = b + 1;
      idx.push(a, b, c, c, b, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    batch.add(mat, g, { color });
  }

  // Kerb stones along a line in Z (for the main road).
  function kerbZ(x, z0, z1) {
    for (let z = z0; z < z1; z += 2) {
      const zc = z + 1;
      batch.box(M.stone, x, G(x, zc) + 0.02, zc, 0.25, 0.35, 2.0, { color: '#bdb8ad', tile: 1 });
    }
  }
  function kerbX(z, x0, x1) {
    for (let x = x0; x < x1; x += 2) {
      const xc = x + 1;
      batch.box(M.stone, xc, G(xc, z) + 0.02, z, 2.0, 0.35, 0.25, { color: '#bdb8ad', tile: 1 });
    }
  }

  // Local-to-world for objects rotated by 0/90/180/270 degrees.
  const toWorld = (cx, cz, ry, lx, lz) => [cx + lx * Math.cos(ry) + lz * Math.sin(ry), cz - lx * Math.sin(ry) + lz * Math.cos(ry)];

  function roofPrism(cx, y, cz, width, depth, height, ry, color = '#8a8f98') {
    const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).toNonIndexed();
    g.rotateX(-Math.PI / 2); // triangle tip up, length along Z
    g.rotateY(Math.PI / 2);  // length along X (parallel to street front)
    const sy = height / 1.5;
    g.scale(width, sy, depth / 1.732); g.rotateY(ry); g.translate(cx, y + 0.5 * sy, cz);
    batch.add(M.roof, boxUV(g, 0.9), { color }); // world-scale UVs so slates are the right size
  }

  // ---------- terraced house ----------
  function house(cx, cz, ry, opts = {}) {
    const w = opts.w ?? 5.2, d = 8, H = 5.8;
    const g = G(cx, cz) - 0.15;
    const tint = BRICK_TINTS[(R() * BRICK_TINTS.length) | 0];
    const mirror = opts.mirror ? -1 : 1;
    const P = (lx, lz) => toWorld(cx, cz, ry, lx, lz);
    // body (extends 2m below ground so hills never show gaps)
    batch.box(M.brick, cx, g + (H - 2) / 2, cz, w, H + 2, d, { tile: 1.3, color: tint, ry });
    // stone band + sills
    let [x, z] = P(0, d / 2 + 0.02);
    batch.box(M.color, x, g + 2.9, z, w, 0.18, 0.12, { color: '#d8d0bf', ry });
    // door + step
    [x, z] = P(-1.5 * mirror, d / 2 + 0.04);
    const door = DOOR_COLOURS[(R() * DOOR_COLOURS.length) | 0];
    batch.box(M.color, x, g + 1.1, z, 1.0, 2.1, 0.1, { color: door, ry });
    [x, z] = P(-1.5 * mirror, d / 2 + 0.25);
    batch.box(M.stone, x, g + 0.08, z, 1.3, 0.25, 0.5, { color: '#cfc8b8', ry, tile: 1 });
    // windows
    const wm = M.win[(R() * 3) | 0];
    const addWin = (lx, y, ww, wh, lz = d / 2 + 0.05) => {
      const [wx, wz] = P(lx, lz);
      batch.box(wm, wx, y, wz, ww, wh, 0.08, { ry });
      const [sx, sz] = P(lx, lz + 0.06);
      batch.box(M.color, sx, y - wh / 2 - 0.06, sz, ww + 0.2, 0.12, 0.2, { color: '#d8d0bf', ry });
    };
    addWin(1.0 * mirror, g + 1.55, 1.5, 1.5);
    addWin(-1.3 * mirror, g + 4.25, 1.0, 1.3);
    addWin(1.3 * mirror, g + 4.25, 1.0, 1.3);
    // back windows
    addWin(0.8, g + 1.55, 1.0, 1.2, -d / 2 - 0.05);
    addWin(-0.8, g + 4.25, 1.0, 1.2, -d / 2 - 0.05);
    // slate roof
    roofPrism(cx, g + H, cz, w + 0.02, d + 0.5, 2.3, ry);
    // chimney on party wall
    if (opts.chimney) {
      [x, z] = P(w / 2, 0);
      batch.box(M.brick, x, g + H + 2.3, z, 0.8, 1.4, 1.3, { tile: 2, color: tint, ry });
      batch.box(M.color, x - 0.15, g + H + 3.15, z, 0.2, 0.35, 0.2, { color: '#b5563a' });
      batch.box(M.color, x + 0.2, g + H + 3.15, z, 0.2, 0.35, 0.2, { color: '#b5563a' });
    }
    // wheelie bin out front on some houses
    if (opts.bins && R() < 0.55) {
      [x, z] = P(1.8 * mirror, d / 2 + 0.6);
      wheelieBin(x, z, ry);
    }
    const sw = Math.abs(Math.sin(ry)) > 0.5;
    world.addFootprint(cx, cz, sw ? d : w, sw ? w : d, H + 2.3, 'building');
  }

  function wheelieBin(x, z, ry, colour) {
    const col = colour ?? ['#2a2a2a', '#2d4f8c', '#6b4a2b', '#2f6b36'][(R() * 4) | 0];
    const g = G(x, z);
    batch.box(M.color, x, g + 0.55, z, 0.6, 1.0, 0.7, { color: col, ry });
    batch.box(M.color, x, g + 1.08, z, 0.66, 0.08, 0.78, { color: col, ry });
    world.addBox(x - 0.33, x + 0.33, g - 1, g + 1.1, z - 0.36, z + 0.36, 'bin');
  }

  // Row of terraces along the main road (fronts facing the road).
  function terraceAlongZ(xFront, z0, z1, side) {
    // side = +1 east of road (faces west), -1 west of road (faces east)
    const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const cx = xFront + side * 4; // house depth 8
    let i = 0;
    for (let z = z0 + 2.6; z < z1 - 2.6; z += 5.2) {
      // leave a gennel (alley) gap every 8 houses
      if (i % 8 === 7) { i++; continue; }
      house(cx, z, ry, { mirror: i % 2 === 1, chimney: i % 2 === 0, bins: true });
      i++;
    }
  }
  // Row along a side street (fronts facing +z or -z).
  function terraceAlongX(zFront, x0, x1, facing) {
    const ry = facing > 0 ? 0 : Math.PI;
    const cz = zFront - facing * 4;
    let i = 0;
    for (let x = x0 + 2.6; x < x1 - 2.6; x += 5.2) {
      if (i % 9 === 8) { i++; continue; }
      house(x, cz, ry, { mirror: i % 2 === 1, chimney: i % 2 === 0, bins: true });
      i++;
    }
  }

  // ---------- shop unit ----------
  const signMeshes = [];
  function signMesh(texture, x, y, z, w, h, ry, rough = 0.45) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: rough, metalness: 0 }));
    m.position.set(x, y, z); m.rotation.y = ry;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m); signMeshes.push(m);
    return m;
  }

  function shop(cx, cz, ry, info) {
    const w = 10, d = 12, H = 7.2;
    const g = G(cx, cz) - 0.1;
    const P = (lx, lz) => toWorld(cx, cz, ry, lx, lz);
    batch.box(M.brick, cx, g + (H - 2) / 2, cz, w, H + 2, d, { tile: 1.3, color: info.brick ?? '#f3dccf', ry });
    // parapet cap
    batch.box(M.color, cx, g + H + 0.1, cz, w + 0.2, 0.25, d + 0.2, { color: '#8b8579', ry });
    // pilasters
    for (const lx of [-w / 2 + 0.2, w / 2 - 0.2]) {
      const [x, z] = P(lx, d / 2 + 0.1);
      batch.box(M.color, x, g + 1.9, z, 0.4, 3.8, 0.25, { color: '#3a3a3a', ry });
    }
    // shopfront frame
    let [x, z] = P(0, d / 2 + 0.05);
    batch.box(M.color, x, g + 0.3, z, w - 0.6, 0.6, 0.12, { color: '#2b2b2b', ry });
    // window (glass with stock behind)
    [x, z] = P(1.2, d / 2 + 0.06);
    signMesh(TX.shopWindowTexture(info.seed ?? 2), x, g + 1.9, z, 6.4, 2.4, ry, 0.06);
    // door
    [x, z] = P(-3.4, d / 2 + 0.06);
    batch.box(M.color, x, g + 1.35, z, 1.4, 2.5, 0.08, { color: info.door ?? '#1c2a33', ry });
    batch.box(M.color, x + Math.sin(ry) * 0.05, g + 1.35, z + Math.cos(ry) * 0.05, 0.05, 0.5, 0.05, { color: '#cfcfcf', ry });
    // fascia + sign
    [x, z] = P(0, d / 2 + 0.2);
    batch.box(M.color, x, g + 3.55, z, w - 0.2, 1.1, 0.3, { color: '#222', ry });
    [x, z] = P(0, d / 2 + 0.36);
    signMesh(TX.signTexture(info.sign), x, g + 3.55, z, w - 0.5, 0.95, ry);
    // shutter box
    [x, z] = P(0, d / 2 + 0.15);
    batch.box(M.color, x, g + 3.0, z, w - 0.8, 0.25, 0.3, { color: '#9a9a96', ry });
    // upstairs windows
    for (const lx of [-3, 0, 3]) {
      [x, z] = P(lx, d / 2 + 0.05);
      batch.box(M.win[(R() * 3) | 0], x, g + 5.3, z, 1.2, 1.5, 0.08, { ry });
    }
    // awning
    if (info.awning) {
      const stripes = 8;
      for (let i = 0; i < stripes; i++) {
        const lx = -w / 2 + 0.6 + (i + 0.5) * ((w - 1.2) / stripes);
        [x, z] = P(lx, d / 2 + 0.95);
        batch.box(M.color, x, g + 2.85, z, (w - 1.2) / stripes, 0.06, 1.7, { color: i % 2 ? '#f4f1e8' : info.awning, ry, rx: 0 });
      }
      // awning is tilted: fake it with a front valance
      [x, z] = P(0, d / 2 + 1.8);
      batch.box(M.color, x, g + 2.7, z, w - 1.2, 0.3, 0.05, { color: info.awning, ry });
    }
    // posters in the window
    (info.posters || []).forEach((p, i) => {
      [x, z] = P(-0.6 + i * 1.2, d / 2 + 0.09);
      signMesh(TX.posterTexture(p[0], p[1], p[2]), x, g + 1.6, z, 0.7, 1.05, ry);
    });
    const sw = Math.abs(Math.sin(ry)) > 0.5;
    const fb = world.addFootprint(cx, cz, sw ? d : w, sw ? w : d, H, 'building');
    fb.shop = true; // its road-facing wall has shop windows (glass impacts)
    return { x: P(0, d / 2 + 2)[0], z: P(0, d / 2 + 2)[1] };
  }

  // ---------- ground ----------
  strip(M.grass, -200, 200, -200, 200, -0.05, 4, '#8fae7a', 10);

  // Main road: Barnsley Road (fictionalised)
  strip(M.road, -ROAD.halfWidth, ROAD.halfWidth, ROAD.zMin, ROAD.zMax, 0.0, 4, '#ffffff');
  const pw = ROAD.halfWidth + ROAD.pave;
  strip(M.pave, ROAD.halfWidth, pw, ROAD.zMin, ROAD.zMax, 0.14, 1.8, '#ffffff');
  strip(M.pave, -pw, -ROAD.halfWidth, ROAD.zMin, ROAD.zMax, 0.14, 1.8, '#ffffff');
  kerbZ(ROAD.halfWidth, ROAD.zMin, ROAD.zMax);
  kerbZ(-ROAD.halfWidth, ROAD.zMin, ROAD.zMax);
  // centre dashes
  for (let z = ROAD.zMin; z < ROAD.zMax; z += 6) {
    if (z > 8 && z < 24) continue; // no dashes on the zebra crossing
    strip(M.color, -0.08, 0.08, z, z + 3, 0.03, 0, '#f2f2ea', 3);
  }
  // double yellow lines on both kerbs
  for (const sx of [-1, 1]) {
    const xi = sx * (ROAD.halfWidth - 0.3);
    strip(M.color, xi - 0.06, xi + 0.06, ROAD.zMin, ROAD.zMax, 0.03, 0, '#e8c21c', 6);
    const xo = sx * (ROAD.halfWidth - 0.5);
    strip(M.color, xo - 0.06, xo + 0.06, ROAD.zMin, ROAD.zMax, 0.03, 0, '#e8c21c', 6);
  }

  // Side street east: "Page Hall Road" (fictionalised)
  const PH = { z: -42, half: 4, pave: 2.5, x0: pw, x1: 112 };
  strip(M.road, PH.x0 - 3.5, PH.x1, PH.z - PH.half, PH.z + PH.half, 0.01, 4, '#ffffff');
  strip(M.pave, PH.x0, PH.x1, PH.z - PH.half - PH.pave, PH.z - PH.half, 0.14, 1.8, '#ffffff');
  strip(M.pave, PH.x0, PH.x1, PH.z + PH.half, PH.z + PH.half + PH.pave, 0.14, 1.8, '#ffffff');
  kerbX(PH.z - PH.half, PH.x0, PH.x1); kerbX(PH.z + PH.half, PH.x0, PH.x1);
  for (let x = PH.x0 + 4; x < PH.x1; x += 6) strip(M.color, x, x + 3, PH.z - 0.08, PH.z + 0.08, 0.03, 0, '#f2f2ea', 3);

  // Side street west: "Owler Lane" (fictionalised)
  const OL = { z: 50, half: 3.6, pave: 2.2, x0: -112, x1: -pw };
  strip(M.road, OL.x0, OL.x1 + 3.5, OL.z - OL.half, OL.z + OL.half, 0.01, 4, '#ffffff');
  strip(M.pave, OL.x0, OL.x1, OL.z - OL.half - OL.pave, OL.z - OL.half, 0.14, 1.8, '#ffffff');
  strip(M.pave, OL.x0, OL.x1, OL.z + OL.half, OL.z + OL.half + OL.pave, 0.14, 1.8, '#ffffff');
  kerbX(OL.z - OL.half, OL.x0, OL.x1); kerbX(OL.z + OL.half, OL.x0, OL.x1);

  // Back alley behind the shops (a Sheffield "gennel")
  strip(M.road, 22.5, 26, -36, 32, 0.01, 4, '#b8b8b8');

  // Zebra crossing by the shops, with flashing orange globes on poles
  for (let x = -ROAD.halfWidth + 0.4; x < ROAD.halfWidth - 0.4; x += 1.0) {
    strip(M.color, x, x + 0.5, 12, 18, 0.03, 0, '#f4f4ee', 3);
  }
  for (const sx of [-1, 1]) for (const zz of [11.2, 18.8]) {
    const bx = sx * (ROAD.halfWidth + 0.5), g = G(bx, zz);
    for (let i = 0; i < 6; i++) batch.box(M.color, bx, g + 0.25 + i * 0.45, zz, 0.12, 0.45, 0.12, { color: i % 2 ? '#111' : '#f4f4f4' });
    beacons.push(new THREE.Vector3(bx, g + 2.95, zz));
  }
  // zig-zags
  for (const sx of [-1, 1]) for (let z = 0; z < 11; z += 1) {
    const x = sx * (ROAD.halfWidth - 0.4);
    strip(M.color, x - 0.06, x + 0.06, z + 1.2, z + 1.7, 0.035, 0, '#f4f4ee', 1);
    strip(M.color, x - 0.06, x + 0.06, z + 18.3, z + 18.8, 0.035, 0, '#f4f4ee', 1);
  }

  // ---------- the shop parade (east side, facing the road) ----------
  const parade = [
    { sign: { text: 'PHONE DOCTOR 24/7', sub: 'SCREENS · UNLOCKS · EMOTIONAL SUPPORT', bg: '#0d3b66', accent: '#7fd1ff' }, seed: 5, brick: '#f0d0c0' },
    { sign: { text: 'VALE CUTZ', sub: 'BARBERS · NO APPOINTMENT · NO REFUNDS', bg: '#121212', accent: '#ff3b3b' }, seed: 8, brick: '#e8cbbb' },
    { sign: { text: 'FIR VALE MINI MART', sub: 'OPEN LATE · FRESH SAMOSAS · PHONE TOP-UP', bg: '#15603a', accent: '#ffcc00' }, seed: 2, awning: '#1f8a4c', start: true,
      posters: [['SAMOSAS', '3 for £1. Ask for Kev. Kev is not here.', '#ff7b00'], ['LOST CAT', 'Answers to "OI". Do not feed. He lies.', '#3d7fff'], ['NEW!', 'Crisps flavoured like other crisps', '#ff3d7f']] },
    { sign: { text: 'GOLDEN SPOON', sub: 'SWEET CENTRE · CAKES · PARTY TRAYS', bg: '#7a1b1b', accent: '#ffd36b' }, seed: 13, awning: '#b8862b', brick: '#f5dccd' },
    { sign: { text: 'BARGAIN PALACE', sub: 'EVERYTHING £1* (*MOST THINGS MORE)', bg: '#4b1c78', accent: '#ffe14d' }, seed: 17 },
    { sign: { text: 'TO LET', sub: 'ENQUIRE WITHIN (NOBODY IS WITHIN)', bg: '#e9e6dd', fg: '#222', accent: '#c0392b' }, seed: 30, door: '#555' },
  ];
  const shopX = pw + 6; // shop depth 12
  let startShop = null;
  parade.forEach((info, i) => {
    const z = -27 + i * 10 + 5 - 5; // units from z=-27 .. 33
    const front = shop(shopX, z - 2, -Math.PI / 2, info);
    if (info.start) startShop = { x: front.x, z: front.z, zc: z - 2 };
  });

  // Car park south of the parade
  strip(M.road, pw, 24, 34, 48, 0.02, 4, '#c8c8c8');
  for (let z = 35; z < 48; z += 2.6) strip(M.color, 14, 14.12, z, z + 2.4, 0.04, 0, '#f2f2ea', 3);
  props.push({ type: 'cone', x: 12, z: 36.5 }, { type: 'cone', x: 12.8, z: 38 });

  // ---------- terraces ----------
  terraceAlongZ(pw, ROAD.zMin, PH.z - PH.half - PH.pave - 0.5, +1);    // east, north of Page Hall Rd
  terraceAlongZ(pw, 50, ROAD.zMax, +1);                                  // east, south of car park
  terraceAlongZ(-pw, ROAD.zMin, -34, -1);                                // west, north of the rec
  terraceAlongZ(-pw, OL.z + OL.half + OL.pave + 0.5, ROAD.zMax, -1);     // west, south of Owler Ln
  // Page Hall Rd both sides
  terraceAlongX(PH.z - PH.half - PH.pave, pw + 8.5, PH.x1, +1);          // north side faces south
  terraceAlongX(PH.z + PH.half + PH.pave, 28, PH.x1, -1);                // south side faces north
  // Owler Lane both sides
  terraceAlongX(OL.z - OL.half - OL.pave, OL.x0, -44, +1);
  terraceAlongX(OL.z + OL.half + OL.pave, OL.x0, -pw - 8.5, -1);

  // ---------- Vale Rec (little park across the road) ----------
  const REC = { x0: -44, x1: -pw - 0.2, z0: -32, z1: 42 };
  // gritstone wall with a gap for the gate
  for (let z = REC.z0; z < REC.z1; z += 2) {
    if (z >= 4 && z < 8) continue; // gate
    const x = REC.x1 + 0.3, zc = z + 1, g = G(x, zc);
    batch.box(M.stone, x, g + 0.45, zc, 0.5, 1.1, 2.02, { tile: 1.5, color: '#e8e2d2' });
    batch.box(M.stone, x, g + 1.05, zc, 0.62, 0.14, 2.02, { tile: 1.5, color: '#bdb6a4' });
    world.addBox(x - 0.3, x + 0.3, g - 1, g + 1.12, zc - 1, zc + 1, 'wall');
  }
  // gate posts
  for (const zz of [4, 8]) { const x = REC.x1 + 0.3, g = G(x, zz); batch.box(M.stone, x, g + 0.8, zz, 0.6, 1.6, 0.6, { tile: 1.5 }); world.addBox(x - 0.3, x + 0.3, g - 1, g + 1.6, zz - 0.3, zz + 0.3, 'wall'); }
  // cans lined up on the wall for target practice
  for (let i = 0; i < 6; i++) {
    const z = -8 + i * 1.3, x = REC.x1 + 0.3;
    props.push({ type: 'can', x, z, y: G(x, z) + 1.12 + 0.12 });
  }
  // path
  strip(M.pave, -30, REC.x1, 4, 8, 0.03, 2, '#d8d2c4');
  strip(M.pave, -32, -28, REC.z0 + 2, REC.z1 - 2, 0.03, 2, '#d8d2c4');
  // trees
  const tree = (x, z, s = 1) => {
    const g = G(x, z);
    batch.box(M.color, x, g + 1.5 * s, z, 0.45 * s, 3 * s, 0.45 * s, { color: '#5b4331' });
    let geo = new THREE.IcosahedronGeometry(2.2 * s, 0); geo.computeVertexNormals();
    batch.add(M.leaves, geo, { x, y: g + 4.2 * s, z, ry: R() * 3, color: ['#4d8a3a', '#3f7a33', '#5f9a44'][(R() * 3) | 0] });
    geo = new THREE.IcosahedronGeometry(1.5 * s, 0); geo.computeVertexNormals();
    batch.add(M.leaves, geo, { x: x + 0.8 * s, y: g + 5.4 * s, z: z - 0.4 * s, color: '#5a9642' });
    world.addBox(x - 0.3 * s, x + 0.3 * s, g - 1, g + 3 * s, z - 0.3 * s, z + 0.3 * s, 'tree');
  };
  [[-16, -24, 1.1], [-22, -10, 0.9], [-38, -20, 1.2], [-14, 22, 1], [-24, 34, 1.15], [-38, 14, 0.95], [-36, 34, 1]].forEach(([x, z, s]) => tree(x, z, s));
  // bench
  const bench = (x, z) => { const g = G(x, z); batch.box(M.color, x, g + 0.45, z, 0.5, 0.08, 1.8, { color: '#7b5a3a' }); batch.box(M.color, x - 0.22, g + 0.75, z, 0.06, 0.5, 1.8, { color: '#7b5a3a' }); batch.box(M.color, x, g + 0.22, z - 0.8, 0.5, 0.45, 0.08, { color: '#333' }); batch.box(M.color, x, g + 0.22, z + 0.8, 0.5, 0.45, 0.08, { color: '#333' }); world.addBox(x - 0.3, x + 0.3, g - 1, g + 0.5, z - 0.9, z + 0.9, 'bench'); };
  bench(-26, 12); bench(-26, -2);
  // Rec sign
  { const x = REC.x1 + 0.9, z = 10.2, g = G(x, z); batch.box(M.color, x, g + 0.9, z - 1.1, 0.08, 1.8, 0.08, { color: '#333' }); batch.box(M.color, x, g + 0.9, z + 1.1, 0.08, 1.8, 0.08, { color: '#333' });
    signMesh(TX.signTexture({ text: 'VALE REC', sub: 'NO BALL GAMES · NO FUN · NO DOGS (EXCEPT BARRY)', bg: '#1d4f2a', accent: '#e0d36b', w: 512, h: 128 }), x + 0.05, g + 1.5, z, 2.4, 0.6, Math.PI / 2); }

  // ---------- Roadworks (construction area) closing half of Owler Lane ----------
  {
    const cx = -30, cz = 48.4;
    const g = G(cx, cz);
    // skip
    batch.box(M.color, cx, g + 0.7, cz, 3.6, 1.4, 1.8, { color: '#e2b007' });
    batch.box(M.color, cx, g + 1.2, cz, 3.2, 0.5, 1.4, { color: '#6d655a' });
    world.addBox(cx - 1.8, cx + 1.8, g - 1, g + 1.4, cz - 0.9, cz + 0.9, 'skip');
    // red & white barriers separating the dig from the open lane
    for (let i = 0; i < 5; i++) {
      const x = cx - 7 + i * 2.2, z = cz + 1.8, gg = G(x, z);
      batch.box(M.color, x, gg + 0.8, z, 2, 0.25, 0.08, { color: i % 2 ? '#d33' : '#f4f4f4' });
      batch.box(M.color, x - 0.9, gg + 0.45, z, 0.08, 0.9, 0.5, { color: '#333' });
      world.addBox(x - 1, x + 1, gg - 1, gg + 0.95, z - 0.1, z + 0.1, 'barrier');
    }
    // a hole in the road (dark patch) and a pile of spoil
    strip(M.color, cx - 6.5, cx - 3, cz - 1, cz + 1, 0.035, 0, '#2a2622', 2);
    batch.box(M.color, cx + 3.5, g + 0.3, cz, 1.8, 0.6, 1.4, { color: '#6a5037', ry: 0.4 });
    for (let i = 0; i < 5; i++) props.push({ type: 'cone', x: cx - 6.5 + i * 1.7, z: cz + 2.8 });
    // portable loo on the pavement
    const lx = cx + 6.5, lz = 45.2, lg = G(lx, lz);
    batch.box(M.color, lx, lg + 1.2, lz, 1.2, 2.4, 1.2, { color: '#2f7fd0' });
    batch.box(M.color, lx, lg + 2.45, lz, 1.3, 0.1, 1.3, { color: '#f4f4f4' });
    world.addBox(lx - 0.6, lx + 0.6, lg - 1, lg + 2.5, lz - 0.6, lz + 0.6, 'loo');
    signMesh(TX.signTexture({ text: 'LOO-TASTIC', sub: 'PORTABLE TOILET HIRE', bg: '#f4f4f4', fg: '#2f7fd0', accent: '#2f7fd0', w: 256, h: 96 }), lx, lg + 1.9, lz + 0.62, 1.1, 0.4, 0);
    interactables.push({ x: lx, z: lz + 1.2, radius: 1.8, prompt: 'Knock on the loo', lines: ['<b>Voice inside:</b> "OCCUPIED! Been occupied since Tuesday, love."', '<b>Voice inside:</b> "I\'m not coming out till the roadworks finish."', '<b>Voice inside:</b> "...Is it still Tuesday?"'] });
  }

  // ---------- street furniture ----------
  // Lamp posts
  const lamp = (x, z, dir) => {
    const g = G(x, z);
    batch.box(M.color, x, g + 3.5, z, 0.16, 7, 0.16, { color: '#5a6066' });
    batch.box(M.color, x + dir * 0.6, g + 6.95, z, 1.3, 0.1, 0.12, { color: '#5a6066' });
    batch.box(M.color, x + dir * 1.15, g + 6.85, z, 0.5, 0.14, 0.3, { color: '#fff3c4' });
    world.addBox(x - 0.1, x + 0.1, g - 1, g + 7, z - 0.1, z + 0.1, 'lamp');
  };
  for (let z = ROAD.zMin + 10; z < ROAD.zMax; z += 24) { lamp(pw - 0.6, z, -1); lamp(-pw + 0.6, z + 12, 1); }

  // Bus stop outside the rec (back to the wall, open to the road)
  {
    const x = -pw + 1.5, z = -14, g = G(x, z);
    batch.box(M.color, x - 0.9, g + 1.3, z, 0.06, 2.6, 3.4, { color: '#3a4a5a' });   // back panel
    batch.box(M.color, x, g + 2.65, z, 2.2, 0.1, 3.6, { color: '#2b3845' });         // roof
    batch.box(M.color, x - 0.6, g + 0.55, z, 0.4, 0.06, 2.8, { color: '#6e7b87' });   // perch seat
    batch.box(M.color, x, g + 1.3, z - 1.75, 1.8, 2.6, 0.05, { color: '#a7c7d9' });  // side panel
    for (const zz of [-1.7, 1.7]) batch.box(M.color, x + 0.95, g + 1.3, z + zz, 0.08, 2.6, 0.08, { color: '#2b3845' });
    world.addBox(x - 1.0, x - 0.8, g - 1, g + 2.6, z - 1.8, z + 1.8, 'shelter');
    world.addBox(x - 0.9, x + 0.9, g - 1, g + 2.6, z - 1.8, z - 1.7, 'shelter');
    const px = -ROAD.halfWidth - 0.6, pz = z - 3.2, pg = G(px, pz);
    batch.box(M.color, px, pg + 1.6, pz, 0.1, 3.2, 0.1, { color: '#333' });
    world.addBox(px - 0.08, px + 0.08, pg - 1, pg + 3.2, pz - 0.08, pz + 0.08, 'pole');
    signMesh(TX.signTexture({ text: 'BUS', sub: 'FIR VALE SHOPS · EVERY 10 MINS (IN THEORY)', bg: '#e8e8e8', fg: '#1a3d8f', accent: '#e8b400', w: 256, h: 160 }), px + 0.07, pg + 3.0, pz, 0.8, 0.5, Math.PI / 2);
    interactables.push({ x, z, radius: 2.2, prompt: 'Read the timetable', lines: ['<b>Timetable:</b> "Buses every 10 minutes. Usually in threes. Mostly at 2am."', 'Someone has written <b>"THE BUS IS A MYTH"</b> underneath in marker pen.'] });
  }

  // Red post box (generic pillar box shape)
  { const x = pw - 0.8, z = -34, g = G(x, z); batch.box(M.color, x, g + 0.75, z, 0.55, 1.5, 0.55, { color: '#c4161c' }); batch.box(M.color, x, g + 1.55, z, 0.62, 0.12, 0.62, { color: '#a01217' }); world.addBox(x - 0.3, x + 0.3, g - 1, g + 1.6, z - 0.3, z + 0.3, 'postbox'); }

  // Street name plates on little posts
  const streetSign = (text, x, z, ry) => {
    const g = G(x, z);
    const ox = Math.cos(ry) * 0.85, oz = -Math.sin(ry) * 0.85;
    batch.box(M.color, x - ox, g + 0.6, z - oz, 0.08, 1.2, 0.08, { color: '#222' });
    batch.box(M.color, x + ox, g + 0.6, z + oz, 0.08, 1.2, 0.08, { color: '#222' });
    signMesh(TX.signTexture({ text, sub: 'SHEFFIELD 4', bg: '#fbfbf6', fg: '#111', accent: '#fbfbf6', w: 384, h: 96, font: 'bold 44px Arial, sans-serif' }), x, g + 1.2, z, 1.8, 0.45, ry);
  };
  streetSign('BARNSLEY ROAD', pw - 0.4, -36.5, -Math.PI / 2);
  streetSign('PAGE HALL ROAD', 12, -47.9, 0);
  streetSign('OWLER LANE', -pw - 2.5, 55.3, Math.PI);

  // Bollards at the alley entrance
  for (const z of [-35.5, -34.3]) { const x = 24.2, g = G(x, z); batch.box(M.color, x, g + 0.5, z, 0.2, 1.0, 0.2, { color: '#1b1b1b' }); world.addBox(x - 0.1, x + 0.1, g - 1, g + 1, z - 0.1, z + 0.1, 'bollard'); }

  // Bins round the back of the shops
  for (let z = -24; z < 30; z += 7) wheelieBin(21.8 + 0.4, z, Math.PI / 2, '#2a2a2a');

  // A couple of shootable things outside the mini mart
  props.push({ type: 'cone', x: pw - 0.6, z: 4.5 });

  // ---------- distant Sheffield hills (never fogged, very cheap) ----------
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x8aa0a8, fog: false });
  const hillMat2 = new THREE.MeshBasicMaterial({ color: 0x9fb2b6, fog: false });
  const hills = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + R() * 0.2, r = 330 + R() * 40;
    const h = 30 + R() * 45;
    const m = new THREE.Mesh(new THREE.ConeGeometry(70 + R() * 50, h, 5), i % 2 ? hillMat : hillMat2);
    m.position.set(Math.cos(a) * r, -18 + h / 2 + (Math.sin(a) > 0 ? -8 : 10), Math.sin(a) * r);
    hills.add(m);
  }
  // A few far-off tower blocks and a chimney on the skyline
  const towerMat = new THREE.MeshBasicMaterial({ color: 0x7d8d95, fog: false });
  [[-0.6, 300, 40, 14], [-0.45, 310, 52, 16], [2.2, 305, 36, 12], [2.9, 320, 70, 5]].forEach(([a, r, h, w]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
    m.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r); hills.add(m);
  });
  scene.add(hills);

  // ---------- invisible map edges ----------
  world.addBox(-200, 200, -50, 50, ROAD.zMin - 2, ROAD.zMin, 'edge');
  world.addBox(-200, 200, -50, 50, ROAD.zMax, ROAD.zMax + 2, 'edge');
  world.addBox(-114, -112, -50, 50, -200, 200, 'edge');
  world.addBox(112, 114, -50, 50, -200, 200, 'edge');

  const meshes = batch.build(scene);
  for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; }

  // Beacon globes (animated)
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff9a1a });
  const beaconGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const beaconMeshes = beacons.map((p) => { const m = new THREE.Mesh(beaconGeo, beaconMat); m.position.copy(p); scene.add(m); return m; });

  interactables.push({ x: startShop.x, z: startShop.zc, radius: 3, prompt: 'Talk to the shopkeeper', lines: [
    '<b>Shopkeeper:</b> "Welcome to Fir Vale Mini Mart! We sell everything except the thing you want."',
    '<b>Shopkeeper:</b> "That rifle? Found it in the skip on Owler Lane with a revolver and a note saying SORRY. No refunds."',
    '<b>Shopkeeper:</b> "If you see a lad in a racing wheelchair, DO NOT accept his challenge. He cheats. With skill."',
    '<b>Shopkeeper:</b> "Samosas are fresh. Fresh-ish. Fresh in spirit."',
  ] });

  return {
    // Start on the far pavement, looking straight across at the Mini Mart.
    spawn: { x: -pw + 1.6, z: startShop.zc + 1.5, yaw: -Math.PI / 2 + 0.12 },
    startShop,
    interactables,
    props,
    beaconMat,
    beaconMeshes,
    meshCount: meshes.length + signMeshes.length,
    paveX: pw,
    surfaceAt,
  };
}
