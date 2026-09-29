// Turn a binary .glb into a self-contained glTF JSON (buffer embedded as
// base64) so it can be served where .glb files can't (e.g. artifacts).
// Usage: node scripts/gir/glb2json.mjs in.glb out.json
import fs from 'node:fs';
const [inp, out] = process.argv.slice(2);
const b = fs.readFileSync(inp);
if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
let o = 12, json = null, bin = null;
while (o < b.length) {
  const len = b.readUInt32LE(o), type = b.readUInt32LE(o + 4), data = b.subarray(o + 8, o + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
  o += 8 + len;
}
json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
fs.writeFileSync(out, JSON.stringify(json));
console.log(out, fs.statSync(out).size, 'bytes');
