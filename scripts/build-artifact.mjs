// Makes a copy of index.html suitable for publishing as a claude.ai
// artifact (the host supplies <html>/<head>/<body> itself).
// Usage: node scripts/build-artifact.mjs  -> scripts/out/artifact.html
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<!DOCTYPE html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '')
  .replace(/\s*<meta charset[^>]*>/i, '')
  .replace(/\s*<meta name="viewport"[^>]*>/i, '')
  .replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/gi, '');
// Title must come first.
html = html.trim();
fs.mkdirSync(path.join(root, 'scripts/out'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts/out/artifact.html'), html + '\n');
console.log('wrote scripts/out/artifact.html');
