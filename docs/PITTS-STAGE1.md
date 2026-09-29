# Pitts S-1S, stage 1: the aircraft, the model and what it is meant to do

The owner asked for eleven all time great RC aeroplanes, and this is id
18: the Pitts Special, the aerobatic biplane. Why it is here: a biplane,
very agile and short coupled, with abrupt snap stalls, which looks great
in the chase view. What it has to show, each gated by a number: TWO WINGS
in each other's flow (the gap and the stagger, the biplane's interference
on the lift and the induced drag, which the plant did not have), a high
roll rate, crisp pitch, a sharp snap roll, and short, slightly squirrelly
taildragger ground handling; and a drawn model with both wings, the struts
and the wires.

This file gives every number with its source, the new plant capability and
why, each gate with its band, and what is still open. It follows
`docs/EDGE-STAGE1.md`, the closest aircraft here (a four channel electric
aerobatic taildragger), and the plant is `src/native/plant_wing.c` with a
table of its own, `FW_PITTS850`, airframe 18.

## Which Pitts, and why

**E-flite's Pitts S-1S 850mm, EFL35500** (BNF Basic; the PNP is EFL3575),
string id `pitts850`, the published 850 mm span.

| Kit | Why not |
| --- | --- |
| E-flite UMX Pitts S-1S, 385 and 434 mm | a 100 g micro: too small for the valley's gates, and its manual publishes no throws in mm |
| Hangar 9 / Extreme Flight / Great Planes Pitts S-2B and Python kits, 50 to 150 cc | gasoline scale aircraft of 10 kg and more; no wing area or throws found published in a fetchable manual |
| E-flite Pitts S-2S 25e (discontinued) | no current manual, no photographs to measure |

The E-flite 850 mm has what the others lack together: the maker's manual
with the span, length, **wing area**, weight, **throws in mm on both
rates** and the CG; a **dimensioned top view** (EFL35500_A73) with the
weight with and without the pack; a side, a front and a bottom photograph
to measure the gap, the stagger, the gear and the tail off; the motor, ESC
and prop by part number; and an independent flight review of this kit
(Greg Gimlick, Park Pilot, spring 2019) that corrects the manual's CG and
describes the stall, the snaps, the spins and the ground handling. It is
foam and electric, so it uses the plant's electric motor and pack, and it
is the one Pitts a pilot of this simulator is most likely to own.

## The aircraft

| Quantity | Value | Source |
| --- | --- | --- |
| Span b (the top wing) | 0.850 m | E-flite, 33.5 in (850 mm); the top view measures 0.849 |
| Wing area S | 0.282 m² | E-flite, 437 sq in (28.2 dm²), both wings |
| Length | 0.787 m | E-flite, 31 in |
| Mass m | 1.529 kg | E-flite's top view: 1304 g without the pack, 1529 g with the suggested one |
| Wing loading | 53.2 N/m² | derived |
| CG | 70 mm behind the top wing's leading edge | Park Pilot's review: "70 mm, plus or minus 3 mm", the figure E-flite corrected when the BL15 replaced the BL10 (the manual prints 86 mm) |
| Motor | BL15 880 kV | the review; the manual's spec table still names the BL10 880 kV (EFL8463) |
| ESC, prop | 40 A, 11 x 7 (EFLP11070) | the manual's spec and parts list |
| Pack | 3S 2200 (SPMX22003S30), 3S or 4S 1800 to 2200 | the manual, the product page |
| Throws, high | aileron 18 mm, elevator 32, rudder 28 | the manual p. 4 |
| Throws, low | 12, 24, 20 mm | the manual |
| Skill | 3, intermediate | Horizon Hobby's product page |

The full size S-1S for reference: 5.28 m span, 4.72 m long, one piece
symmetrical wings top and bottom with **four ailerons**, "The four aileron
[Pitts] at around 220°" per second (Budd Davisson, airbum.com, "There are
Pitts Specials and there are other airplanes").

### The outline, measured

- **The top view** (EFL35500_A73, dimensioned, 0.6348 mm a pixel on the
  span, the length checking to 0.1 percent): the top wing a constant
  **0.200 m** chord with both edges swept back **7.1 deg**, its tips
  rounded from 0.34 m out (0.00463 m² short of square each) and a cut out
  in its trailing edge over the cockpit 0.13 m wide and 0.053 m deep
  (0.0054 m²): **0.1553 m²**. The stabiliser and elevator 0.326 m across
  and 0.043 m² with the fuselage's strip, 0.040 outside it, its
  aerodynamic centre 0.385 m behind the CG; the rudder's trailing edge
  0.541 m behind it; the spinner's tip 0.246 m ahead.
- **The bottom view** (A2), scaled on the bottom wing's own span, 0.845
  m: its chord **0.175 m**, square to the flow, its tips rounded
  (0.00275 m² each): **0.1424 m²**, of which 0.016 runs through the
  fuselage. The exposed sum, 0.2817 m², is E-flite's 28.2 dm². The
  ailerons on both wings from 0.131 to 0.378 m out at 48 mm of chord,
  joined by a link strut; the top wing's leading edge **0.045 m ahead** of
  the bottom's at the root.
- **The side view** (A18, the aircraft on its wheels; 0.4394 mm a pixel
  on the length at the rest attitude, 11 deg by the fuselage's straight
  pinstripes, the cowl's top line 9.7): the stagger at the root, 0.051 m,
  so **0.048** is taken; the top wing's chord plane **0.090 m over** the
  thrust line and the bottom's **0.060 m under** it at the struts, a gap
  of **0.150 m**; the fin 0.105 m over the thrust line, the rudder's foot
  0.066 under it; the gear below.
- **The front view** (A16, 0.4994 mm a pixel on the span): the bottom
  wing's **3 deg of dihedral** (the full size S-1S's), the top wing flat,
  the I struts 0.292 m out, the wire gear's 0.21 m track.

With the top wing swept back, the two wings' quarter chords at their mean
chords are only **15 mm** apart fore and aft (the stagger of the ACs); the
reference chord is the two wings' chords by their areas, **0.188 m**.

## The biplane: what the second wing does

`npm run pitts:derive` prints every figure below.

**Prandtl's interference, on the Trefftz plane.** The two wings are two
lines in the far wake's cross section, the top one flat at +0.090 m, the
bottom one at -0.060 m rising with its dihedral, each shedding an elliptic
load's vortex sheet. The induced drag of the pair is the double sum of
their shed vorticity against ln r (a strip's own term ln h - 3/2), which
one wing alone checks against L²/(π q b²) to 0.04 percent. Prandtl's form
(NACA TN 182, 1924),

  D_i = (L1²/b1² + 2 σ L1 L2 / (b1 b2) + L2²/b2²) / (π q),

gives **σ = 0.552** (a common curve fit of Prandtl's chart for equal spans, (1 - 0.66 G/b)/(1.055
+ 3.7 G/b), gives 0.517 at G/b 0.177; the bottom wing's dihedral closes
the gap at the tips). **Munk's span factor** (the equivalent monoplane of
span k b1 with the pair's least induced drag) is **k = 1.132**; at the
split the wings actually carry, 1.131.

**Each wing's lift in the other's flow.** At one geometric angle (the
foam wings are rigged at one incidence, as the full size S-1S's are:
"symmetrical wings are parallel (same angle of incidence)", Davisson),
each wing's section lifts at 2π on its angle less the induced angles: its
own sheet's, CL S/(π b²), the other's, σ CL' S'/(π b1 b2) (Prandtl's
mutual term shared equally), and the other's **bound vortex**, which
Munk's theorem moves between them without changing their sum: the top
wing, ahead, sits in the upwash of the bottom wing's bound vortex and the
bottom one in the downwash of the top one's, c CL s/(4π r²) with s the ACs'
stagger and r their distance (an upper bound, a 2D vortex's). Solved:

| | Top wing | Bottom wing |
| --- | --- | --- |
| area, span, AR | 0.1553 m², 0.850 m, 4.65 | 0.1424 m², 0.845 m, 5.02 |
| own CL per rad in the pair | 3.989 | 3.620 |
| share of the cell's lift (`bip_w`) | 0.546 | 0.454 |
| own CL over the cell's (`bip_r`) | 0.991 | 0.899 |
| CL gained per unit the other loses (`bip_m`) | 0.112 | 0.219 |
| AC ahead of the cell's, per chord (`bip_x`) | +0.037 | -0.044 |
| stalls at (the cell's alpha, each at CL 0.90) | **12.4 deg** | 13.7 deg |

The cell's lift slope is **4.025** on the reference area (a monoplane of
the same span and area: 3.529); its induced drag factor on the reference
area **0.1143**, against **0.1462** for that monoplane. The top wing
carries more for its area and stalls first, upright and on its back,
which is what Pitts's own wings are built to do ("use different airfoil
sections top and bottom to make the top wing stall first whether inverted
or right side up", Davisson, of the factory S-1S; E-flite's foam wings
share one section, so here it is the stagger's upwash alone, and the
margin is 1.3 deg).

## What is new in the plant

**The second wing, `bip_*`** (`FixedWingParams`, sim_internal.h;
`biplane_lift` in plant_wing.c). A table with `bip_w` zero is a monoplane
and none of it runs. For a biplane, the lift, the drag and the stall's
pitching moment are taken wing by wing:

1. Each wing is the plant's own lift curve (now `wing_lift`, the code the
   whole wing always ran, moved into a function and called once for a
   monoplane, bit for bit what it was) at `bip_r` times the cell's angle,
   elevator and flaps: its own lift coefficient, which reaches CL max, and
   stalls, at its own angle.
2. Each wing again, its angle moved by what its partner falls short of its
   linear lift, times `bip_m`: a stalled wing's trailing sheet and bound
   vortex stop washing the other down, and the other gains lift.
3. The cell's lift is the wings' own, each weighted by its area over the
   reference (`bip_w / bip_r`), which in the linear range is exactly the
   table's cl_alpha (pitts:gates B2, to 0.00 percent). The drag: the zero
   lift drag once, each wing's flat plate as it stalls, and **Prandtl's
   induced drag** on the lift each wing's attached flow carries, CL_i
   (`bip_ki` CL_i + `bip_kx` CL_j), in place of k CL²: the pair's own, not
   a monoplane's (B1 flies 0.11427 against the derived 0.1143).
4. The pitching moment past the linear lift: each wing's stall at its own
   arm (the stall model's arms moved by `bip_x`), and the lift a wing
   gains from its partner's stall at its aerodynamic centre.
5. The strips past the stall (docs/STALL-STAGE1.md) judge their stall on
   the wing that stalls first.

A new read only entry point, `sim_wing_biplane(out[4])` (sim_abi.h,
additive, version unchanged), returns each wing's CL and linear CL for the
gates. Deterministic: sqrt and the fixed libm's small angle sine and
cosine, nothing else.

**Proof that nothing else moved.** `npm run crash:identity` runs every
gate and self test three times (main's module, this tree's, this tree's
with crash physics on) and compares their printed output byte for byte;
pitts:gates B4 holds all nineteen recorded flights' hashes (the five
inch, every fixed wing, the Extra's) to main's module's at 71c0cbc.

**Reused, not duplicated.** The Extra's **slipstream** over the tail
(`slip_*`): an 11 in prop close ahead of a small tail, whose wash at three
quarter throttle raises the elevator's authority by 31 percent at the
trim; the Edge's **surface knee** (`surf_knee`) and **strip ailerons**
(`strip_tau`); the P-51's **prop gyroscope** (`j_prop`). The Extra's
hi_alpha, rot_k and side_cda are not set: the Pitts is not a 3D aircraft.

## The coefficients

Nelson's forms on the cell, as the Edge's (`npm run pitts:derive`).

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w (cell), a_t, a_v | 4.025, 3.585, 3.484 | the biplane solution; 2π AR/(AR+2) |
| dε/dα | 0.640 | DATCOM on Munk's equivalent aspect ratio, 3.28 (Nelson's far field would read 0.78) |
| CLα | 4.190 | the cell and the tail |
| Static margin | 0.135 | V_H 0.280; the CG 0.071 chords ahead of the cell's AC; the fuselage's Raymer share |
| Cmα, Cmq, Cm0 | -0.5655, -3.574, +0.0659 | Cm0 trims 3/4 throttle with the elevator neutral |
| Cmδe, CLδe | 0.6832, -0.3457 | τ_e 0.756 for a 41 percent elevator |
| CYβ, Cnβ, Cnr | -0.342, +0.0982, -0.129 | a small fin, less the round fuselage's -0.017 |
| Clβ | -0.0396 | the fin's and the bottom wing's 3 deg of dihedral |
| Clp | -0.713 | strip theory on both wings at their own slopes |
| Clδa | 0.477 | four ailerons, τ_a 0.635 |
| Cnδr, CYδr, Clδr | -0.0977, 0.189, 0.013 | τ_r 0.849 |
| CD0 | 0.055 | two wings, eight struts, wires, pants, a round cowl, ESTIMATED |
| CL max | 0.90 each wing | the Edge's symmetric section at the same Reynolds number, ESTIMATED; the cell's 0.908 |
| stall_top, stall_k, blend | 1 deg, 0.60, 2 deg | the Edge's symmetric section's sharp stall, ESTIMATED |
| Stall arms, dw | -0.0713, 0.2213, 0.1438 | stall:derive |
| Throws, high | 22.02, 27.20, 25.10 deg | asin(throw / chord): 18/48, 32/70, 28/66 mm |
| Throws, low | 14.48, 20.05, 17.64 deg | the same on 12, 24, 20 mm |
| Expo | 0.30 | the house stock expo; E-flite gives none |
| Inertia | 0.0327, 0.0478, 0.0701 kg m² | ESTIMATED, the parts' classes summed to 1304 g, the pack placed for the CG (0.0995 m ahead of it, "all the way forward on the battery tray") |

**The motor, ESTIMATED.** E-flite publishes no bench figure. A DC motor
on the pack, the Extra's derivation: R and I0 of E-flite's Power 15 (the
BL15's class, 0.03 ohm, 2 A), 3S at 3.7 V a cell and 8 milliohm a cell,
APC's 11 x 7E (PER3_11x7E.dat) as the prop: **8,344 rpm, 0.276 N m, 16.18
N, 27.4 A**, a static thrust of 1.08 times the weight on 3S; on 4S 25.9 N
at 42.3 A. Pitch speed 24.6 m/s on 3S. Prop inertia 1.2e-4 kg m².

## The intended behaviour, and how each part is proven

`npm run pitts:gates` (scripts/pitts-gates.js, tests/pitts-thresholds.json),
flown in Manual on the table. Bands are the Edge's in proportion about
this aircraft's derived figure unless the row says. `npm run pitts:gates`:
**25 of 25**.

| Gate | Derived | Band | Measured |
| --- | --- | --- | --- |
| P1 level at 3/4 throttle, the trim | 13.33 m/s | 11.33 to 15.33 | 13.46, elevator at neutral |
| P2 stall, power off | 9.78 m/s | 9.19 to 11.15 | 10.18 |
| P3 glide at 1.4 Vs | L/D 5.83 (a monoplane of its span and area: 5.36) | 5.19 to 6.47 | 5.82 |
| P4 top speed, 3S | 18.84 m/s | 16.96 to 20.72 | 18.72 |
| P5 four ailerons, high rate | pb/2V 0.204 (412 deg/s at 15 m/s) | 0.163 to 0.244, and the full size S-1S's 220 deg/s at least | 0.194, 489 deg/s |
| P5b the same, low rate | 0.151 | 0.121 to 0.181 | 0.139 |
| P6 crisp pitch: 0.15 up stick at the trim, time to the peak rate | 0.212 s | 0.138 to 0.318 | 0.188 s |
| P8a on its back, 3/4 throttle | as upright | within 5 percent | 13.36 against 13.46, on half a stick of push |
| P8b on its back, stall | as upright | within 6 percent | 10.54 against 10.18 |
| P8c on its back, roll | as upright | within 5 percent | pb/2V 0.191 against 0.194 |
| P9a a yank at the trim, full up | alpha 30.5 deg against 12.4 | past the stall, under a quarter turn in 1.2 s, stops within 0.5 s | 29.3 deg, 27 deg of roll, 0.34 s |
| P9b the inside snap, full up and full rudder, 2 s, both ways | | still turning at half its peak rate or more at the end, a quarter turn at least; AOPA's recovery in 0.5 s | right 229 deg at 199 deg/s, left 249 at 200; 0.24 and 0.28 s |
| P9c the outside snap, pushed | | recorded | about 90 deg each way, not sustained: see below |
| P10 prop torque, static full throttle | 0.276 N m | 0.207 to 0.345, rolling left | 0.276, left |
| P11 standing on its wheels | 12.30 deg, 0.2134 m, 19.7 percent on the tail | half a degree, 5 mm, 3.5 points | 12.30, 0.2137, 19.9 |
| P12 take off, rotated at 1.2 Vs | 13.36 m at 12.19 m/s | 9.75 to 19.37 m, 10.36 to 14.02 m/s | 13.34 m at 12.13 m/s |
| P13 the roll tracks on the rudder | | under 5 deg and 1 m | 0.5 deg, 0.06 m |
| P13b feet off the rudder | | recorded | **12.6 deg**, 1.41 m (the Edge: 0.7 deg) |
| P14 taxi turn, full right rudder at a walk | 2.58 m | 2.03 to 3.40 | 2.36 m |
| P15 a landing, "hold full up elevator after touchdown" | | at rest at P11's attitude, no hull or prop | touched at 11.3 m/s, at rest at 12.30 deg |
| B1 the induced drag flown, dCD/d(CL²) | 0.1143 (a monoplane: 0.1462) | 0.1086 to 0.1200 | 0.11427 |
| B2 the two wings' lift is the cell's, short of the stall | cl_alpha α + cl_de δe | within 0.5 percent | 0.3104 against 0.3104 |
| B3 the top wing stalls first, upright and on its back | | the top wing alone, the bottom gaining | at 10.74 and -10.75 deg; the bottom +0.0017 over its own |
| B4 every other aircraft's recorded hash | main's | identical | identical, nineteen |
| B5 Node and Chrome | | identical | identical |

### Short, and a little squirrelly, on the ground

The CG is 0.113 m behind the main wheels' contact on a 0.573 m wheelbase,
0.197 of it (the Edge's 0.16, the Extra's 0.18), with the smallest yaw
inertia and the smallest fin of the taildraggers here: feet off the
rudder, the take off roll swings **12.6 deg** where the Edge's swings 0.7,
and with them on it tracks within 0.5 deg (P13, E-flite's "steer with the
rudder"). Its full rudder taxi turn is 2.36 m, tighter than the Edge's 2.44. Davisson
on the full size: its "reputation for being a handful on the ground is
grossly exaggerated", "the swerves" soft on spring gear; the review of
this kit: "Taxied easily for takeoff". E-flite's manual: "avoid sharp
turns until the plane has slowed enough to prevent scraping the
wingtips".

### The snap, and how the gates were set

AOPA's "Technique: Snap rolls" (Flight Training, September 2014): "a
power-on spin", entered "straight and level at a normal airspeed", "pull
back hard on the stick" and "add a strong yawing motion with rudder in the
desired direction", recovered with "rudder opposite the direction of the
turn, and reduce back-pressure". The review of this kit: "Stalls were
comfortable and easy to recover from, as were the spins", and "snaps
inside and out". No source gives an RC or full size snap's rate.

- **A yank alone** (P9a) asks 30.5 deg of alpha against the top wing's
  12.4: the Pitts's elevator on E-flite's high rate is past the stall by
  a quarter stick at the trim (the linear alpha of 0.25 stick is 12.5
  deg). The stall itself is **comfortable**, as the review says: the top
  wing stalls first, the downwash at the tail goes with its lift, and the
  nose falls through; 27 deg of roll in 1.2 s, stopped 0.34 s after
  letting go. The gate's first run took the Edge's stop time, 0.3 s,
  which has no source; the Pitts read 0.35, and the gate now takes AOPA's
  recovery time, 0.5 s, the one sourced figure here.
- **The inside snap** (P9b) is sustained both ways at the trim under power:
  229 deg right and 249 left in 2 s, still turning at 199 and 200 deg/s at
  the end. The right snap is the slower to start: the prop's torque rolls
  against it, and its gyroscope pitches the nose down in a right yaw
  (j_prop), which a small elevator only just holds.
- **The outside snap** (P9c) is **not** sustained, and is recorded rather
  than banded: pushed full down at the trim the cell reaches only -21 deg
  of alpha (Cm0's nose up trim works against the push), 8.6 deg past its
  negative stall against 17 past the positive one, and it turns about a
  quarter turn and stops. The review's "snaps inside and out" is not
  reproduced here; it is the open item below.
- **Against a tunnel's autorotation.** Knight and Wenzinger (NACA TR 379,
  1931) spun an unstaggered Clark Y biplane cell free about the wind
  (Table IV): stable autorotation at pb/2V 0.195 at 17 deg, 0.291 at 20,
  0.452 at 28. The Pitts's sustained inside snap, 199 deg/s at about 12
  m/s at 29 deg of alpha, is **pb/2V 0.12**: a third of a free cell's at
  that angle. The strips' autorotation (docs/STALL-STAGE1.md, the model
  every aircraft here shares) is the limit; the Edge's snap sits in the
  same range. Changing it moves every aircraft, and is not this branch's.

### The stabiliser

Stabilised asks 60 deg of bank and 30 of pitch, and with the throttle
closed lowers its target 4.88 deg to the glide at the 0.741 stick that
flies it level (`npm run stab:glide`; stab:chop: sink 2.199 m/s at 13.24
against the derived 2.200). Acro asks **300 deg/s of roll and 35 of
pitch**: 35 is under the accelerated stall at the trim, 36 deg/s, so
Acro's full stick does not snap it at cruise. Its integral reaches 0.60 of
stick, since on its back it holds level on half a stick of push.
`npm run pitts:stab`, **58 passed**, the Edge's bar on the Pitts's
throws; its take off in every mode flies with the pilot's rudder and
ailerons on (feet off, P13b).

## The landing gear

The Cub's model. Numbers are the drawn model's (PITTS_DIMS), off the side
photograph (`pitts:derive`).

| Quantity | Value |
| --- | --- |
| Main wheels | x +0.070, y ±0.105, z -0.2093 drawn, -0.2143 unloaded; r 0.0243 |
| Tailwheel | x -0.4926, z -0.0991 drawn, -0.1041 unloaded; r 0.012; steers at half the rudder's angle, ESTIMATED as the Edge's |
| Rest | 12.30 deg nose up, the CG 0.2134 m over the grass, 19.7 percent on the tail |
| Stiffness, damping | mains 1204 N/m, 36.4 N s/m; tail 591, 13.2; 5 mm static, 0.6 of critical |
| Prop tip | 94 mm over the grass level, 0.116 m at rest |
| Hull | hx 0.30, hy 0.425, 0.11 down (the thrust line is high on the fuselage), 0.11 up |
| Camera | on the top wing's centre section, 0.06 m ahead, 0.115 up: from the cockpit the top wing is the whole view ahead |

## The crash parts

`PARTS_PITTS850`, 23 parts summing to 1.529 kg with the CG at the origin
(`npm run crash:core`, 264 passed): the fuselage with a crushing cowl, the
aft fuselage, the stabiliser, elevator, fin and round rudder, each wing as
two panels about its centre (where a one piece foam wing breaks), the four
ailerons, the BL15 on its mount, the 11 x 7, the 3S pack and its hatch,
the two wire legs in their pants and the tailwheel wire, the camera on
the top wing and the antenna. A lost panel takes its area's share of the
cell's lift, as on every airframe; the second wing's split is not changed
by it.

## The covering

E-flite's scheme: red all over, the top wing's top a white sunburst from
the cockpit, the bottom wing's top the same rays and its underside white
bars, the stabiliser's rays, white pinstripes down the fuselage. Regions
wing, fuselage, tail, rays (new: "Sunburst and stripes") and trim; one
scheme, E-flite's own. E-flite's other Pitts (the UMX S-1S) is the same
red and white, so no second scheme is offered.

## The sound

The electric voice, `wing`, the other electric planes'.

## In the shell

`configs/airframes.js` pitts850, simId 18; tunes pitts-stab, pitts-acro
(the default) and pitts-manual; the free flight card; the hangar's power
(the stock 3S 2200 and E-flite's listed 4S), props (APC 11 x 8E and 10 x
7E), add-on anchors and tuning (the review's CG range, 67 to 73 mm behind
the top wing's leading edge, a new datum; the manual's throws). It opens
**at level 8 on the unlock curve**, after the P-51 at 7 and before the
Extra 300, which moves to 9, the Edge to 10 and the F-16 to 11: E-flite's
own intermediate rating, a short coupled biplane whose quarter stick yank
is past its stall and whose ground roll swerves without the pilot's feet,
but at a trainer's speeds on a foam airframe, which the Extra's hover, the
Edge's unlimited rates and the F-16's fan all ask more than.

## What is estimated, and what stays open

- **The outside snap.** The review flew "snaps inside and out"; here the
  push reaches only 8.6 deg past the negative stall and does not
  autorotate. The candidates are Cm0's trim (the zero lift incidence of
  the tail, not published), the elevator's chord at its widest (read off
  a photograph), and the shared strip model's autorotation (a third of
  TR 379's cell). The owner should fly it (below).
- **The motor** is the Power 15's class against APC's 11 x 7E; a bench
  figure for the BL15 on the 11 x 7 would move P1, P4 and P12 with it.
- **CD0** and each wing's **CL max** are estimated; the section is not
  published.
- The bound vortex interference is a 2D vortex's (an upper bound), and
  the mutual induced angle is Prandtl's shared equally between the wings.
- The rest attitude is read off the fuselage's pinstripes to 1.5 deg.
- The thrust line is taken through the CG; E-flite gives no down or side
  thrust, and the side view puts the CG perhaps 2 cm under it.

## The owner's test, in the shell

`npm run pitts:owner` (scripts/pitts-owner.js) flies it in the real shell
with the pitts-manual tune, on the plant's clock, against this aircraft's
bands: the take off on the rudder (P13), then with the feet off
(recorded), a full aileron roll from level at 3/4 throttle (P5), a yank
(P9a) and the inside snaps both ways with AOPA's recovery (P9b). The
page's hands fly short of the stall (0.2 of up stick at most: a quarter is
past it) and hold the wings against the prop's torque with an integral;
on its back is left to pitts:gates P8, which the page's hands held less
well (5.6 percent slow, still climbing, in 22 s).

| Owner check | Band | swiss2 |
| --- | --- | --- |
| take off on the rudder, heading to 3 m | p13_straight, 5 deg | 0.97 deg, off at 12.5 m/s |
| feet off, recorded | none | 6.6 deg left of the line at liftoff, 7.2 at worst, 4.8 at 3 m |
| full aileron at 3/4 throttle | p5_roll, pb/2V 0.163 to 0.244, 220 deg/s | 357 deg/s at 13.7 m/s, pb/2V 0.194 |
| a yank | p9_snap, under 90 deg, stops in 0.5 s | 20 deg, stopped in 0.03 s |
| snap right | p9_snap, a quarter turn, half the peak rate at the end | 108 deg, 110 deg/s against a 158 peak |
| snap left | the same | 236 deg, 196 deg/s against 244 |
| their recoveries | 0.5 s, level in 3 s | 0.28 s and 46 deg on, level in 0.3 s; 0.32 s and 64 deg on, level in 0.23 s |

The right snap in the shell (108 deg) is half the plant gate's (229):
entered from the page's level hand, a little slower and flatter, the
prop's torque and gyroscope take more of it. The left, the prop's side,
is the snap to show a pilot.

## What the owner should feel flying it

It sits tail down at 12 deg on tall wire gear. Open the throttle and keep
your feet on the rudder: it tracks, and it is off in about 13 m at 12 m/s;
take your feet off and it wanders 7 to 13 deg before it lifts. It trims
at 48 km/h at three quarter throttle and tops out at 67 on 3S. Full
aileron rolls it at about 480 deg/s at speed, more than twice the full
size Pitts's 220, the four ailerons crisp; roll it on its back and it
flies there on half a stick of push. In Manual on the high rate a quarter
stick of yank is already a stall: the nose drops through, it does not
fall off on a wing. Yank with a boot of rudder and it snap rolls the
rudder's way at about 200 deg/s to the left, slower and shorter to the right against the prop; reverse the
rudder and let the stick go and it stops in a quarter of a second. Pushed,
it only half snaps.

## Sources

- E-flite Pitts S-1S 850mm manual (EFL35500):
  https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw927db137/Manuals/EFL35500_Manual_EN_548653.pdf
- Horizon Hobby's product page and images EFL35500_A2, A16, A18, A73 (the
  dimensioned top view):
  https://www.horizonhobby.com/product/pitts-s-1s-bnf-basic-with-as3x-and-safe-select-850mm/EFL35500.html
- Greg Gimlick, "Horizon Hobby E-flite Pitts S-1S 850mm BNF Basic", Park
  Pilot, spring 2019 (the BL15, the 70 mm CG, the stall, the snaps):
  https://www.theparkpilot.org/horizon-eflite-pitts
- Budd Davisson, "There are Pitts Specials and there are other airplanes"
  (the four aileron 220 deg/s, the top wing stalling first, the ground
  handling): http://www.airbum.com/Pitts/ThePittsSpecial.html
- Wikipedia, "Pitts Special" (the S-1S's figures).
- E-flite Power 15 (R and I0 of the BL15's class):
  https://www.horizonhobby.com/product/power-15-brushless-outrunner-motor-950kv-3.5mm-bullet/EFLM4015A.html
- APC 11 x 7E performance data: https://www.apcprop.com/files/PER3_11x7E.dat
- L. Prandtl, "Induced drag of multiplanes", NACA TN 182, 1924.
- M. M. Munk, "General biplane theory", NACA Report 151, 1922 (the stagger
  theorem, the equivalent monoplane).
- M. Knight and C. J. Wenzinger, "Rolling moments due to rolling and yaw
  for four wing models in rotation", NACA Report 379, 1931:
  https://ntrs.nasa.gov/citations/19930091451
- AOPA, "Technique: Snap rolls", Flight Training, September 2014.
- Nelson, Flight Stability and Automatic Control; USAF DATCOM (the
  downwash gradient, plain flap K'); Raymer, Aircraft Design; Hoerner,
  Fluid-Dynamic Drag.
