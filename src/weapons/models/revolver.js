// "HALLAM SIX" — an original double-action, six-shot swing-out revolver.
// Layout follows the general mechanics of the type: the bore lines up with
// the TOP chamber, the cylinder axis sits below it, the crane swings the
// cylinder out to the left, an ejector rod runs forward under the barrel
// in a shroud, and the hammer and trigger pivot in the frame.
// Units: metres. Bore on y=0, forward = -Z, right = +X. f = forward.
import * as THREE from 'three';
import { sideProfile, section, lathe, rod, pin, place, PartBuilder, roundedBox, boxUV } from '../../models/shapes.js';

export const CYL_AXIS_Y = -0.0125, CHAMBER_R = 0.0125;
const CYL_R = 0.0195, CYL_F0 = 0.002, CYL_F1 = 0.043;
const CRANE_PIVOT = { x: -0.006, y: -0.034 };

export function buildRevolver(M) {
  const root = new THREE.Group(); root.name = 'revolver';
  const B = new PartBuilder();

  // ---------- frame (with the cylinder window cut through it) ----------
  B.add(M.blued, sideProfile([
    [-0.017, 0.0175, 0.004], [0.052, 0.0175, 0.003], [0.055, 0.011, 0.003], [0.055, -0.024, 0.004], [0.049, -0.035, 0.006], [0.036, -0.04, 0.006],
    [0.004, -0.041, 0.004], [-0.006, -0.038, 0.006], [-0.029, -0.1, 0.008], [-0.05, -0.097, 0.01], [-0.048, -0.07, 0.012], [-0.039, -0.022, 0.012],
    [-0.035, 0.001, 0.006], [-0.026, 0.012, 0.006],
  ], 0.03, { bevel: 0.0022, curveSegments: 12, round: 0.003, holes: [[[0.0005, 0.0092, 0.002], [0.0455, 0.0092, 0.002], [0.0455, -0.034, 0.003], [0.0005, -0.034, 0.003]]] }));
  // recoil shield bulge and hammer slot hint
  B.add(M.blued, place(roundedBox(0.034, 0.042, 0.006, 0.003), 0, CYL_AXIS_Y, 0.003));
  B.add(M.bore, place(new THREE.BoxGeometry(0.009, 0.012, 0.022), 0, 0.014, 0.024));
  // top-strap rear sight: blade with a square notch (sight line y = 0.022)
  for (const sx of [-1, 1]) B.add(M.darkSteel, place(roundedBox(0.0045, 0.0055, 0.01, 0.0008), sx * 0.0038, 0.0205, 0.004));
  B.add(M.darkSteel, place(roundedBox(0.012, 0.0025, 0.014, 0.0008), 0, 0.0185, 0.004));
  // side-plate screws (right) and cylinder release latch (left)
  for (const [f, y] of [[-0.02, -0.03], [0.022, -0.036], [-0.004, 0.006]]) {
    B.add(M.bright, place(pin(0.0025, 0.0014, 14), 0.0157, y, -f));
    B.add(M.bore, place(new THREE.BoxGeometry(0.0006, 0.0045, 0.0007), 0.0165, y, -f, 0.6));
  }
  B.add(M.bright, place(roundedBox(0.004, 0.006, 0.014, 0.0015), -0.0165, -0.004, 0.009));
  for (let i = 0; i < 4; i++) B.add(M.darkSteel, place(new THREE.BoxGeometry(0.0006, 0.0065, 0.001), -0.0187, -0.004, 0.004 + i * 0.003));

  // ---------- barrel: round tube + top rib + full ejector shroud ----------
  B.add(M.blued, lathe([[0.0088, 0.053], [0.0088, 0.156], [0.0082, 0.1595], [0.0042, 0.1595], [0.0042, 0.157]], 32));
  B.add(M.bore, place(new THREE.CircleGeometry(0.0042, 20), 0, 0, -0.1575));
  B.add(M.blued, sideProfile([[0.053, 0.004], [0.158, 0.004], [0.158, 0.0105], [0.053, 0.0105]], 0.0072, { bevel: 0.001 }));
  B.add(M.blued, sideProfile([[0.053, -0.004], [0.158, -0.004], [0.158, -0.017], [0.152, -0.022], [0.062, -0.022], [0.053, -0.02]], 0.0145, { bevel: 0.0022 }));
  // front sight ramp with red insert
  B.add(M.blued, sideProfile([[0.128, 0.0105], [0.155, 0.0105], [0.155, 0.022], [0.149, 0.022]], 0.0036, { bevel: 0.0005 }));
  B.add(M.redInsert, sideProfile([[0.149, 0.016], [0.1535, 0.016], [0.1535, 0.0215], [0.1505, 0.0215]], 0.0038, { bevel: 0 }));
  // forcing-cone ring at the frame front
  B.add(M.bright, lathe([[0.0088, 0.0455], [0.0092, 0.047], [0.0092, 0.053]], 24));

  // ---------- grips (checkered walnut) with medallions ----------
  // (finger-groove combat grips: smooth walnut shell, checkered panels)
  B.add(M.walnut, sideProfile([[-0.004, -0.036, 0.004], [-0.012, -0.062, 0.01], [-0.017, -0.074, 0.006], [-0.021, -0.085, 0.01], [-0.027, -0.103, 0.01], [-0.042, -0.119, 0.012], [-0.058, -0.108, 0.012], [-0.056, -0.07, 0.015], [-0.044, -0.024, 0.01], [-0.032, -0.007, 0.006], [-0.02, -0.02, 0.005]], 0.0345, { bevel: 0.0068, curveSegments: 16, round: 0.004 }));
  B.add(M.checkered, sideProfile([[-0.018, -0.042], [-0.024, -0.072], [-0.032, -0.1], [-0.046, -0.104], [-0.05, -0.07], [-0.041, -0.04]], 0.0356, { bevel: 0.0006, round: 0.004 }));
  for (const sx of [-1, 1]) {
    const med = new THREE.CylinderGeometry(0.0052, 0.0052, 0.001, 20); med.rotateZ(Math.PI / 2);
    B.add(M.brass, place(boxUV(med, 60), sx * 0.0178, -0.058, 0.035));
  }
  // grip escutcheon screw
  B.add(M.bright, place(pin(0.0022, 0.0395, 12), 0, -0.07, 0.032));

  // ---------- trigger guard ----------
  B.add(M.blued, sideProfile([[0.034, -0.038], [0.036, -0.043], [0.03, -0.064, 0.006], [0.014, -0.069, 0.008], [-0.004, -0.061, 0.006], [-0.007, -0.038]],
    0.0085, { bevel: 0.0009, round: 0.002, holes: [[[0.03, -0.041], [0.026, -0.06, 0.005], [0.013, -0.064, 0.006], [-0.001, -0.057, 0.005], [-0.002, -0.041]]] }));
  B.build(root);

  // ---------- hammer (pivots at the rear of the frame) ----------
  const hammer = new THREE.Group(); hammer.name = 'hammer'; hammer.position.set(0, -0.004, 0.028); root.add(hammer);
  const HB = new PartBuilder();
  HB.add(M.bright, sideProfile([[0.006, -0.004], [0.01, 0.014], [0.012, 0.022, 0.004], [0.004, 0.028, 0.004], [-0.012, 0.033, 0.004], [-0.02, 0.031, 0.002], [-0.017, 0.025, 0.003], [-0.006, 0.02, 0.004], [-0.007, 0.0]], 0.0075, { bevel: 0.0009, round: 0.002 }));
  for (let i = 0; i < 5; i++) HB.add(M.darkSteel, place(new THREE.BoxGeometry(0.0079, 0.0012, 0.0012), 0, 0.0275 + i * 0.0012, 0.004 + i * 0.0032, 0.25)); // spur serrations
  HB.add(M.bright, place(pin(0.0028, 0.031, 12), 0, 0, 0));
  HB.build(hammer);

  // ---------- trigger ----------
  const trigger = new THREE.Group(); trigger.name = 'trigger'; trigger.position.set(0, -0.036, -0.016); root.add(trigger);
  const TB = new PartBuilder();
  TB.add(M.bright, sideProfile([[-0.004, 0.002], [0.004, 0.002], [0.006, -0.01, 0.005], [0.003, -0.02, 0.004], [-0.003, -0.023, 0.002], [-0.002, -0.012, 0.005]], 0.0072, { bevel: 0.001, round: 0.001 }));
  TB.build(trigger);

  // ---------- crane + cylinder (swing-out) ----------
  const crane = new THREE.Group(); crane.name = 'crane'; crane.position.set(CRANE_PIVOT.x, CRANE_PIVOT.y, 0); root.add(crane);
  const cylAxis = new THREE.Group(); cylAxis.position.set(-CRANE_PIVOT.x, CYL_AXIS_Y - CRANE_PIVOT.y, 0); crane.add(cylAxis);
  const CB = new PartBuilder();
  // crane arm + ejector rod (rod runs forward under the barrel)
  CB.add(M.blued, place(roundedBox(0.009, 0.026, 0.008, 0.0025), -0.002, -0.009, -0.0475));
  CB.build(cylAxis);

  const cylinder = new THREE.Group(); cylinder.name = 'cylinder'; cylAxis.add(cylinder);
  const YB = new PartBuilder();
  // fluted body: outline with 6 flutes between chambers, 6 chamber holes
  const outline = [], holes = [];
  const FL = 72;
  for (let i = 0; i < FL; i++) {
    const a = i / FL * Math.PI * 2;
    let r = CYL_R;
    for (let k = 0; k < 6; k++) {
      const fa = Math.PI / 2 + Math.PI / 6 + k * Math.PI / 3; // flute centres between chambers
      let d = Math.atan2(Math.sin(a - fa), Math.cos(a - fa));
      if (Math.abs(d) < 0.2) r = Math.min(r, CYL_R - 0.0032 * Math.cos(d / 0.2 * Math.PI / 2));
    }
    outline.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + k * Math.PI / 3, h = [];
    for (let i = 0; i < 20; i++) { const b = -i / 20 * Math.PI * 2; h.push([Math.cos(a) * CHAMBER_R + Math.cos(b) * 0.0046, Math.sin(a) * CHAMBER_R + Math.sin(b) * 0.0046]); }
    holes.push(h);
  }
  YB.add(M.blued, section(outline, CYL_F0 + 0.006, CYL_F1 - 0.005, { bevel: 0.0006, holes }));
  // un-fluted end bands with chamfers (front and rear)
  const ring = (f0, f1, ch) => {
    const outer = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; outer.push([Math.cos(a) * CYL_R, Math.sin(a) * CYL_R]); }
    return section(outer, f0, f1, { bevel: ch, holes });
  };
  YB.add(M.blued, ring(CYL_F0, CYL_F0 + 0.0065, 0.0012));
  YB.add(M.blued, ring(CYL_F1 - 0.0055, CYL_F1, 0.0012));
  // cylinder stop notches (small dark slots on the rear band)
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + Math.PI / 6 + k * Math.PI / 3 + Math.PI;
    YB.add(M.bore, place(new THREE.BoxGeometry(0.003, 0.0012, 0.004), Math.cos(a) * (CYL_R - 0.0002), Math.sin(a) * (CYL_R - 0.0002), -(CYL_F0 + 0.004), 0, 0, a + Math.PI / 2));
  }
  // chamber interiors (dark)
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; YB.add(M.bore, place(new THREE.CircleGeometry(0.0046, 16), Math.cos(a) * CHAMBER_R, Math.sin(a) * CHAMBER_R, -(CYL_F1 - 0.012))); }
  YB.build(cylinder);

  // ejector: star + rod, slides back (+Z) when the rod is pushed
  const ejector = new THREE.Group(); ejector.name = 'ejector'; cylAxis.add(ejector);
  const EB = new PartBuilder();
  const star = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + Math.PI / 2; const r = i % 2 ? 0.0065 : 0.0105; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
  EB.add(M.bright, section(star, -0.0005, CYL_F0 + 0.0015, { bevel: 0.0003 }));
  EB.add(M.bright, rod(0.0028, CYL_F1, 0.15, 14));
  EB.add(M.bright, lathe([[0.0028, 0.15], [0.0036, 0.151], [0.0036, 0.1565], [0.0022, 0.1575], [0, 0.1575]], 16)); // knurled tip
  EB.build(ejector);

  // cartridges (6) sitting in the chambers; fired ones get a dark primer
  const rounds = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + k * Math.PI / 3;
    const c = buildRevolverCartridge(M);
    c.position.set(Math.cos(a) * CHAMBER_R, Math.sin(a) * CHAMBER_R, -CYL_F0 + 0.0002);
    cylinder.add(c); rounds.push(c);
  }

  const anchor = (name, x, y, z, parent = root) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const muzzle = anchor('muzzle', 0, 0, -0.16);
  const rearSight = anchor('rearSight', 0, 0.022, 0.004);
  const frontSight = anchor('frontSight', 0, 0.022, -0.152);

  return { root, hammer, trigger, crane, cylAxis, cylinder, ejector, rounds, muzzle, rearSight, frontSight };
}

// .357-style cartridge: rim, straight case, lead semi-wadcutter nose. Its
// origin is the rear face of the rim; it extends forward (-Z).
export function buildRevolverCartridge(M, withBullet = true) {
  const g = new THREE.Group();
  const B = new PartBuilder();
  B.add(M.brass, lathe([[0.0, 0.0], [0.0055, 0.0], [0.0055, 0.0015], [0.0047, 0.0019], [0.0048, 0.033], [0.0046, 0.0335]], 20));
  if (withBullet) B.add(M.copper, lathe([[0.0046, 0.0335], [0.0046, 0.036], [0.0034, 0.04], [0.0022, 0.0415], [0, 0.0416]], 16));
  B.build(g);
  const primer = new THREE.Mesh(new THREE.CircleGeometry(0.0019, 14), M.primer);
  primer.position.z = 0.0001; g.add(primer);
  g.userData.primer = primer;
  return g;
}

// Speedloader: knurled black body holding six rounds in a circle.
export function buildSpeedloader(M) {
  const g = new THREE.Group();
  const B = new PartBuilder();
  B.add(M.polymer, lathe([[0.0, -0.028], [0.009, -0.028], [0.012, -0.02], [0.021, -0.016], [0.021, -0.004], [0.0, -0.004]], 32));
  B.add(M.bright, lathe([[0.0, -0.036], [0.005, -0.036], [0.006, -0.03], [0.004, -0.028], [0, -0.028]], 16)); // twist knob
  B.build(g);
  const rounds = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + k * Math.PI / 3;
    const c = buildRevolverCartridge(M);
    c.position.set(Math.cos(a) * CHAMBER_R, Math.sin(a) * CHAMBER_R, 0.004);
    c.rotation.y = 0;
    g.add(c); rounds.push(c);
  }
  g.userData.rounds = rounds;
  return g;
}
