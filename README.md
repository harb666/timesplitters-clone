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
| JUMP | Space | Jump |
| R | R | Reload |
| ⇄ | Q | Switch weapon |
| USE | E | Talk / interact |
| ⚙ | Esc / P | Settings + pause |

Settings: look sensitivity, aim assist, auto-fire, gyro aiming, left-handed
layout, invert look, graphics quality and volume. They are remembered.

## What's in prototype 0.1 (Milestone 1)

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
src/weapons/            Scrap Blaster (logic + 3D model)
src/entities/           Falcon R AI, Dez, props, effects
src/models/             low-poly model builders (car, characters, batching)
src/maps/               Fir Vale district layout
src/textures/           textures painted in code
src/audio/              procedural sound engine + car engine synth
src/ui/                 HUD code and CSS
src/lib/                Three.js (bundled locally, MIT licence)
scripts/                local server + automated smoke test
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
