# FIR VALE — an original arcade FPS

A fast, silly, low-poly first-person shooter set in a **fictional** take on
Fir Vale, Sheffield. It runs in a web browser (built for iPhone Safari) and
needs no install, no build step, and no downloads besides the page itself.

> Everything here is original: characters, names, dialogue, the Scrap Blaster,
> the Falcon R, textures (painted in code), and sounds (synthesised in code).
> Real places are used only as loose geographic reference; no real
> businesses, homes or people are depicted.

## Play it

**On your iPhone:** open the link Claude gives you (a claude.ai artifact),
or GitHub Pages once it's switched on (see below). Turn the phone sideways
and tap **TAP TO PLAY**. Tip: in Safari use *Share → Add to Home Screen*
to get a full-screen app icon.

**On a computer:**

```bash
node scripts/serve.mjs
# then open http://localhost:8080
```

### Controls

| Touch (iPhone) | Keyboard/mouse | Action |
| --- | --- | --- |
| Left side: drag anywhere | WASD / arrows | Move |
| Right side: drag | Mouse (click to lock) | Look |
| FIRE (hold, drag to aim) | Left click | Shoot |
| AIM (toggle) | Right click (hold) | Aim down the sights |
| Push stick fully forward | Shift | Sprint |
| R when full | V | Inspect weapon |
| JUMP | Space | Jump |
| R | R | Reload |
| ⇄ | Q | Switch weapon |
| USE | E | Talk / interact |
| ⚙ | Esc / P | Settings + pause |

Settings: look sensitivity, aim assist, auto-fire, gyro aiming, left-handed
layout, invert look, graphics quality and volume. They are remembered.

## What's new in 0.5 — missions 2–5 and Zip

- **Five missions**, one after another, then free roam:
  1. *Welcome to Fir Vale* — look around, meet Dez, say hello to locals,
     knock cans off the school wall, flatten the roadworks cones.
  2. *Trolley Dash* — the Mini Mart's trolley rolls off downhill; catch it
     and push it home.
  3. *Zip!* — an original fast blue creature (floppy-eared hare-fox,
     goggles, mustard scarf, glowing tail) nicks the samosas and runs the
     real streets; catch it at each hiding spot.
  4. *The Fir Vale Grand Prix* — race Dez from Page Hall Road to St
     Cuthbert's through checkpoints.
  5. *Parcel Panic* — shoot down rogue "Vale Parcels" delivery drones
     that dive-bomb you with parcels.
- **Waypoint beacon**: a teal beam over every objective, its distance on
  the HUD and a marker on the minimap. Routes follow the real streets.

## What's new in 0.4 — the real map, a real sky, and the people of Fir Vale

- **Built from real open map data.** Every street, all 1,800 building
  footprints, parks, woods, car parks, walls, fences, bus stops, crossings,
  traffic lights, benches and post boxes come from Overture Maps /
  OpenStreetMap, and the hills from open elevation data. Terrace rows are
  split into individual houses that step down the real slopes, with the
  front facing the street they really face.
- **Shops where the real shops are**: each real shop location becomes a
  shopfront of the same *kind* (grocer, bakery, phone shop, pharmacy,
  barber, travel agent…) with an invented name.
- **Photoreal sky**: a physically based atmosphere with volumetric cumulus
  clouds, rendered once at load; it also lights the world and colours the
  haze. The real hills around Sheffield fill the horizon out to 8 km.
- **The people of Fir Vale**: ~120 residents walking the pavements,
  chatting outside shops, wheelchair users, and people sleeping rough in
  doorways — Slovak and Czech neighbours, Ukrainian families who came as
  refugees, Polish, British-Pakistani, Yemeni and Sheffield-born locals,
  each with their own greetings and lines. Walk up and press USE to talk.
  They duck and run from gunfire (civilians can't be hurt).
- **Traffic** drives the real street network, choosing turns at every
  junction.
- New mission step: say hello to the locals.

## What was new in 0.3 — the real Fir Vale

- The map is rebuilt on the **real street layout**, reconstructed from
  public address/postcode coordinates: Barnsley Road, Herries Road, Firth
  Park Road, Owler Lane, Page Hall Road, Rushby Street, **Hinde House Lane**,
  Popple Street, Wensley Street, Robey Street, Hinde Street, Skinnerthorpe
  Road, plus the terraced back streets that pack the blocks.
- The Fir Vale junction by **St Cuthbert's Church** (Gothic Revival, NW
  tower), the **Northern General Hospital** campus (blocks, car parks, the
  tall chimney, boundary wall), **Fir Vale School** on Owler Lane.
- ~3,000 generated Victorian terraces: bay windows, stone lintels and sills,
  slate roofs with ridge tiles, chimney stacks and pots, gutters and
  downpipes, satellite dishes, garden walls, bins, rear outriggers; some
  rendered. ~150 shop conversions with signs (Potraviny, halal butchers,
  sweet centre, money transfer, barbers…), awnings, fruit-and-veg stalls,
  roller shutters.
- Parked cars along the terraces, lamp posts, traffic lights and guard
  railings at the junction, bus shelters, street name plates, a zebra
  crossing on Page Hall Road, post box, cabinets, trees, direction sign.
- Traffic drives the real routes through the junction; Dez laps the Page
  Hall Road shops; a rotating minimap shows the real street names.
- Cloudy Sheffield sky; chunked scenery with distance culling for phones.

## What's new in 0.2 — weapon & audio overhaul

- **Two detailed weapons** replace the placeholder: the **VK-9 Kestrel**
  (AK-pattern rifle) and the **Hallam Six** (double-action revolver). Built
  from real-proportion profiles with bevelled, filleted parts: receiver,
  ribbed dust cover, gas system, slant muzzle device, sights, rivets, screws,
  curved bakelite magazine with a visible top round; frame with cylinder
  window, fluted cylinder with chambers and cartridges, crane, ejector rod
  and star, hammer, trigger, checkered grips, speedloader.
- **PBR materials** (colour + roughness + normal maps, all generated in code)
  with worn bluing, scratches, wood grain, stipple and checkering, lit by
  image-based sky reflections.
- **Jointed gloved hands and sleeved forearms.**
- **Animation:** idle breathing, look sway, walk/sprint bob, spring recoil,
  landing weight, aim-down-sights, sprint pose, weapon switching, inspect,
  empty behaviour. Kestrel: bolt carrier cycling, casing ejection, trigger,
  mag rock-out/rock-in, charging-handle rack on empty. Hallam Six: trigger,
  hammer cock/fall, cylinder indexing, crane swing-out, ejector stroke,
  casings falling out, speedloader, cylinder spin on inspect.
- **Audio engine rewrite:** sample-level synthesis (N-wave supersonic crack,
  saturated muzzle blast, modal metal and brass resonances, granular debris)
  rendered into randomised variations; HRTF 3-D positioning; speed-of-sound
  delay and air absorption with distance; generated outdoor and enclosed
  reverbs blended by how boxed-in you are; real-time echoes off the nearest
  buildings; per-material impacts (concrete, brick, asphalt, metal, glass,
  wood, dirt, plastic), ricochets, bouncing casings, surface-aware
  footsteps, sprint breathing, cloth, mechanical reload sounds.
- **World rendering:** filmic tone mapping, PBR brick/stone/asphalt/paving/
  slate, glossy windows, real-time sun shadows (medium/high quality).

## What was in prototype 0.1 (Milestone 1)

- First-person player with fast arcade movement, jumping, step-up onto kerbs,
  health, armour, knockback and respawn at a checkpoint.
- iPhone controls: floating joystick, look area, fire/jump/reload/switch/use.
- The Fir Vale district: Barnsley Road climbing the hill, a shop parade
  (starting at the **Fir Vale Mini Mart**), stepped red-brick terraces on
  Page Hall Road and Owler Lane, the Vale Rec behind a gritstone wall,
  a bus stop, a zebra crossing with blinking globes, double yellows,
  lamp posts, wheelie bins, a back gennel, a car park and roadworks.
- **Scrap Blaster** — pump-action junk cannon (6 pellets, 8-can drum, reload).
- **Dez "Full Tilt" Hartley** — a hyper-competitive wheelchair racer who does
  laps of the shops, pops wheelies, talks to you, and flees from gunfire.
- **Falcon R** — original hot hatch with AI driving on the left, gears,
  suspension pitch, brake lights, horn, exhaust pops & flames.
- Procedural audio: weapon (shot, pump, reload, empty), impacts, ricochets,
  footsteps, engine, tyres, horn, wind, traffic, birds, dogs, hum, voices.
- A short tutorial mission with objectives and score.

## Project layout

```
index.html              page + HUD markup
manifest.webmanifest    "Add to Home Screen" settings
assets/                 app icon
src/main.js             boots the game and runs the frame loop
src/core/               input, settings, collision/terrain, missions
src/player/             first-person player
src/weapons/            rig, animation, hands, arsenal, gun models (models/)
src/render/             image-based lighting
src/entities/           Falcon R AI, Dez, props, effects
src/models/             low-poly model builders (car, characters, batching)
src/maps/               Fir Vale: firVale.js (builder), firvale/osm.js (generated
                        real map data), roads, footprints, terrain, streetscape
src/textures/           textures painted in code
src/audio/              procedural sound engine + car engine synth
src/ui/                 HUD code and CSS
src/lib/                Three.js (bundled locally, MIT licence)
scripts/                local server, smoke test, screenshot tools,
                        import-map/ (rebuilds firvale/osm.js from open data)
docs/                   design notes
```

## Testing

```bash
node scripts/smoke-test.mjs
```

Boots the game in a headless browser pretending to be an iPhone, walks,
looks, shoots, reloads, takes screenshots into `scripts/out/`, and fails if
the page reports an error. Requires Playwright + Chromium.

## Publishing the playable link

The iPhone link is a claude.ai artifact. `node scripts/build-artifact.mjs`
makes the version of `index.html` it needs (`scripts/out/artifact.html`);
Claude republishes it together with `src/` after each change.

## Publishing with GitHub Pages (optional)

A workflow in `.github/workflows/pages.yml` publishes the game whenever
`main` changes. Switch it on once in the repo: **Settings → Pages → Source:
GitHub Actions**. The game then lives at
`https://<your-username>.github.io/timesplitters-clone/`.
