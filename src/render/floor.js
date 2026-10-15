/*
 * floor.js: the minimum frame rate, and the one thing the shell does
 * under it: it says so once a world, in flight, with the Graphics preset
 * that may hold it (docs/redesign/COMPLETENESS.md item 71, docs/BUDGETS.md,
 * The floor).
 *
 * THE NUMBER IS THE OWNER'S. FLOOR_FPS is null until the owner sets it,
 * and while it is null nothing here ever fires: today's pilot sees what
 * yesterday's did. Setting it is the whole of the decision; the
 * measurement and the words are already here.
 *
 * WHAT "HOLDS" MEANS. The 95th percentile drawn frame interval of the last
 * FLOOR_WINDOW frames is at most 1000 / FLOOR_FPS ms: what a pilot feels
 * as stutter, and the reading docs/BUDGETS.md's tables give per row (its
 * frame p95 column, and "holds 30 fps" on the Jetson). An average would
 * pass a world that hitches every second.
 *
 * WHY A WARNING AND NOT AN AUTOMATIC STEP DOWN. Changing the preset
 * rebuilds the world (src/render/quality.js), mid flight, and a pilot who
 * chose High on a slow card chose it. The resolution pacer
 * (src/render/dynres.js) already buys back what pixels can; this says
 * when they could not.
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

import { GRAPHICS_IDS } from './quality.js';

/*
 * Frames a second: the owner's floor, pending (COMPLETENESS 71). null is
 * none. The candidates, by the 95th percentile frame of docs/BUDGETS.md's
 * rows (The floor):
 *
 *   30  this box's RTX 3060 Ti (GPU 1, shared) holds it in every row at
 *       every preset (worst p95 21.7 ms, a full room at High); the Jetson
 *       AGX Orin at MODE_50W holds it at Low in the menu, the Alps and
 *       Itaipu, not in the Swiss valley (39.9 ms) or the Interior
 *       (47.4 ms, on its main thread, so no preset helps).
 *   60  this box holds it in every row at every preset but a full room
 *       at Medium and High (18.6 and 21.7 ms, taken with the card 55 and
 *       81 % busy with other checks); the Orin only in the menu and the
 *       Alps at Low.
 */
export const FLOOR_FPS = null;

/* Frames judged at once: ten seconds at 60 fps, so the 95th percentile is
 * the 30 slowest, not one hitch. */
export const FLOOR_WINDOW = 600;
/* Frames between two judgements: a sort of FLOOR_WINDOW is not a per
 * frame cost. */
const EVERY = 60;
/* An interval this long is a pause, a hidden tab or a world loading, not
 * a frame: the count starts again (as src/ui/perfoverlay.js GAP_MS). */
const GAP_MS = 2000;

/*
 * A watch over drawn frames. frame(nowMs, capHz) once a drawn frame in
 * flight returns true once, the first time the window holds less than
 * `floorFps`; never with floorFps null, nor while the pilot's own frame
 * cap is at or under it. reset() for a new world.
 */
export function createFloorWatch(floorFps = FLOOR_FPS) {
  const iv = new Float64Array(FLOOR_WINDOW);
  const sorted = new Float64Array(FLOOR_WINDOW);
  let n = 0;
  let head = 0;
  let last = -1;
  let since = 0;
  let warned = false;
  function reset() {
    n = 0;
    head = 0;
    last = -1;
    since = 0;
    warned = false;
  }
  function frame(nowMs, capHz = 0) {
    if (floorFps == null || warned || (capHz > 0 && capHz <= floorFps)) {
      return false;
    }
    const d = last < 0 ? 0 : nowMs - last;
    last = nowMs;
    if (d > GAP_MS) {
      n = 0;
      head = 0;
      since = 0;
      return false;
    }
    if (d <= 0) {
      return false;
    }
    iv[head] = d;
    head = (head + 1) % FLOOR_WINDOW;
    n = Math.min(FLOOR_WINDOW, n + 1);
    since += 1;
    if (n < FLOOR_WINDOW || since < EVERY) {
      return false;
    }
    since = 0;
    sorted.set(iv);
    sorted.sort();
    warned = sorted[Math.ceil(0.95 * FLOOR_WINDOW) - 1] > 1000 / floorFps;
    return warned;
  }
  return { frame, reset, warned: () => warned };
}

/* The preset under `id`, or null at the lowest. */
export function lowerGraphics(id) {
  const i = GRAPHICS_IDS.indexOf(id);
  return i > 0 ? GRAPHICS_IDS[i - 1] : null;
}
