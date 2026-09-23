// Shared PBR materials for weapons, hands and casings.
import * as THREE from 'three';
import * as P from '../textures/pbr.js';

let M = null;
export function weaponMaterials(quality = 'medium') {
  if (M) return M;
  const n = quality === 'low' ? 256 : 512;
  const std = (set, o) => P.standard(set, o);
  M = {
    steel: std(P.gunSteel(n, { tint: [58, 60, 64], wear: 0.6, seed: 3 }), { normal: 0.6 }),
    blued: std(P.gunSteel(n, { tint: [44, 48, 60], wear: 0.4, seed: 5 }), { normal: 0.5 }),
    stainless: std(P.gunSteel(n, { tint: [150, 150, 152], wear: 0.2, seed: 7 }), { normal: 0.4 }),
    bright: std(P.brightSteel(256), { normal: 0.4 }),
    darkSteel: std(P.gunSteel(256, { tint: [34, 34, 36], wear: 0.3, seed: 9 }), { normal: 0.5 }),
    wood: std(P.woodSet(n, { base: [104, 50, 26], seed: 21, laminate: true }), { normal: 0.8 }),
    walnut: std(P.woodSet(n, { base: [96, 50, 30], seed: 23 }), { normal: 0.7 }),
    checkered: std(P.checkeredSet(256, { base: [70, 36, 20] }), { normal: 1.2 }),
    bakelite: std(P.polymerSet(256, { base: [96, 40, 22], seed: 33, stipple: 0.25 }), { normal: 0.6 }),
    polymer: std(P.polymerSet(256, { base: [24, 24, 26], seed: 31 }), { normal: 0.8 }),
    brass: std(P.brassSet(128), { normal: 0.3 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: 0.35 }),
    primer: new THREE.MeshStandardMaterial({ color: 0xc9b37a, metalness: 1, roughness: 0.3 }),
    bore: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.6 }),
    redInsert: new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0x551000, roughness: 0.4, metalness: 0 }),
    whiteDot: new THREE.MeshStandardMaterial({ color: 0xf2f2e6, roughness: 0.5, metalness: 0 }),
    glove: std(P.gloveSet(256), { normal: 1 }),
    sleeve: std(P.fabricSet(256, [58, 66, 52]), { normal: 0.8 }),
    cuff: std(P.polymerSet(128, { base: [30, 30, 30], seed: 81 }), { normal: 0.5 }),
  };
  for (const k of ['wood', 'walnut', 'checkered', 'bakelite', 'polymer', 'glove', 'sleeve', 'cuff']) M[k].metalness = 0;
  M.wood.metalnessMap = M.walnut.metalnessMap = M.checkered.metalnessMap = M.bakelite.metalnessMap = M.polymer.metalnessMap = null;
  M.glove.metalnessMap = M.sleeve.metalnessMap = M.cuff.metalnessMap = null;
  return M;
}
