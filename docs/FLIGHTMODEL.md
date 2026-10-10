# The flight model for 3D and aerobatic flying: the measurement

The owner, 2026-10-07: "airplane physics aren't right... I can't do 3D
flights, I can't hover... stalls are all wrong... I need this to be a world
class sim." This document is the before: what every powered fixed wing
does today in the manoeuvres a 3D and aerobatic pilot flies, against what
the real aircraft does, and the gaps that the next four pull requests
close. It is also the lane's contract doc (docs/redesign process rule 1).

- Harness: `scripts/flightmodel-probe.js`, `npm run flightmodel:probe`
  (`--only key,...`, `--json out.json`). It runs every aircraft at its
  stock power, the power the hangar seats by default, in Node, against
  `dist/sim.wasm`, in about half a second. Two runs print the same bytes.
- Spin entry and recovery: `scripts/stall-probe.js` (`npm run
  stall:probe`), its rows B and C, which the new harness does not repeat.

## What this pull request changes

Nothing a player can see. No plant code, no table, no threshold. The
module is untouched: `dist/sim.wasm` rebuilds byte identical from this
tree with emsdk 6.0.10, sha256
`df2298d321a11c36b1e670ef9310b1d977f5f770802fed673957b819704221b2`. The
pull request adds the harness, its npm script and this document.

## The harness

Every flight is in Manual, 300 m up, so nothing but the air is in it.
The output per aircraft (and in `--json`, the same fields):

| Row | Flight | Fields |
| --- | --- | --- |
| TW | static thrust over weight: the most thrust in HANG's first 1.5 s over the stock mass | `hang.tw` |
| AUTH | nose up, no airspeed, full throttle: the angular acceleration of one full stick in one 4 ms step, over the centred sticks' | `auth.roll`, `auth.pitch`, `auth.yaw` rad/s², `auth.torqueAcc` |
| HANG | the same start, sticks centred, 5 s | `hang.vz`, `hang.rollRate`, `hang.noseDeg` |
| HOVER | the same start, a pilot holding the nose vertical on elevator and rudder, the roll rate on ailerons and the height on throttle, 8 s | `hover.heldS` (nose within 20 deg of vertical), `hover.meanThr` |
| HARR | level at 35 deg of pitch, height on throttle (slow), wings on ailerons, 20 s; the last 5 s | `harrier.pitch`, `.alpha`, `.v`, `.thr`, `.stick`, `.bankMax`, `.held` |
| KNIFE | at the larger of 15 m/s and 2 Vs, rolled to 90 deg on ailerons, height on rudder, full throttle, 8 s; the last 4 s | `knife.bank`, `.vz`, `.rudder`, `.beta` |
| SNAP | at 1.4 Vs and half throttle, full back, right rudder and right aileron for 1 s, then centred; against full right aileron alone | `snap.rollDeg`, `.peakDegS`, `.stopS`; `ailRoll` |
| STALL | power off, the nose raised at 0.04 rad/s: the airspeed at the peak lift coefficient, clean and at full flap | `stall.v`, `stall.cl`; `stallFlaps` |
| TORQ | the prop's roll moment at standstill and its share of full aileron's at 1.5 Vs | `torque.q`, `torque.share` |

The STALL row is the minimum flying speed: the speed at the most lift
the plant gives. The airframe gates measure something else, the airspeed
at which the angle of attack crosses CLmax / CLalpha, and the two differ
by design (below).

## Before: today's numbers

`node scripts/flightmodel-probe.js` on origin/main at bce6de00.

| Aircraft | TW | AUTH roll, pitch, yaw rad/s² | HOVER held of 8 s | HARR pitch, alpha deg (35 asked) | KNIFE bank deg, sink m/s | SNAP deg in 1 s (aileron alone) | STALL clean (flap) m/s | Gate Vs m/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 mm wing | 1.80 | 0, 0, n/a | 0.70 s | 22.6, 22.6 | n/a | n/a (114) | 8.03 | 7.25 |
| Skyhunter | 1.31 | 0, 0, 0 | 0.82 s | 11.3, 15.4 | 71.9, 12.2 | 116 (73) | 10.31 | 9.2 |
| Cub | 1.04 | 0, 0, 0 | 0.62 s | 11.4, 16.8 | 75.0, 9.2 | 125 (102) | 8.94 | 8.1 |
| Slow Stick | 0.65 | n/a, 0, 0 | 0.37 s | 12.1, 18.6 | n/a | n/a | 4.82 | 4.43 |
| Radian | 0.97 | n/a, 0, 0 | 0.48 s | 11.3, 16.6 | n/a | n/a | 7.11 | 6.49 |
| Turbo Timber | 1.50 | 0, 0, 0 | 0.74 s | 15.5, 20.7 | 84.5, 11.9 | 215 (182) | 7.98 (6.80) | 7.20 |
| Bramor | 0.79 | 0, 0, n/a | 0.32 s | 15.2, 13.5 | n/a | n/a (60) | 14.06 | 13.0 |
| Bombshell | 0.51 | n/a, 0, 0 | 0.35 s | 8.9, 15.4 | n/a | n/a | 6.94 | 6.49 |
| Kadet Senior | 1.04 | n/a, 0, 0 | 0.47 s | 9.4, 14.3 | n/a | n/a | 8.28 | 7.15 |
| P-51D | 1.33 | 0, 0, 0 | 0.85 s | 23.2, 25.0 | 72.4, 22.5 | 274 (104) | 11.06 (8.46) | 10.06 (8.41) |
| F-16 | 1.13 | 0, 0, 0 | 0.57 s | 28.6, 29.8 | 65.0, 2.4 | 275 (200) | 12.82 | 11.98 |
| Zagi HP | 1.03 | 0, 0, n/a | 0.17 s | 14.8, 14.9 | n/a | n/a (166) | 7.90 | 7.36 |
| Ugly Stik | 1.36 | 0, 0, 0 | 1.02 s | 12.9, 13.5 | 68.3, 21.0 | 61 (59) | 10.60 | 9.48 |
| Tiger Moth | 0.79 | 0, 0, 0 | 0.70 s | 12.6, 18.2 | 73.9, 18.3 | 121 (66) | 9.89 | 9.47 |
| Striker | 2.09 | 0, 0, 0 | 2.27 s | 19.3, 21.4 | 82.8, 1.3 | 80 (89) | 7.87 | n/a |

n/a in AUTH is an axis the aircraft has no surface for (the flying wings
have no rudder; the three channel aircraft roll on the rudder, so their
roll stick is a second rudder stick and the probe flies them without it).
No harrier was held by any aircraft. The torque roll hanging with sticks
centred (HANG) is slow on most, because the plant's thrust at standstill
is real but the torque arm is small; the Bramor's pusher spins up to 154
deg/s in 5 s with nothing to stop it.

Spins (stall-probe B, pro spin controls from 1.15 Vs; C, the handbook's
recovery): the Slow Stick, Radian, Bramor, Bombshell, F-16 and Tiger
Moth spin; the Skyhunter, Cub, Timber, Kadet and Ugly Stik do not (a
spiral at 38 to 51 deg/s of yaw). Every recovery is reported in 0.02 to
0.33 s, which says the probe's recovery criterion (the wing unstalled)
trips at once rather than that the rotation stopped.

## Against the real aircraft

Sources are the aircraft's own derivations in docs/*-STAGE1.md, which
cite their makers and reviews, and the published references named.

- **Hover is a thrust question first.** Only an aircraft with a static
  thrust over its weight can hang on its prop. The Slow Stick's own
  derivation quotes "Cannot hover with stock motors" (docs/SLOWSTICK-STAGE1.md),
  and the plant's 0.65 agrees. The Timber's review says "unlimited
  vertical" (docs/TIMBER-STAGE1.md), the plant 1.50. The Radian's
  reviewers call its climb "virtually vertical" (docs/GLIDER-STAGE1.md),
  the plant 0.97. A foam 3D aircraft is built at well over 1: the removed
  Extra 300 3D derivation (docs/EXTRA-STAGE1.md in git at 1c0872b3^, its
  motor run on APC's measured 13x6.5E data) came to 2.56, and the 3D foam
  class is generally sold at 1.5 to 2 and over. So TW is right where the
  derivations give a source. What is wrong is the next point.
- **No control at zero airspeed, on any aircraft.** AUTH is exactly zero
  on every axis of every aircraft. Every aerodynamic moment in
  `plant_wing_step` is the free stream's dynamic pressure times a
  coefficient, so with the aircraft still the surfaces do nothing, even
  with the prop blowing over them at full power. On a real aircraft the
  tail and the inboard wing sit in the prop's slipstream: the Cub's rudder
  steers it on the ground before it moves, and a 3D aircraft hangs and
  torque rolls on that wash alone. The removed Extra's derivation put a
  2.5 kg class aerobat's full elevator at zero airspeed at 38.9 rad/s² and
  its rudder at 32.5 rad/s² (its gates E10 and E10b); the plant gives 0.
  So HOVER fails in under a second on every aircraft with TW over 1, and
  HANG has nothing to damp the rotation (the Bramor's 154 deg/s).
- **No harrier.** With full up elevator every aircraft trims at its
  stall's angle of attack and its nose stays at 9 to 23 deg; the F-16
  holds 29.8 deg of alpha, which matches Freewing's "the aircraft can also
  maintain a high alpha of 30 degrees" (docs/F16-STAGE1.md). A real
  aircraft with power holds a deeper angle because the slipstream keeps
  the elevator flying; that is the same missing term.
- **No knife edge.** No aircraft holds 90 deg of bank level: the ailerons
  give out at 65 to 85 deg against the rudder's roll, and the sink at full
  power and full rudder is 9 to 23 m/s. A sport aircraft with power over
  its weight flies a knife edge on the fuselage's side force and the
  thrust's vertical share at a sideslip. The plant's side force is the
  table's CY beta only, linear and small, and has no fuselage crossflow
  term (the removed Extra had one, `side_cda`).
- **Snap rolls.** The P-51 and the F-16 snap (274 and 275 deg in a
  second, against 104 and 200 on aileron alone), the Tiger Moth and the
  Skyhunter about double their aileron roll. The Ugly Stik, whose plan
  says it flies "four point and snap rolls" (docs/UGLYSTIK-STAGE1.md),
  does not snap at all (61 against 59). The Cub barely (125 against 102).
- **Stall speeds.** The measured minimum flying speed is 3 to 12 percent
  over each gate's figure, because the plant's blended lift curve peaks at
  about 0.8 of the table's CLmax (docs/STALL-STAGE1.md says the same of
  its own probe). The gates measure where the angle crosses CLmax over
  CLalpha, which is what they were derived on, so they pass; but the
  aircraft the pilot flies stalls at 10.6 m/s on an Ugly Stik whose
  derivation says 9.48. The Bramor's one published stall speed, 13 m/s
  (its user manual, docs/BRAMOR-STAGE1.md), against the plant's 14.06.
  Flaps: the Timber's full flap takes 1.18 m/s off and the P-51's 2.60.
- **Spins.** The trainers (Cub, Skyhunter, Kadet) and the Ugly Stik do
  not spin with full pro spin controls; they spiral. The Tiger Moth does,
  matching Phillips's "stalls, spins, aerobatics are straightforward"
  (docs/TIGERMOTH-STAGE1.md). A real Cub and Ugly Stik spin, the Cub
  reluctantly and the Stik readily.
- **Torque.** The torque reaction is modelled (`torque_arm`) on every
  aircraft. Its share of full aileron at 1.5 Vs is 3 to 16 percent, which
  is the right order for a prop aircraft at flying speed. Gyroscopic
  precession (`j_prop`) is set on only four tables (P-51, Zagi, Ugly
  Stik and Tiger Moth, and the Striker); P factor (`pfactor`) on the
  tractor props; slipstream swirl on the fin on none.

## The gaps, and which pull request closes each

1. **PR 2, the prop wash.** Momentum theory's slipstream: the disc's
   pressure jump T / A, the induced speed at the disc, the far wake at the
   free stream plus twice it, contracted, applied to the stabiliser, fin
   and the wing strips inside it. Every surface in the wash gets control
   power and damping from the wash's dynamic pressure, so AUTH is no
   longer zero and the rotation of a still aircraft meets air. Built by
   reviving the Extra's `slip_*` terms (in git at 1c0872b3^,
   src/native/plant_wing.c, and removed with the aircraft in the commit
   after #185) and generalising them to every powered aircraft, each
   table's geometry from its derivation.
   - **What it moves:** every recorded flight flown with the motor running
     (the wing, Skyhunter, Cub, Slow Stick, Radian under power, Timber and
     floats, Bramor, Bombshell, Kadet, P-51, Zagi, Ugly Stik, Tiger Moth,
     Striker). Those traces are re-recorded in that pull request, each
     listed with its reason, and no threshold is loosened.
   - **What it must not move, bit for bit:** the quads; the NRJ glider,
     which has no motor; any flight flown with the motor stopped or a
     folding prop folded (no thrust, no wash); the F-16 and the Striker
     jet, whose fan is in a duct and blows over nothing (to be confirmed
     against their geometry in that pull request).
2. **PR 3, motor effects.** Verify the torque reaction; gyroscopic
   precession on every prop table from the prop's inertia; P factor at
   high alpha; the slipstream's swirl on the fin.
3. **PR 4, the stall.** Asymmetric stall and wing drop, spin
   autorotation and a recovery measured in turns; each aircraft's minimum
   flying speed against its derivation. Several existing gates hold a
   gentle, wings level stall (`u11_stall_power_off` holds the Ugly Stik
   under 15 deg of bank and 20 deg/s of yaw with full up held for 10 s;
   the Kadet's, Slow Stick's, Bombshell's and Tiger Moth's likewise).
   Changing that behaviour is changing what those gates assert: that pull
   request argues each case from the aircraft's sources and does not
   loosen a threshold.
4. **PR 5, a 3D aircraft.** An Extra 300 class foam 3D aircraft, thrust
   over weight about 2, big throws. **This re-adds an aircraft the owner
   removed** on 2026-09-29 (#185, "eliminate extra"), whose sim id 14 is
   reserved and whose string id `extra1308` is mapped by
   `configs/airframes.js retiredAirframe` to the Ugly Stik. Whether to
   reuse that id or take a new one is decided in that pull request and
   stated in its body.
5. **The knife edge's side force**, a fuselage crossflow term, goes with
   PR 2 or PR 3, whichever needs it first to fly a knife edge.

## Checks that prove each step

- This harness, before and after, in every pull request body.
- Every fixed wing gate and stab self test, `wing:math`, `wing:contact`,
  `crash:core` and `war:legacy`, with each re-recorded trace listed.
- A rebuild of `dist/sim.wasm` committed with the plant change, since the
  repository tracks it.

## PR 2, built: the slipstream, wash and swirl

### What the plant does now

`plant_wing_step` puts each tractor's prop wash over its tail and its
ailerons by momentum theory, revived from the removed Extra 300's block
(git 1c0872b3^) and given to every aircraft whose prop blows over its
tail: the Cub and the Cub on floats, the Radian, the Slow Stick, the
Timber and the Timber on floats, the Bombshell, the Kadet, the P-51, the
Ugly Stik and the Tiger Moth. The disc's pressure jump T / A, the induced
speed v_i, the far wake contracted to R sqrt((V + v_i) / (V + 2 v_i));
the stabiliser's, fin's and ailerons' shares of it; the controls meet the
pressure jump on their share, the angle and rate terms meet rho v_i times
the crossflow, so a still aircraft's tail has authority and damping.

The swirl: the prop's torque is the wash's angular momentum flux, a solid
body rotation at Omega with Q = mdot Omega rw^2 / 2, blowing over the fin
from the left above the thrust line and from the right below it. Its net
sideways speed over the fin's span in the wash, Omega (up - dn) / 2, is a
sideslip for the fin's terms: the nose yaws left under power and right
rudder holds it. The wing's root, in the wash ahead of the fin, is a
stator (Veldhuis, Propeller Wing Aerodynamic Interference, TU Delft 2005:
the wing recovers a significant part of the swirl): SWIRL_KEEP of the
swirl reaches the fin, and the root takes the rest's angular momentum as a
roll moment the prop's way, against the torque reaction, which conserves
the prop's torque between the two.

- **SWIRL_KEEP = 0.5 is FITTED.** No published figure gives the share for
  a model, and the literature says only that the recovery is significant.
  Half is the middle of what is unknown. Its effect on the take off roll
  with the rudder left alone, heading at liftoff: a quarter of it, Cub
  12.4 deg, Timber 7.4, Bombshell 6.3, P-51 26.9; a half (built), Cub 20.7,
  Timber 14.4, Bombshell 12.8, P-51 37.5; all of it, Cub 31.6, Timber 28.0,
  Bombshell 27.4. The P-51's P14 needs right rudder at any share over a
  quarter, and with none (the wash alone) its mean rudder fell to zero,
  which is why the swirl ships with the wash and not after it.
- The geometry of every table, with each number's source, is
  `scripts/wash-derive.js` (`npm run wash:derive -- --check`, in CI);
  `scripts/lib/wash.js` is the plant's arithmetic for the derivations.
- Left out on purpose: the 1000 mm wing, the Bramor, the Zagi and both
  Strikers (pushers behind everything, a jet), the F-16 (its fan exhausts
  past the tail), the NRJ (no motor), and the Skyhunter, whose pusher
  blows over the middle of its stabiliser and past both boom fins, which
  this form cannot split; it is a follow up.
- `sim_wing_slip(out[6])` (sim_abi.h, additive): the wash's moments, the
  pressure jump, the induced speed and the swirl, so a gate that tests one
  term of the moment (the torque, the P factor, the gyroscope) takes the
  wash out, as it takes the aero out.

### The probe, before (origin/main) and after

| Aircraft | AUTH roll, pitch, yaw rad/s² | HOVER held of 8 s | HANG roll rate deg/s | HARR pitch deg | KNIFE bank deg, sink m/s | SNAP deg (aileron alone) | STALL m/s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 mm wing | 0.0, 0.0, 0.0 | 0.70 | -6.7 | 22.6 | n/a | n/a (114) | 8.03 |
| Skyhunter | 0.0, 0.0, 0.0 | 0.82 | -0.3 | 11.3 | 71.9, 12.2 | 116 (73) | 10.31 |
| Cub | 0.0, 0.0, 0.0 → 0.0, 26.9, 6.3 | 0.62 → 1.14 | -0.9 → 0.2 | 11.4 → 15.6 | 75.0, 9.2 | 125 (102) → 125 (103) | 8.94 |
| Slow Stick | -0.0, 0.0, 0.0 → -3.7, 15.5, 9.3 | 0.37 → 0.41 | -2.2 → -0.1 | 12.1 → 6.1 | n/a | n/a (n/a) | 4.82 |
| Radian | 0.0, 0.0, 0.0 → 0.0, 27.6, 10.0 | 0.48 → 1.26 | -1.2 → 1.4 | 11.3 → 20.4 | n/a | n/a (n/a) | 7.11 |
| Turbo Timber | 0.0, 0.0, 0.0 → 0.0, 51.6, 23.0 | 0.74 → 5.46 | -0.3 → -0.6 | 15.5 → 19.5 | 84.5, 11.9 → 84.4, 12.0 | 215 (182) → 285 (183) | 7.98 |
| Bramor | 0.0, 0.0, 0.0 | 0.32 | -154.0 | 15.2 | n/a | n/a (60) | 14.06 |
| Bombshell | -0.0, 0.0, 0.0 → -2.2, 24.5, 10.1 | 0.35 → 0.46 | -2.6 → -0.7 | 8.9 → 5.0 | n/a | n/a (n/a) | 6.94 |
| Kadet Senior | -0.0, 0.0, 0.0 → -2.4, 28.2, 14.1 | 0.47 → 1.01 | 0.1 → 0.4 | 9.4 → 11.6 | n/a | n/a (n/a) | 8.28 |
| P-51D | 0.0, 0.0, 0.0 → 0.0, 41.9, 8.2 | 0.85 → 1.69 | 4.4 → 4.0 | 23.2 → 29.0 | 72.4, 22.5 → 72.5, 22.4 | 274 (104) → 281 (104) | 11.06 |
| F-16 | 0.0, 0.0, 0.0 | 0.57 | 0.0 | 28.6 | 65.0, 2.4 | 275 (200) | 12.82 |
| Zagi HP | 0.0, 0.0, 0.0 | 0.17 | 3.3 | 14.8 | n/a | n/a (166) | 7.90 |
| Ugly Stik | 0.0, 0.0, 0.0 → 0.0, 16.9, 12.4 | 1.02 → 3.08 | -0.7 → 1.2 | 12.9 → 13.5 | 68.3, 21.0 → 68.4, 20.7 | 60 (59) → 64 (60) | 10.60 |
| Tiger Moth | 0.0, 0.0, 0.0 → 0.0, 15.8, 13.5 | 0.70 → 1.20 | 0.1 | 12.6 → 6.6 | 73.9, 18.3 → 73.8, 17.6 | 121 (66) → 139 (66) | 9.89 |
| Striker | 0.0, 0.0, 0.0 | 2.27 | 17.0 | 19.3 | 82.8, 1.3 | 80 (89) | 7.87 |

AUTH is no longer zero on any tractor: full elevator at zero airspeed is
15 to 52 rad/s², the rudder 6 to 23 (the removed Extra's derivation put a
3D aircraft's at 38.9 and 32.5). The ailerons stay outside every wash, so
roll authority at zero airspeed is still zero except on the three channel
aircraft, which roll on the rudder. HANG's torque roll is near zero now on
every tractor: the root takes half the swirl's angular momentum against
the torque, and the fin the rest. The Timber, whose tail sits deep in a
big prop's wash, now hangs nose up for 5.5 s of the 8. Nothing else
moved: the stall speeds, and every aircraft without a wash, are
unchanged.

### What was re-recorded, and the proof that nothing else moved

Re-recorded with `node scripts/wing-record.js <plane>`, each because its
flight is flown with the motor running and the wash changes it:
`tests/inputs/cub-baseline.rec`, `glider-baseline.rec` (the Radian),
`slowstick-baseline.rec`, `timber-baseline.rec`, `timberf-baseline.rec`,
`bombshell-baseline.rec`, `kadet-baseline.rec`, `uglystik-baseline.rec`,
`tigermoth-baseline.rec`, `p51-baseline.rec` and `p51-air.rec`. Their
pinned hashes moved in every *-thresholds.json that holds them, and only
those. The five inch, the 1000 mm wing, the Skyhunter, the Bramor and its
chute, the F-16, the Zagi and the NRJ replay to the same hashes as on
origin/main (9fdc42323baad668, d7b7743dfde9a0cc, 02b8a7aa3d79c02c,
f58582158e8f18a6, 6c35bf1d12a3268b, 235ff3cff66e8e83, de34219b99cb9023,
340fb01bfb996193), and war:legacy's 40 games and crash:core's digests are
unchanged. The quads read no fixed wing table.

Regenerated: `configs/power-estimates.js` (`node scripts/power-check.js
--estimates`: the tractors' cruise moved by up to 0.05 m/s) and
`tools/audio/flights.json` (`node tools/audio/flights.js`).

### The checks whose premise the wash changed

No band was widened. Each change is one of three kinds.

- **A gate that tests one term takes the wash out** (sim_wing_slip): the
  torque at standstill (C14, S11 on the Slow Stick, Bombshell and Kadet,
  P10, T10, U12, G13), the P factor (C15, P11), the gyroscope (P12).
- **A pilot flies the rudder, as a pilot does.** The take off pilots hold
  the runway's heading, full rudder by 10 deg off it (`rudderHold`,
  `takeoffSticks`, the Tiger Moth's and the P-51's take off sticks, which
  had a third of that gain). The P-51's landing (P18) holds the heading and
  brings the stick back over 1.5 s instead of snatching it: the elevator
  loses the wash as the throttle closes for the flare, the touch is
  faster, and a snatched full up put the tail in the grass. The floats
  hold the bow to the swell (F2, F3: the torque and the swirl turn an
  idling floatplane off it, 14.6 deg in 40 s before, 22 after), and rotate
  to the derived liftoff attitude rather than full up (F4: full up in the
  wash pitches the floats onto their heels, which holds them in the
  water; the derivation said in so many words that it took no wash).
- **Re-derived with the wash in the derivation, the same tolerance about
  the new figure.** Kadet S13, the hand throw: the throw's elevator is the
  one that holds level flight's angle of attack at 9 m/s at the throw's
  full throttle, wash included, 4.51 deg (stick 0.415), where it was 6.90
  (0.592) without. Ugly Stik U9, the loop: `loopWhole` with the wash
  gives 35.49 m up, 28.14 along, 13.34 m/s over the top, out 8.59 m under;
  the plant flies 35.5, 28.2, 13.3 and 8.6.
- **A premise that was the missing wash, now stated the other way.** The
  Cub's, Timber's and Bombshell's stab self tests took off "tracking
  straight with the sticks centred". With the swirl a tractor swings left
  on the roll with the rudder left alone, in every mode, since on its
  wheels every mode flies as Manual: each now holds that it swings left
  with the rudder centred and tracks within the same 5 deg and 0.5 m with
  the pilot's right rudder, the P-51's P14 and P15 pattern. The
  Bombshell's taxi check said its rudder has no air at a walk
  (docs/BOMBSHELL-STAGE1.md named the slipstream as what was missing): at
  idle that still holds (under 10 deg in 4 s); at half throttle the wash
  over the rudder steers it right, over 45 deg in 4 s.

### An acro tune

- The P-51's Acro roll damping, `acro_roll_kd`, 0.70 to 0.80: with the fin
  in the wash the roll a partial roll stops from carried 10.4 deg/s a
  quarter second after centring, against p51:stab's 10, and 9.9 on
  origin/main. 0.80 leaves 9.7. A flight controller's gain, retuned for a
  plant that changed, as a pilot retunes; Manual is untouched, and every
  recorded P-51 flight replays to the same hash as before the retune.

### Still failing, left loud

- `bombshell:stab` "full right yaw stick ... wins over the level hold:
  right of a quarter of its throw": -2.7 deg, against -5.4 on origin/main.
  The rudder, in the wash, rolls the aircraft harder, so the level hold's
  roll damping takes back more of the stick's rudder; the nose yaws right
  faster than before (36.2 deg/s against 31.1). Not a band to move: the
  lead decides whether the hold's gains or the check's form change.
- `crash:core`'s "a five inch ... slides at the sled's grip" fails on
  origin/main as well (0.524), with the module byte identical: not this
  change's.

## PR 3, built: the prop's gyroscope on every prop

Gyroscopic precession was set on four tables only (the P-51, the Zagi,
the Ugly Stik and the Tiger Moth, and the Strikers). Every other powered
table now carries its prop's and rotor's polar inertia, `j_prop`, so a
pitch rate yaws it and a yaw rate pitches it at J Omega times the rate:
the 1000 mm wing, Skyhunter, Cub and Cub floats, Radian, Bramor, Slow
Stick, Timber and Timber floats, Bombshell, Kadet and the F-16's fan.

- The convention is the Ugly Stik's (docs/UGLYSTIK-STAGE1.md): 0.7 of the
  blades' rod inertia, 0.7 m R^2 / 3, plus the rotor, an outrunner's bell
  as a shell (m r^2, the bell 40 percent of the motor), an inrunner's as
  a solid cylinder, a glow engine's crank front. Only APC's 11 x 5.5E
  (24.9 g, the Skyhunter's) and 12 x 6 (46 g) masses are published; the
  rest are ESTIMATED from their class, about 30 percent either way, and
  each table's line says which.
- The Slow Stick's EPS-300C turns its rotor the other way through a 6.6:1
  gearbox, which takes a little off the prop's.
- Torque reaction and P factor were already on every prop table and are
  unchanged (`torque_arm`, `pfactor`); the slipstream's swirl is PR 2's.

### The probe, PR 2 to PR 3

| Aircraft | AUTH roll, pitch, yaw rad/s² | HOVER held of 8 s | HANG roll rate deg/s | HARR pitch deg | KNIFE bank deg, sink m/s | SNAP deg (aileron alone) | STALL m/s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 mm wing | 0.0, 0.0, 0.0 | 0.70 → 0.71 | -6.7 → -6.1 | 22.6 | n/a | n/a (114) → n/a (115) | 8.03 |
| Skyhunter | 0.0, 0.0, 0.0 | 0.82 | -0.3 → 0.2 | 11.3 → 11.4 | 71.9, 12.2 → 71.9, 12.6 | 116 (73) → 115 (73) | 10.31 |
| Cub | 0.0, 26.9, 6.3 | 1.14 → 1.12 | 0.2 → 2.0 | 15.6 → 15.7 | 75.0, 9.2 → 75.1, 9.9 | 125 (103) → 126 (101) | 8.94 |
| Slow Stick | -3.7, 15.5, 9.3 | 0.41 | -0.1 → -0.5 | 6.1 | n/a | n/a (n/a) | 4.82 |
| Radian | 0.0, 27.6, 10.0 | 1.26 → 1.27 | 1.4 → 2.6 | 20.4 → 20.6 | n/a | n/a (n/a) | 7.11 |
| Turbo Timber | 0.0, 51.6, 23.0 | 5.46 → 5.68 | -0.6 → 0.4 | 19.5 → 19.6 | 84.4, 12.0 → 84.3, 12.4 | 285 (183) → 296 (185) | 7.98 |
| Bramor | 0.0, 0.0, 0.0 | 0.32 | -154.0 → 7.4 | 15.2 | n/a | n/a (60) → n/a (61) | 14.06 |
| Bombshell | -2.2, 24.5, 10.1 | 0.46 | -0.7 → -3.2 | 5.0 | n/a | n/a (n/a) | 6.94 |
| Kadet Senior | -2.4, 28.2, 14.1 | 1.01 | 0.4 → 0.8 | 11.6 | n/a | n/a (n/a) | 8.28 |
| P-51D | 0.0, 41.9, 8.2 | 1.69 | 4.0 | 29.0 | 72.5, 22.4 | 281 (104) | 11.06 |
| F-16 | 0.0, 0.0, 0.0 | 0.57 | 0.0 → 1.3 | 28.6 | 65.0, 2.4 → 55.3, 3.3 | 275 (200) → 281 (202) | 12.82 |
| Zagi HP | 0.0, 0.0, 0.0 | 0.17 | 3.3 | 14.8 | n/a | n/a (166) | 7.90 |
| Ugly Stik | 0.0, 16.9, 12.4 | 3.08 | 1.2 | 13.5 | 68.4, 20.7 | 64 (60) | 10.60 |
| Tiger Moth | 0.0, 15.8, 13.5 | 1.20 | 0.1 | 6.6 | 73.8, 17.6 | 139 (66) | 9.89 |
| Striker | 0.0, 0.0, 0.0 | 2.27 | 17.0 | 19.3 | 82.8, 1.3 | 80 (89) | 7.87 |

The torque roll hanging with the sticks centred changes by a few degrees
a second where the prop is heavy. The Bramor's runaway pusher roll in
HANG (154 deg/s) is 7 deg/s with its prop's precession, and the F-16's
knife edge holds 55 deg of bank where it held 65: both are coupled
motions the probe measures but does not take apart, and neither is a
gate.

### Re-recorded, re-pinned, and what did not move

Re-recorded (`node scripts/wing-record.js`), every take off flown on a
prop with a new gyroscope: `cub-baseline.rec`, `glider-baseline.rec`,
`slowstick-baseline.rec`, `timber-baseline.rec`,
`timberf-baseline.rec`, `bombshell-baseline.rec`,
`kadet-baseline.rec`, `f16-baseline.rec`. The 1000 mm wing's, the
Skyhunter's and the Bramor's committed streams are kept (their recorders
no longer write the committed bytes even on origin/main) and only their
hashes are re-pinned. Unmoved, to the bit: the five inch
(9fdc42323baad668), the Bramor's chute flight (motor cut), the P-51 and
its air flight, the Ugly Stik, the Tiger Moth, the Zagi and the NRJ,
whose props already had their inertia; `war:legacy` and `crash:core`'s
digests. Regenerated: `configs/power-estimates.js`,
`tools/audio/flights.json`.

### Checks

- `timber:gates` T13 measured the taxi turn's heading change as the
  difference of its two end headings, which wraps past half a circle: at
  1.57 rad/s for 2 s the turn reached 179.6 deg and read as a left turn.
  It now sums the change step by step; on origin/main it reads the same.
- `rudderHold`, the take off pilot's feet, aims the nose back at the
  centreline, 0.3 rad per metre off it: the gyroscope's kick as the tail
  comes up put the Cub 0.55 m off the line with the heading held.
- Left loud, as in PR 2: `slowstick:stab` "yaw stick wins over the
  level hold, right of a quarter of its throw", -7.5 against a -7.5
  limit (passing on origin/main by hundredths): the same rudder only
  aircraft check as the Bombshell's in PR 2.

## PR 4, built: the fuselage in a crossflow

A knife edge is held by the fuselage's side force and the thrust's share
at a sideslip. The table's side force is CY beta, linear and the fin's;
the body's own crossflow, which grows with the sideways speed squared,
was missing (the removed Extra had it as `side_cda`). Now every aircraft
with a fuselage carries it: `side_cda`, eta Cdc S_side, a force against
v |v| at the CG. Allen and Perkins' viscous crossflow (NACA TR 1048), with
the removed Extra's eta Cdc of 0.84 (Cdc 1.2, eta 0.7, Jorgensen, NASA TR
R-474) on each fuselage's side area from its derivation or render model.

- On: the Skyhunter, Cub and Cub floats, Radian, Bramor, Timber and Timber
  floats, Bombshell, Kadet, P-51, F-16, Ugly Stik and Tiger Moth. Off: the
  1000 mm wing and the Zagi (their winglets are their fins, in CY beta
  already), the Slow Stick (a stick), the NRJ, and both Strikers, whose
  side force is war:legacy's and is not this lane's to move.
- The floats' own side area is not in the float versions' figure: the
  land fuselage's is, ESTIMATED.

### The probe, PR 3 to PR 4

| Aircraft | AUTH roll, pitch, yaw rad/s² | HOVER held of 8 s | HANG roll rate deg/s | HARR pitch deg | KNIFE bank deg, sink m/s | SNAP deg (aileron alone) | STALL m/s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 mm wing | 0.0, 0.0, 0.0 | 0.71 | -6.1 | 22.6 | n/a | n/a (115) | 8.03 |
| Skyhunter | 0.0, 0.0, 0.0 | 0.82 | 0.2 → 0.1 | 11.4 | 71.9, 12.6 → 72.6, 11.2 | 115 (73) | 10.31 |
| Cub | 0.0, 26.9, 6.3 | 1.12 | 2.0 | 15.7 | 75.1, 9.9 → 76.2, 8.2 | 126 (101) → 126 (100) | 8.94 |
| Slow Stick | -3.7, 15.5, 9.3 | 0.41 | -0.5 | 6.1 | n/a | n/a (n/a) | 4.82 |
| Radian | 0.0, 27.6, 10.0 | 1.27 | 2.6 | 20.6 | n/a | n/a (n/a) | 7.11 |
| Turbo Timber | 0.0, 51.6, 23.0 | 5.68 → 7.05 | 0.4 | 19.6 | 84.3, 12.4 → 86.1, 8.0 | 296 (185) → 292 (184) | 7.98 |
| Bramor | 0.0, 0.0, 0.0 | 0.32 | 7.4 → 3.7 | 15.2 | n/a | n/a (61) | 14.06 |
| Bombshell | -2.2, 24.5, 10.1 | 0.46 | -3.2 | 5.0 | n/a | n/a (n/a) | 6.94 |
| Kadet Senior | -2.4, 28.2, 14.1 | 1.01 | 0.8 | 11.6 | n/a | n/a (n/a) | 8.28 |
| P-51D | 0.0, 41.9, 8.2 | 1.69 → 1.70 | 4.0 | 29.0 | 72.5, 22.4 → 73.0, 20.6 | 281 (104) → 278 (104) | 11.06 |
| F-16 | 0.0, 0.0, 0.0 | 0.57 | 1.3 | 28.6 | 55.3, 3.3 → 60.4, 2.6 | 281 (202) | 12.82 |
| Zagi HP | 0.0, 0.0, 0.0 | 0.17 | 3.3 | 14.8 | n/a | n/a (166) | 7.90 |
| Ugly Stik | 0.0, 16.9, 12.4 | 3.08 → 3.10 | 1.2 | 13.5 | 68.4, 20.7 → 68.8, 19.9 | 64 (60) | 10.60 |
| Tiger Moth | 0.0, 15.8, 13.5 | 1.20 | 0.1 | 6.6 | 73.8, 17.6 → 74.5, 15.7 | 139 (66) | 9.89 |
| Striker | 0.0, 0.0, 0.0 | 2.27 | 17.0 | 19.3 | 82.8, 1.3 | 80 (89) | 7.87 |

The knife edge's sink falls on every aircraft that tries one (the Timber
12.4 to 8.0 m/s, the Cub 9.9 to 8.2); none of these sport and scale
aircraft holds one level, which is what their reviews say of them. The
3D aircraft is PR 5's.

### Re-recorded and unmoved

Re-recorded: `cub`, `glider`, `timber`, `timberf`, `bombshell`,
`kadet`, `f16`, `uglystik`, `tigermoth`, `p51` and `p51-air`; the
Skyhunter's, the Bramor's and its chute's hashes re-pinned on their
committed streams. Unmoved: the five inch, the 1000 mm wing, the Slow
Stick, the Zagi, the NRJ, `war:legacy` and `crash:core`'s digests.
Regenerated: `configs/power-estimates.js`, `tools/audio/flights.json`.
No gate changed.

## The spin measure, made honest (no plant change)

The probe this lane started from reported every spin recovery in 0.02 to
0.33 s, which said more about the probe than the aircraft: its recovery
ended at the first sample under 20 deg/s of yaw. `scripts/stall-probe.js`
rows B and C now say what they measure:

- **B** names the motion. A spin is the wing held stalled while it turns
  (its least angle of attack over the last 3 s over the stall); the same
  yaw rate with the wing flying is a spiral; under 60 deg/s is neither.
- **C** ends the recovery when the rotation has stopped (under 20 deg/s
  for half a second running) or the wing has flown (2 deg under its stall
  for half a second), says which, and gives the turns, time and height
  from the anti spin controls to that end, and the yaw rate it began from.

On main (the module byte identical, this pull request changes only the
probe):

| Aircraft | B: last 3 s | C: from, end, turns, s |
| --- | --- | --- |
| 1000 mm wing | 290 deg/s, alpha 7.3: spiral, the wing flying | wing flying in 0.50 s, 0.00 turns |
| Skyhunter | 49 deg/s, alpha 14.1: no spin | 0.09 turns, 0.59 s |
| Cub | 49 deg/s, alpha 15.7: no spin | 0.07 turns, 0.60 s |
| Slow Stick | 98 deg/s, alpha 13.8: spin | 0.02 turns, 0.55 s |
| Radian | 81 deg/s, alpha 14.6: spin | 0.06 turns, 0.58 s |
| Timber | 50 deg/s, alpha 19.9: no spin | 0.13 turns, 0.59 s |
| Bramor | 395 deg/s, alpha 15.7: spin | 0.18 turns, 0.67 s |
| Bombshell | 139 deg/s, alpha 12.3: spin | 0.01 turns, 0.53 s |
| Kadet | 51 deg/s, alpha 10.6: no spin | 0.05 turns, 0.53 s |
| F-16 | 283 deg/s, alpha 40.2: spin | 0.04 turns, 0.65 s |
| Ugly Stik | 39 deg/s, alpha 12.9: no spin | 0.06 turns, 0.60 s |
| Tiger Moth | 87 deg/s, alpha 16.6: spin | 0.09 turns, 0.63 s |

What it shows: the trainers and the Stik are stalled but turn at 40 to
50 deg/s, a stalled spiral, not a spin; and every aircraft that does spin
stops the moment the stick goes forward, in under a fifth of a turn. A
real light aircraft takes a half to one and a half turns after the anti
spin controls to stop (FAA-H-8083-3C ch. 5, "Spin recovery"), because its
spin is autorotation that the wing keeps up until the rotation is taken
out of it. That is the plant to build next; this is its before.
## PR 5, built: the 3D aircraft

E-flite's Extra 300 3D 1.3m (EFL115500), the aircraft docs/EXTRA-STAGE1.md
derives from E-flite's published figures, its manual's throws and APC's
data for its prop, is back in the hangar as airframe 29, `extra3d1308`.

- **A new id, not 14.** 14 and `extra1308` stay reserved: a recording,
  ghost, clip or room peer that names 14 still names the removed aircraft
  and is refused, and a stored `extra1308` still reseats on the Ugly Stik
  (configs/airframes.js retiredAirframe). Nothing old replays as this one.
- **Revived, not redone.** The plant code only it used (the high angles,
  `hi_alpha` and `tail_*`; the slow air's damping, `rot_k`; the
  surface knee, `surf_knee`), removed in aa21a64a, is back, zero gated:
  with every existing table leaving it zero, every recorded hash replays
  as before (checked before the table went in). Its table, gear, crash
  parts, render model, paint, power, props, tunes and strings are its
  own of 1c0872b3^, under the new id; it opens at its old level, 9.
- **On today's plant.** Its wash takes the swirl, the root's recovery and
  the side force of PRs 2 to 4. That moved two of its gates, re-derived in
  scripts/extra-derive.js with the same tolerances: E8, the torque roll
  hanging with the ailerons let go, derived 146 deg/s (230 before: the
  root and the fin take 0.152 of the prop's 0.255 N m back), the plant
  179; E9, full aileron in the wash, derived 232 deg/s (149), the plant
  235. Every other E gate held as it was: E6 hovers at stick 0.627, E7
  climbs straight up at 15.3 m/s, E10 and E10b give 37.0 and 31.3 rad/s²
  at zero airspeed, E11 harriers at 40 deg of alpha at 7.1 m/s, E12 knife
  edges at 34 deg of sideslip, E16 Node and Chrome agree.

### The probe

| | TW | AUTH roll, pitch, yaw rad/s² | HOVER | HARR pitch | KNIFE bank, sink | SNAP (aileron alone) | STALL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Extra 300 3D | 2.55 | 20.2, 98.1, 87.2 | 8.00 of 8 s | 28.9 deg | 93.5 deg, 4.7 m/s | 385 deg (405) | 9.32 m/s |

The only aircraft that holds the probe's hover for all 8 s, and the only
one with roll authority at zero airspeed: its ailerons start 77 mm out,
inside the wash. The probe's harrier pilot is integrator limited at 29
deg; extra:gates E11, flown to the alpha, holds 40. AUTH here is one step
of full stick, the gates' E10 a 20 ms average from rest.

### What deepens a spin, measured

Two more columns in row B and a row G, still no plant change:

- **B** gives the inertial pitch, -(Iz - Ix) p r, nose up, which in a real
  spin holds the nose up against the aerodynamics (Bowman, NASA TN D-6575,
  p. 6: "As the one-turn point is approached, the nose comes back up and
  the angle of attack continues to increase"), against the aerodynamic
  pitching moment; and how much of the time the stalled strips' roll has
  the roll rate's sign, which is autorotation.
- **G**, the accelerated stall a snap roll is: full back, right rudder and
  right aileron at once from 1.4 Vs at half throttle, 1 s: the angle of
  attack reached past the stall, the peak pitch and roll rates.

The targets, where a source gives one: a developed light aircraft spin
at 32 to 79 deg of angle of attack and 122 to 261 deg/s (Stough, AIAA
90-1317, four aircraft, recovery parachute tests), reached after about two
turns in 4 to 6 s (Bowman, p. 6 and 13); recovery from a one turn spin in
not more than one more turn (14 CFR 23.221(a), normal category); one RC
aerobat measured, a 35 percent Extra 260, rolling at 235 deg/s with its
nose 55 deg down and sinking 15 m/s (Ragheb, Dantsker and Selig, AIAA
2013-2806). For the aircraft here, only the Tiger Moth has a source that
says it spins ("Stalls, spins, aerobatics are straightforward",
Phillips, docs/TIGERMOTH-STAGE1.md) and only the Ugly Stik one that says
it snaps (RCM, "four point and snap rolls"); nothing found says the Cub,
Kadet, Skyhunter, Timber or Slow Stick does or does not.

On #854's module: the trainers sit 1.5 to 2 deg past their stall turning
at 47 to 55 deg/s, the inertial pitch a few hundredths of a newton metre,
the strips with the roll; the Tiger Moth turns at 62 deg/s at 14.6 deg
with 0.133 N m of inertial pitch up against 0.070 of aerodynamic pitch
down. G: the Stik reaches 2.6 deg past its stall at 65 deg/s of pitch and
rolls at 73 deg/s, the P-51 (not in this probe; flightmodel-probe's SNAP)
snaps. None of them is near Stough's envelope: the plant's spins are
shallow, the next step's subject.

### Deep spins and the Stik's snap: not built, and why

- **What holds the plant's spins shallow is the stall's pitch break, at
  the sections' own data.** On the Cub's B flight the full up elevator's
  linear moment at 14.6 deg is +0.10 of qSc and the stall's moment -0.10:
  the angle of attack stops 2 deg past the stall. The strips past it hold
  their lift flat for stall_top (the UIUC curves each table cites: 4.6 deg
  on the Cub's Clark Y class, 6.2 on the Tiger Moth's), so a roll rate that
  pushes a wing deeper loses it no lift: no autorotation to speak of until
  the wing is deeper than the elevator takes it, and no rotation fast
  enough for the inertial pitch to take it there. A developed spin at
  Stough's 32 to 79 deg needs the tail's and the stalled wing's pitching
  moments at those angles, which no source here gives for these aircraft.
- **Tried:** the Tiger Moth, the one aircraft a source says spins, with
  hi_alpha's saturating tail (the removed Extra's, its own tail slopes):
  B unchanged, 60 deg/s at 14.4 deg. The cap is the wing's break, not the
  tail. Not kept.
- **The Ugly Stik's snap:** G reaches 2.6 deg past its stall at 65 deg/s
  of pitch on the plan's 3/8 in of elevator; the P-51 snaps on its own
  throws. RCM's "four point and snap rolls" gives no throws or speeds for
  them, and nothing found times a Stik snap: building one would be fitting
  the elevator or the break to an adjective.
- **A spin recovery that takes turns:** every spin here stops in under a
  fifth of a turn, inside 14 CFR 23.221's one turn. A delay (the rudder
  blanketed by the stalled tail, Bowman p. 16) is measurable only on a
  developed spin, which the plant does not reach, so it is not built.
## The rudder only aircraft's level hold, retuned for the wash

PR 2's wash made the Bombshell's and the Slow Stick's rudder stronger
under power, and Stabilised rolls those two on the rudder. The level
hold's roll gains were tuned on a rudder in the free stream, so its loop
gain rose with the wash's ratio and it took back more of the pilot's own
yaw stick: bombshell:stab's "full right yaw stick ... wins over the level
hold, right of a quarter of its throw" read -2.7 deg against its -5, and
slowstick:stab's -7.5 sat on its -7.5 limit. Each gain is now its old
value over the rudder's authority ratio in the wash at the trim, 1 + dp fv
/ q (scripts/stab-hold-derive.js, `npm run stab:hold`, in CI): the loop
as it was tuned, on the aircraft as it now flies. No check changed.

| | trim | rudder gain in the wash | kp | kd | yaw stick's rudder |
| --- | --- | --- | --- | --- | --- |
| Bombshell | stick 0.732, 7.93 m/s | 1.446 | 1.6 to 1.11 | 0.6 to 0.42 | -2.7 to -5.4 deg (-5.4 before the wash) |
| Slow Stick | stick 0.739, 5.44 m/s | 1.309 | 2.0 to 1.53 | 0.8 to 0.61 | -7.5 to -9.6 deg (-7.5 before) |

Stabilised only: Manual and Acro, and every recorded flight, replay to
the same hashes as on main.

## SWIRL_KEEP from a source: Selig 2010

PR 2 fitted SWIRL_KEEP, the share of a tractor's swirl that reaches the
fin past the wing's root, at 0.5, the middle of what was unknown. It now
comes from Selig, "Modeling Propeller Aerodynamics and Slipstream Effects
on Small UAVs in Realtime" (AIAA 2010-7938), section B, Swirl Effects:
"For a typical aerobatic RC/UAV configuration capable of hover, the net
right rolling moment is near 40% of the propeller torque", the swirl's
roll on the wing root, the fin and the fuselage taken together. The
Extra 300 3D is that aircraft. At its hover the root's (1 - K) Q and the
fin's roll in the swirl make 0.40 Q at K = 0.743 (scripts/extra-derive.js
solves it; the fin's roll is linear in K); taken 0.74. Selig's fuselage
coil is in the root's share here. Searched and found no number: Veldhuis
(Propeller Wing Aerodynamic Interference, TU Delft 2005) and Witkowski,
Lee and Sullivan (J. Aircraft 26(9), 1989) describe the wing's recovery
of the swirl without a share a plant can take.

More of the swirl at the fin swings a tractor harder on its take off roll
(the Cub, Timber and Bombshell 20 deg by liftoff with the rudder left
alone; the P-51 45), and the root takes less of the torque back: the
Extra's hanging torque roll, E8, re-derived to 178 deg/s (146 at 0.5),
the plant 218; E9, full aileron against it, 209 (232), the plant 212.

### The probe, main to this

 Aircraft | HOVER held of 8 s | HANG roll rate deg/s 
 --- | --- | --- 
 1000 mm wing | 0.71 | -6.1 
 Skyhunter | 0.82 | 0.1 
 Cub | 1.12 → 0.92 | 2.0 → 1.7 
 Slow Stick | 0.41 | -0.5 → -0.6 
 Radian | 1.27 → 1.20 | 2.6 
 Turbo Timber | 7.05 → 5.60 | 0.4 → 0.2 
 Bramor | 0.32 | 3.7 
 Bombshell | 0.46 → 0.45 | -3.2 → -3.9 
 Kadet Senior | 1.01 | 0.8 
 P-51D | 1.70 → 1.32 | 4.0 → 3.9 
 F-16 | 0.57 | 1.3 
 Zagi HP | 0.17 | 3.3 
 Ugly Stik | 3.10 → 3.06 | 1.2 → 1.1 
 Tiger Moth | 1.20 → 1.19 | 0.1 
 Striker | 2.27 | 17.0 
 Extra 300 3D | 8.00 | -0.7 

### Changed, and why

- The Ugly Stik's take off pilot and the river check's landing and taxi
  pilot hold the line on the rudder as every other take off pilot does
  (rudderHold, heading and centreline): their own gains no longer held
  the stronger swing (the Stik 0.73 m off the line against 0.5; the
  floatplane 2.8 m off its channel's line and out of the water taxiing).
- The Extra's stab self test takes the Cub's form: sticks centred it
  swings left, the heading held on the rudder it tracks.
- Re-recorded: every tractor's recording and the Extra's; re-pinned their
  hashes, recfile, replaylib's P-51 trace and simmod's transcript.
  Unmoved: the five inch, the 1000 mm wing, the Skyhunter, the Bramor and
  its chute, the F-16, the Zagi, the NRJ, war:legacy and crash:core.

## The Skyhunter's wash: a pusher between its booms

The Skyhunter's prop is behind its wing and ahead of its H tail: its wash
blows the middle of the stabiliser, 0.456 m of span between the booms,
and passes both boom fins 0.232 m out (docs/SKYHUNTER-STAGE1.md, the 3D
model), and no wing root stands behind the prop to turn its swirl back.
Two table fields say so: `slip_pusher` (no root: the swirl's share at
the tail is all of it, and nothing recovers it) and `slip_hv` both zero
(no fin in the wash: its share is 0). Every other table's arithmetic is
as it was. From scripts/wash-derive.js on its derivation's tail numbers.

| Skyhunter | main | this |
| --- | --- | --- |
| AUTH pitch, yaw rad/s² at zero airspeed | 0, 0 | 31.3, 0 |
| HOVER held of 8 s | 0.82 | 4.31 |
| HARR pitch | 11.3 deg | 17.2 deg |

Re-recorded nothing: the Skyhunter's committed recording is kept (its
recorder does not reproduce it on main either) and its hash, replaylib's
trace and simmod's transcript are re-pinned. Every other hash is the
previous pull request's.

## The stall, part 1: CL max at the top of the curve, and the moment break

### The lift

The probe found every minimum flying speed 3 to 12 percent over its
derivation because the plant's lift curve topped out at 0.80 to 0.88 of
each table's CL max (UGLYSTIK and TIGERMOTH-STAGE1 said as much: "the
plant's curve rounds off short of CL max, as every aircraft's does"). Every
derivation's stall speed, sqrt(2 W / rho S CL max), takes CL max as the
peak of the curve. Now it is: the wing's own lift follows the linear line
to a stall_blend short of the stall angle, leaves it below on the parabola
tangent to it there, and tops out at CL max a stall_blend past it, level;
the stalled section holds CL max for stall_top before it falls. The plate's
drag and the strips' stall angle start where they always did, and the gates
measure the stall at the linear crossing as before.
scripts/lib/liftcurve.js is the curve for the derivations (Kadet, Bombshell,
Slow Stick, stab:glide), formula for formula.

### The moment break: the centre of pressure moves aft at the stall

The stalled lift used to act at the aerodynamic centre for as long as the
section held it, and only move to the plate's centre of pressure as it
fell. A section that stalls from its trailing edge separates from CL max on
and its centre of pressure moves aft with the separation: its quarter chord
moment breaks nose down at the stall itself, not when the lift falls
(Abbott and von Doenhoff, Theory of Wing Sections, the cm_c/4 curves of the
NACA 24xx, 00xx and Clark Y class sections; Hoerner, Fluid Dynamic Lift, the
centre of pressure's travel with separation). Critzos, Heyson and Boswinkle,
NACA TN 3361 (the NACA 0012 to 180 deg), say the same in words: the
quarter chord moment "become[s] negative after the stall (alpha = 14 deg)
and remain[s] negative to 180 deg". They give the sign, not the speed: how
fast the arm moves is the model's choice, not a measured curve, and the
sourced curve would come from TN 3361's figure 1, which is not digitised
here. It moves over one stall_blend from the stall angle, a choice bounded
by the P-51's flight test on one side and the trainers' gates on the other.
Spread over the whole plateau and the fall instead (stall_top and two
blends), the Stik's U11b reads bank 19.1, the Slow Stick's S9b yaw 28.5
and the P-51's P19 pb/2V 0.119, past the XP-51's band; over one blend all
three pass, P19 at 0.107. The arm now moves over the
stall's own blend (past) rather than over the fall, on the monoplane and on
each of a biplane's wings. With CL max held at the old arm, the aircraft
whose CG is behind its wing's aerodynamic centre (the Ugly Stik, the Tiger
Moth) pitched up harder at full up and stalled deeper, and dropped a wing at
a held powered stall (U11b 33 deg, T8b 18); with the break at the stall
their trim is main's again (the Stik 14.2 deg of alpha against 14.0).
Independent flight test agreement: the P-51's slow pull to full up, P19,
reads pb/2V 0.107 in its first second, against the XP-51's 0.079 (NACA)
inside the band of 0.04 to 0.118 it was derived on; 0.112 before.

### Minimum flying speed, the probe's, #853 to this

 Aircraft | STALL m/s 
 --- | --- 
 1000 mm wing | 8.03 → 7.19 
 Skyhunter | 10.31 → 9.15 
 Cub | 8.94 → 8.07 
 Slow Stick | 4.82 → 4.54 
 Radian | 7.11 → 6.49 
 Turbo Timber | 7.98 → 7.31 
 Bramor | 14.06 → 13.80 
 Bombshell | 6.94 → 6.66 
 Kadet Senior | 8.28 → 7.42 
 P-51D | 11.06 → 9.74 
 F-16 | 12.82 → 11.80 
 Zagi HP | 7.90 → 7.38 
 Ugly Stik | 10.60 → 9.46 
 Tiger Moth | 9.89 → 8.99 
 Striker | 7.87 → 8.87 
 Extra 300 3D | 9.32 → 8.36 

Against each derivation: the 1000 mm wing 7.19 (7.25), Skyhunter 9.15
(9.2), Cub 8.07 (8.1), Radian 6.49 (6.49), Zagi 7.38 (7.36), Ugly Stik 9.46
(9.48), F-16 11.80 (11.98), P-51 9.74 (10.06), Timber 7.31 (7.20), Kadet
7.42 (7.15), Bombshell 6.66 (6.49), Slow Stick 4.54 (4.43): the remaining
few percent over on the trainers is the elevator's down load at full up,
which the probe flies with and the formula leaves out. The Tiger Moth's
derivation put its stall at the top wing's CL max, 9.47 m/s; the cell keeps
lifting on its bottom wing past that, and the cell's own maximum on the
plant's curve is CL 1.106, 8.76 m/s (the bip_* wings through
scripts/lib/liftcurve.js); the plant flies 8.99. T2 still measures the top
wing's crossing and is unchanged.

### Gates re-derived, each said so in its source

- Bands derived on the old curve, re-derived on the new one with their
  tolerances: Kadet S9a (sink 1.21 m/s at 7.72 m/s, was 1.88 at 9.0),
  Bombshell S9a (1.23 at 6.83, was 1.98 at 7.7), Slow Stick S9a (0.92 at
  4.63, was 2.09 at 5.7, the first derivation's flat plate), Slow Stick
  S15's take off (3.20 m at 4.63 m/s, was 4.9 m at 5.2). stab:glide's
  curve is the new one; no table moved. The Slow Stick's hand toss in
  wing:contact is thrown with the elevator neutral: 0.1 up climbed the
  throw down to 4.9 m/s on the true curve.
- Powered held stalls, flown as the handbook flies them (FAA-H-8083-3C ch.
  5, power on stalls: right rudder against the left turning tendencies, a
  wing picked up with the rudder): the Kadet, Bombshell and Slow Stick S9b
  hold the wings on the rudder, their only roll control; the Tiger Moth's
  T8b takes the yaw rate out on the rudder, as Great Planes' manual says
  ("always be ready to apply right rudder to counteract engine torque");
  the Stik's U11b and the Moth's T8b aileron holds have an integral, as the
  Kadet's S8 bank hold, slow (0.2 per second per radian) against a stalled
  wing's roll response. No band moved; every one passes.
- tuning:check U2 read the Radian's static margin from two angles the
  second of which, 2.9 deg of body angle, is past where its curve now
  leaves the linear line; both points are on the linear lift now, and the
  Radian's documented margin is the table's own, -cm_alpha / cl_alpha,
  1.304 / 5.709 = 0.228 (it read 0.234 off the old curve's blend). The
  hangar's tuning page shows 22.8 percent for it.
## A hover a person can fly, and the Extra's AS3X

The owner flew the Extra 300 3D and could not hover it. HOVER above is
flown by a pilot that reads the state the instant it changes, which no
person does, so the hover was asked again of a pilot with a person's
limits: scripts/hover-probe.js. It sees the aircraft 0.2 s late (the
effective delay of a trained operator in compensatory tracking, McRuer
and Jex, "A Review of Quasi-Linear Pilot Models", IEEE Trans. HFE 8(3),
1967), moves the sticks ten times a second in fiftieths of their travel,
and flies by what is visible from the ground: the nose off vertical and
its rate, the roll rate (trimmed out slowly on the ailerons, as a pilot
learns the torque), the drift, leaned against with the nose, and the
climb, on a held throttle. Pilots differ, so it flies a grid of 648 gain
sets and counts the ones that hold 10 s, the nose within 20 deg of
vertical and the height within 10 m, from nose up at no airspeed.

The drift term is what a person has that the instant pilot did not
need. A hanging aircraft that tilts slides, and the slide's crossflow on
the stabiliser in the wash weathervanes the nose further into it (the
`slip_cm_a` term): the Extra's hover, the sticks frozen at its trim,
departs at about 2.9 /s, doubling in 0.24 s, the same term that gives the
elevator its hover authority. On attitude alone no gain holds that with
a 0.2 s delay; leaning against the drift, as a pilot watching the plane
slide against the trees does, it holds.

### Which aircraft a person can hover, Manual and the default tune

 Aircraft | T/W | Manual | Default | Why
 --- | --- | --- | --- | ---
 Extra 300 3D | 2.55 | 11 of 648 | AS3X: 82 of 648 | holds: thrust to spare, every surface in the wash
 Turbo Timber | 1.50 | 0 | Acro: 0 | full aileron cannot hold the torque at hover throttle (0.93): the ailerons are outboard of the wash
 Ugly Stik | 1.36 | 0 (best 1.6 s) | Acro: 0 (best 9.4 s, torque rolling) | elevator and rudder run out at hover throttle
 P-51D | 1.33 | 0 | Acro: 0 | hover takes full throttle, nothing left to correct with
 Skyhunter | 1.31 | 0 | Acro: 0 | a pusher: no wash on the tail, no authority at no airspeed
 Striker | 2.09 | 0 (best 2.3 s) | Acro: 0 | a pusher: the same, and the torque rolls it 6 turns
 F-16 | 1.13 | 0 | Acro: 0 | a ducted fan exhausting behind the tail
 Cub, Kadet, Zagi | 1.03 to 1.04 | 0 | 0 | hover takes all the thrust there is
 Radian, Tiger Moth, Bramor, Slow Stick, Bombshell | 0.51 to 0.97 | 0 | 0 | thrust under weight

So the Extra is the one aircraft here that hovers, by skill, in every
mode but SAFE Select; the rest fail the way their real ones would, by
running out of thrust, of control in the wash, or of aileron against the
torque. The trim a stationary Extra hover takes: throttle 0.61, right
aileron stick 0.58 against the torque (Selig's net roll, 0.40 of the
prop's torque, against ailerons only 2 percent of whose span the
contracted wake covers), right rudder 0.23. At that throttle full stick
gives 38 rad/s^2 in pitch, 35 in yaw and 7.7 in roll, the torque alone
3.3 (98, 90, 20 and 8.5 at full).

### The modes, the real aircraft's

E-flite's Extra ships with AS3X: "When the normal bind process is
followed, the SAFE Select system is disabled, leaving specially tuned
AS3X technology in place to deliver a pure, unrestricted flight
experience" (EFL115500 manual, p. 4). SAFE Select is the optional bind
with "bank and pitch limitations" and "automatic self-leveling". Its tunes
here are now AS3X (the default), Manual and SAFE Select; Acro, an
attitude hold capped at 100 deg/s of pitch that no Extra has, is gone
from it (plant mode 2 stays for the others).

AS3X is mode 3 in the plant: each surface is the stick's at the full
throw and expo, less `as3x_k` of surface per rad/s of the body's own
rate on that axis, clipped at the throw. Spektrum documents the rest:
"Stick priority reduces the amount of gyro gain as you move the control
stick away from center ... The default setting is 160, which means the
gain goes to 0 at 40% stick input" (AS3000 manual, p. 10), taken as a
straight fall from centre, which its three stated points fit; and
"Heading is Off by default", so no attitude hold. Full stick is
therefore Manual's full throw and rate (extra:stab checks both within 2
percent). Horizon publishes no gains, only that too much shows as
oscillation at speed, so scripts/as3x-derive.js takes the most a rate
loop with the servo frame's delay (22 ms, "22ms is the default setting")
carries at the top speed, 24.1 m/s, halved for MIL-F-9490D's 6 dB gain
margin: k = pi / (4 M tau), M the plant's control power there. The
Extra's: 0.028, 0.1224 and 0.1842 rad per rad/s in roll, pitch and yaw.
It makes the hover far easier to fly, 82 pilots of the 648 against
Manual's 11, which is what AS3X is sold for.

The swirl (SWIRL_KEEP above) makes the Manual hover harder, not easier:
on the Extra before it, 48 of the 648 held Manual and 20 Acro, and the
stationary hover took 0.43 of right aileron against the torque, where
Selig's net roll now asks 0.58. That is the source's torque, not a fit.

### In the shell, and how it looks

extra:owner (its airframe id had been left at the retired `extra1308`
since the Extra came back as 29, so it seated the Timber; fixed) now
flies the same person in the page, once the Extra hangs on the prop: in
AS3X it holds 10 s, the nose within 11 deg. The chase camera followed
the craft's travel, and a hovering plane's few millimetres of drift a
frame, taken as a direction, turned it 342 deg round the plane in 10 s;
its pull toward the travel is now weighted by the speed (half at 4 m/s),
and a vertical travel is held under 0.8 of the direction so the camera
never sits under the plane looking up world up: 81 deg over the same
hover, the drift's own parallax. The surfaces already drew at the full
3D throws; the prop's blur disc, a fixed faint tan whatever the motor,
now shows with the motor's rate and not at rest.

### Not changed, found

- The motor's thrust follows the throttle in the step it is asked: a
  prop's speed is the duty's (plant_wing.c, `n = duty_e`); only a ducted
  fan lags (`fan_tau`). An outrunner and a 13 in prop take some tenths of
  a second to spool, but no source here gives the Extra's, so no lag was
  invented. A throttle blip in a hover is therefore sharper than a real
  one.
- Flown on the keyboard alone, the throttle is a collective that springs
  back to 0.22, the five inch quad's hover, when the key is let go
  (src/input/keyboard.js); a plane's hover throttle is about 0.6, so no
  plane can be hovered on the keys alone. A radio or a gamepad's throttle
  is unaffected.

## Vertical air at the craft, for the weather

The weather lane asked for vertical air the host can set at the craft:
thermals over sunlit ground, a ridge's or the dam face's lift, the sink
beside them (docs/WEATHER-CONTRACT.md). `sim_set_air_vertical(w)`
(sim_abi.h, additive) sets the air's vertical velocity, -10 to 10 m/s up,
which the host reads off its weather at the craft's position and sets as
it changes. It rides on the wind's own path (plant_wind's z, which was
always 0): every airframe flies through it as through the horizontal
wind, a plane's aerodynamics, a quad's rotors and drag, the free parts,
on top of the Radian's own three thermals. A world property kept across
resets, like the wind. 0 is the default, and a flight that never sets it
replays to the same hashes as on main.

`npm run air:vertical` (in CI): the refusals; the Cub's recording to its
pinned hash with the call made and without; a Radian's glide sinking
0.500 m/s less in 0.5 m/s of rise; a seven inch with its motors off
falling less far in rising air; it outliving a reset and a still wind,
and 0 taking it away to the bit.

## The jet's normal force in a hover

Air that crosses the disc sideways leaves along the prop's axis, so the
prop takes its sideways momentum: Selig, AIAA 2010-7938, eq. 13 to 16,
N_j = k_j rho A w0 V_T against the disc's sideways air V_T, w0 the
hover's induced speed sqrt(T / (2 rho A)); "for an airplane in hover the
damping force makes hovering flight less demanding of the pilot". k_j:
Selig gives about 80 percent behind a smooth cowling and "nearly 100%"
for the cruciform nosed profile foamies; the Extra is cowled, 0.80. It
acts at the disc, 0.302 m ahead of the CG (the drawn model), so it damps
the nose's swing as well as the drift, and it is washed out away from
the hover by 1 - m, Selig's jet parameter m = V_N / (V_N + w); his
classic normal force (eq. 4), which he blends with it, is not in this
plant. The Extra only so far; every other table leaves k_j at zero.

Measured: a 2 m/s drift, the attitude held vertical at the hover's
throttle, is 0.64 m/s a second later along the wing and 0.29 across it,
against 0.94 and 0.54 without; hover:probe's person-limited pilots
holding the Extra 10 s, Manual 11 to 59 of 648, AS3X 82 to 169.

### Not known: AS3X's heading on this receiver

The Extra's AS3X here is a rate damper. E-flite's manuals describe AS3X
with a centred stick as "continue to fly at its present attitude", which
a heading term would do, and Spektrum's receivers carry one ("Heading",
off by default on the AS3000). Whether the Extra's factory set up (an
AR636) has it on, and how much, is not published; it is left out until
that set up is sourced.

## The Extra's gyro: a heading lock

The owner (2026-10-08): "you dont need to be tied to specific receiver
specs just assume you can use any electronics in there, but make the
physics and behavior work". So mode 3, the Extra's default, is a heading
lock gyro, the kind 3D aircraft and helicopter tails fly on, built as
E-flite describes AS3X behaving (the Timber manual's AS3X column: stick
neutral, "Aircraft will continue to fly at its present attitude"; small
stick, it rolls or pitches slowly; full stick, rapidly):

- Once an 11 ms servo frame (Spektrum's frame for digital servos; the
  Extra's are digital) it reads the rates and writes each surface's
  offset, held to the next frame.
- A damper on the body's rate, as3x_k, and a heading term, as3x_kh, on
  the rotation beyond what the stick asks: the stick times as3x_rate,
  the airframe's own turn per stick, the larger of level at 16 m/s and
  hanging on the prop, so the gyro never holds the stick to less than
  the aircraft gives it. Centred it holds the attitude against the
  torque and the gusts; held it turns at the rate asked.
- Both fade as the stick leaves centre and are gone at 40 percent
  (Spektrum's priority 160), so a full stick is Manual's.
- The servos slew at 9.52 rad/s, in every mode: E-flite publishes no
  speed for the Extra's 23 g digital servo (EFL11598); Hitec's D89MW, a
  25 g digital servo of its class, is "0.11 sec @ 60 deg" at 6 V.
- Gains from as3x:derive: the rate loop at its 6 dB margin at the top
  speed against the frame's delay, k = pi / (4 M tau), 0.0508, 0.2369,
  0.3611; the heading's corner a quarter of that loop's crossover, kh =
  k pi / (16 tau), 0.9068, 4.2287, 6.4456; as3x_rate 7.171, -4.445, -5.207
  rad/s per unit stick (as3x:derive on the spun up plant, 2026-10-10). A 1 rad/s kick at 35 m/s settles on every axis
  (as3x:derive checks it); at a 5.5 ms frame the same derivation's gains
  oscillate in yaw against the servos' slew, so 11 it is.

Considered and not built:
- A pure attitude hold under 40 percent stick (the rotation itself
  integrated, not the rotation beyond the stick's). It is the easiest
  hover, 379 of 648 person-paced pilots, but it un-rolls a 35 deg bank
  the pilot made with 35 percent stick (extra:stab's "not levelled"
  gate, 35 to 1.5 deg), and no real gyro does that.
- Heading off on yaw (Spektrum's advice for normal flight). The nose
  in the hover is held on the elevator and the rudder alike, and the
  yaw term is most of the gyro's help there; a heading lock on the
  rudder makes a turn flown on the ailerons alone skid, as on every
  heading lock aircraft, so the rudder goes in with the turn.

Gated in extra:stab: a 1 rad/s kick on each axis with the sticks centred,
hanging on the prop and level at 16 m/s, turns the Extra less in 0.5 s
than in Manual (hanging: roll 7.7 against 24.0 deg, pitch 8.0 against
63.2, yaw 0.1 against 8.1); full stick is Manual's rate within 2
percent; a bank it is left in stays.

The person-paced hover (hover:probe's limits, the video's technique, a
slow torque roll, no hand trim; 648 pilots): Manual 72, the gyro 158,
holding with a mean aileron of 0.12; in a 2 m/s breeze gusting 1 m/s
RMS (ESTIMATED, the video's "wind pushes it around"), Manual 0, the gyro
132. The owner's morning target is 70 percent of them; with real
electronics on this physics it is 24. The
pure attitude hold above is 58 percent. What separates them is the
pilot model: it sees 0.2 s late and does not anticipate (analysis pass 2
counts 96, 52 and 8 of its 336 at 0.12, 0.2 and 0.3 s), so a person
practised on the aircraft does better than the grid.
## A prop spins up

The owner noticed the throttle reaches the thrust in the step it is
asked; a real rotor has inertia. Every prop now spins up by its drive's
own equation, every figure from the table already there (plant_wing.c,
prop_spool): the rotor's inertia j_prop (PR 3's estimates) turned by the
drive's torque less the prop's, the prop's torque going with its speed
squared, Q_f = torque_arm thrust_static at full.

**Electric motors** (Drela, "First-Order DC Electric Motor Model", MIT
16.50 notes, 2007: Q = (I - I0)/Kv, I = (V - w/Kv)/R). The table's speed
at full is 0.85 of no load (the plant's rule), so the circuit (pack, ESC
and windings) drops 0.15 of the pack's voltage at the full current, which
sets R; Kt is V over the no load speed, so the motor's torque at full is
Kt I_f, which matches the prop's torque_arm times thrust_static (the
Extra's 0.68 and 0.65 N m). Over the full speed,
J w_f n' = Q_f (5.67 (d - n) + d^2 - n^2), whose rest is still n = d, the
plant's speed at a duty: the thrust curve and the trims are where they
were, and only the getting there takes time. The current a step draws is
that circuit's, up to V/R at a stall; no ESC here clamps it in running
(none of these aircraft's ESC listings names a current limiter, and we
found no source for one acting on a throttle step), so none is modelled.
With the stick pulled back (d < n) the same equation brakes the prop
harder than its drag alone: that is the ESC's damped light (synchronous
rectification, BLHeli's default "damped light" mode) returning the back
EMF's current to the pack.

**Glow and petrol engines** (Ugly Stik, Tiger Moth, Kadet, Bombshell, the
Striker's boxer). At a fixed throttle an engine's torque changes slowly
with its speed (Heywood, Internal Combustion Engine Fundamentals, 1988,
ch. 2, brake torque against speed), taken as flat, so the drive is the
torque that holds n = d and J w_f n' = Q_f (d^2 - n^2): with no back EMF to
stiffen it, an engine answers several times slower than a motor of its
power. The carburettor's own delay, a few revolutions of mixture, has no
source we found for engines this size and is left out (it would only add
to the lag). An engine is running from the reset, at its idle.

A thrown or launched plane starts at the duty; a cut or flat motor or a
dead engine coasts down on the prop's drag alone. The ducted fan keeps its
own sourced fan_tau and the turbojet its spool.

spool:derive (in CI) measures it off the plant, 63 and 90 percent of the
thrust's change, ms, nose up and held still:

 Aircraft | half to full | full to half | rest (idle) to full
 --- | --- | --- | ---
 sky1800 | 88/183 | 48/101 | 117/214
 cub1400 | 119/248 | 83/207 | 158/290
 radian2000 | 129/269 | 90/226 | 172/316
 bramor2300 | 60/126 | 42/105 | 80/147
 slowstick1180 | 100/209 | 70/174 | 133/244
 timber1500 | 130/271 | 66/134 | 173/317
 bombshell1118 (glow) | 327/649 | 284/634 | 404/718
 kadet1981 (glow) | 423/760 | 362/728 | 544/836
 uglystik1567 (glow) | 319/625 | 196/430 | 436/728
 tigermoth1803 (glow) | 319/625 | 262/609 | 436/728
 extra3d1308 | 60/103 | 27/48 | 100/182
 p51d1450 | 274/555 | 158/375 | 363/640
 f16878 (its fan_tau, unchanged) | 195/337 | 147/277 | 415/561
 zagi1219 | 48/100 | 34/84 | 64/117
 striker2500 (petrol) | 304/548 | 183/384 | 443/744

Gates that measured from rest in one step now hold the prop at speed
first, as the real measurement is taken: slowstick S11 and P-51 P10/P11
(tests/lib/wingpilot.js fullThrottleHeld), extra E10/E10b (a second at the
throttle), flightmodel-probe AUTH and TORQ, and hover-probe (the pilot
arrives in the hover with the motor at 0.6). The Striker's piston gate
"the thrust is the stick's" (under 50 ms) contradicted a rotor with
inertia and is re-derived: its rpm reaches 90 percent of full in 0.5 to
1.0 s about the 0.75 s the equation gives standing still.
