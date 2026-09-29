// GIR check: boots the game, walks up to a GIR, lets him chase, shoots him,
// kills him. Saves scripts/out/gir-*.png. Usage: node scripts/gir-shots.mjs
import { serve } from './serve.mjs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');
const server = await serve(8768);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.stack));
await page.goto('http://localhost:8768/index.html', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => window.__firvale && !document.getElementById('btn-start').disabled, null, { timeout: 300000 });
await page.click('#btn-start');
await page.waitForFunction(() => window.__firvale.running && window.__firvale.girs.ready, null, { timeout: 120000 });
console.log('spawn', await page.evaluate(() => JSON.stringify(window.__firvale.map.spawn))); console.log(await page.evaluate(() => JSON.stringify(window.__firvale.girs.list.map((g) => [g.pos.x.toFixed(0), g.pos.z.toFixed(0), g.state]))));
const steps = process.env.LIST ? [] : [
  ['near', `const g = G.girs.list[1]; G.girs.list.forEach((o) => o.state = 'idle'); G.girs.alert = () => {}; const a = g.yaw; const x = g.pos.x + Math.sin(a) * 2.6, z = g.pos.z + Math.cos(a) * 2.6; p.spawn(x, z, Math.atan2(x - g.pos.x, z - g.pos.z) - 0.35); p.pitch = -0.28; G.advance(0.3);`],
  ['run', `const g = G.girs.list[1]; delete G.girs.alert; G.girs.alert(g); const a = g.yaw; const x = g.pos.x + Math.sin(a) * 6, z = g.pos.z + Math.cos(a) * 6; p.spawn(x, z, Math.atan2(x - g.pos.x, z - g.pos.z) - 0.3); p.pitch = -0.2; G.advance(0.5);`],
  ['bite', `G.advance(2.5);`],
  ['hit', `const g = G.girs.list[1]; G.girs.hit(g, 20, g.pos.clone().setY(g.pos.y + 0.3)); G.advance(0.08);`],
  ['dead', `const g = G.girs.list[1]; G.girs.hit(g, 100, g.pos.clone().setY(g.pos.y + 0.3)); G.advance(1.4); const q = g.pos; p.spawn(q.x + 2.2, q.z + 0.6, Math.atan2(2.2, 0.6) - 0.3); p.pitch = -0.4; G.advance(0.05);`],
];
for (const [name, code] of steps) {
  const info = await page.evaluate((code) => { const G = window.__firvale, p = G.player; G.frozen = true; new Function('G', 'p', code)(G, p);
    const g = G.girs.list[1]; let m = 0; g.root.traverse((o) => o.isMesh && m++); return `meshes ${m} ${g.state} hp ${g.hp} d ${Math.hypot(g.pos.x - p.pos.x, g.pos.z - p.pos.z).toFixed(2)} player hp ${p.health} calls ${G.renderer.info.render.calls}`; }, code);
  await page.screenshot({ path: path.join(out, `gir-${name}.png`), timeout: 180000 });
  console.log(name, info);
}
await browser.close(); server.close();
