# Pack a .gltf + .bin (or embedded data URI) into a single .glb.
# Usage: python3 scripts/gir/gltf2glb.py scene.gltf out.glb
import json, struct, sys, base64, os
src, dst = sys.argv[1], sys.argv[2]
J = json.load(open(src))
uri = J['buffers'][0].pop('uri')
BIN = base64.b64decode(uri.split(',', 1)[1]) if uri.startswith('data:') else open(os.path.join(os.path.dirname(src), uri), 'rb').read()
BIN += b'\0' * ((4 - len(BIN) % 4) % 4); J['buffers'][0]['byteLength'] = len(BIN)
js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + BIN)
print(dst, os.path.getsize(dst))
