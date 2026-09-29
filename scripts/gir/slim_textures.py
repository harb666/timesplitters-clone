# Shrink the textures inside a .glb for phones: every image re-encoded as JPEG
# no bigger than MAX px (colour, normal and metal/rough maps all survive JPEG
# fine at this size), unused texture data dropped.
# Usage: python3 scripts/gir/slim_textures.py in.glb out.glb [MAX=1024]
import json, struct, io, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + jl])
o = 20 + jl; bl = struct.unpack('<I', b[o:o + 4])[0]; BIN = b[o + 8:o + 8 + bl]
views = [BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in J['bufferViews']]
for i, im in enumerate(J.get('images', [])):
    I = Image.open(io.BytesIO(views[im['bufferView']])).convert('RGB'); I.thumbnail((MAX, MAX), Image.LANCZOS)
    out = io.BytesIO(); I.save(out, 'JPEG', quality=86, optimize=True)
    print('image', i, I.size, len(views[im['bufferView']]), '->', out.tell())
    views[im['bufferView']] = out.getvalue(); im['mimeType'] = 'image/jpeg'
out = bytearray()
for i, v in enumerate(J['bufferViews']):
    while len(out) % 4: out.append(0)
    v['byteOffset'] = len(out); v['byteLength'] = len(views[i]); out += views[i]
while len(out) % 4: out.append(0)
J['buffers'][0]['byteLength'] = len(out)
js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out))
print(dst, 28 + len(js) + len(out))
