// Parses SUMMARY.md (GitBook table of contents) via markdown-it's token stream.
import MarkdownIt from 'markdown-it';
import { safeDecode } from './links.mjs';

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

const inlineText = (children) =>
  children.map((t) => (t.type === 'text' || t.type === 'code_inline' ? t.content : '')).join('');

// Returns a flat, ordered list of entries:
//   { kind: 'group', title }                          (## Group heading)
//   { kind: 'page', title, depth, source }            (source = decoded relative .md path)
//   { kind: 'external', title, depth, url }
//   { kind: 'label', title, depth }                   (list item without a link)
export function parseSummary(text) {
  const tokens = md.parse(text, {});
  const entries = [];
  let depth = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') depth++;
    else if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') depth--;
    else if (t.type === 'heading_open' && t.tag === 'h2') {
      const title = inlineText(tokens[i + 1].children || []).trim();
      if (title) entries.push({ kind: 'group', title });
    } else if (t.type === 'list_item_open') {
      // the item's own first inline token (before any nested list)
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== 'inline') j++;
      const children = tokens[j].children || [];
      const open = children.findIndex((c) => c.type === 'link_open');
      if (open < 0) {
        const title = inlineText(children).trim();
        if (title) entries.push({ kind: 'label', title, depth });
        continue;
      }
      const close = children.findIndex((c, k) => k > open && c.type === 'link_close');
      const title = inlineText(children.slice(open + 1, close < 0 ? undefined : close)).trim();
      const href = children[open].attrGet('href') || '';
      if (/^https?:\/\//i.test(href)) entries.push({ kind: 'external', title, depth, url: href });
      else entries.push({ kind: 'page', title, depth, source: safeDecode(href).replace(/^\.\//, '') });
    }
  }
  return entries;
}
