/*
 * posters.js: the still each world card in the Freestyle picker shows
 * while that world's orbit clip is not cached yet. npm run gen:posters, or
 * node scripts/posters.js [mapId ...] for some of them.
 *
 * A first Freestyle visit has no clips cached, and making them costs a
 * Three.js scene per world on the main thread. The cards used to spend
 * that minute as dark rectangles saying "loading", the worst moment to tell
 * somebody nothing about the places they are choosing between. Now the
 * card is a photograph of the place, the clip arrives over it, and a pilot
 * who picks early has still seen what they picked.
 *
 * Rendered, not drawn, for the same reason as scripts/og.js: a hand-made
 * picture drifts the first time the world changes and nobody notices. Each
 * still is a frame of the real shell through scripts/shots.js, from a
 * camera parked by hand, written to the path the map registry names.
 *
 * REGENERATE, DO NOT EDIT, the same rule as the icons and the share card.
 * A run takes minutes: each world is built in headless Chromium at the
 * authored preset, one at a time.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAPS } from '../src/maps/registry.js';
import { CLIP_W, CLIP_H } from '../src/share/orbitcache.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The quality og.js and gatecards.js use: a card is 340 px wide, lossless
 * would be four times the bytes for no visible difference, and every
 * generator that puts rendered frames in the tree puts the same kind in. */
const QUALITY = 82;

/*
 * The cameras are the design: one per world, parked so the frame reads as
 * a PLACE at 340 px wide. An establishing three-quarter view with a
 * horizon, from outside, far enough back that the landmark is in shot; not
 * a corridor, not a wall two metres away.
 *
 * [eyeX, eyeY, eyeZ, targetX, targetY, targetZ] in metres, Y up, in the
 * render (world) frame, not the physics frame (see CLAUDE.md).
 */
const CAMERAS = {
  /* Down the valley from 260 m over its south end: the village and its
   * church by the river, the road, forest on both walls, the range closing
   * the far end. The place, not a street in it. */
  alps: [300, 260, 900, -120, 60, -400],
  /* The same valley from lower and further east, looking north over the
   * village to the valley head: meadows, road, forest on both walls, rock
   * and snow above, haze on the far wall, which is what tells it from the
   * Alps card at a glance. Made with SIM_GPU=1: the card is the
   * photographic look, and the software rasteriser samples textures at
   * lower precision than a GPU. */
  swiss2: [250, 140, 700, -150, 40, -500],
};

function shotArgs(out, id, camera) {
  const q = JSON.stringify(id);
  return [
    `--out=${out}`,
    /* The clip's own frame size, so the clip that replaces the still is the
     * same picture at the same shape and the card does not jump. */
    `--w=${CLIP_W}`,
    `--h=${CLIP_H}`,
    `--jpeg=${QUALITY}`,
    /* Headless Chromium rasterises on the CPU, so boot would detect a slow
     * machine and drop the preset; the poster is the authored look. */
    '--graphics=high',
    /* Boot on the light world and swap: a page naming no world opens on
     * the title's own valley (src/boot.js). */
    '--url=/index.html?map=alps',
    'until:!!window.__boot && window.__boot().frames > 2',
    `eval:(() => { window.__setMap(${q}); return 'swap'; })()`,
    /* The id as well as ready: ready alone is still true of the previous
     * world for a frame or two after the swap. */
    `until:window.__map().id === ${q} && window.__map().ready`,
    /* The whole overlay goes. A poster is a picture inside the interface,
     * and a menu drawn on a menu is nonsense. */
    "eval:(() => { const n = document.getElementById('ui'); if (n) { n.style.display = 'none'; } return 'hidden'; })()",
    /* The world's animation and the sun's shadow map settle over a few
     * frames; a first-frame capture has black shadows and stopped traffic. */
    'wait:900',
    `eval:JSON.stringify((() => { window.__setCam(${camera.join(',')}); window.__posterFrame = window.__boot().frames; return "camera"; })())`,
    /* Frames, not milliseconds: the camera lands on the next animation
     * frame, and a wall-clock wait on a software rasteriser sometimes
     * captures the one before. */
    'until:window.__boot().frames > window.__posterFrame + 5',
    `shot:${id}`,
  ];
}

const wanted = process.argv.slice(2);
const targets = MAPS.filter((m) => m.poster && CAMERAS[m.id] && (wanted.length === 0 || wanted.includes(m.id)));
if (targets.length === 0) {
  throw new Error(`No poster to make. Known: ${MAPS.filter((m) => m.poster).map((m) => m.id).join(', ')}`);
}
/* Without a camera here the card would silently keep the loading
 * rectangle, so say so on every run. */
for (const m of MAPS) {
  if (m.poster && !CAMERAS[m.id]) {
    console.warn(`${m.id} declares a poster and has no camera in this file.`);
  }
}

const out = await mkdtemp(join(tmpdir(), 'fdfpv-posters-'));
try {
  for (const m of targets) {
    const r = spawnSync('node',[join(root, 'scripts', 'shots.js'), ...shotArgs(out, m.id, CAMERAS[m.id])], {
      cwd: root, stdio: 'inherit',
    });
    if (r.status !== 0) {
      throw new Error(`shots.js exited ${r.status} on ${m.id}`);
    }
    const dest = resolve(root, m.poster);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(out, `${m.id}.jpg`), dest);
    console.log(`${m.id} -> ${dest}`);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
