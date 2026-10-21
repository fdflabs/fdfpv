/*
 * registry.js: every tune the Tune row can offer, and the one place each
 * is named.
 *
 * A tune is a Betaflight CLI diff beside this file, named by its id, and
 * a row here. The module parses it exactly as it parses a dump a pilot
 * drops in, so a shipped tune can do nothing a pilot's own cannot. A tune
 * belongs to an aircraft's plant and is offered only on aircraft that fly
 * that plant.
 *
 * No tune sets rates: rates belong to the pilot and are appended after
 * whichever tune is loaded (configs/rates.js), and fc-trace F7 and F8 hold
 * every file here to that.
 *
 * The quads ship Betaflight's stock tune for their build and nothing more
 * opinionated: the claim is a quad that feels like a real one, and a
 * freshly flashed board is the honest place to start. A pilot's own feel
 * lives in their saved dump (CUSTOM_TUNE) and their PID adjustment
 * (configs/pids.js).
 *
 * Ids are stored in settings, so they never change; an id this build does
 * not know resolves to the first row rather than stopping the page.
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

import { AIRFRAMES } from './airframes.js';
import { AIRCRAFT } from './aircraft.js';

/*
 * OWNER 2026-10-16: "i really liked acro mode...and i really wanted it to
 * be easy to hover, in acro mode...i didnt want all this as3x stuff
 * really", and "honestly id like as3x hid and unselected". Every fixed
 * wing defaults to Acro again, as before a0caaed59, except the Bramor and
 * the Striker, on their autopilot's Stabilised; since the recreational
 * planes left (2026-10-21) those two are the only fixed wings. AS3X
 * (plant_wing.c mode 3) has no row: the plant keeps
 * it and its checks (npm run as3x:*), so it can come back as a row, and
 * a stored AS3X tune loads as the plane's default (src/ui/settings.js, a
 * tune the aircraft does not offer; scripts/save-selftest.js holds it).
 */
export const TUNES = [
  /*
   * The Bramor's, which fly the C4EYE since it took the 1000 mm wing's
   * place (configs/airframes.js); the ids stayed, so a profile keeps its
   * mode. The real aircraft flies its own autopilot, so Stabilised is its
   * default and the autopilot has no acro mode to offer (OWNER 2026-10-08:
   * modes are real controllers only). The diff is the stock one, parsed
   * and ignored: the row is what switches plant_wing.c's stabiliser,
   * Betaflight has no wing mode.
   *
   * Its tunes are its folder's, aircraft/bramor2300/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'bramor2300'),
  /*
   * The quads' (docs/COMBAT-DRONES.md): stock 4.5.1, on their own plants,
   * with the build's motor kV, pack size and Li-ion cell limits written
   * in.
   *
   * betaflight-default.diff, untouched 4.5.1, has no row since the five
   * inch it was offered on went (2026-10-03). It stays on disk because it
   * is not only a tune: it is the configuration stage 1 verification and
   * the module checks fly plant 0 on (tests/, scripts/fc-trace.js).
   *
   * The three quads' tunes are their folders', aircraft/7inch,
   * aircraft/10inch and aircraft/interceptor.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === '7inch'),
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === '10inch'),
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'interceptor'),
  /*
   * The Striker flies what a one way attack drone flies, an autopilot's
   * stabilised mode, its default; Manual is the sticks on the surfaces.
   * The tunes go by the row's plant and fly both propulsions alike.
   *
   * Its tunes are its folder's, aircraft/striker2500/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'striker2500'),
];

/*
 * The tunes an aircraft may load: those written for an aircraft on the same
 * plant, so a 10 inch tune never appears on a 7 inch. A float version is its
 * own plant (the floats change its mass and drag) but flies its land
 * plane's stabiliser, so it names that plane in `tunesOf` and is offered
 * its tunes.
 */
const byId = new Map(AIRFRAMES.map((a) => [a.id, a]));

export function tunesFor(airframeId) {
  const seated = byId.get(airframeId);
  if (!seated) return [];
  const plant = (seated.tunesOf ? byId.get(seated.tunesOf) : seated).simId;
  return TUNES.filter((tune) => byId.get(tune.airframe)?.simId === plant);
}

/*
 * The pilot's saved Flight controller dump, offered on the Tune row while
 * one is saved (localStorage, FC_DUMP_KEY in src/fc/dump.js). It has no
 * file, so tunePath never serves it: src/main.js reads it from storage.
 * Named here so the Tune row, the PIDs screen and bug reports agree.
 */
export const CUSTOM_TUNE = {
  id: 'custom',
  /* The pilot's own dump belongs to whichever airframe is seated. It is
   * offered on every one because it is THEIRS; a dump saved on a 7 inch and
   * loaded on a 10 inch is a choice a pilot made on purpose, unlike picking a
   * shipped tune off a list that should not have shown it. */
  airframe: null,
  name: 'Your edits',
  note: 'The dump you saved on the Flight controller screen, every field of it.',
};

// The row for an id, the saved dump for 'custom', or the first row for an
// id this build does not know.
export function tuneById(id) {
  if (id === CUSTOM_TUNE.id) return CUSTOM_TUNE;
  return TUNES.find((tune) => tune.id === id) ?? TUNES[0];
}

// The diff's address, resolved beside this module so the shell works
// wherever it is served from, at the root or under a path.
export function tunePath(id) {
  return new URL(`./${tuneById(id).id}.diff`, import.meta.url).href;
}
