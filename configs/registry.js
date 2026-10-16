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
 * the Striker, on their autopilot's Stabilised, and the Skyhunter, whose
 * Acro is INAV's. AS3X (plant_wing.c mode 3) has no row: the plant keeps
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
   * The Skyhunter is a kit, and the flight controller its builders fit is
   * INAV, whose ACRO this Acro is: rates at INAV's defaults, roll_rate and
   * pitch_rate 20 (200 deg/s), above anything its surfaces reach, so a
   * full stick is never capped (docs/CONTROLLERS.md). Stabilised is INAV's
   * ANGLE.
   *
   * Its tunes are its folder's, aircraft/sky1800/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'sky1800'),
  /*
   * The Cub's: Acro is the default (OWNER 2026-10-16, below), Manual the
   * sticks on the surfaces, Stabilised the beginner's levelling. On its
   * wheels every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/cub1400/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'cub1400'),
  /*
   * The Radian Pro (PKZ5475): Acro is the default. The throttle folds the
   * prop in every mode.
   *
   * Its tunes are its folder's, aircraft/radian2000/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'radian2000'),
  /*
   * The NRJ, an F3K glider: Acro is the default. There is no throttle to
   * close; the stick up throws it.
   *
   * Its tunes are its folder's, aircraft/nrj1490/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'nrj1490'),
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
   * The Slow Stick, a GWS kit: Acro is the default. It has no ailerons, so
   * Acro's and Stabilised's roll loops work the rudder. On its wheels
   * every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/slowstick1180/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'slowstick1180'),
  /*
   * The Timber's: Acro is the default, Stabilised the beginner's
   * levelling the first lessons fly. On its wheels every mode flies as
   * Manual; the flaps are a switch on top of every mode, F.
   *
   * Its tunes are its folder's, aircraft/timber1500/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'timber1500'),
  /*
   * The Bombshell, a balsa kit on a Cox .049: Acro is the default. No
   * ailerons, so Acro's and Stabilised's roll loops work the rudder. On
   * its wheels every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/bombshell1118/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'bombshell1118'),
  /*
   * The Kadet Senior, a SIG kit: Acro is the default. No ailerons, so the
   * roll loops work the rudder. On its wheels every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/kadet1981/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'kadet1981'),
  /*
   * The Ugly Stik, RCM's kit: Acro is the default. On its wheels every
   * mode flies as Manual, the rudder steering the nose wheel.
   *
   * Its tunes are its folder's, aircraft/uglystik1567/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'uglystik1567'),
  /*
   * The Tiger Moth, Great Planes' GPMA1330 ARF on a glow two stroke: Acro
   * is the default. On its wheels every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/tigermoth1803/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'tigermoth1803'),
  /*
   * The Extra's three: Acro, the default, whose centred sticks hold the
   * attitude, a hover included; Manual, the receiver without the gyro;
   * Stabilised, "bank and pitch limitations" and "automatic
   * self-leveling" (the manual p. 4), which cannot hover by design. On its
   * wheels every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/extra3d1308/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'extra3d1308'),
  /*
   * The Night Timber's three, as the Extra's: Acro the default, Manual
   * without the gyro, Stabilised the beginner's levelling. The flaps on F
   * in every mode; on its wheels every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/nighttimber1200/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'nighttimber1200'),
  /*
   * The Hercules is a kit and ships with no electronics: Acro is its
   * default, Manual the sticks on the surfaces, Stabilised the self
   * levelling. On its wheels every mode flies as Manual.
   *
   * Its tunes are its folder's, aircraft/hercules3077/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'hercules3077'),
  /* The CAP 580 is an ARF and ships with no electronics, as the
   * Hercules: Acro is its default, Manual the sticks on the surfaces as an
   * IMAC pilot flies it, Stabilised the self levelling. On its wheels
   * every mode flies as Manual. docs/CAP580-STAGE1.md. Its tunes are its
   * folder's, aircraft/cap1702/aircraft.js. */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'cap1702'),
  /* The Slick is an ARF that ships with no electronics. Its default is
   * the Extra's, Acro; Manual is the receiver without a gyro; Stabilised
   * the self levelling. On its wheels every mode flies as Manual. Its
   * tunes are its folder's, aircraft/slick2680/aircraft.js. */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'slick2680'),
  /* The P-51, FMS's V8 PNP: Acro is the default. G works the retracts,
   * F the flaps, in every mode;
   * on its wheels every mode flies as Manual. Its tunes are its folder's,
   * aircraft/p51d1450/aircraft.js. */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'p51d1450'),
  /*
   * The F-16, Freewing's PNP: Acro is the default. The fan is the pilot's
   * in every mode.
   *
   * Its tunes are its folder's, aircraft/f16878/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'f16878'),
  /*
   * The Zagi HP, a kit wing: Acro is the default. No rudder, so the yaw
   * stick does nothing.
   *
   * Its tunes are its folder's, aircraft/zagi1219/aircraft.js.
   */
  ...AIRCRAFT.TUNES.filter((tune) => tune.airframe === 'zagi1219'),
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
