// Low-poly character models. Chunky proportions, big heads and bright
// colours for readability on a small phone screen. All original designs.
import * as THREE from 'three';
import { blobShadowTexture } from '../textures/procedural.js';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

// DEZ "FULL TILT" HARTLEY — a hyper-competitive wheelchair racer.
// Sporty racing chair with cambered wheels, orange-and-teal race jersey,
// sweatband, and far too much confidence.
export function buildDez() {
  const root = new THREE.Group();     // sits on the ground
  const tilt = new THREE.Group();     // pivots on the rear axle (for wheelies)
  root.add(tilt);
  tilt.position.set(0, 0.33, -0.1);   // rear axle height

  const frameM = lam(0x2b2f36), seatM = lam(0x1a1a1a), rimM = lam(0xe6e9ec), tyreM = lam(0x151515);
  const jersey = lam(0xff7a1a), jersey2 = lam(0x16b3a6), skin = lam(0x8d5a3b), hair = lam(0x1b1410);
  const legsM = lam(0x2a3552), shoeM = lam(0xf2f2f2), bandM = lam(0xffffff);
  const part = (geo, mat, x, y, z, parent = tilt) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // chair frame (coordinates relative to the rear axle)
  part(B(0.46, 0.06, 0.5), seatM, 0, 0.15, 0.05);                  // seat
  part(B(0.46, 0.4, 0.06), seatM, 0, 0.38, -0.2);                  // low backrest
  part(B(0.05, 0.05, 0.95), frameM, 0.22, 0.05, 0.3);              // side rails
  part(B(0.05, 0.05, 0.95), frameM, -0.22, 0.05, 0.3);
  part(B(0.4, 0.04, 0.12), frameM, 0, -0.08, 0.72);                // footplate
  // big cambered rear wheels
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.04, 16).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(0.3, 0.018, 4, 16).rotateY(Math.PI / 2);
  const spokeGeo = B(0.02, 0.56, 0.03);
  const wheels = [];
  for (const sx of [-1, 1]) {
    const camber = new THREE.Group(); camber.position.set(sx * 0.33, 0, 0); camber.rotation.z = sx * 0.2; // camber!
    const w = new THREE.Group(); camber.add(w); // inner group spins
    w.add(new THREE.Mesh(wheelGeo, tyreM));
    w.add(new THREE.Mesh(rimGeo, rimM));
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(spokeGeo, jersey2); s.rotation.x = i * Math.PI / 3; w.add(s); }
    tilt.add(camber); wheels.push(w);
  }
  // front caster wheel (stays on the ground; hidden when popping a wheelie)
  const caster = part(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8).rotateZ(Math.PI / 2), tyreM, 0, -0.26, 0.78);
  wheels.push(caster);

  // rider
  const body = new THREE.Group(); tilt.add(body); body.position.set(0, 0.18, 0.02);
  part(B(0.44, 0.52, 0.28), jersey, 0, 0.3, 0, body);                        // torso
  part(B(0.46, 0.1, 0.3), jersey2, 0, 0.42, 0, body);                        // chest stripe
  const head = new THREE.Group(); body.add(head); head.position.set(0, 0.78, 0.02);
  part(B(0.3, 0.34, 0.3), skin, 0, 0, 0, head);                              // big head
  part(B(0.32, 0.12, 0.32), hair, 0, 0.16, -0.01, head);                      // flat-top hair
  part(B(0.33, 0.06, 0.33), bandM, 0, 0.12, 0, head);                         // sweatband
  part(B(0.06, 0.06, 0.02), lam(0x111111), -0.07, 0.01, 0.16, head);          // eyes
  part(B(0.06, 0.06, 0.02), lam(0x111111), 0.07, 0.01, 0.16, head);
  const brows = part(B(0.22, 0.03, 0.02), hair, 0, 0.065, 0.161, head);        // one heroic eyebrow
  const mouth = part(B(0.12, 0.03, 0.02), lam(0x5a2020), 0, -0.09, 0.16, head);
  // thighs + shins (seated)
  part(B(0.36, 0.14, 0.42), legsM, 0, 0.05, 0.25, body);
  part(B(0.32, 0.4, 0.14), legsM, 0, -0.16, 0.48, body);
  part(B(0.34, 0.1, 0.2), shoeM, 0, -0.36, 0.55, body);
  // arms (animated pushing the rims)
  const arms = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(sx * 0.27, 0.5, 0); body.add(shoulder);
    part(B(0.12, 0.42, 0.12), jersey, 0, -0.2, 0, shoulder);
    part(B(0.1, 0.1, 0.12), skin, 0, -0.44, 0.02, shoulder);
    arms.push(shoulder);
  }

  // blob shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.03, 0.25); root.add(sh);

  return { root, tilt, body, head, arms, wheels, caster, brows, mouth };
}
