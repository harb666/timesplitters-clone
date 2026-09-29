// Zim's house check: street views, walk in the front door, look round inside,
// walk back out. Saves scripts/out/zim-*.png. Usage: node scripts/zim-shots.mjs
import { serve } from './serve.mjs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');
const server = await serve(8776);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.stack));
await page.goto('http://localhost:8776/index.html', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => window.__firvale && !document.getElementById('btn-start').disabled, null, { timeout: 300000 });
await page.click('#btn-start');
await page.waitForFunction(() => window.__firvale.running && window.__firvale.zim.ready, null, { timeout: 120000 });
await page.addStyleTag({ content: '#hud, #toast { display: none !important; } ' });
console.log(await page.evaluate(() => { const z = window.__firvale.zim; return `lawn ${z.lawn.toFixed(2)} floor ${z.floor.toFixed(2)} steps ${z.steps} interior boxes ${z.intBoxes.length}`; }));
// helpers in model space: W(mx, mz) -> world
const steps = [
  ['street', `const [x, z] = Z.w(0, 14); p.spawn(x, z, Z.yawTo(x, z, 0, -2)); p.pitch = 0.1; G.advance(0.3);`],
  ['corner', `const [x, z] = Z.w(9, 10); p.spawn(x, z, Z.yawTo(x, z, 0, -3)); p.pitch = 0.12; G.advance(0.3);`],
  ['pipes', `const [x, z] = Z.w(-1, 7); p.spawn(x, z, Z.yawTo(x, z, -5, -2)); p.pitch = 0.35; G.advance(0.3);`],
  ['side', `const [x, z] = Z.w(8, -6); p.spawn(x, z, Z.yawTo(x, z, 0, -5)); p.pitch = 0.1; G.advance(0.3);`],
  ['door', `const [x, z] = Z.w(0, 2.5); p.spawn(x, z, Z.yawTo(x, z, 0, 0)); G.advance(0.2); input.moveY = 1; G.advance(1.2); input.moveY = 0; G.advance(0.2);`],
  ['in-back', `p.yaw += 0.0; G.advance(0.1);`],
  ['in-right', `p.yaw += 1.1; G.advance(0.1);`],
  ['in-walk', `input.moveY = 1; G.advance(2.5); input.moveY = 0; G.advance(0.1);`],
  ['out', `const [x, z] = Z.w(0, -1.4); p.pos.set(x, G.zim.floor + p.eye, z); p.yaw = Z.yaw + Math.PI; input.moveY = 1; G.advance(1.2); input.moveY = 0; G.advance(0.3);`],
];
for (const [name, code] of steps) {
  const info = await page.evaluate((code) => {
    const G = window.__firvale, p = G.player, input = window.__input; G.frozen = true;
    const S = 1.1, BK = [0.865, 0.501], F = [-BK[0], -BK[1]], L = [-BK[1], BK[0]], O = [346.3 + L[0] * 5.5 * S, -85.8 + L[1] * 5.5 * S];
    const Z = { w: (mx, mz) => [O[0] + (L[0] * mx + F[0] * mz) * S, O[1] + (L[1] * mx + F[1] * mz) * S], yaw: Math.atan2(F[0], F[1]) };
    Z.yawTo = (x, z, mx, mz) => { const [tx, tz] = Z.w(mx, mz); return Math.atan2(x - tx, z - tz); };
    new Function('G', 'p', 'input', 'Z', code)(G, p, input, Z);
    return `inside ${G.zim.inside} feet ${(p.pos.y - p.eye).toFixed(2)} pos ${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`;
  }, code);
  await page.screenshot({ path: path.join(out, `zim-${name}.png`), timeout: 180000 });
  console.log(name, info);
}
await browser.close(); server.close();
