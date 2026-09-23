// Screenshot tour: boots the game, then teleports to named views and saves
// scripts/out/<prefix>-<name>.png. Usage: node scripts/views.mjs prefix [query]
import { serve } from './serve.mjs';
import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');
const prefix = process.argv[2] || 'v', query = process.argv[3] || '';
const server = await serve(8767);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'log') console.log(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.stack));
await page.goto('http://localhost:8767/index.html' + query);
await page.waitForFunction(() => !document.getElementById('btn-start').disabled, null, { timeout: 300000 });
await page.click('#btn-start');
await page.waitForFunction(() => window.__firvale.running, null, { timeout: 120000 });
if (!process.env.HUD) await page.addStyleTag({ content: '#hud, #subtitle, #bubbles, .subtitle, #toast { display: none !important; }' });
const views = JSON.parse(process.argv[4] || 'null') || [
  ['spawn', null],
  ['spawn-back', { turn: Math.PI }],
  ['spawn-left', { turn: Math.PI / 2 }],
];
for (const [name, v] of views) {
  await page.evaluate((v) => {
    const g = window.__firvale, p = g.player;
    g.frozen = true;
    if (v && v.person) {
      const kind = v.person, q = g.crowd.people.filter((o) => o.kind === kind)[v.i || 0];
      const a = q.yawS + (v.ang || 0), x = q.x + Math.sin(a) * (v.d || 4), z = q.z + Math.cos(a) * (v.d || 4);
      p.spawn(x, z, Math.atan2(x - q.x, z - q.z));
    } else if (v && v.road) {
      const r = g.map.net.longest(v.road), pt = g.map.net.pointAt(r, r.length * (v.t ?? 0.5), v.off ?? 0, {});
      p.spawn(pt.x, pt.z, Math.atan2(-pt.tx, -pt.tz) + (v.back ? Math.PI : 0));
    } else if (v && v.x !== undefined) p.spawn(v.x, v.z, v.yaw ?? 0); else p.spawn(g.map.spawn.x, g.map.spawn.z, g.map.spawn.yaw);
    if (v && v.turn) p.yaw += v.turn;
    if (v && v.pitch !== undefined) p.pitch = v.pitch;
    if (v && v.up) p.pos.y += v.up;
    g.advance(0.5);
    if (v && v.up) { p.pos.y += v.up; p.vel && p.vel.set(0, 0, 0); g.advance(1 / 30); }
  }, v);
  await page.screenshot({ path: path.join(out, `${prefix}-${name}.png`) });
  console.log('shot', name, await page.evaluate(() => { const g = window.__firvale; const i = g.renderer.info.render; return `calls ${i.calls} tris ${i.triangles} pos ${g.player.pos.toArray().map((x) => x.toFixed(1))}`; }));
}
await browser.close(); server.close();
