// FIR VALE — entry point. Sets up the renderer, builds the district,
// spawns the player, the Falcon R, Dez and the props, then runs the loop.
import * as THREE from 'three';
import { initInput, input, beginFrame, consumeFrame, setInputEnabled, requestGyro } from './core/input.js';
import { settings, saveSettings, onSettingsChange } from './core/settings.js';
import { World } from './core/world.js';
import { buildFirVale } from './maps/firVale.js';
import { Player } from './player/player.js';
import { Arsenal } from './weapons/arsenal.js';
import { weaponMaterials } from './weapons/materials.js';
import { Casings } from './entities/casings.js';
import { makeEnvironment } from './render/environment.js';
import { initSoundscape, setEnvironment } from './audio/soundscape.js';
import { Car, parkedFalcon } from './entities/car.js';
import { Dez } from './entities/dez.js';
import { Props } from './entities/props.js';
import { Effects } from './entities/effects.js';
import { Hud } from './ui/hud.js';
import { initAudio, updateListener, setVolume, sfx, makeHum, suspendAudio } from './audio/audio.js';
import { MissionRunner, missionWelcome } from './core/missions.js';
import { skyTexture } from './textures/procedural.js';

const QUALITY = {
  low: { dpr: 1, fogNear: 30, fogFar: 120, aa: false, shadows: 0 },
  medium: { dpr: 1.5, fogNear: 40, fogFar: 160, aa: true, shadows: 1024 },
  high: { dpr: 2, fogNear: 50, fogFar: 200, aa: true, shadows: 2048 },
};

function fatal(err) {
  const el = document.getElementById('fatal');
  el.classList.remove('hidden');
  el.textContent = 'Something broke while loading Fir Vale:\n\n' + (err && (err.stack || err.message) || err) +
    '\n\nTake a screenshot of this and send it to Claude.';
}
window.addEventListener('error', (e) => { if (!game.running) fatal(e.error || e.message); });

const game = { running: false, paused: false, score: 0, stats: { moved: 0, talkedToDez: false } };

function boot() {
  const canvas = document.getElementById('game');
  const q = QUALITY[settings.quality] || QUALITY.medium;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;  // filmic highlights, like a real camera
  renderer.toneMappingExposure = 1.0;
  if (q.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  renderer.autoClear = false;
  renderer.info.autoReset = false; // we render two passes per frame; count both

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xd6d2c6, q.fogNear, q.fogFar);
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 700);

  // Lighting: image-based sky light (reflections + ambient) and a warm sun
  // with real-time shadows that follow the player (medium/high quality).
  const env = makeEnvironment(renderer);
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x7a6450, 0.6));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.position.set(22, 40, 14);
  if (q.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadows, q.shadows);
    const sc = sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 140;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  }
  scene.add(sun, sun.target);

  // Separate scene for the weapon so it never clips into walls. Same sky
  // reflections so the metal matches the world.
  const vmScene = new THREE.Scene();
  vmScene.environment = env;
  const vmCamera = new THREE.PerspectiveCamera(64, camera.aspect, 0.02, 10);
  vmScene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6a5a48, 0.5));
  const vmSun = new THREE.DirectionalLight(0xfff0d8, 2.2); vmSun.position.set(0.4, 1, 0.3); vmScene.add(vmSun);
  const vmFill = new THREE.DirectionalLight(0xbcd0ff, 0.6); vmFill.position.set(-1, 0.2, 0.5); vmScene.add(vmFill);

  const world = new World();
  const map = buildFirVale(scene, world, settings.quality);
  const hud = new Hud(camera);
  const effects = new Effects(scene);
  const props = new Props(scene, map.props);
  const player = new Player(camera, world);
  player.surfaceAt = map.surfaceAt;
  player.spawn(map.spawn.x, map.spawn.z, map.spawn.yaw);

  Object.assign(game, { renderer, scene, camera, world, map, hud, effects, props, player });

  game.casings = new Casings(scene, world, weaponMaterials(settings.quality), map.surfaceAt);
  const arsenal = new Arsenal(game, vmScene, settings.quality);
  game.arsenal = arsenal; game.weapon = arsenal;

  // Traffic: one Falcon R doing laps, one parked up in the car park.
  const car = new Car(scene, world, { lane: 'south', z: -90, paint: 0x1d5fd1, plate: 'FV24 ZAP', hud });
  parkedFalcon(scene, world, 18.5, 40, Math.PI / 2, 0xf1b700, 'S4 SNAX');
  game.cars = [car];
  scene.traverse((o) => { if (o.isMesh && !o.castShadow && o.geometry && o.material && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });

  const dez = new Dez(scene, world, { x: map.paveX - 2.2, z0: -26, z1: 26, hud });
  game.dez = dez;
  game.npcs = [dez];

  // ---- game-level helpers used by the weapon ----
  const tmpV = new THREE.Vector3();
  game.findAimTarget = (origin, fwd, maxAngle) => {
    let best = null, bestA = maxAngle;
    for (const p of props.list) {
      if (!p.rest || p.hitOnce) continue;
      tmpV.copy(p.pos); tmpV.y += p.kind === 'cone' ? 0.3 : 0.1;
      const d = tmpV.sub(origin); const dist = d.length();
      if (dist > 60) continue;
      d.divideScalar(dist);
      const a = Math.acos(Math.min(1, d.dot(fwd)));
      if (a < bestA) {
        const blocked = world.raycastBoxes(origin.x, origin.y, origin.z, d.x, d.y, d.z, dist).dist < dist - 0.3;
        if (!blocked) { bestA = a; best = { dir: d.clone(), dist, angle: a }; }
      }
    }
    return best;
  };
  game.addScore = (n, label) => { game.score += n; hud.score(game.score); if (label) hud.toast(`${label} +${n}`); sfx.score(); };
  game.onGunfire = () => { for (const n of game.npcs) n.onLoudNoise(player.pos.x, player.pos.z); };

  player.onDamage = () => hud.damageFlash();
  player.onDeath = (src) => {
    hud.toast(src === 'car' ? 'FLATTENED BY A FALCON R' : 'YOU\'VE HAD IT', 2.5);
    hud.subtitle('<b>Respawning at the Mini Mart…</b> (checkpoint)', 2.5);
    setTimeout(() => {
      player.spawn(map.spawn.x, map.spawn.z, map.spawn.yaw);
      for (const w of arsenal.weapons) w.reserve = Math.max(w.reserve, w.magSize * 3);
    }, 2600);
  };

  const mission = new MissionRunner(game, missionWelcome(game));
  game.mission = mission;

  // ---- interaction (USE) ----
  function nearestInteractable() {
    let best = null, bestD = Infinity;
    const px = player.pos.x, pz = player.pos.z;
    const dd = Math.hypot(dez.x - px, dez.z - pz);
    if (dd < dez.interactRadius) { best = { prompt: 'Talk to Dez', npc: dez }; bestD = dd; }
    for (const it of map.interactables) {
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  // ---- resize ----
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    vmCamera.aspect = w / h; vmCamera.updateProjectionMatrix();
    // wider FOV in portrait so you can still see something
    camera.fov = w < h ? 85 : 72; camera.updateProjectionMatrix();
    vmCamera.fov = w < h ? 74 : (game.vmFovBase ?? 64); vmCamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  // ---- main loop ----
  let last = performance.now();
  let beaconT = 0, humNode = null;
  const fwd = new THREE.Vector3();
  let movedFrom = new THREE.Vector3().copy(player.pos);
  let fpsAcc = 0, fpsN = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) { game.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (dt > 0.05) dt = 0.05;
    if (!game.running || game.paused || game.frozen) { consumeFrame(); return; }
    step(dt, true);
  }
  // One simulation step (+ render). Tests can call game.advance() to move
  // game time precisely regardless of how fast the machine renders.
  function step(dt, render) {
    beginFrame();

    // Aim assist slows the look speed a touch when a target is under the crosshair.
    player.forward(fwd);
    const target = game.findAimTarget(camera.position, fwd, 0.05);
    player.aimAssistFactor = settings.aimAssist && target ? 0.55 : 1;
    hud.onTarget(!!target);

    player.adsK = arsenal.adsK;
    player.update(dt);
    const autoFire = settings.autoFire && !!target;
    arsenal.update(dt, {
      fire: input.fire || autoFire, firePressed: input.firePressed || (autoFire && !game._autoWas), aim: input.aim,
      sprinting: player.sprinting, reload: input.reload, inspect: input.inspect, swap: input.swap,
      lookX: input.lookX, lookY: input.lookY, landed: player.landed,
    });
    game._autoWas = autoFire; player.landed = 0;
    // aiming zooms the view a little, like bringing the sights to your eye
    const wantFov = (camera.aspect < 1 ? 85 : 72) + (arsenal.current.aimFov - 72) * arsenal.adsK;
    if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
    document.body.classList.toggle('ads', arsenal.adsK > 0.6);
    game.casings.update(dt);
    for (const c of game.cars) c.update(dt, player);
    for (const n of game.npcs) n.update(dt, player);
    props.update(dt);
    effects.update(dt);

    // USE
    const it = nearestInteractable();
    hud.prompt(it ? (input.isTouch ? 'USE: ' : '[E] ') + it.prompt : '');
    if (input.use && it) {
      if (it.npc) { it.npc.interact(player); game.stats.talkedToDez = true; }
      else { it.i = ((it.i ?? -1) + 1) % it.lines.length; hud.subtitle(it.lines[it.i], 4); }
    }

    // stats for the mission
    game.stats.moved += Math.hypot(player.pos.x - movedFrom.x, player.pos.z - movedFrom.z);
    movedFrom.copy(player.pos);
    mission.update();

    // blinking crossing globes
    beaconT += dt;
    map.beaconMat.color.setHex(Math.floor(beaconT * 1.6) % 2 ? 0x552a08 : 0xffa020);

    // audio listener follows the camera
    updateListener(camera.position, fwd);
    setEnvironment(camera.position, arsenal.env.enclosure);
    // keep the sun's shadow box centred on the player (snapped to avoid shimmer)
    if (sun.castShadow) {
      const sx = Math.round(player.pos.x / 2) * 2, sz = Math.round(player.pos.z / 2) * 2;
      sun.target.position.set(sx, player.pos.y - 1.6, sz); sun.position.set(sx + 22, player.pos.y + 38, sz + 14);
    }
    if (!humNode && map.startShop) humNode = makeHum(map.startShop.x + 1.5, 3.4, map.startShop.zc);

    hud.vitals(player.health, player.armour);
    hud.ammo(arsenal);
    hud.update(dt);

    if (render) {
      renderer.info.reset();
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      if (!player.dead) renderer.render(vmScene, vmCamera);
    }
    consumeFrame();
  }
  game.advance = (seconds, fps = 30) => { const n = Math.round(seconds * fps); for (let i = 0; i < n; i++) step(1 / fps, i === n - 1); };
  requestAnimationFrame(frame);

  // Render one frame behind the title screen so it looks alive.
  renderer.render(scene, camera);
  return game;
}

// ---------------- UI wiring (title + settings) ----------------
function wireUI() {
  const $ = (id) => document.getElementById(id);
  const startBtn = $('btn-start');
  const loading = $('loading');

  const syncSettingsUI = () => {
    $('set-sens').value = settings.sensitivity; $('set-sens-out').textContent = settings.sensitivity.toFixed(2) + '×';
    $('set-aimassist').checked = settings.aimAssist; $('set-autofire').checked = settings.autoFire;
    $('set-gyro').checked = settings.gyro; $('set-lefty').checked = settings.leftHanded;
    $('set-invert').checked = settings.invertY; $('set-quality').value = settings.quality;
    $('set-volume').value = settings.volume;
  };
  const applySettings = () => {
    document.body.classList.toggle('lefty', settings.leftHanded);
    setVolume(settings.volume);
  };
  syncSettingsUI(); applySettings();
  onSettingsChange(applySettings);

  $('set-sens').addEventListener('input', (e) => { settings.sensitivity = +e.target.value; $('set-sens-out').textContent = settings.sensitivity.toFixed(2) + '×'; saveSettings(); });
  $('set-aimassist').addEventListener('change', (e) => { settings.aimAssist = e.target.checked; saveSettings(); });
  $('set-autofire').addEventListener('change', (e) => { settings.autoFire = e.target.checked; saveSettings(); });
  $('set-lefty').addEventListener('change', (e) => { settings.leftHanded = e.target.checked; saveSettings(); });
  $('set-invert').addEventListener('change', (e) => { settings.invertY = e.target.checked; saveSettings(); });
  $('set-volume').addEventListener('input', (e) => { settings.volume = +e.target.value; saveSettings(); });
  $('set-gyro').addEventListener('change', async (e) => {
    settings.gyro = e.target.checked;
    if (settings.gyro) { const ok = await requestGyro(); if (!ok) { settings.gyro = false; e.target.checked = false; game.hud?.toast('Motion access not allowed', 2); } }
    saveSettings();
  });
  $('set-quality').addEventListener('change', (e) => {
    // Quality is applied when the page loads, so save and reload straight away.
    settings.quality = e.target.value; saveSettings();
    location.reload();
  });

  const openSettings = () => {
    if (!game.running) return;
    game.paused = true; setInputEnabled(false); suspendAudio(true);
    if (document.pointerLockElement) document.exitPointerLock();
    syncSettingsUI(); $('settings').classList.remove('hidden');
  };
  const closeSettings = () => {
    $('settings').classList.add('hidden');
    game.paused = false; setInputEnabled(true); suspendAudio(false); sfx.uiTap();
  };
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-settings').addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
  $('btn-close-settings').addEventListener('click', closeSettings);
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' || e.code === 'KeyP') { if ($('settings').classList.contains('hidden')) openSettings(); else closeSettings(); } });

  document.addEventListener('visibilitychange', () => { if (document.hidden && game.running) openSettings(); });

  startBtn.disabled = true;
  try {
    boot();
    loading.textContent = 'Ready.';
    startBtn.disabled = false;
  } catch (err) { console.error(err); fatal(err); return; }

  startBtn.addEventListener('click', async () => {
    initAudio();
    setVolume(settings.volume);
    // Render the sound library (a second or two) before play starts.
    startBtn.disabled = true;
    await initSoundscape({ quality: settings.quality, onProgress: (k) => { loading.textContent = `Recording the soundscape… ${Math.round(k * 100)}%`; } });
    loading.textContent = 'Ready.';
    if (settings.gyro) requestGyro();
    for (const c of game.cars) c.startAudio();
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    document.body.classList.add('playing');
    if (input.isTouch) { $('touch').classList.remove('hidden'); document.body.classList.add('touch-mode'); }
    else game.renderer.domElement.requestPointerLock?.();
    setInputEnabled(true);
    game.running = true;
  });
}

initInput(document.getElementById('game'));
wireUI();
window.__firvale = game; // handy for debugging
window.__input = input;
