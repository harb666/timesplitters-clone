// node scripts/contact.mjs prefix out.png [cols]  -> grid of scripts/out/prefix*.png
import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const [prefix, out, cols = '3'] = process.argv.slice(2);
const dir = path.resolve('scripts/out');
const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort((a, b) => fs.statSync(path.join(dir, a)).mtimeMs - fs.statSync(path.join(dir, b)).mtimeMs);
const cells = files.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}"><figcaption>${f}</figcaption></figure>`).join('');
const html = `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px}figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:4px;top:2px;color:#ff0;font:14px monospace;background:#0008}</style>${cells}`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 400 } });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
