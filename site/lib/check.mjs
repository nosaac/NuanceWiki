// Lists relative href/src in the output that do not resolve to a file.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { safeDecode } from './links.mjs';

function* walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function findUnresolved(outDir) {
  const bad = [];
  for (const file of walk(outDir)) {
    if (!file.endsWith('.html')) continue;
    const root = parse(fs.readFileSync(file, 'utf8'));
    for (const el of root.querySelectorAll('[href],[src]')) {
      const raw = el.getAttribute('href') ?? el.getAttribute('src');
      if (!raw || raw.startsWith('#') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
      let p = safeDecode(raw.replace(/[?#].*$/, ''));
      if (p === '' ) continue;
      if (p.endsWith('/')) p += 'index.html';
      const target = path.join(path.dirname(file), p);
      if (!fs.existsSync(target)) bad.push(`${path.relative(outDir, file)}: ${raw}`);
    }
  }
  return bad;
}
