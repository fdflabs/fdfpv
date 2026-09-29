/*
 * airframes.js: the aircraft the shell offers, and the only place any of
 * them is named.
 *
 * An AIRFRAME is a plant, not a tune. It is the mass, the inertia, the
 * motors, the rotors, the pack, the drag and the ducts, all of which are
 * compiled into dist/sim.wasm and selected at runtime by `sim_set_airframe`
 * (src/native/sim_abi.h). `simId` is that call's argument and it is the one
 * number in this file the module cares about; everything else here is the
 * shell's own knowledge of the machine.
 *
 * A TUNE is a Betaflight CLI diff, lives in configs/registry.js, and belongs
 * to a PLANT: the Tune row offers the tunes written for the plant the seated
 * airframe selects. Loading a tune onto a plant it was never written for is
 * not a thing a pilot should be able to do by accident, and that rule is why
 * the whoop, on the five inch's plant, gets the five inch's tunes and not
 * the three whoop presets it used to carry.
 *
 * `id` is what goes in localStorage and into the record key, so changing one
 * orphans a stored choice and every local best flown on it. src/ui/ui.js
 * falls back to the first row rather than throwing, because a stale setting
 * must never stop the page booting.
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

/*
 * THE 65 MM WHOOP AS A REAL OBJECT, which is a different thing from the
 * airframe above that wears its name.
 *
 * These are the numbers the whoop entry's `dims` held until the machine
 * started flying the five inch's plant, and they are quoted from the published
 * specification for a 65 mm whoop: a 65 mm wheelbase, so arm is 0.065 / (2 sqrt 2) and is plant.c's
 * arm_x times sqrt 2; a 31 mm Gemfan 1207 three blade; a duct whose outer
 * radius is the 33 mm bore that gives that prop a 1 mm tip gap plus a 1.6 mm
 * moulded wall. Axis aligned that is 2 * (0.0325 / sqrt 2 + 0.0181) =
 * 82.2 mm against the maker's published 82.6 by 82.6 mm for the frame, which
 * is the figure to check these against and not the 65 mm wheelbase, which is
 * a motor spacing and not a size.
 *
 * The duct is the outside of this aircraft and the prop is not, in every
 * horizontal direction, which is the entire point of the design. 10 mm of
 * duct sits below the CG and 18 mm of canopy and camera above it.
 *
 * TWO THINGS READ THIS. src/render/whoopcraft.js models the ducts, the
 * canopy and the body from it, so the drawn machine keeps a whoop's
 * proportions however large it is drawn. And MICRO_SCALE below is derived
 * from it. Nothing else should: the collider, the plant and the shell all
 * want the airframe's own `dims`, which is the five inch.
 */
export const WHOOP_TRUE_DIMS = {
  arm: 0.0325,
  propR: 0.0155,
  hullR: 0.0181,
  vHalfDown: 0.010,
  vHalfUp: 0.018,
  bodyLength: 0.0826,
  bodyWidth: 0.0826,
  bodyHeight: 0.028,
};

/*
 * THE BRAMOR'S CATAPULT, named on its own because three things read it:
 * the airframe below, the drawn launcher (src/render/bramorcraft.js) and
 * the harness's release (tests/lib/wingpilot.js), and the last two must
 * not disagree with the first about where the aircraft leaves the rail.
 * From the Italian Army's photograph, docs/BRAMOR-STAGE1.md, all of it
 * ESTIMATED: a 3.1 m rail at 20 deg with its foot on the ground, the
 * aircraft's CG 1.17 m up on the cradle at the top, let go at 17 m/s,
 * 1.3 times its stall.
 */
export const BRAMOR_CATAPULT = { speed: 17, pitchDeg: 20, railLength: 3.1, height: 1.17 };

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

export const AIRFRAMES = [
  {
    id: '5inch',
    simId: 0,
    name: 'Five inch',
    short: '5 inch',
    /* What a pilot calls it out loud, for a card and for the board. */
    blurb: 'A 710 gram 6S freestyle and race quad. Eight and a half to one, forty metres a second, and a field big enough to use it.',
    facts: ['6S', '220 mm', '8.4 : 1'],
    /*
     * THE PICKER'S TWO NUMBERS (src/ui/carousel.js). `sizeMm` is the span of
     * a fixed wing and the motor to motor diagonal of a quad, the figure its
     * maker quotes. `grams` is the all up weight, which is plant.c's mass for
     * this plant; the whoop, flown on the five inch's plant, carries the real
     * 65 mm machine's, plant.c's airframe 1. scripts/craft-pick-selftest.js
     * holds both to the module.
     */
    sizeMm: 220,
    grams: 710,
    /* Track class. The builder, the world and the board all branch on this
     * rather than on the airframe id, because what changes is the SIZE OF
     * THE PLACE and one day there may be two airframes that fly the same
     * size of track. */
    trackClass: 'full',
    /* Level speed at full throttle, m/s, and thrust over weight at 1 g: the
     * two figures in `blurb` and `facts`, read by the in-sim builder's
     * racing line (src/builder/line.js). */
    topSpeed: 40,
    thrustToWeight: 8.4,
    cells: 6,
    /* Pack open circuit volts a cell, in the order the launch card offers
     * them: charged, mid, empty. A 6S LiPo, so 4.20 down to 3.50. */
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'betaflight-default',
    /*
     * THE WEIGHT THIS AIRFRAME IS FLOWN AT, as a multiple of 9.80665 handed
     * to sim_set_gravity when the Weight slider reads 100. The module's own
     * default is 1.0 and every band in tests/ and gates.config.json was
     * measured there; this number is the pilot's, not the harness's.
     *
     * 1.62 is ninety percent of the top of the first slider's band. That
     * slider ran 70 to 180 percent of 1.0 and the owner flew it to the stop
     * and said full Sinky "feels about right", then asked for normal to sit
     * at ninety percent of that with headroom either way. The slider is now
     * Weight 60 to 140 around this base, so its floaty end, 0.97, is within
     * half a percent of the machine every earlier record was set on, and its
     * sinky end, 2.27, is heavier than anyone has yet asked for.
     *
     * Measured at this base on the five inch: hover 35.0 percent of stick,
     * ten metres of fall from a hover with the throttle cut in 1.20 s, a
     * 400 ms punch ballooning 1.62 m at idle afterwards, props level descent
     * 28.3 m/s. At 1.0 those were 26.4, 1.53 s, 3.80 m and 22.0.
     */
    gravityBase: 1.62,
    /*
     * Betaflight 4.5.1's own rate defaults, which is what RATE_DEFAULTS in
     * configs/rates.js already is. Named here as well so the two airframes
     * are read the same way rather than one of them being the special case
     * that inherits.
     */
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      /*
       * The whole stick, and the whoop gets the whole stick too since it
       * was brought onto the five inch's rates. This comment used to say
       * "see the whoop's, which does not get one", which was true of the
       * 65 percent cap that sat there until that change took it off.
       *
       * Hover is at 26.5 percent of stick here, so most of the travel is
       * above it, and a feel report has since said so in the words
       * "throttle is touchy". The cap is NOT being put back by default:
       * uncapped is what the board's times were flown on and what a real
       * quad hands you. It is offered instead, on the Rates screen and
       * again in the feel form the moment a pilot ticks that chip.
       */
      throttleCap: 100,
    },
    /*
     * The camera the airframe carries, seeded onto the pilot's settings when
     * the airframe is chosen. src/ui/ui.js keeps camera in the Quad screen
     * rather than in Pilot for exactly this reason: it is bolted to the
     * machine and changes what a yaw does to the picture. Both values are
     * from the lists src/render/lens.js offers, so a seeded value is one the
     * pilot could have chosen themselves.
     *
     * 85 and 30 are Betaflight-era normal for a 5 inch: a fast machine flown
     * with a lot of tilt.
     */
    cameraFov: 85,
    cameraAngle: 30,
    /*
     * The airframe as the renderer draws it and the collider sweeps it, in
     * metres. src/game/collide.js reads these and derives CRAFT_R from them,
     * src/render/craft.js draws from the same two, and tests/lib/checks.js
     * check 15 asserts the two agree against the DRAWN geometry, because
     * this project has shipped a scale error before.
     *
     * arm is motor centre to airframe centre: 0.110 is a 220 mm machine, and
     * it is the same number as plant.c's arm_x times sqrt 2.
     */
    dims: {
      arm: 0.110,
      propR: 0.0635,
      /*
       * The outermost radius about a motor that this aircraft presents to
       * the world, which is what src/game/collide.js sweeps. On a naked
       * five inch that IS the blade, so the two are the same number, and
       * saying so here rather than defaulting it keeps the collider from
       * silently inheriting the prop radius on an airframe where the prop
       * is not the outside. See the whoop below, where it is not.
       */
      hullR: 0.0635,
      /*
       * HOW FAR THE HULL REACHES BELOW AND ABOVE THE CG, level, in metres.
       *
       * These are `hull_hz_down` and `hull_hz_up` from src/native/plant.c,
       * which is the copy of record for them: the plant rests this craft on a
       * ground plane with exactly these extents, so the collider that sweeps
       * it past a kerb has to be the same machine or the two disagree about
       * where the bottom of the quad is. Measured off dist/sim.wasm, a five
       * inch dropped on a floor first contacts at a CG height of 45.1 mm and
       * settles at 43.1 mm, which is what hull_hz_down 0.045 means.
       *
       * This was ONE number, `vHalf: 0.040`, used the same both ways, and its
       * comment explained it as covering the drawn stack, the body's underside
       * at -0.017 and the prop discs at +0.034, with half a centimetre over
       * the prop plane. Covering the larger extent and mirroring it is only
       * harmless on a craft that is about as deep below as it is tall above.
       * See the whoop, which is not: it is 18 mm of canopy over 10 mm of duct,
       * so mirroring the canopy gave it 18 mm of hull under a machine that has
       * 10, and a pilot skimming a 26.7 mm RaceGOW pipe felt 8 mm of nothing.
       *
       * `vHalfDown` is also WHERE THE FLOOR IS as far as the shell is
       * concerned: src/main.js seats SPAWN_ALT and REST_HEIGHT from it, so
       * the ground plane goes that far under the plant's origin, the craft
       * spawns and parks there, and "is this height the ground" is asked
       * against it. Those were the five inch's 45 mm on every aircraft, so
       * A whoop rested 35 mm in the air. `npm run whoop:gates` W15 drops
       * the real module on a plane raised by this number and fails if it
       * ever stops being where the craft settles.
       */
      vHalfDown: 0.045,
      vHalfUp: 0.038,
      bodyLength: 0.155,
      bodyWidth: 0.088,
      bodyHeight: 0.034,
    },
  },
  {
    id: 'whoop65',
    /*
     * ZERO, WHICH IS THE FIVE INCH'S PLANT, AND THE WHOLE POINT OF THIS
     * AIRFRAME NOW.
     *
     * It was 1, a 23 g 1S ducted whoop modelled honestly off the published
     * specification: three times the five inch's angular acceleration, a fifth of
     * its speed, its own inertia, its own drag, its own 1S sag. It is still
     * in src/native/plant.c as SIM_AIRFRAME_WHOOP65 and nothing selects it.
     *
     * The owner flew every version of it and the verdict never moved: it
     * does not feel like flying. The five inch does. A real whoop in a real
     * room flies mostly like a five inch with slightly less momentum,
     * because a pilot flies to what the picture does and the picture is the
     * same picture; the dynamic differences the plant was reproducing are
     * real and are not what the hands feel.
     *
     * So this machine flies the five inch's plant, and the room it flies in
     * is built MICRO_SCALE times life size to give a five inch the space it
     * needs. Scaling a world and the craft in it by one factor is a change
     * of units and nothing else, so every frame is the frame it was: the
     * picture is a whoop threading 28 inch RaceGOW gates and the feel
     * underneath it is the five inch's. See MICRO_SCALE at the foot of this
     * file for the derivation and for what the fiction costs.
     */
    simId: 0,
    name: '65 mm whoop',
    short: 'Whoop',
    blurb: 'A 65 mm ducted whoop indoors, flying the five inch\'s flight model. The hall and its gates are built to match it, so what you see is a whoop through 28 inch gates and what you feel is the 5 inch.',
    facts: ['Indoors', '65 mm', '5 inch feel'],
    sizeMm: 65,
    grams: 23.4,
    trackClass: 'micro',
    /* The five inch's, since this flies the five inch's plant. */
    topSpeed: 40,
    thrustToWeight: 8.4,
    /*
     * SIX, BECAUSE THE PLANT IS THE FIVE INCH'S AND ITS THRUST IS KEYED TO
     * PACK VOLTS. A 1S pack on a 6S plant is a quad that will not leave the
     * floor. The launch card says 6S on a whoop, which is a visible seam in
     * the fiction and is the honest place to put one: the alternative is a
     * card that lies about the machine it is about to hand over.
     */
    cells: 6,
    /*
     * A 1S LiHV charges to 4.35 and a whoop is flown until it is at about
     * 3.40 under load, which is why the empty figure here is higher than the
     * 5 inch's 3.50 rather than lower: these are OPEN CIRCUIT volts, and a
     * 1S whoop pack at 3.60 open circuit is already sagging under a punch to
     * the 3.00 its own battery profile warns at.
     */
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    /* The five inch's base, because simId above is the five inch's plant:
     * the pilot who set 1.62 flew the only plant this entry flies. A whoop
     * plant of its own would carry its own number here. */
    gravityBase: 1.62,
    /*
     * THE FIVE INCH'S TUNE, BECAUSE THE PLANT IS THE FIVE INCH'S.
     *
     * This was 'whoop-champion', the maker's own shipped configuration for the
     * whoop, and it was the right answer for as long as SIM_AIRFRAME_WHOOP65
     * was what flew. It is the wrong answer now and not by a little: a whoop
     * preset is a 1S configuration, its P and D are sized against 6e-6 kg m^2
     * of inertia, its filter cutoffs against a 23 g frame's resonances and its
     * motor idle and voltage compensation against a cell that sags to 3.0 V
     * under a punch. Loaded onto a 710 g 6S machine it is an underdamped
     * sluggish tune, which is exactly the complaint this whole change exists
     * to answer.
     *
     * The three whoop presets stay on disk in configs/ and are retired from
     * the Tune row by configs/registry.js. They are real published configurations and
     * cost nothing to keep; what they must not do is be offerable for a plant
     * they were never written for.
     */
    defaultTune: 'betaflight-default',
    /*
     * THE FIVE INCH'S RATES, FOR THE SAME REASON AS THE TUNE.
     *
     * These were the maker's own profile for the whoop: ACTUAL, srate
     * 58 / 58 / 50, which is 580 deg/s on roll and pitch and 500 on yaw, with
     * a 65 percent SCALE throttle cap. Every one of those numbers was chosen
     * against a machine with three times this plant's angular acceleration
     * and 4.7 to one of thrust on 23 grams, and the cap in particular existed
     * only because that machine put its hover at a third of the stick.
     *
     * A five inch does not have that problem. It holds a hover near half
     * stick on the whole travel, which is what the five inch's own entry says
     * and why it keeps 100. Carrying the 65 percent cap over would leave this
     * aircraft with two thirds of the thrust of the plant it is flying, in a
     * hall built for all of it.
     *
     * Rates are still the pilot's. Three rows on the Rates screen change
     * them, configs/rates.js strips every rate key out of a tune on the way
     * in, and src/ui/ui.js keeps a pilot's own rates across an airframe
     * change unless they are still the stock ones.
     */
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    /*
     * The Air II canopy takes a C03 on a 15 to 45 degree adjustable mount, so
     * 25 is inside the real range and is where an indoor racer sits: a whoop
     * track is flown slowly enough that a steep camera would put the next
     * gate off the top of the picture.
     *
     * 95, AND IT WAS 115 UNTIL THE ROOM GREW.
     *
     * The old argument was about the ROOM rather than the lens: a RaceGOW
     * track is 1.42 by 2.13 m, the aircraft is inside it the whole lap, the
     * next gate is regularly to one side rather than ahead, and in a 5 by
     * 6 m room an 85 degree picture shows a wall. That was true of a 5 by
     * 6 m room. The room is 10 by 12 now, four times the floor, and the
     * walls are metres further out: the reason for the widest stop on the
     * list went with them.
     *
     * What 115 costs is the gate. A fisheye pushes everything toward the
     * centre of the frame, so a 0.711 m opening at three metres reads
     * smaller and closer to every other thing in the picture, and picking
     * a line through a stack is harder than it should be. 95 is a real FPV
     * camera's field, it is what most pilots fly, and it puts the gate back
     * at the size the eye expects. The owner flew both.
     */
    cameraFov: 95,
    cameraAngle: 25,
    /*
     * THE FIVE INCH'S, EXACTLY, BECAUSE THIS AIRCRAFT IS ONE.
     *
     * `dims` is documented above as the airframe AS THE RENDERER DRAWS IT AND
     * THE COLLIDER SWEEPS IT, and both of those are the five inch now. The
     * plant is SIM_AIRFRAME_5IN, so its hull extents are the five inch's and
     * the shell's REST_HEIGHT has to agree with them or the craft spawns
     * buried or floating. The collider sweeps a five inch because a five inch
     * is what the physics is resolving contacts for. And the renderer draws
     * the whoop at five inch size, because the world it is drawn in is built
     * MICRO_SCALE times life size: a 65 mm model in a hall scaled by 3.43
     * would be a speck, and scaled up by the same 3.43 it lands on these
     * numbers to within two percent.
     *
     * THE REAL MACHINE'S GEOMETRY IS NOT LOST. It is WHOOP_TRUE_DIMS below,
     * which is what src/render/whoopcraft.js models the ducts and the canopy
     * from and what MICRO_SCALE is derived against. That separation is the
     * point: one block is a 65 mm whoop, which is a fact about a real
     * product, and the other is the machine this simulator flies.
     */
    dims: {
      arm: 0.110,
      propR: 0.0635,
      hullR: 0.0635,
      /*
       * DOWN IS THE PLANT'S, UP IS THE MODEL'S, and the split is not a fudge.
       *
       * vHalfDown is where the floor is as far as the shell is concerned:
       * src/main.js seats SPAWN_ALT and REST_HEIGHT from it and the plant
       * settles the craft at its own hull_hz_down, so this HAS to be the five
       * inch's 45 mm or the aircraft spawns buried or hovering. It costs a
       * whoop body 12 mm of ground clearance it would not have, 3.5 mm once
       * divided back down to the size the picture is of, and scripts/craft-check.js
       * pins it at that.
       *
       * vHalfUp has no such owner. Nothing in the plant rests a craft on its
       * canopy; what reads this is src/game/collide.js, deciding whether the
       * top of the aircraft met a gate's bar or a horizontal pole. So it is
       * the DRAWN machine's, because the drawn machine is what the pilot is
       * threading under: a whoop is proportionally much taller than a five
       * inch, 18 mm of canopy and camera over a 41 mm half span against the
       * five inch's 38 over 173, and taking the five inch's number here left
       * 7 apparent millimetres of canopy standing above the hull that sweeps
       * it. On a machine 28 mm tall that is a quarter of it passing through
       * a pipe before anything touched.
       *
       * 0.0617 is WHOOP_TRUE_DIMS.vHalfUp times MICRO_SCALE, and the
       * assertion under MICRO_SCALE fails the build if the two ever drift.
       */
      vHalfDown: 0.045,
      vHalfUp: 0.0617,
      bodyLength: 0.155,
      bodyWidth: 0.088,
      bodyHeight: 0.034,
    },
  },
  {
    /*
     * The Skyhunter 1800, docs/SKYHUNTER-STAGE1.md: a twin boom pusher
     * with ailerons, an elevator and a rudder, simId 3, on the wing's
     * plant with its own table. It flies the wing's track class, the
     * airfield, because it is the same kind of flying. The stock kit has
     * no rudder servo; this one has one, so the yaw stick does something.
     */
    id: 'sky1800',
    simId: 3,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/skyhunter-thresholds.json s2_stall. */
    stall: 9.2,
    /* Level speed at full throttle, m/s: tests/skyhunter-thresholds.json s4_top, derived. */
    topSpeed: 23.5,
    name: 'Skyhunter',
    short: 'Skyhunter',
    blurb: 'An 1800 mm twin boom FPV plane on 4S, with ailerons, elevator and rudder. Throw it, fly it long, land it on its skid.',
    facts: ['4S', '1800 mm', 'Twin boom'],
    sizeMm: 1800,
    grams: 2100,
    trackClass: 'wing',
    cells: 4,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'sky-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/skycraft.js SKY_DIMS: half span, the
     * skid 0.12 m under the CG (the contact box's floor, src/native/plant.c)
     * and the fins' tops 0.219 m over it. */
    dims: {
      arm: 0,
      propR: 0.1397,
      hullR: 0.90,
      vHalfDown: 0.12,
      vHalfUp: 0.219,
      bodyLength: 1.225,
      bodyWidth: 1.8,
      bodyHeight: 0.339,
    },
  },
  {
    /*
     * The Piper J-3 Cub, docs/CUB-STAGE1.md: the FMS 1400 mm, a high wing
     * taildragger with a tractor prop, simId 4 on the fixed wing plant.
     * The first aircraft here with wheels: it sits on its gear and takes
     * off down the strip rather than being thrown (L still throws it).
     * `gear` is where it rests, from the plant's settled pose, which the
     * drawn wheels in src/render/cubcraft.js match: the CG 0.1463 m over
     * the ground and 11 degrees nose up, tail down.
     */
    id: 'cub1400',
    simId: 4,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/cub-thresholds.json c2_stall. */
    stall: 8.1,
    /* Level speed at full throttle, m/s: tests/cub-thresholds.json c4_top, derived. */
    topSpeed: 18.4,
    gear: { restHeight: 0.1463, restPitch: 11.0 * Math.PI / 180 },
    name: 'Piper Cub',
    short: 'Cub',
    blurb: 'A 1400 mm Piper J-3 Cub on 3S, a taildragger with ailerons, elevator and rudder. Take off from the strip on its wheels and land it back on them.',
    facts: ['3S', '1400 mm', 'Taildragger'],
    sizeMm: 1400,
    grams: 1320,
    trackClass: 'wing',
    cells: 3,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'cub-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/cubcraft.js CUB_DIMS: half span, the
     * wheels' lowest drawn point and the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1397,
      hullR: 0.70,
      vHalfDown: 0.163,
      vHalfUp: 0.160,
      bodyLength: 0.9,
      bodyWidth: 1.4,
      bodyHeight: 0.323,
    },
  },
  {
    /*
     * The E-flite Radian Pro, docs/GLIDER-STAGE1.md: a 2 m powered glider
     * with ailerons, an elevator and a rudder, simId 6 on the fixed wing
     * plant (5 is the Slow Stick). Thrown by hand and landed on
     * its belly; its prop folds back when the throttle is closed, and it
     * climbs in the thermals over the airfield, which it and the Slow
     * Stick fly in.
     */
    id: 'radian2000',
    simId: 6,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/glider-thresholds.json g3_stall. */
    stall: 6.49,
    /* Level speed at full throttle, m/s: npm run glider:derive, G5 at 100 percent. */
    topSpeed: 21.89,
    name: 'Radian',
    short: 'Radian',
    blurb: 'A 2 m E-flite Radian motor glider on 3S, with ailerons, elevator and rudder. Climb on the motor, fold the prop, and find the thermals over the field to stay up.',
    facts: ['3S', '2000 mm', 'Glider'],
    sizeMm: 2000,
    grams: 980,
    trackClass: 'wing',
    cells: 3,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'radian-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/glidercraft.js GLIDER_DIMS: the tip's
     * trailing corner (1.000 m out, 0.137 m aft), the belly 0.052 m under
     * the CG, where the plant's hull rests it, and the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1238,
      hullR: 1.0093,
      vHalfDown: 0.052,
      vHalfUp: 0.268,
      bodyLength: 1.14,
      bodyWidth: 2.0,
      bodyHeight: 0.320,
    },
  },
  {
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
     */
    id: 'bramor2300',
    simId: 8,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): the published figure, tests/bramor-thresholds.json b2_stall. */
    stall: 13,
    /* Level speed at full throttle, m/s: tests/bramor-thresholds.json b4_top, derived. */
    topSpeed: 25.0,
    catapult: BRAMOR_CATAPULT,
    chute: true,
    name: 'Bramor C4EYE',
    short: 'Bramor',
    blurb: 'A 2.3 m C-Astral Bramor C4EYE on 6S, a survey flying wing with a camera ball in its nose. Catapult it off the rail, fly it long, bring it down under its parachute.',
    facts: ['6S', '2300 mm', 'Catapult'],
    sizeMm: 2300,
    grams: 4500,
    trackClass: 'wing',
    cells: 6,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'wing-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/bramorcraft.js BRAMOR_DIMS: half span,
     * the belly 65 mm under the CG and the winglets' tops 0.25 m over it,
     * the contact box's floor and roof in src/native/plant.c. */
    dims: {
      arm: 0,
      propR: 0.1524,
      hullR: 1.15,
      vHalfDown: 0.065,
      vHalfUp: 0.25,
      bodyLength: 0.96,
      bodyWidth: 2.3,
      bodyHeight: 0.315,
    },
  },
  {
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
     */
    id: 'slowstick1180',
    simId: 5,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/slowstick-thresholds.json s2_stall. */
    stall: 4.43,
    /* Level speed at full throttle, m/s: tests/slowstick-thresholds.json s4_top, derived. */
    topSpeed: 8.37,
    gear: { restHeight: 0.1349, restPitch: 6.91 * Math.PI / 180 },
    name: 'Slow Stick',
    short: 'Stick',
    blurb: 'A 1176 mm GWS Slow Stick on 2S: rudder, elevator and throttle, no ailerons. The roll stick works the rudder, it floats at a jog, and it levels itself when you let go.',
    facts: ['2S', '1176 mm', 'Three channels'],
    sizeMm: 1176,
    grams: 420,
    trackClass: 'wing',
    cells: 2,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'slowstick-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/slowstickcraft.js SLOWSTICK_DIMS: the
     * furthest reach in plan, the elevator's outer trailing corner, the
     * wheels' lowest drawn point and the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1397,
      hullR: 0.6391,
      vHalfDown: 0.1575,
      vHalfUp: 0.1975,
      bodyLength: 0.952,
      bodyWidth: 1.176,
      bodyHeight: 0.355,
    },
  },
  {
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
     */
    id: 'timber1500',
    simId: 7,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): flaps up, slats on, tests/timber-thresholds.json t2_stall_slats. */
    stall: 7.20,
    /* Level speed at full throttle, m/s: docs/TIMBER-STAGE1.md T1, measured in the plant. */
    topSpeed: 24.2,
    gear: { restHeight: 0.2115, restPitch: 11.81 * Math.PI / 180 },
    flaps: true,
    name: 'Turbo Timber',
    short: 'Timber',
    blurb: 'A 1555 mm E-flite Turbo Timber Evolution on 4S, a bush plane with slats and big flaps. Full flaps and it is off the strip in two metres and crawls nose high; flaps up and it is quick and aerobatic. F sets the flaps.',
    facts: ['4S', '1555 mm', 'STOL, flaps'],
    sizeMm: 1555,
    grams: 1700,
    trackClass: 'wing',
    cells: 4,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'timber-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/timbercraft.js TIMBER_DIMS: the
     * furthest reach in plan, the drooped tip's trailing corner, the tyres'
     * lowest drawn point and the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1397,
      hullR: 0.7981,
      vHalfDown: 0.227,
      vHalfUp: 0.195,
      bodyLength: 1.04,
      bodyWidth: 1.555,
      bodyHeight: 0.422,
    },
  },
  {
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
     */
    id: 'timber1500f',
    simId: 9,
    tunesOf: 'timber1500',
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): the landplane's 7.20 at 1.934 kg over 1.70, docs/FLOATS-STAGE1.md. */
    stall: 7.68,
    /* Level speed at full throttle, m/s: docs/FLOATS-STAGE1.md, measured in the plant. */
    topSpeed: 22.4,
    gear: { restHeight: 0.2464, restPitch: 0.48 * Math.PI / 180 },
    floats: { restHeight: 0.2074, restPitch: 2.52 * Math.PI / 180 },
    flaps: true,
    name: 'Turbo Timber, floats',
    short: 'Timber floats',
    blurb: 'The Turbo Timber on its floats, on 4S. Half flaps, stick back until the floats get on the step, then let it run and rotate; land it back on the lake with full flaps and the stick held back. The water rudders steer it on the water.',
    facts: ['4S', '1555 mm', 'Floats'],
    sizeMm: 1555,
    grams: 1934,
    trackClass: 'wing',
    cells: 4,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'timber-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine on floats, TIMBER_FLOAT_DIMS: the keels are its
     * lowest point, the fin's top the CG's 26.6 mm drop higher. */
    dims: {
      arm: 0,
      propR: 0.1397,
      hullR: 0.7981,
      vHalfDown: 0.2484,
      vHalfUp: 0.2216,
      bodyLength: 1.04,
      bodyWidth: 1.555,
      bodyHeight: 0.47,
    },
  },
  {
    /*
     * The FMS Cub on its floats, docs/FLOATS-STAGE1.md: simId 10, on the
     * Timber on floats' terms. Its thrust to weight on floats is 0.9, so it
     * needs most of its throttle to get over the hump.
     */
    id: 'cub1400f',
    simId: 10,
    tunesOf: 'cub1400',
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): docs/FLOATS-STAGE1.md, the Cub having no flaps. */
    stall: 8.73,
    /* Level speed at full throttle, m/s: docs/FLOATS-STAGE1.md, measured in the plant. */
    topSpeed: 16.9,
    gear: { restHeight: 0.2171, restPitch: 0.43 * Math.PI / 180 },
    floats: { restHeight: 0.1765, restPitch: 0.64 * Math.PI / 180 },
    name: 'Piper Cub, floats',
    short: 'Cub floats',
    blurb: 'The 1400 mm Piper J-3 Cub on floats, on 3S. Full throttle and the stick back to get it on the step, rotate at flying speed, and land it back on the lake nose up. The water rudders steer it on the water.',
    facts: ['3S', '1400 mm', 'Floats'],
    sizeMm: 1400,
    grams: 1532,
    trackClass: 'wing',
    cells: 3,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'cub-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine on floats, CUB_FLOAT_DIMS. */
    dims: {
      arm: 0,
      propR: 0.1397,
      hullR: 0.70,
      vHalfDown: 0.2186,
      vHalfUp: 0.1864,
      bodyLength: 0.9,
      bodyWidth: 1.4,
      bodyHeight: 0.405,
    },
  },
  {
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
     */
    id: 'bombshell1118',
    simId: 11,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/bombshell-thresholds.json s2_stall. */
    stall: 6.49,
    /* Level speed at full throttle, m/s: tests/bombshell-thresholds.json s4_top, derived. */
    topSpeed: 10.11,
    gear: { restHeight: 0.1318, restPitch: 8.50 * Math.PI / 180 },
    name: 'Buzzard Bombshell',
    short: 'Bombshell',
    blurb: 'A 44 in BMJR Buzzard Bombshell, the 1940 free flight classic in balsa and red tissue, on a Cox .049 glow engine: rudder, elevator and throttle, no ailerons. The roll stick works the rudder, it levels itself when you let go, and it climbs in thermals.',
    facts: ['Glow .049', '1118 mm', 'Three channels'],
    sizeMm: 1118,
    grams: 559.9,
    trackClass: 'wing',
    cells: 3,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'bombshell-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/bombshellcraft.js BOMBSHELL_DIMS: the
     * furthest reach in plan, the elevator's outer trailing corner, the
     * wheels' lowest drawn point and the polyhedral tips' tops, which
     * stand over the fin. */
    dims: {
      arm: 0,
      propR: 0.0889,
      hullR: 0.6733,
      vHalfDown: 0.1440,
      vHalfUp: 0.1793,
      bodyLength: 0.818,
      bodyWidth: 1.1176,
      bodyHeight: 0.3233,
    },
  },
  {
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
     */
    id: 'kadet1981',
    simId: 12,
    fixedWing: true,
    voice: 'glow4',
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/kadet-thresholds.json s2_stall. */
    stall: 7.15,
    /* Level speed at full throttle, m/s: tests/kadet-thresholds.json s4_top, derived. */
    topSpeed: 18.28,
    gear: { restHeight: 0.3072, restPitch: 0 },
    name: 'Kadet Senior',
    short: 'Kadet',
    blurb: 'A 78 in SIG Kadet Senior, the classic balsa trainer in transparent yellow and red film, on an O.S. FS-52 four stroke: rudder, elevator and throttle, no ailerons, and a nose wheel that steers. The roll stick works the rudder and it levels itself when you let go. Fly it against the sun to see its ribs.',
    facts: ['Four stroke .52', '1981 mm', 'Three channels'],
    sizeMm: 1981,
    grams: 2721.6,
    trackClass: 'wing',
    cells: 2,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'kadet-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/kadetcraft.js KADET_DIMS: the furthest
     * reach in plan is the elevator's rounded outer trailing corner, the
     * lowest drawn point the wheels' and the highest the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1524,
      hullR: 1.1677,
      vHalfDown: 0.3072,
      vHalfUp: 0.2464,
      bodyLength: 1.5834,
      bodyWidth: 1.9812,
      bodyHeight: 0.5536,
    },
  },
  {
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
     */
    id: 'uglystik1567',
    simId: 19,
    fixedWing: true,
    voice: 'glow2',
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/uglystik-thresholds.json u2_stall. */
    stall: 9.48,
    /* Level speed at full throttle, m/s: tests/uglystik-thresholds.json u4_top, derived. */
    topSpeed: 22.10,
    gear: { restHeight: 0.2024, restPitch: -2.06 * Math.PI / 180 },
    name: 'Ugly Stik',
    short: 'Stik',
    blurb: 'Phil Kraft\'s Das Ugly Stik, 62 in of slab sided balsa in RCM\'s red with white panels and black crosses, on an O.S. .61 two stroke. The sport plane after the trainer: it rolls on its strip ailerons, loops round at full throttle, flies on its back with a push and goes where you point it until you tell it otherwise.',
    facts: ['Two stroke .61', '1567 mm', 'Four channels'],
    sizeMm: 1567,
    grams: 2721.6,
    trackClass: 'wing',
    cells: 2,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'uglystik-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/uglystikcraft.js UGLYSTIK_DIMS: the
     * furthest reach in plan is the rudder's trailing edge, 0.884 m aft,
     * further than the tips; the lowest drawn point the mains' and the
     * highest the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1524,
      hullR: 0.8844,
      vHalfDown: 0.2032,
      vHalfUp: 0.1735,
      bodyLength: 1.3061,
      bodyWidth: 1.5682,
      bodyHeight: 0.3767,
    },
  },
  {
    /*
     * Glen Spickler's Quickie 500, American Aircraft Modeler, December
     * 1972, docs/QUICKIE-STAGE1.md: the club pylon racer the Quickie 500
     * class is named after, 51 in of balsa box and constant chord low
     * wing, RCM's 3 1/2 lb ready to fly, simId 22 on the fixed wing plant.
     * A K&B 40 R/C hung out on its side with no silencer on an APC 9 x 6:
     * flat out it does 88 mph (Spickler: "around 100 mph on the
     * straightaway"), rolls at 400 deg/s and stops where the stick is
     * centred, goes round a pylon at 6 g losing 5 percent of its speed and
     * needs no rudder to do it; closed, it glides long and flat. The stick
     * runs the engine from its 2,700 rpm idle to full and it never stops,
     * and `voice` is the two stroke's note. It stands on wire gear and a
     * tail skid and takes off from the ground, as the class does; `gear`
     * is the plant's settled pose idling, which the drawn wheels in
     * src/render/quickiecraft.js match: the CG 0.1326 m over the ground
     * and 6.47 degrees nose up.
     */
    id: 'quickie1293',
    simId: 22,
    fixedWing: true,
    voice: 'glow2',
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/quickie-thresholds.json q2_stall. */
    stall: 9.31,
    /* Level speed at full throttle, m/s: tests/quickie-thresholds.json q1_top, derived. */
    topSpeed: 39.37,
    gear: { restHeight: 0.1326, restPitch: 6.47 * Math.PI / 180 },
    name: 'Quickie 500',
    short: 'Quickie',
    blurb: 'Glen Spickler\'s Quickie 500 of 1972, the club pylon racer the class is named after: a 51 in box on a K&B .40 hung out in the wind, in white with a red sunburst and a blue band of stars. Flat out it does nearly 90 mph, rolls at 400 degrees a second and goes round a pylon flat, bleeding speed in every corner.',
    facts: ['K&B .40 glow', '1293 mm', 'Pylon racer'],
    sizeMm: 1293,
    grams: 1587.6,
    trackClass: 'wing',
    cells: 2,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'quickie-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/quickiecraft.js QUICKIE_DIMS: the
     * furthest reach in plan is the elevator's tip at its trailing edge,
     * 0.747 m, further than the tips; the lowest drawn point the mains'
     * and the highest the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1143,
      hullR: 0.7470,
      vHalfDown: 0.1449,
      vHalfUp: 0.1669,
      bodyLength: 1.0566,
      bodyWidth: 1.2934,
      bodyHeight: 0.3118,
    },
  },
  {
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
     */
    id: 'tigermoth1803',
    simId: 23,
    fixedWing: true,
    voice: 'glow2',
    /* Clean stall, m/s, sqrt(2W / rho S CLmax) on the cell: tests/tigermoth-thresholds.json t2_stall. */
    stall: 9.47,
    /* Level speed at full throttle, m/s: tests/tigermoth-thresholds.json t4_top, derived. */
    topSpeed: 18.69,
    gear: { restHeight: 0.2654, restPitch: 8.16 * Math.PI / 180 },
    name: 'Tiger Moth',
    short: 'Tiger',
    blurb: 'Great Planes\' Tiger Moth, 71 in of scale de Havilland DH.82A biplane in Cub Yellow with a black cowl, on an O.S. .61 two stroke. The trainer of the 1930s: slow and gentle, its top wing stalls first and the nose drops, but its ailerons on the bottom wing yaw it the wrong way, and every turn wants the rudder with them.',
    facts: ['Biplane', '1803 mm', 'Two stroke .61'],
    sizeMm: 1803,
    grams: 4649.3,
    trackClass: 'wing',
    cells: 2,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'tigermoth-stab',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/tigermothcraft.js TIGERMOTH_DIMS: the
     * furthest reach in plan is the rudder's trailing edge, 1.070 m aft,
     * further than the tips' 0.902 m; the lowest drawn point the mains'
     * and the highest the top wing's tips. */
    dims: {
      arm: 0,
      propR: 0.1524,
      hullR: 1.0696,
      vHalfDown: 0.2921,
      vHalfUp: 0.2771,
      bodyLength: 1.4706,
      bodyWidth: 1.8034,
      bodyHeight: 0.5692,
    },
  },
  {
    /*
     * FMS's 1450 mm P-51D Mustang V8, docs/P51-STAGE1.md: the full size
     * P-51D to the kit's span, 2.35 kg of foam, simId 15 on the fixed wing
     * plant, with ailerons, an elevator, a rudder, plain flaps and electric
     * retracts, on FMS's 4250 540 kV and a 14 x 8 four blade on 4S. It
     * stands on three points at 13 degrees and swings left on the take off
     * roll, which right rudder holds; it drops a wing at the stall. `gear`
     * is the plant's settled pose, which the drawn wheels in
     * src/render/p51craft.js match: the CG 0.2291 m over the ground and
     * 13.13 degrees nose up. `flaps` says it has flaps (F) and `retracts`
     * that G raises and lowers the gear, which the OSD shows.
     */
    id: 'p51d1450',
    simId: 15,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/p51-thresholds.json p2_stall. */
    stall: 10.06,
    /* Level speed at full throttle with the gear up, m/s: tests/p51-thresholds.json p4_top, derived. */
    topSpeed: 20.64,
    gear: { restHeight: 0.2291, restPitch: 13.13 * Math.PI / 180 },
    flaps: true,
    retracts: true,
    name: 'P-51D Mustang',
    short: 'P-51',
    blurb: 'A 1450 mm FMS P-51D Mustang on 4S, the Second World War fighter in natural metal with a red nose and tail. It swings left as the tail comes up, so feed in right rudder; it keeps its speed, and it drops a wing if you let it get slow. G raises and lowers the retracts, F sets the flaps.',
    facts: ['4S', '1450 mm', 'Retracts, flaps'],
    sizeMm: 1450,
    grams: 2350,
    trackClass: 'wing',
    cells: 4,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'p51-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/p51craft.js P51_DIMS: the furthest
     * reach in plan is the rudder's trailing edge, the lowest drawn point
     * the main tyres' and the highest the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1778,
      hullR: 0.8326,
      vHalfDown: 0.2491,
      vHalfUp: 0.2303,
      bodyLength: 1.2628,
      bodyWidth: 1.450,
      bodyHeight: 0.4794,
    },
  },
  {
    /*
     * Extreme Flight's 60 in Edge 540T, docs/EDGE-STAGE1.md: the Zivko Edge
     * 540, the Red Bull Air Race's aircraft, as an unlimited aerobatic
     * model, 2.49 kg, simId 13 on the fixed wing plant. Ailerons over the
     * whole trailing edge, an elevator and a rudder at EF's 3D throws, a
     * symmetric wing at no incidence, so it flies on its back as it flies
     * upright, and a T-Motor AM600 on 6S with three times its weight in
     * thrust. It rolls at over 600 deg/s, and a hard yank at the edge of
     * the envelope stalls one wing before the other and it snaps. A
     * taildragger on carbon gear: `gear` is the plant's settled pose, which
     * the drawn wheels in src/render/edgecraft.js match, the CG 0.2510 m
     * over the ground and 9.84 deg nose up.
     */
    id: 'edge1524',
    simId: 13,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/edge-thresholds.json e2_stall. */
    stall: 9.58,
    /* Level speed at full throttle, m/s: tests/edge-thresholds.json e4_top, derived. */
    topSpeed: 29.7,
    gear: { restHeight: 0.2510, restPitch: 9.84 * Math.PI / 180 },
    name: 'Edge 540',
    short: 'Edge',
    blurb: 'A 60 in Extreme Flight Edge 540T, the Red Bull Air Race aircraft as an unlimited aerobat, on 6S with three times its weight in thrust. It rolls at over 600 degrees a second, flies on its back as well as upright, and snaps if you yank it at the edge of the envelope. A taildragger on carbon gear.',
    facts: ['6S', '1524 mm', 'Unlimited aerobat'],
    sizeMm: 1524,
    grams: 2494.8,
    trackClass: 'wing',
    cells: 6,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'edge-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/edgecraft.js EDGE_DIMS: the furthest
     * reach in plan is the rudder's trailing edge at its foot, further
     * from the CG than the tips; the main tyres' bottoms and the fin's top. */
    dims: {
      arm: 0,
      propR: 0.2032,
      hullR: 0.9652,
      vHalfDown: 0.276225,
      vHalfUp: 0.3175,
      bodyLength: 1.4986,
      bodyWidth: 1.524,
      bodyHeight: 0.593725,
    },
  },
  {
    /*
     * E-flite's Extra 300 3D 1.3m, EFL115500, docs/EXTRA-STAGE1.md: a
     * moulded foam aerobatic monoplane, 1.51 kg on 4S, simId 14 on the
     * fixed wing plant. Its thrust is two and a half times its weight, so
     * it hangs on its prop: its oversized ailerons, elevator and rudder
     * work in the slipstream with no airspeed at all, and the airframe
     * turns against the prop's torque when they are let go. A taildragger
     * on spatted wheels; `gear` is the plant's settled pose, which the
     * drawn wheels in src/render/extracraft.js match: the CG 0.2221 m over
     * the ground and 6.7 degrees nose up, tail down.
     */
    id: 'extra1308',
    simId: 14,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/extra-thresholds.json e2_stall. */
    stall: 8.31,
    /* Level speed at full throttle, m/s: tests/extra-thresholds.json e4_top, derived. */
    topSpeed: 24.34,
    gear: { restHeight: 0.2221, restPitch: 6.7 * Math.PI / 180 },
    name: 'Extra 300 3D',
    short: 'Extra',
    blurb: 'A 1308 mm E-flite Extra 300 3D on 4S, with two and a half times its weight in thrust and control surfaces as big as it can carry. Hang it on the prop, let go of the ailerons and it torque rolls; harrier it in slow at 40 degrees, knife edge it past on the rudder.',
    facts: ['4S', '1308 mm', '3D'],
    sizeMm: 1308,
    grams: 1510,
    trackClass: 'wing',
    cells: 4,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'extra-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/extracraft.js EXTRA_DIMS: the furthest
     * reach in plan is the rudder's trailing edge, 0.926 m aft, further
     * than the tips; the lowest drawn point the wheels' and the highest the
     * rudder's top. */
    dims: {
      arm: 0,
      propR: 0.1651,
      hullR: 0.926,
      vHalfDown: 0.2416,
      vHalfUp: 0.208,
      bodyLength: 1.263,
      bodyWidth: 1.308,
      bodyHeight: 0.4496,
    },
  },
  {
    /*
     * E-flite's Pitts S-1S 850mm, EFL35500, docs/PITTS-STAGE1.md: a moulded
     * foam biplane, 1.529 kg on 3S, simId 18 on the fixed wing plant, its
     * two wings each in the other's flow (the plant's second wing). Four
     * ailerons roll it at the full size S-1S's rate, the top wing stalls
     * first, and a yank with a boot of rudder snaps it. A short taildragger
     * on wire gear in pants; `gear` is the plant's settled pose, which the
     * drawn wheels in src/render/pittscraft.js match: the CG 0.2134 m over
     * the ground and 12.3 degrees nose up, tail down.
     */
    id: 'pitts850',
    simId: 18,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/pitts-thresholds.json p2_stall. */
    stall: 9.78,
    /* Level speed at full throttle, m/s: tests/pitts-thresholds.json p4_top, derived. */
    topSpeed: 18.84,
    gear: { restHeight: 0.2134, restPitch: 12.30 * Math.PI / 180 },
    name: 'Pitts S-1S',
    short: 'Pitts',
    blurb: 'An 850 mm E-flite Pitts S-1S on 3S, the aerobatic biplane. Four ailerons roll it at over 400 degrees a second, its top wing stalls first, and a yank with a boot of rudder snaps it. Short coupled and a little squirrelly on its wheels: keep your feet on the rudder.',
    facts: ['3S', '850 mm', 'Biplane'],
    sizeMm: 850,
    grams: 1529,
    trackClass: 'wing',
    cells: 3,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'pitts-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/pittscraft.js PITTS_DIMS: the furthest
     * reach in plan is the rudder's trailing edge, 0.541 m aft, further
     * than the tips; the lowest drawn point the wheels' and the highest the
     * prop's tip, over the fin and the top wing. */
    dims: {
      arm: 0,
      propR: 0.1397,
      hullR: 0.541,
      vHalfDown: 0.2336,
      vHalfUp: 0.1397,
      bodyLength: 0.787,
      bodyWidth: 0.850,
      bodyHeight: 0.3733,
    },
  },
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
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'f16-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
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
    topSpeed: 29.69,
    name: 'Zagi HP',
    short: 'Zagi',
    blurb: 'A 48 in Zagi HP on 3S, the EPP flying wing that taught a generation to fly on the slope and in combat. Throw it hard, and go easy on the elevons: it rolls fast and it answers the smallest touch in pitch. No rudder. It glides a long way and slides in on its belly.',
    facts: ['3S', '1219 mm', 'Flying wing'],
    sizeMm: 1219,
    grams: 722.9,
    trackClass: 'wing',
    cells: 3,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'zagi-stab',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
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
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'nrj-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
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
     * The Ripmax Wot 4 Mk2 ARTF, docs/WOT4-STAGE1.md: Chris Foss's club
     * sport aerobat, the UK's answer to the Ugly Stik, 2.27 kg on Foss's
     * own electric conversion (an AXI 4120/14 and an APC 13 x 8 on 4S),
     * simId 20 on the fixed wing plant. A flat constant chord wing on top
     * of a slab sided box, strip ailerons, a big rudder, the ARTF manual's
     * throws: it rolls crisply, loops big, mushes wings level when it
     * stalls, spins on the rudder and stops when let go. A taildragger on
     * an aluminium strap; `gear` is the plant's settled pose, which the
     * drawn wheels in src/render/wot4craft.js match: the CG 0.2127 m over
     * the ground and 12.56 degrees nose up.
     */
    id: 'wot41334',
    simId: 20,
    fixedWing: true,
    /* Clean stall, m/s, sqrt(2W / rho S CLmax): tests/wot4-thresholds.json w2_stall. */
    stall: 9.32,
    /* Level speed at full throttle, m/s: tests/wot4-thresholds.json w4_top, derived. */
    topSpeed: 23.59,
    gear: { restHeight: 0.2127, restPitch: 12.56 * Math.PI / 180 },
    name: 'Wot 4',
    short: 'Wot 4',
    blurb: 'A 1334 mm Ripmax Wot 4 Mk2, Chris Foss\'s club sport aerobat, on his electric conversion: 4S and a 13 x 8, one and a half times its weight in thrust. It does everything well and forgives mistakes: crisp rolls, big loops, a stall that mushes wings level, a spin that stops when you let go. A taildragger with a big rudder.',
    facts: ['4S', '1334 mm', 'Sport aerobat'],
    sizeMm: 1334,
    grams: 2268,
    trackClass: 'wing',
    cells: 4,
    packVoltages: [4.2, 3.8, 3.5],
    packLabels: { 4.2: 'Charged', 3.8: 'Half', 3.5: 'Nearly empty' },
    defaultTune: 'wot4-acro',
    gravityBase: 1.0,
    rates: {
      type: 'ACTUAL',
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 7, srate: 67, expo: 0 },
      yaw: { rcRate: 7, srate: 67, expo: 0 },
      throttleCap: 100,
    },
    cameraFov: 100,
    cameraAngle: 5,
    /* The drawn machine, src/render/wot4craft.js WOT4_DIMS: the furthest
     * reach in plan is the rudder's trailing edge, 0.833 m aft, further
     * than the tips' 0.667; the lowest drawn point the wheels' and the
     * highest the fin's top. */
    dims: {
      arm: 0,
      propR: 0.1651,
      hullR: 0.833,
      vHalfDown: 0.23375,
      vHalfUp: 0.258,
      bodyLength: 1.163,
      bodyWidth: 1.334,
      bodyHeight: 0.49175,
    },
  },
];



/*
 * HOW MUCH LARGER THAN LIFE SIZE A MICRO WORLD IS BUILT, as a pure number.
 *
 * The whoop flies the five inch's plant. A five inch cannot fly a 10 by 12 m
 * room, so the room is built bigger, and this is the factor. src/game/track.js
 * re-exports it and carries the argument for why the class works this way at
 * all; what belongs here is the derivation, because it is a fact about these
 * two aircraft and nothing else.
 *
 * IT IS THE RATIO OF THE TWO SWEEP RADII, arm plus hull, which is the measure
 * src/game/collide.js derives CRAFT_R with for both machines and the one the
 * GATE_SCALE argument in src/game/track.js is written in. 0.1735 m of five
 * inch against 0.0506 m of real whoop is 3.4289.
 *
 * That factor is exactly the one that leaves every clearance on a micro track
 * the number of craft widths it already was. A 0.7112 m RaceGOW gate against
 * a 0.1012 m whoop is 7.03 gate widths; built through this it is a 2.4387 m
 * opening against a 0.347 m five inch, which is 7.03. The run off, the
 * ceiling, rule 3's gate spacing and the 14 inch pole gap all carry across
 * the same way, so the seven shipped RaceGOW tracks still read the way their
 * authors drew them.
 *
 * DERIVED AND NOT TYPED, so that it cannot drift from the two blocks it is
 * about. If either aircraft's sweep changes this follows it, which is the
 * only way the clearance identity above stays true.
 */
export const MICRO_SCALE = (() => {
  const five = AIRFRAMES.find((a) => a.id === '5inch').dims;
  const sweep = (d) => d.arm + (d.hullR ?? d.propR);
  return sweep(five) / sweep(WHOOP_TRUE_DIMS);
})();

/*
 * The whoop's collider top is the drawn canopy through the room's factor, and
 * it is typed in the table above because the table is read before this line
 * runs. Typed once and checked once: a change to either end that does not
 * change the other stops the module loading rather than moving a hull 25 mm
 * without a word.
 */
{
  const want = WHOOP_TRUE_DIMS.vHalfUp * MICRO_SCALE;
  const got = AIRFRAMES.find((a) => a.id === 'whoop65').dims.vHalfUp;
  if (Math.abs(got - want) > 0.0001) {
    throw new Error(
      `airframes: whoop65 vHalfUp is ${got.toFixed(4)} and should be `
      + `${want.toFixed(4)}, the drawn canopy times MICRO_SCALE`);
  }
}

export const AIRFRAME_IDS = AIRFRAMES.map((a) => a.id);

export function airframeById(id) {
  return AIRFRAMES.find((a) => a.id === id) ?? AIRFRAMES[0];
}

/* The sim_set_airframe argument for a stored id, falling back to the five
 * inch rather than throwing. A stale setting must not stop the page. */
export function simIdFor(id) {
  return airframeById(id).simId;
}

/*
 * Which track class an airframe flies. 'full' is the 60 by 40 m field the
 * builder has always drawn; 'micro' is a RaceGOW room; 'wing' is a 400 by
 * 300 m airfield. The builder, the world, the gate meshes and the board
 * all read this.
 */
export function trackClassFor(id) {
  return airframeById(id).trackClass;
}
