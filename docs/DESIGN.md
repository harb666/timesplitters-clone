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

## Fir Vale reference (general layout only)

Used as loose reference, then fictionalised:

- North Sheffield suburb on a hillside; main roads climb steeply, side
  streets of stepped Victorian/Edwardian red-brick terraces with slate roofs
  and chimneys, fronting straight onto the pavement or tiny yards.
- Busy local shop parades: convenience stores, phone repair, barbers, sweet
  centres, bargain shops, the odd empty unit.
- Gritstone boundary walls, a small recreation ground, bus stops with
  shelters, zebra crossings with flashing orange globes, double yellow
  lines, wheelie bins on the pavement, back alleys ("gennels").
- Hills and tower blocks on the skyline.

The street names on signs are public geography. Every shop name and sign in
the game is invented. No real people, homes or businesses are depicted.

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
