# Buzzard Bombshell, stage 1: the aircraft, the model and what it is meant to do

The owner asked for "the Buzzard Bombshell" in the RC models list, with
BMJR Models' product photograph of its kit: a red tissue wing and
stabiliser, a black fuselage and fin with "BMJR" on it, cabin windows, a
wire gear on two wheels, a tail skid and a glow engine in the nose. This
file gives every number the plant is built from with its formula and
source, the behaviour and how each part of it is gated, the landing gear,
the crash parts, and the check table with its bands. It follows
`docs/SLOWSTICK-STAGE1.md`, since the two are both three channel aircraft
that bank on the rudder through their dihedral, and uses the same plant,
`src/native/plant_wing.c`, with a parameter table of its own. Where this
file says "the Slow Stick" it means that aircraft and that document.

## The aircraft

Joe Konefes of the Buzzards club of Chicago designed the Bombshell in 1940
as a Class C gas free flight model: 72 in of span, 850 sq in, 52.5 in long,
for "29-40 Glo, 45-65 ignition" engines as the later kit plans give them
(Outerzone oz5370, the 4K's kit plan; published in Air Trails, October
1940). It won the Buzzards Club's contest for a club design, and at the
1940 Nationals it set the Class C Open record, 49 minutes 40 seconds over
three flights, having "made a perfect take-off, grabbed a honey of a rising
air current ... drifted more than a mile away" (the AMA History Project's
museum blog). It is a SAM old timer, flown today in every size from 1/2A
Texaco to the full 72 in, and kits describe it as gentle: "gentle flying
characteristics" (Brodak's 46.5 in Spirit of Yesteryear kit), "fantastic
glide and retains energy well" (Stevens Aero's 40 in BuzzBomb).

BMJR makes one Bombshell, the 1/2A Texaco kit B-608: "The BMJR 1/2A Texaco
version has a 44 in span and 330 sq. in. of area ... Our Texaco powered
model came in RTF at 19.75 (including .5oz nose weight) ... Both have 3/850
LiPo, Polyspan covering and dope finish" (bmjrmodels.com, the product
page). The photograph is that model: the "Texaco powered" build, which in
SAM's 1/2A Texaco rules is a Cox reed valve .049. The engine in it is the
Cox Texaco .049, the engine Cox made for the event (Cox, Texaco .049 care
and operation; Stu Richmond, "Inside Engines", Model Builder, August 1989).
BMJR's electric build, a Himax motor on the same 3S 850, is not this one.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.1176 m | BMJR, 44 in |
| Wing area S | 0.2129 m² | BMJR, 330 sq in |
| Mean chord c = S/b | 0.1905 m | derived; the plant's reference chord |
| Aspect ratio AR = b²/S | 5.87 | derived |
| All up mass m | 0.5599 kg | BMJR, 19.75 oz ready to fly with the nose weight |
| Weight W, wing loading | 5.49 N, 25.8 N/m² (8.6 oz/sq ft) | derived; SAM's 1/2A Texaco minimum is 8 oz/sq ft, which BMJR quotes as 18.33 oz |
| Engine | Cox Texaco .049 (No. 4506), reed valve, 8.4 cc tank | Cox's sheet |
| Prop, rpm | Cox's 7 x 3.5, "9,100 to 9,600" rpm | Cox's sheet; Model Builder's test engine ran 8,600 to 10,900 on it |
| Throttle | the Cox throttle conversion for tanked .049s | coxengines.ca: it takes a .049 "from approximately 16,000 down to 6,500" and can cut it. The Texaco has no throttle of its own; see below |
| Pack | BMJR's 3S 850, for the radio | BMJR; the engine draws nothing from it |
| Channels | throttle, elevator, rudder | the conversion's throttle, and a 1/2A Texaco's rudder and elevator; no ailerons |

### Which engine, and how its throttle is modelled

The simulator's motors are electric: a thrust that falls off with speed
from a static figure at a pitch speed, and the stick is the duty. A glow
engine on a fixed prop is the same prop curve, since thrust and rpm are
the prop's, so the thrust is modelled honestly with the Cox numbers: 2.82
N static at 9,350 rpm, the middle of Cox's figure, from a static thrust
coefficient of 0.095 for a thin 7 x 3.5 (ESTIMATED; its power
coefficient of 0.035 gives 28.8 W at the shaft, 0.039 hp, which is where a
long run Cox .049 on a 7 in prop sits). What is not electric is the
throttle. The Texaco as sold has none: a Texaco event is a fuel allotment
and the engine runs until it is dry. An RC sport build that wants a
throttle fits Cox's throttle conversion, which takes a tanked .049 from
full to 6,500 of its 16,000 rpm, 0.41, and can shut it off. So the plant
gets a new table entry, `throttle_idle` = 0.40: the stick runs the engine's
rpm linearly from 40 percent of full to full, and closing it idles the
engine, which keeps turning. Nothing stops it in flight; the engine's
shutoff and running out of fuel are not modelled. There is no pack current
(`current_full` = 0), so the pack's voltage does not sag.

### The outline, off a plan

BMJR publishes the span, area and weight, and nothing of the outline.
Bob Peru's Baby Bombshell +20 percent, the 1/2A Texaco Bombshell of the
same size, is on Outerzone as a full size plan (oz2180: "42 in wingspan,
300 sq. ins., weight 17 ozs", "Cox Texaco .049 or any reed valve .049
recommended"), and BMJR's 44 in and 330 sq in are that plan's 42 in and
300 sq in scaled by 44/42 to one percent. Every station below was measured
off that plan at 80 dpi and scaled by 44/42, and `src/render/bombshellcraft.js`
draws them, so the plant and the model are the same aircraft.

| Quantity | Value | How |
| --- | --- | --- |
| Planform | a constant 7.19 plan in chord, balsa tips rounded in plan over the outer 1.8 in | the plan's top view; the drawn area is 325.8 sq in against BMJR's 330 |
| Section | flat bottomed, about 10 percent, the "typical wing section" | the plan; its zero lift angle about −4 deg, ESTIMATED as for the Slow Stick's |
| Incidence | 2 deg on the cabin | the plan: "wing is at 2 degree positive incidence (built in)"; "stab is at 0 degree incidence" |
| Polyhedral | 5 deg each side to 14.25 of the 21 plan in, the tips 23 deg from there | the plan's spar template, measured: the joint rises 1.2 in over 14.25 in and the tip 2.75 in over the last 6.4 in |
| CG | 33 percent of the chord behind the leading edge, 0.2 plan in over the thrust line | the forward end of the plan's "balance point range", 29 to 43 percent; the height ESTIMATED |
| Stabiliser S_h | 0.0481 m², 0.412 m across, 5.9 plan in root chord, swept leading edge, round tips | the plan, strip integrated; the elevator the aft 1.38 in, 29.6 percent of its area |
| Tail arm l_h | 0.573 m, wing to tail aerodynamic centre | the drawn stations |
| Fin and rudder S_v | 0.0155 m², 4.65 plan in over the deck, the rudder 53 percent | the plan, strip integrated |
| Fin arm l_v, height z_v | 0.534 m, 0.052 m | the drawn centroid |
| Fin aspect ratio, lift slope a_v | 1.49, 2.68 /rad | its own 0.99 raised half again by the stabiliser under it |
| Downwash dε/dα | 0.341 | DATCOM's gradient, the tail 60 mm under the wing; Nelson's far field reads 0.48 |
| Thrust line | 5.3 mm under the CG | the drawing; the plan's built in down thrust is not modelled |
| CL max | 1.0 | ESTIMATED: a 10 percent flat bottomed section at Re 8e4 (6.5 m/s, 0.19 m) makes about 1.1, times 0.9 for the wing and the trim, as for the Slow Stick |
| CD0 | 0.045 | ESTIMATED by equivalent skin friction: 0.73 m² wetted at C_fe 0.009 for doped tissue at low Reynolds number, 0.031; 0.008 for what stands in the air, the engine's cylinder, the wire gear and wheels, the bands, the skid; 0.006 for interference |
| Oswald e | 0.75 | a rounded tip wing with steep polyhedral and a cabin |
| Inertia Ixx, Iyy, Izz | 0.014, 0.019, 0.031 kg m² | ESTIMATED: the wing as a 0.12 kg bar across the span; in pitch the engine and nose weight 0.069 kg 0.15 m ahead, the radio pack 0.1 kg 0.08 m ahead, the tail 0.025 kg 0.57 m behind and the fuselage 0.12 kg along its length |
| Elevator, rudder travel | ±15, ±20 deg | ESTIMATED: no throws are published. The rudder is set gentler than the Slow Stick's 30, since this polyhedral banks it faster: full rudder banks it 47 deg in a second at 20 |

### The polyhedral as one dihedral

The rolling moment per sideslip of a constant chord wing is the integral
of its dihedral times the span station, so two panels at G1 inboard to a
fraction f of the half span and G2 outboard are one dihedral of
G1 f² + G2 (1 − f²): 14.7 deg here. The panels' lift is the flat wing's
times cos² of their dihedral by the share of the area each carries, 0.950.

## The coefficients

The aero convention, as for the other planes, turned into the body frame in
the plant exactly as theirs are. Per radian. `npm run bombshell:derive`
prints each one.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 4.45, 4.01, 2.68 | 2π AR/(AR+2), the wing's times 0.950 |
| CLα, aircraft | 4.99 | a_w + a_t (S_h/S) η (1 − dε/dα), η = 0.9 |
| Neutral point | 0.363 c behind the wing's aerodynamic centre | V_H η (a_t/a_w)(1 − dε/dα), V_H = 0.680 |
| Static margin | 0.287 | a free flight model's big stabiliser on a long arm: very stable |
| Zero lift line | 5.02 deg under the thrust line | the wing's −4 deg at 2 deg of incidence, the tail's share with its downwash |
| Cmα | −1.4345 | −CLα x static margin |
| Cm0 | +0.1892 | trims at 8.0 m/s with the elevator neutral |
| Cmq | −14.78 | −2 η a_t V_H l_h/c |
| Cmδe, CLδe | 1.277, −0.425 | η V_H a_t τ_e and −η (S_h/S) a_t τ_e, τ_e = 0.52 for 30 percent of the area |
| CYβ | −0.195 | −a_v S_v/S |
| Cnβ | +0.0810 | a_v V_V, V_V = 0.0348, less the cabin fuselage's −0.0121 (Nelson eq. 2.64, K_N 0.0012 per deg, side area 0.051 m²) |
| Cnr | −0.1002 | −2 a_v V_V l_v/b − CD0/4 |
| Clβ | −0.2949 | −a_w Γ (1+2λ)/(6(1+λ)) at the one dihedral, −a_v (S_v/S)(z_v/b) for the fin |
| Clp | −0.742 | strip theory |
| Clr, Cnp | +CL/4, −CL/8 | Nelson, table 3.4 |
| Cnδr, CYδr, Clδr | −0.0632, +0.1323, +0.0062 | −V_V a_v τ_r, a_v (S_v/S) τ_r, CYδr z_v/b, τ_r = 0.68 for 53 percent |
| Prop torque arm | 0.0070 m | ideal disc power 19.2 W at 9,350 rpm is 0.0197 N m at 2.82 N; the shaft's 28.8 W, 0.0294 N m, the band's top |
| P factor κ | 1.6 | the Cub's blade element figure |
| Stall arms ac, cp | 0.0761, 0.0703 | the Slow Stick's: the CG behind the wing's aerodynamic centre, and the plate's centre of pressure at 0.40 of the chord behind the CG |
| Stall blend | 3 deg | a 10 percent flat bottomed section stalls from its trailing edge; thinner than the Slow Stick's 4 |

## What is new in the plant for this aircraft

One table entry, zero for every other aircraft, so their arithmetic is bit
for bit what it was: S17 below holds their recorded hashes.

**A glow engine's throttle.** `throttle_idle`: where it is set, the duty
is `idle + (1 − idle) stick` instead of the stick. Thrust, the reported
rpm and the prop's torque all follow the duty as they do for a motor; the
engine at idle turns at 3,740 rpm and makes 0.45 N standing, which the
grass and the skid hold (S20), and nothing in flight, since its pitch
speed at idle, 5.5 m/s, is under any speed it flies at. Everything else is
the Slow Stick's: `FW_MIX_RUDDER`, the roll stick driving the rudder with
the yaw stick; the stall arms; `air_lift`, since this is a thermal machine
first.

## The intended behaviour, and how each part is proven

Each part is a gate in `scripts/bombshell-gates.js`, flown in Manual so it
is the airframe doing it and not a stabiliser.

| Behaviour | Gate | Derived |
| --- | --- | --- |
| Flies slowly on a small engine | S1 cruise at 75 percent stick, S2 stall, S4 top speed, S5 climb | 8.08, 6.49, 10.11 m/s; 0.91 m/s of climb |
| Glides like a free flight model | S3 | L/D 8.6 at 8 m/s |
| Levels itself with the sticks centred | S6: from a 30 deg bank at cruise, every stick let go | 7.8 deg after 6 s; the spiral halves a bank in 3.5 s |
| Turns on rudder | S7: full right roll stick, which is full right rudder | 47 deg after 1 s, right wing down |
| A gentle stall, not a wing drop | S9a and S9b: full up held 8 s from cruise, power off and on | a mush at 15.6 deg of alpha, 8.7 m/s, sinking 3.0 m/s, no wing drop or spin |
| Takes off by itself | S15: full throttle from standing, every stick centred | its three point attitude is past the stall; the stabiliser lifts the tail as the speed comes up and it flies off at the speed it trims at: 17.2 m to 8.0 m/s tail up |
| Lands on its wheels and skid | S16 | touches under 8 m/s and rests at S14's attitude |
| Climbs in thermals | S19: a straight pass through the strongest | 14.8 m gained |
| Idles and never stops | S20: throttle closed on the strip | 3,740 rpm, standing |

### Its stall, and what an owner should expect of it

Old timer free flight designs were drawn to stall gently, because a free
flight model that stalls on its own has to recover on its own: a big
stabiliser on a long arm, the CG well forward, dihedral. This one's static
margin is 0.29 of the chord. Its stall in the plant: with the elevator
held full up, the nose rises, the wing stalls at 11.5 deg of alpha, and
the pitching moment taken back through the stall trims it at 15.6 deg,
where it settles into a steep mush, nose a few degrees under the horizon,
wings level, sinking 3 m/s, turning only under the prop's torque with
power on. Let the stick go and it recovers in a phugoid. It does not drop
a wing and it does not spin. The pitch break, the wing drop and the spin
that crash round 4's aero work (pull request 59, open as this lands) adds
to every fixed wing will want this aircraft's own per airframe numbers
when it merges; see "Parallel work" below.

## Derived performance, the bands the plant must land in

Computed from the numbers above with L = W, T = D and the thrust model the
other planes use, by `scripts/bombshell-derive.js`. Each band is the Slow
Stick's in proportion about the derived figure unless it says otherwise.

| Check | Derived | Band |
| --- | --- | --- |
| S1 level speed at 75 percent stick | 8.08 m/s | 6.95 to 9.41 |
| S2 stall speed, level, power off | 6.49 m/s | 6.10 to 7.37 |
| S3 glide ratio at 8.0 m/s | 8.62 (best 8.76 at 7.31) | 7.67 to 9.65 |
| S4 top speed | 10.11 m/s | 9.2 to 11.35, level |
| S5 best climb | 0.91 m/s at 7.5 | 0.62 to 1.09 |
| S6 30 deg bank, hands off, bank at 6 s | 7.8 deg | 3.6 to 12.1, same side, never past 32 |
| S7 full roll stick, bank after 1 s | 47.5 deg | 28.9 to 72.1, right wing down |
| S8 level 45 deg bank at full throttle, radius | 9.08 m at 9.44 m/s | within 15 percent of the formula, 7.72 to 10.44 m, level |
| S9a full up, power off | alpha 15.6, 8.7 m/s, sink 3.00 | bank 15, yaw 20 deg/s, pitch over −35, sink 2.25 to 3.75 |
| S9b full up, 75 percent | | bank 15, yaw 20 deg/s, pitch over −35 |
| S10 phugoid at cruise | 5.63 s, ζ 0.22; short period 0.58 s, ζ 0.75 | 4.63 to 6.58 |
| S11 prop torque, static full throttle | 0.0197 N m rolling left | 0.0167 to 0.0335 |
| S12 throttle to idle from cruise | glides | pitch within 30 deg for 3 s |
| S13 a hand throw at 8.5 m/s, sticks centred | flies level | under 1 m lost, over 6.4 m/s after 3 s |
| S14 standing on its wheels and skid | the drawn pose: 8.50 deg, CG 0.1318 m, 14.0 percent on the skid | 8.0 to 9.0 deg, 0.127 to 0.137 m, 10 to 18 percent, no hull |
| S15 take off, sticks centred | 17.2 m to 8.0 m/s | 12.2 to 26.3 m, 6.9 to 9.2 m/s |
| S16 a landing | touches under 1.1 V_s by the Slow Stick's margin | under 8.0 m/s, at rest within 1.5 deg of S14, no hull or prop |
| S17 every other aircraft unmoved | their recorded trace hashes on main's module | identical |
| S18 Node and Chrome agree on a Bombshell trace that takes off | SHA-256 | identical |
| S19 a pass through the strongest thermal at cruise | 14.8 m | 11.1 to 18.5 |
| S20 the throttle closed on the strip | 3,740 rpm; 0.45 N against 0.65 N of resistance | 3,550 to 3,930 rpm, ground speed under 1 mm/s |

## What the plant measured

`npm run bombshell:gates`, on the plant as committed, 21 of 21:

| Check | Measured | Band |
| --- | --- | --- |
| S1 cruise | 8.22 m/s | 6.95 to 9.41 |
| S2 stall | 6.76 m/s | 6.10 to 7.37 |
| S3 glide | 8.64 at 7.80 m/s | 7.67 to 9.65 |
| S4 top | 9.89 m/s, climbing 0.11 | 9.2 to 11.35 |
| S5 climb | 0.81 m/s at 8.1 m/s | 0.62 to 1.09 |
| S6 hands off | 30.0, 16.1 at 2 s, 7.8 at 6 s | 3.6 to 12.1 at 6 s |
| S7 rudder bank | 45.9 deg after 1 s, right wing down, 54 deg/s of yaw | 28.9 to 72.1 |
| S8 turn | 9.62 m at 45.0 deg and 9.55 m/s, formula 9.28, 4 percent | 7.72 to 10.44 m |
| S9a full up, power off | bank 0.4, pitch −19 to 11, yaw 0.7 deg/s, sink 3.15 m/s at 8.84 m/s, alpha 16 | as above |
| S9b full up, power on | bank 2.2, pitch −9 to 11, yaw 2.5 deg/s, heading 16 deg in 8 s | as above |
| S10 phugoid | 5.56 s over 6 cycles | 4.63 to 6.58 |
| S11 torque | 0.0198 N m rolling left | 0.0167 to 0.0335 |
| S12 chop | worst pitch 8.5 deg | 30 |
| S13 throw | gained 0.74 m, 7.65 m/s | |
| S14 at rest | 8.41 deg, CG 0.1317 m, 12.0 percent on the skid | |
| S15 take off | 18.85 m to liftoff at 7.78 m/s, 3.93 s, heading 4.9 deg left | |
| S16 landing | touched at 7.59 m/s, rolled 21.8 m, at rest at 8.41 deg | |
| S19 thermal | 15.1 m (16.2 against 1.1 in still air) | 11.1 to 18.5 |
| S20 idle | 3,740 rpm, 0.452 N, ground speed 0.09 mm/s | |

What flying it before the bands were final changed, and what it found:

- The take off. The first derivation rolled at the three point attitude
  and never flew off: 8.5 deg of pitch and the zero lift line's 5 put the
  wing at 13.5 deg, past its stall, where it makes 0.50 of CL and 0.15 of
  CD. The plant showed what the real aircraft does: the stabiliser lifts
  the tail at about 6 m/s and it flies off at the speed its elevator trims
  at. The derivation now rolls tail up to that speed.
- S20 first gated the distance moved at idle and failed on 4.3 mm in 5 s.
  That is sim.c's step order, not the grass: the thrust's 0.8 mm/s of
  speed each step is integrated into the position before the wheels'
  impulse takes it back, so any push under the breakaway creeps at that,
  on every aircraft. The gate now reads the ground speed the friction
  leaves, 0.09 mm/s, and prints the creep. A finding for the lead, not
  changed here.
- The stabiliser. The Slow Stick's gains stalled this aircraft: from its
  cruise, 8.2 m/s against the plant's 7.3 m/s stall on its rounded lift
  curve, a pitch of 17 deg asked for is a stall and not a climb. Its
  Stabilised pitch is 12 deg at full stick with a gentler loop, and Acro
  asks 30 deg/s of pitch, what an old timer with 1.5 g in hand can give
  (g (n − 1)/V is 32 deg/s at 9 m/s), and 45 of roll on the rudder.
- The plant wide finding the Slow Stick recorded holds here: with the
  stall blend the plant's lift curve peaks at 0.79 against 1.0, a plant
  stall of 7.3 m/s against the formula's 6.49. The bands were derived
  with it in them.

## The landing gear

The Cub's model: two mains as springs and dampers along the ground normal
with anisotropic friction, and the prop's lowest tip as a skid. The tail
is a wire skid, not a wheel: it slides and does not steer. Numbers are the
drawn model's (`BOMBSHELL_DIMS`, craft frame to body frame):

| Quantity | Value | How |
| --- | --- | --- |
| Main wheels | x +0.0731, y ±0.0865, z −0.1217 m as drawn, −0.1267 unloaded; r 0.0222 | 1/16 in wire to 1 3/4 in light wheels, the plan's |
| Tail skid | x −0.5895, z −0.0452 as drawn, −0.0502 unloaded | the plan's skid under the stabiliser |
| Three point attitude | 8.50 deg nose up, CG 0.1318 m over the grass | the drawn model at rest |
| Static loads | 2.36 N each main, 0.77 N skid (14.0 percent) | moments about the contacts |
| Stiffness, damping | mains 473 N/m, 13.8 N s/m; skid 153 N/m, 3.4 N s/m | 5 mm of static deflection, 0.6 of critical |
| Friction | mains rolling 0.08, side 0.60; skid sliding 0.35 along, 0.50 across, no steering | a wire dragged over grass, ESTIMATED |
| Prop tip skid | x +0.1662, z −0.0942 | 50 mm clear with the aircraft level on its mains |
| Hull | hx 0.30, hy 0.5588, 0.065 down, 0.084 up | the centred box, for crashes only: the belly and the wing's top at the root. The fin and the polyhedral's raised tips stand outside it |
| Camera | x +0.1117, z +0.0310 | on the cowl's top behind the engine's cylinder |

Nothing steers it on the ground. With the rudder in its only air, the
slipstream the plant does not model, a taxiing Bombshell goes where it is
pointed; the prop's torque turns it about 5 deg left in the take off roll,
the way a glow taildragger swings, and it is off before that matters.

## The crash parts

`src/native/crash_parts.h` `PARTS_BOMBSHELL1118`, 17 parts, and a new
material, `SIM_MAT_BALSA` (11, `balsa` in `configs/parts.js`): balsa under
doped tissue. Nothing on this aircraft is foam, so nothing has a crush
plateau: a joint past its onset cracks and loses up to half its strength,
and past its limit it breaks, which is crash.c's rule for anything that is
not foam, wire, aluminium or a prop. A broken part sheds long pale balsa
splinters (`src/render/debris.js`). Free, balsa floats: 160 kg/m³.

| Joint | Limit | Derivation |
| --- | --- | --- |
| aft fuselage | 18 N m, 200 N | its weakest section, at the stabiliser, 22 x 33 mm of 1/16 in sheet on 1/8 in longerons: Z 1.8e-6 m³ at balsa's 20 MPa, 36 N m, and half for the glue joints and the cross grain |
| wing on its rubber bands | 1.9 N m, 20 N | four #32 bands at about 5 N each, 20 N over half the chord. ESTIMATED: no band tension is published. It pops off before its spar breaks as often as not, which is what rubber bands are for |
| each wing panel on the centre section | 2.1 N m, 80 N | the 3/16 in spar, 1/4 in leading edge and 1 x 1/8 in trailing edge at 20 MPa: 0.37, 0.87 and 0.87 N m |
| stabiliser | 2.4 N m, 50 N | its 3/16 x 5/16 and 3/16 x 3/8 in edges, 1.0 and 1.4 N m |
| fin | 1.4 N m, 40 N | its 3/16 x 3/8 in post |
| elevator, rudder | 0.4 N m, 20 N | tissue and thread hinges, which tear |
| engine | 4 N m, 200 N | two #2 screws pulling out of the 1/8 in ply firewall at about 200 N each on 20 mm. ESTIMATED |
| prop | yields 2.7 N m, sheds a blade at 5.4 | Cox's unfilled nylon 7 x 3.5, a 12 x 3 mm root at 150 MPa |
| gear, skid | 1.42 N m | 1/16 in music wire, the table's WIRE_M |

Balsa's modulus of rupture, about 20 MPa along the grain at the kit's 150
to 175 kg/m³: Gibson and Ashby, Cellular Solids, ch. 10, and the Forest
Products Laboratory's Wood Handbook. What the table does not model is the
tissue itself: a panel that breaks takes its tissue with it, but tissue
torn over an intact frame, which on the real aircraft loses lift without
anything breaking, is not a thing the part system has.

Flown with damage on (a throwaway probe, not a gate): an arrival at 7
m/s and 10 deg nose down writes nothing; 8 m/s at 25 deg folds both gear
legs, chips the prop, breaks a wing panel off and knocks the wing off its
bands; 9 m/s at 45 deg breaks the engine off the firewall, a panel and the
wing's bands, folds the gear, cracks and then loses the radio pack, cracks
the stabiliser and snaps the aft fuselage off. The crash suite's scenarios and bands
(`tests/crash/scenarios.js`, `tests/crash/bands.json`) do not have this
aircraft yet; its references are the next round's.

## The stabiliser

The Slow Stick's loops with this aircraft's gains: the roll loop's stick
is the rudder, no turn coordinator. Stabilised asks a bank of 45 deg and a
pitch of 12 at full stick (roll 1.6 and 0.6, pitch 3.0 and 0.5). Acro asks
45 deg/s of roll and 30 of pitch. The rudder's roll through this much
dihedral rides the Dutch roll, a 1 s period at 0.17 of critical, so the
roll rate swings between about 10 and 80 deg/s on its way, and
`scripts/bombshell-stab-selftest.js` reads the roll rate as the bank gained
over the stick's 0.8 s. It does not roll inverted. `npm run bombshell:stab`
checks the Slow Stick's list with each band in proportion about this
aircraft's own figure, and on the ground that the skid does not steer.

The default tune is Acro, as it is for every fixed wing. Manual is where
this aircraft's character is.

## In the shell

`bombshell1118`, simId 11, is the ninth plane behind the Free Flight card
(the fixed wings' card, called Fixed wing until main renamed it), in the
wing class, with Acro (the default), Stabilised and Manual rows, its
FPV camera on the cowl behind the cylinder, and `gear` from the plant's
settled pose, 0.1318 m and 8.50 deg, so throttle on the strip rolls it
off; L still throws it. Its sound is the fixed wings' voice
(`src/render/audio.js` `wing`): the blade pass of its two blade prop at
the reported rpm, which puts full power near 310 Hz and idle near 125. A
two stroke glow engine's own note, its firing at once per revolution, is
not synthesised; the voice is the nearest there is.

`npm run bombshell:shell` is the whole flow in headless Chrome: the Free
Flight card pressed, the Bombshell picked on the Aircraft row, and flown
on the airfield and on swiss2. On both: the setting, the run, module 11
and the drawn model all read the Bombshell, on bombshell-acro with the
stabiliser in mode 2, parked with its CG 0.1318 m over the ground, which
is the plant's rest; full throttle with the sticks centred takes it off
(at 8.9 m/s on the airfield, 8.8 on swiss2) and climbs it 3 m clear of
the ground at 9.2 m/s, full roll stick banks it right on the rudder, and
C puts the chase camera on it. Pressing the card again keeps it seated,
which is what being one of the card's planes means.

## What the owner should feel flying it

Slow, stable and floaty, with its engine always running. Full throttle and
it trundles off the strip in about 19 m on its own, the tail coming up by
itself, and climbs at under 1 m/s, which is what a Texaco .049 does.
Cruise is barely above its stall; it will not go faster than 10 m/s.
Rudder banks it briskly, 45 deg in a second, and it wags its tail in a
lightly damped Dutch roll as it does; let go and the polyhedral levels it
in a few seconds. Haul the stick back and it mushes, it does not snap.
Close the throttle and it glides at 8.6 to 1, and in a thermal it goes up.

## Parallel work

Pull request 59 (crash round 4 aero, `stall_dw` and `stall_asym` per
airframe) was open when this was built. If it lands first this aircraft
gets its two numbers from `npm run stall:derive`'s rule; if this lands
first, that branch rebases and adds them.

## Conventions

The Slow Stick's, unchanged: world right handed, Z up; body X forward, Y
left, Z up; SI; 1000 Hz fixed step; sticks roll, pitch, yaw, throttle,
with expo 0.3; yaw stick positive nose right, which is a negative rudder
angle, and so is the roll stick on this aircraft. `sim_plane_surfaces(out[4])`
reads zero, zero, elevator, rudder.

## Sources

- BMJR Models, Buzzard Bombshell, product B-608 (bmjrmodels.com): span,
  area, weight, the Texaco and electric builds, the pack and covering.
- Outerzone oz2180, Baby Bombshell +20 percent, Bob Peru, 1992: the full
  size plan, every station, the incidences, the spar template, the balance
  range, the wheels, the engine.
- Outerzone oz5370, Buzzard Bombshell, 4K's kit plan of the 1940 original:
  span, area, length, engines, Air Trails October 1940.
- AMA History Project museum blog, "Joe Konefes' Buzzard Bombshell"
  (2013): the design contest and the 1940 Nationals record flight.
- Cox Products, Texaco .049 and Texaco Jr .049 care and operation, 1994
  (exmodelengines.com TEXMAN.pdf and coxengines.ca): rpm, prop, tank,
  dimensions.
- Stu Richmond, "Inside Engines: Cox Texaco .049", Model Builder, August
  1989, pp. 46, 47 and 77 (reprinted by Sceptre Flight): SAM's 1/2A
  Texaco rules, measured rpm on the 7 x 3.5, 8 x 4 and 8 x 3.
- Cox International, throttle conversion for tanked .049 engines
  (coxengines.ca): 16,000 to 6,500 rpm, and shutoff.
- Brodak, Spirit of Yesteryear Bombshell; Stevens Aero, BuzzBomb 400:
  flight character.
- Nelson, Flight Stability and Automatic Control, ch. 2, 3 and 5; USAF
  DATCOM, the downwash gradient; Hoerner, Fluid Dynamic Lift, ch. 3;
  Gibson and Ashby, Cellular Solids; USDA Forest Products Laboratory,
  Wood Handbook.
