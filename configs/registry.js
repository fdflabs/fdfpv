/*
 * registry.js: the tunes the shell offers, and the only place any of them
 * is named.
 *
 * A tune is a Betaflight CLI diff in this directory and nothing else. The
 * module parses it with the same code path a dropped file takes, so an
 * entry here has no privileges a pilot's own dump does not have. Adding a
 * tune is a file plus a row.
 *
 * NO TUNE HERE SETS RATES. Rates are the pilot's, chosen in Settings and
 * appended to whichever tune is loaded; see rates.js. A tune that carried a
 * rateprofile would be overridden by that append rather than winning
 * silently, but the right fix is not to carry one.
 *
 * `id` is the file's basename. It is also the localStorage key's value, so
 * changing one orphans a stored choice; src/ui/ui.js falls back to the
 * first row rather than throwing, because a stale setting must never stop
 * the page booting.
 *
 * ONE SHIPPED TUNE, AND IT IS STOCK. Karate race 6S and Precision used to
 * sit below the default and they are gone, files and rows both. A shipped
 * tune is an opinion about how a quad should feel, and this simulator's
 * whole claim is that it feels like the real thing, so the honest starting
 * point is the one a freshly flashed board actually gives you and every
 * other feel is the pilot's own. The Flight controller screen and the PIDs
 * screen are where they make it: both write real Betaflight keys, a Save
 * becomes CUSTOM_TUNE below, and that dump sits on the Tune row beside this
 * one. So the set did not shrink from three answers to one, it shrank from
 * three answers to one plus yours.
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

export const TUNES = [
  {
    /* The flying wing's three, which fly the Bramor C4EYE since it took
     * the 1000 mm wing's place (configs/airframes.js). The ids stayed, so a
     * profile that picked one on the old wing keeps its mode. The
     * controller is the stabiliser in plant_wing.c, not Betaflight, which
     * has no wing mode: the diff is the stock one, parsed and ignored, and
     * the row is what switches the stabiliser. */
    id: 'wing-stab',
    airframe: 'bramor2300',
    name: 'Stabilised',
    note: 'A gyro holds the wing, as its autopilot does. Roll stick asks for a bank up to 45 degrees, pitch stick for a pitch up to 20, and centred sticks fly level.',
    wingStab: 1,
  },
  {
    /* The stabiliser's acro mode, the same diff parsed and ignored. */
    id: 'wing-acro',
    airframe: 'bramor2300',
    name: 'Acro',
    note: 'A gyro holds the wing where you leave it. Sticks ask for a roll rate up to 90 degrees a second and a pitch rate up to 40, and centred sticks hold the attitude: no levelling, no limits, no drift.',
    wingStab: 2,
  },
  {
    /* The same diff, parsed and ignored, with the stabiliser off: the
     * sticks are the elevons, 6 degrees of pitch and 10 of roll at full
     * stick with a little expo, all in plant_wing.c. */
    id: 'wing-manual',
    airframe: 'bramor2300',
    name: 'Manual',
    note: 'No flight controller. The sticks are the elevons: 6 degrees of pitch and 10 of roll at full stick, with a little expo.',
  },
  {
    /* The Skyhunter's three, the same stabiliser modes on its own plant.
     * With a rudder, Stabilised and Acro add a turn coordinator to the
     * yaw stick; Manual is the four surfaces straight from the sticks. */
    id: 'sky-stab',
    airframe: 'sky1800',
    name: 'Stabilised',
    note: 'A gyro holds the plane. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you.',
    wingStab: 1,
  },
  {
    id: 'sky-acro',
    airframe: 'sky1800',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder is coordinated for you.',
    wingStab: 2,
  },
  {
    id: 'sky-manual',
    airframe: 'sky1800',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder.',
  },
  {
    /* The Cub's three, the stabiliser's modes on its own plant. On its
     * wheels every mode flies as Manual, so a taxi or a takeoff roll is
     * the sticks, and the modes take over once it is off the ground. */
    id: 'cub-stab',
    airframe: 'cub1400',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you.',
    wingStab: 1,
  },
  {
    id: 'cub-acro',
    airframe: 'cub1400',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder is coordinated for you.',
    wingStab: 2,
  },
  {
    id: 'cub-manual',
    airframe: 'cub1400',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tailwheel.',
  },
  {
    /* The Radian's three, the stabiliser's modes on its own plant. The
     * throttle folds the prop in every mode: closed, it glides. */
    id: 'radian-stab',
    airframe: 'radian2000',
    name: 'Stabilised',
    note: 'A gyro holds the glider. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. Close the throttle and it glides.',
    wingStab: 1,
  },
  {
    id: 'radian-acro',
    airframe: 'radian2000',
    name: 'Acro',
    note: 'A gyro holds the glider where you leave it. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder is coordinated for you. Close the throttle and it glides.',
    wingStab: 2,
  },
  {
    id: 'radian-manual',
    airframe: 'radian2000',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder; closing the throttle folds the prop.',
  },
  {
    id: 'betaflight-default',
    airframe: '5inch',
    name: 'Betaflight default',
    note: 'Factory 4.5.1, untouched. What a freshly flashed quad flies.',
  },
  {
    id: 'whoop-champion',
    airframe: null,
    name: 'Whoop stock',
    note: 'The factory tune for the 36000 kV racer. Low gains, a narrow D boost band, and the gains coming off a fifth of the way up the stick because 1S sags.',
  },
  {
    id: 'whoop-racing',
    airframe: null,
    name: 'Whoop racing',
    note: 'The 30000 kV variant’s factory tune. More damping and less integral than the stock tune, which is the shape of a tune for a motor with less authority.',
  },
  {
    id: 'whoop-freestyle',
    airframe: null,
    name: 'Whoop freestyle',
    note: 'The 25000 kV variant on the bigger GF1219S prop. The highest gains of the three, and the only one the maker ships on Betaflight rates rather than Actual.',
  },
];

/*
 * THE THREE WHOOP PRESETS ARE RETIRED, and `airframe: null` above is how.
 *
 * They were the whoop's, and they were right for as long as the whoop was a
 * 23 g 1S machine on its own plant. It flies the five inch's plant now, and a
 * whoop preset on it is not a different feel, it is the wrong tune: P and D
 * sized against 6e-6 kg m^2 of inertia, filter cutoffs against a 23 g frame's
 * resonances, and gains that come off a fifth of the way up the stick because
 * a cell sags. That is an underdamped, sluggish machine, which is the exact
 * complaint the plant change exists to answer.
 *
 * They stay in the table and their .diff files stay on disk. They are real
 * published configurations, scripts/preset-lint.js still checks every .diff in
 * this directory against the compiled module, and if the whoop ever gets its
 * own plant back they are two characters from being offered again. What they
 * must not be is reachable for a plant they were never written for.
 *
 * That is NOT what happened to Karate race 6S and Precision. Those two were
 * right for the plant they were offered on and were removed anyway, as a
 * decision about what this simulator should ship rather than about what flies
 * on what, so their rows and their files both went. A retirement keeps the
 * file because the tune may be wanted again; a removal does not.
 */

/*
 * Every tune that is offered to ANYBODY, which is the retirement above read
 * without an airframe in hand. The Presets tab on the flight controller
 * screen is the second room that lists tunes and it has no airframe to
 * filter by, so it listed the whole table and handed a five inch pilot the
 * three retired whoop presets. `airframe: null` means offered to nobody, and
 * that has to mean it in both rooms or it does not mean it anywhere.
 *
 * Not a replacement for tunesFor: this one only drops the retired rows, and
 * the Tune row still picks by plant.
 */
export const OFFERED_TUNES = TUNES.filter((t) => t.airframe != null);

/*
 * The tunes an airframe may load. A 6S 5 inch race tune on a 1S whoop is not
 * a thing a pilot should be able to reach by accident, and the rule survives
 * the whoop changing plants: an airframe is offered the tunes written for the
 * plant it selects. A tune with a null airframe is offered to nobody, which
 * is the retirement above.
 */
export function tunesFor(airframeId) {
  const want = AIRFRAMES.find((a) => a.id === airframeId);
  if (!want) {
    return [];
  }
  return TUNES.filter((t) => {
    const owner = t.airframe && AIRFRAMES.find((a) => a.id === t.airframe);
    return Boolean(owner) && owner.simId === want.simId;
  });
}

/*
 * The one tune that is NOT a file here: the dump the pilot saved from the
 * Flight controller screen, held in localStorage under FC_DUMP_KEY in
 * src/fc/dump.js. It exists on the Tune row only while that save exists,
 * and it is named here so the row, the PIDs screen and the feel report
 * all call it the same thing. tunePath never serves it; src/main.js loads
 * it from storage instead of fetching.
 */
export const CUSTOM_TUNE = {
  id: 'custom',
  /* The pilot's own dump belongs to whichever airframe is seated. It is
   * offered on both because it is THEIRS; a dump saved on a whoop and loaded
   * on a five inch is a choice a pilot made on purpose, unlike picking a
   * shipped tune off a list that should not have shown it. */
  airframe: null,
  name: 'Your edits',
  note: 'The dump you saved on the Flight controller screen, every field of it.',
};

export function tuneById(id) {
  if (id === CUSTOM_TUNE.id) {
    return CUSTOM_TUNE;
  }
  return TUNES.find((t) => t.id === id) ?? TUNES[0];
}

export function tunePath(id) {
  /* Beside this file, not at /configs, so that the shell works wherever it
   * is mounted. fdfpv.example serves it under /sim/ and Render serves it at the
   * root, and neither has to be told which. */
  return new URL(`./${tuneById(id).id}.diff`, import.meta.url).href;
}
