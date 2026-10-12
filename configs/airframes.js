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
 */
export const STRIKER_RAIL = { speed: 19, pitchDeg: 15, railLength: 3.0, height: 1.2 };

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

/*
 * What every aircraft starts on: the per cell pack states the pack row
 * offers, and Betaflight 4.5.1's stock ACTUAL rates (70 / 670 deg/s, no
 * expo) with no throttle limit, which seating an aircraft gives a pilot
 * who has not set their own. Each row gets fresh copies, so nothing that
 * edits one aircraft's can edit another's.
 */
function packStates() {
  return {
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
  };
}

function stockRates() {
  const axis = () => ({ rcRate: 7, srate: 67, expo: 0 });
  return { type: 'ACTUAL', roll: axis(), pitch: axis(), yaw: axis(), throttleCap: 100 };
}

/* A row an aircraft folder holds, in its place in the list. */
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
   * The Skyhunter 1800, docs/SKYHUNTER-STAGE1.md: a twin boom pusher
   * with ailerons, an elevator and a rudder, simId 3, on the wing's
   * plant with its own table. It flies the wing's track class, the
   * airfield, because it is the same kind of flying. The stock kit has
   * no rudder servo; this one has one, so the yaw stick does something.
   *
   * The row is its folder's, aircraft/sky1800/aircraft.js. `stall`: Clean
   * stall, m/s, sqrt(2W / rho S CLmax): tests/skyhunter-thresholds.json
   * s2_stall. `topSpeed`: Level speed at full throttle, m/s:
   * tests/skyhunter-thresholds.json s4_top, derived. `dims`: The drawn
   * machine, src/render/skycraft.js SKY_DIMS: half span, the skid 0.12 m
   * under the CG (the contact box's floor, src/native/plant.c) and the
   * fins' tops 0.219 m over it.
   */
  airframeOf('sky1800'),
  /*
   * The Piper J-3 Cub, docs/CUB-STAGE1.md: the FMS 1400 mm, a high wing
   * taildragger with a tractor prop, simId 4 on the fixed wing plant.
   * The first aircraft here with wheels: it sits on its gear and takes
   * off down the strip rather than being thrown (L still throws it).
   * `gear` is where it rests, from the plant's settled pose, which the
   * drawn wheels in src/render/cubcraft.js match: the CG 0.1463 m over
   * the ground and 11 degrees nose up, tail down.
   *
   * The row is its folder's, aircraft/cub1400/aircraft.js. `stall`: Clean
   * stall, m/s, sqrt(2W / rho S CLmax): tests/cub-thresholds.json
   * c2_stall. `topSpeed`: Level speed at full throttle, m/s:
   * tests/cub-thresholds.json c4_top, derived. `dims`: The drawn machine,
   * src/render/cubcraft.js CUB_DIMS: half span, the wheels' lowest drawn
   * point and the fin's top.
   */
  airframeOf('cub1400'),
  /*
   * The E-flite Radian Pro, docs/GLIDER-STAGE1.md: a 2 m powered glider
   * with ailerons, an elevator and a rudder, simId 6 on the fixed wing
   * plant (5 is the Slow Stick). Thrown by hand and landed on
   * its belly; its prop folds back when the throttle is closed, and it
   * climbs in the thermals over the airfield, which it and the Slow
   * Stick fly in.
   *
   * The row is its folder's, aircraft/radian2000/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax): tests/glider-thresholds.json
   * g3_stall. `topSpeed`: Level speed at full throttle, m/s: npm run
   * glider:derive, G5 at 100 percent. `dims`: The drawn machine,
   * src/render/glidercraft.js GLIDER_DIMS: the tip's trailing corner
   * (1.000 m out, 0.137 m aft), the belly 0.052 m under the CG, where the
   * plant's hull rests it, and the fin's top.
   */
  airframeOf('radian2000'),
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
   * The GWS Slow Stick, docs/SLOWSTICK-STAGE1.md: 1176 mm, 420 g, simId 5
   * on the fixed wing plant. Three channels and no ailerons: the roll
   * stick drives the rudder as well as the yaw stick does, and it banks
   * through its dihedral, which also levels it when the sticks are let
   * go, and it rises in the airfield's thermals as the Radian does. It
   * stands on a wire gear and a tailwheel like the Cub, so
   * throttle rolls it off the strip (L still throws it); `gear` is the
   * plant's settled pose, which the drawn wheels in
   * src/render/slowstickcraft.js match: the CG 0.1349 m over the ground
   * and 6.9 degrees nose up.
   *
   * The row is its folder's, aircraft/slowstick1180/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax):
   * tests/slowstick-thresholds.json s2_stall. `topSpeed`: Level speed at
   * full throttle, m/s: tests/slowstick-thresholds.json s4_top, derived.
   * `dims`: The drawn machine, src/render/slowstickcraft.js
   * SLOWSTICK_DIMS: the furthest reach in plan, the elevator's outer
   * trailing corner, the wheels' lowest drawn point and the fin's top.
   */
  airframeOf('slowstick1180'),
  /*
   * The E-flite Turbo Timber Evolution 1.5 m, docs/TIMBER-STAGE1.md: a
   * STOL bush plane on 4S, simId 7 on the fixed wing plant, with
   * ailerons, an elevator, a rudder, slotted flaps and fixed slats. It
   * stands on big foam tyres and a tailwheel like the Cub, so throttle
   * rolls it off the strip (L still throws it); `gear` is the plant's
   * settled pose, which the drawn wheels in src/render/timbercraft.js
   * match: the CG 0.2115 m over the ground and 11.8 degrees nose up.
   * `flaps` says it has them: F steps them up, half and full, and the
   * OSD says where they are.
   *
   * The row is its folder's, aircraft/timber1500/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax): flaps up, slats on,
   * tests/timber-thresholds.json t2_stall_slats. `topSpeed`: Level speed
   * at full throttle, m/s: docs/TIMBER-STAGE1.md T1, measured in the
   * plant. `dims`: The drawn machine, src/render/timbercraft.js
   * TIMBER_DIMS: the furthest reach in plan, the drooped tip's trailing
   * corner, the tyres' lowest drawn point and the fin's top.
   */
  airframeOf('timber1500'),
  /*
   * The Turbo Timber on the float set it ships with, docs/FLOATS-STAGE1.md:
   * simId 9, the same aircraft with its main gear off and the floats on.
   * It floats and planes on a map's water (src/game/water.js names the
   * Alps' lake, which swiss2 shares) and starts afloat on it; on a map
   * without water it stands on its keels on the strip, where they slide,
   * so it needs half throttle to move and full power to drag itself off.
   * `floats` is where it rests on still water and `gear` where it rests on
   * its keels on the ground, both the plant's settled poses; the drawn
   * floats in src/render/timbercraft.js are the plant's floats.
   *
   * The row is its folder's, aircraft/timber1500f/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax): the landplane's 7.20 at
   * 1.934 kg over 1.70, docs/FLOATS-STAGE1.md. `topSpeed`: Level speed at
   * full throttle, m/s: docs/FLOATS-STAGE1.md, measured in the plant.
   * `dims`: The drawn machine on floats, TIMBER_FLOAT_DIMS: the keels are
   * its lowest point, the fin's top the CG's 26.6 mm drop higher.
   */
  airframeOf('timber1500f'),
  /*
   * The FMS Cub on its floats, docs/FLOATS-STAGE1.md: simId 10, on the
   * Timber on floats' terms. Its thrust to weight on floats is 0.9, so it
   * needs most of its throttle to get over the hump.
   *
   * The row is its folder's, aircraft/cub1400f/aircraft.js. `stall`: Clean
   * stall, m/s, sqrt(2W / rho S CLmax): docs/FLOATS-STAGE1.md, the Cub
   * having no flaps. `topSpeed`: Level speed at full throttle, m/s:
   * docs/FLOATS-STAGE1.md, measured in the plant. `dims`: The drawn
   * machine on floats, CUB_FLOAT_DIMS.
   */
  airframeOf('cub1400f'),
  /*
   * BMJR's 1/2A Texaco Buzzard Bombshell, docs/BOMBSHELL-STAGE1.md: Joe
   * Konefes' 1940 free flight cabin model at 44 in, 560 g of balsa and
   * tissue, simId 11 on the fixed wing plant. The Slow Stick's three
   * channels: no ailerons, the roll stick drives the rudder as well as
   * the yaw stick does, and it banks through a polyhedral wing, which
   * also levels it when the sticks are let go; it rises in the
   * airfield's thermals, which is what it was designed for. A Cox Texaco
   * .049 glow engine on the Cox throttle conversion: the stick runs it
   * from idle to full and closing it idles the engine, it never stops.
   * The pack is BMJR's 3S 850 on the radio, which the engine draws
   * nothing from. It stands on wire gear and a tail skid, so throttle
   * rolls it off the strip, the big stabiliser lifting the tail by
   * itself (L still throws it); `gear` is the plant's settled pose, which
   * the drawn wheels and skid in src/render/bombshellcraft.js match: the
   * CG 0.1318 m over the ground and 8.5 degrees nose up.
   *
   * The row is its folder's, aircraft/bombshell1118/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax):
   * tests/bombshell-thresholds.json s2_stall. `topSpeed`: Level speed at
   * full throttle, m/s: tests/bombshell-thresholds.json s4_top, derived.
   * `dims`: The drawn machine, src/render/bombshellcraft.js
   * BOMBSHELL_DIMS: the furthest reach in plan, the elevator's outer
   * trailing corner, the wheels' lowest drawn point and the polyhedral
   * tips' tops, which stand over the fin.
   */
  airframeOf('bombshell1118'),
  /*
   * SIG's Kadet Senior, kit RC58, docs/KADET-STAGE1.md: Claude
   * McCullough's 78 in balsa trainer, 2.72 kg, simId 12 on the fixed wing
   * plant. The Bombshell's three channels: SIG built it without ailerons,
   * so the roll stick drives the rudder as well as the yaw stick does,
   * and it banks through its dihedral, which also levels it when the
   * sticks are let go. An O.S. FS-52 Surpass four stroke on a 12 x 6: the
   * stick runs it from its 2,300 rpm idle to full and it never stops, and
   * `voice` is the four stroke's thump in the mix (src/render/audio.js).
   * The pack is a 2S receiver pack, which the engine draws nothing from.
   * It stands level on a tricycle gear whose nose wheel steers with the
   * rudder, so throttle rolls it off the strip and up elevator lifts it
   * off; `gear` is the plant's settled pose, which the drawn wheels in
   * src/render/kadetcraft.js match: the CG 0.3072 m over the ground,
   * level. Covered in transparent yellow and red film, whose frame shows
   * against the sun.
   *
   * The row is its folder's, aircraft/kadet1981/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax): tests/kadet-thresholds.json
   * s2_stall. `topSpeed`: Level speed at full throttle, m/s:
   * tests/kadet-thresholds.json s4_top, derived. `dims`: The drawn
   * machine, src/render/kadetcraft.js KADET_DIMS: the furthest reach in
   * plan is the elevator's rounded outer trailing corner, the lowest drawn
   * point the wheels' and the highest the fin's top.
   */
  airframeOf('kadet1981'),
  /*
   * Phil Kraft's Das Ugly Stik as RCM published Jim Jensen's kit of it,
   * plan 939, docs/UGLYSTIK-STAGE1.md: a 62 in balsa sport aerobat, 96 oz
   * ready to fly, simId 19 on the fixed wing plant. A constant chord
   * shoulder wing on a section within a percent of symmetric, strip
   * ailerons, a flat stabiliser under the tail and the egg of a fin over
   * it: it rolls on its ailerons, loops, flies on its back with a push,
   * holds the bank it is left in and drops its nose, not a wing, when it
   * stalls. An O.S. 61FX two stroke on a 12 x 6: the stick runs it from
   * its 2,000 rpm idle to full and it never stops, and `voice` is the two
   * stroke's note in the mix (src/render/audio.js). The pack is a 4.8 V
   * receiver pack, which the engine draws nothing from. It stands on a
   * tricycle gear whose nose wheel steers with the rudder, nose down as
   * the plan draws it; `gear` is the plant's settled pose idling, which
   * the drawn wheels in src/render/uglystikcraft.js match: the CG 0.2024
   * m over the ground and 2.06 degrees nose down.
   *
   * The row is its folder's, aircraft/uglystik1567/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax):
   * tests/uglystik-thresholds.json u2_stall. `topSpeed`: Level speed at
   * full throttle, m/s: tests/uglystik-thresholds.json u4_top, derived.
   * `dims`: The drawn machine, src/render/uglystikcraft.js UGLYSTIK_DIMS:
   * the furthest reach in plan is the rudder's trailing edge, 0.884 m aft,
   * further than the tips; the lowest drawn point the mains' and the
   * highest the fin's top.
   */
  airframeOf('uglystik1567'),
  /*
   * Great Planes' Tiger Moth ARF, GPMA1330, docs/TIGERMOTH-STAGE1.md: a 71
   * in balsa and ply scale de Havilland DH.82A, the full size at 1/4.96,
   * 10.25 lb, simId 23 on the fixed wing plant. A biplane (the plant's
   * second wing, bip_*): two wings of one span and chord, the top one
   * staggered ahead and stalling first, so it drops its nose and no wing;
   * ailerons on the bottom wing alone with no differential, so a turn
   * entered on them yaws the wrong way first and wants the rudder with
   * them. An O.S. 61FX two stroke on a 12 x 6, the first engine Great
   * Planes list: the stick runs it from its 2,000 rpm idle to full and it
   * never stops, and `voice` is the two stroke's note in the mix. The
   * pack is a 4.8 V receiver pack, which the engine draws nothing from. It
   * stands on V strut main gear and a tail wheel whose wire is set in the
   * rudder; `gear` is the plant's settled pose, which the drawn wheels in
   * src/render/tigermothcraft.js match: the CG 0.2654 m over the ground
   * and 8.16 degrees nose up.
   *
   * The row is its folder's, aircraft/tigermoth1803/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax) on the cell:
   * tests/tigermoth-thresholds.json t2_stall. `topSpeed`: Level speed at
   * full throttle, m/s: tests/tigermoth-thresholds.json t4_top, derived.
   * `dims`: The drawn machine, src/render/tigermothcraft.js
   * TIGERMOTH_DIMS: the furthest reach in plan is the rudder's trailing
   * edge, 1.070 m aft, further than the tips' 0.902 m; the lowest drawn
   * point the mains' and the highest the top wing's tips.
   */
  airframeOf('tigermoth1803'),
  /*
   * E-flite's Extra 300 3D 1.3m, EFL115500, docs/EXTRA-STAGE1.md: a
   * moulded foam aerobatic monoplane, 1.51 kg on 4S, simId 29 on the
   * fixed wing plant (14 until it was removed on 2026-09-29; back for the
   * flight model lane under a new id, docs/FLIGHTMODEL.md). Its thrust is two and a half times its weight, so
   * it hangs on its prop: its oversized ailerons, elevator and rudder
   * work in the slipstream with no airspeed at all, and the airframe
   * turns against the prop's torque when they are let go. A taildragger
   * on spatted wheels; `gear` is the plant's settled pose, which the
   * drawn wheels in src/render/extracraft.js match: the CG 0.2221 m over
   * the ground and 6.7 degrees nose up, tail down.
   *
   * The row is its folder's, aircraft/extra3d1308/aircraft.js. `stall`:
   * Clean stall, m/s, sqrt(2W / rho S CLmax): tests/extra-thresholds.json
   * e2_stall. `topSpeed`: Level speed at full throttle, m/s:
   * tests/extra-thresholds.json e4_top, derived. `dims`: The drawn
   * machine, src/render/extracraft.js EXTRA_DIMS: the furthest reach in
   * plan is the rudder's trailing edge, 0.926 m aft, further than the
   * tips; the lowest drawn point the wheels' and the highest the rudder's
   * top.
   */
  airframeOf('extra3d1308'),
  /*
   * E-flite's Night Timber X 1.2m, EFL13850 and EFL13875,
   * docs/NIGHTTIMBER-STAGE1.md: the Timber X's STOL high wing with its
   * oversized surfaces and factory LED lights, 1.70 kg on 4S, simId 30
   * on the fixed wing plant. Its thrust is about one and a half times
   * its weight, so it hangs on its prop, the flaps mixed in as full
   * span ailerons reaching the slipstream. A taildragger on tundra
   * tyres; `gear` is the plant's settled pose, which the drawn wheels in
   * src/render/nighttimbercraft.js match: the CG 0.2569 m over the
   * ground and 4.63 degrees nose up (nighttimber:gates N13). `flaps`:
   * F sets them.
   *
   * The row is its folder's, aircraft/nighttimber1200/aircraft.js.
   * `stall`: Clean stall, m/s, sqrt(2W / rho S CLmax):
   * tests/nighttimber-thresholds.json n2_stall. `topSpeed`: Level speed at
   * full throttle, m/s: tests/nighttimber-thresholds.json n4_top, derived.
   * `dims`: The drawn machine, src/render/nighttimbercraft.js
   * NIGHTTIMBER_DIMS: the furthest reach in plan is the rudder's trailing
   * edge, 0.716 m aft, further than the tips; the highest the prop's tip.
   */
  airframeOf('nighttimber1200'),
  /*
   * AeroTetris's C-130 Hercules 3077, docs/HERCULES-STAGE1.md: a laser
   * cut balsa and ply C-130H at 1:13.13, 6.73 kg on four Power 25s each
   * on its own 3S pack, simId 31 on the fixed wing plant, which takes the
   * four props as one thrust line (docs/HERCULES-CONTRACT.md). A high
   * wing, the upswept tail with its rear ramp and cargo door, which O
   * opens in flight, and a fixed tricycle gear in the sponsons whose nose
   * wheel steers; `gear` is the plant's settled pose, which the drawn
   * wheels in src/render/herculescraft.js match: level, the CG 0.2604 m
   * over the ground.
   *
   * The row is its folder's, aircraft/hercules3077/aircraft.js. `ramp`: A
   * rear ramp and cargo door the plant opens in flight (O), and the
   * paradrop out of it (P): docs/HERCULES-CONTRACT.md. `stall`: Clean
   * stall, m/s, sqrt(2W / rho S CLmax): tests/hercules-thresholds.json
   * h1_stall. `topSpeed`: Level speed at full throttle, m/s:
   * tests/hercules-thresholds.json h4_top, derived. `dims`: The drawn
   * machine, src/render/herculescraft.js HERCULES_DIMS: the furthest reach
   * in plan is a tip's trailing corner, the lowest drawn point the wheels'
   * and the highest the fin's top.
   */
  airframeOf('hercules3077'),
  /*
   * Extreme Flight's 67 in CAP 580, A464, docs/CAP580-STAGE1.md: a balsa
   * and carbon IMAC and 3D monoplane, 3.63 kg on 6S, simId 32 on the
   * fixed wing plant. T-Motor's bench table gives it 2.6 times its
   * weight in thrust, so it hangs on the prop as the Extra does, at
   * twice the Extra's weight and its wing loading half again. A
   * taildragger on carbon legs and pants; `gear` is the plant's settled
   * pose, which the drawn wheels in src/render/capcraft.js match: the CG
   * 0.313 m over the ground and 10.87 degrees nose up (cap580:gates C13).
   * The row is its folder's, aircraft/cap1702/aircraft.js. `stall` is the
   * clean stall, m/s, sqrt(2W / rho S CLmax), tests/cap580-thresholds.json
   * c2_stall; `topSpeed` the level speed at full throttle, m/s, c4_top,
   * derived; `dims` the drawn machine, src/render/capcraft.js CAP_DIMS.
   */
  airframeOf('cap1702'),
  /*
   * Extreme Flight's 105.5 in Slick 580 EXP (the V3 on the V2's data
   * sheet), docs/SLICK-STAGE1.md: a 35 percent balsa and composite IMAC
   * and 3D aerobat, 12.47 kg with its 34 oz tank full, simId 33 on the
   * fixed wing plant. A Desert Aircraft DA-120 petrol twin turns a 28 x 10
   * carbon prop at Falcon's measured 6,550 rpm and 31.0 kg standing, two
   * and a half times its weight, so it hangs on its prop as the Extra
   * does with thirty times the Extra's pitch inertia; the stick runs the
   * engine from its 1,300 rpm idle to full and it never stops, and
   * `voice` is the two stroke's note in the mix (src/render/audio.js). The
   * pack is the receiver's, which the engine draws nothing from. A
   * taildragger on pants; `gear` is the plant's settled pose idling,
   * which the drawn wheels in src/render/slickcraft.js match: the CG
   * 0.4088 m over the ground and 9.36 degrees nose up (slick:gates S13).
   * The row is its folder's, aircraft/slick2680/aircraft.js. `stall` is
   * the clean stall, m/s, sqrt(2W / rho S CLmax), tests/slick-thresholds.json
   * s2_stall; `topSpeed` the level speed at full throttle, m/s, s4_top,
   * derived. `dims` is the drawn machine, src/render/slickcraft.js
   * SLICK_DIMS: the furthest reach in plan is the rudder's foot's trailing
   * edge, 1.728 m aft, further than the tips; the lowest drawn point the
   * wheels' and the highest the rudder's top.
   */
  airframeOf('slick2680'),
  /*
   * FMS's 1450 mm P-51D Mustang V8, docs/P51-STAGE1.md: the full size
   * P-51D to the kit's span, 2.35 kg of foam, simId 15 on the fixed wing
   * plant, with ailerons, an elevator, a rudder, plain flaps and electric
   * retracts, on FMS's 4250 540 kV and a 14 x 8 four blade on 4S. It
   * stands on three points at 13 degrees and swings left on the take off
   * roll, which right rudder holds; it drops a wing at the stall. The row
   * is its folder's, aircraft/p51d1450/aircraft.js (docs/AIRCRAFT-FOLDER.md).
   * `gear` is the plant's settled pose, which the drawn wheels in
   * src/render/p51craft.js match: the CG 0.2291 m over the ground and
   * 13.13 degrees nose up. `flaps` says it has flaps (F) and `retracts`
   * that G raises and lowers the gear, which the OSD shows. `stall` is the
   * clean stall, m/s, sqrt(2W / rho S CLmax), tests/p51-thresholds.json
   * p2_stall; `topSpeed` the level speed at full throttle with the gear
   * up, m/s, p4_top, derived. `dims` is the drawn machine,
   * src/render/p51craft.js P51_DIMS: the furthest reach in plan is the
   * rudder's trailing edge, the lowest drawn point the main tyres' and the
   * highest the fin's top.
   */
  airframeOf('p51d1450'),
  {
    /*
     * Freewing's F-16 Fighting Falcon V3, the 70 mm EDF, 6S High
     * Performance PNP (FJ21115P), docs/F16-STAGE1.md: a 1/11.5 scale EPO
     * jet, 878 mm across its tip rails, 2.116 kg on a 6S 4000, simId 16 on
     * the fixed wing plant. Ailerons, all moving stabilators and a rudder.
     * Its 70 mm twelve blade fan is the plant's ducted fan: the thrust
     * lags the stick as the fan spools and falls away with airspeed, and
     * the ESC stops the fan with the stick closed. `voice` is the fan's
     * whine (src/render/audio.js). It stands level on a tricycle gear
     * whose nose wheel steers with the rudder and which retracts on G
     * (`retracts`, the P-51's system); `gear` is the plant's
     * settled pose, which the drawn wheels in src/render/f16craft.js
     * match: the CG 0.140 m over the runway.
     */
    id: 'f16878',
    simId: 16,
    fixedWing: true,
    retracts: true,
    voice: 'edf',
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/f16-thresholds.json s2_stall. */
    stall: 11.98,
    /* Level speed at full throttle, m/s: Freewing's 165 km/h, tests/f16-thresholds.json s4_top. */
    topSpeed: 45.83,
    gear: { restHeight: 0.140, restPitch: 0 },
    name: 'F-16 Falcon',
    short: 'F-16',
    blurb: 'An 878 mm Freewing F-16 Fighting Falcon on a 70 mm ducted fan and 6S: ailerons, all moving stabilators, a rudder and a steerable nose wheel. The fan takes a moment to spool and its thrust falls away with speed, so it keeps its energy and wants a long, planned approach. G raises and lowers the retracts.',
    facts: ['70 mm EDF', '878 mm', '6S'],
    sizeMm: 878,
    grams: 2116,
    trackClass: 'wing',
    cells: 6,
    ...packStates(),
    defaultTune: 'f16-manual',
    gravityBase: 1.0,
    rates: stockRates(),
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/f16craft.js F16_DIMS: the furthest
     * reach in plan is the pitot's tip, the lowest drawn point the wheels'
     * and the highest the fin's top. */
    dims: {
      arm: 0,
      propR: 0.0345,
      hullR: 0.710,
      vHalfDown: 0.140,
      vHalfUp: 0.265,
      bodyLength: 1.306,
      bodyWidth: 0.878,
      bodyHeight: 0.405,
    },
  },
  {
    /*
     * Zagi's 48 in Zagi HP, docs/ZAGI-STAGE1.md: the slope soaring and
     * combat classic as Zagi sells it today, an EPP flying wing on a 3100
     * kV inrunner and a 5 x 5 carbon pusher on 3S, 723 g, simId 17 on the
     * fixed wing plant. Elevons and no rudder; thrown by hand and landed
     * on its belly, as the Radian is, and it rises in the thermals over
     * the field as the gliders do.
     */
    id: 'zagi1219',
    simId: 17,
    fixedWing: true,
    /* Trimmed stall, m/s, with the elevons holding the wing at its CL max:
     * tests/zagi-thresholds.json z2_stall. */
    stall: 7.36,
    /* Level speed at full throttle, m/s: tests/zagi-thresholds.json z4_top, derived. */
    topSpeed: 36.80,
    name: 'Zagi HP',
    short: 'Zagi',
    blurb: 'A 48 in Zagi HP on 3S, the EPP flying wing that taught a generation to fly on the slope and in combat. Throw it hard, and go easy on the elevons: it rolls fast and it answers the smallest touch in pitch. No rudder. It glides a long way and slides in on its belly.',
    facts: ['3S', '1219 mm', 'Flying wing'],
    sizeMm: 1219,
    grams: 722.9,
    trackClass: 'wing',
    cells: 3,
    ...packStates(),
    defaultTune: 'zagi-manual',
    gravityBase: 1.0,
    rates: stockRates(),
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/zagicraft.js ZAGI_DIMS: the furthest
     * reach in plan is the winglet's top trailing corner, the lowest
     * drawn point the belly at the root and the highest the winglets'
     * tops. */
    dims: {
      arm: 0,
      propR: 0.0635,
      hullR: 0.6657,
      vHalfDown: 0.012,
      vHalfUp: 0.1267,
      bodyLength: 0.4707,
      bodyWidth: 1.2192,
      bodyHeight: 0.1387,
    },
  },
  {
    /*
     * OA Composites' NRJ, docs/DLG-STAGE1.md: a 1490 mm F3K discus launch
     * glider of 213 g, simId 21 on the fixed wing plant, flaperons, an
     * elevator and a rudder, and no motor at all. `discus` is its launch:
     * L, or the throttle stick up, and the pilot turns once with it by
     * the peg on its left wingtip and lets it go climbing at 41 m/s
     * (sim_wing_discus), to about 60 m, where it has to find a thermal,
     * the Radian's, to stay up. `noMotor`: the hangar has no power to
     * offer, and says so. It comes home on its belly, or into the hand.
     */
    id: 'nrj1490',
    simId: 21,
    fixedWing: true,
    discus: true,
    noMotor: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/dlg-thresholds.json d3_stall. */
    stall: 4.35,
    /* The release, m/s: the fastest it flies is the throw. */
    topSpeed: 41,
    name: 'NRJ DLG',
    short: 'DLG',
    blurb: 'A 1490 mm OA Composites NRJ, a 213 g carbon discus launch glider with no motor. Spin and throw it by the wingtip to 60 m, then work the thermals to stay up; bring it home on its belly or catch it.',
    facts: ['No motor', '1490 mm', '213 g'],
    sizeMm: 1490,
    grams: 213,
    trackClass: 'wing',
    cells: 1,
    ...packStates(),
    defaultTune: 'nrj-manual',
    gravityBase: 1.0,
    rates: stockRates(),
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/dlgcraft.js DLG_DIMS: the tips'
     * trailing corners 0.7512 m from the CG, the rudder's trailing edge
     * 0.700 m aft, the pod's belly 0.042 m under the CG and the fin's top
     * 0.180 m over it. */
    dims: {
      arm: 0,
      propR: 0,
      hullR: 0.7512,
      vHalfDown: 0.042,
      vHalfUp: 0.180,
      bodyLength: 0.959,
      bodyWidth: 1.49,
      bodyHeight: 0.222,
    },
  },
  {
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
     */
    id: 'striker2500',
    simId: 27,
    fixedWing: true,
    /* Its stall, m/s, trimmed with the standard warhead in the nose:
     * combat-derive's, which npm run combat:gates holds the module to. */
    stall: 13.53,
    /* Level at full throttle, m/s, combat-derive's, held the same way. */
    topSpeed: 34.2,
    catapult: STRIKER_RAIL,
    voice: 'glow2',
    name: 'Striker',
    short: 'Striker',
    blurb: 'The raid\'s own pusher delta, 2.5 m across, on a 110 cc boxer twin or a small turbojet, with a warhead in its nose. Shoot it off the rail, fly it fast and level, put it into the target. It is stable and heavy, not aerobatic, and the jet takes seconds to spool.',
    facts: ['Pusher delta', '2500 mm', 'Warhead'],
    sizeMm: 2500,
    grams: 13824.9,
    thrustToWeight: 2.09,
    trackClass: 'wing',
    /* The ignition's and the receiver's pack: the engine burns fuel. */
    cells: 2,
    ...packStates(),
    defaultTune: 'striker-stab',
    gravityBase: 1.0,
    rates: stockRates(),
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine about its CG (combat-derive's hull): the furthest
     * reach in plan is a fin's top trailing corner, the lowest point the
     * belly skid's foot, which it lands on, and the highest the prop's
     * upper blade; nose to hub 2.67 m. The contact box in plant.c is the
     * skid and the fins' tops. */
    dims: {
      arm: 0,
      propR: 0.381,
      hullR: 1.5733,
      vHalfDown: 0.2514,
      vHalfUp: 0.4006,
      bodyLength: 2.67,
      bodyWidth: 2.502,
      bodyHeight: 0.652,
    },
    combat: {
      frame: 'striker',
      propulsion: [
        { id: 'prop', simId: 27, grams: 13824.9, thrustToWeight: 2.09, stall: 13.53, topSpeed: 34.2, voice: 'glow2', cgDz_m: 0, drawing_m: [0.146, 0, 0.0196] },
        { id: 'jet', simId: 28, grams: 13492, thrustToWeight: 1.06, stall: 14.07, topSpeed: 66.3, voice: 'edf', cgDz_m: 0.0097, drawing_m: [0.146, 0, 0.0099] },
      ],
      payloads: [
        { id: 'standard', warhead: 'standard', massKg: 1.5, dragArea_m2: 0, cgOffset_m: [1.196, 0, 0.0196], dims: { d: 0.26, len: 0.3 } },
        { id: 'wide', warhead: 'wide', massKg: 2.2, dragArea_m2: 0, cgOffset_m: [1.186, 0, 0.0196], dims: { d: 0.28, len: 0.28 } },
        { id: 'penetrator', warhead: 'penetrator', massKg: 1.8, dragArea_m2: 0, cgOffset_m: [1.246, 0, 0.0196], dims: { d: 0.16, len: 0.4 } },
        { id: 'emp', warhead: 'emp', massKg: 1.1, dragArea_m2: 0, cgOffset_m: [1.156, 0, 0.0196], dims: { d: 0.26, len: 0.22 } },
      ],
      accessories: [
        { id: 'whip', massKg: 0.06, cgOffset_m: [0.446, 0, 0.2196] },
      ],
      /* The bay's trim lead: whatever is carried, it brings the CG to the
       * wide warhead's (configs/combat.js trimBallastKg). */
      ballast: { at_m: [1.426, 0, 0.0196] },
    },
  },
];

export const AIRFRAME_IDS = AIRFRAMES.map((a) => a.id);

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
 * edge 540, eliminate extra, eliminate pitts, eliminate wot 4"): the
 * Pitts's successor is the other biplane, the Tiger Moth; the rest go to
 * the Ugly Stik, the sport aerobat that is left. Their sim ids stay
 * reserved (src/native/sim_abi.h), so nothing is ever flown on them again.
 *
 * The five inch and the 65 mm whoop were removed on 2026-10-03 at the
 * owner's request ("eliminate the 5 inch model and the 65mm whoop model as
 * well"), from the whole game. Both go to the interceptor, the racer that
 * is left (DEFAULT_AIRFRAME), and like every quad it is open from the
 * start. Sim id 0 is NOT reserved the way the planes' are: plant 0 stays in
 * the module as the reference stage 1 verification flies, and no pilot is
 * seated on it.
 */
const RETIRED_AIRFRAMES = {
  '5inch': { to: 'interceptor', name: 'Five inch' },
  whoop65: { to: 'interceptor', name: '65 mm whoop' },
  wing1000: { to: 'bramor2300', name: 'Fixed wing' },
  edge1524: { to: 'uglystik1567', name: 'Edge 540' },
  extra1308: { to: 'uglystik1567', name: 'Extra 300 3D' },
  pitts850: { to: 'tigermoth1803', name: 'Pitts S-1S' },
  wot41334: { to: 'uglystik1567', name: 'Wot 4' },
  quickie1293: { to: 'uglystik1567', name: 'Quickie 500' },
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

/*
 * THE FLOAT VERSIONS. A plane on floats is its own airframe to the module
 * (its own simId, plant and physics) but not to the pilot: it is the land
 * plane with the Floats toggle on, beside the span and the weight in the
 * hangar. The picker and the progression show the land plane alone. A
 * float version is the row with `floats` whose `tunesOf` names its land
 * plane, which is how the table already said so.
 */
const LAND_OF = Object.fromEntries(AIRFRAMES.filter((a) => a.floats && a.tunesOf).map((a) => [a.id, a.tunesOf]));
const FLOATS_OF = Object.fromEntries(Object.entries(LAND_OF).map(([f, land]) => [land, f]));

/* The land plane a float version is, or the id itself. */
export function landPlaneOf(id) {
  return LAND_OF[id] ?? id;
}

/* The float version of a land plane, or null for one that has none. */
export function floatVersionOf(id) {
  return FLOATS_OF[id] ?? null;
}

/* Whether this id is a float version. */
export function isFloatVersion(id) {
  return Object.hasOwn(LAND_OF, id);
}

// The plant number for a stored id; an unknown id gets the default
// aircraft's rather than an error.
export function simIdFor(id) {
  return airframeById(id).simId;
}

/*
 * The kind of course an aircraft races: 'full' for the 60 by 40 m quad
 * field, 'micro' for an indoor room, 'wing' for a 400 by 300 m airfield.
 * The builder, the world, the gates and the board all go by it.
 */
export function trackClassFor(id) {
  return airframeById(id).trackClass;
}
