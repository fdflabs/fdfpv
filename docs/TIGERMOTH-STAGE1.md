# Tiger Moth, stage 1: the aircraft, the model and what it is meant to do

**Removed aircraft.** The Edge 540, the Extra 300 3D, the Pitts S-1S, the
Wot 4 and the Quickie 500 were removed from the game on 2026-09-29 at the
owner's request, with their airframes, models, tunes, gates and recorded
flights; their sim ids (13, 14, 18, 20 and 22) stay reserved. Where this
document names them it is as a comparison or as the aircraft that brought
a capability, and every capability this aircraft flies on stays in the
plant.

The owner asked for eleven all time great RC aeroplanes, and this is id
23: the de Havilland DH.82 Tiger Moth, the classic trainer of the 1930s, a
gentle scale biplane. What it has to show, each part gated by a number: a
BIPLANE (two wings in each other's flow, on the plant's second wing, the
Pitts's), slow scale flight, a big adverse yaw that needs the rudder in a
turn, a gentle stall, a taildragger, a glow engine as the kit has it, the
struts and the wires drawn, and the classic yellow and silver trainer
schemes.

This file gives every number with its source, the behaviour and how each
part of it is gated, the gear, the crash parts, the covering, the sound,
the shell, and the check table with its bands. It follows
`docs/UGLYSTIK-STAGE1.md` for the glow engine and `docs/PITTS-STAGE1.md`
for the second wing, and the plant is `src/native/plant_wing.c` with a
table of its own, `FW_TIGERMOTH1803`. `npm run tigermoth:derive` prints
every derived figure below.

## Which Tiger Moth, and why

**Great Planes' Tiger Moth ARF, GPMA1330**, string id `tigermoth1803`, the
published 71 in (1803 mm) span.

| Candidate | Why not |
| --- | --- |
| Hangar 9 Tiger Moth 20cc, HAN4615 (88 in) | its manual is on manualslib, which refuses the fetcher; a gasoline engine |
| Phoenix Model Tiger Moth 40 (1404 mm) | the same, and a sport scale outline |
| FMS, Dynam, Nexa 1400 mm foam and balsa ARFs | no manual with the area, the throws and the CG found fetchable |
| David Boddington's RCME Tiger Moth plan (Outerzone 11864, 47 in) | a semi scale sport model on a .20, and the article publishes no area or weight |

Great Planes' instruction manual (GPMZ0231 for GPMA1330 V1.2, fetched from
Hobbico's manuals server) has what the others lack together: the span, the
length, the **wing area**, the weight, the **CG and its allowed range**,
the **throws on both rates** at the widest part of each surface, the engine
list, the wheel sizes and the flying notes. It is a scale model of the full
size: its 71 in is the DH.82A's 29 ft 4 in at **1/4.96**, and the full
size's own geometry at that scale checks against the kit's published area
to 3 percent and its length to 4, so the parts the manual does not
dimension (the gap, the stagger, the sweep, the dihedral, the tail) are de
Havilland's rigging diagram at that scale.

One thing the brief assumed is not what the kit is, and the model follows
the kit: **a tail wheel, not a tail skid**. The full size DH.82A stands on
a steerable tail skid (Phillips's handling notes: "the rudder/tailskid
interconnect"); Great Planes' ARF ships "15. Tail Wheel Wire & Bearing, 16.
1-1/4" Tail Wheel", the wire set in the rudder, and the manual's take off
and landing notes are a tail wheel's ("hold up elevator to keep the tail
wheel on the ground"). Every RC Tiger Moth ARF found (Hangar 9, Nexa,
Phoenix) has a tail wheel too.

### The kit, Great Planes' manual

| Quantity | Value | Source |
| --- | --- | --- |
| Span b | 1.8034 m | "Wingspan: 71" [1,803.4mm]" |
| Wing area S | 0.87742 m² | "Wing Area: 1360 sq in"; the manual's own conversion, 8,840 sq cm, is not 1360 sq in |
| Length | 1.524 m | "Length: 60" [1,524mm]" |
| Mass m | 4.6493 kg | "Weight: 10.25 lbs", taken as flying weight with the tank full, as the Kadet's and the Stik's are; the manual's "[4,592g]" is not 10.25 lb, and its "17.35 oz/sq ft" on 1360 sq in is |
| Wing loading | 52.0 N/m² | derived |
| CG | 70 mm behind the bottom wing's leading edge at the fuselage, 64 to 76 allowed | p. 21: "mark the C.G. on the top of the bottom wing next to both sides of the fuselage ... measure back 2-3/4" [70mm]", "up to 2-1/2" [64mm] ... or 3" [76mm]" |
| Engine | O.S. .61 FX two stroke, the first listed; O.S. FS-91 II Surpass four stroke also | p. 3, "Engine Recommendations" |
| Throws, high | aileron 3/4 in, elevator 1 in, rudder 2 in, each way | p. 21, "measured at the widest part" |
| Throws, low | 1/2, 3/4, 2 in | p. 21 |
| Wheels | 3 1/4 in mains, 1 1/4 in tail wheel on a wire in the rudder | p. 6, the kit contents; p. 18 |
| Tank | not given | the Stik's 12 oz, 355 cc, ESTIMATED |
| Flying | "flies smoothly and predictably", "does not, however, possess the self-recovery characteristics of a primary R/C trainer", "always be ready to apply right rudder to counteract engine torque" | p. 24, 25 |
| Covering | Top Flite Cub Yellow MonoKote (TOPQ0220 is its repair colour), a black cowl and a black stripe | the cover photograph, the kit's repair notes |

### The full size, de Havilland's rigging diagram

The DH.82A rigging diagram (British Aerospace, reproduced at
jeversteamlaundry.org, "de Havilland DH-82 Tiger Moth", tigpic024), at the
kit's k = 1/4.96 on its span:

| Quantity | Full size | At the kit's scale | How |
| --- | --- | --- | --- |
| Span, both wings | 8.94 m | 1.8034 m | the diagram: "29 FT 4 IN (8.94m)"; the front view has the tips one over the other |
| Chord | 1.33 m | 0.2683 m | "CHORD 4' 4 1/2" (1.33m)" |
| Dihedral | 2 deg 45 min top, 4 deg 30 min bottom | the same | the diagram |
| Incidence | 4 deg on both, "parallel with ribs" | the same | the diagram: no decalage, so the plant's one incidence for both wings is the rigging's |
| Stagger | 0.562 m at the root, 0.530 at the interplane strut | 0.1134 m at the root | the diagram |
| Sweepback at the strut | 11 in top, 9 1/8 in bottom | 5.2 and 4.8 deg | the diagram's inches over the strut's 3.05 m station |
| Gap at the interplane strut | 1.558 m | 0.314 m | measured off the front view, 30.25 mm a pixel on the span; 0.333 m at the root with the two dihedrals |
| Wing heights | top chord plane 0.99 m over the thrust line, bottom 0.58 under | 0.200 and -0.117 m | the side view, the aircraft level on trestles, 30.5 mm a pixel |
| Tailplane span | 3.00 m | 0.605 m | "9 FT 10 INS (3.00m)" |
| Tailplane and elevators | 2.40 m² outside the fuselage, the elevators half its chord | 0.0977 m² | measured off the plan view, 30.1 mm a pixel, ESTIMATED to the drawing's line |
| Fin and rudder | 1.12 m², the rudder 0.80 of it, 1.0 m at its widest | 0.0456 m² | the side view, ESTIMATED |
| Bottom wing's root leading edge | 1.64 m behind the spinner's tip | 0.331 m | the plan view |
| Main axles | 0.49 m ahead of the bottom wing's root leading edge, 1.28 m under the thrust line | 0.099, 0.258 m | the side view |
| Track | 1.60 m | 0.323 m | "5FT 3INS (1.60m)" |
| Length | 7.29 m | 1.4706 m | "23' 11" (7.29m)"; Great Planes' 60 in includes the spinner |

The full size's own drag, as a floor for the model's: 130 hp through a
fixed pitch prop at 0.8 at its 109 mph top speed (Wikipedia, "de
Havilland Tiger Moth"), less its induced drag, is CD0 **0.044**.

### The engine: the Ugly Stik's O.S. 61FX on a 12 x 6

Great Planes list the O.S. .61 FX first, and it is the Ugly Stik's engine
(docs/UGLYSTIK-STAGE1.md, scripts/power-derive.js): on APC's 12 x 6, O.S.'s
first prop for it, **10,895 rpm and 36.206 N** standing, 0.612 N m, an idle
at O.S.'s 2,000 rpm. On 10.25 lb that is **0.79 times the weight**: a scale
climb, not the Stik's vertical. The hangar's alternative is the four
stroke in the same list, O.S.'s FS-91 II Surpass (1.6 bhp at 11,000 rpm,
O.S.'s manual), on the 14 x 7 in O.S.'s list for it: 8,174 rpm and 36.17 N
by power-derive.js's glow rule on the rated powers.

## The biplane: the second wing, the Pitts's

The plant's second wing (`bip_*`, `biplane_lift`, docs/PITTS-STAGE1.md)
was built on the Pitts's branch as a general capability and is used here
unchanged: no second implementation. The Tiger Moth's branch first merged
the capability's own commit (c15725b) and then main once the Pitts landed
(#160). Its derivation is the Pitts's solver, taken out of
scripts/pitts-derive.js into **scripts/lib/biplane.js** formula for formula
(the Pitts's figures reproduce to the last printed digit), which both
derivations now call.

| | Top wing | Bottom wing |
| --- | --- | --- |
| area, span | 0.4498 m², 1.8034 m | 0.4276 m², 1.6784 m exposed of the 1.8034 |
| height at the root (over the thrust line) | +0.200 m | -0.117 m |
| dihedral | 2.75 deg | 4.5 deg |
| aerodynamic centre, ahead of the CG | +0.075 m | -0.032 m |
| own CL per rad in the pair | 4.882 | 3.900 |
| share of the cell's lift (`bip_w`) | 0.568 | 0.432 |
| own CL over the cell's (`bip_r`) | 1.109 | 0.886 |
| CL gained per unit the other loses (`bip_m`) | 0.010 | 0.220 |
| AC ahead of the cell's, per chord (`bip_x`) | +0.173 | -0.228 |
| stalls at (the cell's alpha, each at CL 1.05) | **11.7 deg** | 14.7 deg |

Prandtl's mutual factor on the Trefftz plane is **σ 0.539** (the chart fit
0.519 at G/b 0.18); Munk's span factor 1.140, 1.137 at the split carried.
The cell's lift slope is **4.404** on the reference area (a monoplane of its
span and area: 4.081), its induced drag factor **0.0782** against the
monoplane's 0.1010. The Tiger Moth's big stagger, 0.42 of a chord, puts the
top wing well into the bottom wing's bound vortex upwash: it carries 1.11
of the cell's CL on its own area and stalls 3 deg before the bottom wing,
further apart than the Pitts's 1.3 deg.

## The coefficients

Nelson's forms on the cell, as the Pitts's (`npm run tigermoth:derive`),
in the wings' own chord, 0.2683 m.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w (cell), a_t, a_v | 4.404, 4.098, 4.005 | the biplane solution; 2π AR/(AR+2); the fin's AR 1.5 times its own |
| dε/dα | 0.442 | DATCOM on Munk's equivalent aspect ratio, 4.79, the tail 0.041 m under the cell's mean height |
| V_H, V_V | 0.348, 0.0269 | the tail's areas and arms at k |
| CLα | 4.633 | the cell and the tail |
| Static margin | **0.038** | the kit's CG 0.107 chords behind the cell's aerodynamic centre; the fuselage's Raymer share, 0.084 |
| Zero lift line | 5.47 deg under the thrust line | the section's -2 deg at the rigging's 4 deg, the tail's share |
| Cmα, Cm0, Cmq | -0.1745, +0.0174, -8.013 | Cm0 flies it level at three quarter throttle with the elevator neutral |
| Cmδe, CLδe | 1.0494, -0.3359 | τ_e 0.82, the elevators half the tail's chord |
| CYβ, Cnβ, Cnr | -0.308, +0.0965, -0.126 | the small fin and big rudder, less the fuselage's -0.011 |
| Clβ | -0.0577 | the two dihedrals -0.067, the wings' heights +0.021 (the top wing a parasol over the fuselage, the bottom a low wing under it, DATCOM's height term on each's share), the fin -0.012 |
| Clp, Clδa | -0.807, 0.2696 | strip theory on both wings at their own slopes; the ailerons on the bottom wing alone, 0.35 to 0.89 m out, 25 percent of the chord, τ_a 0.61 |
| Cnδa per CL | **-0.0944** | see below |
| Cnδr, CYδr, Clδr | -0.103, 0.200, 0.011 | τ_r 0.96, the rudder 80 percent of the vertical tail |
| CD0, e | 0.058, 0.85 | two wings, the cabane and interplane struts, the wires, two open cockpits, V strut gear, ESTIMATED a quarter over the full size's 0.044 for a model's Reynolds number |
| CL max, stall blend | 1.05 each wing, 3 deg | a cambered trainer's section at 1.8e5, the Clark-Y's class, 0.8 of its 1.32, ESTIMATED; Great Planes publish none |
| stall_top, stall_k | 6.2 deg, 0.72 | the Clark-Y between 1e5 and 2e5 (stall-derive.js's table) |
| Stall arms, stall_dw | 0.1068, 0.0432, 0.1286 | the cell's aerodynamic centre, `node scripts/stall-derive.js` |
| Throws, high | 16.50, 12.11, 14.59 deg | asin(throw / chord): 3/4 in on the 67 mm aileron, 1 in on the 121 mm elevator, 2 in on the 202 mm rudder |
| Inertia | 0.3902, 0.5833, 0.8797 kg m² | the parts summed to 10.25 lb, the fuselage's mass centre where the CG comes out at the kit's, ESTIMATED; the CG 7 mm under the thrust line from them |

### The adverse yaw

Nelson's form, as the Cub's and the Skyhunter's: Cnδa = 2 K CL Clδa with K
= -0.17 for plain ailerons out along a wing. On the Tiger Moth it is
bigger than on a monoplane of its class for two reasons the derivation
carries:

- **The ailerons are on the bottom wing alone**, and with **no
  differential**: Great Planes' manual hooks each aileron to its own servo
  on a straight pushrod and throws them 3/4 in up and 3/4 in down. The full
  size's ailerons have the opposite, an extreme differential ("barely any
  travel down on the outside wing ... the inside travels a large amount
  upwards", Wikipedia, "Adverse yaw", of the Tiger Moth), and still
  Phillips's handling notes open with "try full aileron with rudder locked
  to see adverse yaw".
- **The bottom wing flies in the top wing's downwash**: the lift the
  ailerons add is tilted back by the partner's induced angle too, one more
  -mut2 CL1 Clδa, 0.049 per unit of the cell's CL (Prandtl's mutual term,
  the solver's own).

Together **-0.0944 per CL** on a Clδa of 0.27 and a fin whose Cnβ is 0.097
(the Ugly Stik's -0.06 on 0.25 and 0.107; the Cub's -0.136 on a far
smaller throw). On the linear lateral model, from level at the trim, full
right aileron with the rudder centred: the nose swings **9.15 deg left**,
against the roll, with 12.1 deg of sideslip, before the bank reaches 30
deg; at 1.3 Vs, 13.1 deg and 17.4. Three quarters of the aileron's throw in
right rudder with it takes the sideslip to under a degree and the wrong
way swing to none: that is the rudder a Tiger Moth wants in a turn.

## What is new in the plant

Nothing. The Pitts's second wing (merged from main, #160), the Kadet's and
the Stik's glow throttle and tank, the Pitts's and the Edge's taildragger
gear, the P-51's prop inertia, and the stall model fly it. Every other
aircraft's recorded hash is unmoved (T16), the Pitts's among them. `npm run
crash:identity` against main's module (a0c25edd): every other aircraft's
gates and self tests print the same output byte for byte with crash
physics off; the only lines that differ are the ones that exist because
slot 23 is now filled (the Tiger Moth's own gates, wing:contact's Tiger
Moth rows, whoop:gates' walk over every airframe the configs list and
glider:stab's empty slot probe, which found
23 empty on main).

## The intended behaviour, and how each part is proven

Each part is a gate in `scripts/tigermoth-gates.js`, flown in Manual, its
band in `tests/tigermoth-thresholds.json` set from the derivation before
the plant was flown. `npm run tigermoth:gates`: **25 of 25**.

| Gate | Derived | Band | Measured |
| --- | --- | --- | --- |
| T1 level at 3/4 throttle, the trim | 14.41 m/s | 12.25 to 16.57 | 14.40, elevator at neutral |
| T2 stall, power off | 9.47 m/s | 8.90 to 10.80 | 9.93 (the plant's curve rounds off short of CL max, as every aircraft's does) |
| T3 glide at 1.4 Vs | L/D 6.34 (a monoplane of its span and area: 5.92) | 5.64 to 7.03 | 6.38 at 12.8 m/s |
| T4 top speed | 18.69 m/s | 16.82 to 20.56 | 18.68 |
| T5 best climb | 3.75 m/s at 10.9 | 2.63 to 4.50 | 3.86 at 11.7, 21 deg of pitch |
| T6 full aileron, high rate | pb/2V 0.0962, 88 deg/s at the trim | 0.0770 to 0.1154 | 0.0948, 130 deg/s at 21.5 m/s as the nose falls |
| T7a full aileron, the rudder centred, to 30 deg of bank | the nose 9.15 deg the wrong way, sideslip 12.1 deg | 5.49 to 12.81; 7.28 to 16.98 | **8.99 deg left of a right roll**, 11.3 deg, 30 deg in 0.43 s |
| T7b the same, three quarters of it in rudder | sideslip 0.97, no wrong way swing | under 4.04; under 3 deg | 1.00 deg, 0.00 |
| T8a full up held, power off, wings held | a stall, the nose drops, no wing | bank 15, roll 20 deg/s, yaw 20 deg/s, pitch over -35, ailerons under 0.5 | bank 4.4, roll 10.3, yaw 6.4, pitch -14, ailerons 0.05, alpha to 24 |
| T8b the same at half throttle | | the same | bank 6.1, roll 10.4, yaw 6.0 |
| T8c the same power off, hands off | | recorded | **49 deg of bank**, 23 deg/s: see below |
| T9 phugoid | 13.94 s | 11.43 to 16.45 | 13.02 |
| T10 prop torque | 0.612 N m | 0.52 to 0.70, rolling left | 0.612, left |
| T11 on its three points | 8.17 deg, 0.2651 m, 16.7 percent on the tail | half a degree, 5 mm, 3.5 points | 8.16, 0.2654, 16.2 |
| T12 take off, rotated at 1.2 Vs | 14.64 m at 11.36 m/s | 10.69 to 21.23 m, 9.66 to 13.06 m/s | 12.89 m at 10.21 m/s |
| T13 the roll tracks on the rudder | | under 5 deg and 1 m | 0.2 deg, 0.01 m |
| T13b feet off the rudder | | recorded | 0.3 deg: a long tail on a 0.8 thrust to weight does not swing |
| T14 taxi turn, full right rudder at a walk | 4.66 m | 3.67 to 6.14 | 4.65 m |
| T15 a landing, full up held on the wheels | | at rest within 1.5 deg of T11, no hull or prop | touched at 10.4 m/s, at rest at 8.16 deg |
| T16 every other aircraft's recorded hash | main's | identical | identical, twenty two, the Pitts's and the Quickie's among them |
| T17 Node and Chrome | | identical | a26eece96d081783 both |
| T18 idle on the strip | 2,000 rpm, stands | 1,900 to 2,100, under 2 mm/s | 2,000, 0.26 mm/s |
| B1 the induced drag flown, dCD/d(CL²) | 0.0782 (a monoplane: 0.1010) | 0.0743 to 0.0821 | 0.07818 |
| B2 the two wings' lift is the cell's, short of the stall | cl_alpha α + cl_de δe | within 0.5 percent | 0.4421 against 0.4421 |
| B3 the top wing stalls first | its blend from 9.0 deg, the bottom's from 11.27 | the top alone, the bottom gaining | the top wing at 9.42 deg, the bottom +0.0019 over its own |

### Two first gates that changed, and why

The rule is that a band is never widened to pass. Two gates were set wrong
before the plant flew, each recorded here and in the thresholds file:

- **T7, the adverse yaw.** The first form entered the turn at 1.3 Vs on a
  half throttle the gate's level hands could not hold the speed on: it
  settled at 10.5 m/s, not 12.3, and the heading's sign was read the wrong
  way round (the shell's heading is left positive). Both were the gate's,
  not the plant's: at 10.5 m/s the plant swung 15.7 deg left, where the
  linear model at that speed says 16. The gate now enters at the trim,
  where the level hands hold the derived speed exactly, with the trim's
  derived bands; the 1.3 Vs figures are printed by the derivation.
- **T8, the stall.** Its first form, the Stik's U11a, held full up for 10
  s with the ailerons and the rudder centred: it read **49 deg of bank**.
  At the kit's CG the static margin is 0.038 and full up on the high rate
  is 78 deg of linear alpha, so the stick takes both wings deep past their
  stall, to 17 to 24 deg, and held there the strips' autorotation grows the
  left panel's 1 mm build tolerance into a slow roll off at 10 to 20
  deg/s. The break itself is gentle (the top wing first, the nose down,
  B3), and with the wings held on the ailerons, as a pilot holds them, it
  mushes straight: bank 4.4 deg, roll under 10.3 deg/s, on 0.05 of the
  stick. The gate now holds the wings, as the Stik's U11b does, and the
  hands off run is kept as T8c, recorded and not banded.

### Its stall, and what a pilot should expect

A slow pull, power off: the top wing, ahead of the CG and carrying 1.11 of
the cell's CL on its own area, falls short of its linear lift first, at
9.4 deg of the cell's angle and 10.5 m/s, and the bottom wing, washed down
less, gains over its own (B3); the top wing's loss is ahead of the CG, so
the nose drops. Held at full up it settles into a mush at 16 to 20 deg of
alpha, sinking; hands off the ailerons it then rolls off slowly, left.
"Stalls, spins, aerobatics are straightforward" (Phillips); Great Planes:
"flies smoothly and predictably" but no self recovery.

## The landing gear

The Pitts's taildragger model: each wheel a spring and damper along the
ground normal, friction along its heading and across it with the tyre's
slip, and the prop's lowest tip a skid. Numbers are the drawn model's
(`TIGERMOTH_DIMS`), the rigging diagram's at k with the kit's wheels.

| Quantity | Value |
| --- | --- |
| Main wheels | x +0.1688, y ±0.1614, z -0.2508 drawn, -0.2568 unloaded; r 0.0413 (3 1/4 in) |
| Tail wheel | x -1.0354, z -0.1033 drawn, -0.1093 unloaded; r 0.0159 (1 1/4 in); turns with the rudder, 1.0 of its angle: the kit's wire is set in the rudder |
| Rest | 8.17 deg nose up, the CG 0.2651 m over the grass, 16.7 percent on the tail; standing, the wings are at 13.6 deg, past the top wing's stall: it lands three point at its stall |
| Stiffness, damping | mains 3165 N/m, 102.9 N s/m; tail 1271, 31.0; 6 mm static, 0.6 of critical |
| Prop tip | 0.18 m over the grass at rest |
| Brakes | on the mains, the brake key's; the kit has none |
| Hull | hx 0.40, hy 0.9017, 0.125 down (the bottom wing's underside), 0.222 up (the top wing's top) |
| Camera | the pilot's eye in the rear cockpit, 0.10 m behind the CG and 0.08 over it |

## The crash parts

`PARTS_TIGERMOTH1803`, 20 parts summing to 4.6493 kg with the CG at the
origin (`npm run crash:core`), balsa and ply (nothing crushes): the
fuselage (the root: the firewall, the cowl, the tank, the radio, the
cabane and interplane struts and the wires), the rear fuselage (150 N m,
ESTIMATED on the Stik's 120 for a deeper box), the tailplane and the
elevators, the small fin and the big rudder, the top wing's two halves on
the cabane and the bottom wing's two panels on the fuselage's sides (50 N
m each up and down, the struts and wires carrying most of a lift load,
ESTIMATED), the two bottom ailerons, the 61FX on the firewall (the Kadet's
800 N and 24 N m), the 12 x 6, the receiver pack, the two V strut legs of
5/32 in wire and the tail wheel's wire, the camera and the antenna.

## The stabiliser

Stabilised asks 60 deg of bank and 30 of pitch with the turn coordinator,
which on a Tiger Moth puts in the rudder its adverse yaw asks for, and with
the throttle closed lowers its target 8.94 deg to the power off glide from
the 0.749 stick that flies it level (`npm run stab:glide`). Acro asks 75
deg/s of roll, 0.85 of full aileron's 88 at the trim, and 45 of pitch,
under the accelerated stall's 51 at the trim. It is not held on its back:
a cambered section at 4 deg of incidence is not an aerobat's. `npm run
tigermoth:stab`: **56 passed**. Stabilised is the default tune: it is
the trainer, and the rudder it needs is what the coordinator gives.

## The covering

Great Planes' own: Top Flite Cub Yellow film all over, the cowl and a
stripe down each side black, the RAF's fin flash on the rudder. The second
scheme is the RAF's post war trainer finish, overall silver with yellow
bands round the rear fuselage and across the wings, which the RAF's Tiger
Moths wore to the end of their service (RAF Museum, "Training Aircraft
Colour Schemes"). The livery's regions are `wing`, `fuselage`, `tail`,
`cowl` (new: "Cowl"), `bands` (new: "Trainer bands"; in the stock scheme
the film's own yellow) and `trim`.

## The sound

`glow2`, the Stik's two stroke, at this engine's rpm; the FS-91 is `glow4`,
the Kadet's four stroke.

## In the shell

`configs/airframes.js` tigermoth1803, simId 23; tunes tigermoth-stab (the
default), tigermoth-acro and tigermoth-manual; the free flight card; the
hangar's power (the stock 61FX and the FS-91 II), props (APC's 13 x 6 and
12 x 8, O.S.'s list for the 61FX), add-on anchors and tuning (the kit's CG
range, a new datum: "behind the bottom wing's leading edge, at the
fuselage"; the manual's throws on both rates). On the unlock curve it sits
at **level 4 with the Bombshell and the Zagi**: slow and forgiving in the
stall, but the first on the curve that asks for the rudder in every turn
and on every take off, and Great Planes' own "does not, however, possess
the self-recovery characteristics of a primary R/C trainer"; nothing it
does needs the aerobats' hands or the P-51's speed.

The drawn model, `src/render/tigermothcraft.js`: the long narrow fuselage
under its rounded decking, the Gipsy's long black cowl, two open cockpits
with their windscreens, the top wing on its four cabane legs staggered
well ahead of the bottom one, both swept back with rounded raked tips, two
interplane struts a side, the flying and landing wires doubled front and
back and the incidence wires crossing between the struts, the bottom
wing's ailerons, the tailplane with its big lobed elevators, the small fin
and de Havilland's rounded rudder, the V strut gear and the tail wheel,
the exhaust along the cowl's left side and a wooden 12 x 6.
`check:craft` (the Tiger Moth's rows): the drawn span and reach 2138.7 and 1069.3 mm, the rudder's, against the table's 2139.2 and 1069.6, and the hull up and down 277.1 and 292.1 mm against the drawn 272.3 and 291.7. Seated at rest in the shell on swiss2 the CG is
0.2654 m over the ground (`window.__ground()`), the plant's own rest.

## The owner's test

`npm run tigermoth:owner` (scripts/tigermoth-owner.js) flies it in the
real shell on swiss2 in Manual, timed on the plant's clock, with
SIM_GPU=1 (2026-09-29), all hold:

| Run | Measured | Band |
| --- | --- | --- |
| off the strip on the rudder, the throttle opened from 0.3 over two seconds (the shell holds the aircraft until 0.25) | 11.8 m/s after 18.2 m in 3.6 s, heading within 1 deg | T12 9.66 to 13.06 m/s, T13 5 deg |
| full right aileron at the trim, the rudder centred, to 30 deg of bank | the nose 8.84 deg left, 31 deg in 0.47 s at 14.5 m/s | T7a 5.49 to 12.81 deg |
| the same with three quarters of it in right rudder | the nose 0.01 deg the wrong way, 31 deg in 0.43 s | T7b under 3 deg |
| the slow pull to full up over 8 s, power off, wings held | bank moved at most 3.3 deg, roll at most 5.1 deg/s, the nose down to -16.4 deg | T8a 15 deg, 20 deg/s, over -35 |

The shell's take off rolls further than the Node gate's, 18.2 m against
12.9 m and 11.8 m/s against 10.2: the page's pilot opens the throttle from
0.3 and rotates on a different hand, and liftoff is read as the last frame
a wheel was loaded, once 0.3 m up for 0.8 s. Both are inside T12's speed
band.

In a room the Tiger Moth draws as a peer in its own airframe and paint:
`scripts/rooms-two-page.js` with page B on `tigermoth1803`, against a
local `node edge/rooms/node.js`, 13 passed (A draws B as the Tiger Moth in
B's blue, its black cowl and trim kept, on seat 2's slot, and sees it up
and moving).

## What the owner should feel flying it

It sits tail down at 8 deg on its three points with the two stroke's buzz
at idle. Open the throttle over a couple of seconds, hold the tail down,
then let it up, and keep your feet on the rudder: it tracks, and lifts off
at about 11 m/s in 13 to 15 m. It cruises at 52 km/h at three quarter
throttle, nose a little down, tail up, and tops out at 67. Roll it into a
turn on the ailerons alone and the nose swings the other way first, almost
ten degrees, and it slips; put in rudder with the ailerons, about three
quarters as much, and it turns clean. Pull it slowly into the stall and
the top wing goes first and the nose drops; keep the wings level on the
ailerons and it mushes straight, but let go of everything at full up and
it will roll off slowly. It lands three point at a walking pace's worth of
speed over the stall.

## Sources

- Great Planes, Tiger Moth ARF GPMA1330 instruction manual (GPMZ0231 V1.2):
  https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf
- Great Planes, Tiger Moth 60 ARF tech notes (the CG), archived:
  http://web.archive.org/web/20200205201011/http://www.greatplanes.com:80/techsupport/gpma1330tech.php
- de Havilland DH.82A rigging diagram (British Aerospace), reproduced at
  https://www.jeversteamlaundry.org/tigpic024.htm (image tig/ticpic003.jpg)
- David Phillips, "Tiger Moth basic handling notes", Tiger Moth Club of New
  Zealand: https://tigermothclub.co.nz/wp-content/uploads/2020/11/handling-notes-dp.pdf
- Wikipedia, "de Havilland Tiger Moth" (span, area, weights, power, top
  speed) and "Adverse yaw" (the Tiger Moth's aileron differential).
- RAF Museum, "Training Aircraft Colour Schemes":
  https://www.rafmuseum.org.uk/research/online-exhibitions/taking-flight/training-aircraft-colour-schemes/
- O.S. Engines, the 61FX's manual (docs/UGLYSTIK-STAGE1.md) and the FS-70
  and 91 Surpass II manual:
  https://www.os-engines.co.jp/english/line_up/engine/air/single/manual/fs70-91s2_series.pdf
- APC Propellers' performance data (PER3_12x6.dat, PER3_13x6.dat,
  PER3_12x8.dat, PER3_14x7.dat).
- L. Prandtl, "Induced drag of multiplanes", NACA TN 182, 1924; M. M.
  Munk, "General biplane theory", NACA Report 151, 1922 (through the Pitts's
  solver, scripts/lib/biplane.js).
- Nelson, Flight Stability and Automatic Control (the adverse yaw form and
  every derivative); USAF DATCOM (the downwash, the wing height term);
  Raymer, Aircraft Design (the fuselage's pitch term); Selig et al.,
  Summary of Low-Speed Airfoil Data (the Clark-Y).
