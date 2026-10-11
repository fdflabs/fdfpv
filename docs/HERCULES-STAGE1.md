# C-130 Hercules, stage 1: the aircraft, the model and what it is meant to do

The owner's balsa Hercules (docs/HERCULES-CONTRACT.md), airframe 31,
`hercules3077`, on the fixed wing plant, `src/native/plant_wing.c`, with a
parameter table of its own, `FW_HERCULES3077`. Every number below is
printed by `npm run hercules:derive` (scripts/hercules-derive.js) with its
formula; this file says where each comes from. ESTIMATED marks every
figure no source publishes.

## The aircraft

**AeroTetris's Lockheed C-130 Hercules 3077**, a laser cut balsa and ply
kit (754 parts, 429 EUR) for the C-130A, E, H, J and H-30 fuselages:
https://aerotetris.com/models/c130-3077.php (its maker's post with the
same figures: https://www.rcscalebuilder.com/forum/forum_posts.asp?TID=37492).
Chosen because it is a real, current, large scale balsa kit of the
Hercules whose maker publishes the figures a flight model needs: span,
area, reference chord, neutral point and CG. Palmer Plans' 1/12 C-130
(Paschaloudis's 11 ft electric build, Model Airplane News,
https://www.modelairplanenews.com/video-electric-11-foot-c-130/) and
Advanced Scale Models' 100 in kit (Model Aviation, August 2007) publish
less.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 3.077 m | AeroTetris |
| Length | 2.250 m | AeroTetris, the C-130H fuselage (the full size's 29.79 m at 1:13.13 is 2.268) |
| Reference area S | 1.0486 m² | AeroTetris, "Reference area (S): 104.86 dm²"; its "wing area 87.6 dm²" is the panels outside the fuselage |
| Mean chord c | 0.3564 m | AeroTetris, "Reference length (lm): 356.4 mm" |
| Neutral point | 980.8 mm from the nose | AeroTetris, "AC" |
| CG | 923.8 mm from the nose | AeroTetris, "CG (16%)": 980.8 less 923.8 is 0.160 of 356.4, so the 16 is a static margin |
| Frame | 2460 g | AeroTetris, "Weight glued full" |
| Mass m | 6.728 kg | ESTIMATED: the build up below |
| Scale | 1:13.13 | the span over the full size's 40.41 m (USAF fact sheet) |

The kit's planform is taken as a straight taper with its own area and
mean chord: root 0.4671 m, tip 0.2144 (taper 0.459), AR 9.03. The rest is
the full size C-130H scaled, off Lockheed's three view, ESTIMATED to the
drawing: tailplane 16.05 m across on 35.4 m², fin and rudder 20.9 m² and
6.1 m tall over the fuselage's top, fuselage 4.34 m wide and 4.6 m deep,
props 4.11 m across, the inboard pair 0.25 and the outboard 0.49 of the
half span out, ailerons from 0.66 to 0.97 of it at a quarter chord, 2.5
deg of dihedral, 3 deg of incidence at the root and 0 at the tip, sections
NACA 64A318 root and 64A412 tip (Lednicer, The Incomplete Guide to Airfoil
Usage), the main gear in sponsons on a 4.35 m track 9.77 m behind the nose
wheel.

**The tail is not a T.** The brief said "T-shaped tail"; the C-130's
tailplane sits on its upswept tail cone under a tall fin, and is drawn and
modelled so.

### The power, ESTIMATED

AeroTetris names no power system. Four **E-flite Power 25s** (EFLM4025A:
870 kV, 0.03 ohm, Io 2.4 A at 10 V, 32 A continuous, 44 A burst, 3 to 4S,
11 x 8 to 14 x 7, 1.4 to 2.5 kg a motor), each on its own **3S 5000**, as
Paschaloudis's C-130 flies one pack a motor, on **APC 12 x 8Es**, the
scale prop's diameter (the full size's 4.11 m at 1:13.13 is 12.3 in),
40 A ESCs. The static point, the motor's torque against APC's
(PER3_12x8E.dat): **7,961 rpm, 0.377 N m, 20.3 N and 36.8 A a motor**,
81.3 N for the four, a static thrust 1.23 times the weight. On 4S the same
prop draws 56 A, past the motor's burst rating, which is why 3S. All four
turn clockwise seen from behind, as the full size's do.

### Mass and inertia, ESTIMATED

Built up from the parts' classes: the 2460 g frame (fuselage 1.05 kg,
wing 0.95, tailplane 0.17, fin 0.13, nacelles 0.16), 0.45 kg of glass and
paint, four motors (0.186 kg each), ESCs, props and spinners in the
nacelles, eight servos, the gear and sponsons, the receiver, and four 3S
5000s (0.41 kg each) on the cargo floor slid to the kit's CG, 0.228 m ahead
of it. The CG comes out 0.195 m over the belly, 0.260 m over the grass.
**Ixx 1.10, Iyy 1.31, Izz 2.24 kg m²**.

## The coefficients

Nelson's forms, as every derivation here uses them:

| Quantity | Value | How |
| --- | --- | --- |
| a_w, a_t | 5.134, 4.929 /rad | 2 pi A / (A + 2), the wing's by its dihedral's cos² |
| d eps / d alpha, V_H | 0.362, 0.591 | |
| CL alpha | 5.688 | wing and tail |
| static margin | 0.16 | the kit's; Nelson's neutral point puts it at 0.21, the check |
| Cm alpha, Cm q, Cm0 | -0.910, -15.83, 0.0687 | Cm0 trims 1.6 Vs elevator neutral |
| CLmax | 1.10 | ESTIMATED: an 18 percent 64A section at 2.9e5 |
| CD0, e | 0.045, 0.80 | ESTIMATED: the deep fuselage, four nacelles, fixed gear |
| Cl beta | -0.141 | the dihedral -0.049, the high wing -0.044, the fin -0.048 |
| Cl p, Cl delta a | -0.697, 0.300 | strip theory |
| Cn beta, Cn r, Cn delta r | 0.088, -0.120, -0.107 | the tall fin less the deep fuselage |
| throws | 15, 15, 25 deg | ESTIMATED: no manual; a scale model's usual, well inside the full size's |
| Cl r, Cn p (per CL) | 0.25, -0.125 | Nelson's wing estimates, CL/4 and -CL/8 |
| Cn delta a (per CL) | -0.12 | ESTIMATED: the P-51's, a cambered section's plain ailerons; no figure published |

## What the plant can and cannot model (docs/HERCULES-CONTRACT.md)

- **Four props, one line.** The plant has one thrust line. Four identical
  props turning the same way on symmetric lines sum exactly into it: the
  thrust (4 T), the torque (`torque_arm`, Q/T a prop, the same for the
  sum), the P factor (linear in the thrust), the gyroscope (`j_prop`, the
  four props' inertia). The line is 0.10 m over the CG, so power pitches
  the nose down a little, as on the full size.
- **No wash over the tail.** The plant's slipstream is one centreline
  prop over the fin and the stabiliser; the Hercules' wash is on the wing
  and the tailplane's inner half, never the fin. `slip_r` is 0: the
  elevator does not gain authority from power at low speed.
- **No engine out.** One engine quitting is an asymmetric thrust the plant
  cannot express. A prop broken in a crash is a part lost, not a quarter
  of the thrust.

## The controllers

A kit ships with no electronics: **Manual** is the default. Owner rule
2026-10-08, any real gyro: a Spektrum AR637T the builder fits, its
**AS3X** (gains by `npm run as3x:derive`: 0.148, 0.236, 0.796) and its
**SAFE Select** (45 deg bank, 20 deg pitch, glide trim 8.22 deg and level
stick 0.777 by `npm run stab:glide`).

The loop gains behind both (the `stab_*` and `acro_*` proportional,
derivative, feed forward and integral terms, `yaw_coord_k`) are FITTED:
Spektrum publishes none for the AR637T, so they sit in the range the
fleet's other gyros fly on, and `npm run stab:chop` holds the Stabilised
glide they give against the derived one.

## The gates (tests/hercules-thresholds.json, `npm run hercules:gates`)

Each band is the Kadet's in proportion about the derived figure.

| Gate | Derived | Band |
| --- | --- | --- |
| H1 stall, power off | 9.67 m/s | 9.08 to 10.98 |
| H2 cruise, level at 75 percent stick | 16.69 m/s | 14.35 to 19.45 |
| H3 glide at 1.25 Vs | L/D 10.53, sink 1.15 m/s | 9.37 to 11.79, sink 1.02 to 1.29 |
| H4 top speed, level | 22.57 m/s | 20.54 to 25.35 |
| H5 take off run on grass | 7.12 to 16.13 m, 1.1 to 1.5 Vs | the same, no tail strike |
| H6 rest | level, CG 0.2604 m, nose 10.75 percent | half a degree, 5 mm, a fifth of the share |
| H7 every other aircraft unmoved | | every pinned hash |
| H8 Node and Chrome agree | | identical |

The flight time the hangar shows, 40 minutes at 15.5 m/s, is the plant's
own (configs/power-estimates.js) on four 3S 5000s at this drag; Paschaloudis
flies 18 minutes on four 5S 5000s on a bigger, heavier aircraft flown
faster.

## The drawn model, the crash parts, the gear

`src/render/herculescraft.js` draws it: the radome and stepped flight
deck, the high wing in its fairing, the four nacelles, the sponsons, the
upswept tail with the ramp ('ramp') and the upper cargo door
('cargo-door'), which `setRamp(t)` opens, the low tailplane and tall fin.
The livery is the USAF airlifter's overall FS 36173 grey (USAF SIG,
Authentic Decals 72-51). No insignia.

`PARTS_HERCULES3077` (src/native/crash_parts.h): 24 parts, the most the
table holds, balsa throughout, the ramp a hatch. The gear: fixed, 55 mm
wheels, the mains 0.08 m behind the CG on a 0.331 m track, the nose wheel
0.744 m ahead of them steering with the rudder, the tail cone's bumper the
fourth contact, met at 9 deg nose up on the mains.
