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
    /* The Bramor's, which fly the C4EYE since it took the 1000 mm wing's
     * place (configs/airframes.js); the ids stayed, so a profile keeps
     * its mode. The real aircraft flies its own autopilot, so Stabilised
     * is its default and the autopilot has no acro mode to offer (OWNER
     * 2026-10-08: modes are real controllers only). The diff is the
     * stock one, parsed and ignored: the row is what switches
     * plant_wing.c's stabiliser, Betaflight has no wing mode. */
    id: 'wing-stab',
    airframe: 'bramor2300',
    name: 'Stabilised',
    note: 'A gyro holds the wing, as its autopilot does. Roll stick asks for a bank up to 45 degrees, pitch stick for a pitch up to 20, and centred sticks fly level.',
    wingStab: 1,
  },
  {
    id: 'wing-manual',
    airframe: 'bramor2300',
    name: 'Manual',
    note: 'No flight controller. The sticks are the elevons: 6 degrees of pitch and 10 of roll at full stick, with a little expo.',
  },
  {
    /* The Skyhunter is a kit, and the flight controller its builders fit
     * is INAV, whose ACRO this Acro is: rates at INAV's defaults,
     * roll_rate and pitch_rate 20 (200 deg/s), above anything its
     * surfaces reach, so a full stick is never capped
     * (docs/CONTROLLERS.md). Stabilised is INAV's ANGLE. */
    id: 'sky-acro',
    airframe: 'sky1800',
    name: 'Acro',
    note: 'A gyro holds the plane where you leave it. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder stick is the rudder alone.',
    wingStab: 2,
  },
  {
    id: 'sky-stab',
    airframe: 'sky1800',
    name: 'Stabilised',
    note: 'A gyro holds the plane. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you.',
    wingStab: 1,
  },
  {
    id: 'sky-manual',
    airframe: 'sky1800',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder.',
  },
  {
    /* The Cub's: the FMS 1400 mm PNP has no gyro (FMS sells a Reflex
     * combo apart), so Manual is the default; AS3X and Stabilised are
     * electronics a pilot may fit. On its wheels every mode flies as
     * Manual. */
    id: 'cub-manual',
    airframe: 'cub1400',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tailwheel.',
  },
  {
    id: 'cub-as3x',
    airframe: 'cub1400',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces and the gyro damps the bumps against the rate the plane is turning at. It fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate.',
    wingStab: 3,
  },
  {
    id: 'cub-stab',
    airframe: 'cub1400',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you.',
    wingStab: 1,
  },
  {
    /* The Radian Pro (PKZ5475) is a PNP with no gyro, so Manual is the
     * default. The throttle folds the prop in every mode. */
    id: 'radian-manual',
    airframe: 'radian2000',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder; closing the throttle folds the prop.',
  },
  {
    id: 'radian-as3x',
    airframe: 'radian2000',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces and the gyro damps the bumps against the rate the plane is turning at. It fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate. Close the throttle and it glides.',
    wingStab: 3,
  },
  {
    id: 'radian-stab',
    airframe: 'radian2000',
    name: 'Stabilised',
    note: 'A gyro holds the glider. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. Close the throttle and it glides.',
    wingStab: 1,
  },
  {
    /* The NRJ, an F3K glider: a receiver and four servos, no gyro, so
     * Manual. There is no throttle to close; the stick up throws it. */
    id: 'nrj-manual',
    airframe: 'nrj1490',
    name: 'Manual',
    note: 'No flight controller. The sticks are the flaperons, the elevator and the rudder; the launch preset trims the elevator down for the climb and lets go at the top.',
  },
  {
    id: 'nrj-stab',
    airframe: 'nrj1490',
    name: 'Stabilised',
    note: 'A gyro holds the glider. Roll stick asks for a bank up to 50 degrees, pitch stick for a pitch up to 30, centred sticks glide level, and the rudder is coordinated for you. The launch preset holds the climb after the throw.',
    wingStab: 1,
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
    /* The Slow Stick, a GWS kit with a receiver and servos and no gyro:
     * Manual. It has no ailerons, so the gyro's roll term has no surface
     * and AS3X damps pitch and yaw only; Stabilised's roll loop works
     * the rudder. On its wheels every mode flies as Manual. */
    id: 'slowstick-manual',
    airframe: 'slowstick1180',
    name: 'Manual',
    note: 'No flight controller. The roll and yaw sticks both work the rudder, which also steers the tailwheel, and the pitch stick the elevator. Let go and the dihedral levels the wings.',
  },
  {
    id: 'slowstick-as3x',
    airframe: 'slowstick1180',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one: the sticks are the elevator and the rudder, and the gyro damps pitch and yaw against the rate the plane is turning at, fading out as the stick leaves centre. Nothing levels it and nothing caps a rate.',
    wingStab: 3,
  },
  {
    id: 'slowstick-stab',
    airframe: 'slowstick1180',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 25, and centred sticks fly level.',
    wingStab: 1,
  },
  {
    /* The Timber's are the real aircraft's: E-flite's BNF receiver flies
     * AS3X with SAFE Select off unless bound for it, so AS3X is the
     * default and SAFE Select the beginner bind. On its wheels every
     * mode flies as Manual; the flaps are a switch on top of every mode,
     * F. */
    id: 'timber-as3x',
    airframe: 'timber1500',
    name: 'AS3X',
    note: 'E-flite\'s gyro, as the Timber ships. The sticks are the surfaces, and the gyro damps the bumps against the rate the plane is turning at; it fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate. F sets the flaps.',
    wingStab: 3,
  },
  {
    id: 'timber-manual',
    airframe: 'timber1500',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tailwheel. F sets the flaps, with a little down elevator mixed in as the radio would.',
  },
  {
    id: 'timber-stab',
    airframe: 'timber1500',
    name: 'SAFE Select',
    note: 'E-flite\'s beginner bind, once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. F sets the flaps.',
    wingStab: 1,
  },
  {
    /* The Bombshell, a balsa kit on a Cox .049: no gyro, Manual. No
     * ailerons, so AS3X damps pitch and yaw only and Stabilised's roll
     * loop works the rudder. On its wheels every mode flies as Manual. */
    id: 'bombshell-manual',
    airframe: 'bombshell1118',
    name: 'Manual',
    note: 'No flight controller. The roll and yaw sticks both work the rudder and the pitch stick the elevator; the tail skid does not steer. Let go and the polyhedral levels the wings. Throttle closed, the engine idles.',
  },
  {
    id: 'bombshell-as3x',
    airframe: 'bombshell1118',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one: the sticks are the elevator and the rudder, and the gyro damps pitch and yaw, fading out as the stick leaves centre. Nothing levels it and nothing caps a rate. Throttle closed, the engine idles.',
    wingStab: 3,
  },
  {
    id: 'bombshell-stab',
    airframe: 'bombshell1118',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 12, and centred sticks fly level.',
    wingStab: 1,
  },
  {
    /* The Kadet Senior, a SIG kit: no gyro, Manual. No ailerons, so AS3X
     * damps pitch and yaw only. On its wheels every mode flies as
     * Manual. */
    id: 'kadet-manual',
    airframe: 'kadet1981',
    name: 'Manual',
    note: 'No flight controller. The roll and yaw sticks both work the rudder, which also steers the nose wheel, and the pitch stick the elevator. Let go and the dihedral levels the wings. Throttle closed, the four stroke idles.',
  },
  {
    id: 'kadet-as3x',
    airframe: 'kadet1981',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one: the sticks are the elevator and the rudder, and the gyro damps pitch and yaw, fading out as the stick leaves centre. Nothing levels it and nothing caps a rate.',
    wingStab: 3,
  },
  {
    id: 'kadet-stab',
    airframe: 'kadet1981',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 20, and centred sticks fly level. Throttle closed, it lowers the nose onto its glide.',
    wingStab: 1,
  },
  {
    /* The Ugly Stik, RCM's kit: no gyro, Manual. On its wheels every
     * mode flies as Manual, the rudder steering the nose wheel. */
    id: 'uglystik-manual',
    airframe: 'uglystik1567',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the nose wheel, at RCM\'s travel limits. It goes where you point it and stays there: it holds a bank, loops round at full throttle and flies on its back with half the stick pushed. Throttle closed, the two stroke idles.',
  },
  {
    id: 'uglystik-as3x',
    airframe: 'uglystik1567',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces and the gyro damps the bumps against the rate the plane is turning at. It fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate.',
    wingStab: 3,
  },
  {
    id: 'uglystik-stab',
    airframe: 'uglystik1567',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. Throttle closed, it lowers the nose onto its glide.',
    wingStab: 1,
  },
  {
    /* The Tiger Moth, Great Planes' GPMA1330 ARF on a glow two stroke:
     * no gyro in the box, Manual. On its wheels every mode flies as
     * Manual. */
    id: 'tigermoth-manual',
    airframe: 'tigermoth1803',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons on the bottom wing, the elevator and the rudder, which also turns the tail wheel, at Great Planes\' throws. Roll into a turn on the ailerons alone and the nose swings the other way first: feed in rudder with them. Pull it into the stall and the nose drops. Throttle closed, the two stroke idles.',
  },
  {
    id: 'tigermoth-as3x',
    airframe: 'tigermoth1803',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces and the gyro damps the bumps against the rate the plane is turning at. It fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate. The adverse yaw is still yours to feed rudder against.',
    wingStab: 3,
  },
  {
    id: 'tigermoth-stab',
    airframe: 'tigermoth1803',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you, which on a Tiger Moth is most of flying it. Throttle closed, it lowers the nose onto its glide.',
    wingStab: 1,
  },
  {
    /* The Extra's three are the real aircraft's: E-flite's receiver flies
     * AS3X out of the box, a rate damper with no self levelling and no
     * caps ("When the normal bind process is followed, the SAFE Select
     * system is disabled, leaving specially tuned AS3X technology in place
     * to deliver a pure, unrestricted flight experience", the manual p. 4),
     * which is its default here; Manual is the receiver without the gyro;
     * SAFE Select is the optional bind with "bank and pitch limitations"
     * and "automatic self-leveling", which cannot hover by design. On its
     * wheels every mode flies as Manual. */
    id: 'extra-as3x',
    airframe: 'extra3d1308',
    name: 'AS3X',
    note: 'E-flite\'s gyro, as the Extra ships. The sticks are the surfaces at the 3D throws, and the gyro damps the bumps and the torque\'s kicks against the rate the plane is turning at; it fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate: hover, harrier and waterfall are yours to fly.',
    wingStab: 3,
  },
  {
    id: 'extra-manual',
    airframe: 'extra3d1308',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder at E-flite\'s 3D throws. Hang it on the prop and the torque rolls it left unless you hold it on the ailerons, which work in the slipstream at no airspeed at all.',
  },
  {
    id: 'extra-stab',
    airframe: 'extra3d1308',
    name: 'SAFE Select',
    note: 'E-flite\'s beginner bind. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. It cannot hover or tumble: switch to AS3X for 3D.',
    wingStab: 1,
  },
  {
    /* The P-51, FMS's V8 PNP: no gyro (FMS sells a Reflex version
     * apart), Manual. G works the retracts, F the flaps, in every mode;
     * on its wheels every mode flies as Manual. */
    id: 'p51-manual',
    airframe: 'p51d1450',
    name: 'Manual',
    note: 'No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tail wheel. It swings left as the tail comes up and drops a wing when it stalls. G works the retracts, F the flaps.',
  },
  {
    id: 'p51-as3x',
    airframe: 'p51d1450',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces and the gyro damps the bumps against the rate the plane is turning at. It fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate. G works the retracts, F the flaps.',
    wingStab: 3,
  },
  {
    id: 'p51-stab',
    airframe: 'p51d1450',
    name: 'Stabilised',
    note: 'A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. On the take off roll it is yours: feed in right rudder as the tail comes up. G works the retracts, F the flaps.',
    wingStab: 1,
  },
  {
    /* The F-16, Freewing's PNP: no gyro, Manual. The fan is the pilot's
     * in every mode. */
    id: 'f16-manual',
    airframe: 'f16878',
    name: 'Manual',
    note: 'No flight controller. The sticks work the ailerons, the all moving stabilators and the rudder, which also steers the nose wheel. The fan spools behind the throttle stick and stops when it is closed.',
  },
  {
    id: 'f16-as3x',
    airframe: 'f16878',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces and the gyro damps the bumps against the rate the plane is turning at. It fades out as the stick leaves centre, so full stick is full throw. Nothing levels it and nothing caps a rate.',
    wingStab: 3,
  },
  {
    id: 'f16-stab',
    airframe: 'f16878',
    name: 'Stabilised',
    note: 'A gyro holds the jet once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, and centred sticks fly level. Throttle closed, it lowers the nose onto its glide. The fan still takes a moment to spool.',
    wingStab: 1,
  },
  {
    /* The Zagi HP, a kit wing: no gyro, Manual. No rudder, so AS3X damps
     * roll and pitch only and the yaw stick does nothing. */
    id: 'zagi-manual',
    airframe: 'zagi1219',
    name: 'Manual',
    note: 'No flight controller. The sticks are the elevons, 14.5 degrees each way on both: it rolls fast, and a small touch of up is a lot, so be gentle in pitch. No rudder: it turns on the bank alone.',
  },
  {
    id: 'zagi-as3x',
    airframe: 'zagi1219',
    name: 'AS3X',
    note: 'A Spektrum AS3X receiver fitted in place of a plain one: the sticks are the elevons and the gyro damps roll and pitch, fading out as the stick leaves centre. Nothing levels it and nothing caps a rate. No rudder.',
    wingStab: 3,
  },
  {
    id: 'zagi-stab',
    airframe: 'zagi1219',
    name: 'Stabilised',
    note: 'A gyro holds the wing. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, and centred sticks fly level. It has no rudder: the yaw stick does nothing.',
    wingStab: 1,
  },
  {
    /* The Striker flies what a one way attack drone flies, an
     * autopilot's stabilised mode, its default; Manual is the sticks on
     * the surfaces. The tunes go by the row's plant and fly both
     * propulsions alike. */
    id: 'striker-stab',
    airframe: 'striker2500',
    name: 'Stabilised',
    note: 'A gyro holds the delta. Roll stick asks for a bank up to 45 degrees, pitch stick for a pitch up to 20, and centred sticks fly level. The yaw stick is the fins\' small rudders.',
    wingStab: 1,
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
