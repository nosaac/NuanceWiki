// URL handling: every emitted URL is relative; paths are never Unicode-normalized.
import path from 'node:path';

const posix = path.posix;

export function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

// "README.md" -> "index.html", "dir/README.md" -> "dir/index.html", "dir/a.md" -> "dir/a.html"
export function outPathFor(source) {
  if (posix.basename(source) === 'README.md') return posix.join(posix.dirname(source), 'index.html');
  return source.replace(/\.md$/, '.html');
}

const ASSETS = '.gitbook/assets/';

// Maps a site-root-relative source path to its site-root-relative output path.
function mapTarget(joined) {
  if (joined.startsWith(ASSETS)) return 'assets/' + joined.slice(ASSETS.length);
  if (joined.endsWith('.md')) return outPathFor(joined);
  if (joined === '' || joined.endsWith('/')) return joined + 'index.html';
  return joined;
}

// Rewrites one href/src found in a page whose source file lives in pageDir ('' = root).
// Returns a URL relative to the output page (which sits in the same folder).
export function rewriteUrl(raw, pageDir) {
  if (!raw || raw.startsWith('#') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  const cut = raw.search(/[?#]/);
  const pathPart = cut < 0 ? raw : raw.slice(0, cut);
  const rest = cut < 0 ? '' : raw.slice(cut);
  if (pathPart === '') return raw;
  let joined = posix.normalize(posix.join(pageDir || '.', safeDecode(pathPart)));
  if (joined === '.' || joined === './') joined = '';
  const target = mapTarget(joined);
  return encodePath(posix.relative(pageDir || '.', target)) + rest;
}

// Rewrites every a[href] and img[src] of a parsed HTML fragment.
export function rewriteDom(root, pageDir) {
  for (const a of root.querySelectorAll('a[href]')) a.setAttribute('href', rewriteUrl(a.getAttribute('href'), pageDir));
  for (const img of root.querySelectorAll('img[src]')) img.setAttribute('src', rewriteUrl(img.getAttribute('src'), pageDir));
}
