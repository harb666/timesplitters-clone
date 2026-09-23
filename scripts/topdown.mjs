// Render the map from above (debugging layout). node scripts/topdown.mjs x z height out.png
import { serve } from './serve.mjs';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const [x = '0', z = '0', h = '400', out = 'scripts/out/top.png', tilt = '0'] = process.argv.slice(2);
const server = await serve(8773);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.addInitScript(() => { try { localStorage.setItem('firvale.settings.v1', JSON.stringify({ quality: 'low' })); } catch (e) {} });
await p.goto('http://localhost:8773/index.html');
await p.waitForFunction(() => !document.getElementById('btn-start').disabled, null, { timeout: 180000 });
await p.evaluate(([x, z, h, tilt]) => {
  const g = window.__firvale; g.frozen = true; document.getElementById('title').style.display = 'none';
  const cam = g.camera; cam.fov = 60; cam.aspect = 1000 / 800; cam.far = 3000; cam.updateProjectionMatrix();
  g.scene.fog = null;
  g.map.updateLOD({ x, z }); for (const m of g.scene.children) if (m.isMesh) m.visible = true;
  cam.position.set(x, h, z + tilt * h); cam.lookAt(x, 0, z);
  g.renderer.setSize(1000, 800, false); g.renderer.clear(); g.renderer.render(g.scene, cam);
}, [+x, +z, +h, +tilt]);
await p.screenshot({ path: out });
await b.close(); server.close();
