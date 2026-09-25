/*
 * gatecards.js: the pictures on the front door, drawn by the game.
 *
 * The first screen asks one question, what to fly, and it asks it with
 * pictures rather than words, because the difference between them is a
 * difference between PLACES and a sentence is a poor way to describe a
 * place. See PROGRESS.md for the argument.
 *
 * WHY THEY ARE FILES AND NOT LIVE. The shell already records a short clip of
 * a world for the picker cards, and it records the world the player is
 * actually in, so a world nobody has visited has no clip. The gate is the
 * screen a first visit opens on: whatever it shows has to be there before
 * anything has been flown, on the first frame, with no network. That is a
 * file. Two of them, and they are frames of the REAL renderer through
 * scripts/shots.js, the same harness og.js uses, so they cannot drift into
 * being a drawing of a game that no longer looks like this.
 *
 * REGENERATE, DO NOT EDIT, the same rule as og.js and the icons:
 *
 *     npm run gen:gatecards
 *
 * WHAT EACH FRAME IS, and why those numbers.
 *
 * Race is a lit start gate at eleven metres, left of centre, with the course
 * markers running away to the right and the rest of the gates small behind
 * them. The green is the renderer's own "this is the way through" and it is
 * the one colour in this product that means racing. The track under it is
 * tracks/json/trk-0870b164.json, the 2022 AU Nationals layout, because a
 * real published course is the honest thing to photograph and it is already
 * in the repository.
 *
 * Free Flight is the photoreal valley's lake from sixty metres over its
 * north shore, looking down the water to the village and the east wall:
 * the owner asked for swiss2 on that card, the lake preferably
 * (2026-09-25). It needs the real GPU, SIM_GPU=1, because the CPU
 * rasteriser does not draw the photoreal look; the race card does not.
 * The Freestyle card and its town picture were retired the same day.
 *
 * The animation clock is parked with __animTo so the train and the level
 * crossing are in the same place on every regeneration. The camera is parked
 * with __setCam for the same reason: the attract camera is always moving, so
 * a capture that just waited would be a different picture every time.
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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * 16:10, and 900 across.
 *
 * The card is at most 460 px wide on a desktop and the whole width of a
 * phone, so 900 is a two times asset for the widest case and nothing more.
 * JPEG because these are photographs of a shaded world: the same frame is
 * about 40 kB here and about 300 kB as a PNG, and the front door is the one
 * screen that has to paint before anything else has loaded.
 */
const W = 900;
const H = 560;
const QUALITY = 82;

/* Everything the shell draws over the world. The frame bars and the menu go
 * too, which og.js does not need to do because it only ever captures the
 * title, and this captures the title with a full menu on it. */
const HIDE = [
  '.menu-stage', '.hint', '.lede', '.title-foot', '.bug-chip', '.brand',
  '.brand-best', '.keep-note', '.first-note', '.gate-note', '.beta-note',
  '.wiki-teaser', '.craft-showcase', '.frame-top', '.frame-bot', '.music-dock',
  /*
   * AND THE CARDS THEMSELVES, which was missing and is why this list is
   * being read again. A capture run seeds a track and an aircraft into
   * storage, but the gate reads the URL rather than storage, so it is up:
   * the first regeneration after the title grew cards photographed the
   * cards, three of them, each wearing the picture this run was supposed
   * to be replacing.
   */
  '.gate-cards',
];

const hide = `${JSON.stringify(HIDE)}.forEach((s) => document.querySelectorAll(s)`
  + `.forEach((n) => { n.style.display = 'none'; }));`
  + `'hidden'`;

/* Camera, then the point it looks at. Metres, world frame, Y up. */
const SHOTS = [
  {
    name: 'race',
    args: ['--course=tracks/json/trk-0870b164.json'],
    /* Behind the start gate and a little to its right, so the gate is left
     * of centre and the course leaves the frame rather than stopping in it. */
    cam: [-21.5, 2.4, 36.6, -40, 1.6, 28],
    anim: null,
  },
  {
    name: 'flight',
    args: ['--url=/index.html?map=swiss2'],
    /* Over the lake's north shore in the photoreal valley, looking south
     * down the water past the boats to the village and the east wall.
     * The card is where every plane is picked, and the lake is where the
     * floatplanes start. */
    cam: [330, 60, 1800, 120, 20, 2350, 44],
    anim: null,
    ready: 'window.__map && window.__map().id === "swiss2" && window.__map().ready',
    /* The lake with its waves, as a pilot on it sees it. */
    waves: true,
  },
];

const out = await mkdtemp(join(tmpdir(), 'fdfpv-gatecards-'));
try {
  for (const shot of SHOTS) {
    const steps = [
      'until:!!window.__boot && window.__boot().frames > 2',
      ...(shot.ready ? [`until:${shot.ready}`] : []),
      `eval:(() => { ${hide} })()`,
      ...(shot.waves ? ['expect:window.__wavesOn()', 'wait:2500'] : []),
      ...(shot.anim == null ? [] : [`eval:(window.__animTo(${shot.anim}), 'anim')`]),
      `eval:(window.__setCam(${shot.cam.join(',')}),`
        + ' window.__gateFrame = window.__boot().frames, \'camera\')',
      /* Frames, not milliseconds: __setCam lands on the next animation frame
       * and a wall clock wait sometimes captures the one before it. */
      'until:window.__boot().frames > window.__gateFrame + 4',
      `shot:${shot.name}`,
    ];
    const run = spawnSync('node', [
      join(root, 'scripts/shots.js'),
      `--out=${out}`,
      `--w=${W}`,
      `--h=${H}`,
      `--jpeg=${QUALITY}`,
      /* Headless Chromium rasterises on the CPU, so boot would otherwise
       * detect a slow machine and drop the preset, and the card would come
       * out at a different quality depending on who regenerated it. */
      '--graphics=high',
      ...shot.args,
      ...steps,
    ], { cwd: root, stdio: 'inherit' });

    if (run.status !== 0) {
      throw new Error(`shots.js exited ${run.status} on ${shot.name}`);
    }
  }

  const dir = join(root, 'assets', 'gate');
  await mkdir(dir, { recursive: true });
  for (const shot of SHOTS) {
    await copyFile(join(out, `${shot.name}.jpg`), join(dir, `${shot.name}.jpg`));
    console.log(`${shot.name}.jpg -> ${join(dir, `${shot.name}.jpg`)}`);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
