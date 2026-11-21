import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { parseSummary } from '../lib/summary.mjs';
import { rewriteUrl } from '../lib/links.mjs';
import { splitFrontMatter, renderBody } from '../lib/page.mjs';
import { build } from '../build.mjs';

test('SUMMARY parsing: order, depth, group, dash bullets, external link', () => {
  const e = parseSummary(`# Table of contents

## Basics

* [Home](README.md)
  * [Child](a/README.md)
    - [Grandchild](a/b%20c.md)
* [Other](other.md)

## More

- [Site](https://example.com/x)
`);
  assert.deepEqual(e, [
    { kind: 'group', title: 'Basics' },
    { kind: 'page', title: 'Home', depth: 0, source: 'README.md' },
    { kind: 'page', title: 'Child', depth: 1, source: 'a/README.md' },
    { kind: 'page', title: 'Grandchild', depth: 2, source: 'a/b c.md' },
    { kind: 'page', title: 'Other', depth: 0, source: 'other.md' },
    { kind: 'group', title: 'More' },
    { kind: 'external', title: 'Site', depth: 0, url: 'https://example.com/x' },
  ]);
});

test('front matter with folded cover is parsed and not rendered', () => {
  const { data, body } = splitFrontMatter('---\ndescription: hi\ncover: >-\n  ../a b\n  c.png\nlayout:\n  cover:\n    visible: true\n---\n\n# T\n');
  assert.equal(data.cover, '../a b c.png');
  assert.equal(data.description, 'hi');
  assert.equal(body.trim(), '# T');
  assert.ok(!renderBody(body, '').includes('visible'));
  assert.deepEqual(splitFrontMatter('# no front\n').data, {});
});

test('page link rewriting', () => {
  assert.equal(rewriteUrl('README.md', ''), 'index.html');
  assert.equal(rewriteUrl('x/y.md#sec', ''), 'x/y.html#sec');
  assert.equal(rewriteUrl('../README.md', 'sub'), '../index.html');
  assert.equal(rewriteUrl('../publications/', 'sub'), '../publications/index.html');
  assert.equal(rewriteUrl('tipping/', ''), 'tipping/index.html');
  assert.equal(rewriteUrl('README.md', 'sub'), 'sub/index.html'.replace('sub/', ''));
  assert.equal(rewriteUrl('sub/README.md', ''), 'sub/index.html');
  for (const u of ['https://a.b/c.md', 'http://a.b', '//a.b/c.md', 'mailto:a@b.c', '#top', '/broken/pages/x', 'tel:1'])
    assert.equal(rewriteUrl(u, 'sub'), u);
});

test('asset rewriting from root and sub-folder, no double encoding', () => {
  const root = renderBody('![A](<.gitbook/assets/article screen.png>)\n\n<img src=".gitbook/assets/x y.png" alt="">\n\n<a href=".gitbook/assets/f (1).pdf">f</a>', '');
  assert.match(root, /src="assets\/article%20screen\.png"/);
  assert.match(root, /src="assets\/x%20y\.png"/);
  assert.match(root, /href="assets\/f%20\(1\)\.pdf"/);
  const sub = renderBody('![A](<../.gitbook/assets/article screen.png>)\n\n![B](../.gitbook/assets/a%20b.png)\n\n<figure><img src="../.gitbook/assets/x y.png" alt=""><figcaption>c</figcaption></figure>\n\n<a href="../.gitbook/assets/q r.png">q</a>', 'sub');
  assert.match(sub, /src="\.\.\/assets\/article%20screen\.png"/);
  assert.match(sub, /src="\.\.\/assets\/a%20b\.png"/);
  assert.match(sub, /src="\.\.\/assets\/x%20y\.png"/);
  assert.match(sub, /href="\.\.\/assets\/q%20r\.png"/);
  assert.ok(!sub.includes('%25'));
  assert.equal(rewriteUrl('../.gitbook/assets/100%.png', 'sub'), '../assets/100%25.png');
  assert.equal(rewriteUrl('../.gitbook/assets/%E0%A4%A.png', 'sub'), '../assets/%25E0%25A4%25A.png');
});

test('non-ASCII names are not normalized', () => {
  const nfd = 'I\u0307\u00f6'.normalize('NFD');
  const nfc = nfd.normalize('NFC');
  assert.notEqual(nfc, nfd);
  assert.equal(decodeURIComponent(rewriteUrl('.gitbook/assets/' + nfd + '.png', '')), 'assets/' + nfd + '.png');
  assert.equal(decodeURIComponent(rewriteUrl('.gitbook/assets/' + nfc + '.png', '')), 'assets/' + nfc + '.png');
});

test('cards table becomes a card grid', () => {
  const html = '<table data-view="cards"><thead><tr><th align="center"></th><th data-hidden data-card-target data-type="content-ref"></th><th data-hidden data-card-cover data-type="files"></th></tr></thead><tbody>' +
    '<tr><td>Register</td><td><a href="sub/reg.md">reg.md</a></td><td><a href=".gitbook/assets/reg (2).png">reg (2).png</a></td></tr>' +
    '<tr><td>Plain</td><td></td><td></td></tr></tbody></table>';
  const out = parse(renderBody(html, ''));
  assert.equal(out.querySelectorAll('table').length, 0);
  const cards = out.querySelectorAll('.cards .card');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].tagName, 'A');
  assert.equal(cards[0].getAttribute('href'), 'sub/reg.html');
  assert.equal(cards[0].querySelector('img').getAttribute('src'), 'assets/reg%20(2).png');
  assert.equal(cards[0].text, 'Register');
  assert.equal(cards[1].tagName, 'DIV');
  assert.equal(cards[1].querySelector('img'), null);
  assert.ok(!out.text.includes('reg.md') && !out.text.includes('reg (2).png'));
});

function fixture(summary, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-'));
  fs.writeFileSync(path.join(dir, 'SUMMARY.md'), summary);
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  return dir;
}

test('missing SUMMARY target fails the build and names the entry', () => {
  const src = fixture('* [Home](README.md)\n* [Ghost Page](ghost.md)\n', { 'README.md': '# Home\n' });
  const out = path.join(src, '_out');
  assert.throws(() => build({ srcDir: src, outDir: out }), /Ghost Page/);
});

test('fixture build: only SUMMARY pages, nav, prev/next, escaped titles', () => {
  const src = fixture('* [Home](README.md)\n  * [A \\<b\\> &](a/README.md)\n* [Ext](https://example.com)\n', {
    'README.md': '# Home\n',
    'a/README.md': '---\ndescription: d\ncover: ../.gitbook/assets/c d.png\n---\n# A\n',
    'unlisted.md': '# nope\n',
    '.gitbook/assets/c d.png': 'x',
  });
  const out = path.join(src, '_out');
  build({ srcDir: src, outDir: out });
  assert.ok(!fs.existsSync(path.join(out, 'unlisted.html')));
  const a = fs.readFileSync(path.join(out, 'a/index.html'), 'utf8');
  assert.match(a, /<title>A &lt;b&gt; &amp; · Nuance Help<\/title>/);
  assert.match(a, /<meta name="description" content="d">/);
  assert.match(a, /<img class="cover" src="\.\.\/assets\/c%20d\.png"/);
  assert.match(a, /rel="prev" href="\.\.\/index\.html"/);
  assert.ok(!a.includes('rel="next"'));
  assert.match(a, /<a class="external" href="https:\/\/example.com">/);
  assert.ok(fs.existsSync(path.join(out, 'assets/c d.png')));
});

test('front matter: empty block yields {} and body renders', () => {
  const { data, body } = splitFrontMatter('---\n---\n# Hi');
  assert.deepEqual(data, {});
  assert.match(renderBody(body, ''), /<h1[^>]*>Hi<\/h1>/);
});

test('front matter: whitespace-only block yields {}', () => {
  const { data, body } = splitFrontMatter('---\n\n  \n---\n# Hi');
  assert.deepEqual(data, {});
  assert.match(renderBody(body, ''), /<h1[^>]*>Hi<\/h1>/);
});

test('front matter: comment-only block yields {}', () => {
  assert.deepEqual(splitFrontMatter('---\n# note\n---\n# Hi').data, {});
});

test('front matter: leading BOM is stripped and front matter parsed', () => {
  const { data, body } = splitFrontMatter('\ufeff---\ndescription: x\n---\n# Hi');
  assert.equal(data.description, 'x');
  assert.ok(!renderBody(body, '').includes('description:'));
});

test('front matter: CRLF is parsed and not rendered', () => {
  const { data, body } = splitFrontMatter('---\r\ndescription: x\r\n---\r\n# Hi');
  assert.equal(data.description, 'x');
  assert.ok(!renderBody(body, '').includes('description:'));
});
