# CAP 580, stage 1: the aircraft, the model and what it is meant to do

The owner chose two real 3D and IMAC aircraft on 2026-10-11
(~/Desktop/fdfpv-loop/3D-PLANES-RESEARCH.md); this is the first:
**Extreme Flight's 67 in CAP 580** (A464-BY and A464-GR, ARF and RxR), a
balsa and carbon aerobat on a T-Motor AM670, airframe 32, `cap1702`. It
follows docs/EXTRA-STAGE1.md, the Extra 300 3D's derivation, on the same
plant (`src/native/plant_wing.c`, the Extra's high angle, slipstream and
slow air terms) with a table of its own, `FW_CAP1702`. Every number below
comes from `npm run cap580:derive` (scripts/cap580-derive.js), which with
`--check` fails when a constant in the C tables or a band's centre in
`tests/cap580-thresholds.json` is not its own.

Each figure is marked **SOURCED** (the maker or a measurement publishes
it), **MEASURED** (read off a photograph at a stated scale), **FITTED**
(chosen where nothing gives it, with the reason) or **ESTIMATED** (the
Extra's rule for the same quantity).

Why this aircraft: it is the only 3D aircraft found whose static thrust,
torque and current are a **measured** table for its exact stock motor and
prop (T-Motor's bench for the AM670 520 kV on the 18 x 8 at 6S, twelve
throttle points). That removes the Extra's largest estimate, its motor.
It is 2.4 times the Extra's mass at 1.6 times its wing loading with the
same thrust over weight: a heavier, faster, more locked in aerobat on a
full size type nothing else in the hangar is (the Mudry CAP 231/232).

## The aircraft

| Quantity | Value | Status, source |
| --- | --- | --- |
| Span b | 1.702 m | SOURCED, the data sheet, 67 in |
| Length | 1.676 m | SOURCED, the data sheet, 66 in (air-rc lists 1710 mm; the maker's taken) |
| Wing area S | 0.5548 m² | SOURCED, the data sheet, 860 sq in |
| Mass m | 3.629 kg | SOURCED, the data sheet's 8 lb (the product page says 8 to 8.5 lb), taken on the stock pack |
| Wing loading | 64.2 N/m² | W / S |
| CG | the wing tube's centre | SOURCED as a position, the data sheet "Center of wing tube for maiden, sport and precision flight"; its station FITTED, below |
| Motor | T-Motor AM670 520 kV, 416.3 g, 10 mOhm, I0 4.2 A at 10 V | SOURCED, the EF combo listing and LIG Power's AM670 KV520 page |
| ESC | T-Motor AM116(A) | SOURCED, the data sheet |
| Prop | 18 x 8 AMZ carbon | SOURCED, the EF combo listing |
| Pack | 6S 4000 to 5000 mAh, 600 to 750 g | SOURCED, the data sheet; the stock taken as Motion RC's Admiral 6S 4500, 652 g (configs/power.js) |
| Throws, high | aileron 38 up / 34 down, elevator 50 / 50, rudder 50 to 55 deg | SOURCED, the data sheet, in degrees |
| Throws, low | aileron 15 to 20, elevator 10 to 12, rudder 20 deg | SOURCED, the data sheet |
| Expo, high | aileron 65 to 70, elevator 50 to 60, rudder 60 to 80 percent | SOURCED, the data sheet |
| Right thrust | 2.5 deg | SOURCED, the 67 in line's build guide (written for the Extra 260) and air-rc; not in the plant, below |
| Section | the full size CAP 231's V16F, 16 percent | SOURCED for the full size (Lednicer); the model's FITTED as a thick symmetric section |

The plant's aileron is one throw each way: **36 deg**, the mean of 38 up and
34 down (the 4 deg differential is listed below). The rudder **52.5 deg**,
the middle of 50 to 55. The plant has one expo for all three surfaces:
**0.60**, the figure in or at the edge of all three of the sheet's ranges
(the aileron's is 5 short).

### The outline, measured off photographs

Extreme Flight publishes no drawing and no front view. The research agent
and this lane read the product photographs:

- **Side view**, IMG_7289 (https://extremeflightrc.com/cdn/shop/files/IMG_7289.heic),
  0.991 mm a pixel along the thrust line on the sheet's 66 in from the
  spinner's tip to the rudder's trailing edge; the 76 mm spinner reads 82,
  so 8 to 10 percent on everything off it.
- **Underside**, IMG_7296
  (https://extremeflightrc.com/cdn/shop/files/IMG_7296_34d6f784-6d3c-4aef-8c2a-bee30451cbd4.heic),
  1.301 mm a pixel on the span; its chords are foreshortened about two to
  one, so only ratios are taken off it. IMG_7267, the green twin, agrees.
- **From behind and above**, IMG_7299
  (https://extremeflightrc.com/cdn/shop/files/IMG_7299.heic): a second
  taper and the tail's shares; its tail is nearer the camera than its
  wing, so a tail length off it is an upper bound.

| Quantity | Value | Status |
| --- | --- | --- |
| Taper | 0.50 | FITTED between 0.45 (IMG_7296) and 0.58 to 0.62 (IMG_7299) |
| Root, tip chord | 0.435, 0.217 m | the taper on the sheet's area over the centreline trapezoid |
| Sweep | quarter chord unswept; the leading edge 0.054 m back at the tip | MEASURED, IMG_7296: the leading edge back, the trailing edge forward |
| Ailerons | from 0.115 m out to the tip, 0.43 of the chord | MEASURED, IMG_7296: 0.385 inboard to 0.47 at the tip |
| CG station | 0.130 m behind the root's leading edge, 0.31 of the mean chord | FITTED: the 20 mm tube's station (air-rc gives the tube) is not published and no photograph shows it; 0.30 of the root chord |
| Prop disc | 0.56 m ahead of the CG | MEASURED, IMG_7289: the root's leading edge 0.47 m behind the spinner's tip |
| Wing chord plane | 0.085 m under the thrust line | MEASURED, IMG_7289, +/- 25 mm |
| Stabiliser | 0.75 m span, 0.29 m root, 0.22 m tip, quarter chord 0.85 m behind the CG | root MEASURED (IMG_7289), taper MEASURED (0.68 to 0.77), span FITTED: 0.60 of the wing's off IMG_7296 over a near tail's magnification of about 1.35 |
| Elevators | 0.67 of the chord | MEASURED, 0.65 to 0.70 (IMG_7296, IMG_7299) |
| Fin and rudder | 0.277 m over the thrust line, 0.075 under, 0.067 m², quarter chord 0.90 m behind the CG | MEASURED, IMG_7289 |
| Rudder | 0.70 of the vertical tail | MEASURED, 0.73 of the chord at the top, all of it under the fuselage |
| Fuselage at the wing | 0.18 m deep, 0.15 m wide | MEASURED, IMG_7289 (179 mm); width under IMG_7296's 0.169 bound |
| Main gear | axles 0.12 m ahead of the CG, 0.31 m under the line, 0.38 m track | MEASURED (IMG_7289, +/- 30 mm); track FITTED under IMG_7296's 0.418 |
| Main wheels | 2.5 in | FITTED: hidden in the pants, unpublished |
| Tailwheel | axle 0.941 m behind the CG, 0.127 m under, 22 mm | MEASURED, IMG_7289 |
| Rest pose | 10.87 deg nose up | from the contacts above; IMG_7289 reads 9 to 13 deg, the check |

## The motor and prop, measured

T-Motor's bench for the AM670 520 kV on the 18 x 8 at 6S, LIG Power's copy
of T-Motor's 2017 test platform (https://www.ligpower.com/cn/product/am670-kv520-3D-combo.html):

| Throttle | V | A | W | rpm | N m | g |
| --- | --- | --- | --- | --- | --- | --- |
| 40 | 23.58 | 13.44 | 316.98 | 4303 | 0.471 | 2183 |
| 45 | 23.52 | 17.20 | 404.44 | 4728 | 0.569 | 2649 |
| 50 | 23.40 | 22.11 | 517.21 | 5182 | 0.689 | 3212 |
| 55 | 23.29 | 27.79 | 647.05 | 5618 | 0.816 | 3802 |
| 60 | 23.16 | 34.44 | 797.57 | 6043 | 0.954 | 4433 |
| 65 | 23.01 | 41.91 | 964.42 | 6456 | 1.101 | 5110 |
| 70 | 22.84 | 50.41 | 1151.29 | 6860 | 1.256 | 5823 |
| 75 | 22.64 | 59.79 | 1353.52 | 7236 | 1.405 | 6534 |
| 80 | 22.41 | 71.29 | 1597.29 | 7633 | 1.589 | 7361 |
| 85 | 22.13 | 83.74 | 1852.97 | 8001 | 1.762 | 8137 |
| 90 | 21.88 | 95.82 | 2096.23 | 8314 | 1.916 | 8822 |
| 100 | 21.55 | 111.11 | 2394.77 | 8636 | 2.097 | 9617 |

- **thrust_static 94.31 N** (9617 g), **current_full 111.11 A**, the
  bench's full throttle row. Thrust over weight **2.65**.
- **torque_arm 0.02224 m**, the bench's 2.097 N m over its 94.31 N.
- **rpm_no_load 10,160**: the plant shows 0.85 of it at full throttle, so
  it shows the bench's 8,636.
- **r_cell 0.00346 ohm**: the bench's source sags 0.0208 ohm across its rows
  (23.58 V at 13.4 A to 21.55 V at 111.1 A), taken as the pack's over six
  cells. thrust_static is the bench's at that sag, from a fresh pack.
- **pitch_speed 40.37 m/s**: APC's PER3_18x8E
  (https://www.apcprop.com/files/PER3_18x8E.dat), the same size, stands in
  for the carbon blade in forward flight. At the bench's 8,636 rpm its
  static rows give 90.8 N and 1.975 N m, the bench's within 4 and 6
  percent, the check that it stands in. Its thrust against the airspeed
  (the 9,000 rpm block scaled to the bench's rpm) holds and then falls;
  the plant's straight line 1 - V / Vp cannot follow that, so the line is
  taken through the bench's static thrust and the curve's thrust at the
  speed where it meets the drag (32.9 m/s, 17.4 N): the plant's top speed
  is APC's. Between them the line is under the curve (70.9 against 78.8 N
  at 10 m/s, 47.6 against 55.7 at 20), which costs the plant a little
  climb and acceleration in the middle.
- **The hangar's other props** (configs/prop-estimates.js, `node
  scripts/parts-derive.js --write`): APC's 18 x 10E and 17 x 8E on the same
  motor, anchored at the bench's measured 8,636 rpm (`rpmFull` in
  configs/power.js, because this option's pitch speed is APC's curve's and
  not rpm times the geometric pitch, as every other option's is). The 18 x
  10 comes out 8,369 rpm, 101.2 N and 130.6 A; T-Motor benched the AM670
  520 kV on an 18 x 10 too, 8,138 rpm, 99.4 N (10,132 g) and 131.2 A: the
  method lands within 3 percent of a measurement it never saw.
- **j_prop 0.000866 kg m²**, ESTIMATED: a 60 g carbon 18 in blade (T-Motor
  publishes no mass for the AMZ; APC's 18 x 8E is 2.57 oz) at a tapered
  blade's 0.7 of a rod's m D² / 12, and the AM670's can.

## Mass and inertia, ESTIMATED

Built up from the parts (the derive script lists them): the AM670 416 g
(SOURCED), the prop and spinner, the ESC, four servos (the sheet's EF/Theta
989s), the tail feathers, the carbon gear, the canopy and pilot, the wing
panels on their tube, the 652 g pack slid to the CG (0.024 m ahead of it),
and the fuselage taking what the sheet's 8 lb leaves (0.96 kg). **Ixx
0.1399, Iyy 0.5496, Izz 0.6575 kg m²**, about three and a half times the
Extra's in roll and five in pitch and yaw.

## The coefficients

Nelson's forms, as the Extra's (scripts/cap580-derive.js):

| Quantity | Value | How |
| --- | --- | --- |
| AR, MAC | 5.220, 0.338 m | b² / S; the taper's mean chord |
| CLmax | 0.889 at Re 1.5e5 to 0.950 at 3e5, peaking at 15.7 to 19.5 deg; 0.928 at the stall's 2.5e5 | Timmer's measured NACA 0018 (Wind Engineering 32(6), 2008: 0.988 at 11.6 deg at 1.5e5, 1.056 at 15.1 at 3e5) times Raymer's 0.9 for the wing, the peak further on by the induced angle CL / (pi A e), the stall angle on the wing's own slope 4.543 (cl_alpha_wing): the Extra's measured stall (docs/FLIGHTMODEL.md), the plant's stall_re. A first pass took 0.97 by the Extra's old XFOIL rule; replaced when the measured one landed |
| CD0, e | 0.045, 0.75 | ESTIMATED, the Extra's class: spatted gear on carbon legs, hinge gaps, a thick wing, the side force generators |
| CL alpha | 5.060 | wing and tail |
| static margin | 0.210 | h_n 0.523 less the CG's 0.313 of the MAC |
| Cm alpha, Cm q, Cm0 | -1.0619, -14.673, 0.0678 | Cm0 trims 18 m/s with the elevator neutral (the Extra's 15 at its lift coefficient) |
| CY beta, Cn beta, Cn r | -0.5569, 0.1997, -0.2612 | the fin, less the fuselage |
| Cl beta | +0.0024 | no dihedral: the fin's -0.0265 and the low wing's +0.0290 |
| Cl p, Cl delta a | -0.6309, 0.4415 | strip theory on the taper |
| Cm de, CL de | 1.4644, -0.5824 | Roskam's K' at 50 deg, 0.552 |
| Cn dr, CY dr, Cl dr | -0.1205, 0.2278, 0.0135 | K' at 52.5 deg |
| stall_top, stall_k | 2.0 deg, 0.70 | the Extra's section's break, the same class of thick symmetric section |

The tail is big: the stabiliser 0.34 of the wing's area at a tail volume of
0.87 (the Extra's 0.55), which is what a 3D design carries (the elevator
alone gives 27 rad/s² hanging on the prop).

## The intended behaviour, and how each part is proven

`npm run cap580:gates`, bands in `tests/cap580-thresholds.json`, each
width the Extra's for the same gate, centres from `npm run cap580:derive`.
Bands are never widened to pass.

| Gate | What | Derived | Band | Plant |
| --- | --- | --- | --- | --- |
| C1 | level at 75 percent stick | 27.69 m/s (the prop at the curve's 0.839) | 24.37 to 31.01 | 27.31 |
| C2 | stall, power off | 10.62 m/s (CL max 0.928 at 2.5e5) | 9.99 to 12.10 | 11.10 |
| C3 | glide ratio at 15 m/s | 7.43 | 6.54 to 8.32 | 7.41 |
| C4 | top speed | 33.09 m/s | 29.78 to 36.39 | 32.18 |
| C5 | roll, full aileron, pb/2V | 0.440 (533 deg/s at 18 m/s) | 0.330 to 0.550 | 0.439 (598 at 20.2) |
| C6 | hover, height held | the bench's 0.535; the curve turns sqrt(W / T_s) at 0.514 | 0.509 to 0.562 | 0.5157, height within 0.01 m |
| C7 | vertical climb, full throttle | 21.97 m/s | 19.78 to 24.17 | 21.41 |
| C8 | torque roll, ailerons let go | 194 deg/s left | 146 to 242 | 200 left |
| C9 | full right aileron, hanging | 169 deg/s right | 102 to 237 | 208 right |
| C10 | full elevator at zero airspeed | 27.47 rad/s² | 20.6 to 34.3 | 26.7; prop stopped 0.00 |
| C10b | full rudder at zero airspeed | 14.91 rad/s² | 11.2 to 18.6 | 13.7; prop stopped 0.00 |
| C11 | harrier at 40 deg of alpha | 9.80 m/s, 0.497 stick (the finite wing's broadside force, below) | 7.84 to 11.75, 0.423 to 0.571 | 9.45, 0.438, elevator 0.85 |
| C12 | knife edge at 20 m/s | 32.3 deg, 0.661 stick, rudder 84 percent | 24.2 to 40.3, 0.562 to 0.760 | 31.3, 0.667, rudder 0.90 |
| C13 | standing on its wheels | 10.87 deg, 0.313 m, 16.9 percent | half a degree, 5 mm, 3.5 points | 10.88, 0.3134, 16.5 |
| C14 | take off roll | 4.2 m | 2.54 to 6.75 | 6.09 |
| C15 | the Extra, Night Timber, Hercules unmoved | batch's hashes | identical | identical |
| C16 | Node and Chrome agree | | identical | identical |
| C17 | the figure judge names its 3D figures | hover, torque roll, harrier, knife edge pass | all four | all four |

Notes on the derivations:

- **C8, the torque roll.** The gate's pilot holds the nose on the rudder
  (wingpilot.js `hangSticks`). The swirl's side wind on the fin yaws the
  nose and the rudder that stops it pushes back on the same surface, so
  with Nelson's forms the fin's counter roll is zero: the net torque is
  the prop's less the wing root's share of the swirl, (1 - SWIRL_KEEP) of
  it (docs/FLIGHTMODEL.md), 0.59 N m, steady against rot_k at 194 deg/s.
  The Extra's derivation took the fin's roll with no rudder (its E8
  derives 178 and its plant reads 218 for that reason); this one does not.
  The plant still reads 10 percent over (213), as the Extra's does on the
  same arithmetic (218 against 198 so derived).
- **C6, the hover.** The prop speed that holds the weight is sqrt(W /
  T_s) of full, 0.614; the stick that turns it there is where that speed
  falls on the bench's measured curve (`throttle_rpm`), 0.514, and the
  plant hangs at 0.516. The gate holds it to the measurement, the bench's
  0.535 (between its 50 and 55 percent rows), 5 percent either way, the
  Extra's E6 width. Until the propulsion lane's electric law landed the
  plant's steady speed was the stick itself, its hover 0.614, and this
  row was printed as a WAIT, 15 percent off the bench.
- **C12 and C17, the knife edge and the judge.** At 20 m/s the CAP holds
  its knife edge at 30 deg of sideslip. The judge
  (src/game/figuredetect.js) names a knife edge by the wing in the vertical
  plane along the line (FAI F3P-AA 23), which sideslip leaves alone, so C17
  judges C12's own knife edge (until 2026-10-11 it took the span within
  26 deg of vertical and C17 flew a 26 m/s pass instead; the tricks lane
  fixed the judge, docs/TRICKS-CATALOG.md). `npm run figures:knife` flies
  it too.
- **Everything else** is the Extra's derivation's arithmetic on this
  aircraft's numbers.

**Re-derived on the aero lane's plant (w34-3d-wingslope, 2026-10-11).**
Past the stall the wing's broadside force is now the finite wing's,
1.11 + 0.018 A (Viterna and Janetzke, NASA TM-82944), 1.204 here, in
place of the plate's 2.0, and the tail lifts on its own angle. The
derivation takes the same CDmax as extra-derive.js does; the harrier at
40 deg moves to 9.80 m/s at 0.597 throttle (the plant 9.45). `node
scripts/cap580-derive.js --write-bands` rewrites every band's centre from
the derivation and its edges at the width the thresholds file states for
it, rounded inward, so the next plant change is re-derived the same way.

**On APC's measured curves (w35-prop-ctj, 2026-10-11).** The plant now
flies every wing prop on its APC file's thrust and torque over the advance
ratio (axial_curve, torque_curve, on the geometric pitch speed, the
bench's 8,636 rpm times 8 in, 29.247 m/s), not the straight line through
the bench's static thrust and APC's top speed this table first took
(40.37 m/s). The derivation reads the table's curve (scripts/lib/propcurve.js);
APC's own 9,000 rpm row scaled to the bench's rpm agrees with it to 0.1 N
at 0, 10, 20 and 30 m/s. Re-derived by --write-bands: the top speed 33.06
m/s (the plant 32.2), the vertical climb 24.03 m/s, the harrier stick
0.467, the knife edge stick 0.624, the take off 3.84 m. The line's
middle, under the curve by up to 8 N, had cost climb and acceleration.

## Waits on the plant (for the flight model lane), and the tricks lane

Not built here: this lane adds rows only, no shared plant code.

1. **Done, 2026-10-11: the throttle's steady rpm under load.** The plant
   now turns an electric prop by Drela's law, and a table with its motor's
   measured curve sets `throttle_rpm` (the propulsion lane). The CAP's is
   T-Motor's bench, rpm over full 0.498, 0.600, 0.700, 0.794, 0.884, 0.963
   and 1 at 40 to 100 percent (under 40 FITTED, straight from the ESC's
   stop). C6 is now gated on the measurement: the bench hovers it at
   0.535, the plant at 0.516, inside the Extra's 5 percent. The rest of
   the gap is the bench's thrust not going as the square of its rpm.
2. **Done, 2026-10-11: right thrust.** `thrust_yaw` is 2.5 deg, the 67 in
   line's (the build guide, air-rc).
3. **Aileron differential.** 38 up and 34 down; the plant's aileron is one
   throw each way.
4. **Per axis expo.** The sheet's three ranges; the plant has one figure.
5. **The free prop at zero throttle** is taken as stopped (the flight
   model lane's ESC fix, 2026-10-11, which this table follows: it carries no
   duty_min); windmilling waits on the propulsion lane, as on every table.
6. **The thrust line's height over the CG**, taken 0 (above, the crash
   parts' check); a balance of the real model would settle it.
7. **Tricks lane: the judge's knife edge**: done 2026-10-11 (C17 above).
8. **Snaps, spins, blenders, the elevator and the parachute** wait on the 3D
   lane's stall and spin work, as on the Extra (docs/TRICKS-CATALOG.md:
   `physics: 'waits'`).

## The landing gear

The 67 in line's carbon legs (Extreme Flight sells one set for the 67 in
Laser, Extra 260, Edge 540T, CAP 580 and Slick 580) with pants over 2.5 in
wheels and a carbon tailwheel steered by the rudder, 0.45 of its angle
(the Extra's). Each axle is lowered by 5 mm of static deflection, so the
plant settles onto the photographed pose; stiffness for that and damping
at 0.6 of critical, the Cub's rule. The prop's lowest tip, 0.2286 m under
the hub, is a skid.

## The crash parts

`src/native/crash_parts.h` PARTS_CAP1702: 19 parts summing to 3.6287 kg with
the CG at the origin (`npm run crash:core`): the balsa fuselage and its
rear box, the stabiliser and elevators, the fin and the rudder that runs
under the fuselage, two panels on the 20 mm carbon tube (its section's
160 N m at a 1 mm wall, FITTED) and their ailerons, the AM670 on its
firewall, the carbon prop, the pack under the canopy, the canopy, the
carbon gear and tailwheel, the camera and an antenna. Balsa: nothing
crushes; a joint past its onset cracks, as the Ugly Stik's does. The
strengths are the Kadet's and the Ugly Stik's balsa scaled, FITTED.

**A consistency check that does not close.** The plant takes the thrust
line through the CG (`thrust_z` 0), as the Extra's table does, because a
3D aircraft is built so power does not pitch it and nothing published says
otherwise. The parts do not quite agree: with the wing's chord plane 85 mm
under the thrust line (measured, +/- 25 mm), the pack on the floor and the
gear below, the 1.14 kg the fuselage part takes has to sit 115 mm over the
line for the CG to be on it, more than an ESC, servos and a cowl would.
Either the real CG is some tens of millimetres under the thrust line (then
power pitches the nose a little, which nothing here can derive without
the model's own balance), or the wing sits at the high end of its
measurement. The fuselage part's box reaches to the turtle deck's top so
the part's centre is inside it; that is geometry, not a fix. Listed below
as open. The derivation balances the CG fore and aft only, so its
inertias are about the thrust line; the difference this makes is small
next to their estimate.

## The stabiliser and the tunes

An ARF ships with no electronics, as the Hercules does
(configs/registry.js): **Manual** is the default, as an IMAC or 3D pilot
flies it; **AS3X** and **SAFE Select** are a Spektrum AR637T a builder
fits (owner rule 2026-10-08: any real gyro), as docs/CONTROLLERS.md has
it. The data sheet's servos (EF/Theta 989, Savox 1261) are digital, so the
receiver writes Spektrum's 11 ms frame, as on the Extra; the AS3X gains,
heading hold and rates from `npm run as3x:derive` (as3x_k 0.0366, 0.2261,
0.5556; as3x_kh 0.6533, 4.0359, 9.9174); Stabilised's power off glide and
trim throttle from `npm run stab:glide` (7.74 deg, 0.555). The loop gains
are the Extra's, FITTED. `npm run cap580:stab`, 59 checks: the Extra's set
on the CAP's throws, less Acro (the CAP has no Acro tune), and on the take
off with the heading held the pilot's hand also holds the wings, because
the AM670's 2.1 N m at full throttle is three times the Extra's and lifts
a wheel unless the ailerons answer it.

## In the shell

`configs/airframes.js` cap1702, simId 32; tunes cap-manual (the default),
cap-as3x, cap-stab; the hangar's power (the stock AM670 on the 6S 4000 and
4500), tuning (the sheet's CG and throws), kit slots (spinner, canopy: its
side force generators and pants are stock), the two Extreme Flight schemes
(blue and yellow, green and red), strings in en and es. It opens **at level
10**, the lane's call by analogy with the Extra (2026-10-11): the Extra's
hover, torque roll and harrier at 9 on foam, then this on balsa at 2.4
times the mass and 1.6 times the wing loading, faster and heavier in every
figure, before the F-16 at 11. Its hangar place is after the Hercules in
`configs/airframes.js`. Planes carry no price (docs/ECONOMY.md: the shop
sells cosmetics); its kit items follow the kits contract.

## What the owner should feel flying it

Pull it vertical and bring the throttle to about 60 percent (the bench
says 54; the plant's throttle law waits on the flight model lane): it
stops and hangs, heavier on the sticks than the Extra. Let go of the
ailerons and it torque rolls left at a bit over half a turn a second;
full right aileron turns it back the other way. A blip of throttle makes
the tail bite. At walking pace nose up 40 deg it harriers at about 30
km/h on 60 percent throttle with steady wings. Rolled on its side at 20
m/s it holds height on most of the rudder. In normal flight it is twice
the Extra's speed range: it cruises at 25 m/s on 75 percent, tops out
near 32, rolls at 600 deg/s on full aileron, and loops big and round with
a firm but not full pull.

## Sources

- Extreme Flight, 67 in CAP 580 data sheet:
  https://extremeflightrc.com/cdn/shop/files/DATASHEET_67_CAP_ecb0e58c-fdbf-409f-85e7-0af3bab79c00.pdf
- Extreme Flight, 67 in CAP 580 product pages (ARF and RxR, both
  schemes): https://extremeflightrc.com/products/ef-67-cap-580-blue-yellow-arf ,
  https://extremeflightrc.com/products/ef-67-cap-580-green-red-arf
- Extreme Flight, T-Motor AM670 and AM116 combo (520 kV, the 18 x 8 AMZ
  carbon prop): https://extremeflightrc.com/products/t-motor-hobby-am670-am116-combo
- Extreme Flight, 67 in line build guide (the Extra 260's; 2.5 deg right
  thrust, the CG at the former behind the tube):
  https://extremeflightrc.com/cdn/shop/files/67_Extra260_ARF_Build_guide.pdf
- Extreme Flight, the 67 in line's carbon gear (one set for the 67 in
  Laser, Extra 260, Edge 540T, CAP 580 and Slick 580):
  https://extremeflightrc.com/products/cf-painted-white-landing-gear-67-ef-airframes
- LIG Power, T-Motor AM670 KV520 bench table and motor data:
  https://www.ligpower.com/cn/product/am670-kv520-3D-combo.html
- APC, PER3_18x8E performance data and the prop's weight:
  https://www.apcprop.com/files/PER3_18x8E.dat ,
  https://www.apcprop.com/product/18x8e/
- air-rc, the CAP 580's listed tube, incidences and right thrust (source of
  its figures unknown, taken only where the maker is silent):
  https://www.air-rc.com/aircraft/EXTREME-FLIGHT_CAP-580-67_A464-GR-ARF
- Lednicer, The Incomplete Guide to Airfoil Usage (the CAP 231's V16F):
  https://m-selig.ae.illinois.edu/ads/aircraft.html
- Mudry CAP 230 family: https://en.wikipedia.org/wiki/Mudry_CAP_230
- Timmer, W. A., Two-dimensional low-Reynolds number wind tunnel results for
  airfoil NACA 0018, Wind Engineering 32(6), 2008 (the measured stall, as
  docs/FLIGHTMODEL.md cites it for the Extra)
- XFOIL polars for the NACA 0015 (the first pass's CL max, superseded): http://airfoiltools.com/polar/details?polar=xf-naca0015-il-200000 ,
  http://airfoiltools.com/polar/details?polar=xf-naca0015-il-500000
- Motion RC, Admiral 6S 4500 (the stock pack's mass): see configs/power.js F16_6S
- docs/EXTRA-STAGE1.md and docs/FLIGHTMODEL.md for every form and plant term
  this derivation borrows; Nelson, Flight Stability and Automatic Control;
  Roskam, Airplane Design VI (K'); Hoerner, Fluid-Dynamic Drag; Selig, AIAA
  2010-7938 (SWIRL_KEEP, jet_kj).
