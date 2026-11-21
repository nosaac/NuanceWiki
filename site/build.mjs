// Builds the Nuance help website (static HTML, no JavaScript) into _site/.
// The page list and the navigation come from SUMMARY.md; every listed .md file becomes
// one page (README.md -> index.html, dir/x.md -> dir/x.html). Pictures from .gitbook/assets/
// are copied to _site/assets/. All emitted URLs are relative, so the site works at any base path.
// Usage: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSummary } from './lib/summary.mjs';
import { outPathFor } from './lib/links.mjs';
import { splitFrontMatter, renderBody, renderDocument, navHtml } from './lib/page.mjs';
import { findUnresolved } from './lib/check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const posix = path.posix;

export function build({ srcDir, outDir }) {
  const entries = parseSummary(fs.readFileSync(path.join(srcDir, 'SUMMARY.md'), 'utf8'));
  const pages = entries.filter((e) => e.kind === 'page');
  for (const p of pages) {
    p.outPath = outPathFor(p.source);
    if (!fs.existsSync(path.join(srcDir, p.source)))
      throw new Error(`SUMMARY entry "${p.title}" points to missing file: ${p.source}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const assets = path.join(srcDir, '.gitbook', 'assets');
  if (fs.existsSync(assets)) fs.cpSync(assets, path.join(outDir, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(here, 'site.css'), path.join(outDir, 'site.css'));

  pages.forEach((page, i) => {
    const outDirRel = posix.dirname(page.outPath) === '.' ? '' : posix.dirname(page.outPath);
    const from = outDirRel || '.';
    const rel = (target) => posix.relative(from, target).split('/').map(encodeURIComponent).join('/');
    const { data, body } = splitFrontMatter(fs.readFileSync(path.join(srcDir, page.source), 'utf8'), page.source);
    const nav = navHtml(
      entries.map((e) => (e.kind === 'page' ? { ...e, navHref: rel(e.outPath), cur: e === page } : e)),
    );
    const link = (p) => (p ? { title: p.title, href: rel(p.outPath) } : null);
    const html = renderDocument({
      title: page.title,
      isFront: page.outPath === 'index.html',
      description: typeof data.description === 'string' ? data.description : '',
      cover: data.cover,
      pageDir: outDirRel,
      content: renderBody(body, outDirRel),
      nav,
      rel: { css: rel('site.css'), home: rel('index.html') },
      prev: link(pages[i - 1]),
      next: link(pages[i + 1]),
    });
    const dest = path.join(outDir, page.outPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  });

  const warnings = findUnresolved(outDir);
  return { pages, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { pages, warnings } = build({ srcDir: path.resolve(here, '..'), outDir: path.resolve(here, '..', '_site') });
    console.log(`Built ${pages.length} pages into _site/`);
    if (warnings.length) {
      console.warn(`WARNING: ${warnings.length} relative link(s) do not resolve to a file:`);
      for (const w of warnings) console.warn('  ' + w);
    }
  } catch (e) {
    console.error('Build failed: ' + e.message);
    process.exit(1);
  }
}
