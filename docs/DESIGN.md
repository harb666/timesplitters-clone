# Fir Vale — design notes

## Tech choices (why it runs on an iPhone)

- **Three.js, no build step.** Plain ES modules loaded by the browser; the
  engine is bundled in `src/lib/` (about 190 KB gzipped) so there's no CDN
  dependency and the game works offline once cached.
- **Merged static scenery.** Every building, kerb and line is merged into
  one mesh per material (`StaticBatch`), so the whole district is roughly
  130–150 draw calls and ~45k triangles.
- **Lambert materials, no real-time shadows.** Blob shadows under cars and
  characters instead. One hemisphere light + one sun + one muzzle light.
- **Textures are painted in code** at load time (brick, gritstone, flags,
  asphalt, signs, posters, windows, badge, plates). Tiny sizes (≤512px).
- **Audio is synthesised** with Web Audio; no audio files at all.
- **Collision is axis-aligned boxes** plus a terrain height function. Cheap
  and predictable.
- Resolution scale is capped (Low 1×, Medium 1.5×, High 2×).

## Fir Vale reference — how the map was built

Since 0.4 the district is generated from **open map data**, not guessed:

- **Overture Maps** release extracts (read straight from its public S3
  bucket with `scripts/import-map/fetch_overture.py`): road segments,
  building footprints (with class, height and floors where mapped), land
  use, woods, street furniture and place categories. Overture's data here
  derives from **OpenStreetMap — © OpenStreetMap contributors, ODbL**;
  the credit is shown on the title screen.
- **Terrain Tiles** (Mapzen / AWS open data, SRTM-derived) for ground
  heights: an 8 m grid over the district and a 100 m grid out to 8 km.
- `scripts/import-map/build_map.py` converts it to a compact module,
  `src/maps/firvale/osm.js` (local metres: origin 53.4093 N 1.45 W, +X
  east, -Z north). It exports only *categories* of shops, never real
  business names; the game invents every name and sign.

The game adds its own detail on top: Victorian terrace fronts, roofs,
chimneys, textures, lamp columns, parked cars and people. No map imagery,
photos or proprietary 3-D data are used, and no real homes, people or
businesses are depicted.

## Originality checklist (applied to every asset)

"Could this reasonably be identified as copied from an existing commercial
game?" If yes → redesign.

| Asset | Notes |
| --- | --- |
| Weapons | VK-9 Kestrel and Hallam Six: original designs and names. |
| People | Procedural bodies and clothing; invented names and lines. |
| Sky | Procedural atmosphere + clouds (no photos/HDRIs). |
| Falcon R | Generic two-box hot hatch shape; invented hexagon/wing badge; fake plates. |
| Dez | Original character, personality is his ego and competitiveness. |
| UI | Custom layout and colours (sodium-amber + teal). |
| Audio | All synthesised; no samples. |

## Characters

**Dez "Full Tilt" Hartley** — wheelchair racer who treats the shop parade as
a training circuit. Pops wheelies when bored, complains about pavement
parking ruining his racing line, invents sporting events, flees gunfire
while claiming it's "interval training". Voice: fast, high-energy babble.

**The Falcon R driver** — unseen boy-racer, deeply protective of his wrap
and alloys, eleven-grand insurance premium.

**The shopkeeper** — heard, not seen (yet). Sells everything except the
thing you want.

## Roadmap

1. ✅ Milestone 1 — prototype (this build).
2. Milestone 2 — bigger district, interiors (Mini Mart), more NPCs
   (parking complainer, product seller, conspiracy theorist, runaway-trolley
   chaser), NPC conversations with each other.
3. Milestone 3 — full arsenal (Neon SMG, Sheffield Scattergun, Thunder
   Pistol, Magnetic Launcher, Bubble Grenade, Traffic Cone Cannon,
   Experimental Energy Rifle), enemies with cover/investigate AI, more traffic.
4. Milestone 4 — missions 1–5, music, explosions, the fast blue creature
   "Zip", night shift lighting.
5. Milestone 5 — iPhone optimisation pass.
