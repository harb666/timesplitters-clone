// Harbinger patrols the pavement and side road around Zim's house. The two
// source files contain the same character/rig and one animation each, so the
// walking scene supplies the visible model while the running scene is released
// after its clip has been read. This avoids keeping a duplicate set of 1024px
// textures in memory on phones.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { groundHeight as G } from '../core/world.js';

const WALK_URL = new URL('../models/Harbinger_Walking_rigged_1024.glb', import.meta.url);
const RUN_URL = new URL('../models/Harbinger_Running_rigged_1024.glb', import.meta.url);
const WALK_SPEED = 1.25, RUN_SPEED = 3.35, FAR = 150;

function load(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url.pathname}: ${r.status}`);
    return r.arrayBuffer();
  }).then((data) => new Promise((resolve, reject) => new GLTFLoader().parse(data, url.href, resolve, reject)));
}

function releaseScene(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

export class Harbinger {
  constructor(game, zim) {
    this.game = game; this.zim = zim; this.ready = false; this.failed = false;
    this.load = Promise.all([zim.load, load(WALK_URL), load(RUN_URL)])
      .then(([, walking, running]) => this.build(walking, running))
      .catch((e) => { this.failed = true; console.warn('Harbinger failed to load', e); });
  }

  build(walking, running) {
    const root = walking.scene;
    root.name = 'Harbinger';
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; o.castShadow = this.game.renderer.shadowMap.enabled; o.receiveShadow = true; } });
    const walkClip = walking.animations.find((c) => /walk/i.test(c.name)) || walking.animations[0];
    const runClip = running.animations.find((c) => /run/i.test(c.name)) || running.animations[0];
    if (!walkClip || !runClip) throw new Error('Walking or running animation is missing');

    this.route = this.zim.harbingerPatrol;
    this.index = 0; this.pos = new THREE.Vector3(this.route[0].x, this.route[0].y, this.route[0].z);
    this.yaw = this.route[0].yaw; this.wait = 1.2; this.mode = 'walk'; this.anim = '';
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {
      walk: this.mixer.clipAction(walkClip).setLoop(THREE.LoopRepeat),
      run: this.mixer.clipAction(runClip).setLoop(THREE.LoopRepeat),
    };
    this.actions.walk.play(); this.anim = 'walk';
    root.position.copy(this.pos); root.rotation.y = this.yaw;
    this.game.scene.add(root); this.root = root;
    // The running GLB's geometry and textures duplicate the walking model.
    // Animation tracks retain no dependency on that scene after parsing.
    releaseScene(running.scene);
    this.ready = true;
  }

  setAnimation(name) {
    if (name === this.anim) return;
    const from = this.actions[this.anim], to = this.actions[name];
    to.reset().setEffectiveTimeScale(name === 'run' ? 1 : 1.05).setEffectiveWeight(1).play();
    if (from) from.crossFadeTo(to, 0.32, true);
    this.anim = name;
  }

  // Gunfire makes her hurry to the next patrol point without changing any
  // combat/civilian systems.
  onLoudNoise(x, z) {
    if (!this.ready || Math.hypot(this.pos.x - x, this.pos.z - z) > 45) return;
    this.wait = 0; this.mode = 'run';
  }

  update(dt, player) {
    if (!this.ready) return;
    const playerDist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.root.visible = playerDist < FAR && !this.zim.inside;
    if (!this.root.visible) return;

    if (this.wait > 0) {
      this.wait -= dt;
      // There is no separate idle source animation: slowing the walk pose
      // gently keeps her alive rather than freezing on an arbitrary frame.
      this.setAnimation('walk'); this.actions.walk.setEffectiveTimeScale(0.16);
      this.mixer.update(dt);
      return;
    }

    const target = this.route[(this.index + 1) % this.route.length];
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, distance = Math.hypot(dx, dz);
    if (distance < 0.28) {
      this.index = (this.index + 1) % this.route.length;
      this.wait = 0.7 + (this.index % 3) * 0.45;
      // Run only the longer side-street legs, and when startled.
      this.mode = this.route[this.index].run ? 'run' : 'walk';
      return;
    }

    const desiredYaw = Math.atan2(dx, dz);
    let turn = Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw));
    this.yaw += turn * Math.min(1, dt * (this.mode === 'run' ? 5.5 : 3.5));
    const speed = this.mode === 'run' ? RUN_SPEED : WALK_SPEED;
    const step = Math.min(distance, speed * dt);
    this.pos.x += Math.sin(this.yaw) * step;
    this.pos.z += Math.cos(this.yaw) * step;
    this.game.world.collideCylinder(this.pos, 0.3, this.pos.y, 1.7, 0.3);
    this.pos.y = this.game.world.floorAt(this.pos.x, this.pos.z, this.pos.y + 0.35, 0.35, 0.1);
    if (!Number.isFinite(this.pos.y)) this.pos.y = G(this.pos.x, this.pos.z);

    this.setAnimation(this.mode);
    this.actions[this.mode].setEffectiveTimeScale(this.mode === 'run' ? speed / RUN_SPEED : speed / WALK_SPEED);
    this.mixer.update(dt);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
}
