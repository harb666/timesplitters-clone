# Shrink the textures inside a .glb for phones: every image re-encoded as JPEG
# no bigger than MAX px (colour, normal and metal/rough maps all survive JPEG
# fine at this size), unused texture data dropped.
# Usage: python3 scripts/gir/slim_textures.py in.glb out.glb [MAX=1024] [--external=dir/prefix]
#   --external: write the images as separate .jpg files instead and record in
#   each material's extras which file is which map (some hosts block the
#   blob/fetch route the glTF loader uses for embedded images).
import json, struct, io, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
args = [a for a in sys.argv[3:] if not a.startswith('--')]
MAX = int(args[0]) if args else 1024
EXT = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--external=')), None)
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + jl])
o = 20 + jl; bl = struct.unpack('<I', b[o:o + 4])[0]; BIN = b[o + 8:o + 8 + bl]
views = [BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in J['bufferViews']]
for i, im in enumerate(J.get('images', [])):
    I = Image.open(io.BytesIO(views[im['bufferView']])).convert('RGB'); I.thumbnail((MAX, MAX), Image.LANCZOS)
    out = io.BytesIO(); I.save(out, 'JPEG', quality=86, optimize=True)
    print('image', i, I.size, len(views[im['bufferView']]), '->', out.tell())
    views[im['bufferView']] = out.getvalue(); im['mimeType'] = 'image/jpeg'
if EXT:
    import os
    names = []
    for i, im in enumerate(J['images']):
        fn = f'{EXT}-{i}.jpg'; open(fn, 'wb').write(views[im['bufferView']]); names.append(os.path.basename(fn)); views[im['bufferView']] = b''
    src_of = lambda ti: names[J['textures'][ti]['source']]
    for m in J['materials']:
        pbr = m.get('pbrMetallicRoughness', {}); ex = {}
        if 'baseColorTexture' in pbr: ex['map'] = src_of(pbr.pop('baseColorTexture')['index'])
        if 'metallicRoughnessTexture' in pbr: ex['metalRough'] = src_of(pbr.pop('metallicRoughnessTexture')['index']); pbr['metallicFactor'] = 1; pbr['roughnessFactor'] = 1
        if 'normalTexture' in m: ex['normal'] = src_of(m.pop('normalTexture')['index'])
        if 'occlusionTexture' in m: ex['ao'] = src_of(m.pop('occlusionTexture')['index'])
        m.setdefault('extras', {})['textures'] = ex
    for k in ('images', 'textures', 'samplers'): J.pop(k, None)
    print('external', names)
out = bytearray()
for i, v in enumerate(J['bufferViews']):
    while len(out) % 4: out.append(0)
    v['byteOffset'] = len(out); v['byteLength'] = len(views[i]); out += views[i]
while len(out) % 4: out.append(0)
J['buffers'][0]['byteLength'] = len(out)
js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out))
print(dst, 28 + len(js) + len(out))
