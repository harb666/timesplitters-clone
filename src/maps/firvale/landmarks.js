// Landmarks: St Cuthbert's Church, the Northern General Hospital campus
// and Fir Vale School. Massing from public descriptions; all geometry and
// textures are original.
import * as THREE from 'three';
import { groundHeight as G } from '../../core/world.js';
import { Frame, rng } from './buildings.js';
import { boxUV } from '../../models/shapes.js';

function pitchedRoof(w, d, h) { // ridge along X
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).toNonIndexed();
  g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.scale(w, h / 1.5, d / 1.732); g.translate(0, 0.5 * h / 1.5, 0);
  return boxUV(g, 0.8);
}

export function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}

// ------------------------------------------------------------------ church
// Gothic Revival, 1901-04: squared dressed stone, plain tile roofs, nave
// with clerestory and aisles, double-gabled transepts, NW tower (1959).
export function buildChurch(batch, M, world, site, signTex, scene) {
  const [cx, cz] = site.at, ry = site.rot;
  const f = new Frame(batch, cx, cz, ry, G(cx, cz) - 0.3);
  const stone = '#c9bfa8', dress = '#e2d9c5';
  // nave (long axis = local Z)
  const NL = 30, NW = 9, NH = 11;
  f.box(M.ashlar, 0, (NH - 2) / 2, 0, NW, NH + 2, NL, { tile: 2, color: stone });
  f.geo(M.tile, pitchedRoof(NL + 0.6, NW + 1.2, 6.5).rotateY(Math.PI / 2), 0, NH, 0, { color: '#8b4a3a' });
  // aisles (lower, lean-to roofs)
  for (const sd of [-1, 1]) {
    f.box(M.ashlar, sd * (NW / 2 + 2.2), 2.5, 1, 4.4, 7, NL - 6, { tile: 2, color: stone });
    f.box(M.tile, sd * (NW / 2 + 2.2), 6.3, 1, 5.2, 0.35, NL - 5.6, { color: '#8b4a3a', rz: sd * 0.32 });
    // buttresses + lancet windows along aisle walls
    for (let k = -2; k <= 2; k++) {
      const z = 1 + k * 5;
      f.box(M.ashlar, sd * (NW / 2 + 4.5), 2.2, z + 2.5, 0.7, 4.4, 0.8, { tile: 2, color: dress, detail: true });
      f.box(M.stainedGlass, sd * (NW / 2 + 4.42), 3.2, z, 0.1, 2.8, 1.0, { color: '#ffffff' });
      f.box(M.ashlar, sd * (NW / 2 + 4.45), 4.75, z, 0.18, 0.35, 1.3, { tile: 2, color: dress, detail: true });
      // clerestory windows
      f.box(M.stainedGlass, sd * (NW / 2 + 0.02), 9.2, z, 0.1, 1.8, 0.9, { color: '#ffffff' });
    }
  }
  // transepts (double-gabled) near the east end
  for (const sd of [-1, 1]) {
    f.box(M.ashlar, sd * (NW / 2 + 3), (9 - 2) / 2, -9, 6, 11, 9, { tile: 2, color: stone });
    f.geo(M.tile, pitchedRoof(6.4, 9.6, 5), sd * (NW / 2 + 3), 9, -9, { color: '#8b4a3a' });
    f.box(M.stainedGlass, sd * (NW / 2 + 6.02), 5, -9, 0.1, 5, 2.4, { color: '#ffffff' });
  }
  // chancel (narrower, east end = local -Z) with great east window
  f.box(M.ashlar, 0, 3.5, -NL / 2 - 4, 7, 9, 8, { tile: 2, color: stone });
  f.geo(M.tile, pitchedRoof(8.4, 8, 4.8).rotateY(Math.PI / 2), 0, 8, -NL / 2 - 4, { color: '#8b4a3a' });
  f.box(M.stainedGlass, 0, 5, -NL / 2 - 8.02, 3.2, 5.2, 0.1, { color: '#ffffff' });
  // west front: gable window, porch
  f.box(M.stainedGlass, 0, 7, NL / 2 + 0.02, 3.6, 5.5, 0.1, { color: '#ffffff' });
  f.box(M.ashlar, -NW / 2 - 2, 2, NL / 2 + 1.5, 3.2, 4, 3, { tile: 2, color: stone });
  f.box(M.door, -NW / 2 - 2, 1.4, NL / 2 + 3.02, 1.4, 2.6, 0.1, { color: '#4a2c1a' });
  // NW tower (1959): plain square tower with louvred belfry and parapet
  const tx = -NW / 2 - 3.2, tz = NL / 2 - 4;
  f.box(M.ashlar, tx, 9, tz, 6, 22, 6, { tile: 2, color: '#d2c8b2' });
  for (const [dx, dz, ryy] of [[0, 3.02, 0], [0, -3.02, 0], [3.02, 0, Math.PI / 2], [-3.02, 0, Math.PI / 2]]) {
    f.box(M.louvre, tx + dx, 16.5, tz + dz, 1.4, 3.2, 0.1, { ry: ryy, color: '#3a3a3a' });
  }
  f.box(M.ashlar, tx, 20.2, tz, 6.5, 0.6, 6.5, { tile: 2, color: dress });
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) f.box(M.ashlar, tx + dx, 21.2, tz + dz, 0.7, 1.6, 0.7, { tile: 2, color: dress, detail: true });
  // crosses on gables
  f.box(M.ashlar, 0, NH + 7.1, NL / 2, 0.2, 1.2, 0.2, { color: dress }); f.box(M.ashlar, 0, NH + 7.2, NL / 2, 0.8, 0.2, 0.2, { color: dress });
  // churchyard wall
  for (const [x0, z0, x1, z1] of [[-16, 22, 16, 22], [16, 22, 16, -24], [-16, 22, -16, -24]]) {
    const L = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    f.box(M.ashlar, mx, 0.6, mz, x0 === x1 ? 0.5 : L, 1.2, x0 === x1 ? L : 0.5, { tile: 1.5, color: '#b7ad98', detail: true });
  }
  // colliders
  world.addOBB(cx, cz, NW / 2 + 4.6, NL / 2 + 8, ry, f.y0 - 2, f.y0 + 16, 'church');
  const [twx, twz] = f.world(tx, tz); world.addOBB(twx, twz, 3, 3, ry, f.y0 - 2, f.y0 + 22, 'church');
  // notice board
  const [nx, nz] = f.world(8, 24);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }));
  board.position.set(nx, G(nx, nz) + 1.4, nz); board.rotation.y = ry; scene.add(board);
  return { interact: { x: nx, z: nz, radius: 2.5 } };
}

// ---------------------------------------------------------------- hospital
export function buildHospital(batch, M, world, poly, net, scene, signTex) {
  const R = rng(5);
  // big blocks, oriented to Herries Road, of varied height and cladding
  const blocks = [
    [-255, -70, 70, 28, 18], [-340, -150, 55, 34, 24], [-450, -95, 80, 30, 15], [-240, -220, 40, 60, 21],
    [-360, -290, 90, 30, 18], [-520, -210, 60, 40, 12], [-600, -330, 70, 36, 27], [-230, -360, 60, 30, 15], [-470, -380, 50, 28, 9],
  ];
  const ry = -0.36; // parallel to Herries Road
  for (const [x, z, w, d, h] of blocks) {
    if (!inPoly(poly, x, z)) continue;
    const f = new Frame(batch, x, z, ry, G(x, z) - 0.5);
    const clad = R() < 0.5 ? M.cladding : M.brick;
    const col = clad === M.cladding ? ['#d8d6cf', '#c6cdd2', '#e3dccb'][(R() * 3) | 0] : '#e9cbbb';
    f.box(clad, 0, (h - 2) / 2, 0, w, h + 2, d, { tile: clad === M.brick ? 1.3 : 3, color: col });
    // ribbon windows on every floor, all four sides
    for (let y = 2.2; y < h - 1; y += 3.4) {
      f.box(M.officeGlass, 0, y, d / 2 + 0.03, w - 2, 1.5, 0.08, { color: '#ffffff' });
      f.box(M.officeGlass, 0, y, -d / 2 - 0.03, w - 2, 1.5, 0.08, { color: '#ffffff' });
      f.box(M.officeGlass, w / 2 + 0.03, y, 0, 0.08, 1.5, d - 2, { color: '#ffffff' });
      f.box(M.officeGlass, -w / 2 - 0.03, y, 0, 0.08, 1.5, d - 2, { color: '#ffffff' });
    }
    f.box(M.darkMetal, 0, h + 0.3, 0, w + 0.2, 0.6, d + 0.2, { color: '#4a4f55' });                  // parapet
    f.box(M.metal, w * 0.2, h + 1.4, 0, w * 0.3, 2.2, d * 0.4, { color: '#9da3a8', detail: true });  // roof plant
    world.addOBB(x, z, w / 2, d / 2, ry, f.y0 - 2, f.y0 + h, 'building');
  }
  // tall boiler-house chimney — a landmark you can see from all over
  const chx = -560, chz = -400;
  const cf = new Frame(batch, chx, chz, 0, G(chx, chz) - 0.5);
  cf.geo(M.brick, boxUV(new THREE.CylinderGeometry(1.6, 2.6, 62, 16), 1.3), 0, 31, 0, { color: '#c49a86' });
  cf.geo(M.darkMetal, new THREE.CylinderGeometry(1.8, 1.8, 1.2, 16), 0, 62, 0, { color: '#2b2b2b' });
  world.addBox(chx - 2.6, chx + 2.6, cf.y0 - 2, cf.y0 + 62, chz - 2.6, chz + 2.6, 'building');
  // surface car parks with bay lines
  for (const [x, z, w, d] of [[-205, -140, 60, 70], [-420, -20, 60, 40], [-300, -370, 40, 40]]) {
    if (!inPoly(poly, x, z)) continue;
    const f = new Frame(batch, x, z, ry, G(x, z) + 0.03);
    f.box(M.roadFlat, 0, 0, 0, w, 0.06, d, { tile: 4, color: '#9a9a9a' });
    for (let bx = -w / 2 + 2.5; bx < w / 2; bx += 2.6) for (const bz of [-d / 4, d / 4]) f.box(M.line, bx, 0.05, bz, 0.1, 0.02, 5, { color: '#f1f0e8' });
  }
  // boundary: low stone wall + railings along the poly edges next to roads
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    for (let s = 0; s < L; s += 4) {
      const x = x0 + (x1 - x0) * (s + 2) / L, z = z0 + (z1 - z0) * (s + 2) / L;
      if (net.onCarriageway(x, z, null, 3)) continue;
      const g = G(x, z);
      batch.box(M.ashlar, x, g + 0.35, z, 0.4, 0.7, 4.02, { tile: 1.5, color: '#b9b09c', ry: a, detail: true });
      batch.box(M.darkMetal, x, g + 1.2, z, 0.05, 1.0, 4.02, { color: '#1e2a22', ry: a, detail: true });
      world.addOBB(x, z, 0.25, 2, a, g - 1, g + 1.7, 'wall');
    }
  }
  // entrance sign on Herries Road
  const [sx, sz] = [-300, 12];
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.6), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4 }));
  sign.position.set(sx, G(sx, sz) + 1.6, sz); sign.rotation.y = Math.PI + 0.36; scene.add(sign);
  batch.box(M.metal, sx - 1.8, G(sx, sz) + 0.8, sz, 0.1, 1.6, 0.1, { color: '#666' }); batch.box(M.metal, sx + 1.8, G(sx, sz) + 0.8, sz, 0.1, 1.6, 0.1, { color: '#666' });
  // grounds: trees
  const trees = [];
  for (let k = 0; k < 70; k++) {
    const x = -160 - R() * 540, z = -420 + R() * 470;
    if (!inPoly(poly, x, z)) continue;
    if (blocks.some(([bx, bz, w, d]) => Math.hypot(x - bx, z - bz) < Math.max(w, d) * 0.62)) continue;
    trees.push([x, z, 0.8 + R() * 0.6]);
  }
  return { trees };
}

// ------------------------------------------------------------------ school
export function buildSchool(batch, M, world, poly, net) {
  const R = rng(9);
  // two-storey teaching blocks with coloured cladding panels near Owler Lane
  const blocks = [[140, 262, 70, 16, 8.5, '#d6d3cb'], [245, 270, 40, 22, 7, '#c9ced6'], [110, 300, 30, 20, 5, '#e2d7c2']];
  for (const [x, z, w, d, h, col] of blocks) {
    const f = new Frame(batch, x, z, -0.12, G(x, z) - 0.4);
    f.box(M.cladding, 0, (h - 2) / 2, 0, w, h + 2, d, { tile: 3, color: col });
    for (let y = 1.8; y < h - 1; y += 3.3) {
      f.box(M.officeGlass, 0, y, -d / 2 - 0.03, w - 3, 1.6, 0.08, { color: '#fff' });
      f.box(M.officeGlass, 0, y, d / 2 + 0.03, w - 3, 1.6, 0.08, { color: '#fff' });
    }
    for (let i = 0; i < w / 6; i++) f.box(M.panel, -w / 2 + 3 + i * 6, h * 0.55, -d / 2 - 0.05, 1.2, h * 0.7, 0.06, { color: ['#1e88e5', '#43a047', '#fdd835', '#e53935'][i % 4], detail: true });
    f.box(M.darkMetal, 0, h + 0.2, 0, w + 0.2, 0.4, d + 0.2, { color: '#555' });
    world.addOBB(x, z, w / 2, d / 2, -0.12, f.y0 - 2, f.y0 + h, 'building');
  }
  // playing field with white markings
  const fx = 215, fz = 330;
  batch.box(M.grass, fx, G(fx, fz) + 0.02, fz, 110, 0.04, 44, { tile: 4, color: '#9ccf7a', ry: -0.12 });
  for (const [dx, w, d] of [[0, 90, 0.12], [0, 0.12, 36]]) batch.box(M.line, fx + dx, G(fx, fz) + 0.05, fz, w, 0.02, d, { color: '#f4f4f4', ry: -0.12 });
  // green weld-mesh fence round the site
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    for (let s = 0; s < L; s += 3) {
      const x = x0 + (x1 - x0) * (s + 1.5) / L, z = z0 + (z1 - z0) * (s + 1.5) / L;
      if (net.onCarriageway(x, z, null, 2.5)) continue;
      const g = G(x, z);
      batch.box(M.fence, x, g + 1.2, z, 0.04, 2.4, 3.02, { color: '#2f5d3a', ry: a });
      batch.box(M.darkMetal, x, g + 1.2, z + 0, 0.08, 2.5, 0.08, { color: '#1f3a26', ry: a, detail: true });
      world.addOBB(x, z, 0.1, 1.5, a, g - 1, g + 2.4, 'barrier');
    }
  }
}
