/*
 * airframes.js: every aircraft the shell can seat, and the one place each
 * is named and described.
 *
 * Each row is the shell's knowledge of one machine. The flight physics
 * (mass, inertia, motors, props, pack, drag) are compiled into
 * dist/sim.wasm, and `simId` is the plant number src/main.js hands to
 * sim_set_airframe (src/native/sim_abi.h) to select them; nothing else in
 * a row reaches the module. Tunes are separate (configs/registry.js) and
 * written for a plant, so the Tune row only offers the seated aircraft's.
 *
 * `id` is stored in settings, in record keys and on the board, so it never
 * changes: a renamed id would orphan a pilot's choice and every best lap
 * flown on it. A removed aircraft is listed in RETIRED_AIRFRAMES with its
 * successor, and an id nobody has falls back to DEFAULT_AIRFRAME so a stale
 * setting can never stop the page.
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

import { AIRCRAFT } from './aircraft.js';

/*
 * THE BRAMOR'S CATAPULT, named on its own because three things read it:
 * the airframe below, the drawn launcher (src/render/bramorcraft.js) and
 * the harness's release (tests/lib/wingpilot.js), and the last two must
 * not disagree with the first about where the aircraft leaves the rail.
 * From the Italian Army's photograph, docs/BRAMOR-STAGE1.md, all of it
 * ESTIMATED: a 3.1 m rail at 20 deg with its foot on the ground, the
 * aircraft's CG 1.17 m up on the cradle at the top, let go at 17 m/s,
 * 1.3 times its stall. It is the row's own object, stated in the Bramor's
 * folder, aircraft/bramor2300/aircraft.js.
 */
export const BRAMOR_CATAPULT = airframeOf('bramor2300').catapult;

/*
 * THE STRIKER'S RAIL, docs/COMBAT-DRONES.md section 7: a 3 m launch rail
 * at 15 deg, the aircraft's CG 1.2 m up on its shoe at the top, let go at
 * 19 m/s, 1.3 times the trimmed stall of its heaviest warhead on the
 * turbojet, the faster stalling of the two (scripts/combat-derive.js). The full size attacker leaves a rail on a
 * booster; this one on a pneumatic catapult's stroke. The turbojet is run
 * up to full on the rail before the shot (plant_wing.c plant_wing_launch).
 * It is the row's own `catapult`, stated in the Striker's folder,
 * aircraft/striker2500/aircraft.js.
 */
export const STRIKER_RAIL = airframeOf('striker2500').catapult;

/* Where the Striker's FPV camera sits, forward and up from the CG: the
 * plant's camera point (src/native/plant.c), in the drawn nose. */
export const STRIKER_CAMERA = { forward: 1.496, up: 0.0196 };

/*
 * AN AIR START'S SPEED, for a run that begins in flight rather than on the
 * ground: the in-sim builder's test flight through a start gate hung in the
 * air (src/builder/course.js startFor). A fixed wing is let go level at
 * this many times its `stall`, the margin the Bramor's catapult releases at
 * (17 m/s on its published 13, above), and flies away from it the way it
 * flies off the rail. A quad needs no speed: it starts in a hover.
 */
export const AIR_START_STALL_MARGIN = 1.3;

export function airStartSpeed(af) {
  return af.fixedWing ? AIR_START_STALL_MARGIN * af.stall : 0;
}

/* A row an aircraft folder holds, in its place in the list. Every folder
 * states what every aircraft starts on: the per cell pack states the pack
 * row offers, and Betaflight 4.5.1's stock ACTUAL rates (70 / 670 deg/s,
 * no expo) with no throttle limit, which seating an aircraft gives a pilot
 * who has not set their own (aircraft:folder holds them equal). Each row's
 * are its own objects, so nothing that edits one aircraft's can edit
 * another's. */
function airframeOf(id) {
  return AIRCRAFT.AIRFRAMES.find((a) => a.id === id);
}

export const AIRFRAMES = [
  /*
   * THE 7 INCH COMBAT QUAD, plant 24, docs/COMBAT-DRONES.md: a long range
   * X frame on 2806.5 motors and 7 inch three blades, on a 6S1P 21700
   * Li-ion pack, built to carry a payload slung under its belly. Every
   * number is scripts/combat-derive.js's from a parts list. `grams` is
   * the bare machine; the payload and accessories the pilot chose
   * (settings.combat, configs/combat.js) reach the plant through
   * sim_set_addons. A long range pilot tilts the camera less than a
   * racer, since the machine cruises rather than sprints.
   *
   * The row is its folder's, aircraft/7inch/aircraft.js. `topSpeed`: Level
   * at full throttle in angle mode on a fresh pack, bare, measured on the
   * module; the static thrust to weight is combat-derive's. `gravityBase`:
   * Its real weight, not the five inch's feel multiplier: the payload is
   * what makes it heavy (docs/COMBAT-DRONES.md section 1). `vHalfDown`:
   * plant.c's hull_hz_down and hull_hz_up: the legs reach the deepest
   * payload's belly, and up is the second pack's top.
   */
  airframeOf('7inch'),
  /*
   * THE 10 INCH COMBAT QUAD, plant 25, docs/COMBAT-DRONES.md: the 7
   * inch's build a size up, on 3115 motors and 10 inch three blades, its
   * 6S2P pack two bricks strapped side by side, which is the reference
   * photograph's pair. It carries more than twice the 7 inch's payload
   * and turns like the heavy machine it is.
   *
   * The row is its folder's, aircraft/10inch/aircraft.js. `gravityBase`:
   * Its real weight, not the five inch's feel multiplier: the payload is
   * what makes it heavy (docs/COMBAT-DRONES.md section 1).
   */
  airframeOf('10inch'),
  /*
   * THE INTERCEPTOR, plant 26, docs/COMBAT-DRONES.md: the fast chaser
   * that runs a Striker down and rams it. A stretched X 7 inch speed
   * build on T-Motor Velox V2808 1300 kV motors and APC 7 x 9E two
   * blades, on one Tattu 6S 1800 LiPo, the owner's reference photograph
   * of 2026-10-01, every part a published one. Every number is
   * scripts/combat-derive.js's from a parts list. It trades the 7 inch's
   * pack and payload for speed: the fastest quad here, flat out and off
   * the floor, for under half the 7 inch's charge, on a machine that
   * rolls with the five inch. Flown at that speed it sits 70 degrees nose
   * down, so its camera is tilted like a racer's.
   *
   * AND THE RACER since the five inch and the whoop were removed
   * (2026-10-03): DEFAULT_AIRFRAME below, the quad a blank profile, Track
   * Day and every retired quad id are seated on. It is the closest kind
   * of machine left to a 6S five inch, a LiPo speed build on Betaflight
   * at over 8 to 1 and the same top speed; the 7 and the 10 inch are
   * Li-ion payload carriers at under 5 to 1. Outside a war it flies
   * bare (src/ui/ui.js DEFAULTS.combat), and on its own weight, not the
   * five inch's 1.62.
   *
   * The row is its folder's, aircraft/interceptor/aircraft.js. `topSpeed`:
   * Level at full throttle on a fresh pack, bare, measured on the module
   * (scripts/combat-gates.js); the static thrust to weight is
   * combat-derive's. `gravityBase`: Its real weight, as the other combat
   * quads (docs/COMBAT-DRONES.md section 1). `arm`: Half the motor
   * diagonal; the stretch is plant.c's arm_x 0.120 and arm_y 0.100.
   * `vHalfDown`: plant.c's hull_hz_down and hull_hz_up: the legs reach the
   * payload's belly, and up is the GPS puck's top. `bodyLength`: The
   * plates as drawn, src/render/combatcraft.js COMBAT_FRAMES
   * interceptor.plates, from the reference photograph: dims is the
   * airframe as the renderer draws it. It read 0.22 with no source, which
   * verify's check 15 found once the interceptor was the aircraft it seats
   * (2026-10-03).
   */
  airframeOf('interceptor'),
  /*
   * The C-Astral Bramor C4EYE, docs/BRAMOR-STAGE1.md: a 2.3 m blended
   * wing body flying wing with a gimballed camera ball in its nose,
   * simId 8 on the fixed wing plant. It took the flying wing's place:
   * the 1000 mm wing (simId 2) is still in the module, where its gates
   * and recorded laps live, but the shell no longer seats it, and a
   * profile or a link that names 'wing1000' is seated on this aircraft
   * instead (src/ui/ui.js, RETIRED_AIRFRAMES). The three wing tunes are
   * this aircraft's now for the same reason.
   *
   * It is launched off a catapult rather than thrown: `catapult` is the
   * rail, BRAMOR_CATAPULT above, and where the aircraft sits on it at
   * release. It comes home under a parachute, which `chute` says it
   * carries. Parked, it is drawn on the rail.
   *
   * The row is its folder's, aircraft/bramor2300/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax): the published figure,
   * tests/bramor-thresholds.json b2_stall. `topSpeed`: Level speed at full
   * throttle, m/s: tests/bramor-thresholds.json b4_top, derived. `dims`:
   * The drawn machine, src/render/bramorcraft.js BRAMOR_DIMS: half span,
   * the belly 65 mm under the CG and the winglets' tops 0.25 m over it,
   * the contact box's floor and roof in src/native/plant.c.
   */
  airframeOf('bramor2300'),
  /*
   * THE STRIKER, plants 27 and 28, docs/COMBAT-DRONES.md section 7: the
   * war's pusher delta as a playable aircraft, at the size the war draws
   * it (src/render/strikercraft.js), 2.5 m over its wingtip fins. A giant
   * scale glass and carbon build: elevons, a small rudder on each fin, a
   * warhead in the nose. Every number is scripts/combat-derive.js's from
   * a parts list and the drawn planform. It is pushed two ways, its
   * `combat.propulsion`: 'prop', a 110 cc boxer twin on a 30 in wooden
   * pusher, and 'jet', a 140 N class turbojet whose thrust lags the stick
   * by seconds. The pilot picks one on the Loadout tab, and each is its
   * own plant (configs/combat.js combatSimId); the figures on this row
   * are the first's, the jet's are its propulsion entry's. Shot off a
   * rail (STRIKER_RAIL) and landed on its belly skid; a turning prop
   * reaches under the skid, so the piston one breaks its prop doing it.
   *
   * The row is its folder's, aircraft/striker2500/aircraft.js. `stall`:
   * Its stall, m/s, trimmed with the standard warhead in the nose:
   * combat-derive's, which npm run combat:gates holds the module to.
   * `topSpeed`: Level at full throttle, m/s, combat-derive's, held the
   * same way. `cells`: The ignition's and the receiver's pack: the engine
   * burns fuel. `dims`: The drawn machine about its CG (combat-derive's
   * hull): the furthest reach in plan is a fin's top trailing corner, the
   * lowest point the belly skid's foot, which it lands on, and the highest
   * the prop's upper blade; nose to hub 2.67 m. The contact box in plant.c
   * is the skid and the fins' tops. `combat.ballast`: The bay's trim
   * lead: whatever is carried, it brings the CG to the wide warhead's
   * (configs/combat.js trimBallastKg).
   */
  airframeOf('striker2500'),
];

export const AIRFRAME_IDS = AIRFRAMES.map((a) => a.id);

/*
 * WHAT KIND OF AIRCRAFT EACH IS AND WHAT IT IS FOR, stated by its folder
 * (docs/redesign/PLAN.md section 2.5) so the picker and the hangar sort by
 * data: `class` one of CLASSES, `roles` a list from ROLES in this order.
 * scripts/airframes-check.js holds every row to them and to its flags.
 */
export const CLASSES = ['multirotor', 'plane', 'wing', 'glider'];
export const ROLES = ['race', 'combat', 'interceptor'];

/*
 * THE AIRCRAFT AN ID THIS BUILD DOES NOT KNOW IS SEATED AND DRAWN AS: a
 * typo, a hand edited blob, a board link from a newer build. Named rather
 * than "the first row" since the five inch, which was both, went: the
 * first row is the 7 inch, a payload carrier, and a stray id should land
 * on the racer a blank profile gets. A retired id never reaches this; it
 * has its own successor below.
 */
export const DEFAULT_AIRFRAME = 'interceptor';

/*
 * THE WAR'S AIRCRAFT (the owner, 3 October, superseding 29 September's
 * "all aircraft"): the only ones a war room lets a pilot fly and the only
 * ones a war film shows. They are the catalog's combat aircraft, the ones
 * with a `combat` block (a warhead in their payload slots, configs/
 * combat.js): the seven and ten inch FPV warhead quads, the interceptor
 * and the Striker. No trainer, Cub, Tiger Moth, glider, racing quad
 * without a warhead or whoop. WAR_DEFAULT is the one a pilot is put in
 * who has flown none of them in a war yet.
 */
export const WAR_AIRFRAMES = Object.freeze(AIRFRAMES.filter((a) => a.combat).map((a) => a.id));
export const WAR_DEFAULT = 'striker2500';
export function isWarAirframe(id) {
  return WAR_AIRFRAMES.includes(id);
}
if (!WAR_AIRFRAMES.includes(WAR_DEFAULT)) {
  throw new Error(`airframes: the war's default ${WAR_DEFAULT} is not a combat aircraft`);
}

const BY_ID = new Map(AIRFRAMES.map((a) => [a.id, a]));

// The row for an id, or the default aircraft's for one this build lacks.
export function airframeById(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_AIRFRAME);
}

/*
 * The aircraft this build no longer has, and the one each is seated and
 * drawn as instead (src/maps/retired.js is the same idea for worlds).
 *
 * An id in here is not an unknown id. A pilot's stored settings, a ?craft=
 * link from the board (whose own table still names the flying wing,
 * fdfpv-leaderboard public/app.js CRAFT_ID), a Flight controller dump's
 * stamp, a room peer on an old tab, a ghost and a saved crash cam clip all
 * name the aircraft they were made with, and each of them outlives it. An unknown id falls back to
 * DEFAULT_AIRFRAME (airframeById), which is right for a typo and wrong for a plane a
 * pilot flew last week: they would be put in a quad. So a retired id is
 * named here with its successor, the nearest plane that is left and one
 * that opens no later on the progression, so a pilot who had the old one
 * has the new one too, and with its own name, which is a proper noun and so
 * not a string key, for anything that has to say what it was.
 *
 * The flying wing went on the Bramor's arrival. The Edge 540, the Extra
 * 300, the Pitts S-1S, the Wot 4 and the Quickie 500 were removed on
 * 2026-09-29 at the owner's request ("ok just delete quickie 500, delete
 * edge 540, eliminate extra, eliminate pitts, eliminate wot 4"); their
 * successors, the Tiger Moth and the Ugly Stik, went in turn (below). Their
 * sim ids stay reserved (src/native/sim_abi.h), so nothing is ever flown on
 * them again.
 *
 * The five inch and the 65 mm whoop were removed on 2026-10-03 at the
 * owner's request ("eliminate the 5 inch model and the 65mm whoop model as
 * well"), from the whole game. Both go to the interceptor, the racer that
 * is left (DEFAULT_AIRFRAME), and like every quad it is open from the
 * start. Sim id 0 is NOT reserved the way the planes' are: plant 0 stays in
 * the module as the reference stage 1 verification flies, and no pilot is
 * seated on it.
 *
 * The twenty recreational planes left on 2026-10-21 at the owner's request
 * ("leave only combat quads and planes in pdcs no recreational stuff"):
 * they fly on in Openflight (openfieldrc.com/openflight), which is what
 * `moved` says, so a build made on one is not turned into a Striker
 * (src/share/progressmerge.js currentBuild). Each, and each of the
 * aerobats retired onto the Ugly Stik and the Tiger Moth before them, is
 * seated on the Striker: the war's default fixed wing, open from the
 * start (src/game/progress.js STARTER_PLANES), so the rule above holds. Their plants stay in the module for now, unseated, as the 1000 mm
 * wing's does.
 */
const OPENFLIGHT = 'openflight';
const RETIRED_AIRFRAMES = {
  '5inch': { to: 'interceptor', name: 'Five inch' },
  whoop65: { to: 'interceptor', name: '65 mm whoop' },
  wing1000: { to: 'bramor2300', name: 'Fixed wing' },
  edge1524: { to: 'striker2500', name: 'Edge 540' },
  extra1308: { to: 'striker2500', name: 'Extra 300 3D' },
  pitts850: { to: 'striker2500', name: 'Pitts S-1S' },
  wot41334: { to: 'striker2500', name: 'Wot 4' },
  quickie1293: { to: 'striker2500', name: 'Quickie 500' },
  sky1800: { to: 'striker2500', name: 'Skyhunter', moved: OPENFLIGHT },
  radian2000: { to: 'striker2500', name: 'Radian', moved: OPENFLIGHT },
  cub1400: { to: 'striker2500', name: 'Piper Cub', moved: OPENFLIGHT },
  cub1400f: { to: 'striker2500', name: 'Piper Cub, floats', moved: OPENFLIGHT },
  slowstick1180: { to: 'striker2500', name: 'Slow Stick', moved: OPENFLIGHT },
  timber1500: { to: 'striker2500', name: 'Turbo Timber', moved: OPENFLIGHT },
  timber1500f: { to: 'striker2500', name: 'Turbo Timber, floats', moved: OPENFLIGHT },
  bombshell1118: { to: 'striker2500', name: 'Buzzard Bombshell', moved: OPENFLIGHT },
  kadet1981: { to: 'striker2500', name: 'Kadet Senior', moved: OPENFLIGHT },
  uglystik1567: { to: 'striker2500', name: 'Ugly Stik', moved: OPENFLIGHT },
  tigermoth1803: { to: 'striker2500', name: 'Tiger Moth', moved: OPENFLIGHT },
  extra3d1308: { to: 'striker2500', name: 'Extra 300 3D', moved: OPENFLIGHT },
  nighttimber1200: { to: 'striker2500', name: 'Night Timber X', moved: OPENFLIGHT },
  hercules3077: { to: 'striker2500', name: 'C-130 Hercules', moved: OPENFLIGHT },
  cap1702: { to: 'striker2500', name: 'CAP 580', moved: OPENFLIGHT },
  slick2680: { to: 'striker2500', name: 'Slick 580', moved: OPENFLIGHT },
  p51d1450: { to: 'striker2500', name: 'P-51D Mustang', moved: OPENFLIGHT },
  f16878: { to: 'striker2500', name: 'F-16 Falcon', moved: OPENFLIGHT },
  zagi1219: { to: 'striker2500', name: 'Zagi HP', moved: OPENFLIGHT },
  nrj1490: { to: 'striker2500', name: 'NRJ DLG', moved: OPENFLIGHT },
};
for (const [id, gone] of Object.entries(RETIRED_AIRFRAMES)) {
  if (AIRFRAME_IDS.includes(id) || !AIRFRAME_IDS.includes(gone.to)) {
    throw new Error(`airframes: retired ${id} must be gone and its successor ${gone.to} present`);
  }
}

/* The retired entry for an id, or null for an aircraft this build has or
 * never had. */
export function retiredAirframe(id) {
  return typeof id === 'string' && Object.hasOwn(RETIRED_AIRFRAMES, id) ? RETIRED_AIRFRAMES[id] : null;
}

/* The id to seat or draw for one that may be retired: its successor, else
 * itself. */
export function currentAirframeId(id) {
  const gone = retiredAirframe(id);
  return gone ? gone.to : id;
}
