/*
 * gatecards.js: the two pictures on the first screen's choice cards, Race
 * and Free Flight, written to assets/gate/race.jpg and
 * assets/gate/flight.jpg. npm run gen:gatecards.
 *
 * The first screen asks one question, what to fly, with pictures rather
 * than words, because the difference between the choices is a difference
 * between PLACES (the argument is in PROGRESS.md). They are files, not
 * live: the shell records clips of the world the player is actually in, so
 * an unvisited world has none, and the gate is what a first visit opens on
 * and must show something on the first frame with no network. They are
 * frames of the real renderer through scripts/shots.js, the harness og.js
 * uses, so they cannot drift into a drawing of a game that no longer looks
 * like this.
 *
 * REGENERATE, DO NOT EDIT, the same rule as og.js and the icons. The Free
 * Flight card wants the real GPU: run it as SIM_GPU=1 npm run gen:gatecards.
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* 16:10 at 900 wide: the card is at most 460 px wide on desktop and full
 * width on a phone, so this is a 2x asset for the widest case and no more.
 * JPEG because these are photographs of a shaded world, about 40 kB
 * against about 300 kB as PNG, and the front door must paint before
 * anything else has loaded. */
const W = 900;
const H = 560;
const QUALITY = 82;

/* Everything the shell draws over the world, the frame bars and the menu
 * included. The gate cards too: a capture seeds a track and an aircraft
 * into storage, but the gate reads the URL, not storage, so it is still
 * up, and the first regeneration after the title grew cards photographed
 * three cards each wearing the picture being replaced. */
const HIDE = [
  '.menu-stage', '.hint', '.lede', '.title-foot', '.bug-chip', '.brand', '.brand-best', '.keep-note',
  '.first-note', '.gate-note', '.beta-note', '.craft-showcase', '.frame-top', '.frame-bot', '.music-dock',
  '.gate-cards',
];

/*
 * The camera is parked because the attract camera always moves, so a
 * capture that only waited would differ every run. [eyeX, eyeY, eyeZ,
 * atX, atY, atZ, fovDeg?]. `anim` parks the animation clock (__animTo) so
 * moving things sit in the same place every regeneration; neither card
 * needs it today.
 */
const SHOTS = [
  /* A lit start gate at ten metres, left of centre, the rest running away
   * up the Alps strip to the right, small under the valley wall. The green
   * is the renderer's own "this is the way through" and the one colour in
   * the product that means racing. The track is six gates built on the
   * strip with the in-sim builder's own pieces, because Track mode races
   * tracks built in a world (it was once the race field's AU Nationals
   * layout). The camera sits behind the start gate and a little right, so
   * the course leaves the frame rather than stopping in it; the seated
   * aircraft waits behind the gate, out of frame. */
  {
    name: 'race',
    option: '--course=scripts/gatecards-track.json',
    camera: [6.5, 2.2, 34, -4.5, 1.5, 12],
    anim: null,
    ready: 'window.__map && window.__map().id === "alps" && window.__map().ready && window.__race().gates.length === 6',
    waves: false,
  },
  /* The photoreal valley's lake from sixty metres over its north shore,
   * looking south down the water past the boats to the village and the
   * east wall. The owner asked for swiss2 on this card, the lake
   * preferably (2026-09-25): the card is where every plane is picked and
   * the lake is where the floatplanes start. Waves on, as a pilot on the
   * water sees it. It needs SIM_GPU=1, because the CPU rasteriser does not
   * draw the photoreal look; the race card does not care. */
  {
    name: 'flight',
    option: '--url=/index.html?map=swiss2',
    camera: [330, 60, 1800, 120, 20, 2350, 44],
    anim: null,
    ready: 'window.__map && window.__map().id === "swiss2" && window.__map().ready',
    waves: true,
  },
];

function shotArgs(out, shot) {
  const steps = [
    'until:!!window.__boot && window.__boot().frames > 2',
    `until:${shot.ready}`,
    `eval:(() => { ${JSON.stringify(HIDE)}.forEach((s) => document.querySelectorAll(s).forEach((n) => { n.style.display = 'none'; })); return 'hidden'; })()`,
  ];
  if (shot.waves) {
    steps.push('expect:window.__wavesOn()', 'wait:2500');
  }
  if (shot.anim !== null) {
    steps.push(`eval:(window.__animTo(${shot.anim}), 'anim')`);
  }
  steps.push(
    `eval:(window.__setCam(${shot.camera.join(',')}), window.__gateFrame = window.__boot().frames, 'camera')`,
    /* Frames, not milliseconds: the camera override lands on the next
     * animation frame. */
    'until:window.__boot().frames > window.__gateFrame + 4',
    `shot:${shot.name}`,
  );
  return [
    `--out=${out}`,
    `--w=${W}`,
    `--h=${H}`,
    `--jpeg=${QUALITY}`,
    /* Otherwise boot detects the CPU rasteriser and drops the preset, and
     * the card's quality would depend on who regenerated it. */
    '--graphics=high',
    shot.option,
    ...steps,
  ];
}

const out = await mkdtemp(join(tmpdir(), 'fdfpv-gatecards-'));
try {
  for (const shot of SHOTS) {
    const r = spawnSync('node', [join(root, 'scripts', 'shots.js'), ...shotArgs(out, shot)], {
      cwd: root, stdio: 'inherit',
    });
    if (r.status !== 0) {
      throw new Error(`shots.js exited ${r.status} on ${shot.name}`);
    }
  }
  /* Copied only once both cards rendered, so a failed run never leaves the
   * front door with one new card and one old. */
  const dir = join(root, 'assets', 'gate');
  await mkdir(dir, { recursive: true });
  for (const shot of SHOTS) {
    const dest = join(dir, `${shot.name}.jpg`);
    await copyFile(join(out, `${shot.name}.jpg`), dest);
    console.log(`${shot.name}.jpg -> ${dest}`);
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
