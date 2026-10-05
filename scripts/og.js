/*
 * og.js: the share card, drawn by the thing it advertises.
 *
 * Every link to paraguayandronecombatsimulator.com posted anywhere renders
 * a 1200 by 630 image, and a made-up one would drift out of date the first
 * time the world changed. This one cannot: it is a frame of the real shell,
 * rendered by the real renderer, through scripts/shots.js, which is the
 * same harness every rendering bug in this project was found with.
 *
 * WHAT THE FRAME IS. The Itaipu key art with the dam under attack
 * (assets/keyart/boom-wide.webp, from scripts/loading-art.js and
 * tools/loading-art/grade.py), with the name's lockup over the sky at the
 * top right: the flag as a bar ahead of PARAGUAYAN, DRONE COMBAT in the
 * metal, SIMULATOR between two rules. It was the calm frame, wide.webp,
 * until the owner saw it as a WhatsApp preview and called it horrible:
 * the Striker was cropped to a dark wedge at the left edge and nothing in
 * the picture said combat. This frame has the whole aircraft and three
 * blasts on the spillway, which is the game in one look at 500 px.
 * The lockup is the title's own .lockup-box, cloned out of the title
 * (wordmark() in src/ui/ui.js), so the card draws exactly what the game
 * draws and follows it whenever the mark changes. Cloning the heading
 * alone would lose the box's rules and draw the base .lockup, the retired
 * slash. The column and the grade below are the card's own layout,
 * because no screen in the game puts the name over the picture. The run
 * waits for the shell to boot, the boot screen to go and
 * both faces of the name to load, so nothing is captured mid fade or in
 * the fallback face.
 *
 * THE CACHE. WhatsApp, Telegram and the rest keep a link's card for days
 * against its image URL, so index.html asks for og.png?h= the first 8 hex
 * of its SHA 256, and this script writes that into index.html whenever it
 * writes the card here. scripts/og-check.js holds the two together. Not
 * ?v=, which is the deploy's version stamp (scripts/stamp-version.js), and
 * scripts/version-check.js reads any ?v= in the checkout as a page that
 * was stamped and committed.
 *
 * WHY ONLY THE NAME. A share card is read at about 500 px wide in a feed,
 * next to a headline. The name survives the shrink, and it is the one thing
 * on the card that says which product this is.
 *
 * WHY A PALETTE. The frame is a photograph as far as PNG is concerned,
 * about 700 KB at full colour, and a crawler fetches it for every share.
 * Quantised to 256 colours by libimagequant, through Pillow, the same
 * Python the key art is graded with, it is under 300 KB, and its dither
 * keeps the sunset free of the bands and stray red pixels that Pillow's
 * own median cut and octree leave in it. index.html's meta tags declare
 * image/png, so it stays a PNG.
 *
 * REGENERATE, DO NOT EDIT, the same rule as the icons:
 *
 *     npm run gen:og                                  # this repo
 *     node scripts/og.js . ../fdfpv-landing \
 *                          ../fdfpv-leaderboard/public
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

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Facebook, X and LinkedIn all read 1.91:1 and all crop anything else. */
const W = 1200;
const H = 630;

/*
 * The card, over everything else on the page. The picture covers the card
 * and sits a little low, so the Striker is whole in the left third, the
 * blasts run along the dam through the middle, and the sky above them is
 * left for the name. A thumbnail is a small, dim thing, so the picture is
 * lifted a little; the grade then darkens the sky and the foot, so the
 * metal reads against a dark ground at a feed's 500 px and the flag and
 * the fire stay the brightest colours on the card.
 */
const ART = 'assets/keyart/boom-wide.webp';
const CARD = 'position:fixed;inset:0;z-index:50;background:#0c0e0d;';
const PICTURE = 'position:absolute;inset:0;'
  + `background:url("${ART}") 50% 62% / cover no-repeat;`
  + 'filter:brightness(1.1) contrast(1.05) saturate(1.08);';
const GRADE = 'position:absolute;inset:0;background:'
  + 'linear-gradient(180deg, rgba(8, 10, 9, 0.62) 0%, rgba(8, 10, 9, 0.38) 30%, rgba(8, 10, 9, 0) 48%),'
  + 'linear-gradient(0deg, rgba(8, 10, 9, 0.4) 0%, rgba(8, 10, 9, 0) 22%);';
const COLUMN = 'position:absolute;top:7%;right:4%;width:52%;';

const show = `const card = document.createElement('div');`
  + `card.id = 'og-card'; card.style.cssText = ${JSON.stringify(CARD)};`
  + `const pic = document.createElement('div'); pic.id = 'og-picture'; pic.style.cssText = ${JSON.stringify(PICTURE)};`
  + `const grade = document.createElement('div'); grade.style.cssText = ${JSON.stringify(GRADE)};`
  + `const col = document.createElement('div'); col.style.cssText = ${JSON.stringify(COLUMN)};`
  + `const name = document.querySelector('.screen-title .lockup-box').cloneNode(true);`
  + `name.style.width = '100%'; name.style.margin = '0';`
  + `col.append(name); card.append(pic, grade, col); document.body.append(card);`
  + `window.__ogArt = new Image(); window.__ogArt.src = ${JSON.stringify(ART)};`
  + `'shown'`;

/* Both faces of the name, or the card is shot in the fallback. */
const FONTS = `[...document.fonts].filter((f) => f.family.includes('Saira Lockup') && f.status === 'loaded').length === 2`;

/* LIBIMAGEQUANT by name, so a Pillow built without it fails here instead
 * of quietly handing back a quantiser that bands the sky. */
const quantise = `
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert('RGB')
img.quantize(colors=256, method=Image.Quantize.LIBIMAGEQUANT,
             dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[2], optimize=True)
`;

/* og:image and twitter:image, and nothing else, carry the card's URL;
 * stamped only when the card written is this repository's own. */
async function stampPage(card) {
  const v = createHash('sha256').update(await readFile(card)).digest('hex').slice(0, 8);
  const page = join(root, 'index.html');
  const html = await readFile(page, 'utf8');
  const urls = /\/og\.png(\?h=[0-9a-f]+)?"/g;
  const n = html.match(urls)?.length ?? 0;
  if (n !== 2) {
    throw new Error(`index.html names og.png ${n} times, expected og:image and twitter:image`);
  }
  await writeFile(page, html.replace(urls, `/og.png?h=${v}"`));
  console.log(`index.html -> og.png?h=${v}`);
}

const targets = (process.argv.slice(2).length ? process.argv.slice(2) : ['.'])
  .map((d) => resolve(root, d));

const out = await mkdtemp(join(tmpdir(), 'fdfpv-og-'));
try {
  const run = spawnSync('node', [
    join(root, 'scripts/shots.js'),
    `--out=${out}`,
    `--w=${W}`,
    `--h=${H}`,
    /* The world behind the loading screen is never seen, so it boots at the
     * cheapest preset: at High, headless Chromium's software rasteriser
     * took about 25 s to draw the first frame, longer than an until: waits. */
    '--graphics=low',
    /* The simulator in, the world built, then the boot screen gone, not
     * fading: the card goes over the gate, never over the boot screen's
     * fade. One wait per stage, because each until: gives up at 20 s and a
     * cold boot on a busy machine takes longer than that end to end. */
    'until:window.__loading.timings.sim',
    'until:window.__loading.timings.world',
    /* The first frame and the loader's own finish are stages too. Measured
     * on an M1 on 2026-10-05, the software rasteriser's first frame came
     * 18.5 s after the world and the loader cleared 10 s after that, so the
     * single wait that used to cover both ran out with the card half up.
     * The plain wait is the part of the first frame's 18.5 s that one
     * until: cannot be trusted to hold. */
    'wait:8000',
    'until:window.__loading.timings.frame',
    'until:window.__loading.timings.total',
    "until:document.getElementById('pdcs-loader').hidden",
    `eval:(() => { ${show} })()`,
    /* The art is this card's own background, so this waits for the file
     * to have arrived and decoded as well as for layout. */
    'until:window.__ogArt.complete && window.__ogArt.naturalWidth > 0',
    `until:${FONTS}`,
    'wait:600',
    `expect:getComputedStyle(document.getElementById("og-picture")).backgroundImage.includes(${JSON.stringify(ART)})`,
    'shot:og',
  ], { cwd: root, stdio: 'inherit' });

  if (run.status !== 0) {
    throw new Error(`shots.js exited ${run.status}`);
  }

  const card = join(out, 'og-256.png');
  const q = spawnSync('python3', ['-c', quantise, join(out, 'og.png'), card],
    { cwd: root, stdio: 'inherit' });
  if (q.status !== 0) {
    throw new Error(`quantising og.png exited ${q.status}`);
  }

  for (const dir of targets) {
    await mkdir(dir, { recursive: true });
    await copyFile(card, join(dir, 'og.png'));
    console.log(`og.png -> ${join(dir, 'og.png')}`);
  }

  if (targets.includes(root)) {
    await stampPage(card);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
