/*
 * og-check.js: the link preview, as a crawler reads it. Plain Node, no
 * browser. Run with npm run og:check.
 *
 * WhatsApp, Telegram, Facebook, X and the rest read index.html's social
 * tags without running a line of the shell, and keep what they read for
 * days. So every tag a preview is built from must be there, absolute and on
 * the game's own domain; the copy must fit where it is shown (a search
 * result cuts a description at about 160 characters, a card about 200) and
 * hold no dash (CLAUDE.md); the image tags must state og.png's real size
 * and type; and the image URL's ?h= must be the hash of the og.png beside
 * it, which is what makes a new card a new URL (scripts/og.js writes it).
 *
 * The parsing is a regular expression over the head, the same as a
 * crawler's, so a fixture below proves each rule can fail before the page
 * is judged by it.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const ORIGIN = 'https://paraguayandronecombatsimulator.com/';
/* The size a share card is fetched at on every share; og.js quantises to
 * stay under it. */
const MAX_BYTES = 300 * 1024;
const W = 1200;
const H = 630;
/* Every Unicode dash and the minus sign, and a hyphen standing alone as a
 * dash would. A hyphen inside a word is a hyphen. */
const DASH = /[\u2010-\u2015\u2212]|\s-\s|--/;

/* Tags read as copy, with the longest each may be. */
const COPY = {
  title: 70,
  description: 160,
  'og:site_name': 60,
  'og:title': 90,
  'og:description': 200,
  'og:image:alt': 420,
  'twitter:title': 70,
  'twitter:description': 200,
  'twitter:image:alt': 420,
};

/* Every meta tag's content by its name or property, plus the title and the
 * canonical link. A tag named twice is an error, since a crawler takes one
 * of the two and which one is not specified. */
function headTags(html) {
  const head = html.slice(0, html.indexOf('</head>'));
  const tags = new Map();
  const errors = [];
  const put = (k, v) => {
    if (tags.has(k)) {
      errors.push(`${k} appears twice`);
    }
    tags.set(k, v);
  };
  for (const m of head.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g)) {
    put(m[1], m[2]);
  }
  const title = head.match(/<title>([^<]*)<\/title>/);
  if (title) {
    put('title', title[1]);
  }
  const canonical = head.match(/<link rel="canonical" href="([^"]+)"/);
  if (canonical) {
    put('canonical', canonical[1]);
  }
  return { tags, errors };
}

/* The PNG's own width and height, from its IHDR chunk. */
function pngSize(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig || buf.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function judge(html, png) {
  const { tags, errors } = headTags(html);
  const need = (k) => {
    const v = tags.get(k);
    if (v == null || v === '') {
      errors.push(`${k} is missing`);
    }
    return v ?? '';
  };

  for (const [k, max] of Object.entries(COPY)) {
    const v = need(k);
    if (v.length > max) {
      errors.push(`${k} is ${v.length} characters, over ${max}: "${v}"`);
    }
    if (DASH.test(v)) {
      errors.push(`${k} holds a dash: "${v}"`);
    }
  }

  for (const k of ['canonical', 'og:url']) {
    if (need(k) !== ORIGIN) {
      errors.push(`${k} is ${tags.get(k)}, not ${ORIGIN}`);
    }
  }
  need('og:type');
  if (need('og:locale') !== 'en_US') {
    errors.push(`og:locale is ${tags.get('og:locale')}, not en_US, the page's copy`);
  }
  if (need('twitter:card') !== 'summary_large_image') {
    errors.push('twitter:card is not summary_large_image, so X would draw a small square');
  }

  const image = need('og:image');
  if (need('twitter:image') !== image) {
    errors.push('twitter:image is not og:image');
  }
  const url = image.match(/^(.*\/)og\.png\?h=([0-9a-f]{8})$/);
  if (!url || url[1] !== ORIGIN) {
    errors.push(`og:image is ${image}, not ${ORIGIN}og.png?h= and 8 hex`);
  } else {
    const v = createHash('sha256').update(png).digest('hex').slice(0, 8);
    if (url[2] !== v) {
      errors.push(`og:image asks for ?h=${url[2]} but og.png hashes to ${v}: run npm run gen:og, or stamp ?h=${v}`);
    }
  }

  if (need('og:image:type') !== 'image/png') {
    errors.push(`og:image:type is ${tags.get('og:image:type')}, not image/png`);
  }
  const size = pngSize(png);
  if (!size) {
    errors.push('og.png is not a PNG');
  } else {
    if (size.w !== W || size.h !== H) {
      errors.push(`og.png is ${size.w} by ${size.h}, not ${W} by ${H}`);
    }
    if (need('og:image:width') !== String(size.w) || need('og:image:height') !== String(size.h)) {
      errors.push(`og:image:width and height say ${tags.get('og:image:width')} by ${tags.get('og:image:height')}, og.png is ${size.w} by ${size.h}`);
    }
  }
  if (png.length > MAX_BYTES) {
    errors.push(`og.png is ${png.length} bytes, over ${MAX_BYTES}`);
  }
  return { tags, errors };
}

/* Each fixture breaks one rule in a copy of the real page and must fail
 * on exactly that. */
const html = await readFile(join(root, 'index.html'), 'utf8');
const png = await readFile(join(root, 'og.png'));

const FIXTURES = [
  ['an en dash in the description', (h) => h.replace(/(name="description" content=")/, '$1Fly \u2013 ')],
  ['a spaced hyphen in og:title', (h) => h.replace(/(property="og:title" content=")/, '$1Fly - ')],
  ['a description over 160', (h) => h.replace(/(name="description" content=")/, `$1${'x'.repeat(161)}`)],
  ['a relative og:image', (h) => h.replace(/(property="og:image" content=")https:\/\/[^/]+\//, '$1/')],
  ['a stale ?h=', (h) => h.replace(/(property="og:image" content="[^"]*\?h=)[0-9a-f]{8}/, '$1deadbeef')],
  ['a wrong og:image:width', (h) => h.replace(/(property="og:image:width" content=")\d+/, '$1600')],
  ['no og:image:alt', (h) => h.replace(/\s*<meta property="og:image:alt"[^>]*>/, '')],
  ['og:url twice', (h) => h.replace(/(<meta property="og:url"[^>]*>)/, '$1$1')],
];

let failed = 0;
for (const [what, breakIt] of FIXTURES) {
  const broken = breakIt(html);
  if (broken === html) {
    console.log(`FIXTURE did not apply: ${what}`);
    failed += 1;
    continue;
  }
  if (judge(broken, png).errors.length === 0) {
    console.log(`FIXTURE passed but should fail: ${what}`);
    failed += 1;
  }
}

const { tags, errors } = judge(html, png);
for (const e of errors) {
  console.log(`FAIL ${e}`);
}
failed += errors.length;

if (failed) {
  console.log(`og-check: ${failed} failure(s)`);
  process.exit(1);
}
console.log(`og-check: ${tags.size} head tags, og.png ${png.length} bytes at ${W} by ${H}, ?h= matches, ${FIXTURES.length} fixtures fail as they should`);
