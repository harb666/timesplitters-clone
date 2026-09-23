#!/usr/bin/env python3
"""Turn open map data for Fir Vale into src/maps/firvale/osm.js.

Inputs (fetched by fetch_overture.py / the tile download below into DATA):
  * Overture Maps release parquet extracts: seg (roads), bld (buildings),
    poi (places), lu (land use), land (woods/trees), infra (street furniture)
    -- Overture Maps Foundation, derived from OpenStreetMap (ODbL,
    (c) OpenStreetMap contributors) and other open sources.
  * Terrarium elevation tiles (AWS open data "Terrain Tiles", Mapzen;
    SRTM / public-domain sources) for the ground heights.

Output: a compact JS module (metres, local frame: origin 53.4093 N 1.45 W,
+X east, -Z north) that the game builds its scenery from.
Real business names are NOT exported -- only the category of shop at each
spot; the game invents its own shop names.
"""
import sys, os, math, json, base64, collections
import numpy as np, pyarrow.parquet as pq, shapely.wkb as W
from shapely.geometry import Polygon, LineString, box as sbox
from shapely.ops import unary_union, substring
from PIL import Image

DATA = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/ov'
OUT = os.path.join(os.path.dirname(__file__), '../../src/maps/firvale/osm.js')
LAT0, LON0 = 53.4093, -1.45
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 111220
B = dict(minX=-620, maxX=800, minZ=-520, maxZ=460)       # playable area
PAD = 160                                                  # scenery beyond the edge
def loc(lon, lat): return ((lon - LON0) * KX, -(lat - LAT0) * KZ)
def inb(x, z, pad=0): return B['minX'] - pad < x < B['maxX'] + pad and B['minZ'] - pad < z < B['maxZ'] + pad
def rd(v): return round(v, 1)
def flat(coords): return [rd(c) for p in coords for c in p]
def tolocal(g):
    from shapely.ops import transform
    return transform(lambda x, y, z=None: loc(x, y), g)
rows = lambda f: pq.read_table(os.path.join(DATA, f + '.parquet')).to_pylist()
area = sbox(B['minX'] - PAD, B['minZ'] - PAD, B['maxX'] + PAD, B['maxZ'] + PAD)

# ------------------------------------------------------------------ roads
WIDTH = {'motorway': 11, 'trunk': 11, 'primary': 10, 'secondary': 9, 'tertiary': 8, 'residential': 7, 'unclassified': 6.5,
         'living_street': 6, 'service': 4.2, 'track': 3, 'footway': 2, 'path': 1.8, 'cycleway': 2.2, 'steps': 2, 'pedestrian': 4, 'unknown': 5}
PAVE = {'primary': 3.2, 'secondary': 3, 'tertiary': 2.8, 'residential': 2, 'unclassified': 1.8, 'living_street': 1.5}
roads, nodes = [], {}
for r in rows('seg'):
    if r['subtype'] != 'road' or r['class'] not in WIDTH: continue
    full = tolocal(W.loads(r['geometry']))
    if not full.intersects(area): continue
    name = (r['names'] or {}).get('primary') or ''
    cons = sorted((c['at'], c['connector_id']) for c in (r['connectors'] or []))
    cuts = sorted(set([0.0, 1.0] + [a for a, _ in cons]))
    nid = lambda t: next((nodes.setdefault(cid, len(nodes)) for a, cid in cons if abs(a - t) < 1e-6), None)
    fl = r.get('road_flags') or []
    bridge = any('is_bridge' in (f.get('values') or []) for f in fl)
    for a, b in zip(cuts, cuts[1:]):
        sub = substring(full, a, b, normalized=True)
        if sub.length < 0.5: continue
        g = sub.intersection(area)
        for q in ([g] if g.geom_type == 'LineString' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'LineString']):
            if q.length < 0.5: continue
            e = dict(n=name, c=r['class'], p=flat(list(q.coords)))
            from shapely.geometry import Point
            if Point(q.coords[0]).distance(Point(sub.coords[0])) < 0.01 and nid(a) is not None: e['a'] = nid(a)
            if Point(q.coords[-1]).distance(Point(sub.coords[-1])) < 0.01 and nid(b) is not None: e['b'] = nid(b)
            if bridge: e['br'] = 1
            roads.append(e)
print('road pieces', len(roads), 'nodes', len(nodes))

# chain pieces into longer ways through nodes where exactly two pieces of the
# same street meet (smoother curves, continuous kerbs)
def pts_of(e): return [(e['p'][i], e['p'][i + 1]) for i in range(0, len(e['p']), 2)]
inc = collections.defaultdict(list)
for i, e in enumerate(roads):
    for end in 'ab':
        if end in e: inc[e[end]].append(i)
used, ways = set(), []
def key(e): return (e['n'], e['c'], e.get('br', 0))
for i, e in enumerate(roads):
    if i in used: continue
    used.add(i); P = pts_of(e); A, Bn = e.get('a'), e.get('b')
    for forward in (True, False):
        while True:
            nd = Bn if forward else A
            if nd is None: break
            cand = [j for j in inc[nd] if j not in used]
            if len(inc[nd]) != 2 or len(cand) != 1 or key(roads[cand[0]]) != key(e): break
            j = cand[0]; used.add(j); f = roads[j]; Q = pts_of(f)
            if forward:
                if f.get('a') == nd: P += Q[1:]; Bn = f.get('b')
                else: P += Q[::-1][1:]; Bn = f.get('a')
            else:
                if f.get('b') == nd: P = Q[:-1] + P; A = f.get('a')
                else: P = Q[::-1][:-1] + P; A = f.get('b')
    w = dict(n=e['n'], c=e['c'], p=flat(P))
    if A is not None: w['a'] = A
    if Bn is not None: w['b'] = Bn
    if e.get('br'): w['br'] = 1
    ways.append(w)
# drop footways that are just the pavement of a street (drawn by the game)
CAR = {'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service'}
carbuf = unary_union([LineString(pts_of(w)).buffer(WIDTH[w['c']] / 2 + PAVE.get(w['c'], 0.5) + 2.5) for w in ways if w['c'] in CAR])
keep = []
for w in ways:
    if w['c'] in ('footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'):
        L = LineString(pts_of(w))
        if L.length < 4 or L.intersection(carbuf).length > 0.6 * L.length: continue
    keep.append(w)
roads = keep
print('ways', len(roads), collections.Counter(w['c'] for w in roads))

# ------------------------------------------------------------------ buildings
bld = []
for r in rows('bld'):
    g = tolocal(W.loads(r['geometry']))
    if g.geom_type == 'MultiPolygon': g = max(g.geoms, key=lambda q: q.area)
    c = g.centroid
    if not inb(c.x, c.y, PAD) or g.area < 6: continue
    g = g.simplify(0.25)
    ring = list(g.exterior.coords)[:-1]
    if Polygon(ring).exterior.is_ccw: ring = ring[::-1]         # clockwise in x/z-as-y => CCW seen from above (+Y)
    e = dict(p=flat(ring))
    if r['class']: e['c'] = r['class']
    if r['height']: e['h'] = rd(r['height'])
    if r['num_floors']: e['l'] = int(r['num_floors'])
    if r['roof_shape']: e['r'] = r['roof_shape']
    nm = (r['names'] or {}).get('primary')
    if nm and r['class'] in ('church', 'chapel', 'mosque', 'school', 'hospital'): e['n'] = nm
    bld.append(e)
print('buildings', len(bld))

# how far the building fronts are from each street's centre-line (so the
# game can fit carriageway + pavements between the real house fronts)
from shapely.strtree import STRtree
from shapely.geometry import Point
bpolys = [Polygon([(e['p'][i], e['p'][i + 1]) for i in range(0, len(e['p']), 2)]) for e in bld]
tree = STRtree(bpolys)
for w in roads:
    if w['c'] not in CAR: continue
    L = LineString(pts_of(w)); ds = []
    for k in range(int(L.length // 6) + 1):
        p = L.interpolate(min(L.length, k * 6 + 3))
        near = tree.query(p.buffer(20))
        if len(near): 
            d = min(bpolys[i].distance(p) for i in near)
            if d < 20: ds.append(d)
    if len(ds) >= 2: w['fw'] = rd(float(np.percentile(ds, 30)))

# ------------------------------------------------------------------ shops (categories only)
SHOPCAT = {
    'convenience_store': 'grocer', 'grocery_store': 'grocer', 'shopping': 'bargain', 'home_goods_store': 'bargain', 'hardware_store': 'hardware',
    'bakery': 'bakery', 'desserts': 'sweets', 'cafe': 'cafe', 'food': 'cafe', 'fast_food_restaurant': 'takeaway', 'doner_kebab': 'kebab',
    'pizza_restaurant': 'pizza', 'chicken_restaurant': 'chicken', 'barbecue_restaurant': 'grill', 'restaurant': 'grill', 'ice_cream_shop': 'sweets',
    'malaysian_restaurant': 'grill', 'pharmacy': 'pharmacy', 'mobile_phone_store': 'phones', 'it_service_and_computer_repair': 'phones',
    'clothing_store': 'fashion', 'womens_clothing_store': 'fashion', 'jewelry_store': 'jeweller', 'jewelry_and_watches_manufacturer': 'jeweller',
    'travel_agents': 'travel', 'travel_services': 'travel', 'money_transfer_services': 'money', 'banks': 'money', 'financial_service': 'money', 'atms': 'money',
    'betting_center': 'bookie', 'hair_salon': 'salon', 'beauty_salon': 'salon', 'barber': 'barber', 'spas': 'salon', 'real_estate_agent': 'estate',
    'property_management': 'estate', 'lawyer': 'office', 'professional_services': 'office', 'furniture_store': 'furniture', 'laundromat': 'laundry',
    'sewing_and_alterations': 'tailor', 'wedding_planning': 'fashion', 'dentist': 'dentist', 'general_dentistry': 'dentist', 'family_practice': 'doctor',
    'community_center': 'community', 'rental_kiosks': None, 'package_locker': None, 'gas_station': 'petrol', 'courier_and_delivery_services': 'office',
}
pois = []
for r in rows('poi'):
    cat = (r['categories'] or {}).get('primary')
    k = SHOPCAT.get(cat)
    if not k or (r['confidence'] or 0) < 0.3: continue
    g = tolocal(W.loads(r['geometry']))
    if not inb(g.x, g.y, 20): continue
    pois.append([rd(g.x), rd(g.y), k])
print('shops', len(pois), collections.Counter(p[2] for p in pois).most_common())

# ------------------------------------------------------------------ land use / greenery
LUK = {'grass': 'grass', 'pitch': 'pitch', 'playground': 'play', 'school': 'school', 'park': 'park', 'religious': 'churchyard', 'allotments': 'allot',
       'garden': 'grass', 'recreation_ground': 'grass', 'brownfield': 'rough', 'construction': 'rough', 'grave_yard': 'churchyard', 'hospital': 'hospital',
       'retail': 'paved', 'commercial': 'paved', 'industrial': 'paved', 'works': 'paved', 'nature_reserve': 'wood', 'college': 'school', 'doctors': 'paved'}
lu = []
def polys(g):
    return [g] if g.geom_type == 'Polygon' else [q for q in getattr(g, 'geoms', []) if q.geom_type == 'Polygon']
for r in rows('lu') + rows('land'):
    k = LUK.get(r['class']) or {'wood': 'wood', 'scrub': 'scrub', 'tree': 'tree', 'grassland': 'grass'}.get(r['class'])
    if not k: continue
    g = tolocal(W.loads(r['geometry']))
    if g.geom_type == 'Point':
        if inb(g.x, g.y, PAD): lu.append(dict(k='tree1', p=[rd(g.x), rd(g.y)]))
        continue
    g = g.intersection(area)
    for q in polys(g):
        if q.area < 20: continue
        q = q.simplify(0.8)
        e = dict(k=k, p=flat(list(q.exterior.coords)[:-1]))
        nm = (r.get('names') or {}).get('primary') if 'names' in r else None
        if nm and k in ('school', 'park', 'hospital'): e['n'] = nm
        lu.append(e)
print('landuse', len(lu), collections.Counter(e['k'] for e in lu))

# ------------------------------------------------------------------ street furniture
INF = {'bus_stop': 'bus', 'traffic_signals': 'signal', 'crossing': 'crossing', 'bench': 'bench', 'post_box': 'postbox', 'waste_basket': 'bin',
       'bollard': 'bollard', 'wall': 'wall', 'fence': 'fence', 'hedge': 'hedge', 'retaining_wall': 'wall', 'parking': 'parking', 'give_way': 'giveway'}
furn = []
for r in rows('infra'):
    k = INF.get(r['class'])
    if not k: continue
    g = tolocal(W.loads(r['geometry'])).intersection(area)
    if g.is_empty: continue
    if g.geom_type == 'Point': furn.append(dict(k=k, p=[rd(g.x), rd(g.y)]))
    elif g.geom_type in ('LineString', 'MultiLineString'):
        for q in ([g] if g.geom_type == 'LineString' else g.geoms): furn.append(dict(k=k, p=flat(list(q.simplify(0.3).coords))))
    elif k == 'parking':
        for q in polys(g):
            if q.area > 30: furn.append(dict(k='parking', p=flat(list(q.simplify(0.5).exterior.coords)[:-1])))
print('furniture', len(furn), collections.Counter(e['k'] for e in furn))

# ------------------------------------------------------------------ elevation
def tilexy(lat, lon, z):
    n = 2 ** z; return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
Z = 15; tiles = {}
def elev_at(lat, lon, Z=15):
    fx, fy = tilexy(lat, lon, Z); tx, ty = int(fx), int(fy)
    key = (Z, tx, ty)
    if key not in tiles:
        a = np.asarray(Image.open(os.path.join(DATA, 'tiles', f'{Z}_{tx}_{ty}.png')).convert('RGB')).astype(np.float64)
        tiles[key] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
    a = tiles[key]; px, py = (fx - tx) * 256 - 0.5, (fy - ty) * 256 - 0.5
    x0, y0 = int(math.floor(px)), int(math.floor(py)); u, v = px - x0, py - y0
    x0, y0 = max(0, min(254, x0)), max(0, min(254, y0))
    return a[y0, x0] * (1 - u) * (1 - v) + a[y0, x0 + 1] * u * (1 - v) + a[y0 + 1, x0] * (1 - u) * v + a[y0 + 1, x0 + 1] * u * v
STEP = 8
hx0, hz0 = B['minX'] - PAD - 40, B['minZ'] - PAD - 40
nx, nz = int((B['maxX'] + PAD + 40 - hx0) / STEP) + 1, int((B['maxZ'] + PAD + 40 - hz0) / STEP) + 1
H = np.zeros((nz, nx))
for j in range(nz):
    for i in range(nx):
        x, z = hx0 + i * STEP, hz0 + j * STEP
        H[j, i] = elev_at(LAT0 - z / KZ, LON0 + x / KX)
# smooth out SRTM speckle (buildings/trees in the radar data) with a small blur
def blur(a, r):
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * (r / 2) ** 2)); k /= k.sum()
    a = np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='edge'), k, 'valid'), 1, a)
    return np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='edge'), k, 'valid'), 0, a)
H = blur(H, 3)
base = float(np.round(H[(0 - hz0) // STEP, (0 - hx0) // STEP]))
print('height range', H.min(), H.max(), 'origin', base)
Hq = np.round((H - base) * 10).astype('<i2')
height = dict(x0=hx0, z0=hz0, step=STEP, nx=nx, nz=nz, base=base, d=base64.b64encode(Hq.tobytes()).decode())

# far-field terrain (the hills around the district, out to 8 km) at 100 m
FS, FR = 100, 8000
fn = 2 * FR // FS + 1
FH = np.zeros((fn, fn))
for j in range(fn):
    for i in range(fn):
        x, z = -FR + i * FS, -FR + j * FS
        FH[j, i] = elev_at(LAT0 - z / KZ, LON0 + x / KX, 12)
FH = blur(FH, 1)
far = dict(x0=-FR, z0=-FR, step=FS, nx=fn, nz=fn, d=base64.b64encode(np.round((FH - base) * 2).astype('<i2').tobytes()).decode())
print('far range', FH.min(), FH.max())
data = dict(bounds=B, roads=roads, buildings=bld, shops=pois, landuse=lu, furniture=furn, height=height, far=far)
src = ('// GENERATED by scripts/import-map/build_map.py -- do not edit by hand.\n'
       '// Fir Vale, Sheffield: street centre-lines, building footprints, land use,\n'
       '// street furniture and shop *categories* from Overture Maps (derived from\n'
       '// OpenStreetMap, (c) OpenStreetMap contributors, ODbL) and ground heights\n'
       '// from the open Terrain Tiles (Mapzen / AWS open data, SRTM).\n'
       '// Metres; origin 53.4093 N 1.45 W; +X east, -Z north.\n'
       'export default ' + json.dumps(data, separators=(',', ':')) + ';\n')
open(OUT, 'w').write(src)
print('wrote', OUT, len(src) // 1024, 'KB')
