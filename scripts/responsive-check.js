/*
 * responsive-check.js: a pilot using a room is never locked out of it. The
 * Freestyle room is driven with a key press every 400 ms for 7 s while every
 * gap between animation frames is recorded; too few frames, one very long
 * gap, or repeated long gaps fail.
 *
 *     node scripts/responsive-check.js      (npm run lint:responsive)
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

/*
 * The report was "the freestyle page is unresponsive when I get to it,
 * becomes responsive after a time". Measured on arrival with a cold clip
 * cache it gave 23 frames in 10.4 s, one of them a 5155 ms gap with no paint
 * at all. Each world card's preview loads src/share/orbit.html in a
 * same-origin iframe, and that builds a whole Three.js scene on the page's
 * own thread. The clip is cached per browser afterwards, so it is a
 * first-visit cost worth paying, only not while somebody is using the room.
 *
 * Responsive is not how long something takes but whether the page can paint
 * and answer a key while it happens. So the room is driven like a person
 * would drive it and the frame gaps are measured: a long gap is the freeze,
 * whatever caused it.
 *
 * Freestyle only, on purpose. main.js keeps the 3D world hidden behind that
 * room, so a gap there is the room's own fault. The Race room keeps the
 * world live behind its cards, and on a software rasteriser a world frame
 * costs about 200 ms: driving it reads 33 frames in 7 s, which looks like a
 * lock-up and is really a missing GPU. A check that cannot tell those apart
 * fails on every machine without a GPU and teaches people to ignore it.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const ROOMS = ['freestyle'];
const DRIVE_MS = 7000;
const KEY_EVERY_MS = 400;
const KEY = 'ArrowDown';

/*
 * Budgets come from measurement: before the fix the driven room gave 10
 * frames and a 4321 ms worst gap, after it 338 frames and 960 ms. They sit
 * well inside the fixed behaviour and well outside the broken one, so noise
 * on a shared container does not fail the check. One slow frame is allowed
 * (tearing down an iframe mid-build costs something, and the alternative is
 * never recording a preview); a second of nothing, repeatedly, is not.
 */
const MIN_FRAMES = 120;
const MAX_GAP_MS = 1600;
const LONG_GAP_MS = 500;
const MAX_LONG_GAPS = 2;

const seed = `try {
  const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
} catch (e) {}`;

/* The first-run gate is set aside by state: the rooms are what this drives.
 * The press goes through the shell's own key handler, the same path a
 * keyboard takes. State lives on window so a later evaluation can read it. */
function startDriving(room) {
  return `(() => {
    const ui = window.__ui;
    ui.firstRun = false;
    if (!ui.mode) {
      ui.mode = 'race';
    }
    const rec = { gaps: [], last: performance.now(), keys: 0 };
    window.__responsive = rec;
    ui.show(${JSON.stringify(room)});
    const frame = (now) => {
      rec.gaps.push(Math.round(now - rec.last));
      rec.last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    rec.keys = setInterval(() => ui.handleKey(${JSON.stringify(KEY)}), ${KEY_EVERY_MS});
    return true;
  })()`;
}

const STOP_AND_READ = `(() => {
  const rec = window.__responsive;
  clearInterval(rec.keys);
  const gaps = rec.gaps.slice();
  return JSON.stringify({
    frames: gaps.length,
    worst: gaps.length ? Math.max(...gaps) : 0,
    long: gaps.filter((g) => g > ${LONG_GAP_MS}).length,
  });
})()`;

async function measure(room) {
  const page = await openPage({ root, width: 1280, height: 720, seed: [seed] });
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);
    await page.evaluate(startDriving(room));
    /* A fixed window on purpose: this measures behaviour over time, it is
     * not waiting for a state. */
    await page.sleep(DRIVE_MS);
    return JSON.parse(await page.evaluate(STOP_AND_READ));
  } finally {
    await page.close();
  }
}

function problems(room, { frames, worst, long }) {
  const seconds = DRIVE_MS / 1000;
  const out = [];
  if (frames < MIN_FRAMES) {
    out.push(`${room}: only ${frames} frames in ${seconds}s, the room is locked up`);
  }
  if (worst > MAX_GAP_MS) {
    out.push(`${room}: a ${worst} ms frame gap, the page stopped painting`);
  }
  if (long > MAX_LONG_GAPS) {
    out.push(`${room}: ${long} gaps over half a second while being driven`);
  }
  return out;
}

async function main() {
  console.log(`responsive check: driving each room for ${DRIVE_MS / 1000}s, a key every ${KEY_EVERY_MS}ms`);
  console.log('');
  const failures = [];
  for (const room of ROOMS) {
    const r = await measure(room);
    console.log(`  ${room.padEnd(10)} ${String(r.frames).padStart(4)} frames  worst gap ${String(r.worst).padStart(5)} ms  ${r.long} gap(s) over ${LONG_GAP_MS} ms`);
    failures.push(...problems(room, r));
  }
  console.log('');
  if (failures.length) {
    console.log(`FAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('PASS, a pilot using a room is never locked out of it');
  return 0;
}

process.exit(await main());
