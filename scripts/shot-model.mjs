// Screenshot a model from the viewer: node scripts/shot-model.mjs ak 1.2 0.3 1.2 out.png
import { serve } from './serve.mjs';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const [m = 'ak', az = '1.2', el = '0.3', d = '1.0', out = 'scripts/out/model.png', extra = ''] = process.argv.slice(2);
const server = await serve(8770);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (msg) => { if (msg.type() === 'error') errs.push(msg.text()); });
await p.goto(`http://localhost:8770/scripts/viewer.html?m=${m}&az=${az}&el=${el}&d=${d}${extra}`);
try { await p.waitForFunction(() => window.done, null, { timeout: 60000 }); } catch (e) { console.log('timeout'); }
await p.screenshot({ path: out });
if (errs.length) console.log(errs.join('\n'));
await b.close(); server.close();
