// Image-based lighting: a procedural overcast-Sheffield sky baked into a
// pre-filtered environment map (PMREM). Gives metals and glossy surfaces
// believable reflections without any HDR downloads.
import * as THREE from 'three';

export function makeEnvironment(renderer, { night = false } = {}) {
  const scene = new THREE.Scene();
  // sky dome with vertical gradient
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const cols = []; const p = geo.attributes.position;
  const top = new THREE.Color(night ? 0x0a0f1e : 0x7fa6d6), hor = new THREE.Color(night ? 0x2a2320 : 0xe8e2d4), gnd = new THREE.Color(night ? 0x0a0a0a : 0x4a4640);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50; const c = new THREE.Color();
    if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 4));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // sun (bright, gives specular highlights) + a few soft "building" blocks
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(night ? 0xffb060 : 0xfff2d8).multiplyScalar(night ? 3 : 14) }));
  sun.position.set(22, 30, 14); scene.add(sun);
  const bmat = new THREE.MeshBasicMaterial({ color: night ? 0x151212 : 0x6b4a3c });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(12, 6 + (i % 3) * 3, 4), bmat);
    b.position.set(Math.cos(a) * 30, 2, Math.sin(a) * 30); b.lookAt(0, 2, 0); scene.add(b);
  }
  // soft window light strip for nice highlights on gun metal
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(30, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(night ? 0.5 : 3), side: THREE.DoubleSide }));
  strip.position.set(-20, 18, -10); strip.lookAt(0, 0, 0); scene.add(strip);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  return rt.texture;
}
