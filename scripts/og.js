/*
 * og.js: the share card, drawn by the thing it advertises.
 *
 * Every link to fdfpv.example posted anywhere renders a 1200 by 630 image, and
 * a made-up one would drift out of date the first time the world changed.
 * This one cannot: it is a frame of the real shell, rendered by the real
 * renderer, through scripts/shots.js, which is the same harness every
 * rendering bug in this project was found with.
 *
 * WHAT THE FRAME IS. The Itaipu key art (assets/keyart/wide.webp, from
 * scripts/loading-art.js and tools/loading-art/grade.py), the picture
 * behind the title's gate, with the name's lockup over it in a column on
 * the right: PARAGUAYAN over DRONE COMBAT over SIMULATOR with the red,
 * white and blue slash. The lockup is the title's own heading and the
 * page's own .lockup rules, cloned, so the name on the card cannot disagree
 * with the name in the game. The column and the grade below are the card's
 * own layout, because no screen in the game puts the name over the picture
 * this way: the boot screen is the bootloader and carries neither, and the
 * gate puts its cards over the picture. The run waits for the shell to boot and
 * the boot screen to go, so nothing is captured mid fade.
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
import { mkdtemp, rm, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Facebook, X and LinkedIn all read 1.91:1 and all crop anything else. */
const W = 1200;
const H = 630;

/*
 * The card, over everything else on the page. The picture's position and
 * the grade are the ones the loading screen gave it when it carried the
 * art, so the card is the one already shared: the right hand third and the
 * foot darkened under the name, the Striker on the left left as rendered.
 */
const ART = 'assets/keyart/wide.webp';
const CARD = 'position:fixed;inset:0;z-index:50;'
  + `background:#0c0e0d url("${ART}") 30% 50% / cover no-repeat;`;
const GRADE = 'position:absolute;inset:0;background:'
  + 'linear-gradient(90deg, rgba(8, 10, 9, 0) 34%, rgba(8, 10, 9, 0.52) 64%, rgba(8, 10, 9, 0.74) 100%),'
  + 'linear-gradient(0deg, rgba(8, 10, 9, 0.62) 0%, rgba(8, 10, 9, 0) 34%);';
const COLUMN = 'position:absolute;top:0;bottom:0;right:6vw;width:min(40vw, 700px);'
  + 'display:flex;flex-direction:column;justify-content:center;';

const show = `const card = document.createElement('div');`
  + `card.id = 'og-card'; card.style.cssText = ${JSON.stringify(CARD)};`
  + `const grade = document.createElement('div'); grade.style.cssText = ${JSON.stringify(GRADE)};`
  + `const col = document.createElement('div'); col.style.cssText = ${JSON.stringify(COLUMN)};`
  + `const name = document.querySelector('.screen-title .lockup').cloneNode(true);`
  + `name.style.fontSize = 'clamp(56px, 8.5vw, 170px)'; name.style.alignSelf = 'flex-start';`
  + `col.append(name); card.append(grade, col); document.body.append(card);`
  + `'shown'`;

/* LIBIMAGEQUANT by name, so a Pillow built without it fails here instead
 * of quietly handing back a quantiser that bands the sky. */
const quantise = `
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert('RGB')
img.quantize(colors=256, method=Image.Quantize.LIBIMAGEQUANT,
             dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[2], optimize=True)
`;

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
    "until:document.getElementById('loading').hidden",
    `eval:(() => { ${show} })()`,
    /* The art is fetched by this background, so this waits for the file
     * the gate itself decoded (armTitleArt) as well as for layout. */
    "until:document.querySelector('.screen-title.has-art')",
    'wait:600',
    `expect:getComputedStyle(document.getElementById("og-card")).backgroundImage.includes(${JSON.stringify(ART)})`,
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
} finally {
  await rm(out, { recursive: true, force: true });
}
