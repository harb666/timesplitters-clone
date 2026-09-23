// Boot the game once and capture first-person weapon poses for tuning.
// Usage: node scripts/vm-shots.mjs steps.json   (array of {name, js, wait})
import { serve } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = path.resolve('scripts/out'); fs.mkdirSync(outDir, { recursive: true });
const server = await serve(8771);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 760, height: 360 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('firvale.settings.v1', JSON.stringify({ quality: 'low', aimAssist: false })); } catch (e) {} });
await page.goto('http://localhost:8771/index.html');
await page.waitForFunction(() => !document.getElementById('btn-start').disabled, null, { timeout: 90000 });
await page.tap('#btn-start');
await page.waitForFunction(() => window.__firvale.running, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__firvale; g.player.spawn(-6.6, -7.5, -Math.PI / 2 + 0.12); document.getElementById('hud').style.opacity = 0.35; });
await page.waitForTimeout(1500);
for (const s of steps) {
  try { await page.evaluate(s.js); } catch (e) { console.log('ERR', s.name, e.message); }
  // freeze real-time play and advance game time exactly
  if (s.t !== undefined) await page.evaluate((t) => { const g = window.__firvale; g.frozen = true; g.advance(t); }, s.t);
  else await page.waitForTimeout(s.wait ?? 600);
  if (s.name) await page.screenshot({ path: path.join(outDir, s.name + '.png') });
  if (s.log) console.log(s.name, await page.evaluate(s.log));
}
await b.close(); server.close();
