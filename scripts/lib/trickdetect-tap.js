/*
 * trickdetect-tap.js: listens to every TrickDetector a script makes, from
 * outside, so scripts/trickdetect-golden.js can hold the recogniser to what
 * it did while the existing checks drove it.
 *
 *     node --import ./scripts/lib/trickdetect-tap.js scripts/score-selftest.js
 *
 * A loader hook hands every import of src/game/trickdetect.js the module
 * below instead, which re-exports the real one with TrickDetector
 * subclassed. The subclass sees only the boundary a caller sees: the calls
 * made on it from outside (a call the detector makes on itself is not
 * recorded, so a rewrite may arrange its own calls however it likes), what
 * each returned, and every trick handed to the callback, in the order they
 * happened. Each detector's stream is digested as it goes, because the
 * sweep makes millions of steps. On exit the digests and the trick names
 * are written as JSON to $TRICK_TAP_OUT.
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

import { register } from 'node:module';
import { isMainThread } from 'node:worker_threads';

const REAL = new URL('../../src/game/trickdetect.js', import.meta.url).href;
const TAPPED = new URL('./trickdetect-tapped.js', import.meta.url).href;

/* Loader thread: the hook itself. */
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url === REAL && context.parentURL !== TAPPED) {
    return { ...r, url: TAPPED };
  }
  return r;
}

/* Main thread: install the hook. This same file is the hooks module. */
if (isMainThread) {
  register(import.meta.url);
}
