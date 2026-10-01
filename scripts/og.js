/*
 * og.js: the share card, drawn by the thing it advertises.
 *
 * Every link to fdfpv.example posted anywhere renders a 1200 by 630 image, and
 * a made-up one would drift out of date the first time the world changed.
 * This one cannot: it is a frame of the real shell, rendered by the real
 * renderer, through scripts/shots.js, which is the same harness every
 * rendering bug in this project was found with.
 *
 * WHAT THE FRAME IS. The loading screen: the Itaipu key art
 * (assets/loading/wide.webp, from scripts/loading-art.js and
 * tools/loading-art/grade.py) under the name's lockup, PARAGUAYAN over
 * DRONE COMBAT over SIMULATOR with the red, white and blue slash. That
 * screen is already the product's poster, laid out by index.html's own
 * rules, so the card is that screen rather than a second design of it that
 * could disagree with it. The run waits for the shell to boot and the
 * screen to go, then brings it back over the title, so the capture is
 * never taken halfway through the fade.
 *
 * WHY THE BAR AND THE TAGLINE GO AND THE NAME STAYS. A share card is read
 * at about 500 px wide in a feed, next to a headline. The load bar and the
 * joke under it belong to a boot that is not happening, and the tagline is
 * 11 px of spaced capitals that turn to dust at that size. The name
 * survives the shrink, and it is the one thing on the card that says which
 * product this is.
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
 * Everything that is not the art and the name: the title screen under the
 * loading screen, the load bar and its joke, the failure panel and the
 * tagline.
 */
const HIDE = ['#ui', '.loading-status', '.loading-help', '.loading-tag'];

const show = `const l = document.getElementById('loading');`
  + `l.hidden = false; l.style.opacity = '1';`
  + `${JSON.stringify(HIDE)}.forEach((s) => document.querySelectorAll(s)`
  + `.forEach((n) => { n.style.display = 'none'; }));`
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
    /* Gone, not fading: finish() in src/ui/loading.js hides the screen
     * 320 ms after it starts the fade, and a screen shown again before
     * that would be hidden again under the capture. */
    "until:document.getElementById('loading').hidden",
    `eval:(() => { ${show} })()`,
    /* The art is preloaded in the head, so this is for layout and paint,
     * not for the fetch. */
    'wait:400',
    'expect:getComputedStyle(document.getElementById("loading")).backgroundImage.includes("wide.webp")',
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
