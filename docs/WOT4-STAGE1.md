# Wot 4, stage 1: the aircraft, the model and what it is meant to do

The owner asked for eleven all time great RC aeroplanes, and this is id
20: Chris Foss's Wot 4, the British club sport aerobat, "the UK's answer
to the Ugly Stik", which does everything well and forgives mistakes.
RCM&E, reviewing Foss's kit in 2006: "a model that dominated club
flightlines throughout the 1980s and '90s ... More than 20,000 kits have
been sold since it was launched". What it has to show, each gated by a
number: a forgiving stall with no wing drop, crisp rolls, big loops, a spin
on the rudder that stops when the sticks are let go, a knife edge pass
with some coupling, easy landings on its taildragger gear, and its look in
the drawn model: a wing on top of the fuselage, a big rudder, a bright
scheme.

This file gives every number with its source, the plant capabilities it
uses and why, each gate with its band, what it is not, and how it differs
from the Ugly Stik (id 19). The plant is `src/native/plant_wing.c` with a
table of its own, `FW_WOT41334`; string id `wot41334`, the name and the
1334 mm span as the house style has it.

## Which Wot 4, and why

**The Ripmax Wot 4 Mk2 ARTF (A-CF002/A), flown on Chris Foss's own
electric conversion.**

| Candidate | What it has | Why it was or was not taken |
| --- | --- | --- |
| Chris Foss Wot 4 Classic, the kit | the designer's own page: "Wing Span 52 - 56inches, Wing Area 590 sq. in, Wing Loading from 17 - 22 ozs/sq ft, Weight 70-90 ozs", "docile and forgiving yet fully aerobatic", and his electric conversion drawing | taken for the area, the weight and the power; no throws, no CG |
| Ripmax Wot 4 Mk2 ARTF | the 52 in constant chord Wot 4, "manufactured ... under a licencing agreement with Chris Foss" (Foss's Ripmax page); its product page's span and length, its manual's CG and throws, and the cover's three view | taken for the outline, the balance and the throws |
| Ripmax Wot 4 Foam-E Mk2+ | 1205 mm, 1100 g, 11 x 8, 3S 2200, 40 A, CG 80 mm (Ripmax's page and manual) | a foam model a size smaller; no area, and its motor is named only by resellers |
| Wot 4 Mk3 kit | 56 in tapered wing, RCM&E's 2006 review | the Mk3 is the tapered wing for "precision aerobatics"; the Classic's constant chord is the one Ripmax builds |
| Wot 4 XL Mk2 | 1730 mm, 6.7 sq ft, 3.85 kg (resellers) | no manufacturer page reachable; a bigger model of the same |

The Mk2 ARTF and the Classic are one aeroplane: Foss's Classic is "the 52"
span version ... featuring a special low aspect constant chord wing", the
Mk2 being the version that "became the market leader" in 1981 (Foss's Wot
4 notes), and the Ripmax Mk2's cover draws that constant chord. Ripmax's
electric recommendation, a "QuantumII 40 Brushless" on "4S1P 14.8v
4500mAh", publishes no figures found. Foss's conversion does: "AXI 4120/14
brushless motor, or equivalent, and APC 13 x 8 propeller", "60 amp speed
controller", "3700 mah 4 cell 14.8v Li-Poly battery", and AXI publishes the
4120/14's figures. So the aircraft is the Ripmax Mk2 airframe on Foss's
power.

## The aircraft

| Quantity | Value | Source |
| --- | --- | --- |
| Span b | 1.334 m | Ripmax product page, "1334mm (52.6")" |
| Length | 1.185 m | Ripmax product page |
| Wing area S | 0.38064 m^2 | Chris Foss, "590 sq. in"; RCM&E, "4.1sq.ft. (0.38sq. m.)" |
| Chord c = S/b | 0.2853 m | derived; the cover's drawing gives 0.300, 5 percent more |
| Aspect ratio | 4.675 | derived |
| Mass | 2.268 kg | Foss, "70-90 ozs", the middle, 80 oz |
| Wing loading | 58.4 N/m^2, 19.5 oz/sq ft | inside Foss's 17 to 22 |
| CG | 82 mm behind the leading edge at the root | Ripmax manual p. 21, "82mm (3-1/4")" |
| Throws, high | aileron 12.08, elevator 15.26, rudder 30.37 deg | manual p. 21, "each measured at the widest point of the surface": ailerons 6 to 9 mm, elevator 9 to 15, rudder 45; the top of each over the surface's chord there, 43, 57 and 89 mm off the cover |
| Throws, low | 8.02, 9.08, 30.37 deg | the bottom of each range |
| Expo | 30 percent | none published; the plant's |
| Power | AXI 4120/14, 660 rpm/V, 315 g; APC 13 x 8; 60 A; 4S 3700 | Foss's conversion; AXI's GOLD LINE V3 page |
| Thrust | 3,500 g static on 4S with a 13 x 8, 55 A for 60 s | AXI's table |
| Gear | aluminium strap, wire tailwheel epoxied into the rudder | manual steps 19 to 22 and 34 |

### The outline, measured off the cover

The manual's cover carries a top and a side view. Rendered at 600 dpi
the span is 1420 px, 0.9394 mm a pixel. Stations are mm aft of the prop's
plane, taken 22 mm behind the spinner's tip (ESTIMATED), and heights mm
over the thrust line:

| Part | Value |
| --- | --- |
| Wing | leading edge at station 226, constant chord, rounded tips; flat, its chord line 64 to 70 mm over the thrust line, on top of the box (a shoulder wing); no dihedral (Foss: the Classic "offers optional dihedral for extra stability", so the standard wing is flat) |
| Ailerons | strip, 43 mm deep, 103 mm to 606 mm out |
| Stabiliser | 164 mm at the root, 91 at the tip, 492 across, the leading edge swept 61 mm from station 939, the hinge line square at 1046; 33 mm over the thrust line |
| Fin and rudder | a swept fin from the fuselage's top at station 930 to its tip 258 mm over the thrust line; a rudder 89 mm deep behind a hinge at 1052, from the tip down to the fuselage's bottom: 0.033 m^2 in all, 8.7 percent of the wing |
| Gear | axles at station 234, 202 mm under the thrust line, 2 1/2 in wheels on a 300 mm track (ESTIMATED from the photograph); the tailwheel's 1 in wheel at station 1089, 31 mm under |
| Length check | spinner tip to the rudder's trailing edge 1163 mm against Ripmax's 1185, 2 percent short; the span's scale is kept |

The CG is taken on the thrust line: the motor and pack on it, the wing's
0.46 kg over it and the strap gear under it about balance (ESTIMATED). A
first estimate put it 20 mm over the line; with the thrust 20 mm under the
CG, the 4120's 19 N at 12 m/s straight up pitched the nose up 0.38 N m,
more than 60 percent of the elevator held, where Wot 4s are flown straight
up and hung. That estimate went.

## The coefficients

`npm run wot4:derive` prints each one. Per radian, in the plant's chord.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 4.401, 4.138, 3.732 | 2 pi AR/(AR+2) |
| CL alpha | 4.752 | a_w + a_t (S_h/S) eta (1 - d eps/d alpha), eta 0.9, DATCOM's downwash 0.427 (the stabiliser 37 mm under the wing's plane) |
| alpha_zl | -1.96 deg | the section's -2.0 at no incidence, less the tail's share |
| Static margin | 0.159 | V_H 0.405; the CG 11 mm behind the wing's aerodynamic centre |
| Cm alpha, Cm q | -0.7573, -7.430 | -CL alpha SM; -2 eta a_t V_H l_h/c |
| Cm0 | 0.0505 | level at three quarter throttle, 17.35 m/s, the elevator neutral (on the zero lift line's angle, which is what the plant takes the moment on) |
| Cm de, CL de | 0.9060, -0.3683 | tau_e 0.60 for a 35 to 50 percent elevator |
| CY beta, Cn beta, Cn r | -0.3879, 0.1643, -0.2161 | the fin and big rudder less the slab sided box's -0.0185 (Nelson eq. 2.64) |
| Cl beta | -0.0504 | no dihedral: the wing on top of the box, DATCOM's -1.2 sqrt(AR) (z_w/b)(2d/b), -0.0192, and the fin's -0.0311 |
| Cl p, Cl da | -0.5501, 0.2910 | strip theory on a constant chord, -a_w/8; tau_a 0.33 for 15 percent strip ailerons over their span |
| Cn dr, CY dr, Cl dr | -0.1316, 0.2335, 0.0224 | tau_r 0.72 |
| CD0, e | 0.040, 0.78 | ESTIMATED: film on a built up frame, an open cowl, bare wheels on a strap, strip ailerons with their gaps |
| CL max | 1.098 | 0.9 of the NACA 2415's 1.22 at 2e5 (UIUC vol. 2 fig. 5.52), the semi-symmetrical sport section's class; no maker publishes the section |
| stall_top, stall_k | 3.94 deg, 0.76 | the NACA 2415 at 1.8e5 (9.3 m/s on 0.285 m), interpolated from UIUC's 1e5 and 2e5 |
| Stall arms, stall_dw, stall_asym | 0.0374, 0.1126, 0.1463, 0.00351 | stall:derive |
| strip_c | 1, 1, 1, 1 | the constant chord: Schrenk's loading stalls the root first and the tip 40 percent of the stall angle later |
| Washout | none | a flat wing, built straight |
| Surface knee | 0.5 rad | the Edge's DATCOM K': the rudder's 30 deg acts as 20.8, the ailerons' 12 as 11.1, the elevator's 15 as 13.5 |
| strip_tau | 0.126, 0.330, 0.330, 0.209 | tau_a times the ailerons' share of each strip |
| Inertia | 0.0802, 0.1587, 0.2310 kg m^2 | ESTIMATED: the wing 0.46 kg as a bar, the motor 0.32 kg 0.28 m ahead, the pack 0.40 kg 0.12 m ahead, the tail 0.12 kg 0.76 m behind, the fuselage along its 1.1 m |
| Side crossflow drag area | 0.1092 m^2 | the Extra's side_cda rule on the box's 0.13 m^2 side |

### The power system

AXI's 4120/14 at 660 rpm/V on 4S turns no load at 9,768 rpm, loaded at 0.85
of it, 8,303 rpm, the pitch speed 28.1 m/s on the 13 x 8; AXI's 3,500 g,
34.3 N, is 1.54 times the weight; 55 A. The prop's torque from the ideal
disc, 439 W at 8,303 rpm, 0.505 N m. The stock pack is Foss's 4S 3700, as
Overlander's 25C Sport, 312 g (the UK club flyer's pack; Foss names no
maker); CNHL's 4S 4000 (429 g) is the other. 5 mOhm a cell, ESTIMATED.
Top speed 23.6 m/s, 85 km/h; straight up it holds 9.2 m/s: Foss's
conversion "will hold a vertical climb from take-off on a freshly charged
battery". His "around 12 minutes" of "spirited aerobatics" is the power
table's flight time.

## What the plant does for it

No new plant capability. Every term the Wot 4 needs was already a
general one, and it reuses them:

- **the surface's knee** (surf_knee, the Edge's): the rudder's 30 deg.
- **the aileron on each strip past the stall** (strip_tau, the Edge's).
- **the slipstream over the tail and the ailerons** (slip_r and the tail's
  shares, the Extra's). Without it the rudder at 10 m/s straight up could
  not hold the yaw that the P factor and the ailerons holding the prop's
  torque put in, and the aircraft fell off its vertical line; RCM&E's "the
  model will hover (and even fly backwards!) in a strong wind" needs the
  rudder and elevator in the wash.
- **the fuselage's crossflow drag** (side_cda, the Extra's), for the
  knife edge.

The one change to the plant's files beyond the table is the table's own
registration: SIM_AIRFRAME_WOT41334 (20) in sim_internal.h and sim_abi.h,
its PLANT_TABLE entry, PARTS_WOT41334 in crash_parts.h and its line in
crash.c. `npm run wot4:gates` W17 holds every other aircraft's twenty one
recorded trace hashes to main's, identical: seventeen from 3637fef, the
Zagi's and the Ugly Stik's from 4223337, the NRJ's from 1fd93f3 and the
Pitts's from a894327, where they merged. `npm run
crash:identity` against origin/main: every existing gate and self test
prints byte for byte what main prints (the `off == base` column), but for
three that enumerate the airframe table and so meet the Wot 4 where main
has an empty slot: whoop:gates and wing:contact (main's module refuses
airframe 20) and glider:stab's count of empty slots, 3 on main and 2 here.

Found on the way and fixed: `scripts/stall-derive.js` did not parse on
main (a merge had dropped the `};` closing the Edge's entry), so `npm run
stall:derive` failed; the brace is back.

## The intended behaviour, and how each part is proven

`npm run wot4:gates` (scripts/wot4-gates.js, tests/wot4-thresholds.json),
flown in Manual on the table.

| Gate | Derived | Band | Measured |
| --- | --- | --- | --- |
| W1 level at 3/4 throttle, the trim | 17.35 m/s | 14.7 to 20.0, stick under 0.1 | 17.30, stick 0.000 |
| W2 stall, power off | 9.32 m/s | 8.75 to 10.61 | 10.05 |
| W3 glide at 1.4 Vs | L/D 8.31 | 7.40 to 9.22 | 8.33 |
| W4 top speed | 23.59 m/s | 21.4 to 26.0 | 23.40 |
| W5 full aileron at 20 m/s: pb/2V, crisp, adverse yaw | 0.1028 (177 deg/s); roll mode 0.04 s; 7.7 deg of sideslip in 0.5 s | 0.082 to 0.123; 90 percent of the rate in 0.25 s; 5.0 to 11.6 deg | 0.094, 146 deg/s at 18.0 m/s; 0.07 s; 6.0 deg; a whole roll in 2.18 s |
| W5b low rate | 0.0713 | 0.057 to 0.086 | 0.064 |
| W6 prop torque, static | 0.505 N m | 0.40 to 0.64, rolling left | 0.505, rolling left |
| W7 straight up at full throttle | 9.24 m/s | 8.3 to 10.2, within 5 deg of vertical | 8.81 at 89.9 deg |
| W8 on its back at full throttle: the push over upright | 0.297 of stick | 0.22 to 0.37, speed within 10 percent | 0.302; 23.46 against 23.40 m/s |
| W9 a loop on half stick at full throttle | 45 m across at CL 0.6, 16.4 m/s over the top | 30 m or more, over the top at 1.3 Vs or more, never stalled | 31.6 m, 15.1 m/s, alpha 8.1 deg at most |
| W10 the stall held full back | | past the stall; bank under 10 deg, yaw under 20 deg/s | alpha to 16.5, bank 9.1 at most, yaw 5.1 deg/s, sinking 2.46 m/s |
| W11 full up and full rudder 4 s, then hands off | | 90 deg the rudder's way; stopped in 0.5 s and 90 deg | right 140 deg, left 148; stopped in 0.34 and 0.33 s after 15 deg |
| W12 knife edge pass, full rudder, 2 s | sinking 5.95 m/s^2; 0.122 of aileron against the coupling | 3.9 to 8.0 m/s^2; 0.061 to 0.183 | 5.57 at 17.9 deg of sideslip; 0.119 |
| W13 standing on its wheels | 12.53 deg, 0.2121 m, 13.3 percent on the tail | 11.53 to 13.53, 0.2061 to 0.2181, 10 to 17 percent | 12.56, 0.2127, 13.5 |
| W14 take off on grass | 7.45 m at 11.82 m/s | 5.4 to 10.8 m, 10.0 to 13.6 m/s | 9.29 m at 12.68 m/s in 2.28 s |
| W14b the roll tracks on the rudder | | under 5 deg, 1 m | 0.2 deg, 0.01 m |
| W14c feet off the rudder, recorded | | none | 0.7 deg |
| W15 taxi turn, full right rudder | 1.46 m | 1.1 to 1.83 | 1.41 m, turning right |
| W16 an easy landing | | touching at 1.3 Vs or slower, no bounce, at rest at W13's attitude, no hull or prop | touched at 11.1 m/s sinking 0.89, no bounce, rolled 45 m, at rest at 12.56 deg |
| W17 every other aircraft's recorded hash | main's | identical | 21 identical |
| W18 Node and Chrome | | identical | identical |

`npm run wot4:gates`: 21 of 21. `npm run wot4:stab`: 58 passed, the Edge's
bar on the Wot 4's throws (Stabilised banks 60 deg at full stick; Acro
rolls at 180 deg/s and pitches at 70 without a stall, holds the attitude
it is left at and flies on its back hands off; the surfaces read the
manual's throws; on the ground nothing winds up, the take off tracks in
every mode, and the tailwheel steers).

### The forgiving stall

The constant chord wing is loaded most at its root (Schrenk), so the root
stalls first and the tips 40 percent of the stall angle later: held full
back the Wot 4 mushes with its nose over the horizon and its wings within
10 deg of level, sinking about 2.5 m/s. RCM&E on the WOT4e: "The stall was
a non-event. The aircraft slowed to the point that it was just gently
descending vertically in a high alpha position, wings remaining level."
`npm run stall:probe -- --only wot4`: full back from 1.15 Vs power off, the
wing drops 5 deg, the 10 s bank 13; with power the prop's torque, not the
wing, rolls it slowly.

### The spin, and what it is not

The launch brief asked for "flat spins that recover hands off". No source
found says a Wot 4 flat spins; the reviews say it "spins and flicks with
ease and recovers well" (RCM&E, 2006), and the manual lists "loops, rolls,
flicks and spins" at the recommended throws. A flat spin comes from an
aft CG or a blanked rudder, which a Wot 4 at 82 mm does not have. So W11
gates the documented behaviour: full up and full rudder turn it the
rudder's way, and letting go stops it within 0.34 s.

What the plant flies is honest to say: at these throws the elevator holds
the wing at 17 to 19 deg of alpha, past the root's stall and short of the
tips', so the rudder yaws it round a steep spiral at about 35 deg/s rather
than an autorotating spin. The same is true of every rectangular winged
aircraft here (`npm run stall:probe`: the Cub, the Kadet and the Wot 4 all
"no spin"; only the tapered and swept wings, the Edge's, the Radian's, the
Bramor's, autorotate). A straight wing's real spin lives at 30 to 45 deg
of alpha, reached as the inertial pitch up of the rotation outruns the
tail; the plant's post stall downwash (stall_dw) holds the nose down first.
Building that is a general plant capability for every straight wing, not
this aircraft's, and it is left open (below).

### The knife edge, and its coupling

On its side at full throttle and full rudder the big rudder holds 18 deg
of sideslip: the box's side force, the crossflow and the thrust's share
carry 39 percent of the weight, and it sinks. It is a knife edge pass, not
a knife edge line. The coupling: the wing on top of the box and the rudder
over the CG roll it away from the rudder, which the pilot holds with an
eighth of full aileron.

## How it differs from the Ugly Stik

The Ugly Stik (id 19) is Phil Kraft's Das Ugly Stik to RCM plan 939,
merged on main (docs/UGLYSTIK-STAGE1.md). The two are the classic sport
aerobats of either side of the Atlantic, and the models differ where the
aircraft do. Every number below is from the two stage 1 documents, the Stik's
from its gates as measured:

| | Wot 4 | Ugly Stik |
| --- | --- | --- |
| Gear | taildragger, an aluminium strap and a wire tailwheel in the rudder | tricycle, a nose wheel steered at 0.6 of the rudder |
| Wing | 1334 mm, 590 sq in, flat, NACA 2415 class, cambered | 1568 mm, 3.07 deg of dihedral a side, a 16 percent near symmetric section |
| Roll stability | the high wing's and the fin's alone, Cl beta -0.050 | the dihedral adds to it, Cl beta -0.081: the Stik levels itself more |
| Roll | pb/2V 0.094, 146 deg/s at 18 m/s | pb/2V 0.074, 128 deg/s at 23.8 m/s |
| Rudder | 30.4 deg on the manual's 45 mm, Cn dr -0.132 | 14.6 deg on the plan's 1 in, Cn dr -0.066, half the Wot 4's |
| Inverted | a push of 0.30 of the stick on the cambered section | a push of 0.50 on the symmetric one |
| Power | electric, Foss's AXI 4120/14 on 4S, 34 N static, 1.54 times its weight | glow, an O.S. 61FX on a 12 x 6 with an idle that never stops |
| Weight, loading | 80 oz, 58.4 N/m^2 | 96 oz, 52.3 N/m^2 |
| Loop at half stick | 31.6 m | 41.3 m |
| Landing | touches at 11.1 m/s, rolls 45 m | touches at 14.1 m/s, rolls 78 m |

In the hand: the Wot 4 rolls faster on a shorter span, has twice the
rudder for the knife edge and the spin, needs less push on its back, and
lands slower and shorter, but its tail has to be kept straight on the
ground. The Stik is the bigger, steadier wing: more dihedral, bigger loops
on its lower loading, and a tricycle that tracks by itself.

## The landing gear

The Cub's model. Numbers are the drawn model's (WOT4_DIMS).

| Quantity | Value |
| --- | --- |
| Main wheels | x +0.074, y ±0.150, z -0.202 drawn, -0.208 unloaded; r 0.03175 |
| Tailwheel | x -0.781, z -0.031 drawn, -0.037 unloaded; r 0.0127; steers at the rudder's own angle (its wire is in the rudder) |
| Rest | 12.56 deg nose up, the CG 0.2127 m over the grass, 13.5 percent on the tail |
| Stiffness, damping | mains 1607 N/m, 51.2 N s/m; tail 494, 13.3; 6 mm of static deflection, 0.6 of critical |
| Prop tip | 69 mm over the grass level, 0.114 m at rest |
| Hull | hx 0.40, hy 0.667, 0.06 down, 0.09 up, its aft lower edge 0.067 m clear at rest |
| Camera | on the cowl at the firewall, 0.17 m ahead, 0.058 up |

`node scripts/craft-preview.js wot4`: the drawn wheels' lowest points
within 1 mm of WOT4_DIMS, the drawn rest 12.56 deg and 0.2128 m against the
plant's 12.56 and 0.2127, the half span, nose, tail, top and bottom within
2 mm, the prop clockwise from the cockpit; 34 draws, 6,732 triangles.

## The crash parts

`PARTS_WOT41334`, 20 parts, balsa and ply, an aluminium strap. The
rear fuselage's box at the tail, 30 N m (the Kadet's rule); the one piece
wing on two nylon bolts, 57 N m, the breakaway a sport model is built with;
each panel on its ply brace, 70 N m up and down, 60 fore and aft; the
motor on four captive nuts, 40 N m; the prop, APC's thin electric, 3 N m
and shed at twice; the pack on one strap; the strap's legs, 10 N m,
bending; all ESTIMATED as the Kadet's and the Edge's are. `npm run
crash:core` holds the masses to 2.268 kg with the CG at the origin.
`npm run wing:contact`: its landing, standing, tip strike, nose in and
throw from the grass pass.

## The covering

Ripmax's white film with the box scheme's three bands, red, orange and
yellow, round each wing tip, along each side from under the cockpit up to
the fin, and over the fin and rudder; the canopy black; the spinner black.
The other scheme is the blue and black decal set Ripmax sells for the Wot
4 Foam-E Mk2+ (Z-CF020/12B). Regions: wing, fuselage, tail, trim (red),
stripe (orange), swoop (yellow), canopy.

## The sound

The electric blade voice every electric plane has (src/render/audio.js).

## In the shell

`wot41334`, simId 20, one of the planes behind the Free Flight card and in
the carousel, with Acro (the default), Stabilised and Manual rows, its FPV
camera on the cowl, `gear` from the plant's settled pose, and the hangar's
power (two packs), paint (two schemes), tuning (the manual's high and low
throws, its 82 mm CG) and parts (the stock 13 x 8, and APC's 12 x 6E and 12
x 8E, AXI's other suggestions). On the unlock curve it is **level 4**,
beside the Bombshell and the Zagi: a sport aerobat the manual calls "an
excellent first aileron model with reduced control throws" after a
trainer, one step past the Ugly Stik (3), whose tricycle gear and dihedral
forgive more, since the Wot 4 rolls a quarter faster (pb/2V) and has to be
steered on its tailwheel.

## What is estimated, and what stays open

- The section (a NACA 2415 standing for it), CD0, e and the inertia.
- The outline off a cover drawing 2 percent short on the length; the
  gear's track off a photograph.
- The CG's height on the thrust line.
- **A straight wing's spin.** The plant does not autorotate a rectangular
  wing at the alpha its elevator reaches; the Wot 4, like the Cub and the
  Kadet, turns a steep spiral on full up and full rudder. A general
  capability (the inertial pitch up and the post stall downwash taken
  together) is the fix; it would touch every straight wing and wants its
  own branch.
- The knife edge: a pass that sinks. No figure was found for a Wot 4's.

## The owner's test

`SIM_GPU=1 npm run wot4:owner` (scripts/wot4-owner.js) flies it headless in
the real shell on the plant's clock, swiss2, wot4-manual: the take off on
the rudder, a loop on half stick, on its back at full throttle, the stall
held full back from W10's entry, and a spin each way let go, everything
past the take off 150 m or more over the ground with a turn about between
runs (a straight run of 15 s at 23 m/s left the valley). All hold:

| Owner check | Band | swiss2 |
| --- | --- | --- |
| take off on the rudder, heading to 3 m | w14_straight, 5 deg | 1.9 deg, off at 12.8 m/s |
| hands off, recorded | none | off at 10.5 m/s 0.7 deg left, then the prop's torque rolls it: 18 deg of bank and 16 deg of heading left by 3 m up |
| a loop, half stick, full throttle | w9_loop, 30 m, 12.1 m/s over the top | 31.1 m, 14.7 m/s |
| on its back, full throttle | w8_inverted, a push of 0.22 to 0.37 | 0.314 (stick -0.444 against -0.130 upright), 22.92 against 23.00 m/s |
| the stall held full back | w10_stall, bank under 10, yaw under 20 deg/s | bank 9.2 at most, yaw 5.2 deg/s |
| full up and full rudder 4 s, let go | w11_spin, 90 deg, stopped in 0.5 s and 90 deg | right 151 deg, left 159; under 30 deg/s at once, 0.5 deg on |

The stall is close to its band: held longer than W10's ten seconds the mush
slowly spirals, 9 to 11 deg of bank by the tenth second from 14 to 17 m/s
(the spiral mode, derived at +0.012 1/s at the trim, a flat wing's). A
touch of aileron holds it; hands off, it is a gentle spiral, not a wing
drop.

What the owner should fly (Manual, swiss2): open the throttle over a
second or two with the rudder straight; it lifts at about 12 m/s. Hands
off after lift off it rolls left on the prop's torque; that is expected,
hold it with the ailerons. At a safe height, throttle closed, stick back
slowly and held: RIGHT is the nose bobbing, the wings within about ten
degrees for ten seconds, a slow sink; WRONG is a wing dropping sharply
past 30 deg or the nose falling into a spin. Then full up with full
rudder: RIGHT is a turning, descending steep spiral the rudder's way that
stops the moment every stick is centred; WRONG is a fast flat rotation, or
one that keeps going hands off.

## Sources

- Chris Foss Designs, Wot 4 (chrisfoss.co.uk/wot-4/4538950500/): the Classic's span, area, loading and weight; "docile and forgiving yet fully aerobatic".
- Chris Foss Designs, Wot 4 notes (chrisfoss.co.uk/Wot-4-notes/): the Mk2 of 1981, the Classic's constant chord, "optional dihedral".
- Chris Foss Designs, Wot 4 electric conversion, Dec. 2007 (dropbox.com/s/iskfu6w46a2y9ub/Wot4-Elec-Conv.pdf): AXI 4120/14, APC 13 x 8, 60 A, 4S 3700, "will hold a vertical climb from take-off", "around 12 minutes".
- Chris Foss Designs, Ripmax collection (chrisfoss.co.uk/ripmax-collection/4538949201/): the Mk2 ARTF under licence.
- Ripmax, Wot 4 Mk2 IC/EP ARTF A-CF002/A product page (ripmax.com/Item.aspx?ItemID=A-CF002/A, via the Internet Archive 2026-01-14): span, length, Quantum II 40, 60 A, 4S 4500.
- Ripmax, Wot4 EP/GP instructions (ripmax.com/Instructions/a-cf002-elp.pdf, via the Internet Archive 2024-07-12; the same manual on manuals.ca): the CG, the throws, the gear, the cover's three view, "an excellent first aileron model", "loops, rolls, flicks and spins".
- Ripmax, Wot 4 Foam-E Mk2+ A-CF020A product page and manual (via the Internet Archive): the blue and black decals.
- AXI Model Motors, 4120/14 GOLD LINE V3 (modelmotors.cz/product/detail/272/): 660 rpm/V, 315 g, 55 A, 3,500 g on 4S with a 13 x 8.
- Overlander 3700 mAh 4S 25C Sport (wheelspinmodels.co.uk, OL-2971): 312 g.
- RCM&E, "Wot 4 Encore", David Ashby, 2006 and 2013 (modelflying.co.uk/wot-4-encore/, via the Internet Archive): "spins and flicks with ease and recovers well", "only a breath of down elevator to hold inverted flight", "will hover (and even fly backwards!)", 0.38 m^2.
- RCM&E, "WOT4e Mk.2", Michal Tuszynski, 2012 (modelflying.co.uk/wot4e-mk2/, via the Internet Archive): "The stall was a non-event ... wings remaining level", "landing at walking pace".
- Selig et al., Summary of Low-Speed Airfoil Data, vol. 2, NACA 2415.
- Nelson, Flight Stability and Automatic Control; USAF DATCOM.
- FAA-H-8083-3C, Airplane Flying Handbook, ch. 5.
