// Front matter, markdown rendering and the HTML page shell.
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { load } from 'js-yaml';
import { parse } from 'node-html-parser';
import { transformCards } from './cards.mjs';
import { rewriteDom, rewriteUrl } from './links.mjs';

const md = new MarkdownIt({ html: true, linkify: false, typographer: false }).use(footnote);

export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function splitFrontMatter(text, name = 'page') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const m = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text };
  if (!m[1] || m[1].split(/\r?\n/).every((l) => !l.trim() || l.trim().startsWith('#'))) return { data: {}, body: text.slice(m[0].length) };
  let data;
  try {
    data = load(m[1]);
  } catch (e) {
    throw new Error(`Invalid front matter in ${name}: ${e.message}`);
  }
  return { data: data && typeof data === 'object' ? data : {}, body: text.slice(m[0].length) };
}

// Renders a page body to HTML with all links/pictures rewritten (pageDir = folder of the source file).
export function renderBody(body, pageDir) {
  const root = parse(md.render(body));
  for (const s of root.querySelectorAll('script')) s.remove();
  transformCards(root);
  rewriteDom(root, pageDir);
  return root.toString();
}

function navHtml(entries) {
  let html = '';
  let depth = 0;
  const closeTo = (d) => {
    while (depth > d) { html += '</ul></li>'; depth--; }
  };
  for (const e of entries) {
    if (e.kind === 'group') {
      closeTo(0);
      html += `<li class="group"><span>${escapeHtml(e.title)}</span></li>`;
      continue;
    }
    const d = Math.min(e.depth, depth + 1);
    closeTo(d);
    if (d > depth) { html = html.replace(/<\/li>$/, '') + '<ul>'; depth++; }
    let inner;
    if (e.kind === 'page') {
      const cur = e.cur ? ' aria-current="page"' : '';
      inner = `<a href="${escapeHtml(e.navHref)}"${cur}>${escapeHtml(e.title)}</a>`;
    } else if (e.kind === 'external') {
      inner = `<a class="external" href="${escapeHtml(e.url)}">${escapeHtml(e.title)}</a>`;
    } else inner = `<span>${escapeHtml(e.title)}</span>`;
    html += `<li>${inner}</li>`;
  }
  closeTo(0);
  return '<ul>' + html + '</ul>';
}

export function renderDocument({ title, isFront, description, cover, pageDir, content, nav, rel, prev, next }) {
  const docTitle = isFront ? 'Nuance Help' : `${title} · Nuance Help`;
  const coverHtml = cover ? `<img class="cover" src="${escapeHtml(rewriteUrl(String(cover), pageDir))}" alt="">\n` : '';
  const pn = [];
  if (prev) pn.push(`<a class="prev" rel="prev" href="${escapeHtml(prev.href)}">Previous: ${escapeHtml(prev.title)}</a>`);
  if (next) pn.push(`<a class="next" rel="next" href="${escapeHtml(next.href)}">Next: ${escapeHtml(next.title)}</a>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(docTitle)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}">\n` : ''}<link rel="stylesheet" href="${escapeHtml(rel.css)}">
</head>
<body>
<header class="site-header"><a class="site-name" href="${escapeHtml(rel.home)}">Nuance Help</a></header>
<div class="layout">
<input type="checkbox" id="menu-toggle" class="menu-toggle">
<label for="menu-toggle" class="menu-button">Menu</label>
<nav aria-label="Help pages">
${nav}
</nav>
<main>
${coverHtml}<article>
${content}
</article>
${pn.length ? `<div class="pager">${pn.join('')}</div>` : ''}
</main>
</div>
</body>
</html>
`;
}

export { navHtml };
