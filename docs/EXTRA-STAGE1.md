# Extra 300 3D, stage 1: the aircraft, the model and what it is meant to do

> Removed as airframe 14 (`extra1308`) on 2026-09-29 at the owner's
> request, and back on 2026-10-08 as the flight model lane's 3D aircraft
> under a new airframe, 29, `extra3d1308` (docs/FLIGHTMODEL.md, PR 5): 14
> stays reserved, `extra1308` still reseats on the Ugly Stik, so nothing
> saved or recorded on the old one flies as this one. The table, gear,
> crash parts, model and paint are this document's, unchanged; what
> changed under it is the plant: the slipstream's swirl, the wing root's
> recovery of it and every prop's gyroscope (FLIGHTMODEL.md PR 2 to 4),
> which moved E8 and E9 (re-derived there).

The owner asked for eleven all time great RC aeroplanes, and this is the
3D one: a foam aerobatic monoplane whose thrust is over its weight. That
one fact opens a regime nothing else in the hangar can fly: hanging still
on the prop (a hover), the airframe turning against the prop's torque when
the ailerons are let go (a torque roll), slow flight far past the stall
held on power (a harrier), flying sideways on the rudder (a knife edge),
and controls that still work at no airspeed at all because they sit in
the prop's wash. This file gives every number the plant is built from with
its formula and source, the new plant capabilities the regime needs, the
behaviour and how each part of it is gated, the gear, the crash parts, the
covering, the sound and the check table with its bands. It follows
`docs/KADET-STAGE1.md` and `docs/TIMBER-STAGE1.md` and uses the same
plant, `src/native/plant_wing.c`, with a parameter table of its own,
`FW_EXTRA1308`, airframe 14.

## The aircraft

**E-flite's Extra 300 3D 1.3m, EFL115500** (BNF Basic; the PNP is
EFL11575, and the airframe is the earlier Extra 300 1.3m EFL11550's).
Chosen because it is the most documented foam 3D Extra there is: Horizon
Hobby publishes its manual with the throws, the rates, the expo and the
CG, its listing gives the span, length, area, weights and power system,
its product photographs include a dimensioned top view, and its
replacement parts name the prop. Extreme Flight's Extra 300 EXP publishes
less, and a profile foamie is not an Extra 300's shape.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.308 m | E-flite, 51.5 in (1308 mm) |
| Length | 1.260 m | E-flite, 49.6 in |
| Wing area S | 0.369 m² | E-flite, 572 sq in (36.9 sq dm) |
| Mass m | 1.51 kg | E-flite's A73 image: 1240 g without the pack, 1510 g on the suggested 4S 2200 (the manual's range is 1510 to 1696 g) |
| Wing loading | 40.1 N/m² | W/S; the listing's 40.9 to 46 g/dm² |
| CG | 95 mm behind the root's leading edge | the manual, 90 to 100 mm, the middle |
| Motor | 4250 910 kV (EFL11596) | the manual's parts list |
| ESC | 60 A (EFL11597) | the manual |
| Prop | 13 x 6 wood (EFL11592) | the replacement prop's listing |
| Pack | 4S 2200 to 3200 mAh, 3S compatible | the manual and the listing |
| Throws, high | aileron 50 mm, elevator 60, rudder 100 | the manual p. 3 (100 percent) |
| Throws, low | 30, 45, 70 mm | the manual (70 percent) |
| Expo | 30 percent high, 15 low | the manual |

The throws are measured at each surface's widest chord (E-flite's usual
practice): the aileron's 84 mm at its root, the elevator's 94 mm (45
percent of the stabiliser's 0.208 m root) and the rudder's 122 mm at its
foot, so the angles are asin(throw / chord): **36.53, 39.67 and 55.05
deg** high, 20.92, 28.60 and 35.00 low.

### The outline, measured

E-flite does not publish the tail, the taper or the gear, so they are
measured off its own images:

- **The top view** (EFL115500_A73, the dimensioned silhouette, 1.0163 mm a
  pixel on the published span, the length checking to 1 percent): the root
  chord 0.366 m on the centreline and the tip 0.204 m (taper 0.557, which
  with the span gives 0.373 m² against E-flite's 0.369), the leading edge
  swept back 0.072 of the span out, the ailerons from 0.077 m to the tip at
  25 percent of the root's chord and 34 of the tip's, the stabiliser 0.501
  m across on 0.208 m at its root and 0.142 at its tip, its quarter chord
  0.717 m behind the CG; the rudder's trailing edge 0.926 m behind it.
- **The side photograph** (EFL115500_A03, 0.708 mm a pixel on the length):
  the stabiliser's chord line (no incidence) 5.6 deg down aft in it and
  the wheels' ground line 1.1 deg up, so the aircraft rests **6.7 deg nose
  up**; turned into the body frame, the main axles 0.153 m ahead of the CG
  and 0.213 m under it, the tailwheel's 0.824 m behind and 0.116 m under;
  the fin and rudder 0.046 m², 0.208 m over the thrust line and 0.085 under
  it, their quarter chord 0.80 m behind the CG, the rudder three quarters
  of it; the fuselage 0.154 m deep at the CG.
- **The front photograph** (EFL115500_A04): the wing about 0.07 m under the
  thrust line, a 0.324 m track, no dihedral.

The thrust line is taken through the CG (`thrust_z` 0), as a 3D aircraft
is built so power does not pitch it; E-flite gives no side or down thrust.

### The motor, ESTIMATED

E-flite publishes the motor, prop and ESC but no bench figure, and no
review found gives one. `scripts/extra-derive.js` runs the motor on the
pack: a DC motor's torque (I - I0) 60 / (2 pi kV) against the prop's, with
I = (V - n / kV) / R, where R and I0 are E-flite's Power 32's (0.02 ohm,
2.4 A; a 42 by 50 mm outrunner, the 4250's class), the pack 4S at the
plant's nominal 3.7 V a cell with 8 milliohm a cell, and 5 milliohm of ESC
and wire. The prop is stood in for by APC's 13 x 6.5E (PER3_13x65E.dat:
static 0.512 N m and 29.66 N at 9,000 rpm, 0.634 and 36.88 at 10,000,
0.771 and 44.97 at 11,000). They meet at **10,127 rpm, 0.651 N m, 37.86 N
and 64.4 A** (690 W of shaft power): **a static thrust of 2.56 times the
weight**. `torque_arm` is 0.651 / 37.86 = 0.01719 m. The pitch speed is the
plant's rule, 0.85 of the no load 13,468 rpm times the 6 in pitch, 29.08
m/s. The prop's inertia, ESTIMATED, is a 35 g wood blade's 0.7 of a rod's
m D² / 12 and the can's, 2.49e-4 kg m².

### Mass and inertia, ESTIMATED

Built up in the derivation from the parts' classes (motor and prop 230 g
forward, the ESC, the receiver, the cowl and cockpit shell as a rod, the
aft fuselage as a rod, the wing along its chord, the tail feathers, the
servos, the gear), summing to E-flite's 1510 g, with the 270 g pack placed
where the CG comes out at the manual's: 0.098 m ahead of it, in the hatch
ahead of the wing. **Ixx 0.0459, Iyy 0.1142, Izz 0.1525 kg m²**.

## The coefficients

Nelson's forms, as the Cub's and the Timber's (`scripts/extra-derive.js`):

| Quantity | Value | How |
| --- | --- | --- |
| AR, MAC | 4.636, 0.2927 m | b² / S; the taper's mean chord |
| a_w, a_t, a_v | 4.390, 3.699, 3.715 /rad | 2 pi A / (A + 2); the fin's effective AR 1.55 of its geometric 1.866 |
| d eps / d alpha | 0.603 | 2 a_w / (pi A) |
| CL alpha | 4.704 | wing and tail |
| static margin | 0.154 | h_n 0.406 less the CG's 0.252 of the MAC |
| Cm alpha, Cm q, Cm0 | -0.7265, -9.496, 0.0450 | Cm0 trims 15 m/s with the elevator neutral: the pilot's trim is the table's neutral |
| CLmax | 0.95 | a thick symmetric section at 2e5, ESTIMATED |
| CD0, e | 0.045, 0.75 | gear, spats, hinge gaps, a thick wing, ESTIMATED |
| CY beta, Cn beta, Cn r | -0.5731, 0.2405, -0.3577 | the big fin, less the fuselage's |
| Cl beta | +0.0105 | no dihedral: the fin's -0.0212 and the low wing's +0.0317 (DATCOM, 1.2 sqrt(A) (z_w / b)(2 D / b)) |
| Cl p | -0.6276 | the taper's strip theory |
| K' | 0.581, 0.570, 0.557 | Roskam's plain flap large deflection factor (Airplane Design VI fig. 10.7, cf/c 0.33) at the three high throws, Mason's curve fit |
| tau a, e, r | 0.378, 0.447, 0.527 | thin aerofoil flap effectiveness at 29, 45 and 76 percent chord, times K' |
| Cl delta a | 0.3722 | strip theory over the aileron span |
| Cm de, CL de | 0.8666, -0.3537 | |
| Cn dr, CY dr, Cl dr | -0.1492, 0.2439, 0.0112 | |

The control derivatives carry K' at full throw, as the Timber's do: a 3D
throw's surface does not add lift linearly past 15 deg.

## What is new in the plant

A thrust over the weight is flown on the prop's wash. The plant had none
of it, and four capabilities were added, each general (any table can set
it), each deterministic (sqrt and the small angle sine and cosine of the
fixed libm, nothing else), and each off on every table before this one,
written so a table without it runs exactly the arithmetic it always ran;
a fifth, the prop's precession, is the P-51's `j_prop` (#123), which the
Extra sets. **Proof: all sixteen recorded flights' hashes (the five inch,
the wing, the Skyhunter, the Cub, the Radian, the Bramor and its chute,
the Slow Stick, the Bombshell, the Timber, the Timber on floats, the Kadet,
the P-51's two, the Edge 540's and the F-16's) are what main's module gives,
`extra:gates` E15; every
other plane's gates and stabiliser self tests pass unchanged.**

### 1. The slipstream (`slip_*`)

The held branch `origin/slipstream-held` (d31de45, the Slow Stick's,
held because the premises were not understood, docs/STALL-STAGE1.md
Round 6) was read first. **Taken from it:** momentum theory's far wake,
the disc's pressure jump dp = T / A carried in a stream contracted to
R sqrt((V + v_i)/(V + 2 v_i)), each surface's immersed share as the
contracted radius over its span, the controls meeting dp, the tail's
shares of the table's derivatives (Nelson's forms), and its choice of the
tail's zero lift at the trim cm_0 is set for, since cm_0 already holds what
the tail's rigging does there. **Not taken, and why:** its angle and rate
terms met the free stream's dynamic pressure times the wash's speed ratio
over a rate floor, which goes to zero as the airspeed does, so at a hover
the tail had no damping and no stiffness; its forces were turned with the
free stream, undefined at zero airspeed; it had no fin share below the
thrust line and no ailerons. Here the angle and rate terms are written in
**crossflow form**: a linear term q X (angle) is 1/2 rho V X (V angle), a
dynamic pressure times a crossflow speed, and in the wash the extra is
rho v_i X (crossflow), the wash's 2 v_i in place of V. The crossflows are
the body's own velocities (V sin(alpha - a0) = -w cos a0 - u sin a0 over
the stabiliser, -v over the fin) and the rotation's (q c/2, r b/2), so a
still aircraft's rotation meets the wash too. The tail's force is along
the body's axes, the wash's own direction. The ailerons' share is their
roll moment inboard of the contracted radius, (r_w² - y0²)/(y1² - y0²).
The fin's share counts its height over and under the thrust line.

At the hover (T = W = 14.81 N, no airspeed): dp 173 Pa, v_i 8.40 m/s, the
wash contracted to 0.117 m, which covers 47 percent of the stabiliser, 69
percent of the fin and rudder and 1.8 percent of the ailerons' moment.

### 2. Past the linear angles (`hi_alpha`, `tail_*`, `side_cda`)

A 3D aircraft flies at every angle, and three of the plant's linear terms
fail there: the stiffness cm_alpha alpha and the sideslip terms grow
without bound, alpha itself wraps at 180 deg (flipping the moment of a
tail slide), and the tail, whose lift is in those linear terms, never
stalls. With `hi_alpha` the wing and body's share of the stiffness takes
sin(alpha), each tail surface is taken **at its own angle with its
control's share**, the stabiliser at the wing's angle less the downwash
(which goes with the lift the wing makes, so a stalled wing's lost
downwash is in it and `stall_dw` is not taken again) less the angle it
carries none at, the fin at sin(beta), and each surface's normal force,
linear x = a (angle) at small angles, **saturates on a flat plate's**
1.17 (Hoerner): x / (1 + (x / 1.17)^4)^(1/4). A surface in a crossflow, or
a control past what its surface can carry, pushes no harder than a plate.
The share in the wash saturates the same way at its angle in the wash's
own stream. `side_cda`, 0.132 m² (the fuselage's 1.26 by 0.125 m side at
Allen and Perkins' crossflow coefficient of 1.2 times their eta of 0.7), is
the crossflow drag against the body's sideways speed squared that a knife
edge is flown on.

### 3. The air a slow aircraft turns through (`rot_k`)

The plant's rate damping is linear in the airspeed, so hanging on the prop
a rotation met nothing and a torque roll would spin up without end. Each
surface's strips swept through still air by the rotation meet a flat
plate's normal force, 1/2 rho C_N c |r|³ summed (C_N 1.17): **roll 0.01580,
pitch 0.04108, yaw 0.03462 N m s²**, taken with the linear damping as the
root of their squares' sum, so each alone is itself.

### 4. The prop's precession (`j_prop`, the P-51's)

H = J Omega along the nose, the airframe's answer -omega x H, so a yaw rate
pitches a hanging aircraft and a pitch rate yaws it: 0.187 N m s at the
hover. This branch first built the same term as `prop_j`; the P-51 merged
first with `j_prop`, the same arithmetic, and the Extra uses that one.

### 5. The ailerons on the stalled strips (`strip_tau`)

The strip model past the stall (docs/STALL-STAGE1.md) set each strip's
angle from the roll rate alone. At a 3D pb/2V of 0.38 that puts the
descending wing's tips 22 deg further into the airflow, past their stall,
which took the roll damping away and autorotated the aircraft to 2,180
deg/s at full aileron. On a real wing the descending side's aileron is up
and holds its strips out of the stall; each strip now takes tau of its
aileron (0.378 on all four of the Extra's). Zero on every earlier table.
The Edge 540 (#124) found the same runaway and built the same field,
`strip_tau`, in the same place in the strip loop; the two are merged as
one, the Edge's field and code with the Extra's 0.378. The Edge's `surf_knee` (a
surface's angle buying less past about 15 deg) the Extra does not set: its
control derivatives carry Roskam's K' at full throw, as the Timber's do,
and its surfaces saturate on a flat plate (hi_alpha).

## The intended behaviour, and how each part is proven

`npm run extra:gates`, bands in `tests/extra-thresholds.json`, derived
figures from `npm run extra:derive`. Bands are never widened to pass.

| Gate | What | Derived | Band | Measured |
| --- | --- | --- | --- | --- |
| E1 | level at 75 percent | 18.11 m/s | 15.94 to 20.28 | 17.99 |
| E2 | stall, power off | 8.31 m/s | 7.81 to 9.47 | 8.92 |
| E3 | glide ratio at 12 m/s | 7.12 | 6.27 to 7.97 | 7.09 |
| E4 | top speed | 24.34 m/s | 21.9 to 26.8 | 23.56 |
| E5 | roll, full aileron, pb/2V | 0.378 (497 deg/s at 15 m/s) | 0.284 to 0.473 | 0.376 (553 deg/s at 16.8) |
| E6 | hover throttle, height held | sqrt(W / T_s) = 0.6255 | 0.594 to 0.657 | 0.6269, within 0.01 m |
| E7 | vertical climb, full throttle | 15.76 m/s | 14.2 to 17.3 | 15.29 |
| E8 | torque roll, ailerons let go | 230 deg/s left | 172 to 288 left | 230 left |
| E9 | full right aileron, hanging | 149 deg/s right | 89 to 209 right | 149 right |
| E10 | full elevator at zero airspeed | 38.86 rad/s² | 29.1 to 48.6 | 36.9; prop stopped 0.04 |
| E10b | full rudder at zero airspeed | 32.47 rad/s² | 24.4 to 40.6 | 31.5; prop stopped 0.04 |
| E11 | harrier at 40 deg of alpha | 6.25 m/s, 0.603 throttle, elevator 66 percent | 5.0 to 7.5, 0.51 to 0.69, short of full | 7.08, 0.633, stick 0.83 |
| E12 | knife edge at 15 m/s | 34.3 deg sideslip, 0.775 throttle, rudder 78 percent | 25.7 to 42.9, 0.66 to 0.89, short of full | 34.3, 0.784, stick -0.85 |
| E13 | standing on its wheels | 6.7 deg, 0.2221 m, 18.3 percent on the tail | half a degree, 5 mm, 15 to 22 percent | 6.69, 0.2222, 18.0 |
| E14 | take off roll | 2.78 m | 1.7 to 4.5 | 4.07 |
| E15 | every other aircraft unmoved | main's hashes | identical | identical |
| E16 | Node and Chrome agree | | identical | identical |

How each is derived:

- **E6, the hover.** At zero airspeed the plant's thrust is the table's
  duty squared, so the stick that holds the weight is sqrt(W / T_s). Only
  an aircraft whose thrust is over its weight has one; the band is 5
  percent because nothing but the pilot's hold is between the formula and
  the plant. The gate's pilot (tests/lib/wingpilot.js `hangSticks`) holds
  the nose on the vertical with the elevator and rudder and the roll rate
  at nothing on the ailerons, the throttle on the height.
- **E8, the torque roll.** The prop's reaction, torque_arm W = 0.255 N m,
  against the rotation's own plate damping, steady at sqrt(Q / k_roll).
  Left: the prop turns clockwise from behind.
- **E9.** Full aileron in the wash is dp fa S b Cl_da throw_a = 0.362 N m,
  over the torque: a 3D pilot can hold a hover's torque on the ailerons,
  and a real one does, with most of the stick.
- **E10.** The first angular acceleration from rest hanging still, the
  wash's dp on each surface's immersed share, the control saturating on its
  plate (x = Cm_de throw / V_H 1.14 on the elevator, 1.96 on the rudder),
  over the inertia. With the prop stopped the same sticks move nothing:
  the authority is the wash's, the ground truth of a 3D aircraft.
- **E11, the harrier.** Level at 40 deg of body angle of attack: the
  stalled wing's plate lift (the plant's post stall curve) and the thrust's
  vertical share carry the weight, its forward share the drag; the
  elevator that holds it is found on the plant's hi_alpha moment, the
  stalled wing's normal force at its centre of pressure, the saturating
  tail and the wash's share on it. The wing rocks as it goes into the
  stall, a harrier's wing rock; the gate's pilot holds the angle, the
  wings and the heading with integrals and reads the last 5 of 20 s.
- **E12, the knife edge.** Rolled to 90 deg at 15 m/s: the body's side
  force is normal to its axis, as a slender body's and a fin's are, so it
  lifts by cos beta and drags by sin beta; the thrust along the axis lifts
  by sin beta and pulls by cos beta. The sideslip and throttle that hold
  height and speed, with the crossflow drag and the rudder that holds the
  sideslip (its own side force opposing). The gate's pilot asks for a
  sideslip from the height's rate and flies it on the rudder.
- **E13, E14.** The gear's geometry settles the plant onto the drawn pose;
  the take off is full throttle, the tail up at 5 m/s and the nose to 8
  deg at 10 m/s.

### What is not modelled, deliberately

- The inner wing in the wash is not given the wash's extra lift, and the
  aileron's wash share carries no stall of its own.
- The swirl of the wash over the fin (the take off's swing a real
  taildragger has) is left out; the prop's torque and P factor are in.
- The tail surfaces saturate on a flat plate; the section's own stall
  angle and hysteresis are not modelled past that.
- The motor is estimated; a bench figure for the 4250 on the 13 x 6 wood
  prop would replace it, and every derived band would move with it.

## The landing gear

Two spatted main wheels, 57 mm, on moulded legs, and a 22 mm tailwheel on
a wire under the rudder that the rudder steers through its springs, 0.45
of the rudder's angle (25 deg at full throw). Each axle is lowered by 5 mm
of static deflection, so under its own weight the plant settles onto the
drawn pose: 6.7 deg nose up, the CG 0.2221 m up, 18.3 percent of the
weight on the tail. Stiffness for that deflection, damping at 0.6 of
critical, the Cub's rule (`scripts/extra-derive.js`). The prop's lowest
tip is a skid 0.165 m under the hub, 0.092 m over the grass at rest.

## The crash parts

`src/native/crash_parts.h` PARTS_EXTRA1308: the forward fuselage with a
crushing cowl, the aft fuselage as a foam boom, the stabiliser and
elevator, the fin and the rudder that runs under the fuselage, two wing
panels on the carbon tube with their ailerons, the motor on its X mount,
the wood prop (ply standing for wood, as the Kadet's does), the pack in
its bay and its hatch, the two main legs and the tailwheel, the camera
and the antenna; 19 parts summing to 1.51 kg with the CG at the origin
(`npm run crash:core`).

A crash that takes the stabiliser or the fin scales that surface's
slipstream shares with it, as it does the table's tail derivatives. With
the whole surface gone its tail volume is zero, and the elevator's or the
rudder's angle on it is taken as zero rather than divided by it: the
first build divided, and `crash:identity`'s crash physics on run of
`wing:contact` found the Extra's nose-in reading NaN. It now passes. The
one check the Extra fails with crash physics on is the tip strike's "back
on its wheels": it ends at 9.6 deg with the tailwheel carrying nothing,
the same class of result the Cub, the Kadet, the Timber and the Edge give
there on main.

## The stabiliser

The Cub's loops scaled to throws two and a half times the Cub's. Acro asks
for up to 360 deg/s of roll and 100 of pitch (what full elevator holds at
16 m/s, near CLmax; past it the aircraft is stalled, not pitching faster).
`stab_pitch_down` 8.72 deg and `stab_trim_throttle` 0.624 from `npm run
stab:glide`. `npm run extra:stab`, 56 checks. Manual is where a 3D
aircraft is flown.

## The covering

E-flite's scheme: the nose and spats yellow orange, the wing's top white
with grey outer panels, its underside in yellow and black squares, the
fuselage white with a black stripe, the tail grey. Regions wing, fuselage,
nose, tail, trim and checks; schemes stock and the UMX Extra 300 3D's red,
grey and black (`configs/liveries.js`).

## The sound

The electric voice, `wing`, the other electric planes'.

## In the shell

`configs/airframes.js` extra1308, simId 14; tunes extra-stab, extra-acro
and extra-manual; the free flight card; the hangar's power (the stock 4S
and E-flite's listed 3S, 2200 and 3200 mAh packs), props (APC 13 x 8E and
12 x 6E), add-on anchors and tuning (the manual's CG range and throws). It
opens **at level 8 on the unlock curve**, after the P-51 at 7 and before
the Edge 540, which moves to 9, and the F-16 at 10: a hover a pilot holds
on every stick at once and a torque roll the ailerons must hold, on a
foam airframe that forgives the ground, where the Edge is an unlimited
aerobat that snaps and the F-16 a jet whose maker asks for experience.

`npm run extra:owner` flies the four in the real shell on swiss2 with
the extra-manual tune, each from a take off and a climb of 80 m, the
pilots extra:gates E6, E8, E11 and E12's closed once a frame on the
plant's clock: hanging on the prop (the throttle and the height held,
E6's band), the torque roll with the ailerons let go (E8's), the
harrier at 40 deg (E11's) and the knife edge at 15 m/s (E12's). The
gates' attitude gains close at the plant's 250 Hz and ring once a frame,
so the page's hover pilot runs lower ones with an integral kept in the
world's axes, and hangs with the nose at 80 to 88 deg rather than 90.

## What the owner should feel flying it

Pull it vertical and bring the throttle back to about 60 percent: it stops
and hangs. Let go of the ailerons and it turns left about its nose, two
thirds of a turn a second; hold right aileron and it stops, more and it
turns back. The elevator and rudder still move the nose with no airspeed
at all, and a quick blip of throttle makes them bite harder. Chop the
throttle and they go soft. At walking pace with the nose 40 deg up and
the throttle near 60 percent it mushes along level, rocking its wings.
Rolled on its side at a brisk pace it holds height on most of the rudder.

## Sources

- E-flite Extra 300 3D 1.3m manual (EFL115500):
  https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf
- E-flite Extra 300 1.3m manual (EFL11550 and 11575, the same airframe):
  https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL11550-75-Manual-EN.pdf
- Horizon Hobby's product page and images EFL115500_A03, A04, A06, A73:
  https://www.horizonhobby.com/product/e-flite-extra-300-3d-1.3m-bnf-basic-with-as3x-and-safe-select/EFL115500.html
- AMain's listing (the 13 x 6E prop, wing loading, throws):
  https://www.amainhobbies.com/eflite-extra-300-3d-1.3m-pnp-efl11575/p873880
- The 13 x 6 wood prop, EFL11592:
  https://www.amainhobbies.com/eflite-extra-300-1.3m-13x6-wood-propeller-efl11592/p873900
- E-flite Power 32 (R and I0 of the 42 x 50 class):
  https://www.amainhobbies.com/eflite-power-32-brushless-outrunner-motor-770kv-eflm4032a/p19283
- APC 13 x 6.5E performance data: https://www.apcprop.com/files/PER3_13x65E.dat
  (via the Internet Archive when apcprop.com does not answer), and its
  weight, 1.06 oz: https://www.apcprop.com/product/13x6-5e/
- W. H. Mason, Stability and Control Derivative Estimation (Virginia
  Tech), Roskam's K' curve fit:
  https://archive.aoe.vt.edu/mason/Mason_f/LDstabdoc.pdf
- Extra EA-300 (the full size 300L's 400 deg/s roll rate):
  https://en.wikipedia.org/wiki/Extra_EA-300
- The Extra 300's planform taper, 0.54 (a scale research model):
  https://www.researchgate.net/figure/Schematic-of-the-Extra-300-aircraft-with-integrated-wing-twist-concept_fig1_309727387
- E-flite UMX Extra 300 3D, EFLU1080 (the second scheme):
  https://www.hobbyzone.com/EFLU1080.html
- Nelson, Flight Stability and Automatic Control; Hoerner, Fluid-Dynamic
  Drag and Fluid Dynamic Lift; Allen and Perkins, NACA TR 1048 (the
  crossflow term); Raymer, Aircraft Design; Sheldahl and Klimas,
  SAND80-2114 (symmetric sections past the stall), as the other stage
  files cite them.
