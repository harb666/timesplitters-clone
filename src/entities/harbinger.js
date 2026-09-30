// Harbinger stands outside the front of Zim's house. She is deliberately a
// visual-only NPC: no collider, physics body, velocity, target or navigation
// state is created, so traffic and every other entity pass without moving her.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';

const MODEL_URL = new URL('../models/Harbinger_Walking_rigged_1024.glb', import.meta.url);
const FAR = 150;

function load(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url.pathname}: ${r.status}`);
    return r.arrayBuffer();
  }).then((data) => new Promise((resolve, reject) => new GLTFLoader().parse(data, url.href, resolve, reject)));
}

export class Harbinger {
  constructor(game, zim) {
    this.game = game; this.zim = zim; this.ready = false; this.failed = false; this.idleTime = 0;
    this.load = Promise.all([zim.load, load(MODEL_URL)])
      .then(([, model]) => this.build(model))
      .catch((e) => { this.failed = true; console.warn('Harbinger failed to load', e); });
  }

  build(model) {
    const root = model.scene, stand = this.zim.harbingerStand;
    root.name = 'Harbinger';
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; o.castShadow = this.game.renderer.shadowMap.enabled; o.receiveShadow = true; } });

    // The supplied model has no idle clip and its bind pose is not a natural
    // stance. Sample one balanced frame from the walking clip once, then pause
    // it permanently. No walking animation advances while Harbinger stands.
    const walk = model.animations.find((c) => /walk/i.test(c.name)) || model.animations[0];
    if (walk) {
      this.mixer = new THREE.AnimationMixer(root);
      const pose = this.mixer.clipAction(walk).play();
      this.mixer.setTime(walk.duration * 0.5);
      pose.paused = true;
    }

    this.anchor = new THREE.Vector3(stand.x, stand.y, stand.z);
    this.yaw = stand.yaw;
    root.position.copy(this.anchor); root.rotation.y = this.yaw;

    // A tiny upper-body sway supplies an idle breath without moving her feet
    // or playing either locomotion clip.
    this.idleBone = root.getObjectByName('mixamorig:Spine2') || root.getObjectByName('mixamorig:Spine');
    if (this.idleBone) this.idleRotation = this.idleBone.rotation.clone();

    this.game.scene.add(root); this.root = root; this.ready = true;
  }

  // Kept for the shared NPC notification interface. Harbinger does not react
  // to the player or gunfire and can never acquire a movement target.
  onLoudNoise() {}

  update(dt, player) {
    if (!this.ready) return;
    this.root.visible = Math.hypot(player.pos.x - this.anchor.x, player.pos.z - this.anchor.z) < FAR && !this.zim.inside;
    if (!this.root.visible) return;

    this.idleTime += dt;
    if (this.idleBone) {
      this.idleBone.rotation.copy(this.idleRotation);
      this.idleBone.rotation.z += Math.sin(this.idleTime * 1.35) * 0.006;
      this.idleBone.rotation.x += Math.sin(this.idleTime * 0.7) * 0.003;
    }
    // Reassert the authored transform. There is intentionally no world
    // collision query or physics integration anywhere in this entity.
    this.root.position.copy(this.anchor); this.root.rotation.y = this.yaw;
  }
}
