import { serve } from './serve.mjs';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const server = await serve(8771);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 600 } });
p.on('console', (m) => { if (m.type() === 'error') console.log(m.text().slice(0, 300)); }); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8771/scripts/vehicles-preview.html?sky=64&az=' + (process.argv[2] || '0.9'));
await p.waitForFunction(() => window.done, null, { timeout: 120000 });
await p.screenshot({ path: 'scripts/out/vehicles' + (process.argv[3] || '') + '.png' }); await b.close(); server.close();
