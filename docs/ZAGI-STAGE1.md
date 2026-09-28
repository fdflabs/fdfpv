# Zagi HP, stage 1: the aircraft, the model and what it is meant to do

The owner asked for eleven all time great RC airplanes; this is the Zagi
flying wing, airframe 17 (`zagi1219`). It brings a flying wing back to the
product: the Bramor took the 1000 mm wing's place, whose plant
(`FW_WING1000`, `docs/WING-STAGE1.md`) is still in the module for its
gates, and this aircraft uses the same plant, `src/native/plant_wing.c`,
with a table of its own and three things the plant could not do before and
now does for any aircraft. This file gives every number with its formula
and source, those three capabilities, how each part of the flight feel is
gated, the crash parts, the scheme, the power, the shell, and what the
brief had wrong. `scripts/zagi-derive.js` prints every derived figure
below (`npm run zagi:derive`).

## The aircraft: Zagi's Zagi HP

The Zagi is Trick R/C's EPP foam flying wing from Venice, California: the
slope soaring and combat classic of the 1990s, sold as the Zagi-LE and
Zagi-THL gliders, the Speed 400 powered Zagi-400 and Zagi-400 X, the 5C
combat wing, and today, by Zagi LLC, the Zagi HP, "a versatile flying
wing" for brushless power. Of the three the brief named (the THL, the 400,
the current electric), the HP is the one to model:

- It is the current electric Zagi, and the product needs a motor: the THL
  is a pure glider.
- It flies on a LiPo, which is what the plant's power model knows
  (`docs/POWER-STAGE1.md`); the 400 and 400 X flew on 7 and 8 cell NiCd
  and NiMH packs, which it does not.
- Zagi publishes everything the plant needs for it: span, area, weight,
  airfoil, CG, throws, motor, prop, bench rpm and current, pack, ESC
  cutoff, and a top speed.

Zagi LLC's domain no longer resolves (checked 2026-09-28), so every Zagi
source here is the Internet Archive's copy, dated.

| Quantity | Value | Source |
| --- | --- | --- |
| Span b | 48 in, 1.2192 m | Zagi HP product page and manual |
| Wing area S | 2.8 sq ft, 0.26013 m^2 | the same |
| Flying weight m | 25.5 oz, 0.7229 kg | the same |
| Wing loading | 27.3 N/m^2 | derived (Zagi: "9.1 oz/ft 2", "8.75 oz sq ft") |
| Airfoil | Zagi 101.4, "high speed" | the same |
| CG | 8 in behind the nose, "the suggested starting point" | HP manual p. 20 |
| Elevon neutral | flush with the bottom of the wing for the last three inches | HP manual p. 20 |
| Elevon throw | 3/8 in each way on either stick | HP manual p. 20; the 400 X manual adds "measured 1" from the tip" |
| Elevons | "Airfoil shaped, constant cord", balsa | HP manual cover |
| Winglets | plastic, black in Zagi's photograph | the same, product page |
| Motor | "3100 Kv, 28 X 35mm, Brushless Inrunner" | zagi.com, brushless motor |
| Bench point | "over 22,000 rpm at only 30 amps in static testing"; "Unloaded in flight the RPM increases 20%" | the same |
| Prop | carbon 5 x 5, "spoon shaped", 10 to 15 mph faster than four other 5 x 5s on a Zagi | zagi.com, propellers; the manual's "5 X 5 raised lettering" |
| ESC | 35 to 40 A | zagi.com, brushless motor |
| Pack | 3S 2200 mAh 30C | zagi.com, battery for HP and HP60; HP manual p. 3 |
| ESC cutoff | "below 3 V per cell" | HP manual p. 3 |
| Top speed | "85 MPH" | product page and manual ("propel this airplane over 85 mph") |
| Launch | "a good strong throw into the wind", motor off, then throttle "when the Zagi HP is a comfortable distance from the ground" | HP manual p. 21 |
| Landing | "a slow sink rate to a sliding landing" | HP manual p. 21 |

### The planform

No Zagi manual gives the chords. Trick R/C drew the wing to scale in the
Zagi-400 X manual (figs. 2 and 3, p. 4), the same 48 in cores as the 400
and the THL: across the 48 in span the drawing measures 37.75 pixels to
the inch at 300 dpi, and it gives a root chord of 12.17 in, a tip chord
of 5.06 in, and the leading edge 13.06 in aft at the tip, a sweep of tan
0.543 (28.5 deg). That is 2.87 sq ft, which is the THL's published 2.83
and the 400's 2.833. The HP's 2.8 sq ft is taken on the same sweep with
the chords scaled by the areas: 11.87 in and 4.93 in, a taper of 0.416.
The 400 X manual's cover says 3.33 sq ft for the same cores; its own
drawing, the 400's manual and the THL's page all say 2.83, and so does
the 400 X's 7.4 oz/sq ft if its 24.6 oz is spread over 3.33, so the 3.33
is taken as a slip for 2.83 and not used.

On that planform the MAC is 8.88 in, 10.35 in out, its leading edge 5.62
in behind the nose, so Zagi's 8 in CG is at 26.8 percent of it.

The elevons are the HP's constant chord: 1.5 in, the mean of the 1 to 2
in Hendricks measured on a Zagi (below), from the motor bay's edge, 2.5
in out, to the tip. The 3/8 in throw on 1.5 in is 14.4775 deg, one set,
no dual rate. The winglets are Hendricks's measured Zagi's: 5.5 in at the
root, 2.5 in at the top, 5 in tall, the leading edge swept 3 in.

## The derivatives: a vortex lattice

A flying wing has no tail to take the stability derivatives from with
Nelson's forms, so `scripts/zagi-derive.js` solves a vortex lattice on the
planform: horseshoe vortices on the wing (24 strips a side, sine spaced,
6 chordwise panels ahead of the hinge and 2 on the elevon) and on the two
winglets (8 strips up each), trailing legs streamwise, boundary condition
on every panel's normal, forces by Kutta and Joukowski with the induced
velocity at each bound leg, so induced drag and the elevons' yaw come out
of it. It is solved for alpha, sideslip, the three rates and the elevons,
and differenced.

It is checked first on two textbook wings: a rectangular wing of aspect
ratio 5 gives a lift slope of 4.007 per rad with its aerodynamic centre at
0.237 of the chord (Helmbold's formula gives 4.254, which is known to read
high at this aspect ratio), and a 45 deg swept wing of aspect ratio 5 and
taper 0.5 gives 3.487 with its neutral point at 0.278 of the MAC.

Then on a measured Zagi: A. Hendricks, "ECEn 674 Final Project" (BYU, for
R. Beard, December 2014), measured a Zagi (47 in, 15 in root, 5.5 in tip,
17.5 in of sweep, the elevons behind the trailing edge, the winglets
above) and ran it through AVL; his geometry file and AVL's output are in
the zip the uavbook repository's README links. On his references the
lattice and AVL:

| | AVL | the lattice |
| --- | --- | --- |
| CLalpha | 8.566 | 9.800 |
| Cmalpha | -1.344 | -1.018 |
| Clp | -0.881 | -0.934 |
| Cmq | -6.036 | -4.733 |
| CYbeta, Clbeta, Cnbeta | -0.313, -0.074, 0.068 | -0.458, -0.158, 0.099 |
| CLde, Cmde, Clda per rad | 1.500, -1.322, 0.392 | 3.382, -1.614, 0.719 |
| Neutral point, in | 11.130 | 10.612 |

They do not agree well, and I could not find why for certain: his
elevons are an AVL surface of their own, behind the wing, whose strips do
not line up with the wing's, and AVL is not here to run his file again.
The lattice is used, as it reproduces the textbook wings, with one
correction taken from AVL, the neutral point (below).

On the HP:

| Coefficient | Value | How |
| --- | --- | --- |
| CLalpha | 4.1152 /rad | the lattice, winglets on |
| Neutral point | 8.832 in behind the nose, 30.4 percent of the MAC | the lattice's 8.314, moved 0.518 in aft, FITTED: see below |
| Static margin | 0.099 of S/b (0.094 of the MAC) at Zagi's 8 in | derived |
| Cmalpha | -0.4076 /rad | -CLalpha times the margin |
| Cmq | -1.5146 | the lattice, on qc/2V with c = S/b |
| cl_de, cm_de | -1.7282, 0.6814 /rad | the lattice, the plant's signs: trailing edge up positive |
| Clda, Clp | 0.4157, -0.4697 | the lattice at the cruise's CL |
| CL max | 0.9283 | 0.9 of the MH45's 1.14 at 2e5 (UIUC, Summary of Low-Speed Airfoil Data vol. 1 fig. 4.61) times cos of the quarter chord's 25.2 deg of sweep, Raymer eq. 12.15. The Zagi 101.4 is not published; the MH45 is the reflexed section Hendricks modelled his Zagi with |
| CD0 | 0.0186 | Raymer's component build up, ESTIMATED: skin friction 0.0060 on 2.04 S with a 9 percent section's form factor times cos^0.28 of the sweep, the winglets at 0.008, the canopy 0.0015, the pusher's interference 0.0010 |
| Oswald e, k | 0.756, 0.0737 | Raymer eq. 12.49 for a swept wing |
| CYbeta, Clbeta, Cnbeta | -0.2399, -0.1338, 0.0173 | the lattice at the cruise, 1.4 Vs, CL 0.474: the sweep's dihedral effect grows with the lift, and the winglets' weathercock shrinks with it (0.0379 at alpha 0) |
| Cnr | -0.0180 | the lattice, plus the profile drag's CD0/4 |
| Clr, Cnp, Cn da | 0.1052, -0.0758, 0.0073 | the lattice at the cruise, per CL 0.2222, -0.1600, 0.0153: the elevons at the swept tips yaw it a little the proverse way |
| Cm0 | 0.0498 | the reflex, trimmed: with the elevons neutral the wing trims at its best glide's CL, 0.503, the manual's glide test with the trims centred |

The neutral point is the one number FITTED. The lattice puts it 0.31 in
behind Zagi's 8 in CG, a margin of 3.5 percent of the MAC, which would
make a THL owner's "optimum" CG of 8 1/4 in (CRRC, Zagi THL Tips: "8"
and 8 1/2" back from the nose... the optimum is at 8 1/4"") all but
neutral and their 8 1/2 in unstable. A thin plate lattice leaves out the
section's thickness and camber; AVL on Hendricks's measured Zagi put that
wing's neutral point 0.518 in further aft than the lattice does on the
same geometry, and that difference is taken. With it Zagi's 8 in has a 9.4
percent margin, where flying wing practice starts a test flight, CRRC's 8
1/4 in 6.6 percent and its 8 1/2 in 3.7: flyable, and more and more
"elevator sensitive", which is what the HP manual says moving the pack
back does.

### The motor

| Quantity | Value | How |
| --- | --- | --- |
| Loaded rpm | 22,000 | Zagi |
| No load rpm, the plant's rule | 25,882 | 22,000 is 0.85 of it (`docs/POWER-STAGE1.md`) |
| Pitch speed | 46.567 m/s | 22,000 rpm on the 5 in pitch |
| Shaft power at 30 A | 202.3 W | Kt (I - I0) omega, Kt = 60/(2 pi 3100), I0 1.5 A ESTIMATED |
| Static thrust | 7.295 N, 1.03 of the weight | that power through the 5 in disc at the figure of merit APC's 5 x 5E has at 22,000 rpm static, 0.553 (APC PER3_5x5E.dat, where the APC absorbs 142 W; Zagi's spoon shaped prop absorbs more) |
| Current at static full thrust | 30 A | Zagi |
| Torque arm | 0.01203 m | the shaft torque, 0.0878 N m, over the static thrust; clockwise seen from behind, as the HP manual says the brushless motor turns |
| Thrust line | 52 mm over the CG | the motor on the tray, ESTIMATED from Zagi's photograph: power pitches the nose down |
| Prop inertia | 1.12e-5 kg m^2 | two 4 g carbon blades on 63.5 mm and the inrunner's rotor, ESTIMATED |

## Performance, derived

| | Derived | How |
| --- | --- | --- |
| Level at 75 percent | 22.14 m/s | thrust against drag |
| Top speed, level | 29.69 m/s (66 mph) | the same at full throttle |
| Trimmed stall | 7.36 m/s | the stall angle's CL max less the lift of the 3.54 deg of up elevon that holds it there: 0.821 |
| Best glide | 13.49 at 9.41 m/s | CL sqrt(CD0/k), 0.503, where the elevons neutral trim it |
| Minimum sink | 0.612 m/s at 7.27 m/s | |
| Best climb | 8.88 m/s at 16.2 m/s | |
| Full elevon roll | pb/2V 0.2236: 315 deg/s at 15 m/s, once round in 1.19 s | -Clda da / Clp, and the roll's lag Ixx over the damping, 0.045 s |
| Pitch | 0.098 s to the pitch rate's first peak after a step from the glide; 1.67 deg of alpha per deg of elevon | the linear short period, speed held; -cm_de / cm_alpha |
| Short period | 0.34 s, damping 0.51, at 12 m/s | |
| Hand throw | 10 m/s, from 1.2 m | the shell's throw (`src/main.js` throwWing), 1.36 times the trimmed stall |

Zagi's "Top Speed 85 MPH", 38 m/s, is not reached: on the plant's thrust
model, falling linearly to the pitch speed, the published motor and prop
level out at 29.7 m/s, and even the 20 percent more rpm Zagi says the
motor finds in flight would give 31.5. To fly 38 m/s level the prop would
have to hold 4.6 N at 38 m/s. 85 mph is a claim no measurement is given
for, and it is left as the upper bound it probably is (in a dive).

## What is new in the plant

Three capabilities, each general, each read only by a table that sets it.
Every earlier table leaves them zero and runs exactly the arithmetic it
ran before: gate Z17 holds all fifteen recorded flights of the other
aircraft bit identical, taken on main's module before the Zagi (main
1cce6bb).

1. **A flying wing's elevons on its strips.** The Edge brought
   `strip_tau`, the aileron's effectiveness on each of the four strips a
   half wing is taken in past the stall, so a fast aileron roll does not
   read the falling tip as stalled while its up aileron holds it short.
   On a flying wing (`FW_MIX_ELEVON`) the same tau now carries the
   elevons' elevator half onto the strips as well: up elevon takes every
   strip it spans away from its stall. The derivation's tau is thin
   aerofoil theory's for the elevon's chord fraction on each strip, times
   the share of the strip it spans: 0.268, 0.498, 0.549, 0.618.

2. **A surface on a stalled wing** (`surf_sep`). Past the stall the flow
   has left the wing's trailing edge, and a surface there turns the
   separated wing only by the chord line it tilts: its chord fraction per
   radian, where attached flow gave it tau. The plant takes the
   ailerons' moments (and a flying wing's elevons') down to `surf_sep`
   of themselves over the stall's own blend: cf over tau, 0.169 / 0.508
   = 0.333 at the Zagi's MAC. It is what a pilot calls "a mush condition
   (partial stall) with a loss of roll control" (CRRC), and on a flying
   wing it is also why full up elevon cannot hold the nose past the stall:
   without it the Zagi, whose full elevon asks for 31 deg of alpha,
   tumbled.

3. **The span loading from a lattice** (`strip_r`). The strips were
   loaded by Schrenk's approximation, which leaves out sweep and
   endplates. A 28 deg swept, tapered wing with winglets loads its tips
   more: the lattice at the cruise gives local lift coefficients over the
   wing's of 0.831, 1.007, 1.119 and 1.139 across the four strips, where
   Schrenk gives 0.982, 1.035, 1.054 and 0.946. So the Zagi's tips reach
   their stall first, as an untwisted swept wing's do.

No washout is set: none is documented for any Zagi.

## The intended behaviour, and how each part is proven

`npm run zagi:gates`, the plant flown in Manual against
`tests/zagi-thresholds.json`, 15 gates; bands are the derived figures'
and never widened.

| Gate | What | Derived | Band | Measured |
| --- | --- | --- | --- | --- |
| Z1 | level speed at 75 percent | 22.14 | 19.48 to 24.80 | 21.51 m/s |
| Z2 | the trimmed stall, power off | 7.36 | 6.92 to 8.39 | 7.65 m/s |
| Z3 | best glide | 13.49 | 12.01 to 15.11 | 13.61 at 9.54 m/s |
| Z4 | top speed | 29.69 | 27.01 to 33.26 | 28.73 m/s |
| Z5 | best climb | 8.88 | 6.66 to 11.10 | 8.79 m/s |
| Z6 | full elevon roll, as its helix angle from a full roll's time | 0.2236 | 0.168 to 0.280 | 0.2197, once round in 1.26 s |
| Z7 | pitch: the pitch rate's first peak after a tenth of up stick, and the glide's alpha per degree of elevon | 0.098 s; 1.672 | 0.063 to 0.146 s; 1.42 to 1.92 | 0.096 s; 1.678 |
| Z8 | no rudder: full yaw stick changes nothing | | bit identical | identical |
| Z9 | the straight stall, full up held: wings level, balloons and breaks, mushes | | bank under 5 deg, break within 3 s, past the stall sinking 2 to 6 m/s | 0.7 deg, 1.17 s, alpha 17 deg sinking 3.45 |
| Z10 | a stall in a turn: full roll held into a 30 deg bank spins it; the bank held on the stick does not | | once round within 4 s; within 20 deg | 449 deg; 14 deg |
| Z11 | the hand throw, the motor off for a second | | no contact, above 5 m after 5 s | lowest 0.21 m, 22.8 m: the shell's throw from shoulder height dips close to the grass before the motor comes on |
| Z12 | the belly landing | | at rest upright, the CG 12 mm up | slid 1.4 m, at rest at 10.9 mm, level |
| Z13 | circling a thermal's core, power off | | at least 0.3 m/s up, sinking in still air | 0.58 m/s up; 0.84 m/s down |
| Z17 | every other aircraft's recorded hash | | 15 unmoved | all 15 |
| Z18 | Node and headless Chrome on the Zagi's recording | | identical | identical |

What each is for:

- **Brisk roll on elevons** (Z6): 315 deg/s at 15 m/s, a full roll in 1.26
  s. Of the tables here only the Edge's 3D ailerons (0.576) and the
  Timber's high rate (0.254) ask for a larger helix angle than the Zagi's
  0.224; it is twice the 1000 mm wing's 0.109 and nearly twice the P-51's 0.122.
- **Pitch sensitivity of a tailless wing** (Z7): the Zagi's pitch inertia
  is small (0.0058 kg m^2) and its pitch damping a third or less of the
  tailed aircraft's here (Cmq -1.5, where theirs are -4.2 to -14.8 on
  their own chords), so the nose answers a step in a tenth of a second; with a 9 percent margin a degree
  of elevon moves the trim 1.7 deg, and a third of the elevon's travel
  reaches the stall from the glide's trim.
- **No rudder** (Z8): the table has no rudder, the yaw stick moves no
  surface, and a flight with it held full either way hashes the same.
  Yaw comes from the winglets' weathercock, the elevons' little proverse
  yaw, the swept wing's dihedral effect and drag: nothing else.
- **The stall** (Z9, Z10): see the brief's premise below.
- **Glides well** (Z3): 13.5 to 1; of the power off glides Stabilised
  trims each aircraft to (`npm run stab:glide`) only the Radian's, 18.9,
  is flatter, and the Bramor's, 13.2, is next.
- **Hand launch** (Z11): the existing throw (`sim_wing_launch`, the shell's
  L), 10 m/s from 1.2 m over its rest, motor off as Zagi says.
- **Belly landing** (Z12): the hull's floor is the drawn root's underside.
- **Thermals** (Z13): the Zagi flies in `plant_air_lift`'s thermals
  (`air_lift = 1`), as the Radian, the Slow Stick and the Bombshell do.
  **The maps have no ridge lift**: `plant_wing.c`'s rising air is the
  three thermals and nothing else, and no map declares a slope. None was
  built, as the brief said.

`npm run zagi:stab` holds the stabiliser: Stabilised flies level off the
throw with the sticks centred, banks to 60 deg and pitches to 30,
levels when let go; Acro holds any attitude, inverted included, rolls at
the 220 deg/s it asks for and pitches at 100; Manual rolls past the cap;
the elevons read back at 14.4775 deg each way, clipped there when the
sticks add, and nothing on the yaw stick. `npm run stab:glide` gives
Stabilised's low throttle numbers: the Zagi's glide is nose higher than
its 2 deg trim, so it gets no pitch down, as the Bramor does, and its
cruise stick is 0.400.

## Findings, and what the brief had wrong

- **"A gentle tip-stall-free stall from its washout/reflex" is half
  wrong.** No Zagi publishes washout, and Zagi's own HP manual
  troubleshooting says: "'Tipstall' -- (1) A stall in a turn will result
  in a spin. Spins happen because of too much control or too little
  speed." A scratch builder's advice on Zagi style wings says the same
  without washout ("Zagi has a mean tipstall otherwise", RCU forum,
  labelled forum evidence). What is gentle is the straight stall: "if it
  balloons up and then dives for the ground (stalls)" and "a mush
  condition (partial stall) with a loss of roll control" (CRRC). The
  plant now does both: the straight stall is wings level, the turn with
  too much control spins (Z9, Z10).
- **Dutch roll.** The lattice gives the winglets little weathercock at the
  cruise's lift (Cnbeta 0.017 against 0.038 at zero lift) against a
  strong dihedral effect (Clbeta -0.134), so a full elevon roll from slow
  flight wags: the sideslip swings to 20 to 25 deg and the roll rate with
  it. Flying wing pilots call it wag (FPVLab, "Flying wings, how to
  control wag", labelled forum evidence). It is left as derived.
- **Zagi's 85 mph** is past the plant's thrust model for the published
  motor and prop: 29.7 m/s level.
- **The 400 X's 3.33 sq ft** is inconsistent with its own drawing and the
  400's and THL's 2.83.
- **Hendricks's AVL run** does not agree with the lattice beyond the lift
  slope and the roll damping; its neutral point is the one thing taken.
- **The rest of the brief held**, with these notes: main already had
  `SIM_AIRFRAME_COUNT` 24 and the empty slots refused; `scripts/parts-derive.js
  --write` hung fetching APC's files and was not needed, since the Zagi
  offers no prop but its own (APC's figures cannot tell its spoon shaped
  carbon 5 x 5 from their 5 x 5E, and Zagi measured it 10 to 15 mph
  faster); `zagi.com` no longer resolves.

## The stabiliser, the throw and the landing

The gains are the 1000 mm wing's, scaled by the throws: roll 2.0 and 0.20
stick per rad and rad/s through 14.5 deg where the wing's 1.2 and 0.12
went through 25; pitch 5.0 and 0.5. Acro asks 220 deg/s of roll, 0.7 of
full elevon's 315 at 15 m/s, and 100 of pitch.

## The hull and the drawn model

`src/render/zagicraft.js` draws the derivation's planform: the reflexed 9
percent section, its underside at the root 12 mm under the CG, which is
the plant's `hull_hz_down`; the winglets' tops 0.1267 m over it, the
plant's `hull_hz_up`; the half span and the nose and the winglets' top
trailing corners as `ZAGI_DIMS` says, each held to 2 mm by
`node scripts/craft-preview.js zagi`. At rest on its belly the plant's CG
is 10.9 mm over the grass (Z12), the drawn root's underside on it. The
prop's hub is 52 mm up, so its tip clears the ground by a millimetre at
rest.

## The crash parts

`PARTS_ZAGI1219` in `src/native/crash_parts.h`: the centre section with
the tray, canopy, ESC and receiver; two EPP panels on the flat carbon
spar, one piece with the root, 21 N m at the joint as the 1000 mm wing's,
ESTIMATED;
balsa elevons on tape hinges; plastic winglets taped to the tips; the
inrunner on the tray's ply hard point; the carbon 5 x 5; the 3S 2200 on
Velcro in the bay; the FPV camera and antenna. A part's mass sits at its
hull's centroid, which for a swept panel is 82 mm behind the CG though its
foam is mostly forward of it, so each panel carries 0.10 kg and the root
the rest; at 0.16 the root's residual centre fell outside the airframe
(`npm run crash:core`).

## The scheme

Two schemes (`configs/liveries.js`): Zagi's HP as zagi.com photographs it,
orange covering tape all over, black winglets and a charcoal canopy and
tray; and the 5C combat wing's, yellow with black tape on the leading edge.
The regions are wing, trim, winglets and canopy.

## The sound

The power option's voice is `wing`, the electric motor's.

## In the shell

`configs/airframes.js` seats it as `zagi1219`, `stall` 7.36, `topSpeed`
29.69; three tunes (`configs/registry.js`), Stabilised by default;
`configs/power.js` its 3100 kV pack on 3S 1300, 1500 and 2200 (the stock);
`configs/tuning.js` its CG, 203.2 mm behind the root's leading edge, and
its throws, low at the house's 70 percent; `configs/hangar-parts.js` the
stock prop only, and where things go; the unlock curve puts it at level 4
with the Bombshell (`src/game/progress.js`): past the trainers and the
Skyhunter, since it has no rudder, rolls fast and answers the smallest
touch in pitch, but before the Radian's thermals and the heavier machines,
since it is light, slow to stall and slides in on its belly anywhere; Zagi
sold it to beginners as much as to combat pilots.

## What the owner should feel flying it

Throw it level and hard with the motor off, then open the throttle: it
climbs away steeply. In Manual, a flick of the roll stick rolls it right
round in about a second and a quarter. Touch the pitch stick: the nose
answers at once, and a third of the stick is already the stall. Pull and
hold full up with the wings level: it balloons, the nose drops through the
horizon, and it settles into a steep, wings level mush; let go and it
flies again. Do the same in a turn with the roll stick held in, and it
spins. Close the throttle and it glides a long way; bring it in shallow
and it slides to a stop on its belly.

## Sources

- Zagi HP product page, Zagi LLC: https://web.archive.org/web/2019/https://zagi.com/product/hp/
- Zagi HP Assembly Manual (stock ZH402): https://web.archive.org/web/20151216152823/http://www.zagi.com/pdf/Zagi-HP-w.pdf
- Zagi kits (THL, 5C, HP, HP60), 2017: https://web.archive.org/web/20170423172457/https://zagi.com/category/kits/
- Zagi brushless motor: https://web.archive.org/web/2019/https://zagi.com/product/brushless-motor/
- Zagi propellers: https://web.archive.org/web/2019/https://zagi.com/product/propellers/
- Zagi battery for HP and HP60: https://web.archive.org/web/2019/https://zagi.com/product/battery-for-hp-and-hp60/
- Zagi-400 X Assembly Manual (the planform drawing): https://web.archive.org/web/20050309050227/http://www.zagi.com/pdf/z400x.pdf
- Zagi-400 Assembly Manual: https://web.archive.org/web/20020203052129/http://www.zagi.com/Zagi400.PDF
- Zagi-400 page ("Motor up to those distant thermals"): https://web.archive.org/web/20011221003400/http://www.zagi.com/html/Airplanes/Zagi-400/zagi-400.shtml
- Zagi-THL page: https://web.archive.org/web/20031226013614/http://www.zagi.com/html/Airplanes/Zagi-THL_Flying_Wing.html
- A. Hendricks, ECEn 674 final project, AVL on a Zagi (linked from the uavbook README, https://github.com/byu-magicc/mavsim_public): https://drive.google.com/file/d/1BvIKYjPv6ZW9iafDMKswumowi2FW8CLz/view
- APC 5 x 5E performance data: https://www.apcprop.com/files/PER3_5x5E.dat
- M. Selig et al., Summary of Low-Speed Airfoil Data, vol. 1 (the MH45), as `scripts/stall-derive.js` cites it
- D. Raymer, Aircraft Design: A Conceptual Approach, eqs. 12.15, 12.30, 12.49
- Charles River Radio Controllers, Zagi THL Tips (CG, the stall, the mush): https://charlesriverrc.org/articles/design-and-construction/zagi-thl-tips/
- Forum evidence, labelled as such: RCFAQ, Zagi 400 and FMA Razor 400 (axial rolls, belly landings): http://www.rcfaq.com/REVIEWS/electrics/ZAGI400.HTM; RCU, "Zagi Style Wing Dimensions Anyone?" (tip stall without washout): https://www.rcuniverse.com/forum/scratch-building-aircraft-design-3d-cad-174/513363-zagi-style-wing-dimensions-anyone.html; FPVLab, "Flying wings, how to control wag": https://fpvlab.com/forums/archive/index.php/t-47709.html
