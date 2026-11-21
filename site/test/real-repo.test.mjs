import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { build } from '../build.mjs';
import { parseSummary } from '../lib/summary.mjs';
import { outPathFor } from '../lib/links.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-real-'));
const entries = parseSummary(fs.readFileSync(path.join(repo, 'SUMMARY.md'), 'utf8')).filter((e) => e.kind === 'page');
const expected = entries.map((e) => outPathFor(e.source));
const read = (p) => fs.readFileSync(path.join(out, p), 'utf8');

function* walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else yield p;
  }
}

before(() => {
  build({ srcDir: repo, outDir: out });
});

test('a. exactly the 50 SUMMARY pages exist', () => {
  assert.equal(expected.length, 50);
  const html = [...walk(out)].map((f) => path.relative(out, f).split(path.sep).join('/')).filter((f) => f.endsWith('.html'));
  assert.deepEqual(html.sort(), [...expected].sort());
  assert.ok(read('index.html').includes('Welcome to Nuance: Your Platform, Your Voice'));
});

test('b. nav lists 50 entries in order, one aria-current pointing at the page', () => {
  for (const p of expected) {
    const root = parse(read(p));
    const links = root.querySelectorAll('nav[aria-label="Help pages"] a');
    assert.equal(links.length, 50, p);
    const dir = path.posix.dirname(p);
    const targets = links.map((a) => path.posix.normalize(path.posix.join(dir, decodeURIComponent(a.getAttribute('href')))));
    assert.deepEqual(targets, expected, p);
    const cur = root.querySelectorAll('nav a[aria-current="page"]');
    assert.equal(cur.length, 1, p);
    assert.equal(path.posix.normalize(path.posix.join(dir, decodeURIComponent(cur[0].getAttribute('href')))), p);
  }
});

test('c/d. no front matter text, no script, no .gitbook/', () => {
  for (const p of expected) {
    const h = read(p);
    for (const bad of ['coverY', 'tableOfContents', 'layout:', 'visible: true', '<script', '.gitbook/']) assert.ok(!h.includes(bad), p + ' contains ' + bad);
  }
});

test('e. every relative href/src resolves to a file', () => {
  let checked = 0;
  for (const p of expected) {
    const root = parse(read(p));
    for (const el of root.querySelectorAll('[href],[src]')) {
      const raw = el.getAttribute('href') ?? el.getAttribute('src');
      if (!raw || raw.startsWith('/') || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
      let rel = decodeURIComponent(raw.replace(/[?#].*$/, ''));
      if (rel.endsWith('/')) rel += 'index.html';
      const target = path.join(out, path.dirname(p), rel);
      assert.ok(fs.existsSync(target), p + ' -> ' + raw);
      checked++;
    }
  }
  assert.ok(checked > 500);
});

test('f. NFC and NFD Krem Lacivert covers', () => {
  const nfc = 'Krem Lacivert Kitabevi Laptop Mockup İndirim Duyurusu Instagram Gönderisi (1280 x 720 piksel).png'.normalize('NFC');
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  const names = fs.readdirSync(path.join(out, 'assets'));
  assert.ok(names.includes(nfc));
  assert.ok(names.includes(nfd));
  const cover = (p) => decodeURIComponent(parse(read(p)).querySelector('img.cover').getAttribute('src'));
  assert.equal(cover('getting-started/index.html'), '../assets/' + nfc);
  assert.equal(cover('publications/index.html'), '../assets/' + nfd);
  assert.equal(fs.readdirSync(path.join(repo, '.gitbook/assets')).length, names.length);
});

test('g. front page cards', () => {
  const root = parse(read('index.html'));
  const cards = root.querySelectorAll('.card');
  assert.equal(cards.length, 6);
  for (const c of cards) assert.ok(c.querySelector('img'));
  assert.ok(!root.text.includes('how-to-register.md'));
  assert.ok(!root.text.includes('register (2).png'));
});
