#!/usr/bin/env python3
"""Download the open data build_map.py needs into DATA (default /tmp/claude-0/ov).

  python3 fetch_overture.py            # all Overture themes + terrain tiles
  python3 build_map.py [DATA]          # -> src/maps/firvale/osm.js

Needs: pip install pyarrow shapely numpy pillow
Overture Maps (https://overturemaps.org) is read anonymously from its public
S3 bucket, filtered to the Fir Vale bounding box via parquet row-group stats.
Terrain: Terrarium PNG tiles from the AWS "Terrain Tiles" open dataset.
"""
import os, sys, math, time, urllib.request
import pyarrow.dataset as ds, pyarrow.fs as fs, pyarrow.compute as pc, pyarrow.parquet as pq
from urllib.parse import urlparse

DATA = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/ov'
RELEASE = os.environ.get('OVERTURE_RELEASE', '2026-08-19.0')
os.makedirs(os.path.join(DATA, 'tiles'), exist_ok=True)

proxy = os.environ.get('HTTPS_PROXY')
opts = {}
if proxy:
    p = urlparse(proxy)
    opts['proxy_options'] = {'scheme': p.scheme, 'host': p.hostname, 'port': p.port or 80}
s3 = fs.S3FileSystem(anonymous=True, region='us-west-2', **opts)
R = f'overturemaps-us-west-2/release/{RELEASE}'
box = (pc.field('bbox', 'xmin') > -1.466) & (pc.field('bbox', 'xmax') < -1.426) & (pc.field('bbox', 'ymin') > 53.399) & (pc.field('bbox', 'ymax') < 53.4235)
for theme, typ, out in [('transportation', 'segment', 'seg'), ('buildings', 'building', 'bld'), ('places', 'place', 'poi'),
                        ('base', 'land_use', 'lu'), ('base', 'land', 'land'), ('base', 'infrastructure', 'infra'), ('base', 'water', 'water')]:
    t = time.time()
    tb = ds.dataset(f'{R}/theme={theme}/type={typ}/', filesystem=s3, format='parquet').to_table(filter=box)
    pq.write_table(tb, os.path.join(DATA, out + '.parquet'))
    print(out, tb.num_rows, f'{time.time() - t:.0f}s')

def tile(lat, lon, z):
    n = 2 ** z; return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
LAT0, LON0 = 53.4093, -1.45
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 111220
for z, (n_, s_, w_, e_) in [(15, (53.4235, 53.399, -1.466, -1.426)), (12, (LAT0 + 8000 / KZ, LAT0 - 8000 / KZ, LON0 - 8000 / KX, LON0 + 8000 / KX))]:
    x0, y0 = tile(n_, w_, z); x1, y1 = tile(s_, e_, z)
    for x in range(int(x0), int(x1) + 1):
        for y in range(int(y0), int(y1) + 1):
            f = os.path.join(DATA, 'tiles', f'{z}_{x}_{y}.png')
            if not os.path.exists(f):
                urllib.request.urlretrieve(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', f)
print('tiles ok')
