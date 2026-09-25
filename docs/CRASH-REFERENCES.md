# Crash references: what real crashes do, and the suite's bands

docs/CRASH-PLAN.md holds the crash loop to a suite of scenarios judged
against bands "taken from references rather than from the plant". This is
where those references are, what each one measured, and every band the
suite (`scripts/crash-suite.js`, `tests/crash/bands.json`) judges against,
with its source and how far to trust it. Nothing here was read off the
plant: a band that the plant misses is the plant's problem, and changing a
band needs a better reference, argued here, never a better plant number.

Confidence grades, used in every table: **HIGH** measured, primary source,
the same class of object; **MED** measured on a related object, or a simple
derivation from primary data; **LOW** an engineering estimate or an
anecdote, a starting band a better source should replace. Most bands are
LOW or MED. That is the honest state of the published record for model
aircraft crashes, and section 5 lists what would raise them.

Every number below was found in the text of the cited source, or is
marked DERIVED with its arithmetic, or ASSUMPTION. The research was web
only; no video was downloaded or committed. Three figures were rechecked
against the source PDF text a second time: the NASA Cessna 172 test 2
timings (flip starting at 0.240 s, upside down at 1.976 s, at rest at
6.790 s), the ASSURE A14 finding that "puller prop aircraft have upwards of
three times the injury potential to that of a pusher prop", and the A3
drop test's 2,833 N peak.

## 1. How the suite measures, and what that means for the bands

- **Every scenario is flown with crash damage on** (`sim_set_damage(1)`;
  the whoop on the whoop's own part table, `sim_set_part_table(1)`, as
  the shell flies it). The rigid hull's expectations do not carry over:
  a band is judged against what the damaging plant does, and every band
  is still from a reference, never from that plant.
- **Peak load (peakG)** is the largest change of the CG's velocity over one
  1 ms step, less gravity, in g. The plant resolves a contact that
  damages nothing as an impulse inside one step (src/native/sim.c, and the
  shell's `sim_contact_at`), so for those this is an upper bound: real
  contacts last milliseconds (R-A3-DROP: about 11 ms for a plastic quad,
  0.4 to 2.8 ms for a motor or a battery on its own). With damage on, a
  contact that crushes foam lasts as long as the crush does
  (docs/CRASH-STAGE1.md, "Crush is the contact's duration"), and that is
  the physical duration the bands mean; a contact under every limit is
  still one step, by the bit identity rule. peakForceN is the same times
  the mass.
- **retainedFirst** is the energy kept through the first contact: kinetic
  energy 100 ms after it, plus the height gained, over the kinetic energy
  it arrived with. One minus the references' "energy dissipated".
- **dissipatedFrac** (reported, not banded) is the same to rest.
- **At rest** is slower than 0.15 m/s and turning slower than 0.5 rad/s for
  500 ms. **timeToRestS** and **restDistM** (horizontal) run from the first
  contact. On water, where a floating aircraft drifts, a run can end
  without a rest, which fails a time to rest band by having none.
- **restAttitude** is upright (body up within 45 deg of world up),
  inverted (within 45 deg of down), nose down (pitch below minus 50 deg),
  or on its side. **minUpZ** is the lowest the body's up axis got after the
  first contact, 1 upright to minus 1 inverted: a cartwheel or a flip has
  to pass through its back.
- **What broke (mustBreak, mustNotBreak, mustDamage)** is read from the
  crash core's damage readback (tests/crash/readback.js, through the
  shell's own reader, src/game/damage.js) after every step. A part is
  broken when it has left the aircraft or its damage is 1, damaged when
  its damage is above 0 (a chipped prop, a crushed nose, a bent arm), the
  definitions docs/CRASH-STAGE1.md gives. Bands name parts by the module's
  kinds (configs/parts.js PART_KINDS) and one group, `tail`, which is the
  stabiliser, the fin, the boom, the elevator and the rudder. mustBreak
  asks every part named to be broken, mustDamage every part named to be at
  least damaged, mustNotBreak none of them broken.
- **Reported from the readback, not banded:** the damage flags seen, the
  events by type, the energy the parts absorbed (their own tally and the
  events' sum), each part's peak load over its limit (the larger of its
  state's per step peak and its events' ratios, since a part that breaks
  leaves in the step that loaded it), the first break after the first
  contact (firstBreakS), and how many pieces left and how far the
  farthest lies (debrisCount, debrisMaxDistM).
- **The whoop** in the shell is the five inch's plant flown in a room built
  MICRO_SCALE (3.43) times life size (configs/airframes.js). Its scenarios
  are flown at a real whoop's speeds times 3.43 and read back divided by
  it: speeds, distances and peak g are real whoop units. Energies are not
  comparable, because the mass is the five inch's 0.71 kg, not 23 g.
- **The pilot after the hit.** Every pilot centres the sticks and closes
  the throttle at the first contact. A five inch pilot also disarms 250 ms
  later (R-DISARM), with the shell's own disarm, the motors parked by
  `sim_motor_override(-1, 0)`, in every five inch scenario but the turtle
  one; the whoop's pilot flies on, as its references do.
- **The contact** with an obstacle is the shell's call (src/main.js: the
  patch from `contactPatch`, a blade strike of 0.28 times the impulse over
  12 m/s, and `sim_contact_at_mat` with the module's material where its
  numbers are the shell's own for that kind, src/game/crashworld.js
  `obstacleSurfaces`, else `sim_contact_at` with `contactMaterial`).
  Detection is the suite's own, the airframe's sweep disc against a plane,
  a capsule or a sphere, because the plant has no scene geometry.
- **The world is named to the plant as the shell names it:** the ground's
  material (grass outdoors, including the 30 degree slope; today's
  contact on a whoop's floor), every solid as `sim_obstacle_box` or
  `sim_obstacle_cylinder` for the parts that break off, and a tree as
  `sim_tree_add`: its trunk a solid the sweep meets, its crown a cylinder
  the plant holds and the craft flies into, which counts as a contact
  (`crown`) while the craft is in it.
- **Determinism** hashes the state block and every part's state, and the
  damage readback each replay ends with (Node and Chrome) must equal the
  live run's.

## 2. The references

Each has an id the bands cite.

**R-A4-OFFSET, R-A4-REBOUND. FAA ASSURE A4, UAS Ground Collision Severity
Evaluation, final report (2017).**
https://assureuas.com/wp-content/uploads/2021/06/A4-Final-Report.pdf
(mirror https://rosap.ntl.bts.gov/view/dot/32209/dot_32209_DS1.pdf).
Phantom 3 onto a Hybrid III dummy. Three horizontal impacts at 3.75 m/s
gave 25.05, 60.65 and 43.18 g on the head: an offset hit that rotated the
quad away cut the peak by more than half (R-A4-OFFSET). The soft versus
rigid comparison: steel and wood of the Phantom's mass reached the same
head load at about 23 ft lbf where the Phantom needed 128 to 181 ft lbf, so
a plastic quad takes 5.6 to 7.9 times the energy for the same load
(DERIVED). Appendix I, ERAU finite element study of a plastic quad and a
plastic fixed wing onto rigid ground (simulations, not tests), R-A4-REBOUND:
a quad at 20 m/s and 30 deg rebounds at 9.7 to 14.1 m/s and travels 6.5 to
8.4 m; at 60 deg 2.3 to 3.3 m/s and 0.5 to 1.1 m; at 30 m/s and 40 deg 14.8
m/s and 9.2 m. A fixed wing at 20 m/s and 30 deg rebounds at 2.5 to 4.3 m/s
over 1.3 to 2.5 m; at 30 m/s and 45 deg 3.7 m/s; at 75 deg 0.6 to 0.8 m/s.
DERIVED rebound speed ratios: quad 0.5 to 0.7 at 30 deg, 0.12 to 0.17 at 60
deg; fixed wing 0.12 to 0.22 at 30 deg, 0.03 to 0.04 at 75 deg. Also the
parachute floor used by R-CHUTE: "18.0 ft/s [5.5 m/s] is assumed to be the
lowest reliable rate of descent".

**R-A3-DROP, R-A3-PARTS. FAA ASSURE A3, UAS Airborne Collision Severity
Evaluation, Volume II, Quadcopter.**
https://assureuas.com/wp-content/uploads/2021/06/A3-Volume-2.pdf
A Phantom 3 ballasted to 2.03 kg, dropped 5.18 m flat onto a load cell:
"one of the legs experienced failure. The maximum force recorded by the
load cells was of 2,833 N"; mainly the plastic legs deformed. DERIVED:
10.1 m/s at impact, 142 g, a pulse of about 11 ms if half sine. Gas gun
tests of the parts on their own (R-A3-PARTS): contact 1.8 and 2.8 ms for
the battery, 0.4 and 1.0 ms for the motor, 1.0 ms for the camera, and "the
dense, rigid, components ... perforated the aircraft skin": the plastic
round the motors and the battery gives, the motors and the battery keep
going.

**R-A14-FOAM. FAA ASSURE A14, UAS Ground Collision Severity Evaluation
2017 to 2019.** https://www.assureuas.com/wp-content/uploads/2021/06/A14-Final-Report.pdf
and Annex A https://assureuas.com/wp-content/uploads/2021/06/A14-Annex-A.pdf.
Impact tested foam aircraft including a "Radian" (2.5 lbf, puller) and a
"Skyhunter" (6.9 lbf, pusher), the nearest measured matches to the sim's
Radian Pro and Skyhunter 1800. Foam pushers: 0.3029 to 0.3373 g per ft lbf
on the head, about 5 times softer than the Phantom 3's 1.5441 (DERIVED);
"the hollow volumes with the aircraft nose sections function as crumple
zones". "Puller prop aircraft have upwards of three times the injury
potential to that of a pusher prop due to the pointed spinner and the
concentrated mass of the prop, spinner, and motor". eBee+ noses "break at
impact speeds of 25 ft/s [7.6 m/s] and higher" against a rigid target, at
the hole behind the battery bay; against the compliant full dummy they
stayed whole and the wings came off. S800 hexacopters under parachute: 10
of 12 landings broke one or more motor arms. DERIVED foam nose check for a
Skyhunter at the stall, 70 J: 16 to 18 g on the head, about 700 to 800 N,
35 to 40 g on the aircraft; an EPO nose crushing at 0.2 MPa over 50 by 60
mm (ASSUMPTION) gives 600 N, 30 to 45 g, 0.12 m of crush: consistent.

**R-WHOOP. Svaty et al., Impact analysis assessment of UAS collision with a
human body, PLoS One 2025.** https://pmc.ncbi.nlm.nih.gov/articles/PMC11949360/
49 drops of 19 drone types onto a Hybrid III head, including a 0.03 kg
tiny whoop: 8.78 m/s 7.27 g, 12.11 m/s 8.86 g, 15.97 m/s 3.31 g, 13.50 m/s
5.62 g on the head; no damage to the whoop is reported (not confirmed
either way). DERIVED, with a 4.5 kg head (ASSUMPTION): about 320 N at 8.8
m/s, a 1.3 ms pulse, about 1,100 g on the whoop itself, an upper end for a
rigid target. The whoop bands combine this with the plan's premise that a
whoop is built to survive walls and floors; they are LOW.

**R-ARM. Carbon plate data and a derived 5 inch arm limit.** Easy
Composites carbon sheet datasheet,
https://media.easycomposites.eu/datasheets/EC-TDS-Double-Sided-High-Strength-Carbon-Sheet.pdf :
flexural strength 571 to 880 MPa and modulus 45 to 55 GPa along the
weave, tensile strength about 190 MPa at 45 deg; DragonPlate gives about
600 MPa and 70 GPa, https://dragonplate.com/just-how-strong-is-carbon-fiber .
DERIVED for a 5 mm arm, 12 mm wide at the root, 75 mm free (geometry an
ASSUMPTION), 700 MPa: fails at about 470 N on the motor from above or
below, 1,100 N sideways, storing about 2.5 J either way. A 0.71 kg quad has
80 J at 15 m/s, 320 J at 30 and 719 J at 45: one arm holds about 1 percent
of a 30 m/s crash, so an arm that takes the load path against something
rigid breaks, and most arms that survive do so because the energy went
into spin, rebound and props. No primary source for a measured arm failure
(hammer test, Rotor Riot, Chris Rosser, Joshua Bardwell) was found; pages
that gave numbers read as unsourced and are not used.

**R-PROPS. Prop materials.** Polycarbonate, Covestro Makrolon 2407,
https://www.ledil.com/wp-content/uploads/2017/07/MDS_Makrolon_2407_ISO_en.pdf :
yield 66 MPa at 6 percent, strain at break above 50 percent, unnotched
Charpy no break: a PC prop bends before it breaks. Glass filled nylon, BASF
Ultramid A3WG6, https://www.albis.com/de/products/download/doc/en/SI/basf/UltramidA3WG6.pdf :
strain at break 3 to 5 percent, it snaps. Oscar Liang,
https://oscarliang.com/propellers/ : FPV props are "typically made from
durable plastic, specifically polycarbonate ... allowing propellers to bend
or warp in crashes without breaking easily". A retailer's ordering, "the
first casualty is a propeller, then a bent motor bell or cracked arm"
(https://www.unmannedtechshop.co.uk/blogs/knowledge-base/fpv-drone-crash-diagnosis-damage-checklist-after-impact),
has no statistics behind it: LOW.

**R-FOAM. Foams.** EPP (ARPRO, ASTM D3575, via
https://rapiddiecut.com/website_rdc/static/src/datasheets/closed_cell_foam/EPP%20Physical%20Properties_RDC%20(1).pdf):
30 g/l crushes at 0.12 to 0.23 MPa from 10 to 50 percent strain, about 77
kJ/m3 to 50 percent (DERIVED), 7 to 14 percent permanent set: it recovers.
EPS (EUMEPS White Book, EN 13163,
https://my.civil.utah.edu/~bartlett/Geofoam/EPS%20White%20Book%20-%20European%20Standard.pdf):
the 10 percent crush stress is 10 kPa per kg/m3 of density less 109.1 kPa,
91 kPa at 20 kg/m3; the set is permanent. Depron (Swiss-Composite,
https://www.swiss-composite.ch/pdf/t-Depron-Daemmplatten-e.pdf): 0.10 to
0.15 MPa. EPO, what the foam aircraft here are made of: no primary
datasheet found; the nearest documented material is NOVA's ARCEL
(https://www.novachem.com/wp-content/uploads/ARCEL-vs-EPP-Properties.pdf),
so EPO is taken as EPP's order of stress that keeps its dent (ASSUMPTION).

**R-SLOWSTICK. The Slow Stick's failures.** Crodog's log,
https://www.crodog.org/slowstick/slowstick.htm : "the prop shaft was
slightly bent", "broke a bit of the plastic piece that holds the landing
gear", "torn and punctured wing" from a tree, and on its landings, "Almost
every landing so far has been a shallow or steep dive into the weeds. The
plane holds up well to these landings"; its first take offs from the
ground "would barely get into the air", and after that it was hand
launched. The aluminium boom (6063,
yield about 97 MPa, https://en.wikipedia.org/wiki/6063_aluminium_alloy)
bends and kinks rather than breaking; its section was not verified.

**R-TURTLE. Turtle mode.** Oscar Liang,
https://oscarliang.com/setup-turtle-mode-flip-over-after-crash/ : "It works
best on flat surfaces and less reliably on grass, especially when the
props are tangled"; "only works if the props aren't obstructed".

**R-PROPLOSS. Losing a prop.** Mueller and D'Andrea, ICRA 2014,
https://hiperlab.berkeley.edu/wp-content/uploads/2018/05/2014_StabilityAndControlOfAQuadrocopterDespiteTheCompleteLossOfOneTwoOrThreePropellers.pdf :
a quad that loses a prop can be kept in the air only by a controller that
lets it spin continuously about an axis; Betaflight has no such mode (not
verified in Betaflight's documentation), so the outcome is a fast yaw spin
and a fall.

**R-C172. NASA full scale crash tests of Cessna 172s (Littell et al.
2015).** https://ntrs.nasa.gov/api/citations/20160006503/downloads/20160006503.pdf
Test 1, a stalled flare onto concrete: tail strike at 0.125 s, 4.1 to 5.9 g
sustained, a rebound keeping most of the forward speed, little damage.
Reread in round 5 (the report's Table 4 and "Test 1 Results"): "Test 1 was
designed to simulate a flare to stall onto a rigid surface such as
concrete", while "Tests 2 and 3 were designed to simulate controlled
flight into terrain conditions". Test 1 arrived at 60.2 ft/s (18.3 m/s)
forward and 23 ft/s (7.0 m/s) down, pitched 1.48 deg nose up, nose gear
first and the mains 6 ms later; "The airframe main gear compressed almost
to the point of belly impact", "the aircraft rebounded with most its
horizontal velocity maintained", "With the exception of the tail, there
was no noticeable damage on the fuselage". DERIVED Froude scaling to a 1.4
m model (span ratio 0.127, speeds times its square root, 0.357): 6.5 m/s
forward, 2.5 m/s down, the sink a Cub's own wing gives mushing at its
CLmax (docs/STALL-STAGE1.md: 1.5 to 2.5 m/s). Test 1 is the report's only
stall; test 2 below is a flight into terrain, not a stall.
Test 2, nose down into soft soil at 20.9 m/s forward and 8.6 m/s down: the
left wing and nose gear broke away at about 0.10 s, "After 0.240-seconds the
airplane started to flip over", "landed upside-down approximately
1.976-seconds after impact", "came to final rest 6.790-seconds after
impact". Test 3, tail first: upside down at 1.530 s, at rest at 4.920 s.
DERIVED Froude scaling to a 1.4 m model (the C172's span of about 11 m an
ASSUMPTION): inverted at about 0.55 to 0.7 s and at rest at about 1.8 to
2.4 s, valid for impacts near the model's own stall speed.

**R-AFH. FAA Airplane Flying Handbook, FAA-H-8083-3C.**
https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/00_afh_full.pdf
Ground loops tip the airplane "until one wing strikes the ground"; "If the
airplane strikes the ground during the turn, cartwheeling could occur."
Trees: "Brush and small trees provide considerable cushioning and braking
effect without destroying the airplane"; "hang the airplane in the tree
branches"; an uneven contact risks "the loss of one wing, which invariably
leads to a more rapid and less predictable descent to the ground".

**R-SLIDE.** A belly slide from 1.5 to 2 times the stall: stopping distance
v squared over 2 mu g with a foam belly on grass at mu 0.3 to 0.6
(ASSUMPTION): 10 m/s slides 8.5 to 17 m (DERIVED). LOW. Round 5: the
bands were one 8 to 30 m (2 to 5 s) for every belly slide, derived at 10
m/s, while the scenarios arrive at the aircraft's own 1.5 to 2 times the
stall (the premise above; the approach flown on the sink rate touches
down anywhere in it). Each belly band is now R-SLIDE at that aircraft's
own V_s (tests/crash/scenarios.js CRAFT): the shortest slide is 1.5 V_s
at mu 0.6, the longest 2 V_s at mu 0.3, the times v over mu g at the same
ends, rounded outward. Neglected, in both directions: the wing's lift
unloading the belly (longer) and the airframe's drag (shorter).

**R-SEAPLANE. FAA Seaplane, Skiplane, and Float/Ski Equipped Helicopter
Operations Handbook, FAA-H-8083-23.**
https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/seaplane_handbook
(copy used: https://www.seaplanescenics.com/documents/faa-8083-23-seaplanehandbook.pdf).
Nose dig: landing on the bows "driving them underwater and flipping the
seaplane"; the nose down force "may exceed the ability of the pilot or the
flight controls to compensate, and the seaplane will flip over at high
speed". Waterloop: "the downwind float submerges and subsequently the
wingtip may strike the water ... In a fully developed waterloop, the
seaplane may be severely damaged or may capsize." Crosswind: the side force
lifts the upwind wing and "this tipping could continue until the seaplane
capsizes". Porpoising: "Each oscillation becomes increasingly severe", and
it "can also cause a premature lift-off with an extremely high angle of
attack, which can result in a stall and a subsequent nose-down drop into
the water"; the recovery rule acts by "the second oscillation". No speeds
or times are given.

**R-TSB. Transportation Safety Board of Canada, SA9401 (1994).**
https://www.bst.gc.ca/sites/default/files/rapports-reports/aviation/SA9401/eng/sa9401.pdf
Quoting a 1988 study: "Often the aircraft became inverted in the water,
suspended by the floats". The flipped rest state is on its back, hanging
from the floats.

**R-CHUTE. UAS parachutes.** Fruity Chutes,
https://fruitychutes.com/uav_rpv_drone_recovery_parachutes/uas-parachute-recovery-tutorial :
UAS systems rated at 15 ft/s (4.6 m/s), a French limit of 4.13 m/s; "the
wind will fill the parachute and drag the UAS, which is highly
destructive", hence landing releases. ASSURE A4's 5.5 m/s floor. C-Astral's
Bramor C4EYE page, https://www.c-astral.com/en/unmanned-systems/bramor-c4eye :
4.5 kg, cruise 16 m/s, catapult launch, parachute recovery, winds up to 30
kt. Not found: its descent rate, whether it has an airbag, its landing
attitude, a chute release. DERIVED drag: a canopy sized for 4.6 m/s at 4.5
kg has CdA about 3.4 m2, so wind of 5, 10 and 15 m/s pulls about 52, 210
and 470 N against about 22 N of ground friction (mu 0.5 ASSUMED): above
about 3.3 m/s of wind the aircraft is dragged until the canopy collapses
or is released.

**R-ROLLING. Rolling resistance by ground.** Marchman, Aerodynamics and
Aircraft Performance, 3rd ed., Virginia Tech, chapter 7, Table 7.1,
https://eng.libretexts.org/Bookshelves/Aerospace_Engineering/Aerodynamics_and_Aircraft_Performance_3e_(Marchman)/07%3A_Accelerated_Performance-_Takeoff_and_Landing :
"Concrete, asphalt 0.02 - 0.05; Hard Turf 0.04 - 0.05; Normal turf, short
grass 0.05; Normal turf, long grass 0.07 - 0.10; Soft ground 0.10 -
0.30". Wikipedia, Rolling resistance,
https://en.wikipedia.org/wiki/Rolling_resistance : "0.3 Ordinary car
tires on sand", and for a wheel sinking into its ground c = sqrt(z / d),
so on a given ground a small wheel's coefficient is larger than a big
one's in the same ratio for every surface. DERIVED (src/native/plant.c
plant_wheel_roll): each model wheel's own short grass value (0.08,
docs/CUB-STAGE1.md) scaled by the table's ratio to short grass: hard
faces 0.4 of it, bare earth as hard turf 1, snow soft ground's middle 4,
loose sand its top 6, so the Cub's mains roll at 0.032 on asphalt and
0.48 in sand, over the 0.46 of the mains' load that tips it onto its
prop (docs/CUB-STAGE1.md). A skid, a point with no tyre such as a prop
tip, keeps its own friction on every ground.

**R-DISARM. What a quad pilot does after a hit.** Oscar Liang, Betaflight
airmode, https://oscarliang.com/betaflight-airmode/ : "a collision while
Airmode is active could cause the motors to throttle up aggressively,
increasing both damage and danger"; airmode holds attitude with the whole
motor range at zero throttle, so the pilot's answer to a crash is the arm
switch, not the throttle stick. Betaflight itself offers the same as an
option, `crash_recovery = DISARM` (vendor/betaflight src/main/flight/pid.c
detectAndSetCrashRecovery), off by default. How soon: Wikipedia, Mental
chronometry, https://en.wikipedia.org/wiki/Mental_chronometry : the mean
simple reaction to a visual stimulus is "approximately 190 milliseconds"
for college age adults. The suite's quad pilot disarms 250 ms after the
first contact (ASSUMPTION: the reaction plus the flick of a switch). Run at
150 and 400 ms the gate clip at 15 m/s comes to rest 5.0 and 3.1 m on and
the branch clip 7.5 and 14.0 m on, so the outcome class (it tumbles to the
grass a few metres on) holds across the range while what breaks in the
landing does not.

**R-LAUNCH. A bungee launch into a stall.** ArduPilot forum,
https://discuss.ardupilot.org/t/fixed-wing-uav-crashed-10-seconds-after-bungee-launch-need-log-analysis/143698 :
after the launch "The plane basically pitch up and flipped over", then a
nose first impact. An anecdote: LOW. No investigation report of a catapult
stall was found.

**R-NOSEOVER. A taildragger nosing over on the take off roll.** FAA
Airplane Flying Handbook, FAA-H-8083-3C, chapter 14, Transition to
Tailwheel Airplanes (copy used:
https://dl.videos.sportys.com/onlinecourse/documents/references/afh2021/afh_ch14.pdf):
on the normal take off "positive forward elevator should be applied to
smoothly lift the tail"; on a soft field "There is not only the danger of
the airplane bogging down, but also a danger of it tipping up onto its
nose", and the tail is kept low "to avoid any tendency of the airplane to
nose over as a result of soft spots, tall grass, or deep snow"; on landing,
back elevator "minimizes any tendency for the airplane to nose over".
Ruskin gliding club, tailwheel operations,
https://www.ruskin.me.uk/flying-training/tmg-extension/tailwheel-operations :
"Aircraft with a tailwheel have nothing to stop them nosing over except
the propeller"; "The thrust line is above the axle line. Any power against
one or both brakes may try to pitch the aircraft forward over the wheels",
and the same on soft ground; as the tail rises the tendency grows until it
becomes a full flip. Wikipedia, Propeller strike,
https://en.wikipedia.org/wiki/Propeller_strike : "Propeller strikes can be
the result of the propeller contacting the ground due to landing gear
collapse, failure to extend the landing gear, or nose-over." Wikipedia,
Conventional landing gear,
https://en.wikipedia.org/wiki/Conventional_landing_gear : "Tailwheel
aircraft are more subject to 'nose-over' accidents due to incorrect
application of brakes by the pilot." NTSB final reports of full size
aircraft that "nosed over and came to rest inverted" (CEN22LA367,
https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/105688/pdf ,
a forced landing in a plowed field, the damage to the wing, the
empennage, the rudder and the fin). RC: rcindia.org's nose over thread,
https://www.rcindia.org/rc-maneuvers-and-skills/nose-over-take-off-and-landing-on-tail-draggers/ ,
"Small patches of dense grass can create resistance for wheels", "the
thrust line tends to be above the drag line (on ground) and it tends to
creat a couple which tips the nose down". No measured model nose over
(speeds, loads, times) was found, so the bands are the outcome classes
these give: the prop strikes, the aircraft stands on its nose or goes over
onto its back, and it goes no further than it can pivot. MED for the prop,
LOW for the rest.

**R-DIG. A propeller digging in turns an aircraft over.** NTSB
CEN20CA250, a Hatz CB-1 taildragger,
https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/101504/pdf :
"The airplane stalled and impacted terrain in a nose low attitude. The
propeller "dug in" the terrain and the airplane nosed over", with
substantial damage to the empennage. NTSB CEN24LA142, a Cessna 182F,
https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/194010/pdf :
landed hard on sand beside the runway, "The nose landing gear and
propeller dug into the sand, the airplane nosed over and came to rest
inverted". Full size, one report each: the mechanism (a blade that digs
into soft ground holds the nose while the aircraft goes over it), not a
number. No figure for how hard a blade grips as it digs was found.

**R-MUSH. What an RC trainer does held full back from low (round 5).**
The kits' own published stall, collected in docs/STALL-STAGE1.md (the
Round 4 aero record): a HobbyZone Carbon Cub, "stalls are uneventful"
(Greg Gimlick, Model Aviation, May 2018); a HobbyKing Cub, "nice stall
characteristics but it's easy to get into a wingtip stall" (Flite Test);
the Turbo Timber with its slats, "they just sort of mush along and never
drop a wing" (Greg Gimlick, Model Aviation, February 2020); the Slow
Stick, "She'll stall if pushed but only if bags of elevator is fed in
while the model is virtually stationary" (RCM&E, 2008). None of them
says the nose or a wing goes down hard, and the owner flew the Cub's
stall on this model and signed it off ("works", docs/CRASH-PLAN.md,
Round 4 aero). An aircraft that mushes arrives the way R-C172 test 1 did,
nose near level and sinking onto its gear, not the way R-DIG's Hatz did.
LOW to MED: the reviews give the behaviour, not a number, and test 1
gives the numbers of a full size arrival in that attitude.

**R-POLE. A wing into a pole, from the aircraft's own part table (round
5).** The pole bands were "the aircraft whips round it and drops at its
foot", keeping at most 0.3 of its energy, sourced to R-AFH, whose words
are the other way: an uneven contact risks "the loss of one wing, which
invariably leads to a more rapid and less predictable descent to the
ground", a descent, not a stop. The owner's report of the Cub on the real
shell asks for the same ("it's not like just the wing falls off", PR
#67). No measured model pole strike was found (the round's web search
budget was spent before this item; section 5). DERIVED from the part
table (docs/CRASH-STAGE1.md, read from dist/sim.wasm with
`sim_part_info`), for a pole of 25 cm met at 60 percent of the half span
at cruise (V_c, 2.5 m up):

- The struck panel's root holds at most F_lim = min(F_max, M_max / a) at
  the pole, a the pole's lever about the panel's joint across the flight
  path. It carries that for no longer than the pole takes to cross the
  panel's chord and its own diameter, (c + 0.25) / V_c, whether the
  joint fails first or the leading edge crushes through (either ends the
  panel's hold). The rest of the craft loses at most J = F_lim (c + 0.25)
  / V_c of its momentum m V_c, and the kept speed is at least V_c - J / m.
- **retainedFirst** at least that speed, less 100 ms at a drag ceiling of
  0.3 g (ASSUMPTION, a tumbling airframe), squared over V_c squared; at
  most 1, since the throttle closes at the hit.
- **restDistM** from the pole: at least the kept speed over the shortest
  fall, the lowest tip (2.5 m less the half span) at 1.5 g (the other
  panel's cruise lift, half the weight, turned down as it rolls over), less
  0.3 g of drag; at most V_c over the longest fall, the hull's belly (2.5 m
  less vHalfDown) at 0.5 g (that lift still up, the stick centred and
  the trim held, ASSUMPTION), plus R-A4-REBOUND's fixed wing travel after a
  30 deg arrival, 2.5 m at 20 m/s scaled by the arrival speed squared
  (the arrival sqrt(V_c^2 + 2 x 1.5 g x h), and 30 deg is about its path).
- **timeToRestS** at least the shortest fall; at most the longest fall
  plus the rebound's travel at the average of R-A4-REBOUND's slowest
  rebound, 0.12 of the arrival speed.
- **peakG** is unchanged at 20 to 100: at the pole the table allows at
  most F_lim / m (3.7 to 17 g), so the band judges the ground impact that
  follows, which R-AFH and R-FOAM still describe.

| Airframe | F_lim N (joint) | J of m V_c, N s | kept | retainedFirst | restDistM | timeToRestS |
| --- | --- | --- | --- | --- | --- | --- |
| Skyhunter | 127 (60 N m at 0.472 m) | 4.22 of 31.3 | 0.865 | 0.71 to 1 | 5.6 to 16.6 | 0.45 to 2.8 |
| Cub | 108 (40 N m at 0.372 m) | 3.65 of 17.8 | 0.795 | 0.59 to 1 | 4.9 to 14.8 | 0.45 to 2.7 |
| Radian | 80 (45 N m at 0.564 m) | 2.53 of 13.9 | 0.818 | 0.63 to 1 | 4.9 to 15.9 | 0.45 to 2.8 |
| Slow Stick | 15.7 (6 N m at 0.383 m, the one piece wing) | 1.55 of 2.35 | 0.342 | 0.08 to 1 | 0.5 to 6.2 | 0.5 to 2.1 |
| Timber | 137 (58 N m at 0.422 m) | 3.86 of 30.6 | 0.874 | 0.73 to 1 | 7.2 to 19.8 | 0.45 to 3.1 |
| Bramor | 769 (300 N m at 0.390 m) | 36.9 of 72.0 | 0.488 | 0.22 to 1 | 3.0 to 18.0 | 0.4 to 2.9 |

LOW: the joint limits are the table's (themselves MED to LOW), and the
lift during the fall is an assumption. What would raise it: a measured
foam wing root failure, or model crash footage of a pole or trunk strike
measured frame by frame.

## 3. Footage to measure

The plan asks for crash footage measured frame by frame. That cannot be
done here (no video is downloaded, and nothing in this toolchain watches
one), so these are the clips whose titles and descriptions were verified,
with what a person should take from each: the file's frame rate, the frame
of first contact, frames to rest, the speed before impact from a known
length (a MultiGP gate is 5 ft, a whoop 65 mm, a wingspan), the rebound,
the attitude at rest and what came off. Each measurement replaces a LOW
band with a MED one.

| Scenario | Clip | What to measure |
| --- | --- | --- |
| Quad into the ground at speed | https://www.youtube.com/watch?v=FJoVMX-iRJ8 "Drone Crash Slow Motion" | impact speed, bounces, rest distance, parts thrown |
| Race quads touching | https://www.youtube.com/watch?v=mko0BJcTtYg "Ultra Slow Motion - FPV Drone crash" | closing speed, spin rate after, fall |
| Small drone at 1000 fps | https://www.youtube.com/shorts/soG_K1cX8Uk "Drone Crash In 1000FPS" | contact duration in ms, prop and arm deformation |
| Whoop indoors | https://www.youtube.com/watch?v=AEFEEKU_jEQ (808TRK, learning acro indoors) | wall and floor bounces, rest attitude, how often it flies on |
| Turtle | https://www.youtube.com/watch?v=CYkaWboWQeA , https://www.youtube.com/watch?v=aWpeakcmFq8 | time to flip, surface |
| Frame after crashes | https://www.youtube.com/watch?v=1rWO4C64gig "FPV Freestyle Stress Test" | what failed |
| Glider maiden crash | https://www.youtube.com/watch?v=xu0aoFngvtA (Night Radian V2) | impact attitude, what broke |
| Cartwheel landing | https://www.youtube.com/shorts/nAx3C_2eKr4 "RC B2 Bomber Cartwheel Landing" | tip contact speed, rotations, rest |
| Plane crash reels | https://www.youtube.com/watch?v=og7G_s6Ck04 , https://www.youtube.com/watch?v=38OiBLJeKsY | one clip per plane scenario |
| RC float plane crash | https://www.youtube.com/watch?v=IOz4NIfzrkg (1.5 m Beaver on floats) | touchdown speed and attitude, time to inverted, rest |
| RC into water | https://www.youtube.com/watch?v=skX9_e1LIME , https://www.youtube.com/watch?v=xpTl0SAYxT4 | splash to rest |
| Full size float flip | https://www.youtube.com/watch?v=NBkzh0LKe5I (C-185 landing gear down) | touchdown to inverted, to be Froude scaled |
| Bramor operations | https://www.youtube.com/watch?v=b0Pyh9n2f78 , https://www.youtube.com/watch?v=pEbkYxdMgwI , https://www.youtube.com/watch?v=LMWukL5VkYQ | launch speed, descent rate, touchdown attitude, drag |
| Fixed wing chute landing | https://www.youtube.com/watch?v=ZdSCf5drBPM | deploy to touchdown, landing attitude |

Not found as specific clips: a 5 inch square into a wall with a high
speed camera, a whoop gate clip, a float cartwheel in a step turn, an RC
float plane capsized by wind, a Bramor dragged by its canopy.

## 4. The bands, per scenario

Generated from tests/crash/bands.json, which is what the suite reads; the
two are kept equal by hand, and the JSON wins where they differ. Metrics
are defined in section 1. Plane bands follow the aircraft's layout:
tractors (Cub, Timber, Radian Pro, Slow Stick) carry R-A14-FOAM's puller
penalty at the nose, pushers (Skyhunter, Bramor) its crumple zone. The
Bramor is carbon, kevlar and vectran rather than foam, so its plane bands
borrow the foam pusher's and are LOW. The nose over on take off (which
replaced the plan's tail strike, section 6) is only flown by the aircraft
that take off on wheels and can go over their mains, the Cub and the
Timber: the Skyhunter and the Radian are hand launched and the Bramor
catapulted, and the Slow Stick's mains stand too far ahead of its CG for
any ground to tip it (section 6), so it flies its landing dive instead.

### Five inch

**q5-gate-15.** Reference still: A 5 inch racer clips a 1 inch PVC gate upright with one arm: the struck prop bends or snaps, the quad spins away from the pole and tumbles to the grass several metres on, frame whole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-PROPS | MED |
| mustNotBreak | frame, battery | R-ARM | LOW |
| peakG | 50 to 300 | R-A4-OFFSET, R-A3-DROP | LOW |
| restDistM | 5 to 30 | R-A4-REBOUND | LOW |
| timeToRestS | 1 to 4 | R-A4-REBOUND | LOW |
| retainedFirst | 0.3 to 0.7 | R-A4-OFFSET | LOW |

**q5-gate-30.** Reference still: The same clip at race speed: props on the struck side gone, an arm possibly snapped at the motor, the quad cartwheels 10 to 60 m down the course, battery still strapped on.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-PROPS, R-ARM | MED |
| mustNotBreak | battery | R-ARM | LOW |
| peakG | 100 to 500 | R-A4-OFFSET, R-ARM | LOW |
| restDistM | 10 to 60 | R-A4-REBOUND | LOW |
| timeToRestS | 2 to 6 | R-A4-REBOUND | LOW |
| retainedFirst | 0.2 to 0.6 | R-A4-OFFSET | LOW |

**q5-wall.** Reference still: Square into masonry at full speed: every prop gone, an arm broken, the camera knocked askew or out of its mount, the battery often thrown; the quad drops at the foot of the wall.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop, arm | R-ARM, R-PROPS, R-A3-PARTS | LOW |
| peakG | 500 to 2000 | R-ARM (320 to 719 J over 15 to 40 mm) | LOW |
| restDistM | 0 to 3 | R-A4-REBOUND | LOW |
| timeToRestS | 0.5 to 2 | R-A4-REBOUND | LOW |
| retainedFirst | 0.01 to 0.1 | R-A4-REBOUND | LOW |

**q5-prop-strike.** Reference still: A hard landing on a bank: one pair of blade tips hits the grass, the props chip or bend, the quad slaps down upright where it landed.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | frame, arm, motor | R-A3-DROP (a Phantom leg failed at 10.1 m/s, this is under half that) | MED |
| peakG | 10 to 50 | R-A3-DROP | MED |
| restAttitude | upright | R-A3-DROP | MED |
| restDistM | 0 to 1 | R-A3-DROP | MED |
| timeToRestS | 0.2 to 1 | R-A3-DROP | MED |

**q5-slope.** Reference still: Into a grass hillside: the quad bounces and tumbles down the slope over several contacts, props breaking one by one, and stops well down it.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-PROPS | MED |
| mustNotBreak | frame | R-ARM | LOW |
| peakG | 20 to 150 | R-A4-REBOUND, R-A3-DROP | MED |
| restDistM | 2 to 20 | R-A4-REBOUND (6.5 to 8.4 m per rebound at 20 m/s, 30 deg; scaled by v squared) | LOW |
| timeToRestS | 1 to 6 | R-A4-REBOUND | LOW |
| retainedFirst | 0.25 to 0.5 | R-A4-REBOUND (rebound speed 0.5 to 0.7 at 30 deg) | MED |

**q5-branch.** Reference still: An arm catches a thin branch: the struck prop is chewed, the quad spins off the branch and drops near the tree.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-PROPS | MED |
| mustNotBreak | frame | R-ARM | LOW |
| peakG | 20 to 200 | R-A4-OFFSET | LOW |
| restDistM | 0 to 10 | R-A4-OFFSET | LOW |
| timeToRestS | 0.5 to 3 | R-A4-OFFSET | LOW |
| retainedFirst | 0.4 to 0.8 | R-A4-OFFSET | LOW |

**q5-inverted.** Reference still: Upside down onto the grass at walking pace: nothing breaks, it lies on its back, and turtle mode rolls it over (less reliably on long grass).

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | frame, arm, prop | R-TURTLE | MED |
| peakG | 0 to 20 | R-TURTLE, R-A3-DROP | LOW |
| restAttitude | inverted | R-TURTLE | MED |
| restDistM | 0 to 2 | R-TURTLE | MED |
| turtlePeakUpZ | at least 0.0 | R-TURTLE (turtle recovers on flat ground; the contact self-test proof is crossing out of inverted) | MED |

**q5-prop-loss.** Reference still: A prop leaves at speed: the quad yaws into a fast spin, cannot hold attitude and falls out of the sky.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-PROPLOSS (the loss is the event; the scenario breaks it with sim_part_break, so this checks the break took) | HIGH |
| lossToGroundS | 1 to 5 | R-PROPLOSS (from 10 m: free fall is 1.4 s, a partly thrusting spin longer) | LOW |
| flyingAtEnd | no | R-PROPLOSS (unrecoverable without a spinning controller) | MED |

### Whoop

**whoop-wall.** Reference still: A 65 mm whoop bumps a wall at a brisk walk: it bounces off, wobbles and keeps flying, nothing damaged.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | frame, prop, motor | R-WHOOP | LOW |
| peakG | 50 to 500 | R-WHOOP | LOW |
| retainedFirst | 0.2 to 0.7 | R-WHOOP (20 to 70 percent dissipated) | LOW |
| flyingAtEnd | yes | R-WHOOP, docs/CRASH-PLAN.md (a whoop is built to survive this) | LOW |

**whoop-floor.** Reference still: Dropped onto the floor from head height: a bounce, it stays upright or flips, the pilot punches out and flies on.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | frame, prop, motor | R-WHOOP | LOW |
| peakG | 100 to 800 | R-WHOOP | LOW |
| flyingAtEnd | yes | R-WHOOP, docs/CRASH-PLAN.md | LOW |

**whoop-gate.** Reference still: Full speed into a gate side: the duct takes it, the whoop tumbles a metre or two to the floor, perhaps a chipped blade, frame and motors whole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | frame, motor | R-WHOOP | LOW |
| peakG | 300 to 1500 | R-WHOOP | LOW |
| restDistM | 1 to 5 | R-WHOOP | LOW |
| timeToRestS | 0 to 2 | R-WHOOP | LOW |
| retainedFirst | 0.1 to 0.5 | R-WHOOP (50 to 90 percent dissipated) | LOW |

### Skyhunter 1800

**sky-stall.** Reference still: Stalled low with the stick back: a wing or the nose drops and it hits nose low; the foam nose crushes, and it stops on its nose or flops onto its back within a couple of metres.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | prop | R-A14-FOAM (a pusher prop is behind the crumple zone) | LOW |
| mustNotBreak | wing, tail | R-A14-FOAM, R-SLOWSTICK | MED |
| peakG | 20 to 60 | R-A14-FOAM (foam pusher 0.30 to 0.34 g/ft lbf on the head, puller about 3 times), R-FOAM crush check | MED |
| restAttitude | nose down or inverted | R-C172 (nose down into soft ground, pivots and ends inverted) | LOW |
| restDistM | 0 to 3 | R-C172, R-A14-FOAM | MED |
| timeToRestS | 0.5 to 2 | R-C172 (Froude scaled) | LOW |

**sky-nose-in.** Reference still: A full power dive into the ground: the nose section snaps off at the battery bay, the wings fold or come off at the root, motor and battery tumble on; wreckage within a few metres of the hole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | fuselage, wing | R-A14-FOAM (eBee+ nose broke off from 7.6 m/s on a rigid target), R-A3-PARTS | MED |
| peakG | 100 to 400 | R-A14-FOAM, R-A3-PARTS | MED |
| restDistM | 0 to 15 | R-A3-PARTS, R-A4-REBOUND (fixed wing rebound 0.03 to 0.2 of impact speed) | MED |
| timeToRestS | 0.3 to 2 | R-A4-REBOUND | MED |
| retainedFirst | 0.0 to 0.05 | R-A4-REBOUND | MED |

**sky-cartwheel.** Reference still: A banked low pass catches a wingtip: the aircraft pivots on it and cartwheels, one to three rotations, the tip crushed and the prop broken, ending on its back or side.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (wingtip strike and cartwheel) | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 80 | R-AFH, R-A14-FOAM | LOW |
| minUpZ | at most -0.5 | R-AFH (cartwheels: at least onto its back once) | LOW |
| restAttitude | inverted or on its side | R-AFH | LOW |
| restDistM | 5 to 20 | R-AFH | LOW |
| timeToRestS | 1 to 3 | R-AFH | LOW |

**sky-belly-fast.** Reference still: Belly landed at twice the stall: a slap, a long slide across the grass, upright and undamaged.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, fuselage | R-C172 test 1, R-A14-FOAM (foam belly landings are routine) | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau) | MED |
| restAttitude | upright | R-C172 test 1 | MED |
| restDistM | 16 to 58 | R-SLIDE at V_s 9.2 m/s: 1.5 V_s (13.8 m/s) at mu 0.6 to 2 V_s (18.4 m/s) at mu 0.3, v squared over 2 mu g | LOW |
| timeToRestS | 2.3 to 6.3 | R-SLIDE at V_s 9.2 m/s: 1.5 V_s (13.8 m/s) at mu 0.6 to 2 V_s (18.4 m/s) at mu 0.3, v over mu g | LOW |

**sky-pole.** Reference still: A wing hits a wooden pole at cruise: the leading edge crushes and the panel folds or snaps at the pole, the aircraft whips round it and drops at its foot.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (asymmetric contact, the loss of one wing), R-FOAM | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 100 | R-AFH, R-FOAM | LOW |
| restDistM | 0 to 5 | R-AFH | LOW |
| timeToRestS | 0.5 to 2 | R-AFH | LOW |
| retainedFirst | 0.0 to 0.3 | R-AFH | LOW |

**sky-tree.** Reference still: Into a tree crown at cruise: branches decelerate it over a metre or two, skin torn, prop broken, and it hangs in the branches.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-AFH trees, R-SLOWSTICK (stuck in a tree, torn wing) | LOW |
| mustNotBreak | wing | R-AFH ("considerable cushioning and braking effect without destroying the airplane") | MED |
| peakG | 5 to 30 | R-AFH (branches decelerate over 0.5 to 2 m) | LOW |
| restHeightM | at least 2 | R-AFH ("hang the airplane in the tree branches") | LOW |
| timeToRestS | 0.5 to 3 | R-AFH | LOW |

### J-3 Cub

**cub-stall.** Reference still: Stalled low with the stick held back: the nose drops a little and it mushes down with the wings nearly level, lands hard on its gear, bounces and rolls on upright, nothing broken.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, tail | R-C172 test 1 (a flare to stall onto its gear: no noticeable damage but at the tail strike), R-MUSH | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau as the gear takes it; Froude scaling leaves g unchanged) | MED |
| restAttitude | upright | R-C172 test 1 (rebounded off its gear with most of its horizontal velocity), R-MUSH | MED |

**cub-nose-in.** Reference still: A full power dive into the ground: the nose section snaps off at the battery bay, the wings fold or come off at the root, motor and battery tumble on; wreckage within a few metres of the hole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | fuselage, wing | R-A14-FOAM (eBee+ nose broke off from 7.6 m/s on a rigid target), R-A3-PARTS | MED |
| peakG | 100 to 400 | R-A14-FOAM, R-A3-PARTS | MED |
| restDistM | 0 to 15 | R-A3-PARTS, R-A4-REBOUND (fixed wing rebound 0.03 to 0.2 of impact speed) | MED |
| timeToRestS | 0.3 to 2 | R-A4-REBOUND | MED |
| retainedFirst | 0.0 to 0.05 | R-A4-REBOUND | MED |

**cub-cartwheel.** Reference still: A banked low pass catches a wingtip: the aircraft pivots on it and cartwheels, one to three rotations, the tip crushed and the prop broken, ending on its back or side.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (wingtip strike and cartwheel) | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 80 | R-AFH, R-A14-FOAM | LOW |
| minUpZ | at most -0.5 | R-AFH (cartwheels: at least onto its back once) | LOW |
| restAttitude | inverted or on its side | R-AFH | LOW |
| restDistM | 5 to 20 | R-AFH | LOW |
| timeToRestS | 1 to 3 | R-AFH | LOW |

**cub-belly-fast.** Reference still: Onto its wheels at twice the stall and sinking: a hard bounce on the wire gear, which may bend, then it rolls out upright.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, fuselage | R-C172 test 1, R-A14-FOAM (foam belly landings are routine) | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau) | MED |
| restAttitude | upright | R-C172 test 1 | MED |

**cub-nose-over.** Reference still: Pushed tail up too early at full power: the tail rises, the nose tips forward over the wheels, the prop digs into the grass and chips or snaps, and it stops standing on its nose or flips onto its back within about its own length.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustDamage | prop | R-NOSEOVER (a tailwheel aircraft has nothing to stop it nosing over except the propeller; a nose over is a prop strike) | MED |
| mustNotBreak | wing, fuselage | R-NOSEOVER (a nose over from a take off roll; the damage in the reports is the prop, and the fin and rudder when it goes onto its back), R-FOAM | LOW |
| restAttitude | nose down or inverted | R-NOSEOVER (AFH: tipping up onto its nose; the tendency grows until it flips; NTSB: nosed over and came to rest inverted), R-DIG (nose gear and prop dug into sand: nosed over, at rest inverted) | LOW |
| restDistM | 0 to 2 | R-NOSEOVER, DERIVED (it pivots over the main wheels, so the CG moves about its own length at most) | LOW |

**cub-pole.** Reference still: A wing hits a wooden pole at cruise: the struck panel crushes at its leading edge and snaps off at the root, the rest of the aircraft carries on past the pole with most of its speed, rolls toward the lost wing and comes down on the grass some metres on.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (asymmetric contact, the loss of one wing), R-FOAM | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 100 | R-AFH, R-FOAM | LOW |
| restDistM | 4.9 to 14.8 | R-POLE (the kept speed over the fall from 2.5 m, then R-A4-REBOUND fixed wing travel) | LOW |
| timeToRestS | 0.45 to 2.7 | R-POLE (the fall from 2.5 m, then R-A4-REBOUND fixed wing travel) | LOW |
| retainedFirst | 0.59 to 1 | R-POLE (the struck root passes at most F_lim for the pole to cross the chord), R-AFH (the loss of one wing: a descent) | LOW |

**cub-tree.** Reference still: Into a tree crown at cruise: branches decelerate it over a metre or two, skin torn, prop broken, and it hangs in the branches.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-AFH trees, R-SLOWSTICK (stuck in a tree, torn wing) | LOW |
| mustNotBreak | wing | R-AFH ("considerable cushioning and braking effect without destroying the airplane") | MED |
| peakG | 5 to 30 | R-AFH (branches decelerate over 0.5 to 2 m) | LOW |
| restHeightM | at least 2 | R-AFH ("hang the airplane in the tree branches") | LOW |
| timeToRestS | 0.5 to 3 | R-AFH | LOW |

### Radian Pro

**radian-stall.** Reference still: Stalled low with the stick back: a wing or the nose drops and it hits nose low; the foam nose crushes, the prop and spinner break, and it stops on its nose or flops onto its back within a couple of metres.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-A14-FOAM (puller prop, spinner and motor at the nose) | MED |
| mustNotBreak | wing, tail | R-A14-FOAM, R-SLOWSTICK | MED |
| peakG | 50 to 150 | R-A14-FOAM (foam pusher 0.30 to 0.34 g/ft lbf on the head, puller about 3 times), R-FOAM crush check | MED |
| restAttitude | nose down or inverted | R-C172 (nose down into soft ground, pivots and ends inverted), R-DIG (a stalled taildragger went in nose low, its prop dug in and it nosed over) | LOW |
| restDistM | 0 to 3 | R-C172, R-A14-FOAM | MED |
| timeToRestS | 0.5 to 2 | R-C172 (Froude scaled) | LOW |

**radian-nose-in.** Reference still: A full power dive into the ground: the nose section snaps off at the battery bay, the wings fold or come off at the root, motor and battery tumble on; wreckage within a few metres of the hole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | fuselage, wing | R-A14-FOAM (eBee+ nose broke off from 7.6 m/s on a rigid target), R-A3-PARTS | MED |
| peakG | 100 to 400 | R-A14-FOAM, R-A3-PARTS | MED |
| restDistM | 0 to 15 | R-A3-PARTS, R-A4-REBOUND (fixed wing rebound 0.03 to 0.2 of impact speed) | MED |
| timeToRestS | 0.3 to 2 | R-A4-REBOUND | MED |
| retainedFirst | 0.0 to 0.05 | R-A4-REBOUND | MED |

**radian-cartwheel.** Reference still: A banked low pass catches a wingtip: the aircraft pivots on it and cartwheels, one to three rotations, the tip crushed and the prop broken, ending on its back or side.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (wingtip strike and cartwheel) | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 80 | R-AFH, R-A14-FOAM | LOW |
| minUpZ | at most -0.5 | R-AFH (cartwheels: at least onto its back once) | LOW |
| restAttitude | inverted or on its side | R-AFH | LOW |
| restDistM | 5 to 20 | R-AFH | LOW |
| timeToRestS | 1 to 3 | R-AFH | LOW |

**radian-belly-fast.** Reference still: Belly landed at twice the stall: a slap, a long slide across the grass, upright and undamaged.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, fuselage | R-C172 test 1, R-A14-FOAM (foam belly landings are routine) | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau) | MED |
| restAttitude | upright | R-C172 test 1 | MED |
| restDistM | 8 to 29 | R-SLIDE at V_s 6.5 m/s: 1.5 V_s (9.75 m/s) at mu 0.6 to 2 V_s (13 m/s) at mu 0.3, v squared over 2 mu g | LOW |
| timeToRestS | 1.6 to 4.5 | R-SLIDE at V_s 6.5 m/s: 1.5 V_s (9.75 m/s) at mu 0.6 to 2 V_s (13 m/s) at mu 0.3, v over mu g | LOW |

**radian-pole.** Reference still: A wing hits a wooden pole at cruise: the leading edge crushes and the panel folds or snaps at the pole, the aircraft whips round it and drops at its foot.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (asymmetric contact, the loss of one wing), R-FOAM | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 100 | R-AFH, R-FOAM | LOW |
| restDistM | 0 to 5 | R-AFH | LOW |
| timeToRestS | 0.5 to 2 | R-AFH | LOW |
| retainedFirst | 0.0 to 0.3 | R-AFH | LOW |

**radian-tree.** Reference still: Into a tree crown at cruise: branches decelerate it over a metre or two, skin torn, prop broken, and it hangs in the branches.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-AFH trees, R-SLOWSTICK (stuck in a tree, torn wing) | LOW |
| mustNotBreak | wing | R-AFH ("considerable cushioning and braking effect without destroying the airplane") | MED |
| peakG | 5 to 30 | R-AFH (branches decelerate over 0.5 to 2 m) | LOW |
| restHeightM | at least 2 | R-AFH ("hang the airplane in the tree branches") | LOW |
| timeToRestS | 0.5 to 3 | R-AFH | LOW |

### Slow Stick

**slowstick-stall.** Reference still: Stalled low with the stick held back: it barely breaks, mushes down with the nose a little low, lands hard on its gear, bounces and rolls on upright, nothing broken.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, tail | R-C172 test 1 (a flare to stall onto its gear: no noticeable damage but at the tail strike), R-MUSH | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau as the gear takes it; Froude scaling leaves g unchanged) | MED |
| restAttitude | upright | R-C172 test 1 (rebounded off its gear with most of its horizontal velocity), R-MUSH | MED |

**slowstick-nose-in.** Reference still: A full power dive into the ground: the nose section snaps off at the battery bay, the wings fold or come off at the root, motor and battery tumble on; wreckage within a few metres of the hole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | fuselage, wing | R-A14-FOAM (eBee+ nose broke off from 7.6 m/s on a rigid target), R-A3-PARTS | MED |
| peakG | 100 to 400 | R-A14-FOAM, R-A3-PARTS | MED |
| restDistM | 0 to 15 | R-A3-PARTS, R-A4-REBOUND (fixed wing rebound 0.03 to 0.2 of impact speed) | MED |
| timeToRestS | 0.3 to 2 | R-A4-REBOUND | MED |
| retainedFirst | 0.0 to 0.05 | R-A4-REBOUND | MED |

**slowstick-cartwheel.** Reference still: A banked low pass catches a wingtip: the aircraft pivots on it and cartwheels, one to three rotations, the tip crushed and the prop broken, ending on its back or side.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (wingtip strike and cartwheel) | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 80 | R-AFH, R-A14-FOAM | LOW |
| minUpZ | at most -0.5 | R-AFH (cartwheels: at least onto its back once) | LOW |
| restAttitude | inverted or on its side | R-AFH | LOW |
| restDistM | 5 to 20 | R-AFH | LOW |
| timeToRestS | 1 to 3 | R-AFH | LOW |

**slowstick-belly-fast.** Reference still: Onto its wheels at twice the stall and sinking: a hard bounce on the wire gear, which may bend, then it rolls out upright.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, fuselage | R-C172 test 1, R-A14-FOAM (foam belly landings are routine) | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau) | MED |
| restAttitude | upright | R-C172 test 1 | MED |

**slowstick-landing-dive.** Reference still: On final too slow and pushed into a shallow dive with the power off: the nose goes into the grass at a walking pace, the aircraft stops within a few metres and flies again after.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, fuselage, tail, prop | R-SLOWSTICK ("Almost every landing so far has been a shallow or steep dive into the weeds. The plane holds up well to these landings") | LOW |
| restDistM | 0 to 7.4 | R-SLIDE, DERIVED (the most it can arrive with is 4.84 m/s plus a 1 m drop without drag, 6.6 m/s; a foam belly on grass at mu 0.3 slides v squared over 2 mu g, 7.4 m, the farthest a nose in can go) | LOW |

**slowstick-pole.** Reference still: A wing hits a wooden pole at cruise: the leading edge crushes and the panel folds or snaps at the pole, the aircraft whips round it and drops at its foot.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (asymmetric contact, the loss of one wing), R-FOAM | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 100 | R-AFH, R-FOAM | LOW |
| restDistM | 0 to 5 | R-AFH | LOW |
| timeToRestS | 0.5 to 2 | R-AFH | LOW |
| retainedFirst | 0.0 to 0.3 | R-AFH | LOW |

**slowstick-tree.** Reference still: Into a tree crown at cruise: branches decelerate it over a metre or two, skin torn, prop broken, and it hangs in the branches.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-AFH trees, R-SLOWSTICK (stuck in a tree, torn wing) | LOW |
| mustNotBreak | wing | R-AFH ("considerable cushioning and braking effect without destroying the airplane") | MED |
| peakG | 5 to 30 | R-AFH (branches decelerate over 0.5 to 2 m) | LOW |
| restHeightM | at least 2 | R-AFH ("hang the airplane in the tree branches") | LOW |
| timeToRestS | 0.5 to 3 | R-AFH | LOW |

### Turbo Timber

**timber-stall.** Reference still: Stalled low with the stick held back: it mushes down with the wings level, never dropping one, lands hard on its gear, bounces and rolls on upright, nothing broken.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, tail | R-C172 test 1 (a flare to stall onto its gear: no noticeable damage but at the tail strike), R-MUSH | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau as the gear takes it; Froude scaling leaves g unchanged) | MED |
| restAttitude | upright | R-C172 test 1 (rebounded off its gear with most of its horizontal velocity), R-MUSH | MED |

**timber-nose-in.** Reference still: A full power dive into the ground: the nose section snaps off at the battery bay, the wings fold or come off at the root, motor and battery tumble on; wreckage within a few metres of the hole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | fuselage, wing | R-A14-FOAM (eBee+ nose broke off from 7.6 m/s on a rigid target), R-A3-PARTS | MED |
| peakG | 100 to 400 | R-A14-FOAM, R-A3-PARTS | MED |
| restDistM | 0 to 15 | R-A3-PARTS, R-A4-REBOUND (fixed wing rebound 0.03 to 0.2 of impact speed) | MED |
| timeToRestS | 0.3 to 2 | R-A4-REBOUND | MED |
| retainedFirst | 0.0 to 0.05 | R-A4-REBOUND | MED |

**timber-cartwheel.** Reference still: A banked low pass catches a wingtip: the aircraft pivots on it and cartwheels, one to three rotations, the tip crushed and the prop broken, ending on its back or side.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (wingtip strike and cartwheel) | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 80 | R-AFH, R-A14-FOAM | LOW |
| minUpZ | at most -0.5 | R-AFH (cartwheels: at least onto its back once) | LOW |
| restAttitude | inverted or on its side | R-AFH | LOW |
| restDistM | 5 to 20 | R-AFH | LOW |
| timeToRestS | 1 to 3 | R-AFH | LOW |

**timber-belly-fast.** Reference still: Onto its wheels at twice the stall and sinking: a hard bounce on the wire gear, which may bend, then it rolls out upright.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, fuselage | R-C172 test 1, R-A14-FOAM (foam belly landings are routine) | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau) | MED |
| restAttitude | upright | R-C172 test 1 | MED |

**timber-nose-over.** Reference still: Pushed tail up too early at full power: the tail rises, the nose tips forward over the wheels, the prop digs into the grass and chips or snaps, and it stops standing on its nose or flips onto its back within about its own length.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustDamage | prop | R-NOSEOVER (a tailwheel aircraft has nothing to stop it nosing over except the propeller; a nose over is a prop strike) | MED |
| mustNotBreak | wing, fuselage | R-NOSEOVER (a nose over from a take off roll; the damage in the reports is the prop, and the fin and rudder when it goes onto its back), R-FOAM | LOW |
| restAttitude | nose down or inverted | R-NOSEOVER (AFH: tipping up onto its nose; the tendency grows until it flips; NTSB: nosed over and came to rest inverted), R-DIG (nose gear and prop dug into sand: nosed over, at rest inverted) | LOW |
| restDistM | 0 to 2 | R-NOSEOVER, DERIVED (it pivots over the main wheels, so the CG moves about its own length at most) | LOW |

**timber-pole.** Reference still: A wing hits a wooden pole at cruise: the leading edge crushes and the panel folds or snaps at the pole, the aircraft whips round it and drops at its foot.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (asymmetric contact, the loss of one wing), R-FOAM | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 100 | R-AFH, R-FOAM | LOW |
| restDistM | 0 to 5 | R-AFH | LOW |
| timeToRestS | 0.5 to 2 | R-AFH | LOW |
| retainedFirst | 0.0 to 0.3 | R-AFH | LOW |

**timber-tree.** Reference still: Into a tree crown at cruise: branches decelerate it over a metre or two, skin torn, prop broken, and it hangs in the branches.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-AFH trees, R-SLOWSTICK (stuck in a tree, torn wing) | LOW |
| mustNotBreak | wing | R-AFH ("considerable cushioning and braking effect without destroying the airplane") | MED |
| peakG | 5 to 30 | R-AFH (branches decelerate over 0.5 to 2 m) | LOW |
| restHeightM | at least 2 | R-AFH ("hang the airplane in the tree branches") | LOW |
| timeToRestS | 0.5 to 3 | R-AFH | LOW |

### Bramor C4EYE

**bramor-stall.** Reference still: Stalled low with the stick back: a wing or the nose drops and it hits nose low; the foam nose crushes, and it stops on its nose or flops onto its back within a couple of metres.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | prop | R-A14-FOAM (a pusher prop is behind the crumple zone) | LOW |
| mustNotBreak | wing, tail | R-A14-FOAM, R-SLOWSTICK | MED |
| peakG | 20 to 60 | R-A14-FOAM (foam pusher 0.30 to 0.34 g/ft lbf on the head, puller about 3 times), R-FOAM crush check | MED |
| restAttitude | nose down or inverted | R-C172 (nose down into soft ground, pivots and ends inverted) | LOW |
| restDistM | 0 to 3 | R-C172, R-A14-FOAM | MED |
| timeToRestS | 0.5 to 2 | R-C172 (Froude scaled) | LOW |

**bramor-nose-in.** Reference still: A full power dive into the ground: the nose section snaps off at the battery bay, the wings fold or come off at the root, motor and battery tumble on; wreckage within a few metres of the hole.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | fuselage, wing | R-A14-FOAM (eBee+ nose broke off from 7.6 m/s on a rigid target), R-A3-PARTS | MED |
| peakG | 100 to 400 | R-A14-FOAM, R-A3-PARTS | MED |
| restDistM | 0 to 15 | R-A3-PARTS, R-A4-REBOUND (fixed wing rebound 0.03 to 0.2 of impact speed) | MED |
| timeToRestS | 0.3 to 2 | R-A4-REBOUND | MED |
| retainedFirst | 0.0 to 0.05 | R-A4-REBOUND | MED |

**bramor-cartwheel.** Reference still: A banked low pass catches a wingtip: the aircraft pivots on it and cartwheels, one to three rotations, the tip crushed and the prop broken, ending on its back or side.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (wingtip strike and cartwheel) | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 80 | R-AFH, R-A14-FOAM | LOW |
| minUpZ | at most -0.5 | R-AFH (cartwheels: at least onto its back once) | LOW |
| restAttitude | inverted or on its side | R-AFH | LOW |
| restDistM | 5 to 20 | R-AFH | LOW |
| timeToRestS | 1 to 3 | R-AFH | LOW |

**bramor-belly-fast.** Reference still: Belly landed at twice the stall: a slap, a long slide across the grass, upright and undamaged.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, fuselage | R-C172 test 1, R-A14-FOAM (foam belly landings are routine) | MED |
| peakG | 3 to 10 | R-C172 test 1 (4.1 to 5.9 g plateau) | MED |
| restAttitude | upright | R-C172 test 1 | MED |
| restDistM | 32 to 115 | R-SLIDE at V_s 13 m/s: 1.5 V_s (19.5 m/s) at mu 0.6 to 2 V_s (26 m/s) at mu 0.3, v squared over 2 mu g | LOW |
| timeToRestS | 3.3 to 8.9 | R-SLIDE at V_s 13 m/s: 1.5 V_s (19.5 m/s) at mu 0.6 to 2 V_s (26 m/s) at mu 0.3, v over mu g | LOW |

**bramor-pole.** Reference still: A wing hits a wooden pole at cruise: the leading edge crushes and the panel folds or snaps at the pole, the aircraft whips round it and drops at its foot.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | wing | R-AFH (asymmetric contact, the loss of one wing), R-FOAM | LOW |
| mustNotBreak | fuselage | R-AFH | LOW |
| peakG | 20 to 100 | R-AFH, R-FOAM | LOW |
| restDistM | 0 to 5 | R-AFH | LOW |
| timeToRestS | 0.5 to 2 | R-AFH | LOW |
| retainedFirst | 0.0 to 0.3 | R-AFH | LOW |

**bramor-tree.** Reference still: Into a tree crown at cruise: branches decelerate it over a metre or two, skin torn, prop broken, and it hangs in the branches.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustBreak | prop | R-AFH trees, R-SLOWSTICK (stuck in a tree, torn wing) | LOW |
| mustNotBreak | wing | R-AFH ("considerable cushioning and braking effect without destroying the airplane") | MED |
| peakG | 5 to 30 | R-AFH (branches decelerate over 0.5 to 2 m) | LOW |
| restHeightM | at least 2 | R-AFH ("hang the airplane in the tree branches") | LOW |
| timeToRestS | 0.5 to 3 | R-AFH | LOW |

**bramor-chute.** Reference still: Under the canopy in a breeze: touches down at about 5 m/s, then the inflated canopy drags it downwind across the ground until it collapses.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | fuselage, wing, tail | R-CHUTE | MED |
| sinkRate | 4.1 to 5.5 | R-CHUTE (4.1 to 4.6 m/s rated, 5.5 m/s floor, rates of descent: the vertical speed at touchdown, not the wind's drift) | MED |
| peakG | 10 to 40 | R-CHUTE | MED |
| restDistM | 5 to 100 | R-CHUTE drag (dragged 5 to 100 m without a release above about 3 m/s of wind) | LOW |

**bramor-catapult-stall.** Reference still: Off the rail too slow: it pitches up, stalls, drops a wing and goes in nose first some metres ahead of the catapult.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | fuselage | R-LAUNCH | LOW |
| peakG | 20 to 80 | R-LAUNCH, R-A14-FOAM | LOW |
| restAttitude | nose down or inverted | R-LAUNCH (pitched up, flipped, nose first) | LOW |
| restDistM | 5 to 30 | R-LAUNCH | LOW |
| timeToRestS | 0.5 to 2 | R-LAUNCH | LOW |

### Timber on floats

**timberf-nose-dig.** Reference still: Touched down nose low: the float bows dig in, the tail comes over and the aircraft flips onto its back, hanging upside down from its floats.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, float | R-SEAPLANE | MED |
| peakG | 3 to 15 | R-SEAPLANE, R-C172 (water) | LOW |
| minUpZ | at most -0.7 | R-SEAPLANE ("flip over"), R-TSB | MED |
| restAttitude | inverted | R-TSB ("inverted in the water, suspended by the floats") | MED |
| restDistM | 2 to 10 | R-C172 (Froude scaled) | LOW |
| timeToRestS | 2 to 5 | R-C172 (Froude scaled) | LOW |

**timberf-float-catch.** Reference still: A fast turn on the step: the outside float buries, the wingtip goes in and the aircraft waterloops over onto its side or back.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| peakG | 3 to 10 | R-SEAPLANE | LOW |
| minUpZ | at most 0.0 | R-SEAPLANE (waterloop, may capsize) | MED |
| restAttitude | inverted or on its side | R-SEAPLANE, R-TSB | MED |
| restDistM | 1 to 5 | R-SEAPLANE | LOW |
| timeToRestS | 1 to 3 | R-SEAPLANE | LOW |

**timberf-capsize.** Reference still: A gust across the lake lifts the upwind wing, the downwind float buries and the aircraft rolls over onto its back.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| peakG | 0 to 3 | R-SEAPLANE | LOW |
| restAttitude | inverted or on its side | R-SEAPLANE ("tipping could continue until the seaplane capsizes"), R-TSB | MED |
| minUpZ | at most 0.0 | R-SEAPLANE | MED |

**timberf-porpoise.** Reference still: Held nose high on the step: it rocks bow to stern, each cycle worse, leaves the water too slow, stalls and drops back in.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| pitchReversalsOnWater | 4 to 8 | R-SEAPLANE ("each oscillation becomes increasingly severe"; 2 to 4 cycles uncorrected, an estimate) | LOW |
| liftoffOverStall | at most 1.0 | R-SEAPLANE ("premature lift-off with an extremely high angle of attack") | LOW |

### Cub on floats

**cubf-nose-dig.** Reference still: Touched down nose low: the float bows dig in, the tail comes over and the aircraft flips onto its back, hanging upside down from its floats.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| mustNotBreak | wing, float | R-SEAPLANE | MED |
| peakG | 3 to 15 | R-SEAPLANE, R-C172 (water) | LOW |
| minUpZ | at most -0.7 | R-SEAPLANE ("flip over"), R-TSB | MED |
| restAttitude | inverted | R-TSB ("inverted in the water, suspended by the floats") | MED |
| restDistM | 2 to 10 | R-C172 (Froude scaled) | LOW |
| timeToRestS | 2 to 5 | R-C172 (Froude scaled) | LOW |

**cubf-float-catch.** Reference still: A fast turn on the step: the outside float buries, the wingtip goes in and the aircraft waterloops over onto its side or back.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| peakG | 3 to 10 | R-SEAPLANE | LOW |
| minUpZ | at most 0.0 | R-SEAPLANE (waterloop, may capsize) | MED |
| restAttitude | inverted or on its side | R-SEAPLANE, R-TSB | MED |
| restDistM | 1 to 5 | R-SEAPLANE | LOW |
| timeToRestS | 1 to 3 | R-SEAPLANE | LOW |

**cubf-capsize.** Reference still: A gust across the lake lifts the upwind wing, the downwind float buries and the aircraft rolls over onto its back.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| peakG | 0 to 3 | R-SEAPLANE | LOW |
| restAttitude | inverted or on its side | R-SEAPLANE ("tipping could continue until the seaplane capsizes"), R-TSB | MED |
| minUpZ | at most 0.0 | R-SEAPLANE | MED |

**cubf-porpoise.** Reference still: Held nose high on the step: it rocks bow to stern, each cycle worse, leaves the water too slow, stalls and drops back in.

| Metric | Band | Source | Confidence |
| --- | --- | --- | --- |
| pitchReversalsOnWater | 4 to 8 | R-SEAPLANE ("each oscillation becomes increasingly severe"; 2 to 4 cycles uncorrected, an estimate) | LOW |
| liftoffOverStall | at most 1.0 | R-SEAPLANE ("premature lift-off with an extremely high angle of attack") | LOW |

## 5. What is missing, and what would raise a band

- A 5 inch hitting a wall or a gate, measured: contact time and peak load.
  None is published. The 1000 fps clip in section 3 is the nearest; a load
  cell at 10 kHz or more is what settles it.
- A measured failure load for a 5 inch arm, a motor bell or a prop. R-ARM
  is derived from plate data and an assumed arm geometry.
- EPO's compressive curve: no primary datasheet.
- Wing areas and stall speeds of the real aircraft: only search snippets
  were found, so the scenarios fly at the plant's own derived speeds
  (tests/*-thresholds.json) and no band depends on a stall speed.
- The Bramor's descent rate, launch speed, landing attitude and whether it
  has an airbag or a canopy release: not on C-Astral's pages.
- RC float plane speeds and flip times: none published; R-SEAPLANE gives
  the mechanisms and R-C172 Froude scaled the only times.

## 6. What the plan got wrong, found while building the suite

Recorded here because the loop will build on the plan.

- **The whoop is not a whoop plant.** The plan's whoop scenarios assume a
  whoop that survives walls and floors. The shell's whoop flies the five
  inch's plant (0.71 kg) in a room built 3.43 times life size; the real
  65 mm whoop plant (airframe 1) is still in the module and nothing selects
  it. A damage model with five inch limits will break the shell's whoop at
  speeds a real whoop shrugs off, since at the same picture it carries
  about 30 times a whoop's mass and 3.43 times its speed. Which of the two
  the whoop's damage limits belong to is the owner's decision.
- **"Each plane" includes a tail strike on take off,** but only the Cub,
  the Timber and the Slow Stick take off on wheels. The Skyhunter and the
  Radian are hand launched and the Bramor catapulted; the suite flies the
  scenario for those three. And all three are taildraggers, whose tail
  already sits on its wheel: a tail strike in the tricycle sense cannot
  happen to any aircraft in the fleet. What the suite flies is the
  taildragger's version, the whole take off with the stick held back,
  where the first touch of anything but a wheel is the event; on the Cub
  and the Timber that is the aircraft coming back down after lifting off
  too steep, which the band (a scrape, under 10 g) then fails. Whether to
  keep, rename or replace the scenario (a nose over or prop strike from
  too much down elevator is the taildragger's real take off accident) is
  the owner's call. **Decided after the baseline:** replaced by the nose
  over (R-NOSEOVER). The references' nose overs come from soft ground,
  tall grass and brakes. At first the plant could fly none of them, its
  wheels rolling at 0.08 whatever the ground and having no brakes, so the
  suite flew the one the elevator makes alone, and nothing went over.
  Round 2 gave the wheels each material's rolling resistance (R-ROLLING)
  and a brake (sim_set_brake), and the scenario is now flown on loose
  sand with that same early push of the stick, the soft field take off
  the Airplane Flying Handbook warns about. The FMS models have no
  brakes, so the brake is not the cause flown.
- **Two scenarios need wind the plant does not have.** The floats'
  "capsize in a crosswind gust" and the Bramor's "chute landing in wind,
  drag and rest": the air model has no horizontal wind (sim_air_lift is
  vertical, and the water's wind only raises waves). Both are flown in the
  suite and marked blocked. They name the entry point they need
  (tests/crash/scenarios.js `WIND_ENTRY`, `sim_set_wind(vx, vy, vz)` world
  m/s, a guess at the core's name): once the module exports it they are
  flown in that wind (15 m/s across the float plane, 10 m/s along the
  Bramor's descent) and judged, with no other change. Round 1's core added
  `sim_set_wind(vx, vy, gust)`, and since then all three are flown and
  judged: no scenario is blocked or a stand in.
- **Nothing could detach a prop at the baseline,** so "lose one prop in
  flight" was flown with the bench override holding one motor at zero
  duty. With the crash core it is the real thing: the prop on motor 0
  leaves through `sim_part_break` and is a free body.
- **Obstacles are not in the plant.** "Contact is one rigid body against
  the ground plane, obstacles and water" holds for the ground and the
  water; for obstacles the plant only answers a contact the shell detects
  and passes in (sim_contact_at). A Node suite has to reproduce the
  shell's detection, which this one does against its own solids.
- **The ground contact count is not a contact detector.** A hull held out
  of the ground by projection (an inverted arrival) or put to sleep by the
  settle takes no counted hit, so a quad that fell 10 m onto its back read
  as no contact for six seconds. The suite also counts any load over 15 g.
- **Peak load needs a contact duration.** The plan bands peak loads, and
  every contact the plant has today is a one step impulse, so most peak
  loads read several to tens of times over their band (section 1). The damage model's crush
  is what brings it into band.
- **The 1000 mm wing** (airframe 2) is still in the module but the shell
  no longer offers it, so "each plane" is the six the shell flies.

## 7. Round 3: is each scenario staged like its reference

The suite's own audit, so that a failing band is the plant's and not a
mis-staged test. What was restaged, and what was found to be the plant's.

- **The five inch pilot stayed armed after a crash.** Sticks centred and
  throttle closed, but airmode on, so a quad knocked spinning was flown
  back up at full power: the 15 m/s gate clip climbed to 22 m and hit the
  grass at 16.6 m/s 4.9 s later, the branch clip climbed to 13 m. Now the
  pilot disarms 250 ms after the first contact (R-DISARM), in every five
  inch scenario but the turtle one. The gate clip tumbles to the grass 4.9
  m on, as its reference does.
- **The stalls are staged as the reference's straight ahead power off
  full stall and are kept.** The Airplane Flying Handbook defines a full
  stall by "an uncommanded nose down pitch [that] cannot be readily
  arrested, and may be accompanied by an uncommanded rolling motion"
  (FAA-H-8083-3C chapter 5), and R-DIG's Hatz stalled into "a nose low
  attitude". The plant's planes, held full back from 1.15 V_s at 8 m,
  instead settle into a steady stalled descent, the body 18 to 33 deg past
  the path until the grass: Skyhunter pitch minus 16 on a minus 36 path,
  Cub minus 18.5 on minus 40, Radian minus 10 on minus 29, Timber minus 17
  on minus 39, Bramor minus 10 on minus 30, and wings level to the
  hundredth of a degree in all of them. That is the plant's stall, not the
  staging, and goes to the core. A turning stall with inside rudder, the
  handbook's base to final accident, was flown as a trial: it arrives
  nose low (minus 35 to minus 37 deg) but by a spiral with the wing
  unstalled (7 to 11 deg), still ends upright, and was not kept, since
  the scenario and its bands are the straight ahead stall.
- **The Slow Stick cannot nose over on its take off roll,** and no
  reference says it does: its mains stand 0.18 m ahead of the CG, so the
  wheels' drag has to reach about 1.1 (tail up) to 1.3 (tail down) of
  their load, against 0.48 in loose sand and 0.70 on a skidding brake.
  The plant is right to refuse it. Its pilots write about its landings
  instead (R-SLOWSTICK), so its scenario is now the landing dive.
- **The Cub on sand tips onto its prop and rocks back.** The prop tip is
  a skid at 0.8 on every ground (R-ROLLING), 0.14 m under the CG and 0.23
  m ahead of it, so it pivots the aircraft over only above about 1.6.
  Real blades dig into soft ground and turn aircraft over (R-DIG), but no
  number for that grip was found: left to the core as a finding, not
  staged round. The Timber on the same program goes over.
- **The stalls' rest attitude band is borrowed from a test that was not a
  stall.** R-C172 test 2 flew the aircraft into soft soil at 20.9 m/s
  forward and 8.6 m/s down, a 22 deg path; R-DIG's Hatz is the nearer
  case (stalled, nose low, prop dug in, over). The band is unchanged and
  still LOW; R-DIG is added to its sources on the four tractors (Cub,
  Radian, Slow Stick, Timber), and its Cessna in the sand to the nose
  overs' rest attitude.
- **Blocked and stand in: none left.** The wind landed in round 1, so the
  chute drag and both capsizes are flown and judged, and the prop loss is
  a real break (section 6).
- **LOW bands that a better source would raise,** and why this round did
  not: every five inch obstacle band (R-A4-OFFSET, R-A4-REBOUND) and every
  whoop band (R-WHOOP) wants the footage of section 3 measured frame by
  frame, which needs a person with the clips; the cartwheels, poles and
  trees (R-AFH) want measured model crashes, none published; the belly
  slides (R-SLIDE) want a foam on grass friction, still not found; the
  float bands (R-SEAPLANE) have mechanisms and no numbers. What could be
  sourced better here was: the stall and nose over rest attitudes (R-DIG,
  above), the Slow Stick's ground accident (R-SLOWSTICK's landings) and
  the quad pilot after a hit (R-DISARM).
