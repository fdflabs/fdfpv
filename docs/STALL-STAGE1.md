# Past the stall, stage 1: the pitch break, the wing drop and the spin

Crash round 4's aero item (docs/CRASH-PLAN.md, "Round 4 targets"): what
every fixed wing does once its wing has stalled. Code:
`src/native/plant_wing.c` (the step's `cm_stall` and `panel_stall`, and
four numbers in each table). Numbers: `scripts/stall-derive.js`. What the
aircraft do with them: `scripts/stall-probe.js`. The proof that nothing
below the stall moved: `scripts/stall-crossing.js`.

## What was wrong

The plant blends its lift and drag from the linear wing to a flat plate
through the stall (a cubic in the angle of attack, `stall_blend` either
side of CLmax / CLα), and that part was sound. Its moments were not. Held
full back from 1.15 V_s, every plane but the Slow Stick settled into a
steady stalled descent with the nose 18 to 33 deg above its flight path and
the wings level to a hundredth of a degree (round 3's suite). Two causes:

- **Pitch.** The moment stayed linear, Cm0 + Cmα α + Cmδe δe, through the
  stall, so full up elevator simply trimmed at a higher angle, 20 to 28 deg,
  as if the wing were still making the lift that line assumes. Only the
  Slow Stick had terms that took it back (`stall_arm_ac`, `stall_arm_cp`,
  docs/SLOWSTICK-STAGE1.md).
- **Roll and yaw.** Roll damping was the table's constant Cl_p through the
  stall, and the wing was one wing: nothing could stall one half before the
  other, so no wing dropped, and nothing reversed the damping, so nothing
  could autorotate.

What a real aircraft does, FAA-H-8083-3C, Airplane Flying Handbook, ch. 5:
a full stall is "an uncommanded nose down pitch that cannot be readily
arrested, and may be accompanied by an uncommanded rolling motion"; "a
spin occurs when at least one of the airplane's wings exceed the critical
AOA (stall) with a sideslip or yaw acting on the airplane", "in the
direction of rudder application, regardless of which wingtip is raised";
recovery is opposite rudder and the elevator "forward of neutral", which
"decreases the AOA and drives the airplane toward unstalled flight".

## The pitch break

Past the stall, through the same σ the lift uses:

  ΔCm = −σ [ arm_ac CL_lin + arm_cp CN_plate + dw (CL_lin − CL_plate) ]

- **arm_ac CL_lin** takes back the linear lift's moment about the CG, the
  lift the stalled wing no longer makes: arm_ac is the CG's distance behind
  the wing's aerodynamic centre, per chord. On a flying wing the linear
  model's lift acts at the neutral point, so arm_ac is minus the static
  margin.
- **arm_cp CN_plate** puts the plate's force where it acts: its normal
  force, CN = CL cos α + CD sin α = 2 sin α for the plant's plate, at 0.40
  of the chord (Hoerner, Fluid Dynamic Lift, ch. 3: a plate's centre of
  pressure moves from the quarter chord toward 0.4 by 20 to 40 deg), arm_cp
  behind the CG. The Slow Stick's first version of this term used the
  plate's lift, 2 sin α cos α, which is within 5 percent of it at its 18
  deg mush but goes to zero at 90 deg where the plate's force is largest;
  hanging under the Bramor's canopy is at 90 deg (below).
- **dw (CL_lin − CL_plate)** is the tail's share, the classic cause of the
  break on a conventional aircraft: the downwash at the tail is set by the
  lift the wing makes, ε = 2 CL_w / (π AR) (Nelson, Flight Stability and
  Automatic Control, eq. 2.22, the relation every derivation here takes
  dε/dα from). As the stalled wing sheds lift the downwash goes with it,
  the tail meets the air at a higher angle and lifts, nose down, by
  dw = η V_H a_t (dε/dα) / a_w per unit of wing lift lost. Zero on a
  flying wing.

| Airframe | arm_ac | arm_cp | dw | from |
| --- | --- | --- | --- | --- |
| 1000 mm wing | −0.0688 | 0.2188 | 0 | static margin 0.069 (Cmα −0.30 / CLα 4.36), CG 0.181 c |
| Skyhunter | 0.0833 | 0.0667 | 0.1448 | CG c/3; a_w 5.14, a_t 4.00, V_H 0.568, dε/dα 0.364 (docs/SKYHUNTER-STAGE1.md) |
| Cub, and on floats | 0.0500 | 0.1000 | 0.1352 | CG 0.30 c; a_w 4.89, a_t 3.81, V_H 0.434, dε/dα 0.444 (cub-derive.js) |
| Radian | 0.0157 | 0.1343 | 0.1117 | CG 0.266 of the drawn MAC; a_w 5.34, a_t 4.43, V_H 0.496, dε/dα 0.301 (glider-derive.js) |
| Bramor | −0.0881 | 0.2381 | 0 | static margin 0.088 of S/b (Cmα −0.420 / CLα 4.77), CG 0.162 |
| Slow Stick | 0.0617 | 0.097 | 0.1313 | its own arms (docs/SLOWSTICK-STAGE1.md); a_w 4.27, a_t 3.98, V_H 0.317, DATCOM's dε/dα 0.494 (slowstick-derive.js) |
| Timber, and on floats | 0 | 0.1500 | 0.1717 | CG c/4; a_w 4.84, a_t 4.33, V_H 0.464, dε/dα 0.460 (timber-derive.js) |

The floats move the CG down, not along, so the float planes keep their
landplanes' numbers. Not modelled: the tail's own stall at the angles the
downwash's loss gives it with full up elevator, and a T tail in the wing's
wake (none of these aircraft has one).

## The wing drop, the roll damping and the spin

Each half of the wing is taken at its lift's centroid, y_c out from the
centreline, with its own stall blend. Its angle of attack is the
centreline's plus:

- **the roll rate's p y_c / V**, the small angle the table's own Cl_p is
  built on. Strip theory gives a panel's share of the damping as
  Cl_p = −2 CLα (y_c / b)², so y_c = b √(−Cl_p / (2 CLα)) from the table;
  no number of its own. Below the stall the descending panel's extra angle
  makes extra lift, which is the damping. Past it, it makes less: the
  damping weakens and, where the lift curve falls, reverses: past the
  stall the rising wing makes more lift than the descending one, an
  autorotative moment (NASA TP-1589, 1979, Langley's stall and spin
  study of a light general aviation airplane; NASA TN D-6575, Bowman,
  Summary of Spin Technology as Related to Light General-Aviation
  Airplanes, 1971).
- **the yaw rate's sin α r y_c / V**: the retreating panel meets the air
  slower along its chord for the same flow across it, so at a higher
  angle. Linear theory drops it as second order; a spin lives on it, and it
  is why a stall with rudder spins toward the rudder.
- **a fixed asymmetry**: the left panel's stall angle is `stall_asym`
  lower than the right's, 1 mm of trailing edge over the chord (0.21 to
  0.31 deg), ESTIMATED as a kit's build tolerance at the panel joint. Below
  the stall a rigging difference is trimmed out on the ailerons; nothing
  trims the stall. Without it a power off stall from wings level is exactly
  symmetric and no wing could ever drop. Left, for every airframe: with
  power on a clockwise prop's torque rolls left too.

What a panel returns is how far it falls short of the linear wing, per unit
of q S / 2: its lift deficit σ (CL_plate − CL_lin) and its drag excess σ
(CD_plate − CD_lin). The deficit's linear part is exactly the table's roll
damping, so as the panel stalls it takes that back, and what is left is the
plate's. The two panels' difference, at y_c, is a rolling moment (the lift)
and a yawing moment (the drag: the stalled panel's drag yaws the nose toward
it). Moments only; the wing's force is the centreline's.

Sideslip is deliberately not in the panel's angle. The dihedral does raise
the upwind panel's angle in a slip, but the handbook's observation is the
other way round for light aircraft ("if the airplane is allowed to slip, the
outer wing may stall first", the downwind one; in a skid the inside wing,
again the downwind one, "blanketed partially by the fuselage"). With the
dihedral term in, a stall with right rudder spun left on every plane with
more than a few degrees of it. The table's linear Cl_β is kept through the
stall as it was.

Below every panel's stall σ is exactly zero at both panels and at the
centre, every new term is a zero of one sign or the other, and `add_term`
leaves the sum it is added to bit for bit what it was.

## What each aircraft does now

`node scripts/stall-probe.js`, 300 m up, launched at 1.15 V_s wings level,
in Manual unless it says otherwise, the stick brought back from centre to
full over 2 s and held (the handbook's entry). A: power off, full back 10
s. B: full back and full right rudder from 2 deg short of the stall (on the
flying wings, which have no rudder, full right roll). C: B for 5 s, then
full left rudder and the stick half forward until the rotation stops, then
centred. D: A for 5 s, then the stick centred. E: A in Acro.

| Airframe | A: nose, wing | A: last 3 s | B: spin? | C: spin recovery | D | E: Acro |
| --- | --- | --- | --- | --- | --- | --- |
| before (main) | nose 3 to −10 deg over 3 s as it slows, then steady; bank 0.0 | nose 20 to 28 deg over a 26 to 31 deg path, 7 to 13 m/s | the Radian and the Bramor only | | | |
| 1000 mm wing | left wing drops, rolls through, 259 deg/s; recovers to a steady mush | nose 18 over −23, 8.8 m/s | no rudder: a spiral, not a spin | 0.02 s | 0.12 s, 0.1 m | stalls; wings held within 5 deg |
| Skyhunter | left wing drops within 0.8 s of the stall, rolls past inverted | a spiral, alpha 10 to 13, 29 m/s | yes, right, 389 deg/s | 0.10 s, 2.2 m | 0.11 s, 2.5 m | stalls; drop held to 18 deg |
| Cub | left wing drops at the stall, rolls past inverted | a spiral, alpha 10 to 15, 22 m/s | yes, right, 707 deg/s at alpha 40, sinking 9 m/s | 1.21 s, 13.9 m | 0.10 s, 1.6 m | stalls; drop to 34 deg |
| Radian | left wing drops, past inverted | a spiral, alpha 14, 17 m/s | yes, right, 524 deg/s | 0.56 s, 4.9 m | 0.29 s, 4.4 m | stalls; wings within 7 deg |
| Slow Stick | a slow drop to 59 deg bank over 4 s | alpha 12 to 15, 6.1 m/s | a steep spiral at 316 deg/s, alpha under the stall: no spin | 0.06 s | 2.8 s, 5.7 m | stalls; drop to 20 deg |
| Timber | left wing drops, past inverted | a spiral, alpha 13 to 20, 19 m/s | yes, right, 599 deg/s | 0.52 s, 5.4 m | 0.11 s, 1.4 m | stalls; drop to 15 deg |
| Bramor | left wing drops, past inverted | alpha 16 to 18, 13 m/s, banked 23 | a flat spin at alpha 75, 431 deg/s | none in 7 s with the elevons alone | 0.18 s, 1.2 m | stalls; wings within 6 deg |
| Timber floats | as the Timber | alpha 14 to 20, 19 m/s | yes, right, 662 deg/s | 0.49 s, 5.3 m | 0.13 s, 2.1 m | stalls; within 9 deg |
| Cub floats | as the Cub | alpha 10 to 16, 22 m/s | yes, right, 748 deg/s | 1.70 s, 21.0 m | 0.17 s, 3.4 m | stalls; drop to 22 deg |

The probe prints the rest (the pitch through the break and its time, the
largest yaw rate, the sink in the spin).

## What changed in the gates, and why

`node scripts/stall-crossing.js` replays every recorded flight the gates
hash on main's module and this one side by side, a millisecond at a time,
and prints the first step they differ at with what the aircraft was doing
on it. The wing's recording is identical for all 20 s. Every other one
first differs at a step where the first panel's stall blend has begun:
the Skyhunter at 7.62 s (8.58 deg against 8.27, a rolling pull), the
Radian at 7.50 s (7.41 against 7.38), the Bramor at 1.80 s at the blend's
first hundredth of a degree; the Bramor's chute flight at 0.19 s, also in
the stall, with the model alone, and from its first step once the risers
move (below), which the script says; and the
four that start standing on their wheels or floats, the Cub, the Slow
Stick, the Timber and the Timber on floats, in their first millisecond,
where the air they meet is the gear settling at under 2 cm/s from 80 to 144
deg of angle of attack, which the plant has always treated as fully
stalled. So every recorded hash moves, and every gate that holds them
(S15, C22, G20, B13, S17, T14, F9 and their Node and Chrome pairs, whose
hashes still agree) fails. They are not re-recorded here: that is the
lead's call.

Two aircraft fly their ordinary flight at the stall blend's edge: the
plant's lift curve starts to round `stall_blend`, 3 deg, below CLmax / CLα,
and the Bramor cruises at 5.7 deg against a blend from 5.67 (its stall
angle is 8.7), the Radian glides at its best L/D at 7.5 against 7.38. So
the Bramor's B1 cruise (15.85 to 15.92 m/s) and B5 roll, and the Radian's
glide, move by the smallest amounts; by the plant's own lift curve those
flights are already rounding into the stall. That is a plant wide finding
about the blend's width, not about this change.

The other gates that moved are flights at or past the stall: each stall
speed measurement; the Cub's P factor at 1.1 V_s; the take off rolls and
landing rolls of the taildraggers, which sit three point past their stall;
the Radian's thermal circle, phugoid and glide near its stall; the Slow
Stick's rudder turn, which it flies at 1.3 V_s with the descending panel in
its blend; the Bramor's chute. The ones that now fail, for the lead:

- **Slow Stick S9a and S9b**, "full up held: a mush, no wing drop" (bank
  under 15 deg, yaw under 20 deg/s). It now drops its left wing to 58 deg
  and turns at 68 deg/s, power off and on. GWS publishes the stall as "very
  docile". The plant's lift curve past CLmax falls to the plate in 8 deg on
  every section, and the Slow Stick's thick flat bottomed section at a
  Reynolds number of 1e5 stalls from its trailing edge with a lift curve
  that stays near flat past CLmax: little of the slope that reverses the
  damping. A sourced post stall lift curve for its section, not a smaller
  asymmetry, is the fix; its S9 band stays where it is.
- **Timber T5**, "slowest level flight, full flaps, wings within 10 deg":
  10.0 deg. It is flown at the stall on purpose.
- **Timber T10**, "take off roll, full flaps": lift off at 6.35 m/s against
  6.4 to 8.3. The three point roll is past the flapped wing's stall.
- **cub:stab**, the three take off rolls "tracking straight: heading within
  5 deg": 5.4 to 5.6 deg. The same three point roll.
- **crash:core**, "a Cub (and a Timber) lands on its wheels at 9 m/s: trace
  identical with crash physics on and off": the rollout now swings (the
  wing is past its stall three point, and the stalled panels yaw it), a
  part other than the gear touches, and the mode's spring contact meets it
  differently from the rigid one, with no damage. The premise is the
  core's; it held only while nothing but the gear touched.
- **crash:core**, "every trace digest identical: floats": the Node and
  Chrome runs of the Cub on floats' 3 deg touchdown differ. Not the plant:
  the scenario's pilot steers on `Math.atan2` in JavaScript, and Chrome
  151's differs from Node 22's in the last bit on 73 of that flight's 842
  pilot steps (scratch test against the same inputs, both engines). Before
  this change that pilot's bank was exactly zero, where the two agree. The
  crash suite, which replays the recorded module calls rather than the
  pilot, has all 60 scenarios identical in Node and Chrome.

The crash suite (`node scripts/crash-suite.js`, main against this, fresh
wasm both): 8 of 60 scenarios inside every band before, 6 after; failing
checks 130 to 129; all 60 deterministic in Node, replay and Chrome. The
stall ins, peak g and rest attitude before and after:

| Scenario | peak g | rest | failing after |
| --- | --- | --- | --- |
| sky-stall | 201 to 186 | upright, upright | mustNotBreak, peakG, restAttitude |
| cub-stall | 98 to 248 | upright, upright | mustNotBreak, peakG, restAttitude, timeToRestS |
| radian-stall | 160 to 61 | upright, upright | mustNotBreak, restAttitude, restDistM |
| slowstick-stall | 30 to 296 | upright, on its side | mustNotBreak, peakG, restAttitude |
| timber-stall | 96 to 190 | upright, upright | mustNotBreak, peakG, restAttitude, timeToRestS |
| bramor-stall | 89 to 97 | upright, upright | mustNotBreak (twice), peakG, restAttitude, restDistM |
| bramor-catapult-stall | 57 to 62 | upright, upright | restAttitude |

From 8 m a stall with the stick held back now drops a wing and meets the
grass banked and faster, which is what breaks the wings of the Cub, the
Timber and the Slow Stick; the Radian's drop lets it arrive slower. Every
stall still comes to rest upright but the Slow Stick's, where the bands
ask for nose down or inverted: that is the crash core's, what the wreck
does after the contact. Elsewhere cub-nose-over now rests upright (it
was nose down; not traced further) and
timber-belly-fast's peak rises from 7.1 to 10.7 g past its band.

The Bramor's chute is the one derived number that moved. Its risers are
placed where the canopy's pull balances the plant's pitching moment hanging
flat on its back (docs/BRAMOR-STAGE1.md); that moment was the linear one at
−90 deg, 0.713, the very extrapolation this change removes. With the post
stall terms it is 0.530, so by the same rule the attachment moves from 64
to 48 mm ahead of the CG (scripts/bramor-derive.js). B10 to B12 hold with
it (4.1 deg from straight down, at rest 0.6 deg from flat); with the old
point it hung 42 deg off.

## What the owner should feel

Below the stall, nothing: every flight that stays short of it is the same
to the bit. At it, the aircraft stops being a parachute. Pull and hold full
back and the nose will not stay up: the wing lets go, the left one first,
and without a hand on the sticks most of these aircraft roll off it hard,
the Cub and the Skyhunter past inverted, and wind into a steep spiral.
Centre the stick and each one flies again within a few tenths of a second
and a couple of metres. Add full rudder at the stall and the conventional
ones spin toward it, one to two turns a second; opposite rudder with the
stick forward stops it in under a turn on the Skyhunter, the Radian and the
Timber, a turn or so on the Cub. The Bramor, with no rudder, goes flat and
does not come out on its elevons: pull the chute. In Acro the loop no
longer holds a stalled aircraft level: it catches the drop, but a stall is
a stall.

What would be wrong: a wing drop anywhere below the stall (a wing that
rolls in a gentle turn at cruise), a spin that goes against the rudder, a
spin that will not stop on a conventional aircraft with opposite rudder and
forward stick, or a Slow Stick that snaps. The last one is the known gap
above.
