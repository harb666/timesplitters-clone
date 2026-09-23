// "Falcon R" — an original fictional hot hatch. Chunky two-box shape, wide
// arches, quad exhaust, roof spoiler, hexagon wing badge. No real brand.
import * as THREE from 'three';
import { falconBadgeTexture, plateTexture, blobShadowTexture, glowTexture } from '../textures/procedural.js';

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  shared = {
    badge: new THREE.MeshBasicMaterial({ map: falconBadgeTexture(), transparent: true }),
    glass: new THREE.MeshLambertMaterial({ color: 0x1a232b }),
    black: new THREE.MeshLambertMaterial({ color: 0x151515 }),
    tyre: new THREE.MeshLambertMaterial({ color: 0x1b1b1b }),
    rim: new THREE.MeshLambertMaterial({ color: 0xb9c0c7 }),
    chrome: new THREE.MeshLambertMaterial({ color: 0xcfd5da }),
    headlight: new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
    drl: new THREE.MeshBasicMaterial({ color: 0xdff2ff }),
    tail: new THREE.MeshBasicMaterial({ color: 0x5a0a0a }),
    shadow: new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    glow: glowTexture(),
    wheelGeo: new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12).rotateZ(Math.PI / 2),
    rimGeo: new THREE.CylinderGeometry(0.22, 0.22, 0.28, 6).rotateZ(Math.PI / 2),
  };
  return shared;
}

const PAINTS = [0x1d5fd1, 0xe8e8e8, 0x16171a, 0xd12f24, 0x9aa3ab, 0x2f8f5b, 0xf1b700];

export function buildFalconR({ paint, plate = 'FV24 ZAP' } = {}) {
  const S = sharedAssets();
  const car = new THREE.Group();       // follows the road
  const body = new THREE.Group();      // bounces on the suspension
  car.add(body);
  const col = paint ?? PAINTS[(Math.random() * PAINTS.length) | 0];
  const paintMat = new THREE.MeshLambertMaterial({ color: col });
  const box = (w, h, d, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  };
  // Car faces +Z. Length ~4.2m, width 1.8m.
  box(1.82, 0.62, 4.2, paintMat, 0, 0.62, 0);                 // lower body
  box(1.6, 0.52, 2.1, paintMat, 0, 1.18, -0.35);              // cabin
  box(1.5, 0.44, 0.05, S.glass, 0, 1.2, 0.72).rotation.x = -0.5; // windscreen
  box(1.5, 0.38, 0.05, S.glass, 0, 1.2, -1.42).rotation.x = 0.35; // rear screen
  box(0.05, 0.36, 1.9, S.glass, 0.81, 1.2, -0.35);             // side windows
  box(0.05, 0.36, 1.9, S.glass, -0.81, 1.2, -0.35);
  box(1.7, 0.08, 0.35, S.black, 0, 1.47, -1.45);               // roof spoiler
  box(1.9, 0.16, 0.5, S.black, 0, 0.35, 2.02);                 // front splitter / bumper
  box(1.9, 0.2, 0.4, S.black, 0, 0.38, -2.0);                  // rear diffuser
  box(1.3, 0.2, 0.06, S.black, 0, 0.72, 2.11);                 // grille
  box(1.3, 0.03, 0.065, new THREE.MeshBasicMaterial({ color: 0xe23b2e }), 0, 0.8, 2.12); // red grille stripe
  // wheel arches (slightly wider = aggressive stance)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.14, 0.2, 1.0, S.black, sx * 0.93, 0.78, sz * 1.3);
  // quad exhaust
  for (const x of [-0.62, -0.42, 0.42, 0.62]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8).rotateX(Math.PI / 2), S.chrome);
    t.position.set(x, 0.32, -2.2); body.add(t);
  }
  // lights
  const headL = box(0.42, 0.14, 0.05, S.headlight, -0.62, 0.8, 2.11);
  const headR = box(0.42, 0.14, 0.05, S.headlight, 0.62, 0.8, 2.11);
  box(0.42, 0.03, 0.06, S.drl, -0.62, 0.72, 2.12); box(0.42, 0.03, 0.06, S.drl, 0.62, 0.72, 2.12);
  const tailMat = S.tail.clone();
  box(0.45, 0.14, 0.05, tailMat, -0.62, 0.86, -2.11);
  box(0.45, 0.14, 0.05, tailMat, 0.62, 0.86, -2.11);
  box(1.6, 0.04, 0.05, tailMat, 0, 1.08, -1.66);               // high brake light
  // badges front & back
  const badgeF = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), S.badge); badgeF.position.set(0, 0.72, 2.145); body.add(badgeF);
  const badgeR = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), S.badge); badgeR.position.set(0, 0.92, -2.115); badgeR.rotation.y = Math.PI; body.add(badgeR);
  // plates
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshBasicMaterial({ map: plateTexture(plate) })); pf.position.set(0, 0.45, 2.28); body.add(pf);
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshBasicMaterial({ map: plateTexture(plate, true) })); pr.position.set(0, 0.6, -2.115); pr.rotation.y = Math.PI; body.add(pr);
  // glow sprites (headlights always on; brake glow toggled)
  const glowMat = new THREE.SpriteMaterial({ map: S.glow, color: 0xfff1c8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  for (const x of [-0.62, 0.62]) { const s = new THREE.Sprite(glowMat); s.scale.set(0.9, 0.6, 1); s.position.set(x, 0.8, 2.2); body.add(s); }
  const brakeGlowMat = new THREE.SpriteMaterial({ map: S.glow, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  for (const x of [-0.62, 0.62]) { const s = new THREE.Sprite(brakeGlowMat); s.scale.set(0.9, 0.6, 1); s.position.set(x, 0.86, -2.25); body.add(s); }
  // flame sprite for exhaust pops
  const flameMat = new THREE.SpriteMaterial({ map: S.glow, color: 0xff9030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const flames = [-0.52, 0.52].map((x) => { const s = new THREE.Sprite(flameMat); s.scale.set(0.5, 0.5, 1); s.position.set(x, 0.32, -2.45); body.add(s); return s; });

  // wheels (on the car group, not the body, so the body can bounce)
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(S.wheelGeo, S.tyre));
    const r = new THREE.Mesh(S.rimGeo, S.rim); w.add(r);
    w.position.set(sx * 0.82, 0.34, sz * 1.3);
    car.add(w); wheels.push(w);
  }
  // blob shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.0), S.shadow);
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04; car.add(sh);

  body.position.y = 0;
  return { car, body, wheels, tailMat, brakeGlowMat, flameMat, flames, headL, headR, paintMat };
}
