// Zim's house (Invader Zim) on the empty corner plot where Wade Street bends.
// It joins onto the side of the real semis there like the next house along:
// front in line with theirs, its pipes plugged into their side wall (the road
// runs down the other side, so the pipes on that side are left off). The
// ground falls ~2 m across the plot, so the garden is a level raised terrace
// with gritstone retaining walls, like Sheffield's hillside gardens, with a
// step up from the pavement.
//
// Walk up to the front door and you go in: the interior (living room,
// kitchen with the toilet, bathroom, hallway) is shown and made solid, and the
// outside of the house is hidden, because, like in the cartoon, it's bigger
// on the inside. Walk back out of the front door and you're on the street.
//
// Models: "Invader Zim House Exterior" and "Zim House Interior" by armasyll
// (CC BY 4.0), both built to the same coordinates (the front door matches).
import * as THREE from 'three';
import { GLTFLoader } from '../../lib/addons/loaders/GLTFLoader.js';
import { groundHeight as G } from '../../core/world.js';
import EXT_GLB from '../../models/zim-exterior.glb.js';
import INT_GLB from '../../models/zim-interior.glb.js';

const S = 1.1;                                   // model units are a touch small (front door 1.7 m)
// the semis' front corner on the plot side, and their side wall's direction (back)
const PC = [346.3, -85.8], BK = [0.865, 0.501];
const F = [-BK[0], -BK[1]];                      // Zim's front faces the same way as theirs
const L = [-BK[1], BK[0]];                       // model +x (away from the semis)
const O = [PC[0] + L[0] * 5.5 * S, PC[1] + L[1] * 5.5 * S];   // model origin: their side wall is at model x = -5.5
const YAW = Math.atan2(F[0], F[1]);
// the level garden (model units): up against the semis, back to the rear
// fence, and short of the pavement on the road side and at the front
const PL = { x0: -5.45, x1: 3.8, z0: -11, z1: 2.9 };

const toWorld = (mx, mz) => [O[0] + (L[0] * mx + F[0] * mz) * S, O[1] + (L[1] * mx + F[1] * mz) * S];

function parse(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
}

// bake every mesh into model space (no node transforms) and give it its node's name
function flatten(gltf) {
  const sc = gltf.scene; sc.updateMatrixWorld(true);
  const out = [];
  sc.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); out.push({ name: o.parent.name, geo: g, mat: o.material }); } });
  return out;
}

// drop triangles whose centre fails `keep(cx, cy, cz)`
function clip(geo, keep) {
  const p = geo.attributes.position, I = geo.index ? geo.index.array : [...Array(p.count).keys()], out = [];
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i], b = I[i + 1], c = I[i + 2];
    if (keep((p.getX(a) + p.getX(b) + p.getX(c)) / 3, (p.getY(a) + p.getY(b) + p.getY(c)) / 3, (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3)) out.push(a, b, c);
  }
  geo.setIndex(out); return geo;
}

export class ZimHouse {
  constructor(game) {
    this.game = game; this.inside = false; this.cool = 0; this.ready = false;
    this.load = Promise.all([parse(EXT_GLB), parse(INT_GLB)]).then(([ext, int]) => { this.build(ext, int); this.ready = true; })
      .catch((e) => { console.warn('Zim house failed to load', e); });
  }

  build(ext, int) {
    const { scene, world } = this.game;
    // --- level: the garden sits on the highest ground under it
    let top = -Infinity, low = Infinity;
    for (let mx = PL.x0; mx <= PL.x1 + 1e-6; mx += 0.5) for (let mz = PL.z0; mz <= PL.z1 + 1e-6; mz += 0.5) { const [x, z] = toWorld(mx, mz), h = G(x, z); top = Math.max(top, h); low = Math.min(low, h); }
    this.lawn = top + 0.04;                          // lawn surface (world y)
    this.floor = this.lawn + 0.3 * S;                // house floor (model y = 0)
    const place = (o) => { o.position.set(O[0], this.floor, O[1]); o.rotation.y = YAW; o.scale.setScalar(S); return o; };

    // --- outside
    this.ext = place(new THREE.Group()); this.ext.name = 'ZimHouse';
    this.shell = [];                                 // the parts hidden while you're inside
    for (const { name, geo, mat } of flatten(ext)) {
      if (/^(buildingLeft|buildingRight|sidewalk|houseLawn|pathway)/.test(name)) continue;   // stand-in neighbours, street, lawn: the real ones are used
      if (/^houseConnectingPipes/.test(name)) clip(geo, (x) => x < 2.35);                     // only into the semis; the road is on the other side
      if (/^fence/.test(name)) clip(geo, (x, y, z) => x < PL.x1 - 0.1 && z < PL.z1 - 0.1 && z > PL.z0 + 0.1);
      if (/^gardenGnome/.test(name)) { geo.computeBoundingBox(); const b = geo.boundingBox; if (b.max.z > 3) geo.translate(Math.sign(b.min.x + b.max.x) * 2.1, 0, -2.7); }
      mat.side = THREE.DoubleSide;
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.name = name;
      this.ext.add(m);
      if (/^(houseOuter|windowFrames|windowPanes|roof|doorFrame|doorFront|houseAntenna)/.test(name)) this.shell.push(m);
    }
    scene.add(this.ext);

    // raised garden: grass on top, gritstone retaining walls down into the ground
    const depth = this.lawn - (low - 0.6), w = (PL.x1 - PL.x0) * S, d = (PL.z1 - PL.z0) * S;
    const stone = new THREE.MeshStandardMaterial({ color: '#8b8272', roughness: 0.95 });
    const grass = new THREE.MeshStandardMaterial({ color: '#5d6b2c', roughness: 1 });
    const conc = new THREE.MeshStandardMaterial({ color: '#a39485', roughness: 0.9 });
    const [pcx, pcz] = toWorld((PL.x0 + PL.x1) / 2, (PL.z0 + PL.z1) / 2);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w, depth, d), [stone, stone, grass, stone, stone, stone]);
    plinth.position.set(pcx, this.lawn - depth / 2, pcz); plinth.rotation.y = YAW; plinth.receiveShadow = true; plinth.castShadow = true;
    scene.add(plinth);
    world.addOBB(pcx, pcz, w / 2, d / 2, YAW, this.lawn - depth - 1, this.lawn, 'wall');
    // front path from the door to the pavement, and steps down to it
    const [qx, qz] = toWorld(0, (0.2 + PL.z1) / 2), path = new THREE.Mesh(new THREE.BoxGeometry(1.1 * S, 0.06, (PL.z1 - 0.2) * S), conc);
    path.position.set(qx, this.lawn + 0.02, qz); path.rotation.y = YAW; path.receiveShadow = true; scene.add(path);
    const [fx, fz] = toWorld(0, PL.z1 + 0.6), street = G(fx, fz) + 0.15, rise = this.lawn - street;
    const n = Math.max(0, Math.ceil(rise / 0.22) - 1), stepH = rise / (n + 1);
    for (let k = 1; k <= n; k++) {
      const [sx, sz] = toWorld(0, PL.z1 + 0.14 + (k - 1) * 0.28), h = this.lawn - k * stepH - (street - 1);
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.3 * S, h, 0.28 * S), conc);
      st.position.set(sx, this.lawn - k * stepH - h / 2, sz); st.rotation.y = YAW; st.castShadow = st.receiveShadow = true; scene.add(st);
      world.addOBB(sx, sz, 0.65 * S, 0.14 * S, YAW, street - 1, this.lawn - k * stepH, 'wall');
    }
    this.steps = n;
    // Pavement/road-side loop used by the Harbinger NPC. Keep it here so the
    // patrol stays aligned if the house is moved or rotated later.
    this.harbingerPatrol = [[-3.2, 4.35], [0.2, 4.45], [4.8, 3.9], [5.25, -2.4], [5.1, -8.2], [4.9, -2.6]]
      .map(([mx, mz], i) => { const [x, z] = toWorld(mx, mz); return { x, z, y: G(x, z), run: i === 3 || i === 4, yaw: YAW }; });
    // fence along the semis' side and across the back (the part of the model's fence that's kept)
    for (const [a, b] of [[[-5.4, PL.z0 + 0.2], [-5.4, PL.z1 - 0.2]], [[-5.4, -10.8], [PL.x1 - 0.2, -10.8]]]) {
      const [ax, az] = toWorld(...a), [bx, bz] = toWorld(...b), len = Math.hypot(bx - ax, bz - az);
      world.addOBB((ax + bx) / 2, (az + bz) / 2, len / 2, 0.08, Math.atan2(-(bz - az), bx - ax), this.lawn - 1, this.lawn + 1.1, 'fence');
    }
    // the house itself (solid while you're outside)
    const [hx, hz] = toWorld(0, -2.15);
    this.shellBox = world.addOBB(hx, hz, 2.3 * S, 2.15 * S, YAW, this.lawn - 1, this.floor + 10, 'building');

    // --- inside
    this.int = place(new THREE.Group()); this.int.name = 'ZimHouseInterior'; this.int.visible = false;
    const skipSolid = /^(floorTiles|floorBaseboard|transitionStrip|.*Ceiling|windowPanes|kitchenWindowPanes|.*PictureFrame|.*Plate|Text|lotion|toothbrush|bathroomRug|signKitchen|livingroomSphereLight|bathroomCeilingPipes|kitchenPipes)/i;
    const tmp = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), nrm = new THREE.Vector3();
    this.intBoxes = []; const seen = new Set();
    this.int.updateMatrixWorld(true);
    for (const { name, geo, mat } of flatten(int)) {
      mat.side = THREE.DoubleSide;
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = name; this.int.add(m);
      if (skipSolid.test(name)) continue;
      // walls and furniture: every upright triangle becomes a thin solid slab
      m.updateMatrixWorld(true);
      const p = geo.attributes.position, I = geo.index ? geo.index.array : [...Array(p.count).keys()];
      for (let i = 0; i < I.length; i += 3) {
        A.fromBufferAttribute(p, I[i]); B.fromBufferAttribute(p, I[i + 1]); C.fromBufferAttribute(p, I[i + 2]);
        const y0 = Math.min(A.y, B.y, C.y), y1 = Math.max(A.y, B.y, C.y);
        if (y0 > 1.2 || y1 < 0.15) continue;                       // door headers / high shelves / floor bits
        nrm.subVectors(B, A).cross(tmp.subVectors(C, A)); const ar = nrm.length(); if (ar < 0.01) continue;
        if (Math.abs(nrm.y / ar) > 0.5) continue;                  // not upright
        const pts = [A, B, C].map((v) => v.clone().applyMatrix4(m.matrixWorld));
        let bi = 0, bj = 1, bd = -1;
        for (const [i2, j2] of [[0, 1], [1, 2], [0, 2]]) { const dd = Math.hypot(pts[i2].x - pts[j2].x, pts[i2].z - pts[j2].z); if (dd > bd) { bd = dd; bi = i2; bj = j2; } }
        if (bd < 0.08) continue;
        const P = pts[bi], Q = pts[bj], cx = (P.x + Q.x) / 2, cz = (P.z + Q.z) / 2, ry = Math.atan2(-(Q.z - P.z), Q.x - P.x);
        const wy0 = Math.min(...pts.map((v) => v.y)), wy1 = Math.max(...pts.map((v) => v.y));
        const key = `${cx.toFixed(1)},${cz.toFixed(1)},${ry.toFixed(1)},${bd.toFixed(1)}`; if (seen.has(key)) continue; seen.add(key);
        const b = world.addOBB(cx, cz, bd / 2, 0.06, ry, wy0, wy1, 'wall'); b.off = true; this.intBoxes.push(b);
      }
    }
    // the floor inside is 0.33 m above the garden
    const [ix, iz] = toWorld((-2.9 + 4.35) / 2, (-9.4 + 0.3) / 2);
    const fb = world.addOBB(ix, iz, (7.25 / 2) * S, (9.7 / 2) * S, YAW, this.lawn - 1, this.floor, 'wall'); fb.off = true; this.intBoxes.push(fb);
    scene.add(this.int);
  }

  set(inside) {
    this.inside = inside; this.cool = 0.8;
    this.int.visible = inside;
    for (const m of this.shell) m.visible = !inside;
    this.shellBox.off = inside;
    for (const b of this.intBoxes) b.off = !inside;
  }

  // walk through the front door either way
  update(dt) {
    if (!this.ready) return;
    const p = this.game.player; this.cool -= dt;
    if (this.cool > 0 || p.dead) return;
    const feet = p.pos.y - p.eye;
    const near = (mx, mz, r) => { const [x, z] = toWorld(mx, mz); return Math.hypot(p.pos.x - x, p.pos.z - z) < r && Math.abs(feet - this.floor) < 1.2; };
    if (!this.inside && near(0, 0.45, 0.75)) {
      this.set(true); this.teleport(0, -1.2, this.floor, YAW);
      this.game.hud.toast("ZIM'S HOUSE", 1.6);
    } else if (this.inside && near(0, -0.4, 0.55)) {
      this.set(false); this.teleport(0, 1.5, this.lawn, YAW + Math.PI);
    } else if (this.inside) {
      // fell or wandered out some other way: back to normal
      const [cx, cz] = toWorld(0.7, -4.5);
      if (Math.hypot(p.pos.x - cx, p.pos.z - cz) > 9) this.set(false);
    }
  }
  teleport(mx, mz, y, yaw) {
    const p = this.game.player, [x, z] = toWorld(mx, mz);
    p.pos.set(x, y + p.eye, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = 0;
  }
}
