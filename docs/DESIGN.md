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

Map services (OpenStreetMap, Overpass, tiles) are blocked from the build
environment, so the layout was reconstructed from **published address and
postcode coordinates** (ONS postcode centroids as shown on public postcode
lookup sites, Open Government Licence) plus published descriptions of which
streets meet where. Key facts used:

- The Sheffield Outer Ring Road (A6102) runs Owler Lane → Rushby Street →
  a junction with Barnsley Road (A6135) and Firth Park Road by the Northern
  General Hospital, continuing west as Herries Road.
- St Cuthbert's Church (1901–04, Gothic Revival, squared stone, plain tile
  roofs, nave/aisles/transepts, NW tower added 1959) stands on Barnsley Road
  opposite the Northern General.
- Fir Vale School and Oasis Academy Fir Vale are on Owler Lane.
- Page Hall Road connects with Hinde House Lane, Firth Park Road, Rushby
  Street; Robey Street links Hinde Street and Hinde House Lane.
- Address coordinates along Barnsley Road, Firth Park Road, Hinde House
  Lane, Owler Lane, Page Hall Road, Popple Street, Wensley Street, Rushby
  Street, Skinnerthorpe Road and Herries Road give the street lines
  (see `src/maps/firvale/data.js`, which lists every reference point).

Postcode centroids are approximate (tens of metres), so junction shapes and
minor streets are interpretations. Back streets inside the blocks are
generated to match the dense terraced pattern of the area. Every shop name
and sign is invented; no real homes, people or businesses are depicted.

## Originality checklist (applied to every asset)

"Could this reasonably be identified as copied from an existing commercial
game?" If yes → redesign.

| Asset | Notes |
| --- | --- |
| Scrap Blaster | Junk-built pump cannon with a bean-can drum and a rubber-duck sight. |
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
