// The people of Fir Vale: residents walking the pavements, neighbours
// chatting outside the shops, wheelchair users, and people sleeping rough
// in doorways. Page Hall and Fir Vale are home to a large Slovak and Czech
// community (many of them Roma), Ukrainian families who came as refugees,
// Polish neighbours, British-Pakistani and Yemeni families and born-and-bred
// Sheffielders -- so that's who you meet, each with their own lines.
//
// Everyone is drawn in ONE instanced draw call: a jointed body template
// whose limbs are posed in the vertex shader (walk cycle, sitting, sitting
// on the ground, cowering, talking with their hands), with per-person
// clothes, skin and hair colours and optional pieces (headscarf, long
// skirt, cap, beard, long hair, coat, backpack, sleeping bag).
//
// Civilians can't be hurt: gunfire makes them duck, shout and run.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { blobShadowTexture } from '../textures/procedural.js';

// ------------------------------------------------------------------ template
// parts: 0 pelvis, 1 torso, 2 head, 3/4 L upper/fore arm, 5/6 R upper/fore arm,
//        7/8 L thigh/shin, 9/10 R thigh/shin
// slots: 0 skin, 1 hair, 2 top, 3 bottom, 4 shoes, 5 accent, 6 dark (eyes/soles)
// opts (bit): 0 always, 1 long hair, 2 headscarf, 3 cap, 4 long skirt, 5 beard,
//        6 coat, 7 backpack, 8 sleeping bag, 9 short hair, 10 carrier bag, 11 hood
const J = { hip: 0.93, knee: 0.5, shoulderY: 1.42, shoulderX: 0.19, elbowY: 1.14, neck: 1.52, hipX: 0.095 };

function part(geo, p, slot, opt = 0) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count;
  geo.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(n).fill(p), 1));
  geo.setAttribute('slot', new THREE.Float32BufferAttribute(new Float32Array(n).fill(slot), 1));
  geo.setAttribute('opt', new THREE.Float32BufferAttribute(new Float32Array(n).fill(opt), 1));
  geo.deleteAttribute('uv');
  return geo;
}
const T = (g, x, y, z) => g.translate(x, y, z);
function lathe(profile, seg = 8) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function limb(r0, r1, len, seg = 6) { const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1); return g; }

function buildTemplate() {
  const P = [];
  // pelvis + torso (elliptical cross-section)
  const hips = lathe([[0.0, 0.84], [0.15, 0.86], [0.17, 0.95], [0.155, 1.02], [0.0, 1.02]], 10); hips.scale(1, 1, 0.72);
  P.push(part(hips, 0, 3));
  const torso = lathe([[0.0, 1.0], [0.155, 1.0], [0.15, 1.12], [0.165, 1.28], [0.19, 1.4], [0.13, 1.47], [0.06, 1.5], [0.0, 1.5]], 10); torso.scale(1, 1, 0.66);
  P.push(part(torso, 1, 2));
  // coat: longer body down to mid-thigh
  const coat = lathe([[0.0, 0.66], [0.2, 0.66], [0.19, 0.95], [0.175, 1.15], [0.2, 1.4], [0.135, 1.48], [0.0, 1.49]], 10); coat.scale(1.02, 1, 0.72);
  P.push(part(coat, 1, 5, 6));
  // neck + head
  P.push(part(T(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 6, 1, true), 0, 1.53, 0), 2, 0));
  const head = new THREE.SphereGeometry(0.105, 10, 8); head.scale(0.92, 1.12, 1.0); T(head, 0, 1.66, 0.01);
  P.push(part(head, 2, 0));
  P.push(part(T(new THREE.BoxGeometry(0.03, 0.045, 0.04), 0, 1.655, 0.115), 2, 0));                 // nose
  for (const sx of [-1, 1]) P.push(part(T(new THREE.SphereGeometry(0.014, 4, 3), sx * 0.037, 1.685, 0.094), 2, 6)); // eyes
  P.push(part(T(new THREE.BoxGeometry(0.045, 0.008, 0.01), 0, 1.615, 0.1), 2, 6));                     // mouth line
  for (const sx of [-1, 1]) P.push(part(T(new THREE.SphereGeometry(0.022, 4, 3).scale(0.5, 1, 1), sx * 0.098, 1.66, 0.0), 2, 0)); // ears
  // hair: short crop, long hair, headscarf, cap, beard, hood
  const crop = new THREE.SphereGeometry(0.112, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.52); crop.scale(0.94, 1.08, 1.02); T(crop, 0, 1.675, -0.005);
  P.push(part(crop, 2, 1, 9));
  const longHair = new THREE.SphereGeometry(0.118, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.6); longHair.scale(0.97, 1.1, 1.05); T(longHair, 0, 1.67, -0.012);
  P.push(part(longHair, 2, 1, 1));
  P.push(part(T(new THREE.BoxGeometry(0.2, 0.3, 0.06), 0, 1.5, -0.075), 2, 1, 1));                    // hair down the back
  const scarf = new THREE.SphereGeometry(0.128, 9, 7); scarf.scale(0.96, 1.12, 0.92); T(scarf, 0, 1.655, -0.05);
  P.push(part(scarf, 2, 5, 2));
  P.push(part(T(lathe([[0.0, 1.38], [0.2, 1.4], [0.13, 1.5], [0.06, 1.58], [0.0, 1.58]], 10).scale(1, 1, 0.8), 0, 0, -0.01), 1, 5, 2)); // drape over shoulders
  const cap = new THREE.SphereGeometry(0.116, 9, 3, 0, Math.PI * 2, 0, Math.PI * 0.42); T(cap, 0, 1.69, 0);
  P.push(part(cap, 2, 5, 3)); P.push(part(T(new THREE.BoxGeometry(0.16, 0.012, 0.1), 0, 1.72, 0.12), 2, 5, 3));
  const beard = new THREE.SphereGeometry(0.1, 8, 3, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4); beard.scale(0.95, 1.1, 1.05); T(beard, 0, 1.655, 0.02);
  P.push(part(beard, 2, 1, 5));
  const hood = new THREE.SphereGeometry(0.13, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.62); hood.scale(1, 1.1, 1.05); T(hood, 0, 1.66, -0.03);
  P.push(part(hood, 2, 2, 11));
  // arms (upper: top colour, forearm: top colour sleeve + skin hand)
  for (const sx of [-1, 1]) {
    const up = sx < 0 ? 3 : 5, fo = sx < 0 ? 4 : 6;
    P.push(part(T(new THREE.SphereGeometry(0.058, 6, 4), sx * J.shoulderX, J.shoulderY - 0.02, 0), up, 2));
    P.push(part(T(limb(0.052, 0.046, 0.3), sx * (J.shoulderX + 0.012), J.shoulderY - 0.15, 0), up, 2));
    P.push(part(T(limb(0.045, 0.036, 0.26), sx * (J.shoulderX + 0.02), J.elbowY - 0.13, 0), fo, 2));
    P.push(part(T(new THREE.SphereGeometry(0.042, 5, 4).scale(0.8, 1.2, 1), sx * (J.shoulderX + 0.02), J.elbowY - 0.3, 0.005), fo, 0));
    // carrier bag in the right hand
    if (sx > 0) P.push(part(T(new THREE.BoxGeometry(0.2, 0.3, 0.1), sx * (J.shoulderX + 0.04), J.elbowY - 0.5, 0.0), fo, 5, 10));
  }
  // legs + shoes
  for (const sx of [-1, 1]) {
    const th = sx < 0 ? 7 : 9, sh = sx < 0 ? 8 : 10;
    P.push(part(T(limb(0.078, 0.064, 0.44), sx * J.hipX, J.hip - 0.21, 0), th, 3));
    P.push(part(T(limb(0.06, 0.047, 0.44), sx * J.hipX, J.knee - 0.22, 0), sh, 3));
    P.push(part(T(new THREE.BoxGeometry(0.1, 0.075, 0.25), sx * J.hipX, 0.04, 0.04), sh, 4));
    P.push(part(T(new THREE.BoxGeometry(0.105, 0.02, 0.26), sx * J.hipX, 0.008, 0.04), sh, 6));
  }
  // long skirt (static below the hips; the legs swing inside it)
  P.push(part(lathe([[0.0, 0.2], [0.26, 0.12], [0.24, 0.3], [0.19, 0.7], [0.165, 0.95], [0.0, 0.96]], 9).scale(1, 1, 0.85), 0, 3, 4));
  // backpack
  P.push(part(T(new THREE.BoxGeometry(0.3, 0.38, 0.14), 0, 1.22, -0.17), 1, 5, 7));
  // sleeping bag over the legs (for people sitting on the ground)
  const bag = new THREE.CapsuleGeometry(0.2, 1.0, 2, 6); bag.rotateX(Math.PI / 2); bag.scale(1.25, 0.6, 1); T(bag, 0, 0.14, 0.45);
  P.push(part(bag, 0, 5, 8));
  const g = mergeParts(P); console.log('crowd template tris', g.attributes.position.count / 3); return g;
}
function mergeParts(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['part', 1], ['slot', 1], ['opt', 1]]) {
    const a = new Float32Array(n * size); let o = 0;
    for (const g of list) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(a, size));
  }
  return out;
}

const VERT_HEAD = /* glsl */`
attribute float part; attribute float slot; attribute float opt;
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD; attribute vec4 iE; attribute vec4 iF;
varying vec3 vSlotCol;
vec3 skP;
void rotX(inout vec3 p, inout vec3 n, vec3 piv, float a) { float c = cos(a), s = sin(a); vec3 q = p - piv; p = piv + vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z); n = vec3(n.x, c * n.y - s * n.z, s * n.y + c * n.z); }
void rotZ(inout vec3 p, inout vec3 n, vec3 piv, float a) { float c = cos(a), s = sin(a); vec3 q = p - piv; p = piv + vec3(c * q.x - s * q.y, s * q.x + c * q.y, q.z); n = vec3(c * n.x - s * n.y, s * n.x + c * n.y, n.z); }
void rotY(inout vec3 p, inout vec3 n, vec3 piv, float a) { float c = cos(a), s = sin(a); vec3 q = p - piv; p = piv + vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z); n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z); }
`;
const VERT_BODY = /* glsl */`
  vec3 objectNormal = vec3(normal);
  skP = position;
  {
    float ph = iA.w, gait = iB.w, pose = iC.w, gest = iE.w, look = iF.w;
    int flags = int(iD.w + 0.5);
    int o = int(opt + 0.5);
    bool show = o == 0 || ((flags >> o) & 1) == 1;
    // hide the plain crop under hats/scarves/hoods/long hair
    if (o == 9 && ((flags >> 1) & 1) + ((flags >> 2) & 1) + ((flags >> 11) & 1) > 0) show = false;
    if (!show) skP = vec3(0.0, -50.0, 0.0);
    float p = part;
    float amp = min(gait, 1.0) * 0.46 + max(gait - 1.0, 0.0) * 0.36;
    float sw = sin(ph);
    float thL = -amp * sw, thR = amp * sw;
    float knL = amp * 1.5 * max(0.0, -cos(ph)) + 0.05, knR = amp * 1.5 * max(0.0, cos(ph)) + 0.05;
    float shL = amp * 0.75 * sw, shR = -amp * 0.75 * sw;
    float elL = -0.18 - amp * 0.35 - max(gait - 1.0, 0.0) * 0.9, elR = elL;
    float lean = max(gait - 1.0, 0.0) * 0.18, drop = 0.0, spread = 0.07;
    float breath = sin(ph * 0.35) * 0.012 * (1.0 - min(gait, 1.0));
    if (pose > 0.5 && pose < 1.5) { thL = thR = -1.52; knL = knR = 1.5; drop = -0.42; shL = shR = -0.25; elL = elR = -0.95; lean = -0.05; }
    else if (pose > 1.5 && pose < 2.5) { thL = -1.45; thR = -1.35; knL = 0.25; knR = 0.5; drop = -0.78; shL = shR = -0.45; elL = elR = -0.9; lean = -0.22; }
    else if (pose > 2.5) { thL = thR = -1.25; knL = knR = 2.1; drop = -0.43; lean = 0.55; shL = shR = -2.7; elL = elR = -1.3; }
    // talking with the hands
    if (gest > 0.0) { shR += -0.55 * gest + 0.2 * sin(ph * 1.7) * gest; elR += -0.9 * gest + 0.35 * sin(ph * 2.3) * gest; shL += -0.25 * gest * max(0.0, sin(ph * 0.9)); }
    vec3 hipC = vec3(0.0, ${J.hip.toFixed(3)}, 0.0);
    // arms
    if (p > 2.5 && p < 6.5) {
      float sx = p < 4.5 ? -1.0 : 1.0;
      vec3 sh = vec3(sx * ${J.shoulderX.toFixed(3)}, ${J.shoulderY.toFixed(3)}, 0.0), el = vec3(sx * ${(J.shoulderX + 0.02).toFixed(3)}, ${J.elbowY.toFixed(3)}, 0.0);
      if (p == 4.0 || p == 6.0) rotX(skP, objectNormal, el, sx < 0.0 ? elL : elR);
      rotZ(skP, objectNormal, sh, sx * spread * (1.0 - min(gait, 1.0) * 0.5));
      rotX(skP, objectNormal, sh, sx < 0.0 ? shL : shR);
    }
    // legs
    if (p > 6.5) {
      float sx = p < 8.5 ? -1.0 : 1.0;
      vec3 hp = vec3(sx * ${J.hipX.toFixed(3)}, ${J.hip.toFixed(3)}, 0.0), kn = vec3(sx * ${J.hipX.toFixed(3)}, ${J.knee.toFixed(3)}, 0.0);
      if (p == 8.0 || p == 10.0) rotX(skP, objectNormal, kn, sx < 0.0 ? knL : knR);
      rotX(skP, objectNormal, hp, sx < 0.0 ? thL : thR);
    }
    // head turn / nod
    if (p == 2.0) { rotY(skP, objectNormal, vec3(0.0, ${J.neck.toFixed(3)}, 0.0), look); if (pose > 2.5) rotX(skP, objectNormal, vec3(0.0, ${J.neck.toFixed(3)}, 0.0), 0.5); }
    // upper body lean + breathing
    if (p > 0.5 && p < 6.5) { rotX(skP, objectNormal, hipC, lean); skP.y += breath * (skP.y - 0.9); }
    // walking bob
    skP.y += drop + abs(cos(ph)) * 0.022 * min(gait, 1.0) * (pose < 0.5 ? 1.0 : 0.0);
    vec3 cols[7];
    cols[0] = iA.rgb; cols[1] = iB.rgb; cols[2] = iC.rgb; cols[3] = iD.rgb; cols[4] = iE.rgb; cols[5] = iF.rgb; cols[6] = vec3(0.02, 0.018, 0.016);
    vSlotCol = cols[int(slot + 0.5)];
  }
`;

// ------------------------------------------------------------------ people
const SKIN = ['#f1c7a8', '#e2b08d', '#d39a74', '#c08560', '#a86e4b', '#8c5a3b', '#6e4430', '#4f3022', '#e8b896', '#b97d58'];
const HAIR = ['#0f0c0a', '#1c140f', '#2d1d13', '#4a3020', '#6b4a2e', '#8c6b45', '#b89a6a', '#c9c3bb', '#8f8a86', '#26211d'];
const TOPS = ['#1f2937', '#374151', '#7f1d1d', '#1e3a8a', '#065f46', '#f3f4f6', '#111827', '#6b21a8', '#9a3412', '#0f766e', '#be185d', '#a16207', '#52525b', '#dc2626', '#2563eb', '#e5e7eb', '#57534e', '#14532d'];
const BOTTOMS = ['#1f2937', '#111827', '#1e3a8a', '#3f3f46', '#27272a', '#44403c', '#312e81', '#0c0a09', '#52525b'];
const SKIRTS = ['#7c2d12', '#1e3a8a', '#6b21a8', '#831843', '#111827', '#065f46', '#9d174d', '#b45309', '#334155'];
const SCARVES = ['#111111', '#1e3a8a', '#7c2d12', '#e5e7eb', '#6b21a8', '#0f766e', '#be185d', '#78350f', '#334155'];
const SHOES = ['#111111', '#f3f4f6', '#3f2a1d', '#1f2937', '#e5e7eb', '#57534e'];
const pick = (a, R) => a[(R() * a.length) | 0];

const NAMES = {
  sk: ['Marek', 'Zuzana', 'Jozef', 'Katarína', 'Milan', 'Lucia', 'Peter', 'Monika', 'Dušan', 'Renáta', 'Ján', 'Silvia'],
  ua: ['Olena', 'Andriy', 'Iryna', 'Taras', 'Oksana', 'Dmytro', 'Nadia'],
  pl: ['Kasia', 'Tomasz', 'Agnieszka', 'Paweł'],
  en: ['Janet', 'Dave', 'Shaz', 'Kev', 'Bev', 'Gaz', 'Tina', 'Rob', 'Maureen', 'Dean'],
  pk: ['Imran', 'Aisha', 'Bilal', 'Nasreen', 'Tariq', 'Sadia', 'Zain'],
  ye: ['Abdul', 'Fatima', 'Nabil', 'Amira'],
};
const GREET = {
  sk: ['"Ahoj!"', '"Dobrý deň!"', '"Ako sa máš?"', '"Čau, kamoš!"'],
  ua: ['"Pryvit!"', '"Dobryi den!"', '"Slava Sheffield!"'],
  pl: ['"Cześć!"', '"Dzień dobry!"'],
  en: ['"Now then!"', '"Ey up, love."', '"Alright, duck?"', '"Nithering today, innit."'],
  pk: ['"Salaam!"', '"Alright, bro?"', '"Salaam, you good?"'],
  ye: ['"Salaam!"', '"Ahlan!"'],
};
const LINES = {
  sk: [
    '"Ahoj! We\'ve lived on this street twelve years. The potholes know me by name."',
    '"My son translates for me at the doctor. Then he translates for the doctor to me. Then he charges us both a Kinder Bueno."',
    '"Dobrý deň! You want good bread? Potraviny, two doors down. Tell them Marek sent you. They will charge you more."',
    '"In Slovakia we have mountains. In Sheffield you have… hills that think they are mountains. Respect."',
    '"Is it true Sheffield has seven hills? I have walked up all of them carrying shopping. Every day."',
    '"My grandmother says you look like a man who needs soup. She is never wrong."',
    '"Football tonight on the rec, eight o\'clock. You in? Leave the rifle, we have rules."',
  ],
  ua: [
    '"We came from Kharkiv. Everyone here said \'you\'ll love Sheffield, it\'s just like home.\' It is not. But the people are kind."',
    '"Pryvit! My English teacher at the community hub says I speak like a Yorkshireman now. Ey up. Is correct?"',
    '"My daughter is top of her class at Fir Vale. Top! Six months ago she knew only \'hello\' and \'chips\'."',
    '"First winter here, I thought the rain would stop. Nobody told me. It does not stop."',
  ],
  pl: [
    '"Cześć! I fix your boiler, your car, your fence. Not your aim. Nobody can fix that."',
    '"I have been here twenty years. I say \'ey up\' now. My mother is horrified."',
  ],
  en: [
    '"Forty years I\'ve lived on Page Hall Road. Seen it all. Never seen anyone that keen on a trolley bay though."',
    '"Is that thing real? Put it away, love, you\'ll frighten the pigeons. And me."',
    '"They\'ve been digging up Owler Lane since before decimal currency."',
    '"You want the 88? Stand there long enough and three\'ll come at once."',
    '"Don\'t race Dez. Our Kev raced Dez. Our Kev\'s still not over it."',
  ],
  pk: [
    '"Salaam! Best samosas in Sheffield are on this road. Don\'t tell my mum I said it wasn\'t hers."',
    '"My uncle\'s shop has sold everything since 1987. Phone cards, rice, bike locks. Once, a goat. Long story."',
    '"You look lost. Everyone looks lost on Hinde House Lane. It\'s part of the charm."',
  ],
  ye: [
    '"Ahlan! My dad runs the café. The tea is so strong it has its own postcode."',
    '"Rain again. Back home we\'d call this a national emergency. Here it\'s Tuesday."',
  ],
};
const HOMELESS_LINES = [
  '"Spare a bit of change? No? Spare a bit of conversation, then. Nobody talks to you when you\'re sat down."',
  '"I\'m not homeless, I\'m house-less. Fir Vale\'s my home. It just hasn\'t got a roof."',
  '"St Cuthbert\'s do a cracking breakfast. Tell \'em Mick sent you. They won\'t know who that is, mind."',
  '"Five years on the housing list. At this rate I\'ll get a flat in the afterlife. Hope it\'s ground floor."',
  '"That lad in the racing chair nearly took my sleeping bag with him. Respect, though. Proper line."',
  '"Careful with that, pal. Some of us are trying to have a kip."',
  '"Used to be a welder. Built half the gates on this road. Now I just sit by \'em."',
  '"If you\'re going to the Mini Mart, tell him the tea he gave me was lovely. And that I\'ll want another at four."',
];
const WHEEL_LINES = [
  '"Pavement parking again. I\'ve done three-point turns in less space than that."',
  '"Dez reckons he\'s the fastest thing on four wheels round here. He\'s never met me on the hill down to Owler Lane."',
  '"Dropped kerb? Where? Ah, I see it. Behind the wheelie bin. Behind the other wheelie bin."',
];

class Person {
  constructor(o) { Object.assign(this, o); this.phase = Math.random() * 10; this.greetT = 0; this.fear = 0; this.cower = 0; this.yawS = this.yaw; this.talk = 0; }
  bubbleAnchor(v) { return v.set(this.x, this.y + (this.pose === 2 ? 1.0 : this.pose === 1 ? 1.35 : 1.95) * this.scale, this.z); }
}

export class Crowd {
  constructor(scene, world, map, hud, { count = 110 } = {}) {
    this.scene = scene; this.world = world; this.map = map; this.net = map.net; this.hud = hud;
    this.people = [];
    const R = this.R = mulberry(20260923);
    const net = this.net;
    this.walkable = net.roads.filter((r) => (r.kind === 'r' || r.kind === 'b' || r.kind === 'a' || r.kind === 'f') && r.length > 12 && inside(map.bounds, r.samples[r.samples.length >> 1]));
    // --- chatting groups outside the shops ---
    const shops = [...map.shopSpots].sort(() => R() - 0.5);
    for (const s of shops.slice(0, Math.min(26, shops.length))) {
      if (s.miniMart) continue;
      const n = 2 + ((R() * 2) | 0), nx = Math.sin(s.ry), nz = Math.cos(s.ry);
      const cx = s.x + nx * 2.4 + Math.cos(s.ry) * (R() - 0.5) * 2, cz = s.z + nz * 2.4 - Math.sin(s.ry) * (R() - 0.5) * 2;
      const grp = this.group(R);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R();
        const x = cx + Math.cos(a) * 0.75, z = cz + Math.sin(a) * 0.75;
        this.add({ kind: 'chat', x, z, yaw: Math.atan2(cx - x, cz - z), ...this.look(R, grp) });
      }
    }
    // --- people sleeping rough: shop doorways (empty units first), the church, bus shelters ---
    const doorways = [...shops.filter((s) => s.cat === 'tolet'), ...shops.filter((s) => s.cat !== 'tolet' && !s.miniMart)];
    let h = 0;
    for (const s of doorways) {
      if (h >= 9) break; if (R() < 0.4 && s.cat !== 'tolet') continue;
      const nx = Math.sin(s.ry), nz = Math.cos(s.ry), tx = Math.cos(s.ry), tz = -Math.sin(s.ry);
      const x = s.x + nx * 0.55 + tx * (R() < 0.5 ? -1.6 : 1.6), z = s.z + nz * 0.55 + tz * (R() < 0.5 ? -1.6 : 1.6);
      this.add({ kind: 'rough', x, z, yaw: s.ry, ...this.look(R, 'en', { homeless: true }) }); h++;
    }
    for (const it of map.interactables) if (/St Cuthbert/.test(it.prompt || '')) { this.add({ kind: 'rough', x: it.x + 3, z: it.z + 1, yaw: 0, ...this.look(R, 'en', { homeless: true }) }); }
    // --- walkers and wheelchair users on the pavements (busier round the shops) ---
    const near = (r) => { const m = r.samples[r.samples.length >> 1]; let d = Infinity; for (const s of map.shopSpots) d = Math.min(d, Math.hypot(s.x - m.x, s.z - m.z)); return d; };
    const weights = this.walkable.map((r) => (near(r) < 60 ? 6 : near(r) < 200 ? 2 : 1) * Math.sqrt(r.length));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const nWalk = Math.max(20, count - this.people.length);
    for (let i = 0; i < nWalk; i++) {
      let u = R() * wsum, k = 0; while (u > weights[k] && k < weights.length - 1) { u -= weights[k]; k++; }
      let r = this.walkable[k]; const grp = this.group(R);
      // most walkers start near the player's spawn; the rest anywhere
      if (i < nWalk * 0.75 && map.spawn) r = this.roadNear(map.spawn.x, map.spawn.z, 8, 140, R) || r;
      const wheel = R() < 0.06;
      const p = this.add({ kind: wheel ? 'wheel' : 'walk', road: r, s: R() * r.length, dir: R() < 0.5 ? 1 : -1, side: R() < 0.5 ? 1 : -1, jit: (R() - 0.5) * 0.5, speed: wheel ? 1.1 : 1.15 + R() * 0.45, x: 0, z: 0, yaw: 0, ...this.look(R, grp, { wheel }) });
      this.placeOnRoad(p);
    }
    this.buildMeshes();
    this.tmp = new THREE.Vector3();
  }

  // a random walkable road with its middle between rMin and rMax metres from (x,z)
  roadNear(x, z, rMin, rMax, R = Math.random) {
    for (let t = 0; t < 40; t++) {
      const r = this.walkable[(R() * this.walkable.length) | 0], m = r.samples[(R() * r.samples.length) | 0];
      const d = Math.hypot(m.x - x, m.z - z);
      if (d > rMin && d < rMax) return r;
    }
    return null;
  }

  group(R) { const u = R(); return u < 0.36 ? 'sk' : u < 0.46 ? 'ua' : u < 0.52 ? 'pl' : u < 0.72 ? 'pk' : u < 0.8 ? 'ye' : 'en'; }

  look(R, grp, { homeless = false, wheel = false } = {}) {
    const female = R() < 0.5, child = !homeless && !wheel && R() < 0.12, elder = !child && R() < 0.18;
    let flags = 0; const set = (b) => { flags |= 1 << b; };
    const skin = grp === 'en' ? pick(SKIN.slice(0, 5).concat(SKIN.slice(5, 8)), R) : grp === 'pk' || grp === 'ye' ? pick(SKIN.slice(3, 9), R) : grp === 'sk' ? pick(SKIN.slice(2, 8), R) : pick(SKIN.slice(0, 4), R);
    let hair = elder ? pick(HAIR.slice(7, 9), R) : pick(grp === 'en' || grp === 'ua' || grp === 'pl' ? HAIR : HAIR.slice(0, 5), R);
    let top = pick(TOPS, R), bottom = pick(BOTTOMS, R), accent = pick(SCARVES, R);
    set(9);
    if (female) {
      if (((grp === 'pk' || grp === 'ye') && R() < 0.75) || (grp === 'sk' && R() < 0.12)) set(2);
      else if (R() < 0.8) set(1);
      if ((grp === 'sk' && R() < 0.55) || ((grp === 'pk' || grp === 'ye') && R() < 0.5) || (elder && R() < 0.4)) { set(4); bottom = pick(SKIRTS, R); }
    } else {
      if (R() < 0.3) set(3);
      if (R() < (grp === 'pk' || grp === 'ye' ? 0.5 : 0.18) && !child) set(5);
    }
    if (R() < 0.3 || elder) { set(6); accent = flags & (1 << 2) ? accent : pick(['#3f3f46', '#1f2937', '#57534e', '#78350f', '#1e3a8a', '#44403c', '#0f172a'], R); }
    if (!child && R() < 0.15) set(7);
    if (!child && R() < 0.18) set(10);
    if (!female && R() < 0.12) set(11);
    if (homeless) { flags &= ~(1 << 7); flags &= ~(1 << 10); set(8); if (R() < 0.6) set(11); set(6); top = pick(['#3f3f46', '#57534e', '#1e3a8a', '#14532d', '#44403c'], R); accent = pick(['#1e3a8a', '#7f1d1d', '#14532d', '#78716c'], R); if (R() < 0.6) set(5); }
    const name = pick(NAMES[grp], R);
    return { grp, female, child, elder, flags, skin, hair, top, bottom, shoes: pick(SHOES, R), accent, name, scale: child ? 0.6 + R() * 0.12 : (female ? 0.93 : 1.0) * (0.95 + R() * 0.09), homeless, wheel,
      pose: homeless ? 2 : wheel ? 1 : 0 };
  }

  add(o) { const p = new Person(o); p.y = G(p.x, p.z); this.people.push(p); return p; }

  placeOnRoad(p) {
    const r = p.road, net = this.net;
    const off = r.kind === 'f' ? p.jit * 0.5 : r.pave > 0 ? p.side * (r.half + r.pave * 0.5 + p.jit * Math.min(0.4, r.pave * 0.2)) : p.side * r.half * 0.7;
    const q = net.pointAt(r, p.s, off, this._q || (this._q = {}));
    p.x = q.x; p.z = q.z; p.tx = q.tx * p.dir; p.tz = q.tz * p.dir;
    p.y = G(q.x, q.z) + (r.pave > 0 ? 0.15 : 0.04);
  }

  // ------------------------------------------------------------ meshes
  buildMeshes() {
    const geo = buildTemplate(), N = this.people.length;
    const ig = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'part', 'slot', 'opt']) ig.setAttribute(k, geo.attributes[k]);
    this.attrs = {};
    for (const k of ['iA', 'iB', 'iC', 'iD', 'iE', 'iF']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); a.setUsage(THREE.DynamicDrawUsage); ig.setAttribute(k, a); this.attrs[k] = a; }
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <beginnormal_vertex>', VERT_BODY)
        .replace('#include <begin_vertex>', 'vec3 transformed = skP;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSlotCol;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vSlotCol;');
    };
    mat.customProgramCacheKey = () => 'crowd-v1';
    this.mesh = new THREE.InstancedMesh(ig, mat, N);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
    // soft contact shadows
    const shMat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shMat, N);
    this.shadows.frustumCulled = false; this.scene.add(this.shadows);
    // wheelchairs
    this.chairs = this.people.filter((p) => p.wheel);
    this.chairMesh = new THREE.InstancedMesh(wheelchairGeo(), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.6 }), Math.max(1, this.chairs.length));
    this.chairMesh.frustumCulled = false; this.scene.add(this.chairMesh);
    this.col = new THREE.Color();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sv = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }

  // ------------------------------------------------------------ behaviour
  onLoudNoise(px, pz) {
    for (const p of this.people) {
      const d = Math.hypot(p.x - px, p.z - pz); if (d > 70) continue;
      if (p.kind === 'rough') { if (d < 25 && this.hud && Math.random() < 0.15) this.hud.bubble(p, pick(['"Oi! Some of us are sleeping!"', '"Not again…"', '"Do you MIND?"'], Math.random), p.name, 2); continue; }
      if (d < 9 && p.kind !== 'wheel' && Math.random() < 0.5) p.cower = 1.5 + Math.random() * 1.5;
      p.fear = 6 + Math.random() * 4;
      if (p.road) { const ax = p.x - px, az = p.z - pz; const q = this.net.pointAt(p.road, p.s, 0, {}); p.dir = Math.sign(ax * q.tx + az * q.tz) || 1; }
      else { p.fleeX = p.x - px; p.fleeZ = p.z - pz; const l = Math.hypot(p.fleeX, p.fleeZ) || 1; p.fleeX /= l; p.fleeZ /= l; }
      if (d < 30 && this.hud && Math.random() < 0.12) this.hud.bubble(p, pick(p.grp === 'sk' ? ['"Ježišmária!"', '"Bože môj!"'] : p.grp === 'ua' ? ['"Bozhe!"', '"Not again, please!"'] : p.grp === 'pl' ? ['"Kurczę!"'] : ['"Bloody hell!"', '"Leg it!"', '"Call the police!"', '"Ya Allah!"'], Math.random), p.name, 1.8);
    }
  }

  nearest(px, pz, r = 2.4) {
    let best = null, bd = r;
    for (const p of this.people) { const d = Math.hypot(p.x - px, p.z - pz); if (d < bd && p.fear <= 0) { bd = d; best = p; } }
    return best;
  }
  talk(p) {
    const lines = p.homeless ? HOMELESS_LINES : p.wheel && Math.random() < 0.6 ? WHEEL_LINES : LINES[p.grp];
    p.li = ((p.li ?? Math.floor(Math.random() * lines.length)) + 1) % lines.length;
    this.hud.subtitle(`<b>${p.name}:</b> ${lines[p.li]}`, 5);
    p.talk = 5;
  }

  update(dt, player) {
    const net = this.net, px = player.pos.x, pz = player.pos.z;
    let vis = 0, sv = 0, cv = 0;
    const A = this.attrs, R = Math.random;
    for (const p of this.people) {
      const dx = p.x - px, dz = p.z - pz, dist = Math.hypot(dx, dz);
      p.fear -= dt; p.cower -= dt; p.greetT -= dt; p.talk -= dt;
      let gait = 0, gest = 0, look = 0;
      // keep the streets busy round the player: walkers who drift too far
      // away quietly reappear on another pavement nearby (out of sight)
      if ((p.kind === 'walk' || p.kind === 'wheel') && dist > 175 && p.fear <= 0) {
        const r = this.roadNear(px, pz, 70, 150);
        if (r) { p.road = r; p.s = Math.random() * r.length; p.dir = Math.random() < 0.5 ? 1 : -1; this.placeOnRoad(p); continue; }
      }
      const far = dist > 160;
      if (p.kind === 'walk' || p.kind === 'wheel') {
        let speed = p.speed;
        if (p.fear > 0) speed = p.kind === 'wheel' ? 2.2 : 3.8 + (p.child ? 0.5 : 0);
        if (p.cower > 0) speed = 0;
        if (p.talk > 0) speed = 0;
        // step aside / wait for the player on the pavement
        if (dist < 1.6 && p.fear <= 0 && (dx * p.tx + dz * p.tz) < 0) speed *= 0.25;
        if (!far || Math.random() < 0.05) {
          p.s += speed * dt * p.dir * (far ? 20 : 1);
          if (p.s < 0 || p.s > p.road.length) this.nextRoad(p);
          this.placeOnRoad(p);
        }
        gait = p.kind === 'wheel' ? 0 : speed > 2.5 ? 2 : speed > 0.1 ? speed / p.speed : 0;
        p.phase += dt * (gait > 1.5 ? 11 : 6.3 * Math.max(0.3, speed / 1.3));
        p.yaw = Math.atan2(p.tx, p.tz);
      } else if (p.kind === 'chat') {
        if (p.fear > 0) { p.x += p.fleeX * 3.5 * dt; p.z += p.fleeZ * 3.5 * dt; p.yaw = Math.atan2(p.fleeX, p.fleeZ); gait = 2; p.phase += dt * 11; p.y = G(p.x, p.z) + 0.15; }
        else { p.phase += dt * 3; gest = 0.5 + 0.5 * Math.sin(p.phase * 0.21 + p.scale * 9); look = Math.sin(p.phase * 0.13) * 0.4; }
      } else { p.phase += dt * 2; look = Math.sin(p.phase * 0.2) * 0.3; }
      // look at the player when they're close
      if (dist < 6 && p.fear <= 0 && p.kind !== 'walk') { let a = Math.atan2(-dx, -dz) - p.yaw; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; look = Math.max(-1.1, Math.min(1.1, a)); }
      // greetings as you pass
      if (dist < 4.5 && p.greetT <= 0 && p.fear <= 0 && this.hud) {
        p.greetT = 25 + R() * 20;
        if (R() < 0.45) this.hud.bubble(p, p.homeless ? pick(['"Spare any change, pal?"', '"Alright, boss."', '"Lovely day for it."'], R) : pick(GREET[p.grp], R), p.name, 2.2);
      }
      // smooth turning
      let d = p.yaw - p.yawS; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.yawS += d * Math.min(1, dt * 8);
      if (dist > 130) continue;
      const pose = p.cower > 0 ? 3 : p.pose;
      // instance
      const i = vis++;
      this.q.setFromAxisAngle(this.up, p.yawS);
      const lift = p.wheel ? 0.1 : 0;
      this.m4.compose(this.v.set(p.x, p.y + lift, p.z), this.q, this.sv.set(p.scale, p.scale, p.scale));
      this.mesh.setMatrixAt(i, this.m4);
      const setA = (a, hex, w) => { this.col.set(hex); a.setXYZW(i, this.col.r, this.col.g, this.col.b, w); };
      setA(A.iA, p.skin, p.phase); setA(A.iB, p.hair, gait); setA(A.iC, p.top, pose); setA(A.iD, p.bottom, p.flags); setA(A.iE, p.shoes, gest); setA(A.iF, p.accent, look);
      // shadow blob
      const s = pose === 2 ? 1.4 : 0.9;
      this.m4.compose(this.v.set(p.x, p.y + 0.03, p.z + (pose === 2 ? 0.3 : 0)), this.q, this.sv.set(s * p.scale, 1, s * 1.3 * p.scale));
      this.shadows.setMatrixAt(sv++, this.m4);
      if (p.wheel) { this.m4.compose(this.v.set(p.x, p.y, p.z), this.q, this.sv.set(1, 1, 1)); this.chairMesh.setMatrixAt(cv++, this.m4); }
    }
    this.mesh.count = vis; this.shadows.count = sv; this.chairMesh.count = cv;
    this.mesh.instanceMatrix.needsUpdate = true; this.shadows.instanceMatrix.needsUpdate = true; this.chairMesh.instanceMatrix.needsUpdate = true;
    for (const k in A) A[k].needsUpdate = true;
  }

  nextRoad(p) {
    const r = p.road, end = p.s > r.length ? 'b' : 'a';
    const nodeId = r[end];
    const node = nodeId !== undefined ? this.net.nodes.get(nodeId) : null;
    const opts = node ? node.roads.filter((e) => e.road !== r && this.walkable.includes(e.road)) : [];
    if (!opts.length || R01() < 0.08) { p.dir = -p.dir; p.s = Math.max(0, Math.min(r.length, p.s)); return; }
    const e = opts[(R01() * opts.length) | 0];
    p.road = e.road; p.dir = e.end === 'a' ? 1 : -1; p.s = e.end === 'a' ? 0.5 : e.road.length - 0.5;
  }
}

function wheelchairGeo() {
  const parts = [];
  const add = (g, x, y, z) => { g.translate(x, y, z); parts.push(g.index ? g.toNonIndexed() : g); };
  for (const sx of [-1, 1]) {
    add(new THREE.TorusGeometry(0.3, 0.025, 6, 20).rotateY(Math.PI / 2), sx * 0.3, 0.32, -0.1);
    add(new THREE.TorusGeometry(0.26, 0.012, 4, 20).rotateY(Math.PI / 2), sx * 0.34, 0.32, -0.1);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10).rotateZ(Math.PI / 2), sx * 0.2, 0.06, 0.35);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.6), sx * 0.22, 0.5, 0.05);
    add(new THREE.BoxGeometry(0.03, 0.45, 0.03), sx * 0.22, 0.72, -0.24);
  }
  add(new THREE.BoxGeometry(0.44, 0.05, 0.42), 0, 0.5, 0.02);
  add(new THREE.BoxGeometry(0.42, 0.3, 0.03), 0, 0.78, -0.24);
  add(new THREE.BoxGeometry(0.34, 0.03, 0.14), 0, 0.12, 0.48);
  const out = new THREE.BufferGeometry();
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  for (const [k, sz] of [['position', 3], ['normal', 3]]) { const a = new Float32Array(n * sz); let o = 0; for (const g of parts) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, sz)); }
  return out;
}

function inside(b, p) { return p.x > b.minX + 10 && p.x < b.maxX - 10 && p.z > b.minZ + 10 && p.z < b.maxZ - 10; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R01 = Math.random;
