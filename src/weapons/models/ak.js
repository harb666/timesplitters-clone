// "VK-9 KESTREL" — an original AK-pattern rifle model. Proportions follow
// the general layout of stamped-receiver rifles of this family (dust cover,
// long-stroke gas tube, slant muzzle device, curved magazine), modelled
// from scratch. Units: metres. Bore axis on y=0, forward = -Z, right = +X.
// f = distance forward from the rear of the receiver.
import * as THREE from 'three';
import { sideProfile, section, lathe, rod, pin, tube, place, PartBuilder, roundedBox, boxUV } from '../../models/shapes.js';

const arc = (cx, cy, r, a0, a1, n = 16) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };

export function buildAK(M) {
  const root = new THREE.Group(); root.name = 'ak';
  const B = new PartBuilder();

  // ---------- receiver ----------
  B.add(M.steel, section([[-0.0212, 0.006], [-0.0212, -0.041], [-0.0185, -0.0465], [0.0185, -0.0465], [0.0212, -0.041], [0.0212, 0.006]], -0.005, 0.287, { bevel: 0.0008 }));
  // rear trunnion / receiver end cap
  B.add(M.darkSteel, section([[-0.02, 0.004], [-0.02, -0.044], [0.02, -0.044], [0.02, 0.004]], -0.03, -0.004, { bevel: 0.0015 }));
  // stamped reinforcement dimples above magwell (both sides)
  for (const sx of [-1, 1]) {
    B.add(M.steel, place(roundedBox(0.003, 0.012, 0.03, 0.0014, 2), sx * 0.021, -0.022, -0.16));
    // rivets: trunnion pattern + rear
    for (const [f, y] of [[0.262, -0.01], [0.272, -0.028], [0.252, -0.036], [0.19, -0.04], [0.12, -0.04], [0.02, -0.034], [0.01, -0.012]]) {
      const g = new THREE.SphereGeometry(0.0022, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateZ(-sx * Math.PI / 2);
      B.add(M.steel, place(boxUV(g, 60), sx * 0.0212, y, -f));
    }
  }
  // ---------- dust cover with ribs ----------
  const coverSec = [...arc(0, 0.006, 0.0218, 0, Math.PI, 20)];
  B.add(M.steel, section(coverSec, 0.004, 0.268, { bevel: 0.0006 }));
  for (const f of [0.08, 0.14, 0.2]) B.add(M.steel, section(arc(0, 0.006, 0.0232, 0, Math.PI, 20), f, f + 0.012, { bevel: 0.0006 }));
  // recoil spring guide button at the rear of the cover
  B.add(M.bright, place(rod(0.0035, -0.012, 0.005, 12), 0, 0.012, 0));
  // ---------- rear sight block + tangent leaf ----------
  B.add(M.steel, section([[-0.015, -0.012], [0.015, -0.012], [0.015, 0.016], [0.011, 0.024], [-0.011, 0.024], [-0.015, 0.016]], 0.285, 0.37, { bevel: 0.0012 }));
  B.add(M.darkSteel, sideProfile([[0.298, 0.024], [0.362, 0.024], [0.362, 0.029], [0.302, 0.031]], 0.016, { bevel: 0.0005 }));
  B.add(M.bright, place(roundedBox(0.02, 0.006, 0.01, 0.001), 0, 0.03, -0.335)); // range slider
  for (const sx of [-1, 1]) B.add(M.darkSteel, place(new THREE.BoxGeometry(0.0055, 0.011, 0.004), sx * 0.0042, 0.0335, -0.3)); // notch ears
  B.add(M.darkSteel, place(new THREE.BoxGeometry(0.0035, 0.004, 0.004), 0, 0.03, -0.3)); // notch bottom
  // ---------- barrel & muzzle device ----------
  B.add(M.blued, rod(0.0095, 0.36, 0.705, 24));
  B.add(M.steel, lathe([[0.0112, 0.7], [0.0122, 0.703], [0.0122, 0.742], [0.0105, 0.748], [0.0045, 0.748], [0.0045, 0.745]], 28));
  B.add(M.bore, place(new THREE.CircleGeometry(0.0045, 16), 0, 0, -0.7482, 0, 0, 0));
  B.add(M.darkSteel, place(new THREE.BoxGeometry(0.014, 0.006, 0.02), -0.004, 0.009, -0.735, 0, 0, 0.5)); // slant cut
  // cleaning rod under barrel
  B.add(M.bright, place(rod(0.003, 0.54, 0.69, 10), 0, -0.018, 0));
  B.add(M.bright, place(lathe([[0.0035, 0], [0.0045, 0.002], [0.0045, 0.008], [0, 0.009]], 12), 0, -0.018, -0.69));
  // ---------- gas block (angled) & front sight tower ----------
  B.add(M.steel, sideProfile([[0.568, -0.013], [0.625, -0.013], [0.613, 0.033], [0.588, 0.033]], 0.026, { bevel: 0.0015, round: 0.003 }));
  B.add(M.steel, sideProfile([[0.66, -0.014], [0.7, -0.014], [0.697, 0.02], [0.692, 0.044], [0.668, 0.044], [0.663, 0.02]], 0.02, { bevel: 0.0012, round: 0.003 }));
  for (const sx of [-1, 1]) B.add(M.darkSteel, sideProfile([[0.67, 0.036], [0.69, 0.036], [0.689, 0.05], [0.671, 0.05]], 0.003, { bevel: 0.0004 }).translate(sx * 0.0085, 0, 0)); // sight hood ears
  B.add(M.darkSteel, place(new THREE.CylinderGeometry(0.0013, 0.0015, 0.014, 8), 0, 0.041, -0.68)); // front post
  B.add(M.darkSteel, place(roundedBox(0.012, 0.012, 0.024, 0.002), 0, -0.022, -0.684)); // bayonet lug
  // ---------- gas tube + handguards ----------
  B.add(M.steel, place(rod(0.0095, 0.37, 0.588, 20), 0, 0.02, 0));
  for (const sx of [-1, 1]) for (const f of [0.545, 0.56, 0.575]) B.add(M.bore, place(pin(0.0016, 0.003, 8), sx * 0.0093, 0.02, -f));
  const upperSec = [...arc(0, 0.02, 0.0148, -0.45, Math.PI + 0.45, 24)];
  B.add(M.wood, section(upperSec, 0.38, 0.54, { bevel: 0.002 }));
  B.add(M.wood, sideProfile([[0.3, 0.008], [0.532, 0.008], [0.54, 0.0], [0.537, -0.026], [0.51, -0.034], [0.48, -0.03], [0.455, -0.036], [0.4, -0.037], [0.36, -0.033], [0.33, -0.036], [0.305, -0.033], [0.298, -0.018]], 0.052, { bevel: 0.007, curveSegments: 16, round: 0.008 }));
  // handguard retainer band + lever
  B.add(M.steel, section([[-0.0265, 0.014], [-0.0265, -0.03], [-0.02, -0.036], [0.02, -0.036], [0.0265, -0.03], [0.0265, 0.014]], 0.285, 0.3, { bevel: 0.0008 }));
  B.add(M.steel, section([[-0.0245, 0.012], [-0.0245, -0.034], [0.0245, -0.034], [0.0245, 0.012]], 0.537, 0.55, { bevel: 0.0008 }));
  B.add(M.darkSteel, place(roundedBox(0.004, 0.018, 0.012, 0.0015), 0.0275, 0.002, -0.292));
  // ---------- pistol grip ----------
  B.add(M.bakelite, sideProfile([[0.022, -0.046], [0.052, -0.046], [0.047, -0.068], [0.036, -0.1], [0.024, -0.132], [0.006, -0.141], [-0.012, -0.137], [-0.013, -0.122], [-0.002, -0.094], [0.008, -0.064]], 0.031, { bevel: 0.006, curveSegments: 16, round: 0.006 }));
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { // vertical grip grooves
    const f = 0.03 - i * 0.0042, y = -0.075 - i * 0.004;
    B.add(M.bakelite, place(roundedBox(0.002, 0.045, 0.0025, 0.0009), sx * 0.0158, y - 0.02, -f + 0.004, -0.35));
  }
  // ---------- trigger guard ----------
  B.add(M.steel, sideProfile([[0.026, -0.0462], [0.124, -0.0462], [0.123, -0.054], [0.118, -0.0685], [0.032, -0.0685], [0.026, -0.058]], 0.009, { bevel: 0.0008, round: 0.003, holes: [[[0.034, -0.0505], [0.114, -0.0505], [0.111, -0.0635], [0.037, -0.0635]]] }));
  // magazine release paddle
  B.add(M.steel, sideProfile([[0.114, -0.046], [0.121, -0.046], [0.121, -0.06], [0.112, -0.064], [0.111, -0.058]], 0.014, { bevel: 0.0008 }));
  // ---------- stock (laminated wood) ----------
  B.add(M.wood, sideProfile([[-0.03, 0.003], [-0.12, -0.004], [-0.39, -0.016], [-0.395, -0.03], [-0.393, -0.128], [-0.388, -0.14], [-0.25, -0.1], [-0.12, -0.07], [-0.05, -0.052], [-0.03, -0.044]], 0.039, { bevel: 0.007, curveSegments: 16, round: 0.01 }));
  B.add(M.darkSteel, sideProfile([[-0.388, -0.012], [-0.4, -0.012], [-0.401, -0.028], [-0.399, -0.132], [-0.393, -0.146], [-0.386, -0.142]], 0.042, { bevel: 0.002 })); // butt plate
  B.add(M.darkSteel, place(pin(0.003, 0.004, 10), -0.021, -0.07, 0.34)); // butt plate screw heads
  B.add(M.steel, sideProfile([[-0.03, 0.005], [-0.11, 0.0], [-0.11, -0.004], [-0.03, -0.001]], 0.022, { bevel: 0.0008 })); // stock tang
  const sling = new THREE.TorusGeometry(0.009, 0.0018, 6, 16); sling.rotateY(Math.PI / 2);
  B.add(M.steel, place(boxUV(sling, 60), -0.02, -0.06, 0.2));
  // screws on the receiver tang
  for (const f of [-0.02, -0.08]) B.add(M.bright, place(pin(0.0026, 0.043, 12), 0, -0.012, -f));

  B.add(M.bore, place(roundedBox(0.0016, 0.017, 0.086, 0.0006), 0.0212, -0.006, -0.19)); // ejection port (dark opening)
  B.build(root);

  // ---------- moving parts ----------
  // Bolt carrier + charging handle (moves back along +Z when cycling)
  const bolt = new THREE.Group(); bolt.name = 'bolt'; root.add(bolt);
  const BB = new PartBuilder();
  BB.add(M.bright, place(roundedBox(0.003, 0.011, 0.07, 0.001), 0.0222, -0.004, -0.19));      // carrier seen through the port
  BB.add(M.steel, place(pin(0.0032, 0.02, 12), 0.03, -0.004, -0.228));                          // charging handle stem
  BB.add(M.steel, place(boxUV(new THREE.SphereGeometry(0.0068, 16, 10).scale(1, 1, 1.25), 60), 0.042, -0.004, -0.23));
  BB.build(bolt);

  // Ejection-port "skin" stays with the receiver — the carrier slides inside it.
  // Selector lever (right side), pivots at its rear
  const selector = new THREE.Group(); selector.name = 'selector'; selector.position.set(0.0228, 0.0, -0.036); root.add(selector);
  const SB = new PartBuilder();
  SB.add(M.steel, sideProfile([[0.0, 0.004], [0.165, 0.004], [0.17, -0.004], [0.14, -0.013], [0.02, -0.013], [-0.005, -0.004]], 0.0028, { bevel: 0.0005 }).translate(0, 0, 0.036));
  SB.add(M.steel, place(pin(0.0055, 0.004, 16), 0.001, -0.003, 0));
  SB.build(selector);

  // Trigger (pivot near top)
  const trigger = new THREE.Group(); trigger.name = 'trigger'; trigger.position.set(0, -0.047, -0.089); root.add(trigger);
  const TB = new PartBuilder();
  TB.add(M.steel, sideProfile([[-0.004, 0.0], [0.004, 0.0], [0.003, -0.008], [-0.004, -0.015], [-0.01, -0.017], [-0.005, -0.008]], 0.0065, { bevel: 0.0008, round: 0.002 }));
  TB.build(trigger);

  // Magazine: pivots at its front lug so it rocks in and out like the real thing.
  const magPivot = new THREE.Group(); magPivot.name = 'magPivot'; magPivot.position.set(0, -0.046, -0.196); root.add(magPivot);
  const mag = buildAKMag(M);
  magPivot.add(mag);

  // ---------- anchors ----------
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); root.add(o); return o; };
  const muzzle = anchor('muzzle', 0, 0, -0.75);
  const ejectPort = anchor('eject', 0.026, -0.004, -0.19);
  const rearSight = anchor('rearSight', 0, 0.0335, -0.3);
  const frontSight = anchor('frontSight', 0, 0.0335, -0.68);

  return { root, bolt, selector, trigger, magPivot, mag, muzzle, ejectPort, rearSight, frontSight };
}

// Curved 30-round magazine in orange-brown bakelite with steel lips.
export function buildAKMag(M) {
  const g = new THREE.Group(); g.name = 'mag';
  const B = new PartBuilder();
  // Coordinates relative to the front lug (the pivot): [forward, up].
  // Top of the mag runs from forward -0.066 to 0; the body curves forward.
  const N = 16, cF = (t) => -0.033 + 0.08 * Math.pow(t, 1.35), half = (t) => 0.033 + 0.004 * t, Y = (t) => -0.004 - 0.19 * t;
  const rear = [], front = [];
  for (let i = 0; i <= N; i++) { const t = i / N; rear.push([cF(t) - half(t), Y(t)]); front.push([cF(t) + half(t) - 0.003, Y(t)]); }
  B.add(M.bakelite, sideProfile([...rear, ...front.reverse()], 0.0275, { bevel: 0.003, curveSegments: 8, round: 0.003 }));
  // reinforcing ribs on both sides, following the curve
  for (const sx of [-1, 1]) for (const off of [-0.013, 0.011]) {
    const path = [];
    for (let i = 1; i < N; i++) { const t = i / N; path.push([sx * 0.0142, Y(t), -(cF(t) + off)]); }
    B.add(M.bakelite, tube(path, 0.0016, { segments: 30, radial: 6 }));
  }
  // steel feed lips, front lug and floor plate
  B.add(M.darkSteel, place(roundedBox(0.028, 0.006, 0.066, 0.0015), 0, -0.001, 0.033));
  B.add(M.darkSteel, place(roundedBox(0.012, 0.007, 0.008, 0.002), 0, 0.002, 0.001));
  B.add(M.darkSteel, place(roundedBox(0.031, 0.007, 0.078, 0.003), 0, Y(1) - 0.002, -cF(1) - 0.004, 0.38));
  B.build(g);
  // top cartridge peeking out of the lips
  const round = new THREE.Group(); g.add(round);
  const RB = new PartBuilder();
  RB.add(M.brass, lathe([[0.0056, 0], [0.0056, 0.028], [0.0052, 0.032], [0.0045, 0.036], [0.0045, 0.039]], 16));
  RB.add(M.copper, lathe([[0.0039, 0.039], [0.0039, 0.047], [0.003, 0.056], [0.0012, 0.062], [0, 0.063]], 16));
  RB.build(round);
  round.position.set(0, 0.004, 0.06);
  return g;
}
