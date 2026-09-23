// Rotating minimap with real street names, drawn from the road data.
// The street map is painted once; each update just crops/rotates it.
const PX = 0.5; // pixels per metre on the pre-rendered map

export class Minimap {
  constructor(map) {
    this.el = document.getElementById('minimap');
    this.ctx = this.el.getContext('2d');
    const b = map.bounds, pad = 120;
    this.b = { minX: b.minX - pad, minZ: b.minZ - pad, maxX: b.maxX + pad, maxZ: b.maxZ + pad };
    const W = Math.ceil((this.b.maxX - this.b.minX) * PX), H = Math.ceil((this.b.maxZ - this.b.minZ) * PX);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const X = (x) => (x - this.b.minX) * PX, Z = (z) => (z - this.b.minZ) * PX;
    g.fillStyle = '#2b3228'; g.fillRect(0, 0, W, H);
    // hospital + school sites
    const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.fill(); };
    if (map.sites) { poly(map.sites.hospital.poly, '#3f4a57'); poly(map.sites.school.poly, '#3c5a36'); }
    // roads: casing then fill
    const roads = map.net.roads;
    for (const pass of [0, 1]) for (const r of roads) {
      g.strokeStyle = pass ? (r.kind === 'a' ? '#f2c14e' : r.kind === 'b' ? '#f0e6c8' : '#d9d9d9') : '#111';
      g.lineWidth = (r.width + (pass ? 0 : 3)) * PX * 1.3; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); r.samples.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.stroke();
    }
    this.labels = [];
    for (const r of roads) if (r.name) {
      const p = r.samples[Math.floor(r.samples.length * 0.5)];
      this.labels.push({ name: r.name, x: p.x, z: p.z, a: Math.atan2(p.tz, p.tx) });
    }
    if (map.sites) this.labels.push({ name: 'Northern General', x: -380, z: -200, a: 0, site: true }, { name: 'Fir Vale School', x: 185, z: 300, a: 0, site: true }, { name: "St Cuthbert's", x: map.sites.church.at[0], z: map.sites.church.at[1], a: 0, site: true });
    this.base = c; this.X = X; this.Z = Z; this.t = 0;
  }

  update(player, cars, dez) {
    this.t -= 1; if (this.t > 0) return; this.t = 4; // ~15 fps is plenty
    const g = this.ctx, S = this.el.width, R = S / 2, zoom = 1.5;
    g.save(); g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2b3228'; g.fillRect(0, 0, S, S);
    // rotate so the view direction is up
    const yaw = player.yaw;
    g.translate(R, R); g.rotate(yaw); g.scale(zoom, zoom);
    g.drawImage(this.base, -this.X(player.pos.x), -this.Z(player.pos.z));
    // street names (kept upright)
    g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const L of this.labels) {
      const lx = this.X(L.x) - this.X(player.pos.x), lz = this.Z(L.z) - this.Z(player.pos.z);
      if (Math.abs(lx) > 90 || Math.abs(lz) > 90) continue;
      g.save(); g.translate(lx, lz);
      let a = L.a + yaw; while (a > Math.PI / 2) a -= Math.PI; while (a < -Math.PI / 2) a += Math.PI;
      g.rotate(L.site ? -yaw : a - yaw);
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(L.name, 0, 0); g.fillStyle = L.site ? '#bfe3ff' : '#fff'; g.fillText(L.name, 0, 0);
      g.restore();
    }
    // cars & Dez
    const dot = (x, z, col, r = 2.5) => { g.fillStyle = col; g.beginPath(); g.arc(this.X(x) - this.X(player.pos.x), this.Z(z) - this.Z(player.pos.z), r, 0, 7); g.fill(); };
    for (const c of cars) if (c.car.visible) dot(c.x, c.z, '#ff5a5a');
    if (dez) dot(dez.x, dez.z, '#ffb400', 3);
    g.restore();
    // player arrow (always centre, pointing up)
    g.fillStyle = '#2fd3c5'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(R, R - 8); g.lineTo(R + 5.5, R + 6); g.lineTo(R, R + 3); g.lineTo(R - 5.5, R + 6); g.closePath(); g.fill(); g.stroke();
    // north marker on the rim
    const na = yaw - Math.PI / 2;
    g.fillStyle = '#fff'; g.font = 'bold 10px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', R + Math.cos(na) * (R - 9), R + Math.sin(na) * (R - 9));
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.stroke();
  }
}
