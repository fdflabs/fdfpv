# Slow Stick, stage 1: the aircraft, the model and what it is meant to do

Another fixed wing, and the first without ailerons: every number the
plant is built from with its formula and source, the behaviour the owner
asked for and how each part of it is gated, the landing gear, and the
check table with its bands. It follows `docs/CUB-STAGE1.md`, which did the
same for the Cub, and uses the same plant, `src/native/plant_wing.c`, with
a parameter table of its own. Where this file says "the Cub" it means that
aircraft and that document.

## The aircraft

The GWS Slow Stick: the slow flyer a generation of pilots learned on. A
moulded foam wing, flat bottomed, with a lot of dihedral, held by rubber
bands on two plastic saddles over a square black tube; a sheet foam
stabiliser and fin on the tube's end with a big elevator and a big rudder;
a can motor on a 6.6 to 1 gearbox turning a slow 11 inch prop in front; a
wire V of main gear and a small tailwheel. Three channels: throttle,
elevator and rudder. It banks on the rudder, through the dihedral, and the
same dihedral brings the wings back level when the sticks are let go.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.176 m | GWS, "1176 mm (46.3 in)"; air-rc.com and Aloft Hobbies' listing reprint it |
| Length | 0.954 m | GWS, "954 mm (37.6 in)" |
| Wing area S | 0.3264 m² | GWS, 32.64 dm² (505.9 sq in), Aloft Hobbies' listing |
| Mean chord c = S/b | 0.2776 m | derived; the plant's reference chord, as for the other planes |
| Aspect ratio AR = b²/S | 4.24 | derived |
| All-up mass m | 0.42 kg | the published 405 to 440 g with the stock EPS-300C and a 7.2 V pack (the GWS Slow Stick article's specification table); retail listings print 450 to 600 g for heavier builds |
| Weight W = mg | 4.12 N | g = 9.81 |
| Wing loading W/S | 12.6 N/m², 12.9 g/dm² | derived; the published 12.4 to 13.5 g/dm² |
| CG | 100 mm behind the leading edge | the published "forward range of 95 to 105 mm", where the stall is "very docile"; a build log's 4 1/8 in (105 mm) |
| Motor, gearbox, prop | GWS EPS-300C D, 66/10 = 6.6 : 1, EP1180, 11 x 8 in | GWS's EPS-300C power table; the EP1180 is the kit's prop (a build log: "stock EPS-300C motor and EP-1180 propeller") |
| Static thrust T_s | 2.69 N | GWS's table for the D gearbox with the EP1180 at 7.2 V: 274 g at 6.1 A, 43.9 W |
| Thrust to weight | 0.65 | derived; the stock Slow Stick is known to cruise at part throttle and climb gently, and "cannot hover with stock motors" |
| Loaded prop rpm | 3,300 | ESTIMATED: static thrust coefficient 0.12 for a slow flyer of pitch to diameter 0.73 gives 3,300 from the 274 g, and a power coefficient of 0.075 gives 3,000 from about 20 W at the shaft |
| No-load rpm, pitch speed V_p | 3,882; 11.18 m/s | the loaded rpm over the plant's 0.85, and V_p = rpm/60 x pitch x 0.85 as for every other aircraft |
| Full throttle current | 6.1 A | GWS's table |
| Pack | 2S | 7.2 to 8.4 V, GWS's table's range; a 2S LiPo is what the kit is flown on now |
| Channels | throttle, elevator, rudder | GWS: "rudder, elevator and throttle"; no ailerons |

The rest is off photographs, and is ESTIMATED to about ten percent: GWS's
own photograph of two built aircraft, Aloft Hobbies' production
photographs of the kit's parts (the wing, the stabiliser and fin sheet,
the stick and its saddles, the gear wire and wheels) and of built
aircraft, in proportion to the published span and length. They are the
numbers `src/render/slowstickcraft.js` draws, so the plant and the model
are the same aircraft.

| Quantity | Value | How |
| --- | --- | --- |
| Planform | a constant 0.3033 m chord, each tip cut back from the leading edge over its last 100 mm | the parts photograph; the chord is the one that gives the published area with that cut, S/(b − 0.1) |
| Mean aerodynamic chord | 0.2939 m, its leading edge 9 mm behind the root's | derived from the planform |
| Section | flat bottomed, 9 percent | the moulded wing; the section's zero lift angle about −4 deg, ESTIMATED |
| Dihedral Γ | 12 deg each side, from a single joint | a build log: the braces "at 12-degrees dihedral"; GWS's photograph, measured roughly, gives 9 to 11 deg each side. See the note below |
| Incidence | 3 deg on the saddles | the leading edge saddle 25 mm over the stick, the trailing edge one 16 mm lower over the chord |
| Horizontal tail | a flat 5 mm plate, 0.36 m across its leading edge and 0.44 m across its trailing edge, 0.14 m of chord: 0.0560 m² | the parts photograph; elevator the aft 45 percent, cut with the scalloped edge |
| Tail arm l_h | 0.512 m, wing to tail aerodynamic centre | the stabiliser's leading edge 0.78 m aft of the prop |
| Fin and rudder S_v | 0.030 m², a half egg 0.18 m long and 0.19 m tall on the stabiliser, the rudder the aft half | the parts photograph |
| Fin arm l_v, height z_v | 0.530 m, 0.078 m | the drawing |
| Fin effective aspect ratio, lift slope a_v | 1.8, 2.98 /rad | its own 1.2, raised half again by the stabiliser under it |
| Downwash dε/dα | 0.494 | DATCOM's gradient, which accounts for the tail sitting 0.9 half spans behind and 45 mm under the wing; Nelson's far field 2 a_w/(π AR) reads 0.641 at this aspect ratio and would put the neutral point on the CG, which a Slow Stick at 100 mm does not have |
| Thrust line | on the stick, 2.5 mm under the CG | the drawing: the wing above the stick and the pack, motor and gear below it put the CG 2.5 mm over the stick's line |
| CL max | 1.05 | ESTIMATED: a thick flat bottomed section at Re 1e5 (4.5 m/s, 0.3 m chord), section cl max about 1.2, times 0.9 for the rectangular wing and the trim |
| CD0 | 0.040 | ESTIMATED by equivalent skin friction: wetted area 0.88 m² at C_fe 0.010 for rough foam at low Reynolds number, 0.027, and 0.012 for what stands in the air: the wire gear and spoked wheels, the gearbox and can, the pack, the saddles, the servos |
| Oswald e | 0.80 | a rectangular wing of AR 4.2 with no fuselage to speak of |
| Inertia Ixx, Iyy, Izz | 0.0125, 0.022, 0.033 kg m² | ESTIMATED: the wing as a 0.10 kg bar of 1.18 m; in pitch the motor and gearbox 0.07 kg 0.30 m ahead, the pack 0.10 kg 0.15 m ahead, the tail 0.03 kg 0.55 m behind and the stick spread over 0.9 m |
| Elevator, rudder travel | ±15, ±30 deg | ESTIMATED: GWS's figures were not found. The rudder is set up big on a rudder only aircraft, "maxed out" in build logs |

### The dihedral, and why it is twelve degrees a side

"12 degrees" is the figure the builders quote and it could be read two
ways: twelve a side, or twelve between the two panels. The second reading,
six a side, was tried first, and the four state lateral model says what it
would fly like: a spiral that doubles a bank every 10 s. The criterion is
Clβ Cnr against Cnβ Clr; with the big fin both sides scale with it, so it
reduces to |Clβ| (2 l_v / b) > Clr, and at the Slow Stick's cruise CL of
0.66 that needs about 8.5 deg a side. Six a side would not level itself,
and the accounts of the aircraft, and the brief, say it does. GWS's
photograph of two built aircraft, measured roughly tip to tip against the
root, gives 9 to 11 deg a side. Twelve a side is taken, with that as its cross check.

## The coefficients

The aero convention, as for the other planes, turned into the body frame in
the plant exactly as theirs are. Per radian. `npm run slowstick:derive`
prints each one.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 4.27, 3.98, 2.98 | 2π AR/(AR+2) |
| CLα, aircraft | 4.58 | a_w + a_t (S_h/S) η (1 − dε/dα), η = 0.9 |
| Neutral point | 0.134 c behind the wing's aerodynamic centre, station 0.340 m | V_H η (a_t/a_w)(1 − dε/dα), V_H = 0.317 |
| Static margin | 0.073 | the CG 17 mm behind the wing's aerodynamic centre |
| Zero lift line | 6.06 deg under the stick | the wing's −4 deg at 3 deg of incidence, the tail's share with its downwash |
| Cmα | −0.333 | −CLα x static margin |
| Cm0 | +0.0496 | trims at 5.5 m/s with the elevator neutral |
| Cmq | −4.19 | −2 η a_t V_H l_h/c |
| Cmδe, CLδe | 0.737, −0.400 | η V_H a_t τ_e and −η (S_h/S) a_t τ_e, τ_e = 0.65 for 45 percent of the chord |
| CYβ | −0.274 | −a_v S_v/S; the stick has no side area worth counting |
| Cnβ | +0.1233 | a_v V_V, V_V = 0.0414 |
| Cnr | −0.1211 | −2 a_v V_V l_v/b − CD0/4 |
| Clβ | −0.2416 | −a_w Γ (1+2λ)/(6(1+λ)) for the dihedral, −a_v (S_v/S)(z_v/b) for the fin |
| Clp | −0.711 | strip theory |
| Clr, Cnp | +CL/4, −CL/8 | Nelson, table 3.4 |
| Cnδr, CYδr, Clδr | −0.0678, +0.1505, +0.0100 | −V_V a_v τ_r, a_v (S_v/S) τ_r, CYδr z_v/b, τ_r = 0.55 |
| Clδa, Cnδa | 0 | no ailerons |
| Prop torque arm | 0.0122 m | ideal disc power 11.4 W at 3,300 rpm is 0.033 N m at 2.69 N; GWS's electrical figure through the can and gears gives 0.057, the band's top |
| P factor κ | 1.6 | the Cub's blade element figure |

## What is new in the plant for this aircraft

Two things, each a table entry that is zero for the other planes, so their
arithmetic is bit for bit what it was: their gates and every recorded
trace hash are the proof (S17 below, and each aircraft's own gates).

**A rudder mix.** `FW_MIX_RUDDER`: no ailerons, their slots in
`sim_plane_surfaces` and `sim_wing_surfaces` read zero, and the rudder is
driven by the sum of the yaw stick and the roll stick, clipped at full
travel, before the expo. The stabiliser needs no change: its roll loop's
output is the roll stick, so in Stabilised and Acro the bank is flown on
the rudder too. There is no turn coordinator (its gain is zero), since the
rudder is the roll control and a coordinator would fight it.

How the roll stick came to drive the rudder: on a four channel radio a
three channel aircraft's rudder goes on the stick that rolls an aileron
aircraft, so a pilot's right stick is elevator and rudder, the way a two
stick trainer is flown single handed. That is how Slow Stick pilots on
mode 2 radios set it up, and it is what makes an aileron pilot's reflexes
work: right stick, right bank. Mixing rather than moving the channel keeps
the yaw stick live, so a pilot who flies rudder on the left stick gets
exactly what they expect as well, and the two together clip at the
rudder's travel rather than adding past it. Both sticks also steer the
tailwheel on the ground, through the rudder.

**The pitching moment past the stall.** The plant's moment is linear in
alpha, which through the stall assumes the wing keeps making the lift it
no longer makes, at the quarter chord where it no longer acts. On an
aircraft with its CG 17 mm behind the wing's aerodynamic centre and a big
elevator that matters: full up trims the linear moment at 41.7 deg of
alpha, and the first plant flew a full up stall as a parachute at 40 deg
with the nose plunging to −36 deg on the way. Two arms, both per chord,
take it back through the same stall blend σ the lift uses:

  ΔCm = −σ (arm_ac CL_lin + arm_cp CL_plate)

arm_ac = 0.0617 is the CG behind the wing's aerodynamic centre, which
takes back the linear lift's nose up moment the stalled wing does not
make; arm_cp = 0.0972 is the flat plate's centre of pressure behind the
CG, at 0.40 of the mean chord (Hoerner, Fluid Dynamic Lift, ch. 3: a
plate's moves from the quarter chord toward 0.4 by 20 to 40 deg). With
them full up trims at 17.9 deg, just past the stall: the mush.

**One change to the contact path**, in `src/native/sim.c`, and why. A
Slow Stick that noses in above about 6 m/s goes over onto its nose past
the vertical, as a tall light aircraft does. The inverted branch supports
an aircraft on its "bump" at the top of the hull through the CG; past the
vertical on its nose that bump is high in the air, and the only thing
under the ground is a hull corner, which the projection held up with no
impulse. So nothing stopped the fall's speed, the velocity in the state
grew by g every second while the position stood still, and nothing
toppled it. For a wing, when the bump does not touch, the supporting
vertex now takes the impulse, as it already does on a wing's side, and a
nose-in from 6 to 10 m/s comes to rest nose down on the prop and the
hull's front, where the Cub's nose-in comes to rest too. A wing
on its back on the bump, or in the air, goes through exactly the old path;
wing:contact, every airframe's gates and the recorded hashes are
unchanged.

## The intended behaviour, and how each part is proven

The owner asked for this aircraft "along with the intended behavior". Each
part is a gate in `scripts/slowstick-gates.js`, flown in Manual so that it
is the airframe doing it and not a stabiliser.

| Behaviour | Gate | Derived |
| --- | --- | --- |
| Floats and flies slowly and gently | S1 cruise at 75 percent, S2 stall, S4 top speed, S3 glide | 5.58, 4.43, 8.37 m/s; L/D 8.2 |
| Turns on rudder with a lazy bank | S7: full right roll stick, which is full right rudder, from level cruise: the bank after a second and which way | 33 deg, right wing down, by the lateral model |
| Self rights with the sticks centred | S6: from a 30 deg bank at cruise, every stick let go: the bank after 6 s, the same side, never steeper | 12.9 deg; the spiral halves a bank in 5.8 s |
| Very hard to stall viciously | S9a and S9b: full up held 8 s from cruise, power off and on: no wing drop (bank under 15 deg), no yaw that is a spin (under 20 deg/s), no plunge (pitch over −35 deg), and power off, a mush at the sink the moment's trim gives | 17.9 deg of alpha, 5.7 m/s, 2.09 m/s of sink |
| Flown in small spaces | S8: a level 45 deg bank held on the rudder at 90 percent: the radius; and S15, the take off roll | 4.66 m; 4.9 m of roll |
| Lands at a jog on a small gear | S16: a glide from 3 m, a flare, touchdown speed over the ground, rest on three wheels | 1.1 V_s = 4.9 m/s |
| Blown about by wind | not gated | the simulator's world has no wind: the plant's relative wind is its own velocity. When wind arrives this aircraft, at 12.6 N/m² and 5.6 m/s, is the one that will show it first |

"Stalls at walking pace" in the brief is a figure of speech: its stall is
4.4 m/s, 16 km/h, which is a run. It lands at a jog into any breeze, and
without one it touches at 4.9 m/s.

## Derived performance, the bands the plant must land in

Computed from the numbers above with L = W, T = D and the thrust model the
other planes use, by `scripts/slowstick-derive.js`. Each band is the Cub's
in proportion about the derived figure unless it says otherwise.

| Check | Derived | Band |
| --- | --- | --- |
| S1 level speed at 75 percent | 5.58 m/s | 4.8 to 6.5 |
| S2 stall speed, level, power off | 4.43 m/s | 4.16 to 5.03 |
| S3 glide ratio at 5.5 m/s | 8.15 (best 8.16 at 5.62) | 7.25 to 9.15 |
| S4 top speed | 8.37 m/s | 7.6 to 9.4, level |
| S5 best climb | 1.17 m/s at 5.0 | 0.8 to 1.4 |
| S6 30 deg bank, hands off, bank at 6 s | 12.9 deg | 6 to 20, same side, never past 32 |
| S7 full roll stick, bank after 1 s | 32.9 deg | 20 to 50, right wing down |
| S8 level 45 deg bank at 90 percent, radius | 4.66 m at 6.76 m/s, 6.9 deg of up elevator | within 15 percent of the formula, 3.96 to 5.36 m, level |
| S9a full up, power off | alpha 17.9, 5.73 m/s, sink 2.09 | bank 15, yaw 20 deg/s, pitch over −35, sink 1.57 to 2.61 (25 percent) |
| S9b full up, 75 percent | | bank 15, yaw 20 deg/s, pitch over −35 |
| S10 phugoid at cruise | 6.08 s, ζ 0.32; short period 1.31 s, ζ 0.91 | 5.0 to 7.1 |
| S11 prop torque, static full throttle | 0.033 N m rolling left | 0.028 to 0.065 |
| S12 throttle chop from cruise | glides | pitch within 30 deg for 3 s |
| S13 a hand throw at 6 m/s, sticks centred | flies level | under 1 m lost, over 4.5 m/s after 3 s |
| S14 standing on its wheels | the drawn pose: 6.91 deg, CG 0.1349 m, 25.8 percent on the tail | 6.4 to 7.4 deg, 0.130 to 0.140 m, 20 to 32 percent, no hull |
| S15 take off, sticks centred | 4.9 m to liftoff at 5.2 m/s | 3.5 to 7.5 m, 4.5 to 6.0 m/s |
| S16 a landing on its wheels | touches at 1.1 V_s | under 5.5 m/s, at rest within 1.5 deg of S14, no hull or prop |
| S17 the five inch, wing, Skyhunter, Cub, Radian and Bramor unmoved | their recorded trace hashes | identical |
| S18 Node and Chrome agree on a Slow Stick trace that takes off | SHA-256 | identical |

## What the plant measured, and what flying it corrected

`npm run slowstick:gates`, on the plant as committed:

| Check | Measured | Band |
| --- | --- | --- |
| S1 cruise | 5.75 m/s | 4.8 to 6.5 |
| S2 stall | 4.67 m/s | 4.16 to 5.03 |
| S3 glide | 8.04 at 5.26 m/s | 7.25 to 9.15 |
| S4 top | 8.25 m/s, climbing 0.09 | 7.6 to 9.4 |
| S5 climb | 1.14 m/s at 5.8 m/s | 0.8 to 1.4 |
| S6 hands off | 30.0, 14.6 at 2 s, 8.8 at 6 s, never past 30.0 | 6 to 20 at 6 s |
| S7 rudder bank | 31.9 deg after 1 s, right wing down, 50 deg/s of yaw | 20 to 50 |
| S8 turn | 5.28 m at 45.2 deg and 6.92 m/s, formula 4.86, 9 percent | 15 percent, 3.96 to 5.36 m |
| S9a full up, power off | bank 0.9, pitch −25 to 14, yaw 1.8 deg/s, sink 2.01 m/s at 5.69 m/s, alpha 18 | as above |
| S9b full up, power on | bank 3.9, pitch −11 to 15, yaw 6.3 deg/s, heading 39 deg in 8 s, alpha 18 | as above |
| S10 phugoid | 5.95 s over 5 cycles | 5.0 to 7.1 |
| S11 torque | 0.0328 N m rolling left | 0.028 to 0.065 |
| S12 chop | worst pitch 9.1 deg | 30 |
| S13 throw | gained 0.42 m, 5.24 m/s | |
| S14 at rest | 6.89 deg, CG 0.1348 m, 25.9 percent on the tail | |
| S15 take off | 4.38 m to liftoff at 5.08 m/s, 1.45 s, straight | |
| S16 landing | touched at 4.99 m/s, rolled 10.6 m, at rest at 6.89 deg | |

What flying the plant before the bands were final changed:

- The dihedral: six a side diverged; see the note above.
- The pitching moment past the stall, above. Without it full up was a
  40 deg parachute with a −36 deg plunge on the way in.
- S8 was first flown with `fly()`'s bank hold and height hold, which left
  a standing bank error on an aircraft that levels itself, and whose pitch
  damping read the turn's own steady pitch rate as a disturbance: it sank
  0.5 to 0.8 m/s in the turn and a vertical speed loop wound the elevator
  to full up behind the power curve. The gate's pilot now has an integral
  on the bank and damps only the pitch rate the turn does not ask for; the
  band did not move.
- S9 first gated the heading change within 30 deg. Power on, the prop's
  torque and P factor turn the mushing aircraft 39 deg in 8 s, at 5 deg/s,
  with the wings within 4 deg of level: the torque turn a stock Slow Stick
  needs trim for, not a departure. The gate now asks what a departure is,
  a wing drop or a yaw rate a spin would have.
- The level turn in the derivation first had no pitch damping and no
  elevator lift; with both, 45 deg at 75 percent has no level solution, and
  the gate flies it at 90.
- A plant wide finding for the lead, not changed here: with the stall
  blend the plant's lift curve peaks well under CLmax on the unstalled
  branch, 0.81 against 1.05 here (0.85 against 1.15 on the Cub's numbers),
  so every aircraft's measured stall is a few percent over its CLmax
  derivation. Each aircraft's bands were derived with that already in
  them, so nothing is out; it is a thing to know before deriving the next.

## The landing gear

The Cub's model unchanged: two mains and a steered tailwheel as springs
and dampers along the ground normal with anisotropic friction, and the
prop's lowest tip as a skid. The numbers are the drawn model's
(`SLOWSTICK_DIMS`, converted from the craft frame to the body frame):

| Quantity | Value | How |
| --- | --- | --- |
| Main wheels | x +0.180, y ±0.085, z −0.1275 m as drawn, −0.1325 unloaded; r 0.030 | the wire V raked forward from the leading edge saddle to 60 mm spoked wheels |
| Tailwheel | x −0.568, z −0.0545 as drawn, −0.0595 unloaded; r 0.0125; steer 1.0 | a 25 mm wheel on a wire leg under the stabiliser, steered off the rudder |
| Three point attitude | 6.91 deg nose up, CG 0.1349 m over the grass | the drawn model at rest |
| Static loads | 1.53 N each main, 1.06 N tail (25.8 percent) | moments about the contacts |
| Stiffness, damping | mains 300 N/m, 9.6 N s/m; tail 210 N/m, 4.5 N s/m | 5 mm of static deflection, 0.6 of critical |
| Friction | rolling 0.08; side 0.50 | the Cub's grass; thin moulded tyres grip less across than rubber |
| Prop tip skid | x +0.31, z −0.1422 | 15 mm clear with the aircraft level on its mains, touching at 7 deg nose down about them |
| Hull | hx 0.30, hy 0.588, 0.03 down, 0.06 up | the centred box, for crashes only: the pack's bottom and the wing's top at the root. The fin and the dihedral's raised tips stand outside it |
| Camera | x +0.22, z +0.0165 | the drawn mount on the stick behind the gearbox |

At the rest attitude the wing sits at 13 deg of zero lift alpha, at the
top of its lift curve, so the Slow Stick lifts itself off with the sticks
centred at 5.1 m/s. On grass at
the Cub's rolling resistance, a third of the throttle barely moves it:
its static thrust is 0.65 of its weight against the Cub's 1.04.

## The stabiliser

The other planes' loops with the Slow Stick's gains, and the difference
that runs through all of it: the roll loop's stick is the rudder. It is
slower than an aileron, and the dihedral levels the aircraft on its own,
so a proportional bank hold leaves a standing error; the Stabilised roll
gains are 2.0 and 0.8 and the bank asked for at full stick is 45 deg,
where a rudder can hold one at a Slow Stick's power. Acro asks for 60
deg/s of roll and 60 of pitch and holds its target against the dihedral
on its integral. It does not roll inverted, and is not asked to: a rudder
and twelve degrees of dihedral cannot. No turn coordinator.

`npm run slowstick:stab` checks it: level with the sticks centred, the
bank asked for, levelling on release, pitch, and the yaw stick's rudder
still winning over the level hold (by less than on an aircraft with
ailerons, since the two share the surface); Acro's hold, its rate, its
stop and its pitch; Manual's roll on the rudder and its self levelling;
the mix as numbers (aileron slots zero, roll and yaw both full right
rudder, clipped together, cancelling opposed); and on the wheels, no wind
up, a straight take off in every mode, and the roll stick steering the
tailwheel.

The default tune is Acro, as it is for the other planes. Manual is where
this aircraft's character is: in Acro a held bank stays held, and in
Stabilised a gyro levels it, where the real thing levels itself.

## In the shell

`slowstick1180`, simId 5, is the fifth plane behind the Fixed wing card,
in the wing class, with Acro (the default), Stabilised and Manual rows, its
FPV camera on the stick behind the gearbox, and `gear` from the plant's
settled pose, so throttle on the strip rolls it off its wheels and L still
throws it. In headless Chrome on the airfield: the setting, the drawn
model and the module all read the Slow Stick, module 5 on slowstick-acro
with the stabiliser in mode 2; parked 0.1349 m over the ground, which is
the plant's rest; the start prompt the Cub's. Full throttle rolls it off
at about 4.5 m/s in a little over a second, and 10 s later it is 6.8 m up
at 6.84 m/s, holding its liftoff attitude in Acro; full roll stick banks
it right on the rudder.

## Conventions

The Cub's, unchanged: world right handed, Z up; body X forward, Y left, Z
up; SI; 1000 Hz fixed step; sticks roll, pitch, yaw, throttle, with expo
0.3; yaw stick positive nose right, which is a negative rudder angle, and
so is the roll stick on this aircraft. `sim_plane_surfaces(out[4])` reads
zero, zero, elevator, rudder.

## Sources

- GWS Slow Stick specifications: air-rc.com's model page and Aloft
  Hobbies' GWS Slow Stick listing (span, area, weight, wing loading);
  the GWS Slow Stick encyclopedia article (length, weight, motor, prop,
  pack, channels, CG range and its stall).
- GWS, EPS-300C power system table (gwsus.com), the D gearbox's rows.
- GWS EP1180, 11 x 8 in (279 x 203 mm): dealer listings.
- A build log, verrill.org/rc/ss (dihedral braces, CG).
- A build log, crodog.org/slowstick (stock motor and prop).
- Photographs: GWS's of two built aircraft; Aloft Hobbies' of the kit's
  parts and of built aircraft.
- Nelson, Flight Stability and Automatic Control, ch. 2, 3 and 5; USAF
  DATCOM, the downwash gradient; Hoerner, Fluid Dynamic Lift, ch. 3.
