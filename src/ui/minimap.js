// Rotating minimap with real street names, drawn from the road data.
// The street map is painted once; each update just crops/rotates it.
const PX = 1; // pixels per metre on the pre-rendered map

export class Minimap {
  constructor(map) {
    this.el = document.getElementById('minimap');
    this.ctx = this.el.getContext('2d');
    const b = map.bounds, pad = 120;
    this.b = { minX: b.minX - pad, minZ: b.minZ - pad, maxX: b.maxX + pad, maxZ: b.maxZ + pad };
    const W = Math.ceil((this.b.maxX - this.b.minX) * PX), H = Math.ceil((this.b.maxZ - this.b.minZ) * PX);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const X = (x) => (x - this.b.minX) * PX, Z = (z) => (z - this.b.minZ) * PX;
    g.fillStyle = '#34372f'; g.fillRect(0, 0, W, H);
    const poly = (f, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < f.length; i += 2) (i ? g.lineTo(X(f[i]), Z(f[i + 1])) : g.moveTo(X(f[i]), Z(f[i + 1]))); g.closePath(); g.fill(); };
    const GREEN = { grass: '#3f5a36', park: '#3f5f36', pitch: '#447040', wood: '#2f4a2c', scrub: '#3a4e30', churchyard: '#3c5636', allot: '#4a5a34', tree: '#35502f' };
    for (const l of map.landuse || []) if (GREEN[l.k] && l.p.length >= 6) poly(l.p, GREEN[l.k]);
    // real building footprints
    for (const b of map.buildings || []) { const f = b.b.p; poly(f, b.type === 'hospital' ? '#5b6573' : b.type === 'school' ? '#6b5f55' : '#7a6a5e'); }
    // roads: casing then fill
    const roads = map.net.roads;
    const COL = { a: '#f2c14e', b: '#f0e6c8', r: '#d9d9d9', s: '#a9a9a9', f: '#c9b8a0' };
    for (const pass of [0, 1]) for (const r of roads) {
      if (r.kind === 'f' && !pass) continue;
      g.strokeStyle = pass ? COL[r.kind] : '#111';
      g.lineWidth = r.kind === 'f' ? 1 : (r.width + (pass ? 0 : 3)) * PX * 1.3; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); r.samples.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.stroke();
    }
    // shops
    for (const s of map.shopSpots || []) { g.fillStyle = s.miniMart ? '#2fd37a' : '#e0a040'; g.beginPath(); g.arc(X(s.x), Z(s.z), 1.6, 0, 7); g.fill(); }
    this.labels = [];
    const placed = [];
    for (const r of [...roads].sort((a, b) => b.length - a.length)) if (r.name && r.kind !== 'f' && r.kind !== 's' && r.length > 40) {
      const p = r.samples[Math.floor(r.samples.length * 0.5)];
      if (placed.some((q) => q.name === r.name && Math.hypot(q.x - p.x, q.z - p.z) < 160)) continue;
      const L = { name: r.name, x: p.x, z: p.z, a: Math.atan2(p.tz, p.tx) };
      this.labels.push(L); placed.push(L);
    }
    this.base = c; this.X = X; this.Z = Z; this.t = 0;
  }

  update(player, cars, dez, target) {
    this.t -= 1; if (this.t > 0) return; this.t = 4; // ~15 fps is plenty
    const g = this.ctx, S = this.el.width, R = S / 2, zoom = 0.75;
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
      if (Math.abs(lx) > 180 || Math.abs(lz) > 180) continue;
      g.save(); g.translate(lx, lz);
      let a = L.a + yaw; while (a > Math.PI / 2) a -= Math.PI; while (a < -Math.PI / 2) a += Math.PI;
      g.rotate(L.site ? -yaw : a - yaw);
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(L.name, 0, 0); g.fillStyle = L.site ? '#bfe3ff' : '#fff'; g.fillText(L.name, 0, 0);
      g.restore();
    }
    // cars & Dez
    const dot = (x, z, col, r = 5) => { g.fillStyle = col; g.beginPath(); g.arc(this.X(x) - this.X(player.pos.x), this.Z(z) - this.Z(player.pos.z), r, 0, 7); g.fill(); };
    for (const c of cars) if (c.car.visible) dot(c.x, c.z, '#ff5a5a');
    if (dez) dot(dez.x, dez.z, '#ffb400', 6);
    g.restore();
    // objective marker (clamped to the rim when off the map)
    if (target) {
      const dx = (target[0] - player.pos.x) * PX * zoom, dz = (target[1] - player.pos.z) * PX * zoom;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      let mx = dx * c - dz * s, mz = dx * s + dz * c; const l = Math.hypot(mx, mz), lim = R - 10;
      if (l > lim) { mx *= lim / l; mz *= lim / l; }
      g.fillStyle = '#2fe0c8'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(R + mx, R + mz, 6, 0, 7); g.fill(); g.stroke();
    }
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
