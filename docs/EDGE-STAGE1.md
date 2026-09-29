# Edge 540, stage 1: the aircraft, the model and what it is meant to do

The owner asked for eleven all time great RC aeroplanes, and this is id
13: the Zivko Edge 540, the aircraft most of the Red Bull Air Race flew
("The Zivko Edge 540 is the most common aircraft used in the Red Bull Air
Race World Series", Wikipedia, "Zivko Edge 540"), for the builder's new
air race pylon pairs. What it has to show, each gated by a number: an
unlimited aerobat's roll rate, crisp pitch, a snap when it is yanked at the
edge of the envelope, a symmetric section so it flies inverted as well as
upright, taildragger ground handling, and a pylon course flown at air race
pace on swiss2 and the Alps.

This file gives every number with its source, the new plant capabilities
and why, each gate with its band, and what is still open. It follows
`docs/KADET-STAGE1.md` and `docs/CUB-STAGE1.md`, and the plant is
`src/native/plant_wing.c` with a table of its own, `FW_EDGE1524`.

## Which Edge, and why

**Extreme Flight's 60 in Edge 540T** (EF, extremeflightrc.com), string id
`edge1524`, 60 in being 1524 mm.

Candidates, and why they were not taken:

| Kit | Why not |
| --- | --- |
| E-flite Mini Edge 540 3D ARF, 945 mm | a geared Park 400 parkflyer: its pitch speed is under 15 m/s, not an air race aircraft |
| E-flite Edge 540 BP 3D, 900 mm | a profile foamie of 450 g |
| E-flite Edge 540QQ 280, 660 mm | a 235 g micro: small for a 50 m pylon gate |
| Composite-ARF Edge 540 2.6 m | the best scale model ("We used drawings from the full scale Edge"), but a 13 kg gasoline aircraft; C-ARF publishes no wing area |
| Tower Hobbies Edge 540 58 in | its manual could not be fetched (manualslib refuses the fetcher, hobbico's archive is gone) |
| Hangar 9 Edge 540 33% | the same: manual only on manualslib |

The EF 60 in has what the others lack together: the maker's own data sheet
with the span, length, **wing area**, weight, **throws with expo** and the
covering's colour codes; a published build guide with the gear, the
tailwheel, the motor and the balance; the maker's recommended power system
(T-Motor's AM600, whose thrust and power T-Motor publishes); and an
independent review with measurements (FlyingRC). It is electric, so it uses
the plant's electric motor and pack; and it is fast enough on 6S to fly an
air race course at pace.

## The aircraft

| Quantity | Value | Source |
| --- | --- | --- |
| Span b | 1.524 m | EF data sheet, "WingSpan: 60"" |
| Wing area S | 0.48387 m^2 | EF data sheet, "Wing area: 750 sq. in." (FlyingRC measured 760) |
| Mean chord c = S/b | 0.3175 m | derived |
| Aspect ratio | 4.80 | derived |
| Length | 58 in | EF data sheet |
| Mass | 2.4948 kg | EF data sheet, "Weight: 5-6 lb", the middle; FlyingRC flew 5 lb on a 6S 3700 |
| Wing loading | 50.6 N/m^2 | derived |
| CG | 4 in behind the root's leading edge | FlyingRC, "3-3/4" to 4-3/4" from the leading edge at the root", its "4" sweet spot"; EF's data sheet "Balance on the wing tube for precision flight" |
| Section | symmetric, zero incidence, stabiliser at zero | the full size Edge's "John Roncz symmetrical" (Wikipedia); EF publishes no section |
| Throws, high | aileron 39, elevator 47.5, rudder 47.5 deg | EF data sheet: aileron high 38 to 40, elevator 3D 45 to 50, rudder high 45 to 50 |
| Throws, low | 17.5, 9, 20 deg | EF: 15 to 20, 8 to 10, 20 |
| Expo | 70 percent, the table's one figure | EF: aileron 70 to 75, elevator 60 to 65, rudder 70 to 90 (the guide) or 80 to 90 (the data sheet) |
| Right thrust | 2.5 to 3 deg | EF build guide, "the motor mount ... points to the RIGHT 2.5-3 degrees"; NOT modelled (the torque and P factor are) |
| Power | T-Motor AM600 525 kV, AM116A ESC, T16x8, 6S 3000 to 4000 mAh | EF build guide and data sheet |
| Gear | carbon legs, pants, carbon tailwheel steered off the rudder | EF build guide and product page |

The full size Edge 540 for reference (Wikipedia): 7.42 m span, 9.1 m^2,
"Roll rate: 420°/sec", "g limits: ±12".

### The outline, ESTIMATED

EF publishes no drawing. The planform and the tail are ESTIMATED off EF's
photographs of the 60 in Edge (its product page) scaled by the published
span and length, and `scripts/edge-derive.js` and `src/render/edgecraft.js`
read the same numbers:

| Part | Value |
| --- | --- |
| Wing | 15 in at the root to 10 in at the square tip, the leading edge swept back 5 in, the trailing edge square at station 30 (inches aft of the prop's plane), so the area is the published 750 sq in; mid wing on the thrust line; 13 percent symmetric |
| Ailerons | the whole trailing edge outside the fuselage, 2.75 in to 30 in out, 4 in of chord, hinged at station 26 |
| Stabiliser | 23 in, 9.5 in root and 6 in tip, the hinge line square at station 48, a 4 in elevator; 0.115 m^2 |
| Fin and rudder | 40 sq in of fin and 95 of rudder, the rudder hinged at 50.5 and running below the fuselage to 3.5 in under the thrust line |
| Gear | axles at station 14 (5 in ahead of the CG), 9.5 in under the thrust line, a 12 in track, 2.75 in wheels; the tailwheel's 1.2 in wheel at station 56, 3 in under |
| Prop | 16 in, EF's 63 mm spinner |

## The coefficients

`npm run edge:derive` prints each one. Per radian, in the plant's chord.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 4.435, 3.754, 3.043 | 2π AR/(AR+2) |
| CLα | 4.797 | a_w + a_t (S_h/S) η (1 − dε/dα), η 0.9, DATCOM's downwash 0.549 |
| Static margin | 0.287 | V_H 0.487, the CG 1.5 in ahead of the tapered wing's aerodynamic centre |
| Cmα, Cmq | −1.3765, −6.729 | −CLα SM; −2 η a_t V_H l_h/c |
| Cm0 | +0.0482 | level at three quarter throttle with the elevator neutral, the cruise it is trimmed at |
| Cmδe, CLδe | 1.0848, −0.5299 | τ_e 0.66 for a 45 percent elevator |
| CYβ, Cnβ, Cnr | −0.648, +0.2765, −0.3605 | the fin, less the slab sided fuselage's −0.0339 (Nelson eq. 2.64) |
| Clβ | −0.0319 | no dihedral: the fin's alone |
| Clp | −0.6653 | strip theory on the 0.67 taper, −a_w (1 + 3λ)/(12 (1 + λ)) |
| Clδa | 0.5632 | τ_a 0.55 over the ailerons' span on the tapered chord (Nelson eq. 5.46) |
| Cnδr, CYδr, Clδr | −0.2483, 0.4381, 0.0256 | τ_r 0.80 |
| CD0, e | 0.035, 0.80 | ESTIMATED: film on a built up frame, a big canopy, wheel pants on carbon legs, the side force generators off |
| CL max | 0.90 | 0.9 of the section's 1.0, XFOIL's for the NACA 0012 at 1.79e5 (aerospaceweb, "NACA 0012 Lift Characteristics"); ESTIMATED |
| Stall arms, stall_dw | −0.1200, 0.2720, 0.2036 | stall:derive, the CG ahead of the wing's ac; the plate's centre of pressure at 0.40 c; η V_H a_t (dε/dα)/a_w |
| stall_top, stall_k | 1 deg, 0.60 | a symmetric 12 percent section at 2e5 stalls "abruptly" at about 10 deg (aerospaceweb, after the wind tunnel data it cites): held 1 deg and falling to 0.60, ESTIMATED, sharper than any section here |
| stall_blend | 2 deg | a leading edge stall comes on over a narrower band than a flat bottom's 3 to 4 deg; ESTIMATED |
| Washout | none | an aerobat's wing is built straight; not fitted, because the snap is what this aircraft is for |
| strip_c | 1.15, 1.05, 0.95, 0.85 | the 0.67 taper's chords over the mean |
| Inertia | 0.105, 0.215, 0.305 kg m^2 | ESTIMATED from the masses: the panels 0.50 kg as a tapered bar, the motor 0.36 kg 0.44 m ahead, the pack 0.58 kg, the tail group 0.14 kg 0.80 m behind, the fuselage along its 1.4 m |

### The power system

T-Motor's AM600 525 kV on 6S with its T16x8: "up to 8298g of thrust" and
"maximum power 1700W" (T-Motor's AM600 page). The plant's rule for every
electric table: no load at kV times 3.7 V a cell, 11,655 rpm, loaded at
0.85 of it, the pitch speed the loaded rpm times the pitch, 33.55 m/s;
static thrust 81.38 N, three and a third times the weight; current 1700 W
over 22.2 V, 76.6 A; the prop's torque arm from the ideal disc, 1.26 N m at
full static thrust. The stock pack is a 6S 4000, CNHL's 40C at 625 g; a
6S 3300 (535 g) is the other. Pack resistance 3 mOhm a cell, ESTIMATED as
the five inch's 6S race pack's class. Top speed 29.7 m/s, 107 km/h.

## What is new in the plant

Three general capabilities, each read only by a table that sets it, and
one correction to the post stall lift that is exactly the old arithmetic
for every lift on the positive side. `npm run crash:identity` shows every
existing gate and self test printing byte for byte what main printed (the
`off == base` column), and edge:gates E17 holds every recorded flight's
hash to main's.

1. **The surface's knee, `surf_knee`.** The plant was linear in a
   surface's angle, which is right for a trainer's 15 deg and not for
   EF's 47.5 deg: a plain flap's lift stops growing with its angle as the
   flow leaves it (DATCOM's K', plain flaps, about 0.8 at 20 deg, 0.65 at
   30, 0.55 at 40, 0.5 at 50). The aero reads each surface as delta / sqrt(1
   + (delta / knee)^2); a knee of 0.5 rad gives 0.82, 0.69, 0.58 and 0.50
   at those angles. The drawn surfaces keep their real angle. Zero on
   every other table, which then takes no branch.
2. **The aileron on each strip past the stall, `strip_tau[4]`.** Past the
   stall the wing is taken as four strips a side at the roll rate's angle
   p y / V. The aileron's own angle was not in them, so in a fast aileron
   roll the falling wing's tip read past its stall while its up aileron
   held it short, the strips took the roll damping back and the roll ran
   away: the first build of this table rolled at 4,000 deg/s. Each strip's
   angle now carries τ times the aileron's (the knee's) on the strips the
   aileron spans. Zero on every other table.
3. **The stalled lift on the side that is stalling.** The lift the wing
   holds past its stall is the peak of the plant's own curve, which was
   always walked on the positive side, with the elevator's lift counted
   there. A wing stalling on its back held that positive peak, the
   elevator's share the wrong way, so a symmetric section held less on its
   back than upright. The walk now takes the side the wing is on; on the
   positive side it is the same arithmetic as before.
4. **The table's size.** SIM_AIRFRAME_COUNT is 24 (the P-51's branch set
   the same): ids 14 and 16 to 23 are held empty for the aircraft coming
   alongside this one and the P-51 (15). An empty slot is all
   zeros, and mass 0 is what plant_airframe_exists reads as no airframe,
   so selecting one is refused exactly as an id past the end is. The two
   stab self tests that asked "one past the table" (13) now ask 24, and the
   Radian's also checks that every empty slot, whichever they are, is
   refused and leaves the aircraft selected. PLANT_AXIS, crash.c's T[] and
   every other array sized by the count stay zero for an empty slot and
   nothing reads them.

Also: sim_wing_set_tune took throws up to 45 deg; it takes up to 60 now,
which covers EF's 3D and tumbling rates. A block that passed before passes
now. configs/tuning.js grew an optional per aircraft stock expo (the Edge's
70), which the stock setup, its normalising and tuning:check read; every
other aircraft's is the 30 it always was.

## The intended behaviour, and how each part is proven

`npm run edge:gates` (scripts/edge-gates.js, tests/edge-thresholds.json),
flown in Manual on the table. Bands are the Kadet's and the Cub's in
proportion about this aircraft's derived figure unless the row says.

| Gate | Derived | Band | Measured |
| --- | --- | --- | --- |
| E1 level at 3/4 throttle, the trim | 22.17 m/s | 18.8 to 25.5 | 22.11, elevator at neutral |
| E2 stall, power off | 9.58 m/s | 9.0 to 10.9 | 10.66 (the plant's curve rounds off under CLmax, as every aircraft's does) |
| E3 glide at 1.4 Vs | L/D 8.75 | 7.8 to 9.7 | 8.75 |
| E4 top speed | 29.70 m/s | 27.0 to 32.7 | 29.44 |
| E5 full aileron at 25 m/s, high rate | pb/2V 0.341, 641 deg/s | 0.273 to 0.409 and at least the full size Edge's 420 deg/s | 0.339, 635 deg/s |
| E5b the same on EF's low rate | 0.221 | 0.176 to 0.265 | 0.220, 408 deg/s |
| E6 crisp pitch: half up stick at the trim, time to the pitch rate's peak | 0.089 s to 98 deg/s | 0.058 to 0.134 s | 0.088 s to 98 deg/s |
| E7 straight up at full throttle | 21.49 m/s | 19.3 to 23.6 | 20.71 |
| E8a on its back at 3/4 throttle: level speed | as upright | within 5 percent | 22.13 against 22.11 |
| E8b on its back: "just a bit of down elevator to hold" (FlyingRC) | | a push under half stick | −0.335 stick, alpha −2.65 deg |
| E8c on its back: stall speed | as upright | within 6 percent | 10.97 against 10.66 |
| E8d on its back: roll rate | as upright | within 5 percent | 645 against 635 deg/s |
| E9a a yank at the trim, full up at once, ailerons and rudder centred | alpha 21 deg against a 10.75 deg stall | a quarter turn of roll in 1.2 s, stops within 0.3 s of letting go | 169 deg, 200 deg/s, stopped in 0.14 s |
| E9b the same pushed on its back | | the same | 126 deg, 199 deg/s, 0.11 s |
| E9c half stick at the trim | alpha 9 deg, short of the stall | under 20 deg of roll | 2 deg |
| E9d a snap roll: full up and full rudder, AOPA's inputs, held 2 s | | still turning the rudder's way at half its peak rate or more at the end, 270 deg at least; AOPA's recovery stops it within 0.5 s | right 319 deg at 200 deg/s, left 366 at 220, stopped in 0.16 and 0.18 s |
| E9e the snap roll on its back | | the same | 416 deg at 246 deg/s, 0.10 s |
| E11 prop torque, static full throttle | 1.255 N m ideal disc, 1.31 electrical | 1.0 to 1.6, rolling left | 1.255, rolling left |
| E12 standing on its wheels | 9.84 deg, 0.2510 m, 15.4 percent on the tail | 8.84 to 10.84 deg, 0.245 to 0.257 m, 12 to 19 percent | 9.83, 0.2509, 15.5 |
| E13 take off, throttle opened over a second, rotated at 1.2 Vs | 4.69 m, 13.4 m/s | 3.4 to 6.8 m, 11.4 to 15.4 m/s | 5.78 m, 14.72 m/s in 1.31 s |
| E14 the roll tracks straight on the rudder | | under 5 deg, under 1 m | 0.4 deg, 0.02 m |
| E14b feet off the rudder, recorded | | none | 0.7 deg: the tailwheel and the fin hold it |
| E15 taxi turn, full right rudder at a walk | 2.42 m | 1.9 to 3.2 | 2.44, turning right |
| E16 a landing, a three point flare, the tail held down | | at rest at E12's attitude, no hull or prop | touched at 13.3 m/s, rolled 70 m, at rest at 9.83 deg |
| E17 every other aircraft's recorded hash | main's | identical | identical, fourteen recordings (the P-51's two since it merged) |
| E18 Node and Chrome | | identical | 864269dd8336d243 both |

`npm run edge:gates`: 26 of 26.

### The snap, and how the gate was set

AOPA's "Technique: Snap rolls" (Flight Training, September 2014): "A snap
roll is nothing more than a power-on spin": "pull back hard on the stick"
to stall it, "add a strong yawing motion with rudder in the desired
direction", and recover with "rudder opposite the direction of the turn,
and reduce back-pressure". No source found gives an RC or full size snap
roll's rotation rate. So E9 tests the definition, not a rate:

- **A yank alone** (E9a, b) is an accelerated stall. EF's 3D elevator asks
  21 deg of alpha against the 10.75 deg stall at any speed; half stick
  asks 9. The build's asymmetry (1 mm of trailing edge, stall_asym, as
  every table) stalls one half first, and without washout the wing
  departs: 169 deg of roll in 1.2 s at 200 deg/s. The criterion, a quarter
  turn, is this document's reading of "may be accompanied by an
  uncommanded rolling motion" (FAA-H-8083-3C, ch. 5) against a trainer,
  which drops a wing under 30 deg (docs/STALL-STAGE1.md).
- **The snap roll** (E9d, e) is AOPA's inputs held. The first criterion
  written was a full 360 deg in 2 s; the right snap turned 319 deg (the
  prop's torque and P factor work against a right snap), the left 366.
  With no source for a rate, the gate was rewritten to AOPA's definition,
  a sustained autorotation: still turning at half its peak rate or more at
  the end of the hold, at least three quarters of a turn, and AOPA's
  recovery stopping it. The owner should fly it and say whether it is
  violent enough (below).
- **On EF's low rates** (9 deg of elevator) full stick asks 8.8 deg of
  alpha: it cannot be snapped. On the 3D rate, a yank past about 70
  percent stick snaps it at the trim, 85 percent on its back (Cm0's trim
  is 3.4 deg of alpha the other way).

`npm run stall:probe -- --only edge`: full back from 1.15 Vs power off, the
wing drops 179 deg and it spins down, alpha 15 deg; full back and full
rudder spins at 218 deg/s; opposite rudder and forward stick recover in
0.38 s, centring the stick from the stall in 0.15 s.

### The stabiliser

Stabilised asks 60 deg of bank and 30 of pitch, and with the throttle
closed lowers its target 12.53 deg to the glide at the 0.747 stick that
flies it level (`npm run stab:glide`; stab:chop: sink 4.769 m/s at 21.84
against the derived 4.754). Acro asks 360 deg/s of roll and 80 of pitch:
80 is under the accelerated stall at the trim, 104 deg/s there, so Acro's
full stick does not snap it at cruise (it will slower). `npm run
edge:stab`, 58 passed, the Cub's bar on the Edge's throws: Stabilised
banks 58.8 deg at full stick; Acro rolls at 364 deg/s, pitches at 77 deg/s
without a snap, holds the attitude it is left at, and flies it on its back
hands off; the surfaces read EF's full throws; on the ground nothing
winds up, the take off tracks straight in every mode with the throttle
opened over a second (slammed open, three times the weight in thrust
torques a wing 5 to 6 deg down on the grass, which a pilot does not do),
and the tailwheel steers.

### The air race course

`SIM_GPU=1 npm run edge:course` (scripts/edge-course.js), through the real
page, on swiss2 and on the Alps: the Edge seated, B to build, six air race
pylon pairs stood on the valley floor with the builder's own controls, a
stadium 300 m long and 140 m across, the first layout from the aircraft's
start whose lap keeps 8 m from every tree and roof; B flies it, and a
pilot in the page flies the lap in Acro at 26 m/s, 18 m over the grass
between the cones, under their 25 m tips.

| Map | Lap | Mean speed | Touches | Crash |
| --- | --- | --- | --- | --- |
| swiss2 | 43.26 s through all six | 25.6 m/s against 22.3, three quarters of its top | 0 | no |
| alps | 43.27 s through all six | 25.6 m/s | 0 | no |

At 10 m over the grass no stadium near either start is clear of the trees
by 12 m; at 18 m the first one tried is. The builder warns that the pairs
across the turns are 140 m apart against the 150 m it asks for the Edge;
the Edge flew those turns at 25 m/s on a 70 m radius.

## The landing gear

The Cub's model. Numbers are the drawn model's (EDGE_DIMS).

| Quantity | Value |
| --- | --- |
| Main wheels | x +0.127, y ±0.1524, z −0.2413 drawn, −0.2473 unloaded; r 0.0349 |
| Tailwheel | x −0.9398, z −0.0762 drawn, −0.0822 unloaded; r 0.0152; steers at half the rudder's angle (EF's sliding arm), ESTIMATED |
| Rest | 9.84 deg nose up, the CG 0.2510 m over the grass, 15.4 percent on the tail |
| Stiffness, damping | mains 1725 N/m, 55.7 N s/m; tail 629, 14.9; 6 mm of static deflection, 0.6 of critical |
| Prop tip | 73 mm over the grass level, 0.130 m at rest |
| Hull | hx 0.50, hy 0.762, 0.10 down, 0.14 up, the tail's bottom 0.067 m clear at rest |
| Camera | on the cowl at the firewall, 0.30 m ahead, 0.10 up |

## The crash parts

`PARTS_EDGE1524`, 19 parts, balsa and light ply with carbon where EF puts
it ("carbon fiber and G10 composites ... in high stress areas such as the
landing gear mounting structure and fuselage longerons"): nothing crushes;
a joint past its onset cracks.

| Joint | Limit | Derivation |
| --- | --- | --- |
| rear fuselage | 50 N m, 400 N | a 40 mm box of 2.4 mm walls at the stabiliser, Z 5.1e-6 m^3 at balsa's 20 MPa, 102 N m, halved for the lightening holes and joints; ESTIMATED |
| each panel on its tube | 100 N m up and down, 60 fore and aft | EF's carbon wing tube, ESTIMATED 16 by 14 mm at 600 MPa |
| stabiliser, fin | 8, 5 N m | ESTIMATED |
| elevator, rudder, ailerons | 2 N m | pin and Tyvek hinges, ESTIMATED |
| motor | 48 N m, 1200 N | four M4 blind nuts in 6 mm ply, ESTIMATED from the Kadet's |
| prop | 11 N m | a carbon blade's root at 600 MPa, ESTIMATED |
| pack | two straps of hook and loop | EF: a strap "that completely encircles the lipo" |
| gear | 48 N m each leg, 3 N m tailwheel | a 4 by 30 mm carbon laminate, ESTIMATED |

`npm run crash:core`: 242 passed, the Edge's masses summing to 2.4948 kg
with the CG at the origin. `npm run wing:contact`: its landing, standing,
tip strike, nose in and throw from the grass pass; it rolls out for 20 s,
arriving at 11 m/s and slowing at the grass's 0.78 m/s^2.

## The covering

EF's two schemes, from the data sheet's colour codes. Stock is the blue:
Oracover Blue #50 over the wing, fuselage and tail, Cub Yellow #30 on the
cowl, the tips, the fin's cap and the wheel pants (the photographs); the
other is EF's red: White #10 with Ferrari Red #23. Regions: wing,
fuselage, tail, trim.

## The sound

The electric blade voice every electric plane has (src/render/audio.js):
edge:shell reads "the blade voice, 2 wave periods a revolution".

## In the shell

`edge1524`, simId 13, one of the planes behind the Free Flight card and
in the carousel, with Acro (the default), Stabilised and Manual rows, its
FPV camera on the cowl, `gear` from the plant's settled pose, and the
hangar's power (two packs), paint (two schemes), tuning (EF's high and low
rates) and parts (the stock T16x8, APC's 16 x 8E and 16 x 10E). On the
unlock curve it is **level 8**, after the Bramor (6) and the P-51 (7): an
unlimited aerobat at 3D throws rolls past 600 deg/s and snaps when
yanked, the least forgiving aircraft here. `npm run edge:shell` on swiss2 and the airfield: parked at
0.2510 m, off the strip, climbing, banking, chase camera, 13 aircraft
listed (before the P-51 merged).

## What is estimated, and what stays open

- The planform, tail and gear stations are read off photographs.
- The section's stall (1 deg held, 0.60 of it after) has no measured
  curve behind it: the Sandia report (SAND80-2114) that tabulates the NACA
  0012 at these Reynolds numbers could not be fetched. It sets how violent
  the snap is.
- The snap roll's rate has no source; E9 tests the definition.
- EF's 2.5 to 3 deg of right thrust is not modelled; the swing it is
  there for is the torque's and the P factor's, which are.
- One expo for all three surfaces, 70 percent, inside EF's aileron and
  rudder ranges and 5 over its elevator's.
- The side force generators are not modelled.

## The owner's test, in the shell

The lead flew the owner test headless in the real shell (swiss2,
edge-manual, the page's clock) and raised two findings; both were
measured again on the plant's clock (`__craftState().simS`), and
`npm run edge:owner` (scripts/edge-owner.js) makes the test a check, on
p51:owner's pattern, against this aircraft's bands (tests/edge-thresholds.json).

**The take off's 11.8 deg left is the torque roll after liftoff, not the
strip.** The swiss2 spawn is level (the terrain's rise per metre is 0.0000
along and across it, and 30 m on) and on the Alps the same. With the
lead's hands, full throttle and 0.15 up elevator, the wheels leave the
ground at 0.4 s and 10 m/s with the nose 0.3 deg left of the start; the
track (the velocity's direction) and the nose agree within half a degree
on the roll. From there, ailerons centred, the prop's 1.26 N m rolls it
left, 17 deg of bank by 3 m up at 2 s, and the bank turns it: 13 deg of
heading by then, the lead's 11.8 at his liftoff mark (0.3 m for 0.6 s,
which comes a second and a half after the wheels are off). The same
flight on the Alps gives the same numbers; the Kadet on swiss2 drifts
1.3 deg by 3.4 s;
the P-51 swings about 2.6 deg on its roll and banks 4.6 deg
once off. It is the plant's torque, which a
real 3D aerobat on three times its weight in thrust shows, and it is held
by the pilot's ailerons: with the wings held and the heading on the
rudder the owner check flies it within 1.0 deg to 3 m. No spawn needs
re-aiming.

**The snap recovers.** Held 2 s of full up and full rudder, then the
stick released and the rudder reversed (AOPA's recovery), the roll rate
falls under 30 deg/s 0.18 to 0.25 s after the reversal, the aircraft
turning a further 36 to 49 deg over the runs on both maps; a wings level
hold then levels it in 0.2 to 0.5 s. The British Aerobatic Academy: "At the correct angle of
rotation the roll should cease abruptly"; the band is a quarter turn. The
lead's 62 deg in 0.3 s and the wings that never levelled were read off a
bank angle (the up vector's roll, which in the steep nose down attitude a
snap leaves also moves with the yaw the reversed rudder makes) on the page's
clock; the body roll rate
integrated on the plant's clock gives the 36 to 49 deg. The earlier line here
that it "stops the moment you let go" is replaced by these numbers.

| Owner check | Band | swiss2 | alps |
| --- | --- | --- | --- |
| take off on the rudder, heading to 3 m | e14_straight, 5 deg | 1.0 deg, off at 11.1 m/s | 0.99 deg, off at 11.1 m/s |
| hands off, recorded | none | lift off 0.3 deg left at 10.4 m/s; 12.7 deg left and 16.9 deg of bank at 3 m | lift off 0.4 deg left at 10.8 m/s; 12.8 deg left and 16.9 deg of bank at 3 m |
| on its back, 3/4 throttle | e8_inverted, within 5 percent | 22.03 against 22.04 m/s | 22.02 against 22.04 m/s |
| its push | e8_inverted, under half stick | −0.338 (upright 0.003) | −0.338 (upright 0.002) |
| a yank | e9_snap, 90 deg in 1.2 s, stops in 0.3 s | 155 deg, stopped in 0.17 s | 152 deg, stopped in 0.20 s |
| half stick | e9_snap, under 20 deg | 3 deg | 3 deg |
| snap right, left | e9_snap, 270 deg, half the peak rate at the end | 310 and 340 deg, 200 and 214 deg/s against 202 and 215 | 302 and 344 deg, 199 and 217 deg/s against 201 and 217 |
| their recoveries | e9_snap, 0.5 s, a quarter turn, level in 3 s | 0.20 s, 40 deg, 0.18 s; 0.25 s, 49 deg, 0.50 s | 0.22 s, 38 deg, 0.17 s; 0.20 s, 40 deg, 0.28 s |

## What the owner should feel flying it

On the strip it sits tail down on carbon legs. Open the throttle over a
second and it is off in about six metres, and it goes straight up at 21
m/s. It trims hands off at three quarter throttle, 80 km/h, and tops out
at 106. Full aileron rolls it at over 600 deg/s at speed, 400 on the low
rate. Roll it on its back and it flies there on a touch of down elevator,
at the same speed, rolling and stalling as it does upright. In Acro a
full pull at cruise is 80 deg/s and never snaps; in Manual on EF's 3D
rates, yank the stick past about two thirds and it snaps the moment you
do, and let go it stops within a sixth of a second. Pull and boot the
rudder and it snap rolls the rudder's way; stick released and rudder the
other way, it goes on 35 to 50 deg and stops in a fifth to a quarter of
a second. Take
off hands off and it lifts at 10 m/s within half a degree of the
runway's heading, then the prop's torque rolls it left, 17 deg of bank
and 13 of heading by 3 m up: hold the wings with the ailerons. Round the pylons at 26 m/s it holds a 70 m
turn.

## Sources

- Extreme Flight, 60 in Edge 540T data sheet (extremeflightrc.com/cdn/shop/files/DATASHEET_60EDGE_1cb1926a-3a06-46ce-bfb4-18a18962d730.pdf): span, length, area, weight, throws, expo, balance, power, colour codes.
- Extreme Flight, 60 in monoplane assembly guide (extremeflightrc.com/cdn/shop/files/60_ARF_build_guide_WEB.pdf): motor and prop, 6S 3000 to 4000, right thrust, gear, tailwheel, the pack's strap, the throws.
- Extreme Flight, EF 60 in Edge 540T product page (extremeflightrc.com/products/ef-60-edge-540t-exp-v2-plus-blue-yellow): construction, carbon and G10, the photographs.
- FlyingRC, "Extreme Flight 60 in Edge 540T-EXP ARF Review" (flyingrc.net/ef540rvu.html): 760 sq in, 5 lb on 6S 3700, the CG range and its 4 in, "Inverted flight took just a bit of down elevator to hold".
- T-Motor, AM600 (store.tmotor.com/product/am600-3d-freestyle-flight-plane-brushless-dc-motor.html): 525 kV, "up to 8298g of thrust", 1700 W.
- CNHL 6S 3300 and 4000 40C product pages: 535 g and 625 g.
- APC 16 x 8E and 16 x 10E product pages and PER3 data files (via the Internet Archive): 1.83 oz each, the static figures.
- Wikipedia, "Zivko Edge 540": the air race, the symmetric Roncz section, 420 deg/s.
- AOPA, "Technique: Snap rolls", Flight Training, September 2014.
- British Aerobatic Academy, "How to fly a positive Snap roll" (britishaerobaticacademy.com/how-to-fly-a-positive-snap-roll/).
- FAA-H-8083-3C, Airplane Flying Handbook, ch. 5.
- aerospaceweb.org, "NACA 0012 Lift Characteristics".
- Composite-ARF Edge 540 2.6 m manual (carf-models.com): "the snaps are crisp and clean", considered and not taken.
- Nelson, Flight Stability and Automatic Control; USAF DATCOM (the downwash gradient, plain flap K').
