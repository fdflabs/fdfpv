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
    note: 'A gyro holds the plane where you leave it. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder stick is the rudder alone.',
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
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder stick is the rudder alone.',
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
    note: 'A gyro holds the glider where you leave it. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder stick is the rudder alone. Close the throttle and it glides.',
    wingStab: 2,
  },
  {
    id: 'radian-manual',
    airframe: 'radian2000',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder; closing the throttle folds the prop.',
  },
  {
    /* The NRJ's three, the Radian's: the stabiliser's modes on its own
     * plant. There is no throttle to close; the stick up throws it. */
    id: 'nrj-stab',
    airframe: 'nrj1490',
    name: 'Stabilised',
    note: 'A gyro holds the glider. Roll stick asks for a bank up to 50 degrees, pitch stick for a pitch up to 30, centred sticks glide level, and the rudder is coordinated for you. The launch preset holds the climb after the throw.',
    wingStab: 1,
  },
  {
    id: 'nrj-acro',
    airframe: 'nrj1490',
    name: 'Acro',
    note: 'A gyro holds the glider where you leave it. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder stick is the rudder alone. After the throw it holds the climb until you push over.',
    wingStab: 2,
  },
  {
    id: 'nrj-manual',
    airframe: 'nrj1490',
    name: 'Manual',
    note: 'No flight controller. The sticks are the flaperons, the elevator and the rudder; the launch preset trims the elevator down for the climb and lets go at the top.',
  },
  {
    /* The quads' (docs/COMBAT-DRONES.md): stock 4.5.1, on their own
     * plants, with the build's motor kV, pack size and Li-ion cell limits
     * written in.
     *
     * betaflight-default.diff, untouched 4.5.1, has no row since the five
     * inch it was offered on went (2026-10-03). It stays on disk because
     * it is not only a tune: it is the configuration stage 1 verification
     * and the module checks fly plant 0 on (tests/, scripts/fc-trace.js). */
    id: 'betaflight-7inch',
    airframe: '7inch',
    name: 'Factory default',
    note: 'Factory 4.5.1 on the 7 inch: 1300 kV, a 4200 mAh Li-ion pack.',
  },
  {
    id: 'betaflight-10inch',
    airframe: '10inch',
    name: 'Factory default',
    note: 'Factory 4.5.1 on the 10 inch: 900 kV, an 8400 mAh Li-ion pack.',
  },
  {
    id: 'betaflight-interceptor',
    airframe: 'interceptor',
    name: 'Factory default',
    note: 'Factory 4.5.1 on the interceptor: 1500 kV, an 1800 mAh LiPo.',
  },
  {
    /* The Slow Stick's three. It has no ailerons, so in every mode the
     * roll stick works the rudder and the stabiliser's roll loop does too;
     * there is no turn coordinator. On its wheels every mode flies as
     * Manual, as the Cub's does. Manual is where its dihedral shows: let
     * go and it levels itself. */
    id: 'slowstick-stab',
    airframe: 'slowstick1180',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 25, and centred sticks fly level.',
    wingStab: 1,
  },
  {
    id: 'slowstick-acro',
    airframe: 'slowstick1180',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate, flown on the rudder, and a pitch rate, and centred sticks hold the attitude. It will not roll inverted: a rudder cannot do that.',
    wingStab: 2,
  },
  {
    id: 'slowstick-manual',
    airframe: 'slowstick1180',
    name: 'Manual',
    note: 'No flight controller. The roll and yaw sticks both work the rudder, which also steers the tailwheel, and the pitch stick the elevator. Let go and the dihedral levels the wings.',
  },
  {
    /* The Timber's three, the Cub's: on its wheels every mode flies as
     * Manual, and the modes take over once it is off the ground. The flaps
     * are a switch on top of every mode, F, with the radio's down elevator
     * mix in all three. */
    id: 'timber-stab',
    airframe: 'timber1500',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. F sets the flaps.',
    wingStab: 1,
  },
  {
    id: 'timber-acro',
    airframe: 'timber1500',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate up to 180 degrees a second and a pitch rate up to 100, centred sticks hold the attitude, and the rudder stick is the rudder alone. F sets the flaps.',
    wingStab: 2,
  },
  {
    id: 'timber-manual',
    airframe: 'timber1500',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tailwheel. F sets the flaps, with a little down elevator mixed in as the radio would.',
  },
  {
    /* The Bombshell's three, the Slow Stick's: no ailerons, so in every
     * mode the roll stick works the rudder and the stabiliser's roll loop
     * does too, with no turn coordinator; on its wheels every mode flies
     * as Manual. Manual is where an old timer's character is: let go and
     * the polyhedral levels it. */
    id: 'bombshell-stab',
    airframe: 'bombshell1118',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 12, and centred sticks fly level.',
    wingStab: 1,
  },
  {
    id: 'bombshell-acro',
    airframe: 'bombshell1118',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate up to 45 degrees a second, flown on the rudder, and a pitch rate up to 30, and centred sticks hold the attitude. It will not roll inverted: a rudder cannot do that.',
    wingStab: 2,
  },
  {
    id: 'bombshell-manual',
    airframe: 'bombshell1118',
    name: 'Manual',
    note: 'No flight controller. The roll and yaw sticks both work the rudder and the pitch stick the elevator; the tail skid does not steer. Let go and the polyhedral levels the wings. Throttle closed, the engine idles.',
  },
  {
    /* The Kadet's three, the Bombshell's: no ailerons, so in every mode
     * the roll stick works the rudder and the stabiliser's roll loop does
     * too, with no turn coordinator; on its wheels every mode flies as
     * Manual, and the rudder steers the nose wheel. */
    id: 'kadet-stab',
    airframe: 'kadet1981',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 20, and centred sticks fly level. Throttle closed, it lowers the nose onto its glide.',
    wingStab: 1,
  },
  {
    id: 'kadet-acro',
    airframe: 'kadet1981',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate up to 25 degrees a second, flown on the rudder, and a pitch rate up to 60, and centred sticks hold the attitude. It will not roll inverted: a rudder cannot do that.',
    wingStab: 2,
  },
  {
    id: 'kadet-manual',
    airframe: 'kadet1981',
    name: 'Manual',
    note: 'No flight controller. The roll and yaw sticks both work the rudder, which also steers the nose wheel, and the pitch stick the elevator. Let go and the dihedral levels the wings. Throttle closed, the four stroke idles.',
  },
  {
    /* The Ugly Stik's three, the Cub's on its own plant: ailerons,
     * elevator and rudder at RCM's travel limits; on its wheels every mode
     * flies as Manual, and the rudder steers the nose wheel. Manual is
     * where a sport aerobat is flown: it holds a bank, rolls on its
     * ailerons and wants a push on its back. */
    id: 'uglystik-stab',
    airframe: 'uglystik1567',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. Throttle closed, it lowers the nose onto its glide.',
    wingStab: 1,
  },
  {
    id: 'uglystik-acro',
    airframe: 'uglystik1567',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate up to 80 degrees a second and a pitch rate up to 60, centred sticks hold the attitude, upright or on its back, and the rudder stick is the rudder alone.',
    wingStab: 2,
  },
  {
    id: 'uglystik-manual',
    airframe: 'uglystik1567',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the nose wheel, at RCM\'s travel limits. It goes where you point it and stays there: it holds a bank, loops round at full throttle and flies on its back with half the stick pushed. Throttle closed, the two stroke idles.',
  },
  {
    /* The Tiger Moth's three, the Cub's on its own plant: ailerons,
     * elevator and rudder at Great Planes' high rate; on its wheels every
     * mode flies as Manual, and the rudder turns the tail wheel. Stabilised
     * is the default: the turn coordinator puts in the rudder its adverse
     * yaw asks for, which in Manual is the pilot's. */
    id: 'tigermoth-stab',
    airframe: 'tigermoth1803',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you, which on a Tiger Moth is most of flying it. Throttle closed, it lowers the nose onto its glide.',
    wingStab: 1,
  },
  {
    id: 'tigermoth-acro',
    airframe: 'tigermoth1803',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate up to 75 degrees a second and a pitch rate up to 45, centred sticks hold the attitude, and the rudder stick is the rudder alone: bank on the ailerons and the nose still swings the wrong way until you feed in rudder.',
    wingStab: 2,
  },
  {
    id: 'tigermoth-manual',
    airframe: 'tigermoth1803',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons on the bottom wing, the elevator and the rudder, which also turns the tail wheel, at Great Planes\' throws. Roll into a turn on the ailerons alone and the nose swings the other way first: feed in rudder with them. Pull it into the stall and the nose drops. Throttle closed, the two stroke idles.',
  },
  {
    /* The P-51's three, the Timber's: ailerons, elevator and rudder, the
     * flaps and the retracts switches on top of every mode, F and G; on
     * its wheels every mode flies as Manual, so the swing on the take off
     * roll is the pilot's to hold with the rudder in all three. */
    id: 'p51-stab',
    airframe: 'p51d1450',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. On the take off roll it is yours: feed in right rudder as the tail comes up. G works the retracts, F the flaps.',
    wingStab: 1,
  },
  {
    id: 'p51-acro',
    airframe: 'p51d1450',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate up to 120 degrees a second and a pitch rate up to 60, centred sticks hold the attitude, and the rudder stick is the rudder alone. G works the retracts, F the flaps.',
    wingStab: 2,
  },
  {
    id: 'p51-manual',
    airframe: 'p51d1450',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tail wheel. It swings left as the tail comes up and drops a wing when it stalls. G works the retracts, F the flaps.',
  },
  {
    /* The F-16's three, the Cub's pattern: ailerons, the stabilators and
     * a rudder, the turn coordinator in Stabilised, and on its wheels
     * every mode flies as Manual, the rudder steering the nose wheel. The
     * fan is the pilot's in every mode: none of them touches the
     * throttle. */
    id: 'f16-stab',
    airframe: 'f16878',
    name: 'Stabilised',
    note: 'A gyro holds the jet once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, and centred sticks fly level. Throttle closed, it lowers the nose onto its glide. The fan still takes a moment to spool.',
    wingStab: 1,
  },
  {
    id: 'f16-acro',
    airframe: 'f16878',
    name: 'Acro',
    note: 'A gyro holds the jet where you leave it once it is off the ground. Sticks ask for a roll rate up to 300 degrees a second and a pitch rate up to 120, and centred sticks hold the attitude, inverted too.',
    wingStab: 2,
  },
  {
    id: 'f16-manual',
    airframe: 'f16878',
    name: 'Manual',
    note: 'No flight controller. The sticks work the ailerons, the all moving stabilators and the rudder, which also steers the nose wheel. The fan spools behind the throttle stick and stops when it is closed.',
  },
  {
    /* The Zagi's three, the flying wing's modes on its own plant. It has
     * no rudder, so the yaw stick does nothing in any of them. */
    id: 'zagi-stab',
    airframe: 'zagi1219',
    name: 'Stabilised',
    note: 'A gyro holds the wing. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, and centred sticks fly level. It has no rudder: the yaw stick does nothing.',
    wingStab: 1,
  },
  {
    id: 'zagi-acro',
    airframe: 'zagi1219',
    name: 'Acro',
    note: 'A gyro holds the wing where you leave it. Sticks ask for a roll rate up to 220 degrees a second and a pitch rate up to 100, and centred sticks hold the attitude. No rudder.',
    wingStab: 2,
  },
  {
    id: 'zagi-manual',
    airframe: 'zagi1219',
    name: 'Manual',
    note: 'No flight controller. The sticks are the elevons, 14.5 degrees each way on both: it rolls fast, and a small touch of up is a lot, so be gentle in pitch. No rudder: it turns on the bank alone.',
  },
  {
    /* The Striker's three, a flying wing's modes on its own plants (the
     * tunes go by the row's plant, the piston one's, and fly the jet's
     * alike). Its fins carry small rudders, on the yaw stick in all three. */
    id: 'striker-stab',
    airframe: 'striker2500',
    name: 'Stabilised',
    note: 'A gyro holds the delta. Roll stick asks for a bank up to 45 degrees, pitch stick for a pitch up to 20, and centred sticks fly level. The yaw stick is the fins\' small rudders.',
    wingStab: 1,
  },
  {
    id: 'striker-acro',
    airframe: 'striker2500',
    name: 'Acro',
    note: 'A gyro holds the delta where you leave it. Sticks ask for a roll rate up to 90 degrees a second, 120 on the jet, and a pitch rate up to 40, and centred sticks hold the attitude.',
    wingStab: 2,
  },
  {
    id: 'striker-manual',
    airframe: 'striker2500',
    name: 'Manual',
    note: 'No flight controller. The sticks are the elevons and the fins\' rudders. A warhead in the nose makes it nose heavy and wants up elevon; without one it is light in pitch.',
  },
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
