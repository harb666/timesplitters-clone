// Automated smoke test: boots the game in a headless browser pretending to
// be an iPhone (landscape, touch), presses play, walks, shoots, and saves
// screenshots to scripts/out/. Fails if the page logs any errors.
// Usage: node scripts/smoke-test.mjs
import { serve } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); }

const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(outDir, { recursive: true });
const server = await serve(8765);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => !document.getElementById('btn-start').disabled, null, { timeout: 30000 });
await page.screenshot({ path: path.join(outDir, '01-title.png') });
await page.tap('#btn-start');
await page.waitForFunction(() => window.__firvale.running, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, '02-start.png') });

const snap = () => page.evaluate(() => { const g = window.__firvale; return { pos: g.player.pos.toArray().map((v) => +v.toFixed(2)), hp: g.player.health, ammo: g.arsenal.ammo, weapon: g.arsenal.name, state: g.arsenal.current.state, score: g.score, fps: g.fps, dez: [+g.dez.x.toFixed(1), +g.dez.z.toFixed(1), g.dez.state], car: [+g.cars[0].z.toFixed(1), +g.cars[0].speed.toFixed(1), g.cars[0].gear] }; });
console.log('start', await snap());

// Walk forward with the virtual joystick (touch events on the stick zone).
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
await touch('touchStart', [{ x: 150, y: 300, id: 1 }]);
await touch('touchMove', [{ x: 150, y: 240, id: 1 }]);
await page.waitForTimeout(1500);
await touch('touchEnd', []);
console.log('after walk', await snap());

// Look around by dragging on the right half.
await touch('touchStart', [{ x: 600, y: 200, id: 2 }]);
for (let i = 0; i < 10; i++) await touch('touchMove', [{ x: 600 - i * 12, y: 200, id: 2 }]);
await touch('touchEnd', []);

// Fire three times, then reload.
const fb = await page.locator('#btn-fire').boundingBox();
for (let i = 0; i < 3; i++) { await touch('touchStart', [{ x: fb.x + fb.width / 2, y: fb.y + fb.height / 2, id: 3 }]); await page.waitForTimeout(80); await touch('touchEnd', []); await page.waitForTimeout(600); }
await page.screenshot({ path: path.join(outDir, '03-shooting.png') });
console.log('after shots', await snap());
const rb = await page.locator('#btn-reload').boundingBox();
await touch('touchStart', [{ x: rb.x + rb.width / 2, y: rb.y + rb.height / 2, id: 4 }]); await page.waitForTimeout(60); await touch('touchEnd', []);
// (headless software rendering is slow, so wait on the game state, not the clock)
await page.evaluate(() => { const g = window.__firvale; g.frozen = true; g.advance(3.2); g.frozen = false; });
if (await page.evaluate(() => window.__firvale.arsenal.ammo) !== 30) throw new Error('reload did not refill the magazine');
console.log('after reload', await snap());

// Teleport to look at key places for screenshots.
const view = async (name, x, z, yaw, pitch = 0) => {
  await page.evaluate(([x, z, yaw, pitch]) => { const g = window.__firvale; g.player.spawn(x, z, yaw); g.player.pitch = pitch; }, [x, z, yaw, pitch]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, name) });
};
// Real streets (positions relative to the road data)
const roadView = async (name, road, i, frac, off, turn = 0) => {
  await page.evaluate(([road, i, frac, off, turn]) => { const g = window.__firvale, r = g.map.net.byName(road, i), p = g.map.net.pointAt(r, r.length * frac, off * (r.half + 1.4), {}); g.player.spawn(p.x, p.z, Math.atan2(-p.tx, -p.tz) + turn); }, [road, i, frac, off, turn]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, name) });
};
await roadView('04-page-hall-road.png', 'Page Hall Road', 0, 0.55, -1);
await roadView('05-junction.png', 'Firth Park Road', 0, 0.06, 1, 0.3);
await roadView('06-hinde-house-lane.png', 'Hinde House Lane', 0, 0.3, -1);
await roadView('07-owler-lane.png', 'Owler Lane', 0, 0.3, 1, -0.3);
await roadView('08-barnsley-road.png', 'Barnsley Road', 1, 0.15, 1, Math.PI);
// ---- weapon showcase ----
const W = async (name, fn, wait = 400) => { await page.evaluate(fn); await page.waitForTimeout(wait); await page.screenshot({ path: path.join(outDir, name) }); };
await page.evaluate(() => { const g = window.__firvale; g.player.spawn(g.map.spawn.x, g.map.spawn.z, g.map.spawn.yaw); });
await W('w01-ak-hip.png', () => {}, 800);
await W('w02-ak-ads.png', () => { window.__input.aim = true; }, 900);
console.log('final', await snap());
console.log('render stats', await page.evaluate(() => { const i = window.__firvale.renderer.info; return { drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures }; }));
// Portrait check
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, '11-portrait.png') });

await browser.close();
server.close();
const real = errors.filter((e) => !/GPU stall|swiftshader|WebGL|GL Driver|Automatic fallback/i.test(e));
if (real.length) { console.error('ERRORS:\n' + real.join('\n')); process.exit(1); }
console.log('SMOKE TEST PASSED — screenshots in scripts/out/');
