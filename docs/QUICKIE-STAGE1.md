# Quickie 500, stage 1: the aircraft, the model and what it is meant to do

The owner asked for eleven all time great RC aeroplanes, and this is id
22: a Q500 class pylon racer, here because it pairs with the air race
pylon gates the builder already has. What it has to show, each part gated
by a number: a class racer's speed, a fast roll that is not twitchy, a
tight pylon turn that bleeds its energy, carrying its speed where it has
little drag, and the class's own way off the ground. It follows
`docs/UGLYSTIK-STAGE1.md` for the glow engine, the strip ailerons and the
symmetric section, and the plant is `src/native/plant_wing.c` with a table
of its own, `FW_QUICKIE1293`. `npm run quickie:derive` prints every
derived figure below.

## Which Quickie, and why

**Glen Spickler's Quickie 500**, the design American Aircraft Modeler
published in December 1972 ("Quicky 500", its plan full size on Outerzone,
oz6868) and Glen Spickler Radiomodels kitted, string id `quickie1293`,
50.9 in (1293 mm) over the soft block tips as the plan measures. It is the
aircraft the class is named after: the Bakersfield club's one design racer
("B.A.R.K.S. of Bakersfield, One Design Pylon Racer & Sport Flyer", the
plan's title block) whose 500 sq in, .40 engine and fixed gear became
AMA's Quickie 500 events.

| Candidate | Why not |
| --- | --- |
| a modern Q500 or Q40 racer (Nelson, BMJR, composite kits) | no published data table or throws found; a Q40 is a different, faster class |
| an F5D electric pylon racer | the brief allowed it, but F5D is a hand launched 1 kg class of its own; the Q500 is what pairs with a pylon course in a valley, ROG as the rules say |
| Old School Model Works' Quickie 500 kit | the same design, laser cut; its manual is used here for what AAM and RCM do not print: the throws and a second CG figure |

What the sources give together: AAM's article (the plan, the CG, "zero
zero" incidences, how it flies and how fast), RCM's product test of
Spickler's kit (a data table: span, chord, area, fuselage length, low
wing, dihedral, "15% Symmetrical", the stab's span, chord and area, the
fin, engine range, tank, gear, weight, loading, and its prototype's weight,
engine and "Muffler Used: No"), Flying Models' and Model Airplane News'
reviews (how it flies, glides and lands), OSMW's manual (the throws), the
AMA rule book (the class), and Peter Chinn's bench tests of the K&B 40.

Three things the brief assumed are not what this class is, and the model
follows the class:

- **Not hand launched and not a dolly: ROG.** AMA's pylon rules, 13.1.7:
  "All takeoffs shall be ROG", on fixed gear ("The landing gear shall be
  fixed", 16.3.1.d). The Quickie takes off from the ground.
- **Not a high wing loading.** RCM's "Wing loading based on rec. flying
  weight: 16 oz/sq ft", 47.8 N/m², less than the Ugly Stik's 52 and the
  P-51's 65. The AMA rule's minimum weight and area give 17.3 oz/sq ft. A
  Q500's speed comes from a small, clean aeroplane and a .40 on a 9 in
  prop, not from its loading, and its landing is not fast: it touches at
  12 m/s, the Stik's speed, and floats a long way (FM: "the glide ratio
  will amaze you").
- **Not twitchy on sport throws, but fast.** Spickler: "It points well on
  the straightaway and has no tendency to snap roll in the corners." What
  is gated is a 400 deg/s roll that stops where the stick is centred.

### The aircraft, RCM's table and the plan

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.2934 m | the plan, 25.46 in from the centre line to each soft block tip (RCM's table says 50 in, AAM's 51) |
| Wing area S | 0.32565 m², 504.8 sq in | the plan: 10.0 in of constant chord to the tip rib at 23.97 in out, the fuselage's width included as the class measures it, and 12.7 sq in of each rounded tip (pixels counted); RCM's "500 sq. in." is 50 x 10 |
| Chord S/b | 0.2518 m | derived; the drawn chord 10.0 in with its aileron |
| Aspect ratio | 5.14 | derived |
| All up mass m | 1.5876 kg | RCM's prototype, "Weight, ready to fly: 3 1/2 lbs.", taken with the 8 oz tank full, as the Stik's is; Spickler: "its average weight of 3 1/2 to 4 1/4 lb" |
| Wing loading | 47.8 N/m² | derived, 16.0 oz/sq ft, RCM's 16 |
| CG | 2.8 in behind the leading edge, station 14.0 | the plan's C.G. mark; Spickler: "Balance can vary between 1/4 to 1/2 inch behind main spar. It is best to start with the 1/4 inch position" (the spar's aft face 2.4 in back); OSMW: 2.5 in |
| Incidences, thrust | all zero | Spickler: "make sure that everything is 'zero-zero' with no engine offset"; OSMW: "The original had zero down thrust and zero right thrust" |
| Dihedral | 4 deg a side | RCM: "Dihedral (each tip) 1 5/8 inches or 4 degrees"; the plan's detail |
| Section | 15 percent symmetric | RCM: "Airfoil 15% Symmetrical"; the AMA rule asks 1 3/16 in at least |
| Ailerons | strip, 1.0 in of the chord, from 1.54 in out to the tip rib | the plan; Spickler: "the 1 x 1/4 ailerons, which should be hard and stringy" |
| Throws | ailerons 1/2 in up and down, elevator 1/2 in, rudder 3/4 in; 30.0, 19.47 and 22.02 deg | OSMW's "Recommended Control Throws", on the plan's 1.0, 1.5 and 2.0 in surfaces; their arcsines. Past 20 deg a plain surface's lift stops growing in proportion: the Edge's knee, 0.5, reads 30 deg as 20.7 |
| Expo | 20 percent | OSMW: "Roughly 20% on ailerons, 25% on elevator, and 10% on rudder" |
| Fuselage | a box, 2.5 in wide at the firewall and 3.0 at the wing, 35.6 in behind the firewall | the plan's top and side views; RCM "Fuselage Length 37 inches" with the mount |
| Stab | 16 in span, 7.15 in at the root and 5.1 at the tip with a 1.5 in elevator, on the fuselage's top, 96 sq in | the plan; RCM "Stabilizer Span 16", "Chord (incl. elev.) 6 inches (average)", "96 square inches", "Top of Fuselage" |
| Fin | swept 1/4 in sheet, 5.6 in over the fuselage, 27.7 sq in; the rudder 2 in deep, down to the fuselage's bottom | the plan's side view (shoelace area); RCM "Vertical Fin Height 5 3/4" |
| Gear | 5/32 in wire legs to 2 1/4 in Kraft-Hayes wheels, the axles 4 in ahead of the CG and 6.3 in out; a wire tail skid | the plan's side view and its gear detail (the track read as one leg of a pair from the centre line, ESTIMATED) |
| Tank | 8 oz, 236.6 cc | RCM's table |

### The engine: a K&B 40 R/C with no silencer on an APC 9 x 6

RCM's prototype flew a "K & B FR40" with "Muffler Used: No"; Spickler's
club rule was "stock series '71' K&B front intake RC engines and 10%
fuel". The one bench test found of that engine is Peter Chinn's of its
predecessor, the K&B Torpedo 40 R/C Series 70F (Radio Modeller, February
1971): with the Irvine silencer, 0.667 bhp at 12,500 rpm and the curve
read off his graph. He says what the silencer cost: "the equivalent of
only about 200 rpm on a 12 x 6 and 300 rpm on an 11 x 6 but increased
rather more rapidly on smaller prop loads so that the peak of the power
curve occurred much earlier (something like 2,500 rpm earlier, in fact)".
So the open engine is ESTIMATED as the silenced torque times 1.075 (200
rpm at 8,800 and 300 at 11,000 on a fixed prop are 7.0 and 8.4 percent of
power) to 11,000 rpm, then a straight line to a power peak at 15,000:
0.735 bhp there. For comparison, Chinn's racing K&B 40 F/R Series 66 on 30
percent nitro made 1.02 bhp at 16,000 (Aeromodeller, January 1968); the
club Quickie's engine is the throttled R/C one.

The prop is APC's 9 x 6, the Sport Quickie rule's ("Minimum diameter nine
(9) inches. Nominal pitch six (6) inches").

**A racer's engine unloads in the air.** Standing, the 9 x 6 holds the
open K&B to 14,831 rpm, 24.55 N; as the aircraft speeds up the prop needs
less torque and the engine runs up, to 17,217 rpm at 44 m/s (Chinn of the
racing version: "in-flight speeds well in excess of 16,000 rpm"). The
plant's thrust falls linearly from its static value to zero at
`pitch_speed`. Every earlier table set that to the static rpm times the
pitch, 37.6 m/s here, under the speed this aircraft flies at. So
`scripts/power-derive.js` finds the operating point at each airspeed
(APC's torque for the 9 x 6 at that speed against the engine's) and APC's
thrust there, and the line is pinned at the static thrust and passes
through that curve at the level top speed the curve gives, 39.37 m/s:
its zero is at **68.64 m/s**. Between 20 and 40 m/s the line is within 4
percent of the curve. This is a derivation, not a plant change.

| Quantity | Value | How |
| --- | --- | --- |
| Static thrust | 24.553 N, 1.58 times the weight | APC's 9 x 6 at 14,831 rpm |
| Torque, torque arm | 0.3528 N m, 0.01437 m | the engine's at 14,831 rpm, over the thrust |
| pitch_speed | 68.638 m/s | the line above |
| rpm_no_load | 17,448 | 14,831 over 0.85, the static rpm the shell shows at full throttle |
| Idle | 2,700 rpm, 0.1821 | Chinn: "2,700 rpm on an 11 x 6 Power-Prop" |
| Thrust line | 0.47 in over the CG | the crankshaft on the firewall's centre, the CG's height from the masses |
| Fuel flow | 18.0 cc/min | Menon's measured .40 two stroke, 17.9 cc/min, by the displacement, ESTIMATED; 13 min on the 8 oz tank |
| Prop inertia | 6e-5 kg m² | the 9 x 6's 16 g composite blades and the drive washer, ESTIMATED |

The hangar's alternative is the same engine as Chinn tested it, with the
Irvine silencer: 42 g more (306 g against 264), 14,011 rpm and 21.83 N
standing, the line through its own curve at its own top speed, 35.1 m/s,
its zero at 57.0 m/s. The prop is the class's only: the derivation that
swaps props (`scripts/parts-derive.js`) reads the loaded rpm off the
pitch speed, which on this aircraft is the unloading engine's line.

### Mass and inertia, ESTIMATED

The K&B and the Kraft-Hayes mount 0.33 kg at station 3.0, the full tank
0.237 kg at 7.2, the gear 0.075 kg, the wing 0.30 kg, the radio (servos
behind former D, the pack ahead, Castellano in MAN) 0.30 kg at 15.5, the
tail group 0.075 kg at 38.5, pushrods and horns 0.04 kg, and the box the
rest, its own centre at station 19.0. To balance on the plan's mark the
tail needs 2.4 oz of weight at station 39, and so it is modelled: Frank
Tiano (Flying Models, March 1979) needed "3 ounces of tail weight" with a
long Tatone mount. The CG comes out 22.52 in down the plan's sheet, the
thrust line 0.47 in over it. **Ixx 0.0446, Iyy 0.1110, Izz 0.1512 kg m²**.

## The coefficients

Nelson's forms, as the Stik's, per radian, in the plant's chord S/b.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 4.500, 3.590, 2.855 | 2π AR/(AR+2), the wing's times cos² of its dihedral; the fin's AR 1.5 times its own |
| dε/dα | 0.405 | DATCOM, the stab 1.95 in over the wing's chord plane |
| V_H, V_V | 0.460, 0.0269 | the tail's areas and arms off the plan |
| CLα | 4.866 | wing and tail |
| Static margin | 0.166 | the neutral point at station 15.65, the CG at 14.0 |
| Cmα, Cm0, Cmq | −0.8078, +0.0100, −7.183 | Cm0 flies it level flat out with the elevator neutral: a racer is trimmed for the race |
| Cmδe, CLδe | 0.6983, −0.2888 | τ_e 0.47, the elevator 24 percent of the chord |
| CYβ, Cnβ, Cnr | −0.1569, +0.0669, −0.0834 | the fin, less the box's −0.0098 |
| Clβ | −0.0801 | the dihedral's −0.0785, the fin's −0.0097, the low wing's +0.0081 (DATCOM) |
| Clp, Clδa | −0.7501, 0.2405 | strip theory; the strip ailerons 10 percent of the chord, τ_a 0.24, from 0.06 to 0.94 of the half span |
| Cnδa per CL | −0.12 | no differential: the Cub's |
| Cnδr, CYδr, Clδr | −0.0460, 0.0941, 0.0058 | τ_r 0.60 |
| CD0 | 0.0336 | built up part by part at 40 m/s, below |
| e, k | 0.75, 0.08262 | a rectangular wing on a square box |
| CL max, stall blend | 0.90, 3 deg | a 15 percent symmetric section at 1.7e5, the NACA 0015's class less for the Reynolds number, the wing's 0.9 of it, ESTIMATED |
| Stall arms, dw, asym | 0.0303, 0.1211, 0.1338, 0.00397 | `node scripts/stall-derive.js` |
| stall_top, stall_k | 2.0 deg, 0.70 | the Extra's thick symmetric section, ESTIMATED as its is |

The drag, built up (Raymer's form factors and flat plate friction, Hoerner
for the bluff parts), ESTIMATED, on the wing's area:

| Part | CD0 | How |
| --- | --- | --- |
| wing | 0.0112 | 2.04 times the exposed area, Cf 0.0045 at 7e5, form factor 1.30 |
| fuselage | 0.0029 | the box, 300 sq in wetted, Cf 0.0037, 1.30 |
| tail | 0.0031 | flat 1/4 in sheet, 257 sq in wetted, Cf 0.0050, 1.20 |
| engine | 0.0062 | the K&B on its side and the mount, 3.5 sq in at 0.9: the class forbids a cowl |
| gear | 0.0049 | wire legs at 1.2 and wheels at 0.25, 2.45 sq in: the class forbids pants |
| nose | 0.0018 | the firewall's blunt face, 6.1 sq in at 0.15 |
| the rest | 0.0020 | skid, horns, pushrod exits, hinge gaps |
| total | 0.0336 | the sum, 0.0320, and 5 percent for interference |

The DLG's `cd0_re` (the whole CD0 going as a laminar skin's Re^-1/2) is
not used: 36 percent of this CD0 is bluff parts whose drag does not
change with the Reynolds number, and the skin at race speed is turbulent.

## What is new in the plant

Nothing. The Stik's glow throttle and tank, the Edge's surface knee
(`surf_knee`) and strip aileron term (`strip_tau`), the P-51's prop
inertia (`j_prop`), the Bombshell's wire tail skid and the stall model fly
it. What is new is how one number is derived: `pitch_speed` as the zero of
the thrust line through an unloading glow engine's thrust in the air. Every
other aircraft's recorded hash is unmoved (Q16).

## The intended behaviour, and how each part is proven

Each part is a gate in `scripts/quickie-gates.js`, flown in Manual, its
band in `tests/quickie-thresholds.json` set from the derivation.
`npm run quickie:gates`: **18 of 18**.

| Check | Derived | Band | Measured |
| --- | --- | --- | --- |
| Q1 top speed, level, full throttle | 39.37 m/s, 88.1 mph | 38.0 to 43.3: 10 percent of the derivation inside 15 percent of Spickler's "around 100 mph on the straightaway" | 39.39 |
| Q2 stall, power off | 9.31 m/s | 8.76 to 10.62 | 10.30 (the plant's curve rounds off short of CL max, as every aircraft's does) |
| Q3 glide at 1.4 Vs | L/D 8.99 (best 9.48 at 11.1 m/s) | 8.00 to 9.98 | 9.01 at 13.5 m/s |
| Q4 best climb | 18.7 m/s at 21.6 | 13.1 to 22.4 | 19.1 at 25.7 m/s, 49 deg of pitch |
| Q5 full aileron flat out | pb/2V 0.1159, 404 deg/s | 0.0927 to 0.1391 | 0.1150, 420 deg/s at 41.2 m/s |
| Q5b 0.3 s of full aileron, centred | the roll mode's 9 ms: 3.6 deg of run on | under 7 deg, under 20 deg/s 0.3 s after | 115 deg in 0.3 s, ran on 0.1 deg, 2.3 deg/s |
| Q6 a 180 deg pylon turn at 6 g, no rudder | 4.79 percent of the speed lost, 24.2 m radius, 2.07 s | 3.1 to 6.5 percent, 20.6 to 27.8 m, sideslip under 5 deg | 4.66 percent, 38.8 to 37.0 m/s, 25.4 m, sideslip 1.3 deg |
| Q7 idle from flat out, height held, to 1.5 Vs | 9.83 s, 226 m | 8.36 to 11.30 s, 192 to 260 m | 10.82 s, 244 m |
| Q8 a 10 g corner | 10.25 percent lost, alpha 5.9 deg against the stall's 10.6 | 6.7 to 13.8 percent, bank within 12 deg, roll under 90 deg/s | 9.38 percent, bank within 10.3 deg, roll 17 deg/s |
| Q9 20 deg bank let go, at 3 s | 18.2 deg (spiral half life 25 s) | 12 to 24, never past 26 | 13.0 |
| Q11 prop torque | 0.3528 N m | 0.30 to 0.41, rolling left | 0.353, rolling left |
| Q12 at rest idling | 6.50 deg, 0.1325 m, 14.6 percent on the skid | 5.47 to 7.47, 0.1276 to 0.1376, 8 to 20 | 6.47, 0.1326, 13.4 |
| Q13 take off, ROG, three point | 5.66 m at 11.90 m/s | 3.96 to 7.36 m, 10.25 to 13.98 m/s | 5.89 m at 12.20 m/s |
| Q14 landing | | at rest within 1.5 deg of Q12, no bounce past 5 cm, no hull or prop | touched at 12.1 m/s sinking 0.89, rose 0.1 cm, rolled 38 m |
| Q15 idle on the strip | 2,700 rpm, 0.81 N against 1.86 | 2,600 to 2,800, under 2 mm/s | 2,701, 0.5 mm/s |
| Q16 other aircraft unmoved | main's hashes at a894327 | identical | identical, twenty one |
| Q17 Node and Chrome | | identical | the same hash both |
| Q18 on its back flat out | as upright, a push of 0.094 | within 5 percent, a push of 0.056 to 0.132 | 39.39 against 39.39, 0.094 |

There is no Q10: at race speed the phugoid is damped to 0.90 of critical
and has no period to measure.

### What changed after the plant first flew

The rule is that a band is never widened to pass. One gate's first form
could not be flown, and one reading needs a word:

- **Q13, the take off.** Its first form lifted the tail at 8 m/s and
  eased it off at 1.2 Vs, 6.12 m at 12.39 m/s derived. Flown, on its
  mains the wheels' drag under the CG and the thrust line over it held the
  nose down, and the gate's hand did not rotate it until 32 m/s. It is now
  flown three point, the rest attitude held on the elevator, as RCM
  describes it ("extremely easy tail dragger take-offs"), and derived the
  same way. The band's form is unchanged: the distance 30 percent either
  side of the derivation, the speed between 1.1 and 1.5 Vs.
- **Q6 and Q8, the load the hand pulls.** The gate's hand asks the plant's
  own CL for 6 g and 10 g, but its roll in and its integral mean the turn's
  average is 5.65 g and 8.83 g. The derivation's losses at those loads are
  4.2 and 8.6 percent; both measured losses, 4.66 and 9.38, sit inside the
  bands set at the full loads.

### Its stall, and what a pilot should expect

`npm run stall:probe -- --only quickie`: full back from 1.15 Vs, the wing
stalls at 1.70 s and the nose drops 9.4 deg with 3.0 deg of wing drop; it
settles in a mush at 12.4 deg of alpha and 11.5 m/s, banked 4 deg; full
back at once, the nose drops 14 deg; full back and full rudder make a
spiral, not a spin; let go, it recovers in 0.12 s. A straight untwisted
wing on a symmetric section: FM's "The ship just settles in with a
constant rate of descent", and MAN's "The plane will never drop a wing
tip". At race speed full up is 14.6 g and meets the stall; Acro asks 150
deg/s of pitch, under it.

## The ground: wire gear and a tail skid

| Quantity | Value | How |
| --- | --- | --- |
| Mains | x +0.1016, y ±0.160, z −0.1163 drawn, −0.1213 unloaded; r 0.028575 | the plan's axles, 4 in ahead of the CG and 4.6 in under it; 2 1/4 in |
| Skid | x −0.696, z −0.0541 drawn, −0.0591 unloaded | the plan's wire tip, 27.4 in behind |
| Rest | 6.50 deg nose up, the CG 0.1325 m up; idling 6.47 deg and 0.1326 m | the ground line under the wheels and through the skid |
| Stiffness, damping | mains 1330 N/m, 39.0 N s/m; skid 455, 11.6 | 5 mm of static deflection, 0.6 of critical |
| Friction | wheels 0.08 rolling, 0.70 side; the skid 0.35 and 0.50 | the Cub's tyres, the Bombshell's wire skid |
| Steering | none | the skid does not steer; the rudder does, in the prop's blast |
| Prop tip | x +0.3327, z −0.1023 | the 9 x 6's tip, 42 mm over the grass level on the mains, 68 mm at rest |
| Hull | hx 0.40, hy 0.6467, 0.041 down, 0.050 up | the centred box, for crashes only |
| Camera | x +0.127, z +0.0593 | on the hatch over the tank |

## The crash parts

`PARTS_QUICKIE1293`, 17 parts, balsa, spruce and ply (nothing crushes;
a joint cracks past its onset and breaks past its limit), `node
scripts/crash-parts-table.js` prints it:

| Joint | Limit | Derivation |
| --- | --- | --- |
| rear fuselage | 100 N m, 500 N | 3/16 in sides and 1/8 in sheet, 2.1 in deep and 1.2 wide ahead of the fin: Z 8.0e-6 m³, 160 N m at 20 MPa, two thirds for glue and buckling, ESTIMATED; it carries the 2.4 oz tail weight |
| wing on its bolts | 50 N m, 500 N | two 1/4 in dowels ahead and two 10-24 nylon bolts behind, which shear first by design, ESTIMATED at 250 N each |
| each panel | 80 N m up and down, 60 fore and aft | spruce spars with vertical grain webs and 3/32 in sheeting, Z 4.8e-6 m³, taken for the glassed root joint, ESTIMATED |
| stab, fin | 15, 12 N m | their sheet on edge and their glue lines, ESTIMATED |
| elevator, rudder | 1.5, 1.0 N m | the hinges, ESTIMATED |
| engine | 20 N m, 600 N | the Kraft-Hayes mount on 1/8 in ply formers, ESTIMATED under the Stik's 1/4 in |
| prop | the planes' bound | APC's glass filled nylon |
| wire legs | WIRE_M of 5/32 in | music wire |

`npm run crash:core`: 268 passed.

## The stabiliser

The Stik's loops with the Quickie's gains. Stabilised asks a bank of 60
deg and a pitch of 30 with the turn coordinator. A racer trimmed flat out
glides with the elevator neutral at its trim's alpha, 0.71 deg: throttle
closed it dives at 33.6 m/s, 28.7 deg nose down, and ArduPilot's
STAB_PITCH_DOWN rule, which every fixed wing here follows, asks exactly
that (`npm run stab:glide`: 30.66 deg; `npm run stab:chop`: sink 16.58 m/s
at 33.84 against the derived 16.48). A pilot landing in Stabilised holds
up stick. Acro asks 340 deg/s of roll, 0.85 of full aileron's 404 at the
trim, and 150 of pitch, under full up's 209 at the trim. `npm run
quickie:stab`: **56 passed**.

## The covering

Spickler's own as AAM's colour photographs show it ("Stars and stripes,
would you believe"): white, a red stripe fanning across each wing panel,
a blue band along the leading edge with white stars, red and blue
stripes down the fuselage and on the fin. The places are ESTIMATED off
the photographs. The livery's regions are `wing`, `fuselage`, `tail`,
`stripe` (the red) and `trim` (the blue).

## The sound

`src/render/audio.js`, voice `glow2`: the Stik's two stroke, at this
engine's rpm, 247 Hz at the static 14,831. The shell shows and sounds the
static rpm at full throttle; the run up in the air is in the thrust, not
the note.

## In the shell

`quickie1293`, simId 22, with Acro (the default), Stabilised and Manual
rows, its FPV camera on the hatch, `gear` from the plant's settled pose
idling, and its voice. On the unlock curve at **level 7, with the P-51**:
Spickler's "I don't consider the Quicky 500 a trainer, but anyone who has
advanced to the aileron stage shouldn't have any problems", FM's "not
intended for the beginner". It handles as gently as the Stik (3) and
stalls as straight, but at nearly twice its speed, on a taildragger with
no steerable wheel: the pace is the step, and 6 already holds the Bramor
and the NRJ. (The Pitts, merged since, put the aerobats and the F-16 one
level later.)

The drawn model, `src/render/quickiecraft.js`, is the plan's outline. `npm
run check:craft`: the drawn span 1437.6 mm (the elevator's trailing edge,
further aft than the tips reach out) and reach 747.0 mm (the elevator's
tip corner) against the table's, and the hull up and down 166.9 and 144.9
mm against the drawn. Seated at rest on swiss2 its CG is 0.1326 m over
the ground (`window.__ground()`), the plant's own rest.

## The pylon course

`npm run quickie:course` (`scripts/quickie-course.js`, the Edge's course
flown on the Quickie): six air race pylon pairs stood on the valley floor
with the builder's own controls, a stadium of two 300 m straights 140 m
apart, flown on the sticks by a pilot in the page in Acro, flat out, 18 m
over the grass. On swiss2 and on the Alps (2026-09-29, SIM_GPU=1): a lap
through all six pairs in 31.7 s over 1.10 km, a mean of 35.8 m/s against
the 33.5 asked (0.85 of its top speed), no pylon touched, no crash, no
page errors, on both.

## Nothing else moved

`npm run crash:identity` (2026-09-29, against main at a894327): every gate
and self test prints the same with this tree's module as with main's,
except three whose scripts now name airframe 22, which main's module
refuses: whoop:gates and wing:contact set it and main's module throws,
and glider:stab counts one empty slot fewer. The crash physics on column
differs where it did on main before this aircraft. `npm run power:check`
changed one thing for every glow aircraft: the dead stick glide is flown
at 1.4 Vs where the cruise is faster, and its sink measured after the
zoom that slowing makes, because a racer's cruise is its race speed,
where it sinks at 9 m/s; the Bombshell, the Kadet and the Stik still pass
it, 134 of 134. `npm run verify`: 16 of 16.

## The owner's test

`npm run quickie:owner` flies it in the real shell on swiss2 in Manual,
timed on the plant's clock, with SIM_GPU=1 (2026-09-29), all hold:

| Part | Measured | Band |
| --- | --- | --- |
| off the ground, held three point | 12.45 m/s after 6.16 m in 0.97 s | Q13, 10.25 to 13.98 m/s, 3.96 to 7.36 m |
| level flat out | 39.39 m/s, 88.1 mph | Q1, 38.0 to 43.3 |
| full aileron once round | 0.93 s, peak pb/2V 0.1154 at 40.1 m/s | Q5, 0.0927 to 0.1391 |
| a pylon turn at 80.4 deg of bank, 180 deg round | 39.45 to 37.49 m/s, lost 4.97 percent, 24.8 m radius, sideslip 2.1 deg, 2.05 s | Q6, 3.1 to 6.5 percent, 20.6 to 27.8 m, under 5 deg |

In a room the Quickie draws as a peer in its own airframe and paint:
`scripts/rooms-two-page.js` with page B on `quickie1293`, against a local
`node edge/rooms/node.js`, 13 passed (A draws B as the Quickie in B's blue
with its red and blue stripes kept, on seat 2's slot, and sees it up and
moving).

## What the owner should feel flying it

A small, clean, square aeroplane that goes very fast and does exactly
what it is told. Off the grass in six metres, held on its tail. Flat out
it does 140 km/h, nearly twice the Stik, and holds its line down the
straight with the sticks let go. Full aileron rolls it round in under a
second, and it stops dead where the stick is centred. Rolled onto its side
and pulled round a pylon it turns flat, with no rudder, and comes out of
every 180 degrees about 2 m/s slower: a racer's corner costs speed. Close
the throttle and it coasts for ten seconds before it is slow, and glides a
long way to a landing at the Stik's speed with no bounce.

## Sources

- Glen Spickler, "Quicky 500", American Aircraft Modeler, December 1972, and its plan, Outerzone oz6868 (outerzone.co.uk/plan_details.asp?ID=6868): the plan, the CG, "zero-zero", the speed and how it flies, the club's engine rule.
- RCM Product Test, "Glenn Spickler Radiomodels Quickie 500" (Outerzone oz6868's supplement): the specification table and the prototype's weight, engine and "Muffler Used: No".
- Frank Tiano, "Spickler's Quickee 500", Flying Models, March 1979, and Tom Castellano, "Field and Bench", Model Airplane News, May 1975 (Outerzone oz6868's supplements): the tail weight, the glide, the landings, the radio's place.
- Old School Model Works, Quickie 500 construction manual (oldschoolmodels.com/pdf/q500-manual-web.pdf): the throws and expo, the CG, "The original had zero down thrust and zero right thrust".
- Academy of Model Aeronautics, Radio Control Pylon Racing 2024-2025 (modelaircraft.org/sites/default/files/events/rule-books/RC_Pylon_Racing_2024-2025.pdf): events 424 and 426, the airframe, prop, fixed gear and "All takeoffs shall be ROG".
- Peter Chinn, "K&B 40 R/C Series 70F", Radio Modeller, February 1971 (sceptreflight.com/Model Engine Tests/K&B 40 Series 70F RC.html): the power curve, the silencer's cost, the idle, the weight; and "K & B Torpedo .40 F/R", Aeromodeller, January 1968 (sceptreflight.com, K&B Torpedo 40 FR Series 66): the racing version's 1.02 bhp and its in-flight rpm.
- APC Propellers' performance data, PER3_9x6.dat (apcprop.com/files/PER3_9x6.dat).
- Menon, 2010, the measured two stroke fuel flow (the power.js MENON reference).
- Nelson, Flight Stability and Automatic Control; USAF DATCOM; Raymer, Aircraft Design: A Conceptual Approach (form factors); Hoerner, Fluid Dynamic Drag; Sheldahl and Klimas, SAND80-2114 (the NACA 0015).
