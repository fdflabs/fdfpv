# P-51D Mustang, stage 1: the aircraft, the model and what it is meant to do

The owner asked for eleven all time great RC airplanes; this is the P-51
Mustang, airframe 15 (`p51d1450`). This file gives every number the plant
is built from with its formula and source, the three things the plant
could not do before and now does for any aircraft, how each part of the
flight feel is gated, the gear and its retracts, the crash parts, the
scheme, the power, and the check table with its bands. It follows
`docs/KADET-STAGE1.md` and `docs/TIMBER-STAGE1.md`, and uses the same
plant, `src/native/plant_wing.c`, with a table of its own.

## The aircraft: FMS's 1450 mm P-51D Mustang V8

Of the kits the brief named (FMS 1450 mm, E-flite P-51D, Top Flite giant
scale) the FMS is the one whose maker publishes what the plant needs:
its product page and manual give the span, length, weight, wing area,
wing loading, CG, motor, prop, ESC, battery, every control throw at both
rates, the flap throws, and the retracts and flaps themselves. It is also
the most flown of the three: the owner's club will have seen one. The
Top Flite is a builder's kit whose weight depends on the builder and its
engine; the E-flite publishes less. The FMS it is.

FMS's own figures (fmshobby.com's product page, and its manual,
"P-51D Mustang V8 Operating Manual"):

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.450 m | FMS, 1450 mm |
| Length | 1.240 m | FMS |
| All up mass m | 2.350 kg | FMS, "Flying Weight ~2,350g" |
| Wing area S | 0.354 m^2 | FMS, 35.4 dm^2 |
| Wing loading | 65.1 N/m^2 | derived; FMS's 66 g/dm^2, the same |
| CG | 110 mm behind the leading edge where the wing meets the fuselage | FMS manual p. 26, no range |
| Motor, ESC | 4250 540 kV, 80 A | FMS |
| Prop | 14 x 8 four blade | FMS |
| Pack | 4S 2600 25C | FMS, "Recommended Battery" |
| Throws, low rate | aileron 17 mm, elevator 24, rudder 21 | manual pp. 19 and 20: "Low rates are for normal flying" |
| Throws, high rate | aileron 28 mm, elevator 40, rudder 25 | the same |
| Flaps | 22 mm mid, 45 mm full, at the fuselage | manual p. 20 |
| Retracts | two servoless mains, a servoless tail wheel, a "Sequencer-6 sec P51" | the manual's spare parts list |
| Flight time | "Approx. Flying Duration 8 minutes"; a four minute timer for the first flight | product page, manual p. 27 |

The kit is the full size P-51D to its span. The full size's published
geometry (Aviation magazine, July 1944, "Design Analysis of the P-51",
its table of leading particulars, archived at legendsintheirowntime.com)
scaled by 1.450 / (37.03 ft) = 0.12847 gives the rest; 233.19 sq ft of
wing scaled is 0.3575 m^2 against FMS's 0.354, so the kit is scale to one
percent:

| Quantity | Full size | Kit | How |
| --- | --- | --- | --- |
| Taper | 0.499 | 0.499 | the chord straight from 0.326 m at the centreline to 0.163 m at the tip, FMS's area over the span |
| Quarter chord line | square to the fuselage | the wing's aerodynamic centre wherever it is measured | Aviation |
| Dihedral | 5 deg on the quarter chord line | 5 deg | Aviation |
| Incidence | about +1 deg at the root, -58 min at the tips | +1 deg to -0.97 deg, washout 1.967 deg | Aviation, "Each wing section has a 58' negative angle of incidence at the wing tips" |
| Section | NAA/NACA low drag (the 45-100 family), 15.1 percent root, 11.4 near the tip | the same | Aviation, and the P-51's own literature |
| Stabiliser | 13 ft 2 1/8 in, 30 in chord, 27.85 sq ft with 13.05 of elevator, +2 deg | 0.516 m, 0.098 m, 0.0427 m^2 | Aviation |
| Fin and rudder | 8.83 and 10.25 sq ft | 0.0293 m^2, the rudder 54 percent | Aviation |
| Tread, wheels | 11 ft 10 in, 27 in mains, 12.5 in tail wheel | 0.463 m, 88 and 41 mm | Aviation |
| Main gear | retract inward into the wing, the tail wheel into the fuselage, steerable | the same | Aviation |

The stations, the heights over the CG and the gear's legs are the kit
manual's own side view, fig. 76 (p. 23), whose spinner to rudder, 1,755
pixels at 300 dpi, is the full size's 32 ft 2 3/8 in, so a pixel is
0.7196 mm of the kit. `scripts/p51-derive.js` reads them off it and names
each pixel coordinate.

### The motor: 540 kV on a 14 x 8 four blade

No static thrust or current is published, so they are the motor's balance
on the pack, ESTIMATED: the 14 x 8 four blade's static coefficients as an
APC 14 x 8E's (the UIUC propeller data: C_T 0.10, C_P 0.045) times 1.4 and
1.7 for four blades, turned on the 540 kV motor where its back EMF and the
resistance of the motor (0.020 ohm), the ESC (0.003) and the pack (0.008
a cell) balance the 14.8 V: 6,351 rpm, 55.2 A, 632 W on the shaft and
30.7 N. 55 A is inside FMS's 80 A ESC. The pitch speed is the plant's rule,
0.85 of the 7,992 rpm no load times the 8 in pitch, 23.0 m/s.

| Quantity | Value | How |
| --- | --- | --- |
| Static thrust | 30.7 N | the balance above |
| Pitch speed | 23.006 m/s | 0.85 x 540 x 14.8 rpm x 8 in |
| Current, full static | 55.2 A | the balance |
| Torque arm | 0.0158 m | ideal disc power 345 W at 6,793 rpm is 0.485 N m at 30.7 N, the Kadet's method |
| Thrust line | 12.9 mm over the CG | the side view |
| P factor | 1.6 | the Cub's blade element figure at 0.75 R, docs/CUB-STAGE1.md |
| Prop inertia j_prop | 0.00117 kg m^2 | four 25 g blades as rods from the hub (m L^2 / 3), the spinner, 60 g at 30 mm, and the motor's bell, 100 g at 25 mm, ESTIMATED |

**The stock P-51 is not fast**, and that is the kit, not the plant: level
at full throttle it does 20.6 m/s derived, 19.8 flown, gear up. FMS's
owners say the same ("In stock form (540kv motor), it was barely adequate
in speed and power", HobbySquawk's FMS P-51 V8 thread; "It is rather
slow", its "Need for Speed" thread). What it has is the heaviest wing
loading in the hangar and a clean airframe, so it keeps its speed: the
energy gate, P7, is that. The fast one is the owners' upgrade, offered in
the hangar: FMS's 4258 650 kV from the 1400 mm P-40 on the same prop, 36.5
N and 78 A static, 27.7 m/s pitch speed, 23.3 m/s level (power:check P7).

## The coefficients

The Kadet's method, in the plant's reference chord S/b = 0.2441 m. Per
radian. `npm run p51:derive` prints every one.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 4.665, 4.757, 2.851 | 2 pi AR/(AR+2), the wing's times cos^2 of its dihedral |
| CL alpha | 4.960 | a_w + a_t (S_h/S) eta (1 - d eps/d alpha), eta 0.9, DATCOM's downwash 0.429 with the stabiliser 0.10 m over the wing's chord plane |
| Static margin | 0.034 | V_H 0.342; the long nose's own moment (Raymer eq. 16.25, K_fus 0.007 per deg) takes 0.015 of it; FMS's 110 mm is 37.5 percent of the mean chord |
| Zero lift line | 1.28 deg under the thrust line | a 6 series section's 1.3 deg under its chord at the wing's mean incidence, 0.13 deg, and the tail's share |
| Cm alpha, Cm q | -0.1684, -8.305 | -CLa SM; -2 eta a_t V_H l_h / c |
| Cm0 | +0.0183 | level at three quarter throttle, gear up, elevator neutral, the thrust line's moment included (the manual's trim flight, taken at the cruise since half stick is half the pitch speed, 11.5 m/s, under the stall) |
| Cm de, CL de | 1.168, -0.412 | tau_e 0.80 for the elevator's 47 percent (thin aerofoil) |
| CY beta, Cn beta, Cn r | -0.336, +0.0992, -0.1202 | the fin, less the long fuselage's -0.0160 (Nelson eq. 2.64) |
| Cl beta | -0.0925 | the dihedral's, the fin's, and the low wing's +0.0189 (DATCOM) |
| Cl p, Cl da | -0.648, 0.2270 | strip theory; the ailerons 0.45 to 0.68 m out, 22 percent chord, tau 0.49 |
| Cn dr, CY dr, Cl dr | -0.0969, +0.1982, +0.0177 | tau_r 0.84 for the rudder's 54 percent |
| CD0, e | 0.030 clean, 0.038 with the gear down, 0.80 | ESTIMATED: a painted foam warbird; the gear's 0.008 its two 88 mm wheels, legs and doors at a wheel's 0.25 on frontal area and the doors |
| CL max, stall blend | 1.05, 3 deg | the UIUC low speed data's 15 percent NACA 2415 at 2e5, 1.22, times 0.9 for the wing and less for a laminar nose, ESTIMATED |
| stall_top, stall_k | 4.2 deg, 0.76 | the NACA 2415's UIUC curve at 2e5, standing for the laminar section as scripts/stall-derive.js's table does for every kit |
| Stall arms, stall_dw | 0.1303, 0.0254, 0.1347 | the CG 31.8 mm behind the quarter chord line; the plate's centre of pressure at 0.40 of the mean chord; eta V_H a_t (d eps/d alpha)/a_w |
| Washout | 1.967 deg | the full size's, NOT fitted (every other aircraft's is, docs/STALL-STAGE1.md) |
| strip_c | 1.2507, 1.0836, 0.9164, 0.7493 | the 0.499 taper |
| strip_k | 1.0, 0.9548, 0.9055, 0.8503 | below |
| Flaps | half 16.34 deg, full 35.12 deg | FMS's 22 and 45 mm on a 78 mm flap (a quarter of the 0.313 m chord at the fuselage) |
| Flap lift, CL max, drag, moment | cl_df 1.5431, cl_df2 -0.9665, clmax_df 0.7370, cd_df2 0.1520, cm_dcl_f 0.1959 | the Timber's method for a plain flap over the inner 56 percent of the area: DATCOM's plain flap factor 0.80 at 16 deg and 0.60 at 35, Raymer eq. 12.21 (0.9 x 0.9 S_f/S) and eq. 12.61 (F 0.0144) |
| Flap servos | 3 s across, no elevator mix | FMS's "slow motion flap servos", ESTIMATED; FMS gives no mix |
| Inertia | 0.129, 0.163, 0.282 kg m^2 | ESTIMATED: the wing a 0.62 kg bar with 0.10 kg retracts a side at 0.23 m, the motor, prop and spinner 0.33 kg 0.33 m ahead, the pack 0.29 kg 0.12 m ahead, the tail 0.11 kg 0.69 m back, the fuselage along its 1.24 m |
| Throws | aileron 19.8769, elevator 25.8721, rudder 12.1224 deg | FMS's low rates, arcsine of 17/50, 24/55 and 21/100 mm on the scaled surfaces' widest chords (ESTIMATED chords); the manual's high rates stay in the hangar's rate switch's reach as its own publication |

## What is new in the plant

Three table fields, each zero on every existing aircraft and read behind
a branch, so every other aircraft's arithmetic is untouched. They are
general: any aircraft can set them.

**1. The prop as a gyroscope (`j_prop`).** The prop's, spinner's and
bell's moment of inertia about the shaft. At the motor's rate it carries
angular momentum H = J Omega along body x, forward for a prop turning
clockwise seen from behind (the sense every table's `torque_arm` already
answers), and the airframe answers a turn of it: M += -omega x H, which is
M_y -= r H and M_z += q H in the body frame. Raising the tail on the take
off roll, a nose down pitch rate, yaws the nose left, J Omega q: 0.416 N m
at 0.5 rad/s on this aircraft, as much as full rudder holds at 9 m/s. It
is added to the step's moments before the rates, in `plant_wing_step`,
after the P factor.

**2. Retracts (`gear_time`, `cd_gear`, and `retract` on a wheel).** The
gear is selected up or down (`sim_wing_set_gear`, 1 or 0; SIM_ERR_BAD_ARG
for up on an aircraft without retracts), travels between them at
1/gear_time a second, and `sim_wing_gear` reads where it is, 0 down and
locked to 1 up; `sim_wing_gear_selected` reads the switch. A reset and an
airframe change put it down and locked. The table's cd0 is the gear down;
as it folds `cd_gear` of it goes. A wheel whose `retract` is 1 carries
nothing unless the gear is down and locked (sim.c, `ground_wheels`), so
with it up, or on its way, the aircraft meets the ground on its hull: the
belly. In crash.c a gear leg that carries a retracting wheel is `stowed`
while the gear is not down: its samplers, its obstacle contacts and the
part a contact is laid on leave it out, and the samplers are rebuilt when
the gear moves. Its mass and joint stay.

**3. The section along the span (`strip_k`).** Past the stall the wing is
four strips a side (docs/STALL-STAGE1.md). Each carried r of the wing's
lift (Schrenk) and all had one section, so the most loaded strip stalled
first, which on a 0.5 taper is the middle of the semispan and not the
outer wing. A tapered laminar wing's outer sections are thinner and at a
lower Reynolds number, so their CL max is lower; `strip_k` is each strip's
section CL max over the root strip's, and the strip nearest its own limit,
its k over its r, stalls at the table's stall angle and the others later
by their ratio, so the wing's CL max is unchanged. For the P-51: the
Reynolds number's share, 0.12 of CL max per halving of it (the UIUC low
speed data between 1e5 and 3e5), and the thickness's, 0.022 a percent
(Abbott and von Doenhoff, the 63 and 64 series between 12 and 15
percent), give 1.0, 0.955, 0.906, 0.850; the strip at 5/8 of the semispan
stalls first, then 3/8 and 7/8, the root last. With the full size's 1.97
deg of washout the tip strip still goes before the root. That is the wing
drop.

**What is not here: the prop wash.** The spiral slipstream on the fin,
which on a real RC P-51 is much of the swing on the ground roll, is
airframe 14's (the Extra 300) to build. Nothing here touches the fin's
flow. When it lands, the P-51's swing grows and P14 and P15 will need
their pilot's anticipation reconsidered; their bands are signs and a
lower bound, so they should hold.

How much each gives on the take off roll (`p51:derive`, "roll yaw"): at
5 m/s tail down P factor is 0.061 N m nose left against full rudder's
0.161; at 8 m/s 0.082 against 0.41; the torque's load on the left wheel,
0.039 N m through its rolling resistance; the gyroscopic kick 0.42 N m at
a 0.5 rad/s tail raise. The tail wheel's grip holds all of it until the
tail comes up, which is when the swing arrives, as it does on the real
aircraft.

## The intended behaviour, and how each part is proven

Each is a gate in `scripts/p51-gates.js`, flown in Manual. Bands are the
derived figure's in the Kadet's and the Timber's proportions, never
widened to pass.

| Check | Derived | Band | Measured |
| --- | --- | --- | --- |
| P1 level at 75 percent, gear up | 15.06 m/s | 13.25 to 16.87 | 15.16 |
| P2a stall, power off, clean | 10.06 m/s | 9.46 to 11.47 | 10.84 |
| P2b stall, power off, full flap | 8.41 m/s | 7.91 to 9.59 | 8.19 |
| P3 glide at 13 m/s, gear up | L/D 11.13 | 9.91 to 12.47 | 11.17 at 13.04 m/s |
| P4 top speed, gear up | 20.64 m/s | 18.78 to 23.12 | 19.80 |
| P4b what the gear down costs | 0.45 m/s | 0.2 to 0.8 | 0.49 (19.31 down) |
| P5 best climb | 6.57 m/s at 12 | 4.93 to 8.21 | 5.96 at 13.4 m/s |
| P6 full aileron roll, pb/2V | 0.1216 (144 deg/s at 15 m/s) | 0.091 to 0.152 | 0.1368 |
| P7 throttle closed from top speed, height held, after 3 s | 17.10 m/s (the Kadet: 12.72) | 16.2 to 18.0 | 16.81 from 20.05 |
| P8 full up, power off, from 1.2 Vs: a wing drops | an outer strip stalls first | at least 20 deg within 3 s of the break | 60.7 deg, left wing |
| P9 phugoid | 11.43 s, damping 0.41 | 9.40 to 13.30 | 11.67, one cycle before it is gone |
| P10 prop torque, static | 0.485 N m disc, 0.95 shaft | 0.41 to 1.08, rolling left | 0.485, rolling left |
| P11 P factor at 8 m/s, 10 deg nose up, full throttle | 1.6 T (-w)/Omega | 2 percent, nose left | 0.06307 against 0.06307 |
| P12 gyroscopic yaw at q 0.5 rad/s, full throttle | J Omega q | 2 percent, nose left | 0.41616 against 0.41616 |
| P13 standing on three points | 13.09 deg, CG 0.228 m, tail 18.3 percent | 12.09 to 14.09 deg, 0.223 to 0.233 m, 13 to 23 percent, no hull | 13.13 deg, 0.2291 m, 17.2 percent |
| P14 take off, heading held on the rudder | 8.80 m, 11.51 m/s | 6.6 to 13.2 m, 10.35 to 13.8 m/s, within 5 deg, right rudder | 11.35 m, 12.31 m/s, within 3.5 deg, mean stick +0.079 (right) |
| P15 take off, rudder left alone | swings left | at least 3 deg left at liftoff | 7.9 deg left |
| P16 retracts | 6 s each way | 0.05 s, refused without retracts | 6.001 s up and down |
| P17 landing with the gear up | on the belly | hull contact, no wheel load, stopped | hull 2, prop tip 55 N, wheels 0 |
| P18 full flap approach at 1.3 Vs (10.94 m/s) | touch under 11.6 m/s | on the wheels, at rest at P13's pitch | 8.24 m/s, rolled 28 m, 13.13 deg |
| S17 other aircraft unmoved | main's hashes | identical | identical, the Kadet's included |
| S18, S18b Node and Chrome | | identical | 6ad367538a476ead (the take off), 3dd9471990f40440 (gear up, the stall), both |

`npm run p51:gates`: 23 of 23.

P14's pilot holds the heading on the rudder, 2.0 of stick per radian of
heading and 0.4 per rad/s, and feeds in right rudder as the tail comes up,
1.3 of stick per rad/s of nose down pitch rate: the prop's J Omega, 0.83 N
m s, over what full rudder holds at 10 m/s, 0.64 N m. Without that
anticipation the same pilot holds it to 6.5 deg; with it, 3.5. That is
the rite of passage: the pilot who waits for the swing is late.

P8's wing drop: full up held from level at 1.2 Vs, power off, the stall
breaks at 0.49 s and the left wing, which `stall_asym` (a millimetre of
trailing edge on the 0.244 m chord, stall-derive's build tolerance) stalls
first, drops 60 deg; held, it rolls on into an incipient spin. The Kadet's
S9 at the same test mushes with its wings level.

## The stabiliser

`npm run p51:stab`, 88 passed: the Timber's cases with the P-51's gains.
Stabilised asks 60 deg of bank and 30 of pitch (roll 2.0 and 0.20, pitch
5.0 and 0.5), and with the throttle closed lowers its pitch target by
3.14 deg to the power off glide from the 0.769 stick that flies it level
with the gear down (`npm run stab:glide`, derived). Acro asks 120 deg/s of
roll, 0.7 of full aileron's 168 at 17.5 m/s, and 60 deg/s of pitch, the
most it pulls at 16 m/s short of its stall (2.5 g; full up at speed snap
rolls it, which is the P-51's accelerated stall and Acro keeps the pilot
out of). On its wheels every mode flies as Manual, so the swing is the
pilot's in all three: `p51:stab` holds that it swings left in each with
the rudder alone and tracks with the take off pilot's rudder, and the
retracts' switch, travel, refusals and resets, and the belly on the grass
when the gear comes up standing. `npm run stab:chop`: sink 1.454 m/s at
14.23 against the derived 1.485.

## The landing gear

The Cub's model: a spring and damper along the ground normal, friction
along the heading and across it with the tyre's slip, and the prop's
lowest tip a skid, which does not retract. Numbers are the drawn model's
(`P51_DIMS`), held against it by `craft-preview.js`.

| Quantity | Value | How |
| --- | --- | --- |
| Main wheels | x +0.0633, y +-0.2317, z -0.2051 drawn, -0.2131 unloaded; r 0.0441 | the side view and the full size's tread and wheels, scaled |
| Tail wheel | x -0.5639, z -0.0826 drawn, -0.0886 unloaded; r 0.0204; steers with the rudder, one to one | the same |
| Rest | 13.13 deg nose up, the CG 0.2291 m over the grass, 17 percent on the tail | measured, P13; derived 13.09, 0.228, 18 |
| Stiffness, damping | mains 1177 N/m, 44.6 N s/m; tail 704 N/m, 21.9 N s/m | 8 and 6 mm of static deflection, 0.6 of critical |
| Nose over angle | 27 deg | the main contact 0.118 m ahead of the CG, 0.229 m under it |
| Prop tip skid | x +0.3578, z -0.1649 | the 14 in prop's tip, under the belly's 0.129 |
| Hull | hx 0.36, hy 0.725, 0.1293 down, 0.1365 up | the scoop's bottom and reach and the canopy: 0.45 fore and aft put the box's tail corner in the grass at 13 deg of rest, found by P13 |
| Retracts | every wheel with `retract`, 6 s each way | FMS's "Sequencer-6 sec P51", ESTIMATED as the gear's travel |
| Camera | x -0.0914, z +0.0864 | the pilot's eye in the cockpit under the bubble |

## The crash parts

`PARTS_P51D1450`, 19 parts, on the Timber's EPO: the fuselage crushes, the
wing panels on their joiner tubes (a 10 mm fibreglass tube ESTIMATED as a
5 mm carbon spar's 60 N m), the stabiliser screwed through the fuselage,
the fin on its dowels, the surfaces on foam hinges, the 4250 on its
aluminium mount in the foam nose (the planes' 10 N m), the four blade
nylon prop (`blades` 4), the pack under its magnetic hatch, the mains'
retract units screwed to ply plates in the wing, ESTIMATED to tear out of
the foam at 8 N m and 300 N, and the tail wheel's on a 2 mm leg. With the
gear up the legs are stowed (above) and the belly and the prop's tips are
what a landing meets: P17 lands it that way. `npm run crash:core`: 242
passed.

## The scheme

FMS sells the 1450 mm P-51 in several full size schemes; its manual
photographs one: natural metal all over, a red spinner and nose band, the
fin's top red over the rudder, black identification bands across the
wings and the stabiliser, and the black anti-glare panel ahead of the
windscreen (`configs/liveries.js`, `p51d1450`, the stock scheme; regions
wing, fuselage, tail, trim and stripe for the paint shop). The metal is
drawn a cool grey with a bright, narrow specular, so it reads as polished
aluminium under the warm sun. The prop's four black blades have yellow
tips.

## The sound

The fixed wings' electric voice (`wing`), the blade pass: four blades, so
the hum is twice a two blade's at the same rpm. No voice of its own; a
Merlin's is not what a foam P-51 sounds like.

## In the shell

`p51d1450`, simId 15, the eleventh plane in the carousel and on the Free
Flight card (1450 mm, 2350 g, a line in English and Spanish), with Acro
(the default), Stabilised and Manual rows. G works the retracts and a
notice says which way; the OSD shows GEAR UP, GEAR DN or GEAR while it
moves, next to the flaps' notch; F sets the flaps; the start prompt says
right rudder as the tail comes up. The drawn model's gear follows the
plant's (`setGear`): the mains fold inward into the wing, the tail wheel
forward into the fuselage. The hangar offers the 650 kV option and no
other prop (FMS's four blade has no APC counterpart to anchor another on).
`npm run p51:shell` (scripts/bombshell-shell.js p51d1450): picked on the
Aircraft row, one of the Free Flight card's planes, module 15 and the drawn
model, Acro, the blade voice, parked at the plant's 0.2291 m on the
airfield, off the ground with the sticks centred, climbing, banking right
on full roll stick, and C to chase, on swiss2 and on the airfield, with
no gamepad reaching the page (the findings below).

**Where it sits on the unlock curve: level 7, last.** It has the heaviest
wing loading here (65 N/m^2 against the Timber's 46 and the Kadet's 36),
it swings on the take off roll until the pilot's rudder holds it, it drops
a wing at the stall, and FMS rate it "Intermediate". A child who has flown
the Bramor off its catapult is ready for it.

## Findings for the lead

- **The owner's transmitter reaches headless Chrome.** This machine has
  the RadioMaster Pocket plugged in as a USB joystick (`/dev/input/js0`,
  "EdgeTX Radiomaster Pocket Joystick"), and headless Chrome reads it as
  a gamepad, so a shell check that does not block `navigator.getGamepads`
  flies on its sticks. `p51:shell` first failed its swiss2 "parked on its
  gear" line that way (the plant stepping, the CG at 0.2305 m against
  0.2291), and the Cub failed the same line, while the Timber passed; a
  GPU capture taxied off at three quarter throttle and nosed over. With
  `navigator.getGamepads = () => []` seeded, as progress-check.js already
  does, `p51:shell` passes on swiss2 and the airfield. bombshell-shell.js
  and tests/lib/page.js are left as they are here; the lead may want
  page.js to seed it for every run.
- **`ui.ten_fixed_wings`** (en.js, es.js) says ten; every new plane makes
  it wrong. Left for the lead to write once, after the merges.
- **The airframe count.** `SIM_AIRFRAME_COUNT` is 24 here; an empty slot
  (13, 14, 16 to 23) has zero mass and `sim_set_airframe` refuses it
  (p51:stab checks each). `craft-pick-selftest.js` counted ten planes by
  hand; it counts the table's fixed wings now. `tuning-check.js` U6
  assumed every aircraft with flaps has a manual's elevator mix; an
  aircraft whose manual gives none is now held to a centred elevator.

## What the owner should feel flying it

A heavy, slick, scale warbird. On the strip it sits nose high on its tail
wheel. Open the throttle and nothing much happens until the tail comes
up; then the nose goes left, hard, unless right rudder is already going
in. Held straight it is off in about eleven metres at 12 m/s. Gear up (G)
and it tidies up and carries its speed: close the throttle at the top of
a pass and it barely slows, where the Kadet would be down to a crawl. It
is not a hot rod on the stock motor, about 20 m/s level, and it climbs
well but not vertically. Let it get slow and pull, and a wing goes, the
left one, fast. Land it with full flap (F twice) and the gear down, at
about 11 m/s on a steady approach; it floats in the flare. Forget the
gear and it slides in on its belly and bends its prop.

## Sources

- FMS, 1450mm P-51D Red Tail V8 PNP, product page (fmshobby.com/products/fms-1400mm-p-51d-red-tail-v8-pnp; fms-model.com's): span, length, weight, area, loading, CG, motor, ESC, prop, pack, flaps, retracts, flight time.
- FMS, P-51D Mustang V8 operating manual (cdn-files.myshopline.com/file/store/1772248208561/55c1d8443b5c438095f19ab8babfc3b0.pdf): throws at both rates, flap throws, CG and how it is measured, the trim flight, the spare parts list (the sequencer), the side and top views (figs. 76, 77).
- Aviation, July 1944, "Design Analysis of the P-51", its leading particulars (legendsintheirowntime.com/LiTOT/P51/P51_Av_4407_DA.html, via the Wayback Machine): span, areas, taper, dihedral, incidence and washout, sweep, the tail, the gear, the prop.
- HobbySquawk, "Official FMS 1400mm P-51D V8 Thread" p. 22 and "FMS 1400mm P-51 The Need for Speed": the stock motor's speed, the 650 kV upgrade, the ESC it wants.
- FMS, 4258-KV650 motor (fmshobby.com/products/4258-kv650-motor).
- Dynam, 14.8V 2600mAh 25C LiPo (dynamrc.com), 295 g, for the pack's mass.
- Selig et al., Summary of Low-Speed Airfoil Data (UIUC), the NACA 2415 and the Reynolds number trend; the UIUC propeller data site, APC 14 x 8E; Abbott and von Doenhoff, Theory of Wing Sections; Nelson, Flight Stability and Automatic Control; USAF DATCOM; Raymer, Aircraft Design: A Conceptual Approach; Schrenk, NACA TM 948.
