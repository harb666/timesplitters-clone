// Terrain height + simple box collision. Kept deliberately cheap for phones:
// everything solid is an axis-aligned box (AABB).

// Fir Vale sits on a hillside: the main road climbs gently towards the north
// (-Z in this game) and the ground drops away to the east (+X), which gives
// the stepped terraces that are typical of north Sheffield.
export function groundHeight(x, z) {
  return -z * 0.045 - x * 0.012 + Math.sin(z * 0.03) * 0.6;
}

export class World {
  constructor() {
    this.boxes = [];      // { minX, maxX, minY, maxY, minZ, maxZ, tag, owner }
    this.dynamic = [];    // boxes that move (cars) — rebuilt each frame by owners
  }

  addBox(minX, maxX, minY, maxY, minZ, maxZ, tag = 'static', owner = null) {
    const b = { minX, maxX, minY, maxY, minZ, maxZ, tag, owner };
    this.boxes.push(b);
    return b;
  }

  // Box centred on (x,z) standing on the ground at that point.
  addFootprint(x, z, w, d, h, tag, owner, baseOffset = 0) {
    const g = groundHeight(x, z) + baseOffset;
    return this.addBox(x - w / 2, x + w / 2, g - 2, g + h, z - d / 2, z + d / 2, tag, owner);
  }

  *allBoxes() {
    yield* this.boxes;
    yield* this.dynamic;
  }

  // Highest surface under a point that the player could stand on, given
  // their feet are at `feetY` and they can step up `step` metres.
  floorAt(x, z, feetY, step, radius = 0) {
    let y = groundHeight(x, z);
    for (const b of this.allBoxes()) {
      if (x + radius <= b.minX || x - radius >= b.maxX || z + radius <= b.minZ || z - radius >= b.maxZ) continue;
      if (b.maxY <= feetY + step && b.maxY > y) y = b.maxY;
    }
    return y;
  }

  // Push a vertical cylinder out of every box it overlaps (XZ plane only).
  collideCylinder(pos, radius, feetY, height, step) {
    let hit = null;
    for (const b of this.allBoxes()) {
      if (b.maxY <= feetY + step || b.minY >= feetY + height) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // centre is inside the box: push out along the shallowest axis
        const pushL = pos.x - b.minX, pushR = b.maxX - pos.x;
        const pushB = pos.z - b.minZ, pushF = b.maxZ - pos.z;
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) pos.x = b.minX - radius;
        else if (m === pushR) pos.x = b.maxX + radius;
        else if (m === pushB) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
      hit = b;
    }
    return hit;
  }

  // Ray vs boxes: returns nearest distance or Infinity. Used for bullets.
  raycastBoxes(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, bestBox = null, bestN = null;
    for (const b of this.allBoxes()) {
      let tmin = 0, tmax = best, nAxis = -1, nSign = 0;
      const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]];
      let ok = true;
      for (let i = 0; i < 3; i++) {
        const [o, d, mn, mx] = axes[i];
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
        let t1 = (mn - o) / d, t2 = (mx - o) / d, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; nAxis = i; nSign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin > 0 && tmin < best) { best = tmin; bestBox = b; bestN = [nAxis, nSign]; }
    }
    // Ground plane (approximate: march)
    if (dy < 0) {
      for (let t = 0.5; t < best; t += 0.5) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (y < groundHeight(x, z)) { best = t; bestBox = null; bestN = [1, 1]; break; }
      }
    }
    return { dist: best, box: bestBox, normalAxis: bestN ? bestN[0] : -1, normalSign: bestN ? bestN[1] : 0 };
  }
}
