// FIR VALE — geographic reference data.
//
// Street centre-lines are reconstructed from published postcode / address
// coordinates (ONS postcode centroids as listed on public postcode-lookup
// sites, Open Government Licence) and the published descriptions of which
// streets meet where. Postcode centroids are approximate (tens of metres),
// so this is a faithful-in-spirit layout, not a survey. No map imagery,
// photos or proprietary 3D data were used.
//
// Local frame: origin at 53.4093 N, 1.4500 W. +X = east, -Z = north (metres).
export const ORIGIN = { lat: 53.4093, lon: -1.45 };
const KX = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180), KZ = 111220;
export const ll = (lat, lon) => [+((lon - ORIGIN.lon) * KX).toFixed(1), +(-(lat - ORIGIN.lat) * KZ).toFixed(1)];

// Reference points (lat, lon) used to lay out the streets.
export const REFS = {
  barnsley182: ll(53.401347, -1.463685), barnsley221: ll(53.402402, -1.462528), barnsley253: ll(53.403195, -1.460864),
  barnsley300: ll(53.404051, -1.457378), barnsley507: ll(53.406604, -1.45348), stCuthbert: ll(53.40784, -1.45154),
  barnsley638: ll(53.411739, -1.45209), barnsley830: ll(53.422681, -1.454779),
  herries413: ll(53.412926, -1.47231), ngh: ll(53.41083, -1.45833),
  firthPark97: ll(53.409824, -1.448128), firthPark117: ll(53.410904, -1.446595), firthPark225: ll(53.412102, -1.44509), firthPark451: ll(53.418097, -1.448789),
  pageHall18: ll(53.408943, -1.44805), pageHall90: ll(53.408207, -1.446419),
  hinde1: ll(53.408493, -1.44792), hinde61: ll(53.41039, -1.44609), hinde190: ll(53.413035, -1.442851),
  owler62: ll(53.407817, -1.449448), owler116: ll(53.40724, -1.447214), owler291: ll(53.407699, -1.443463), owler312: ll(53.407263, -1.440625),
  firValeSchool: ll(53.407293, -1.447256), rushby23: ll(53.408048, -1.446918),
  popple25: ll(53.408085, -1.443427), popple84: ll(53.408814, -1.445464),
  wensley99: ll(53.409297, -1.441185), wensley133: ll(53.410907, -1.44139), wensley181: ll(53.412411, -1.440106),
  skinnerthorpe5: ll(53.406967, -1.452332),
};

// The Fir Vale junction: Barnsley Road meets Firth Park Road, Herries Road
// and Owler Lane by St Cuthbert's, opposite the Northern General Hospital.
export const JUNCTION = [-72, 118];

// Roads: centre-line polylines in metres. width = carriageway width.
// kind: 'a' (A-road), 'b' (main), 'r' (residential). frontage: build
// terraces along it. shops: [fromT, toT] fractions along the line with
// shopfronts.
export const ROADS = [
  { name: 'Barnsley Road', ref: 'A6135', kind: 'a', width: 10, pave: 3.2,
    pts: [[-560, 520], [-430, 440], [-231, 300], [-150, 205], JUNCTION], shops: [[0.62, 1]] },
  { name: 'Barnsley Road', ref: 'A6135', kind: 'a', width: 10, pave: 3.2,
    pts: [JUNCTION, [-110, 20], [-130, -130], [-139, -271], [-160, -420], [-190, -560]], frontage: 'east', shops: [[0, 0.12]] },
  { name: 'Herries Road', ref: 'A6102', kind: 'a', width: 10.5, pave: 3,
    pts: [JUNCTION, [-200, 75], [-360, 20], [-520, -45], [-700, -110]], frontage: 'south' },
  { name: 'Firth Park Road', ref: 'B6086', kind: 'b', width: 9, pave: 3,
    pts: [JUNCTION, [30, 25], [124, -58], [226, -178], [327, -312], [380, -420], [360, -560]], shops: [[0, 0.3]] },
  { name: 'Owler Lane', ref: 'A6102', kind: 'a', width: 9.5, pave: 3,
    pts: [JUNCTION, [4, 165], [100, 205], [185, 229], [300, 205], [434, 178], [622, 227], [760, 250]] },
  { name: 'Page Hall Road', kind: 'b', width: 8, pave: 3,
    pts: [[70, -10], [138, 22], [180, 62], [215, 108]], shops: [[0, 1]] },
  { name: 'Rushby Street', ref: 'A6102', kind: 'b', width: 8.5, pave: 2.6,
    pts: [[215, 108], [204, 160], [192, 222]], shops: [[0, 0.6]] },
  { name: 'Hinde House Lane', kind: 'r', width: 7.5, pave: 2.4,
    pts: [[158, 42], [210, -40], [260, -121], [360, -260], [475, -416], [540, -520]], shops: [[0, 0.08]] },
  { name: 'Popple Street', kind: 'r', width: 7, pave: 2.2,
    pts: [[215, 108], [300, 58], [440, 132], [560, 170]] },
  { name: 'Wensley Street', kind: 'r', width: 7, pave: 2.2,
    pts: [[590, 205], [584, 0], [571, -179], [656, -346], [690, -470]] },
  { name: 'Robey Street', kind: 'r', width: 6.5, pave: 2,
    pts: [[282, -150], [400, -150], [478, -118]] },
  { name: 'Hinde Street', kind: 'r', width: 6.5, pave: 2,
    pts: [[380, 100], [412, -30], [478, -118], [520, -250]] },
  { name: 'Skinnerthorpe Road', kind: 'r', width: 7, pave: 2.2,
    pts: [[-196, 258], [-120, 300], [-30, 330], [60, 360]] },
  // unnamed back streets that fill out the terraced grid
  { name: '', kind: 'r', width: 6, pave: 1.8, pts: [[124, -58], [210, -40]] },
  { name: '', kind: 'r', width: 6, pave: 1.8, pts: [[226, -178], [282, -150]] },
  { name: '', kind: 'r', width: 6, pave: 1.8, pts: [[300, 58], [340, -60], [400, -150]] },
  { name: '', kind: 'r', width: 6, pave: 1.8, pts: [[440, 132], [462, 20], [584, 0]] },
  { name: '', kind: 'r', width: 6, pave: 1.8, pts: [[-150, 205], [-60, 250], [-30, 330]] },
];

// Special sites (polygons are rough footprints in metres).
export const SITES = {
  hospital: { name: 'Northern General Hospital', // west of Barnsley Road, north of Herries Road
    poly: [[-160, 20], [-150, -420], [-700, -420], [-700, -125], [-360, -5], [-210, 60]] },
  church: { name: "St Cuthbert's Church", at: [-58, 170], rot: 0.55 },
  school: { name: 'Fir Vale School', poly: [[70, 205], [185, 235], [300, 217], [300, 362], [70, 362]] },
  firthParkShops: { name: 'Fir Vale shops' },
};

// Where things happen in the game.
export const PLACES = {
  spawn: { x: 128, z: -6, yaw: -2.35 },       // Page Hall Road pavement, looking along the shops
  miniMart: { road: 'Page Hall Road', t: 0.42, side: 1 },
  dezPath: [[96, -8], [150, 28], [190, 72]],   // pavement laps outside the Page Hall Road shops
  cansWall: { x0: 116, x1: 168 },               // low wall at the front of Fir Vale School, Owler Lane
  roadworks: { road: 'Owler Lane', t: 0.55 },
  busStops: [{ road: 'Barnsley Road', i: 0, t: 0.8, side: -1 }, { road: 'Herries Road', i: 0, t: 0.25, side: 1 }, { road: 'Firth Park Road', i: 0, t: 0.45, side: 1 }, { road: 'Owler Lane', i: 0, t: 0.3, side: -1 }],
};

// Car routes through the junction (sequences of road polylines, in order).
// Each is driven in both directions; cars appear/disappear at map edges.
export const ROUTES = [
  ['Barnsley Road#0', 'Barnsley Road#1'],
  ['Barnsley Road#0', 'Herries Road#0'],
  ['Herries Road#0~', 'Firth Park Road#0'],
  ['Owler Lane#0~', 'Herries Road#0'],
  ['Barnsley Road#1~', 'Owler Lane#0'],
  ['Firth Park Road#0~', 'Barnsley Road#0~'],
];

export const BOUNDS = { minX: -520, maxX: 720, minZ: -470, maxZ: 420 };
