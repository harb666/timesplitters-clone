// Shootable props: tin cans on the rec wall and traffic cones. Very simple
// physics (gravity, bounce, spin) — just enough to be satisfying.
import * as THREE from 'three';
import { groundHeight as G } from '../core/world.js';
import { sfx } from '../audio/audio.js';

let geos = null;
function assets() {
  if (geos) return geos;
  const cone = new THREE.ConeGeometry(0.2, 0.62, 8); cone.translate(0, 0.31 + 0.04, 0);
  const coneBase = new THREE.BoxGeometry(0.42, 0.05, 0.42); coneBase.translate(0, 0.025, 0);
  const coneBand = new THREE.CylinderGeometry(0.11, 0.14, 0.1, 8); coneBand.translate(0, 0.33, 0);
  const can = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10); can.translate(0, 0.1, 0);
  geos = {
    cone, coneBase, coneBand, can,
    coneMat: new THREE.MeshLambertMaterial({ color: 0xff5a14 }),
    whiteMat: new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }),
    blackMat: new THREE.MeshLambertMaterial({ color: 0x1b1b1b }),
    canMats: [0xd62828, 0x2a9df4, 0x3bb54a, 0xf2c14e, 0xb0b0b0].map((c) => new THREE.MeshLambertMaterial({ color: c })),
  };
  return geos;
}

export class Props {
  constructor(scene, spots) {
    const A = assets();
    this.list = [];
    for (const s of spots) {
      const g = new THREE.Group();
      let radius, points, kind = s.type;
      if (kind === 'cone') {
        g.add(new THREE.Mesh(A.cone, A.coneMat), new THREE.Mesh(A.coneBase, A.blackMat), new THREE.Mesh(A.coneBand, A.whiteMat));
        radius = 0.3; points = 10;
      } else {
        g.add(new THREE.Mesh(A.can, A.canMats[(Math.random() * A.canMats.length) | 0]));
        radius = 0.14; points = 25;
      }
      const y = s.y ?? G(s.x, s.z);
      g.position.set(s.x, y, s.z);
      scene.add(g);
      this.list.push({ kind, tag: s.tag, mesh: g, pos: g.position, vel: new THREE.Vector3(), spin: new THREE.Vector3(), radius, points, rest: true, restY: y, hitOnce: false, home: new THREE.Vector3(s.x, y, s.z), respawn: 0 });
    }
    this.tmp = new THREE.Vector3();
  }

  // Ray vs sphere test for bullets. Returns {prop, dist} or null.
  raycast(origin, dir, maxDist) {
    let best = null, bestD = maxDist;
    for (const p of this.list) {
      if (!p.mesh.visible) continue;
      const c = this.tmp.copy(p.pos); c.y += p.kind === 'cone' ? 0.3 : 0.1;
      const ox = c.x - origin.x, oy = c.y - origin.y, oz = c.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bestD) continue;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      const r = p.radius + 0.06; // a little generous for touch aiming
      if (d2 < r * r) { bestD = t; best = p; }
    }
    return best ? { prop: best, dist: bestD } : null;
  }

  hit(p, dir, power = 1) {
    p.rest = false;
    p.vel.set(dir.x * 6 * power + (Math.random() - 0.5) * 2, 3.5 + Math.random() * 3, dir.z * 6 * power + (Math.random() - 0.5) * 2);
    p.spin.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 20);
    if (p.kind === 'can') sfx.canHit(p.pos.x, p.pos.y, p.pos.z); else sfx.coneHit(p.pos.x, p.pos.y, p.pos.z);
    const first = !p.hitOnce; p.hitOnce = true; p.everHit = true; p.respawn = 25;
    return first ? p.points : 0;
  }

  update(dt) {
    for (const p of this.list) {
      if (p.rest) {
        if (p.hitOnce) { p.respawn -= dt; if (p.respawn <= 0) this.reset(p); }
        continue;
      }
      p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      const gy = G(p.pos.x, p.pos.z);
      if (p.pos.y < gy) {
        p.pos.y = gy;
        const impact = Math.abs(p.vel.y);
        p.vel.y = impact * 0.35; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.6);
        sfx.clatter(p.pos.x, p.pos.y, p.pos.z, impact / 8);
        if (impact < 1.2 && Math.hypot(p.vel.x, p.vel.z) < 0.5) {
          p.rest = true; p.vel.set(0, 0, 0);
          // lie on its side
          p.mesh.rotation.set(Math.PI / 2, p.mesh.rotation.y, 0);
          p.pos.y = gy + (p.kind === 'can' ? 0.06 : 0.2);
        }
      }
    }
  }

  reset(p) {
    p.pos.copy(p.home); p.mesh.rotation.set(0, 0, 0); p.hitOnce = false; p.rest = true;
  }
}
