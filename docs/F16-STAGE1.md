# F-16 Falcon, stage 1: the aircraft, the ducted fan and what it is meant to do

The owner asked for "the Freewing F-16 on a 70 mm electric ducted fan", a
jet whose thrust spools up and down with a real lag, falls with airspeed as
a fan's does, lands fast off a long approach, rolls a long way before it
lifts off its tricycle gear, rolls fast, and sounds like a fan. This file
gives every number the plant is built from with its source and formula,
the new propulsor the plant needed and how it is proven, the gear, the
crash parts, the paint and the sound, and the check table with its bands.
It follows `docs/KADET-STAGE1.md`, the other tricycle on this plant.

## The aircraft

Freewing's F-16 Fighting Falcon V3, item FJ211, is a 1/11.5 scale EPO foam
model of the F-16C. Freewing makes it in 70 mm only: a 64 mm "Super Scale"
F-16 is a different, smaller kit, and there is no 90 mm Freewing F-16, so
the brief's 70 mm is the real one. It comes as the 4S "Standard" (V2) and
the **6S High Performance PNP, FJ21115P**, which is this one: the
2957 2210 kV inrunner in the 70 mm twelve blade fan and an 80 A ESC, on
6S 3500 to 4500 mAh. Freewing: "Maximum flying speed of 165kph", "designed
for stability, strong climbing performance, and short takeoff distance",
"can also maintain a high alpha of 30 degrees", electric retracts and a
nose wheel that steers on the rudder channel, ailerons, all moving
"full-elevator" stabilators and a rudder, no flaps. Motion RC, Freewing's
dealer, sells the 6S version "for skilled intermediate or advanced pilots
with experience flying at least two EDFs".

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 0.878 m | Freewing, over the tip rails |
| Length | 1.306 m | Freewing, pitot tip to tail |
| Wing area S | 0.21484 m² | Model Aviation's review, 333 sq in; the manual's top view, measured, gives 0.2041 m² for the trapezoid and the strakes the rest |
| Mean chord (the plant's chord) | 0.2856 m | the trapezoid's mean aerodynamic chord, 159.5 mm out |
| Wing | 40 deg cropped delta, root 414.5 mm, tip 83 mm, taper 0.201, LE swept 38.9 deg, TE straight | the manual's dimensioned top view at 1.68 mm a pixel |
| Mass m | 2.116 kg | the manual's "1550g (without battery)" and Motion RC's Admiral 6S 4000, 566 g; Freewing's page "2000g (approx)", Model Aviation weighed the V2 at 2.07 kg |
| CG | 90 mm behind the wing's root LE, 0.195 of the mean chord | the manual p. 9, "90mm (3-1/2")"; its drawing puts the mark at 0.37 of the chord, not to its own scale, and the number is taken |
| Thrust | 2,400 g, 23.54 N | the manual; rc-castle's listing of the fan unit, "Around 2450g At 22.2v (70A)" |
| Current | 70 A static | rc-castle |
| Top speed | 165 km/h, 45.8 m/s | the manual; Motion RC "103mph" |
| Throws | high rate aileron, elevator, rudder 34, 34, 35 mm; low 65, 80, 85 percent | the manual p. 11. The surfaces' chords are not published, so the angles are the full size F-16's limits (NASA TP-1538: stabilator 25 deg, flaperons 21.5, rudder 30) |
| Gear | tricycle, track 0.205 m, wheelbase 0.348 m, tyres 60 and 40 mm | the F-16's 2.36 m track and 4.00 m wheelbase (sirviper.com, after Jane's) and its 27.75 and 18 in tyres at 1/11.5; ESTIMATED, Freewing publishes none |
| Inertia | 0.0236, 0.1191, 0.1347 kg m² | NASA TP-1538's full size F-16 over its mass and size, put on the model's mass and size; ESTIMATED |

The wing proper is the full size F-16's (aspect ratio 3.09, NACA 64A204,
Joe Baugher's structure notes), the stabilators and fin the manual's top
view and the F-16's own proportions. `npm run f16:derive` prints every
coefficient below.

## The coefficients

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t | 3.142, 2.644 | DATCOM's Helmbold lift slope for the swept wing (AR 3.09) and the stabilator pair (AR 2.29), section slope 0.9 of 2 pi |
| CLα | 3.310 | a_w and the tail's share through Nelson's downwash 0.647 (DATCOM's gradient gives 0.896 at this aspect ratio, the low end of its fit) |
| Neutral point, static margin | 0.31 c, 0.115 | the full size F-16's: NASA TP-1538, "static margin at low angles of attack is approximately -4 percent" at its 0.35 c reference; the model's CG at 0.195 c. The build up (the tail and Raymer's fuselage term) gives 0.233 and is printed, not taken |
| Cmα, Cmq, Cmδe, CLδe | -0.3814, -2.263, 0.700, -0.476 | -CLα SM; Nelson's 2.2 η V_H a_t l_h/c; η V_H a_t for an all moving tail |
| Cm0 | 0.0470 | level at half stick with the stabilator neutral, the pattern speed |
| Zero lift line | -1.03 deg | the 64A204's -1.2 at no incidence, less the tail's share |
| CD0, k | 0.0336 clean, 0.0466 gear down; 0.1374 | CD0 flies Freewing's 165 km/h on the fan below with the gear up; the gear adds 0.013 (three legs, wheels and doors, 4.6e-3 m² at a C_D of 0.6, ESTIMATED), which the table's cd0 carries and the retracts take away; k 1/(pi 0.75 3.09) |
| CL max, blend | 1.10, 3 deg | under the full size F-16's 1.5 to 1.6 for the model's Reynolds number and fixed leading edge; ESTIMATED |
| Post stall | held 10 deg, falls to 0.8 | the strakes' vortex to Freewing's 30 deg of alpha; ESTIMATED (docs/STALL-STAGE1.md; stall:derive) |
| Stall arms, stall_dw, stall_asym | -0.0552, 0.2052, 0.1442, 0.0035 | stall:derive: the CG 16 mm ahead of the wing's aerodynamic centre, the plate at 0.40 c, 1 mm of build tolerance |
| CYβ, Cnβ, Cnr | -0.470, 0.1420, -0.2241 | the fin (the F-16's 5.09 m² at 1/11.5, 0.0385 m², 0.45 m aft), less the long forebody's -0.0683 (Nelson eq. 2.64) |
| Clβ, Clp, Clδa | -0.1061, -0.3495, 0.1226 | the sweep's effective dihedral and the fin; strip theory; ailerons from 117 to 300 mm out, a fifth of the chord |
| Cnδr, CYδr, Clδr | -0.1094, 0.2134, 0.0292 | the rudder, a fifth of the fin |

## What is new in the plant: the ducted fan

Every propulsor the plant had was a prop: its thrust followed the stick in
the step the stick moved, and fell with the forward airspeed to zero at
the prop's pitch speed. A ducted fan differs in three ways, and the plant
now has each as a general propulsor any airframe can use, in C, in
`plant_wing.c` (`fan_spool`), switched on by `fan_tau` in its table:

1. **The spool.** The fan's speed lags the ESC's command as a critically
   damped second order system, n'' = (target - n)/tau² - 2 n'/tau, which is
   the model NASA fitted to a ducted fan's motor, ESC and rotor step
   responses (Weinstein et al., "Experimental Characterization of an
   Electric Ducted Fan", AIAA SciTech 2024, eq. 9). Their tau was 0.02 to
   0.15 s on a 130 mm fan across its ESC's ramp settings and step sizes
   (their Fig. 10); a rotor's J omega/Q goes with its diameter at the same
   tip speed, so 0.01 to 0.08 s at 69 mm, and a full throttle punch is a
   larger step than any they measured, so the top, **fan_tau 0.08 s**. The
   ESC's **startup ramp**: the ESC manual's Normal startup, "300ms" from
   the first throttle to full, applied whenever the stick opens from
   closed (**esc_start 0.3 s**). With the stick closed the ESC stops
   driving (an electric jet has no idle) and the fan runs down on the same
   law. The fan's speed is the rpm the module reports, so the sound spools
   with it.
2. **The thrust against airspeed.** NASA's same paper fits the fan's
   thrust coefficient linear in the advance ratio (its Table 16, about its
   median J 0.313: C_T 1.248 - 0.9675 (J - 0.313)), zero at J = 1.603. That
   is the plant's prop law on the fan's speed n rather than the stick's,
   T = T0 n² (1 - u/(V_z n)), with the zero thrust speed
   V_z = 1.603 n D = **76.87 m/s** on the 69 mm rotor at 41,703 rpm. So the
   straight line is not new; what makes a fan feel unlike a prop is where
   it sits: at the F-16's cruise and top speed the fan is flying at 0.4 to
   0.6 of its zero thrust speed, so half its static thrust is gone at 40
   m/s (0.48), and what is left of the thrust against the jet's low drag is
   what the pilot has to plan with.
3. **The power.** A prop's power falls as its thrust does (the plant's
   CP_OF_CT, from APC's data); a fan's hardly does ("a small reduction in
   power required at a higher q", the same paper, Fig. 5f), so its current
   is the static current times the speed cubed at any airspeed.

The fan's stators take out the rotor's torque ("the EDF OGVs effectively
zeroed the net torque measured", the same paper), so `torque_arm` is 0 and
there is no P factor.

**Every existing airframe is bit identical.** fan_tau is 0 in every other
table, and then `n` is the duty exactly and no fan state is read or
written. `npm run crash:identity` against origin/main: every gate and self
test's output identical between main's module and this one with crash
physics off (the "on" column's differences are main's own, the same lines
with main's tree). Each gate's S17 holds every other aircraft's recorded
hash.

**The retracts** are the P-51's (docs/P51-STAGE1.md), reused as the lead
asked, not a second system: `gear_time` 4 s (Freewing's electric units
publish no travel time; ESTIMATED), `cd_gear` 0.013 above, and all three
wheels `retract`. G raises and lowers them in the shell, and the drawn
model folds its mains forward and in and its nose leg aft under the
intake (`setGear`). Every gate in the air flies with them up, as a jet
pilot does once clear of the field; the take off, the approach glide and
the landing with them down.

A found bug, fixed on the way: the F-16's first hull box, the pitot to the
nozzle, put its aft lower corner lower than the nozzle, so the hull dragged
on the runway through the rotation and the scale take off ran 237 m
instead of 138. The hull is now 0.42 m fore and aft and 0.06 m under the
CG, which no rotation short of the nozzle's 11.4 deg reaches.

## The intended behaviour, and how each part is proven

`npm run f16:gates`, 24 of 24, flown in Manual:

| Check | Derived | Band | Measured |
| --- | --- | --- | --- |
| S1 level at half stick, the pattern speed | 19.67 m/s | 16.72 to 22.62 | 20.58 |
| S2 stall, power off | 11.98 m/s | 11.26 to 13.61 | 12.33 |
| S3 glide at 1.3 Vs, gear down | L/D 6.21 (7.09 clean) | 5.53 to 6.95 | 6.28 at 15.76 |
| S4 top speed, gear up | 45.83 m/s (Freewing) | 41.25 to 50.41 | 43.24, 156 km/h (the pack sags) |
| S5 best climb | 14.94 m/s at 25.5 | 10.16 to 17.93 | 14.50 at 24.1 |
| S6 30 deg bank let go, 6 s | 17.2 deg | 8 to 26 | 17.8 |
| S7 full aileron at 30 m/s | 515 deg/s (p b/2V 0.132) | 386 to 644 | 460, p b/2V 0.114 (the full size F-16: 0.107) |
| S8 45 deg bank held | V²/(g tan) | within 15 percent, level | 163 m, 2 percent |
| S9 full up held, 60 percent, wings held | 31.5 deg of alpha | 22 to 40, bank 15 | 31.6, bank 2.7; hands off a slow spiral, 31 deg of bank in 12 s |
| S10 phugoid | 9.84 s | 8.15 to 11.52 | 9.86 |
| S11a spool from stopped to 90 percent thrust | 0.562 s | 0.506 to 0.618 | 0.562 |
| S11b from 30 percent turning | 0.343 s | 0.309 to 0.377 | 0.343 |
| S11c full to under 10 percent | 0.189 s | 0.170 to 0.208 | 0.189 |
| S12 thrust against airspeed, full throttle | n²(1 - u/(76.87 n)) | within 0.03 of static | 0.659 at 23.6 m/s, 0.443 at 40.5 (0.694, 0.474 at full speed) |
| S13 chop at 75 percent, height held, to 1.3 Vs | 11.0 s, 261 m | 8.8 to 13.2 s, 208 to 313 m | 11.2 s, 262 m |
| S14 at rest | level, CG 0.140, nose 14.9 percent | | -0.05 deg, 0.1399, 15.0 |
| S15 take off, full throttle, full up past 1.2 Vs | rotates at 16.9 m/s after 17.3 m | 15.6 to 25.7 m, 1.3 to 1.6 Vs | 17.0 m at 16.7 m/s |
| S15b take off at 55 percent (Model Aviation's 50 to 60) | 72.2 m to 1.2 Vs, 308 m to 1.6 | between | 169 m at 18.1 m/s |
| S16 landing from 1.3 Vs, idle over the threshold | touches 14.82 (tail limit) to 16.50 (at 9 deg) | under 17.33 | 15.91 m/s, rolled 115 m |
| S17 other aircraft unmoved, the P-51's two included | main's hashes | identical | identical |
| S18 Node and Chrome | | identical | identical |
| S20 stick closed on the strip | fan stopped | 0 rpm, stands | 0 rpm, stands |
| S21 chop at 75 percent, hands off | 19.57 m/s sinking 2.68 | 2.28 to 3.09 | 2.87 at 20.80 |
| S22 chop at the trim speed | | pitch within 30 deg | 6.8 |

Three things the first run taught, each a finding and not a band moved:

- **S9 is flown with the wings held.** Hands off at 31.5 deg of alpha the
  0.2 deg of build asymmetry grows into a slow spiral, 31 deg of bank in
  12 s, not a wing drop. Freewing's claim is that the jet "can maintain" 30
  deg of alpha, which a pilot does with the ailerons, and the gate holds
  that the ailerons can: bank under 15 deg, no yaw that is a spin. The
  hands off drift is printed.
- **S15's rotation.** A jet's thrust line through a CG 0.14 m over its
  mains holds its nose wheel down: T h is 2.8 N m against the weight's 1.1
  about the mains, so full up only lifts the nose at 17.0 m/s at full
  throttle (f16:derive, rotation) and a pilot who eases in a quarter of the
  stick at 1.2 Vs, as a Kadet's does, runs on to 1.7 Vs. The derived band
  is from where full up rotates it to the roll to 1.6 Vs, and the pilot
  eases in full up past 1.2 Vs and holds 8 deg of pitch. At Model
  Aviation's scale throttle the roll is 169 m: a long jet's roll.
- **S16's touchdown.** A clean jet at idle glides at 8 deg, so it is flown
  down on the throttle as Model Aviation's pilot does and closed over the
  threshold; and its tail limits the flare: the nozzle's skid strikes at
  11.4 deg of pitch on the mains, which is 14.82 m/s level, 1.24 Vs. A jet
  lands fast because of its tail, and the band is that geometry.

`npm run f16:stab`, 56 passed: Stabilised flies level at the pattern speed,
banks to its 60 deg cap and levels in 3 s; Acro rolls at 306 deg/s against
its 300, stops within 5 deg, holds inverted, pitches at 94 deg/s against
120; on the wheels nothing winds up, each mode takes off and the nose wheel
steers. The roll lock is held against half the yaw stick, not full: full
rudder on the F-16's 30 deg sideslips it far enough that the sweep's roll
from it outweighs full aileron, a limit of the airframe and not of the
loop. Stabilised's throttle closed pitch down is taken gear down, as
stab:glide reads the table: 6.63 deg, trim throttle 0.531. `npm run
stab:chop`: sink 3.250 at 19.61 m/s against the derived 3.278. `npm run stall:probe -- --only f16`: stalls, the nose drops 31 deg,
mushes at 31.6 deg of alpha; full back and rudder spins it, and it
recovers in 0.3 s.

## The gear

Each wheel the Cub's model; numbers the drawn model's (`F16_DIMS`).

| Quantity | Value | How |
| --- | --- | --- |
| Mains | x -0.052, y ±0.1025, z -0.116 unloaded, r 0.030 | the F-16's track and wheelbase at 1/11.5, 60 mm tyres |
| Nose | x +0.296, z -0.126 unloaded, r 0.020, steers -0.6 of the rudder | the manual's 65 mm strut; the steering servo on the rudder channel |
| Rest | level, the CG 0.140 m over the runway, 15 percent on the nose | the drawn gear |
| Stiffness, damping | mains 1471 N/m, 47.4 N s/m; nose 517, 27.7 | 6 mm of static deflection (the V3's shock absorbing struts), 0.6 of critical |
| Tail skid | x -0.55, z -0.040 | the ventral fins and nozzle: strikes at 11.4 deg of pitch |
| Hull | hx 0.42, hy 0.439, 0.06 down, 0.07 up | see above |

The retracts fold all three wheels away (above); with the gear up the
skid and the hull are what a belly landing slides on.

## The crash parts

`PARTS_F16878`, 19 parts, EPO with carbon: the panels on the 6 x 500 mm
carbon tube (a 6 x 4 mm tube at 1,000 MPa, 17 N m, ESTIMATED bore) and four
screws; each stabilator on its shaft (a 3 mm steel shaft's plastic hinge,
ESTIMATED); the fin on four screws (4 N m, ESTIMATED); the aft fuselage a
hollow EPO box (54 N m, 50 taken); the fan unit and ESC inside the fuselage
behind the wing, with no prop part (nothing a crash meets reaches the
rotor); the pack under the canopy on hook and loop, the canopy on its
sliding latch, the nose cone on its magnets, which a nose in takes off
first; the retracts, the nose leg the weakest (an owner: "folds in on
even small bumps"). `npm run crash:core`: 242 passed, masses to 2.116 kg,
the CG at the origin.

## The paint

Freewing's "modern three tone gray US Air Force base colors", the F-16C's
FS 595 36118 Gunship Gray (`dark`, the spine, strakes and wing roots),
36270 Medium Gray (`medium`, the outer wing, fin and stabilators) and 36375
Light Ghost Gray (`light`, underneath), and the gold tinted canopy. A
second scheme is Freewing's own Arctic Camo V3 (FJ21125P).

## The sound

`src/render/audio.js`, voice `edf`. A fan's whine is its blade pass:
twelve blades at 41,700 rpm pass 8.3 kHz. The wave is one revolution long,
so its fundamental is the shaft rate the plant reports, and its twelfth
harmonic is the blade pass, with the pass's octave and the shaft rate's
first harmonics faint under it and a sideband each side from the rotor's
imbalance; shaped from the published character of ducted rotor noise, no
recording used. The props' 1 kHz lowpass cap would remove the whine, so
this voice carries its own cap (10 kHz) and a gain 9.5 dB under a prop's so
a tone that high is not a hurt. The fan spools in the plant, so the whine
rises and falls a beat behind the stick. `node scripts/audio-probe.js
--voice=edf --trace=steady:35000` renders it: the blade pass at 7.0 kHz is
the loudest tone, 60 dB over its neighbourhood, and the whole voice is 9.3
dB under the prop's (`--voice=wing --trace=steady:14000`). That puts the
fan's tone inside the 2 to 8 kHz band the probe's A1 line guards for the
props (A1 margin -16.8 dB where the props keep 12 over): a whine is the
tone in that band, so the fan cannot meet a rule written to keep a prop's
buzz out of it. That is the owner's call, and his ear is the check.

## In the shell

`f16878`, simId 16 (ids 13 to 23 are the classic aircraft's slots;
SIM_AIRFRAME_COUNT is 24 and an empty slot's mass of 0 is refused), in the
Free Flight card's planes, the carousel, the hangar with two power options
(stock 6S, and Freewing's 4S Standard derived from its published 78 mph on
the same fan: 0.767 of the fan's speed, 13.84 N, 47 A inside its 60 A ESC)
and two 6S packs, Tuning with Freewing's own low rates, three presets
(f16-acro the default). The hangar's top speed and flight time are flown
gear down (power-check's cruise), 40 m/s and 19 min. Progression: level
10, the last, after the P-51 at 7, the Extra 300 at 8 and the Edge 540 at 9: the fastest
aircraft here, the hottest landing, a fan whose thrust has to be planned
ahead of the stick, and the only kit whose maker asks for "experience
flying at least two EDFs", where FMS rate the P-51 intermediate. `npm run f16:shell` on swiss2 and the airfield: module 16
and the drawn model, the fan's voice, parked at 0.140 m; with the sticks
centred it runs to 31 m/s before the thrust line lets the nose up, which is
why a jet pilot rotates it. Its swiss2 half failed once on "parked on
its gear" (the shell's `landed` flag read before it settled, the CG
0.1398 m up) and passed on the rerun; the Kadet's own swiss2 half fails
on main's tree too, so the flow's timing there is a finding for the lead.

## What the owner should feel flying it

On the runway it stands level and silent: the fan stops with the stick
closed. Open the throttle and for a moment nothing happens, then the
whine rises and it goes. Hold full up past about 15 m/s and it rotates at
17 and leaves in 17 m at full power; at half power it rolls well over 100
m. In the air it is fast and slippery: level at half stick at 20 m/s, 44
m/s flat out, rolling faster than anything else here (about 460 deg/s at
30 m/s on high rates). Chop the throttle and it keeps going: from cruise it
takes 11 s and 260 m to slow to the approach speed. Snap the throttle open
at the bottom of an approach and the thrust comes a third of a second
late, and less of it at speed. Land it long and flat on a little power,
closing it over the threshold: it touches at about 16 m/s and rolls over
100 m.

## Sources

- Freewing, F-16 Falcon V3 6S High Performance PNP, FJ21115P: https://www.freewing-model.com/freewing-f-16-falcon-v3-6s-high-performance-70mm-edf-jet-pnp-fj21115p.html
- Freewing, F-16 Fighting Falcon V3 user manual, FJ211-V02: https://www.freewing-model.com/download/freewing-70mm-f-16-v3-70mm-manual.pdf (span, length, weight, thrust, speed, CG, throws and low rates, the dimensioned top view)
- Freewing, the V3's ESC manual (startup 300 ms, cutoff 2.85, 3.15, 3.3 V): https://www.freewing-model.com/download/esc-manual-for-freewing-f-16-falcon-v3-6s-high-performance-70mm-edf-jet.pdf
- Freewing, F-16 V2 4S Standard (2849 2850 kV, 60 A, 1800 g, 78 mph): https://freewing-model.com/freewing-f-16-v2-4s-standard-70mm-edf-jet-pnp-rc-airplane.html
- Motion RC, the same jet and its Arctic Camo (FJ21125P), and the Admiral packs (6S 4000 566 g, 6S 4500 652 g, 4S 4000 386 g): https://motionrc.com/products/freewing-f-16-falcon-v3-6s-high-performance-70mm-edf-jet-pnp-fj21115p
- rc-castle, the Freewing 70 mm twelve blade 2210 kV fan unit (69 mm rotor, 2,450 g at 70 A): https://www.rc-castle.com/index.php?route=product/product&product_id=7558
- Model Aviation, Freewing F-16 V2 6S Pro review (333 sq in, 71 oz, 4 min, "takeoff throttle settings of 50% to 60%"): https://www.modelaviation.com/freewing-f-16
- Weinstein et al., "Experimental Characterization of an Electric Ducted Fan", AIAA SciTech 2024, NASA NTRS 20230017299: https://ntrs.nasa.gov/api/citations/20230017299/downloads/Weinstein_SciTech2024_Final.pdf
- Nguyen et al., NASA TP-1538, 1979, the full size F-16's mass, geometry, surface limits and static margin: https://ntrs.nasa.gov/api/citations/19800005879/downloads/19800005879.pdf
- sirviper.com, F-16 dimensions after Jane's (aspect ratio 3.09, tailplane span 5.58 m, track 2.36 m, wheelbase 4.00 m): https://sirviper.com/index.php?page=fighters%2Ff-16%2Findex
- Joe Baugher, F-16 structure (40 deg cropped delta, NACA 64A204): https://www.joebaugher.com/usaf_fighters/f16_5.html
- Nelson, Flight Stability and Automatic Control; USAF DATCOM; Raymer, Aircraft Design.
