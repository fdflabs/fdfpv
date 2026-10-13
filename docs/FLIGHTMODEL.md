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
- The 1.2 is a round body's. Each aircraft whose fuselage is drawn in
  sections takes its own, NACA TN 3038 Table I through
  `scripts/lib/crossflow.js`, the section's drag over a round body's
  averaged over the side view: the Extra 1.30, CAP 1.30, Slick 1.35
  (63d1a6073), Night Timber 1.32 (w37-physics-servo); and
  (w38-fuselage-side) the Timber 1.19, Cub 1.40, Tiger Moth 1.48, Radian
  1.34, Bombshell 1.52, Kadet 1.72 (its square box past squareness 4, on
  Table I's sharper rectangles), P-51 1.29, Ugly Stik 1.69 (its slab box
  with the kit's quarter inch corners), Skyhunter 1.16 (its pod) and
  Hercules 1.02 (Allen and Perkins' 1.2 too, at their eta of 0.65 on 0.85
  of the side view). Each derive script prints its figure. The floats'
  tables carry their land fuselage's.
- Still on the round body's 1.2, ESTIMATED: the F-16, whose drawn body
  is two half superellipses on a chine with the strakes' edges at its
  widest line and the intake's duct under it, shapes TN 3038 did not
  test; and the Bramor, whose pod blends into its delta with no drawn
  sections of its own.
- The fuselage's own yaw at a sideslip is Munk's couple (NACA TR 184,
  1924): (k2 - k1) rho Vol V^2 sin 2 beta / 2, on u v in the body, so it
  is gone flying sideways and turns over with the flow from behind. Each
  derivation's fuselage share of cn_beta (-1.3 Vol / (S b), or Nelson's
  K_N term) is `cn_beta_fus`, taken out of the stability axis terms and
  put on -u v / V^2 in the body (plant_wing.c, MUNK'S MOMENT): the same
  at small sideslip, none at 90 deg, where before it stayed whole (the
  Extra's -0.043 of 0.24) and a share of it went into roll. Every table
  with a fuselage carries it, the Strikers' from `combat:derive`; the
  float versions add the floats' (`floats:derive`); the Skyhunter's and
  the Bramor's pods are their documents' and ESTIMATED. The F-16's
  measured ratio against alpha (hi_lat) takes it as it takes the rest. A
  fin lost in a crash leaves the body's WING_BODY_CN_BETA on the same
  form. The pitch analogue, Munk's u w, is the fuselage's cm_alpha share
  and is still linear in alpha.
- The crossflow force acts at its own centre of pressure, `side_x` ahead
  of the CG (w38-crossflow-moment): Allen and Perkins (NACA TR 1048) take
  a body's viscous crossflow station by station, so it acts at the side
  view's centroid with each station weighted by its own drag, depth
  times its TN 3038 section ratio (`scripts/lib/crossflow.js` profile),
  ESTIMATED on the drawn sections. Until then it acted at the CG and
  turned nothing. Aft of the CG on every aircraft but the Skyhunter, whose
  pod is ahead of its pusher's CG: Extra -0.200 m, CAP -0.129, Slick
  -0.527, Night Timber -0.153, Timber -0.159, Cub -0.136, Radian -0.160,
  Bombshell -0.152, Kadet -0.260, P-51 -0.162, Ugly Stik -0.142, Tiger
  Moth -0.233, Hercules -0.067, F-16 -0.004 (its body's depth alone, at
  the round body's 1.2), Skyhunter +0.084; the float versions their land
  fuselage's. The Bramor's crossflow stays at its CG. The sideways speed
  is the CG's; the rates' own crossflow along the body is `rot_k`'s.
- What it costs the knife edge, derived: the Extra at 15 m/s needs 93
  percent of its rudder (was 77) at 35.2 deg of sideslip; the CAP at 20
  m/s 92 percent (was 82) at 31.7; the Slick at 30 m/s 109 percent (was
  81): no level knife edge there; the Night Timber 200, 184 and 166
  percent at 12, 14 and 16 m/s (was 158, 144, 130). On the plant the
  Extra's E12 and the Slick's S12 run out of rudder (red, not loosened).

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
| F-16 | 65 deg/s, alpha 34.5: oscillating, not steady (TP-1538's lateral set, 2026-10-12) | 0.00 turns, 0.64 s |
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
plant. The Extra, the CAP and the Slick carry it; every other table
leaves k_j at zero.

The surfaces in the wash meet what the disc leaves of the crossflow
(2026-10-13, w38-hover-yaw). N_j is the momentum drag, the mass flow
through the disc times the crossflow it turns onto the axis, so the air
that reaches the tail keeps 1 - N_j / (mdot V_T) of the body's sideways
and normal speeds against the body: k_j hanging still, nothing with way
on. The fin's and the stabiliser's wash terms take that share; taking
the whole of it spent the same momentum twice. This is a momentum balance
on Selig's eqs. 13 to 16, not a step his paper states (his eq. 21 adds
the local flow and the wash as they are). Measured on the Extra hanging
still, rudder swept on the zero delay hold: before, the fin in the wash
turned the nose into the drift the tilt starts, a negative stiffness
through the drift (-6.9 N m/rad at 1 rad/s, against the jet's +1.5 and
the inertia's 0.15), and the rudder's tilt per stick sat at 0.55 to 0.70
from 1 to 4 rad/s; after, it falls as a damped integrator, 6.4 at 1
rad/s, 2.2 at 2 and 0.92 at 4, 102 to 126 deg behind. The swirl's
crossflow at the fin is the same at any yaw angle (it is in the body's
axes) and has no stiffness: 0.001 N m per unit of rudder at 1 to 4
rad/s. Every hover loop then keeps the bandwidth criterion on all three
(scripts/figures-margins.js, the hover).

Measured on the plant before the wash's share above: a 2 m/s drift, the
attitude held vertical at the hover's throttle, is 0.64 m/s a second
later along the wing and 0.29 across it, against 0.94 and 0.54 without;
hover:probe's person-limited pilots holding the Extra 10 s, Manual 11 to
59 of 648, AS3X 82 to 169.

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
  speed against the frame's delay, k = pi / (4 M tau), 0.0511, 0.2163,
  0.3619; the heading's corner a quarter of that loop's crossover, kh =
  k pi / (16 tau), 0.9121, 3.8609, 6.4599; as3x_rate 6.527, -4.167, -4.774
  rad/s per unit stick (as3x:derive on the spun up plant, each rate the
  stick's run against the centred one, 2026-10-11). A 1 rad/s kick at 35 m/s settles on every axis
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

### The receiver as it ships, and its gains to the margin (2026-10-12)

The owner flew the live build (#970) and said AS3X was "violently
correcting". Measured (scripts/as3x-margins.js, scripts/lib/as3xloop.js):
the receiver is a sampled loop, a frame up and a frame down at worst, and
at the full throttle dive every AS3X loop but the Radian's roll was
under MIL-F-9490D's 6 dB; the Bombshell, the Cub, the Hercules, the
Night Timber, the P-51 and the Slow Stick were at or past the onset
(0 dB or under), ringing at half the frame rate, the surfaces buzzing;
the Cub on floats and the F-16 were within about 1 dB of it, and the
F-16's and the Slick's dives are flown at sim_wing_launch's 60 m/s, under
their terminal speed, so theirs are lower bounds; the Extra was at 0.4 dB in roll at
42.4 m/s and 3.9 to 4.2 dB at its level top speed. The heading's integral
also rocked the Extra's hover in roll, 7 to 9 deg of phase margin at
2 to 3 rad/s, a 2.4 s rock, and wound up under a held stick and landed
on release (37 deg/s back from a 35 percent roll, 157 from full).

Now, from the receiver's own documentation:
- The Extra's BNF receiver is the AR631 (its manual p. 10, "AR631 gain
  values may need to be adjusted"). Its Heading "screens ... are
  defaulted to zero. You can increase this value to make the aircraft
  hold its attitude when control input is neutral. Heading gain on the
  yaw axis is generally not recommended because it will require the
  pilot to steer the aircraft through any heading changes." So mode 3
  ships as a rate damper; the heading term stays, at a pilot's share of
  as3x_kh (sim_wing_set_heading, zero by default; lead decision
  2026-10-12).
- The gains: "Increase the gain values until you find oscillation, and
  then reduce the gain to the highest setting that will not cause
  oscillation at any speed" (the AR631 manual). as3x:derive measures the
  airframe over slow flight, cruise, top speed, the full throttle dive,
  the harrier and the hover, and takes each damper as the highest that
  keeps 6 dB and 45 deg everywhere; the full Heading is the damper's
  integral at the corner the derivation always used, kh = k pi / (16 T).
  as3x:margins (in CI) fails any loop under the rule with the Heading at
  zero, and prints what the full Heading leaves.
- Priority fades the heading's sum with its output, so a held stick no
  longer winds it up.

What this costs: with the Heading at zero nothing holds the Extra's
attitude with the sticks centred, as with the real receiver; the hover
is flown on the sticks, as in Manual but damped. A pilot who wants the
old hold turns the Heading up and spends margin, as on the real
receiver. The section above describes the receiver before this.

### The receiver reads the channels, at every rate (w38-as3x-travel)

The manuals separate the travel from the rates. The receiver learns the
travel: "Relearn Travel and Reverse: Used to re-teach the receiver and
AS3000 the travel limits and reversing after ... changes are made to
travel adjust, absolute travel, and servo reversing", and on the
nose-wheel "Learn Travel ... Press apply after maximizing the rates and
moving the channel to the extremes" (the AS3000 manual); the AR631 asks
for "Relearn Servo Settings" after "sub-trim, travel or other setup
changes". The older AR635 says the same from the other side: "Changing
the servo total travel from 125% will affect the tuning and performance
of the AS3X technology. Always mechanically adjust the aircraft
linkages for less control surface throw", while on a radio without
travel adjust "If you need to use low rates ... you can do so without
affecting the performance of the AS3X system". The Extra's manual
(EFL115500 p. 4): "To ensure AS3X technology functions properly, do not
lower rate values below 50%. If lower rates are desired, manually
adjust the position of the pushrods on the servo arm." The AR631's
troubleshooting lists "Travel or Rates reduced causing reduced servo
resolution" under oscillation, with the same remedy. None of them says
the gyro's output is scaled by the rate.

So in mode 3 the gyro's offset is surface per rad/s, the same at every
rate, and as3x_k and as3x_kh are the gains at the full travel. What the
rates change is what the receiver reads: the channel, after the
transmitter's rate and expo, over the travel it learned with the rates
at their most (plant_wing.c as3x_channel; FixedWingParams.as3x_travel,
the throws under a tune). Priority and the Heading's asked rate read it,
so at a low rate, or with expo, a half stick leaves the gyro some of its
gain where the full rate's half stick left none. as3x_rate is per unit
of that channel.

as3x:derive measures every aircraft on its table and at every rate the
tune screen offers, and holds the feel rule (as3x-feel F1) at the stock
rate and at the high on every table, the factory presets included. The
Extra's preset scale answered a half stick at its stock low rate 7.6,
9.0 and 8.1 percent off Manual's (roll, pitch, yaw), over the 7 percent
the eye can see; its damper goes from 0.0177, 0.0885, 0.0708 to 0.0134,
0.0671, 0.0537, which answers 5.9, 7.0 and 6.3 percent at low rate and
0.7, 0.2 and 0.9 at high. The CAP and the Slick, at 60 and 55 percent
expo, keep about a sixth of theirs. Held only at the stock and the high,
a pilot on another rate can still see the gyro: as3x-feel prints those
rates' F1 unjudged, up to 24 percent (the Tiger Moth's pitch at low rate).
Holding F1 at every rate would cut the dampers further, the P-51's and
the CAP's to about a third again.

A bigger surface tier raises the high throw above the table's, so its
channel reads past the learned travel; it is held at the travel. The
real receiver would relearn the travel after that change, which this
does not model.

The full Heading on the 3D aircraft (lead decision 2026-10-13). With the
damper held to F1 at the Extra's stock low rate, the margin rule's full
Heading (0.083, 2.9395, 0.0808) made extra:gates E11b's harrier kick
worse than Manual's, 2.62 and 3.34 of it. One axis at a time: roll 1.52
and 1.80, pitch 0.99 and 0.99, yaw 0.81 and 0.85, pitch and yaw
together 0.81 and 0.84. A single scale on all three goes to nothing,
since any roll Heading worsens it (a hundredth gives 1.10). So
as3x:derive now holds each axis' full Heading on the Extra, the CAP and
the Slick to E11b's property, as the damper is to F1: the largest scale
on the margin rule's, per axis, that keeps the kicked rock under
Manual's with every axis at its full Heading at once, flown on each
aircraft's own gate harrier (scripts/lib/harrierkick.js) with the JS
receiver carrying the Heading (as3x-feel F0 checks it at full Heading
too). The harrier's rock is a roll the pilot is holding, and a roll
Heading sums the bank those corrections leave and fights them; pitch
and yaw Heading hold axes the rock only couples into.

On the batch's plant after w38-fuselage-side (abd2b5d7b):

| | Margin rule's Heading | Held | Kicked rock, of Manual's |
|---|---|---|---|
| Extra | 0.0837, 0.8927, 0.412 | 0, 0.8927, 0.412 | 0.58 and 0.61 |
| CAP | 0.3373, 0.2732, 0.7792 | 0, 0.2732, 0.7792 (w38-as3x-partial) | 0.42 and 0.42 |
| Slick | 0.1208, 0.0639, 0.7848 | 0, 0.0639, 0.7848 | 0.39 and 0.39 |

On the plant before it, the Slick's roll (0.75 of the rule's) and yaw
each held alone but not together, at any common factor down to a
twentieth, and it kept the yaw alone.

Every tenth of the Heading too (w38-as3x-partial, lead decision
2026-10-13, the owner's "small corrections, never change the way the
plane behaves"). The tune screen sets the Heading in tenths, and on
4dc533c3b the CAP's roll Heading (0.2867) held the kick only at the
full: alone, 1.76 and 1.96 of Manual's at a tenth, 2.83 and 2.90 at
four, 1.03 and 1.11 at nine, 0.50 and 0.81 at the full; the three
together 1.53 to 1.95 from a tenth to three, 1.10 at seven, 0.94 at
eight. as3x:derive now takes a scale only if every tenth of it holds,
the axes together and each alone, so the CAP's roll Heading goes to
nothing. `npm run as3x:tenths` (in CI, 18 s) flies the plant's mode 3
at each tenth, the three together and each alone, on the Extra, the
CAP and the Slick:

| Tenth | Extra, all three | CAP, all three | Slick, all three |
|---|---|---|---|
| 0 | 0.99, 0.99 | 0.92, 0.91 | 0.91, 0.90 |
| 0.1 | 0.96, 0.98 | 0.85, 0.80 | 0.87, 0.85 |
| 0.2 | 0.88, 0.91 | 0.78, 0.76 | 0.79, 0.78 |
| 0.3 | 0.82, 0.86 | 0.70, 0.70 | 0.70, 0.70 |
| 0.4 | 0.76, 0.80 | 0.62, 0.63 | 0.62, 0.62 |
| 0.5 | 0.72, 0.76 | 0.56, 0.57 | 0.55, 0.55 |
| 0.6 | 0.68, 0.72 | 0.52, 0.52 | 0.50, 0.50 |
| 0.7 | 0.64, 0.68 | 0.48, 0.49 | 0.46, 0.46 |
| 0.8 | 0.62, 0.65 | 0.45, 0.46 | 0.43, 0.43 |
| 0.9 | 0.60, 0.63 | 0.43, 0.44 | 0.40, 0.41 |
| 1 | 0.58, 0.61 | 0.42, 0.42 | 0.39, 0.39 |

With roll Heading at zero on all three, the yaw Heading does the work;
the pitch Heading changes nothing here (the harrier's elevator is held
past 40 percent stick, where priority fades the gyro out). Mixes of
different tenths per axis are not flown. On the plant before
w38-fuselage-side, between a twentieth and a fifth of the Extra's yaw
Heading the rock was worse than Manual's (1.03 to 1.08); on
4dc533c3b's every tenth of it is better. Heading defaults to zero, and
the tune help keeps the AR631's warning against it on the yaw axis.

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
 hercules3077 (four props as one) | 64/133 | 37/81 | 85/156
 slick2680 (petrol, its dyno curve, docs/SLICK-STAGE1.md) | 398/861 | 371/912 | 619/1115
 cap1702 | 48/84 | 26/48 | 81/148
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
## The radio's elevator to flap mix

The 3D video study (analysis/3D-VIDEO-LESSONS.md, an E-flite Night Timber
X, 03:20 to 05:20 and 15:20) flies the harrier on full up elevator with
"elevator flaps": the radio mixes the elevator stick into the flaps, and
with the mix off the wing rocks, 10 then 20 then 30 deg at about 1.5 s.
Any transmitter does this (an elevator to flap mix line), so it is a
pilot's setting on the plane's Rates screen, on the aircraft with flaps
(the Turbo Timber and its floats, the P-51): off, as every kit ships, or
25, 50, 75 or 100 percent of full flap at full up elevator, on top of the
flap switch's notch, down only (sim_wing_set_tune's ELEV_FLAP). The
servos follow it as fast as the other surfaces; only the switch's notch
is slowed. The flap to down elevator compensation stays on the notch,
as a radio's mix from the switch is, so the stick's up elevator is not
cancelled by it. Zero is bit identical to before.

`npm run harrier:flap` flies the Timber into a harrier on full up elevator
with a person-paced pilot (hover-probe.js's limits) for each mix step
(AS3X reads as Manual here because the Timber's AS3X gains land with the
controllers pull request, #871):

```
timber1500, harrier on full up elevator, person-paced pilot, last 10 s of 20
  Manual  mix   0%  bank sd 30.0 deg, worst 80.3, period 1.25 s, pitch 11.9 deg, 9.0 m/s
  Manual  mix  25%  bank sd 25.2 deg, worst 95.1, period 0.69 s, pitch 29.8 deg, 7.5 m/s
  Manual  mix  50%  bank sd 32.8 deg, worst 75.8, period 1.25 s, pitch 21.9 deg, 7.8 m/s
  Manual  mix  75%  bank sd 34.1 deg, worst 112.7, period 0.80 s, pitch 19.7 deg, 8.5 m/s
  Manual  mix 100%  bank sd 35.5 deg, worst 125.4, period 0.80 s, pitch 16.0 deg, 8.7 m/s
  AS3X    mix   0%  bank sd 30.0 deg, worst 80.3, period 1.25 s, pitch 11.9 deg, 9.0 m/s
  AS3X    mix  25%  bank sd 25.2 deg, worst 95.1, period 0.69 s, pitch 29.8 deg, 7.5 m/s
  AS3X    mix  50%  bank sd 32.8 deg, worst 75.8, period 1.25 s, pitch 21.9 deg, 7.8 m/s
  AS3X    mix  75%  bank sd 34.1 deg, worst 112.7, period 0.80 s, pitch 19.7 deg, 8.5 m/s
  AS3X    mix 100%  bank sd 35.5 deg, worst 125.4, period 0.80 s, pitch 16.0 deg, 8.7 m/s
```

What it shows, honestly: with the mix off the Timber rocks, bank sd 30
deg, worst 80, at a 1.25 s period: the video's mix-off rock (10 to 30 deg
at about 1.5 s). The mix does not calm it as the video's does: 25 percent
lowers the spread a little (sd 25) but the worst bank and the period get
worse, and more mix is worse again. The cause found: the plant lays the
flaps' lift over every strip of the span (strip_stall takes the one dcl_f
on all of them), so lowered flaps raise the tips' angle as much as the
root's and stall them together. A real flap is inboard (the Timber's spans
the inner part of each panel, the ailerons outboard), so it makes the root
stall first and keeps the tips, and the ailerons, flying: the mechanism
the mix works by. Flaps over their own strips only is a stall model change
in strip_stall, the 3D lane's code; it is proposed there, not made here.

### Flaps over their strips (2026-10-11)

Made. Each flapped table names its flaps' span, flap_eta, the inner and
outer edge over the semispan, from its derivation's drawing (Timber 0.067
to 0.430, scripts/timber-derive.js; P-51 0.079 to 0.579,
scripts/p51-derive.js; Night Timber 0.156 to 0.532,
scripts/nighttimber-derive.js). The wing's flap lift and CLmax increments
(cl_df, clmax_df) stay the whole wing's, area weighted, as Raymer's S_f/S
builds them (eq. 12.21); the stall strips now take them only where the
flaps are, scaled up by the flapped share of the area, so the strip sum is
the wing's. A strip under the flap gets its section's increment, more lift
than CLmax added, and reaches its stall sooner, as a plain flap lowers the
stall angle (DATCOM; Raymer sec. 12.6); a strip outside it stalls where it
did with the flaps up. Flaps up nothing changes. Moments only: the wing's
force is the centreline's, unchanged. `npm run flapstrip:check` (CI)
gates it per strip through `sim_wing_strips`; with the flaps spread over
the whole span again it fails (the P-51's tip stalls 1 deg sooner).

## The Extra's stall from a measured section

The owner found every firm pull stalling the Extra. Its stall was an
estimate, CL max 0.95 at the stall angle CL max over the aircraft's lift
slope, 11.6 deg, at every speed. Measured symmetric sections at these
Reynolds numbers (Timmer, NACA 0018, Wind Engineering 32(6), 2008: CL max
0.988 at 11.6 deg at 1.5e5 and 1.056 at 15.1 deg at 3e5; Sheldahl and
Klimas's 0012 and 0015 at 3.6e5 agree, 0.96 at 11.5 and 1.06 at 13.6)
stall later as the speed rises, and two things in the plant put the
Extra's stall early:

- The Reynolds number: two new table fields, stall_re, stall_clmax and
  stall_peak, take the wing's CL max (0.9 of the section's, Raymer,
  Aircraft Design, sec. 12.4) and the angle its lift peaks at (the
  section's peak plus the induced angle CL / (pi A e)) from the data,
  straight between 1.5e5 and 3e5 on the chord: 0.889 at 16.3 deg at the
  stall's speed, 0.950 at 20.1 deg at 16 m/s.
- The slope: the stall angle was CL max over cl_alpha, which is the wing
  and the tail's (Nelson eq. 2.52, as on most tables). The tail does not
  stall with the wing. cl_alpha_wing (here extra-derive's a_w, 4.390)
  sets the wing's stall angle, and the tail's share of the slope lifts on
  past it.

Both are zero on every other table, which flies as it did; the same
shortcut on every table is the next pull request's. E2, the stall speed,
is re-derived on the stall's own CL max, 0.898 at 1.7e5: 8.54 m/s, band
8.03 to 9.73 (was 8.31, 7.81 to 9.47, on the estimated 0.95); the plant
reads 8.75. A half stick pull at 16 m/s now breaks at 15.2 deg (13.8
before).

## The prop's torque, from the drive

The propulsion lane's items 2 and 4 (w35-prop-torque), for the batch after
2026-10-11. One branch because they cannot be separated: both need the
electric ESC at zero throttle to free wheel, which escstop's own source
says and its spool did not do (at zero duty prop_spool's K_M term still
braked the rotor to a stop in a few tenths of a second, a regenerative
brake the Avian's "Motor will free wheel when throttle position is zero"
does not have).

**What was there.** The airframe's roll against the prop was torque_arm
times the thrust: the torque fell with the thrust, to nothing at the
pitch speed; the swirl was the same number; the gyroscope took the
reported motor speed, zero the moment a motor was cut though its rotor
coasts; a throttle punch spun the rotor up and put none of its angular
momentum into the airframe.

**What the plant does now.**

- The airframe meets what the drive puts on it through the motor's mount,
  Newton's third law: the prop's torque and the rotor's own acceleration,
  J w_f n'. A rotor spinning up takes its angular momentum out of the
  airframe's; a braked one gives it back. A motor that is not driving
  (zero duty on a free wheeling ESC, folded, cut, flat, dead) puts nothing
  on the airframe.
- The prop's torque is APC's at the step's advance ratio: the table's
  torque_curve since "The prop's curves" below (it was cp_of_ct, one
  11 x 7E table through the thrust share). Past APC's last row it goes on
  straight with the thrust at the last three rows' slope (the cp:tail
  method; `npm run cp:tail` prints it for eight props, 1.38 to 1.83), to
  zero past the zero thrust, and beyond it the air drives the prop.
  FITTED: the straight line past the data's end.
- The swirl is the prop's torque, the angular momentum the wash carries.
- The gyroscope takes the rotor's speed, so a cut motor's coasting prop
  still precesses.
- A free rotor (an electric ESC at zero duty) has the air and its motor's
  friction on it: it windmills where they balance, and drags there. The
  friction is the no load current's torque, I0 Kt (Drela): the Extra's
  E-flite Power 32 draws 2.4 A at Kt 0.0105 N m/A, 0.0387 of the prop's
  static torque (PROP_FRICTION, FITTED for every electric rotor: no other
  table has its motor's I0). It stops a coasting prop on the ground in
  seconds.
- A driven rotor keeps the static load, so it holds n = d and the trims
  stay the tables': the motor's unloading at speed (a few percent more
  rpm in cruise) is left out, as is a driven prop's negative thrust past
  its pitch speed (still held at zero).
- The Bramor's prop folds (docs/BRAMOR-STAGE1.md: back along the tail cone
  when the motor stops): fold_duty 0.05, the Radian's, FITTED.

**Measured against its sources** (the Extra):

- Punch from the hover throttle to full, hanging: the roll acceleration
  jumps -39.9 rad/s^2 in the first millisecond (the batch's -3.0, the
  aero alone); J w_f n' / Ixx from the spool's own equation is -38.6, 3
  percent.
- Power off glide at 10.4 m/s, 3 s after the chop, before the friction:
  the prop windmilled at 3,648 rpm against the Cp tail's 3,690, its drag
  0.084 of the dynamic pressure on its disc against Hoerner's freely
  windmilling prop's about a tenth (Fluid Dynamic Drag, ch. 13, docs/
  GLIDER-STAGE1.md).
- The P-51's windmilling prop's gyroscope, p51 P19g: 0.45286 N m per rad/s
  of pitch rate at 3,696 rpm against J omega's 0.45285.

**The gates, decided by the lead's rule** (physics follows reality; a
gate that contradicts reality is re-derived to it, the reasoning written):

- **The take offs** (bombshell S15, the bombshell, slowstick and extra
  stab rolls): sticks centred a tractor swings left, and the Bombshell
  ground loops, as the handbook says a tractor will ("an abrupt
  application of power may cause the airplane to yaw sharply to the left
  because of the torque effects", FAA-H-8083-3C ch. 6,
  https://www.faasafety.gov/files/events/SO/SO15/2022/SO15112841/Chapter6TakeoffsAndDepartureClimbs.pdf).
  The handbook's take off (tests/lib/wingpilot.js takeoffRoll): the
  throttle advanced "smoothly and continuously", over 1 s (FITTED), the
  line on the rudder, the wings on the ailerons where there are any. The
  sticks centred runs check the swing left; the handbook's runs check the
  take off, the track, the wings, and that the rudder it takes is short
  of full: peak 0.06 to 0.11 of the stick on the Extra, 0.29 on the
  Bombshell, 0.19 to 0.27 on the Slow Stick. A full throttle punch from
  standing, with the wings held on the ailerons, still banks the Extra 5.3
  deg on its gear: the rotor's angular momentum, 0.28 N m s, taken out of
  the airframe in a tenth of a second.
- **S6, the self level** (bombshell, slowstick): the four state lateral
  model now has the prop's torque and swirl at cruise as a constant input
  (scripts/lib/wash.js propMoments): derived 1.0 deg at 6 s on the
  Bombshell (7.8 without; band 0 to 5.3, its old width in degrees) and
  7.9 on the Slow Stick (12.9; band 3.7 to 12.2, its old proportion).
- **stab:chop and stab:glide**: the glide derivation takes the windmill's
  drag (with the friction); eleven stab_pitch_down re-derived (the Extra
  8.72 to 14.73 deg).
- **P19**: the XP-51's full scale band holds the aero part
  (sim_wing_set_gyro, a measurement switch the shell never calls, takes
  the gyroscope out): pb/2V 0.088, bank 27.0. P19g holds the gyroscope's
  own term to J omega q. P19w holds the whole pull to a drop at least the
  XP-51's floor: 0.164, 59 deg.

**Still failing, diagnosed, a decision each:**

 Gate | Batch to branch | Cause
 --- | --- | ---
 uglystik U9, the loop | heading 6.4 to 24.0 deg (15), wings 4.1 to 15.5 (15); height, length, speed and exit in band | the APC torque at the loop's speed, about twice the thrust law's; the band's lateral part is a premise of a longitudinal derivation with no prop in it, flown with the ailerons and rudder centred
 slowstick S9b, full up power on | yaw 18.6 to 20.2 deg/s (20), bank 10.4 to 11.5 (15) | the APC torque's swirl at the mush; 20 deg/s is the "not a spin" line, a spin at this size turns over 90
 p51:stab, Stabilised on full flaps | bank 1.7 to 3.4 deg (3) | the stronger torque at flap speed against a self level loop with no integral: its steady bank error doubles
 bombshell:stab, Stabilised level, straight | 4.9 to 10.2 m off the line in 10 s (10) | the same: the bank it holds goes from -0.8 to -1.7 deg, and that bank's turn is the drift; 3 deg, the check's own band, would be 25 m
 p51 P18, the full flap landing | hull contact 0 to 1 | the windmill's drag in the flare: it touches at 8.48 m/s (7.78) and bounces, the tail strikes at 12.6 deg 0.17 s after the touch; the scripted flare was tuned to a braked prop

Every "unmoved" hash list, the AS3X rows (15 tables), the power
estimates, the audio flights, replaylib's traces and simmod's transcript
are re-derived on the branch.
## The Slick's DA-120

The Slick 580 (its own lane, w35-slick580) flies on a Desert Aircraft
DA-120, a 120 cc petrol twin, on a 28 x 10. The plant takes an engine by
the glow method the Ugly Stik, Tiger Moth, Kadet and Bombshell already
use (docs/POWER-STAGE1.md, "A prop spins up" above): an idle the engine
never stops under, a rotor whose inertia the engine's torque spins up,
J w_f n' = Q_f (d^2 - n^2), with that torque flat in speed, and a tank.
`npm run da120:derive` (scripts/da120-derive.js) derives every number the
Slick's table takes, with its source, and prints the table's lines.
FW_SLICK2680 takes this section's throttle curve method, rotor and fuel
figure, but a different full throttle point: Falcon's own test chart's
measured 6,550 rpm and 31.0 kg for the DA-120 on its 28 x 10, against
HFE's simulated thrust and a forum tachometer here, and the curve scaled
to it; docs/SLICK-STAGE1.md and scripts/slick-derive.js have it.

**The full throttle point, measured.** Falcon Propeller's own test chart
(its DA 120CC column,
https://www.falconpropellers.com/wp-content/uploads/2020/04/Falcon-Propeller-Test-Chart.pdf)
measures the DA-120 on Falcon's 28 x 10 at **6,550 rpm and 31.0 kg,
304.1 N** of static thrust; the Slick lane found it (docs/SLICK-STAGE1.md)
and measured beats derived, so the derivation takes it. The figures it
replaced, printed against it: HFE's DA120 data sheet's simulated 28x10,
"6900" rpm and "73.2" lb (293.4 N taken to 6,550 by the speed squared),
and a forum's tachometered 6,850 rpm (rc-network.de thread 388921). The
torque from the thrust by APC's 22x8 static Ct and Cp between its 6,000
and 7,000 rpm rows (the Slick table's transfer, pitch over diameter 0.364
against 0.357; FITTED, APC publishes no 28 x 10): Q = T D Cp / (2 pi Ct)
= **9.38 N m**, 6.43 kW; APC's 17 x 6E, the nearest pitch over diameter
at the same tip speed, gives 9.53, 1.6 percent more. HFE's dyno is a fuel
injected engine and reads 10.07 N m at 6,550 rpm: every dyno row below is
scaled by 0.931 so full throttle settles on the measured point, inside
the dyno's own +/-10 percent.

**The torque is flat, which the glow method assumes.** HFE's full throttle
torque, read off figure 3: 9.3 N m at 3,500 rpm, 9.6 at 4,000, 10.3 at
5,000, 10.1 at 6,500, 9.8 at 7,000; within 6 percent of 9.9 over the
range a flown engine turns in. At part throttle, 50 percent and over is
flat to 10 percent; at 20 to 40 percent the torque falls with the speed,
which makes the real engine settle a little faster there than the plant's.

**The throttle is not a straight line.** The glow method runs the rpm
straight from the idle to full with the stick. A butterfly opens most of
the speed in the first half of its travel: HFE's figure 3 is the torque
at 20, 30, ... 100 percent throttle across 2,000 to 8,000 rpm, measured
on a Magtrol eddy current dyno, and each throttle settles where its torque
meets the prop's, Q_f (rpm / 6,550)^2, its dyno scaled as above. The new table field
`throttle_rpm` takes that curve, the speed over full at the stick's 0,
0.1, ... 1 (zero on every other table, which keeps the straight line):

 Stick | 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1
 --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
 Dyno against the prop | 0.199 | 0.318 | 0.438 | 0.531 | 0.643 | 0.765 | 0.873 | 0.913 | 0.966 | 0.980 | 1
 The straight line | 0.199 | 0.279 | 0.359 | 0.439 | 0.519 | 0.599 | 0.679 | 0.760 | 0.840 | 0.920 | 1

The stick's 0 is the idle, DA's 1,300 rpm (desertaircraft.com, "1,300 to
6,900"; DA Australia gives 1,000). FITTED, said where it is: HFE ran
nothing under 2,000 rpm, so the stick's tenth is half way from the idle
to the 20 percent crossing; and where the dyno's +/-10 percent puts the
90 percent crossing under the 80 percent's, the curve is held level.
Half stick is 5,010 rpm, not the straight line's 3,930.

**How fast it answers.** The rotor: 0.7 of the blades' rod inertia (the
fleet's convention, PR 3) on the 28 x 10's listed masses (Biela 322 g,
Mejzlik 288 and 276 g) and 0.0006 kg m^2 for the crank, the ignition's
rotor and the 5 in spinner, ESTIMATED: **0.00931 kg m^2**, J w_f / Q_f =
0.681 s. The plant's spool with these, measured in a proof build that
gave the Ugly Stik's table the DA-120's lines (not committed), against
the derivation's own integration of the same equation, 63 and 90 percent
of the thrust's change, ms:

 Step | plant | derivation
 --- | --- | ---
 idle to full | 619/1115 | 619/1116
 half to full | 398/861 | 398/862
 full to half | 371/912 | 371/913
 idle to half | 768/1414 | 768/1415

and its steady speed at the stick: 0.1985 at 0, 0.4379 at 0.2, 0.5306 at
0.3, 0.7653 at 0.5, 0.9133 at 0.7, 1 at full, the curve's own. A
two stroke burns on the revolution after its charge is drawn, one
revolution, 46 ms at the idle and 9 ms at full: an order under the
rotor's time, and no source gives its size for this engine, so it is left
out, as for the glow engines.

**The tank.** Extreme Flight's build guide: "FlowMaster 34 oz.", 1,005 cc.
HFE's average BSFC, 575 g/kWh, at the 6.43 kW, on petrol and 40:1 oil at
0.74 kg/l (ESTIMATED): 83.3 cc/min at full, 12.1 minutes. An owner's
report has "most of a 32oz tank in 10 minutes" flown (giantscalenews.com
thread 8533). The flow runs straight from the idle's share of it in the
duty, which with throttle_rpm is the speed's share, not the stick's (half
stick burns at 0.765 of the way, where the straight line's 0.599 was),
and leans at the end as the Bombshell's does, the glow method. The table
sets throttle_idle to throttle_rpm's first entry: the tank, the pack's
drain and a turbine's idle all key off throttle_idle, which the curve
does not replace.

**For the Slick's table, not here.** Its data sheet's "Right thrust: 3
deg" (Extreme Flight, DATASHEET_105SLICK580v2.pdf) is 15.9 N sideways on
304 N, 9.7 N m of right yaw at full static ahead of its CG (the Slick
lane's figure). This plant has the thrust line's height (thrust_z) but no
angle; the field, `thrust_yaw`, is on the propulsion lane's next batch
branch, and the Slick and CAP lanes set it when it lands.

**spool:derive held the aircraft still and let it climb.** Its harness put
the aircraft back in place each step with sim_set_pose, which keeps the
velocity, so an aircraft whose thrust passes its weight climbed away on
its own prop and the thrust it read fell with the airspeed it gained, not
the rotor's speed; and its 1 s after the step was shorter than the glow
engines take to settle. It now zeroes the velocity with sim_rest each
step and gives the rotor 8 s before the step and 4 s after. Its numbers
(the table under "A prop spins up" was taken with the old harness):

 Aircraft | half to full | full to half | rest (idle) to full
 --- | --- | --- | ---
 sky1800 | 87/180 | 61/153 | 118/214
 cub1400 | 118/242 | 83/207 | 160/289
 radian2000 | 128/261 | 90/226 | 173/312
 bramor2300 | 60/125 | 42/105 | 81/148
 slowstick1180 | 100/207 | 70/174 | 135/245
 timber1500 | 128/264 | 91/227 | 174/315
 bombshell1118 (glow) | 348/740 | 317/798 | 438/846
 kadet1981 (glow) | 500/1038 | 441/1142 | 676/1237
 uglystik1567 (glow) | 333/686 | 291/763 | 463/830
 tigermoth1803 (glow) | 333/686 | 291/763 | 463/830
 extra3d1308 | 73/145 | 52/131 | 99/176
 nighttimber1200 | 86/176 | 61/153 | 117/211
 hercules3077 (four props as one) | 64/132 | 45/111 | 86/156
 p51d1450 | 275/562 | 196/491 | 375/675
 f16878 (its fan_tau) | 193/328 | 147/277 | 414/555
 zagi1219 | 47/97 | 34/84 | 64/116
 striker2500 (petrol) | 357/741 | 316/817 | 480/881

Nothing in the plant moved for it; only the measurement did.
## The swirl over the wing's root

SWIRL_KEEP took the wing root's share of a tractor's swirl as a fixed
(1 - K) of the prop's torque, 0.26 at K = 0.74, at every speed, power and
angle: a stator with no geometry. The root is a wing in the wash, and how
much of the swirl it turns back depends on how much wing is in the wash
outside the fuselage and on the angle that wing already meets.

**The model** (plant_wing.c root_swirl, the table's `slip_root` and
`slip_root_eta`). The wash turns as a solid body at Omega, Q = mdot Omega
rw² / 2 (momentum theory, as the fin's swirl already took it), so at y
out along the span it blows across the chord at Omega y, at any height:
up on the left of a prop turning clockwise from behind, down on the
right. Each side's root, from the fuselage's side out to where the wing
leaves the contracted wash, sqrt(rw² - h²) with h the wing's distance
from the thrust line, meets that on top of the angle the whole stream
crosses it at, the free stream's crossflow over the wash's axial speed
u + 2 v_i. Its normal force is the wing's slope saturating on a flat
plate's 1.17 (Hoerner), plate_ratio, the form the tail already has in the
wash. The roll the prop's way is the two sides' difference, so:

- at small angles each side is linear and the difference is the strip
  theory stator, which grows with the span of wing in the wash: at the
  hover the wash has contracted to 0.117 m and only 0.075 to 0.093 m of
  each side is in it; in level flight at 15 m/s it is 0.075 to 0.144 m;
- near the stall the upwash side saturates first and the root gives back
  less of the swirl: what the left wing cannot lift is the shortfall,
  and the airframe meets more of the torque, which is the Extra's
  left/right asymmetry at low speed and high power.

The fin meets what the root leaves, 1 - root / Q, so the angular momentum
the prop puts in the wash is still accounted once.

**Its one fitted number.** No measurement gives a wing's lift in a stream
as narrow as a model prop's wash (the jet's boundary takes much of it;
Veldhuis, Propeller Wing Aerodynamic Interference, TU Delft 2005, finds
the recovery "significant" without a share a plant can take).
`slip_root_eta`, the share of the strip lift the root makes, is FITTED so
that at the hover the root gives back exactly what SWIRL_KEEP's Selig
anchor gave it, (1 - 0.74) of the torque (Selig, AIAA 2010-7938: the
swirl's net roll on an aerobatic aircraft in a hover is near 40 percent
of the torque): 0.414 (`npm run extra:derive`). Everywhere else geometry
and the stream decide it. The Extra's geometry: the fuselage's side
0.075 m out (E-flite's top view, src/render/extracraft.js), the wing
0.070 m under the thrust line (its front photograph), the chord there
0.347 m.

**Only the Extra has it.** Every other tractor keeps SWIRL_KEEP's fixed
share, bit for bit: their wing heights and fuselage widths at the root are
not measured yet, and a high wing (the Cub's, the Timber's, the Kadet's)
sits at the top of the wash or above it, where the fuselage, not the wing,
is the stator, which this form does not cover.

**Measured** (scripts/extra-derive.js for the root's share; the harrier
is E11's pilot, the last 5 s of 20, Manual):

 Condition | root's share of the torque, before | after
 --- | --- | ---
 Hover, hanging still | 0.260 | 0.260 (Selig's, by construction)
 Level, 15 m/s | 0.260 | 0.522
 Harrier 35, 40, 45 deg | 0.260 | 0.199, 0.195, 0.196

 Harrier, E11's pilot | right aileron to hold the wings, before | after
 --- | --- | ---
 30 deg | 0.116 | 0.128
 40 deg | 0.231 | 0.251
 50 deg | 0.377 | 0.401

In level flight the root takes twice the torque it did, so the fin meets
0.48 of the swirl (was 0.74); in the harrier the left root saturates and the pilot holds 8 to 9
percent more right aileron. Every E gate holds; E14's take off, 3.98 m to
3.93 m, 0.08 to 0.07 m off the line.

**Changed with it.** The Extra's recorded flight hash, 8fb879543a8cef72
on batch/2026-10-11 at 6476da48e to e68b6bd6c7f97153, re-pinned in
nighttimber N15 and hercules H7 (its recording is kept: it flies the same
sticks). The AS3X rows re-derived by `npm run as3x:derive`, whose top
speed the plant now flies at 23.86 m/s (24.08): as3x_k 0.0518, 0.2393,
0.3643; as3x_kh 0.9246, 4.2715, 6.5027; as3x_rate 6.529, -4.142, -4.763.

**Not modelled, said plainly.** The root band's own extra lift in the
wash (the symmetric part, the wing's lift with power) and its damping of
a roll rate in the wash: both are real and both are left as they were,
the plant's wing still sees only the free stream. The section's peak and
drop past CL max in the wash: the plate's saturation has no peak, so the
asymmetry is the milder of the two; the free stream strips keep their
measured stall.

### Past the stall: the finite wing's broadside force and Viterna's B2 (2026-10-11)

The plant's post stall curve is Viterna's extrapolation (CL = CDmax sin
cos + A2 cos^2 / sin, CD = CDmax sin^2 + B2 cos), and it took CDmax, the
normal force broadside, as 2.0, the two dimensional plate's, for every
wing. A finite wing's is smaller: CDmax = 1.11 + 0.018 AR (AR under 50),
Viterna and Janetzke, NASA TM-82944 eq. 12
(https://ntrs.nasa.gov/citations/19820025954), plate_cn in plant_wing.c,
1.19 to 1.27 across the fleet. Measured, Ostowari and Naik's NACA 4418
reads 2.06 at infinite AR and 1.32 at AR 6 (SERI/STR-217-2559, sec. 4.6),
and Sheldahl and Klimas' NACA 0012 1.8 at 90 deg in two dimensions
(SAND80-2114, table 2), so the formula sits 8 percent under the one
finite measurement. The plant also lacked Viterna's drag continuity term,
B2 = (CD at the stall - CDmax sin^2 a_s) / cos a_s (TM-82944 eqs. 15, 17):
without it the plate alone fell short of the stalled section's drag
between the stall and about 30 deg (NACA 0012 at 20 deg measures 0.30;
the old plate gave 0.21). B2 is in the wing's drag, the strips' drag
excess, the biplane cell's and the stalled normal force's pressure share.
The shape past the stall is still Viterna's; per section 0 to 180 deg
tables (SAND80-2114, NACA 2415) wait for knife edge and inverted flight.

What moved, re-derived on it rather than widened:
- P-51 P8 (NACA's XP-51 wing drop) reads 30.5 deg, from 28.2.
- Extra E11's harrier at 40 deg: extra-derive.js on the finite wing,
  7.76 m/s at 0.615 throttle (was 6.25 at 0.603 on the plate), band 20
  percent and 15 percent either way as before; the plant flies 7.79. The
  only harrier speed in the 3D video is the Timber's, judged not measured,
  2 to 4 m/s; no Extra figure exists.
- Zagi Z9's mush sink band, which had no numeric source: zagi-derive.js
  brackets it between the wing attached at its CL max (0.61 m/s) and a
  fully separated plate at 30 deg on Ostowari and Naik's AR 6 1.32 (4.25
  m/s); the plant mushes at 1.86. The balloon and the break within 3 s
  are the CRRC's and hold (2.36 s).
- tuning:check U3 now reads the angle full up elevator holds, the
  pitching moment at cruise speed with the body held still, rather than a
  flight's transient: the peak angle in a fixed first second read a nose
  heavy glider still departing as higher than stock, and the time to the
  first stall strip (tried next) tied on the CAP, whose forward CG
  lengthens a 50 deg elevator's arm. Aft is held highest and nose heavy
  lowest on every aircraft (FAA, Effects of Adverse Balance).

A BIG FAILURE this does not fix, measured: the harrier. The video's
aircraft is the Night Timber X (3D-VIDEO-LESSONS.md section 0; the Turbo
Timber had stood in for it). harrier-flap-probe.js on the Night Timber,
full up held: bank sd 63 to 72 deg, the height lost with the mix at 50
percent or more, against the video's nose up 40 to 45 deg at a crawl with
the elevator flaps mix calming it; on the Turbo Timber pitch 7 to 26 deg
at 8 to 11.6 m/s. harrier-probe.js (below) is the measure now.

### The tail's own stall and moment (2026-10-11)

With the wing's own slope (cl_alpha_wing, #935) the tail's share of the
lift slope, CLa - a_w, rode on the wing as (CLa - a_w) sin a cos a: it
never stalled and carried no moment, while the pitching moment on a
hi_alpha table already took the tail on its own angle, saturating on its
plate (vh x_t plate_ratio(x_t), docs/EXTRA-STAGE1.md). A table with both
now takes the tail's lift on that same angle, x_t = a_t (sin a - de/da
CL_w / a_w - a_0 (1 - de/da)) plus the elevator's angle, times
(CLa - a_w) / (a_t (1 - de/da)), which is S_t / S eta (Nelson eq. 2.52):
one surface's lift and moment, stalling together. At small angles it is
the linear plant's (CLa - a_w) alpha + cl_de delta_e exactly (the Extra:
0.314 x 0.8666 / 0.770 = 0.353 against cl_de 0.3537). The downwash at the
tail now goes with the wing's lift alone; before, the elevator's own lift
fed the downwash on its own tail, and the Extra's pitch control power
reads 330 rad/s^2 per rad against 301 (as3x:derive re-derives its gains).
On a table without hi_alpha the sin cos share stands until that table
gets the tail's own angle (the fleet's wing slope work).

### The stall angle on the wing's own slope, fleet wide (2026-10-11)

#935 put the Extra's stall angle on the wing's own lift slope, a_w, with
the tail's share of CLa lifting on past it. Fourteen tailed tables now
carry it, each a_w its derivation's (cl_alpha_wing, cited on the line):
the Sky, Cub (and floats), Radian, Slow Stick, Timber (and floats),
Bombshell, Kadet, F-16, Ugly Stik, NRJ, P-51 and Night Timber. Left out:
the Hercules (another lane's; its derivation prints no a_w), the Tiger
Moth (a biplane, bip_r) and the flying wings (no tail).

The rule, written once for every stall gate: alphaStall is CLmax over
a_w, and the plant's stall CL is the wing's CLmax plus the tail's lift at
that angle, in the form that table's tail has: (CLa - a_w) sin a cos a
without hi_alpha, and on the tail's own angle with it (the Extra, the
Night Timber; the tail's own stall above). Each formula stall band moves
by sqrt(CLw / (CLw + tail)), checked against the plant before and after
to within 0.7 percent; the Night Timber's N2b, the video's own 6.7 to
8.0 m/s, is not rescaled and reads 7.30. The Extra's E2 takes its
Reynolds CLmax, 0.898. The Bombshell's U2 margin is re-derived in
bombshell-derive.js (0.2881: over U2's span the lift slope is a_w plus
the tail's sin cos share, a shade under CLa).

Measured on it: the P-51's P8 wing drop 24.3 deg (NACA's XP-51; 28.2
before this chain, 18.9 with the slope on the old plate). Still a gap:
without hi_alpha a tail's lift has no stall and no moment of its own;
the fleet's tail angle goes with the knife edge work, whose fin half
needs its own sources. Not started: the Reynolds CLmax per aircraft.


## Right thrust

The Slick's data sheet has "Right thrust: 3 deg", the CAP 580's 2.5: the
engine mounted turned right of the axis, the aerobat's built in answer to
its torque, swirl and P factor. The table field `thrust_yaw` (rad, right
positive) turns the thrust line: its axial part along body x, its
sideways part at the disc, prop_x ahead of the CG, so it yaws the nose
right. The line's height over the CG was already there, `thrust_z`. Zero
on every table, which keeps the thrust on the axis to the bit; the Slick
and CAP lanes set it with prop_x.

Measured in a proof build (the Extra given 3 deg, not committed), held
still at full throttle: the axial force 37.370 N against T cos 3 deg's
37.371, the side force moved by -1.9585 N against -T sin 3 deg's -1.9585,
the yaw moment by -0.59146 N m against -prop_x T sin 3 deg's -0.59147.

## The electric throttle

The plant took an electric prop's speed as the stick's share exactly, n =
d, by giving the motor's drive a d^2 it does not have. A motor on a PWM
ESC (BLHeli and AM32 run the duty straight with the stick) has Drela's
torque ("First-Order DC Electric Motor Model", MIT 16.50, 2007), straight
in the duty and the speed, which with the plant's own full point (0.85 of
no load at full duty) is Q_f (d - 0.85 n) / 0.15, so at rest

  n^2 + 5.667 n = 6.667 d

full at full, and over its share of the stick below: measured on the
Extra held still, 0.437 at 0.4, 0.537 at 0.5, 0.634 at 0.6, 0.728 at 0.7,
0.819 at 0.8 (the law's 0.437, 0.537, 0.635, 0.730, 0.822; the pack's sag
the rest), where the plant held 0.400 ... 0.797. T-Motor's measured AM670
on its 18 x 8 (the CAP lane's) sits higher still, 0.50, 0.60, 0.70, 0.79
and 0.88: a table with its own motor's measured curve sets throttle_rpm,
and the plant takes the duty that settles on it, (n^2 + 5.667 n) / 6.667.

**Which aircraft change**: every electric prop, the 1000 mm wing, the
Skyhunter, the Cub and the Cub on floats, the Radian, the Bramor, the Slow
Stick, the Timber and the Timber on floats, the P-51, the Zagi, the Extra,
the Night Timber and the Hercules. Not the F-16's fan (its own spool), the
glow and petrol engines, or the gliders.

**Re-derived with it**, each in its old proportion: the Extra's E1 (18.77
m/s at 75 percent, was 18.11), E6 (the hover's 0.5904 duty for the prop's
0.6255, band 0.561 to 0.620), E11 and E12's throttles (0.568, 0.749); the
Night Timber's N6 (0.7776, band 0.739 to 0.817); every electric table's
stab_trim_throttle (stab:glide; the Extra 0.624 to 0.589); the Extra's
taxi duty for the Cub's 1.65 N (0.184, was 0.21), with its heading now
summed through half a circle; the Timber's T13 at the duty that turns the
prop at 0.3 of full, as the gate was written for (0.2685).

**The lead's decisions on what was left, 2026-10-11:**

- **Stabilised's steady bank** (bombshell:stab drift, p51:stab on full
  flaps): Spektrum publishes nothing of SAFE's law; ArduPilot, the
  controller the plant's Stabilised is modelled on (stab_pitch_down is its
  adjust_nav_pitch_throttle), trims a steady roll error with an
  integrator (https://ardupilot.org/plane/docs/roll-pitch-controller-tuning.html:
  "slowly trim the aileron demand to remove the steady error"; RLL2SRV_I
  0.05, TCONST 0.5 s from AP_RollController.cpp, IMAX a third of the
  travel), held while the pilot's roll stick is in (ArduPlane
  Attitude.cpp stabilize_roll). Added: the drift 10.2 to 6.4 m, the flaps'
  bank 3.4 to 0.9 deg.
- **U9, the loop**: flown with the wings and the nose held in the loop's
  plane (wingpilot.js loopHold, the take offs' pilot laws); in band,
  heading within 8.6 deg, wings within 2.7.
- **S9's 20 deg/s** had no source; re-derived from a spin's definition,
  autorotation: inside the bank limit the aircraft only turns, at
  g tan(bank) / V, so the limit is that turn at the mush's speed (31 to
  32 deg/s on the Slow Stick); the Bombshell, Kadet, Ugly Stik, Tiger
  Moth and F-16 take the same limit (tests/lib/wingpilot.js
  turnYawLimitDeg), so no unsourced 20 deg/s is left.
- **P18, the full flap landing**: the scripted pilot pulled full up for
  1.5 s once a wheel touched, and with the windmill's drag the P-51
  touched on its mains, skipped, and the tail met the grass 0.31 s later.
  Now flown as the handbook's three point landing (FAA-H-8083-3C ch. 14,
  https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/15_afh_ch14.pdf):
  "a gentle increase in AOA to maintain flight while slowing" to the three
  point attitude (P13's rest), a main wheel first a skip "easily managed
  by re-flaring", and "once the tailwheel makes contact, the elevator
  control should be eased fully back". Touched at 8.19 m/s, no hull or
  prop, at rest on three points; the bands as they were.
- **P19 on the law**: the first second's bank followed the rotor's speed
  at the chop from cruise (30.9, 24.9, 17.2, 14.6 deg from duty 0.76 to
  0.82). Now entered as the XP-51's was, a gliding stall: the throttle
  closed and the glide settled at 15.6 m/s on the elevator with the wings
  held, 8 s, the prop at its windmill, then the controls fixed and the
  elevator run from the glide's to full. Aero part pb/2V 0.0994, bank
  36.4 (XP-51 0.079, 39); with the gyroscope 0.0905, 30.8.
- **power:check P2's flat out premise** ("even flat out the pack outlasts
  the maker's timer") read a mixed throttle timer as a full throttle
  endurance. Re-derived for the timer kind: cruise outlasts the timer,
  and flat out lasts at least the capacity drawn to LOW BATTERY over the
  plant's static full throttle current, which no flight at full throttle
  exceeds as the prop unloads. The Timber on floats: 90.5 percent of its
  3200 mAh to LOW BATTERY over 43.9 A static (the review's bench figure,
  44 A), at least 4.0 min; it flies 6.8. The Cub 4.5 (9.1), the Timber
  4.0 (7.8), the Extra 1.9 (4.6), the Night Timber 3.3 (10.0). The share
  drawn by LOW BATTERY, 90 to 94 percent, is the plant's LiPo curve and
  the OSD's 3.5 V a cell. T-Motor's AM670 bench (the CAP lane's) holds
  the plant's current form, power as the speed cubed over the loaded
  voltage, within 7 percent from 40 to 100 percent throttle.

### Lateral control past the stall, measured (2026-10-11)

What a 3D harrier is flown with, from measured data, on every aircraft:

- **Ailerons in separated flow.** NACA TR 419 (Weick and Wenzinger,
  1932), a Clark Y wing of aspect ratio 6 with 25 percent chord ailerons:
  the rolling moment past the CL max keeps 0.40 of its attached value 4
  deg past, 0.10 at 14 and 0.18 at 24 (table II, the mean of 20, 30 and
  40 deg of aileron), and never reverses. Every aircraft's ailerons now
  take that share on the wing's angle past its own stall; before, only
  the Zagi, Extra and Night Timber modelled any loss, and the Cub,
  Skyhunter and Tiger Moth kept their whole aileron through the stall.
  The same share scales the aileron's shift of its stall strips, which
  removed a reversal the strips made at 14 deg past (the Night Timber
  -0.42) and keeps E5's roll runaway guard. The full size GA airplane
  keeps more (NASA TP-2011 fig. 56: 0.72, 0.53, 0.42, 0.28 at 5 to 25
  past, Re 2.5e6); at our Reynolds numbers TR 419 (6.1e5) is the nearer.
- **Sideslip past the stall, per planform** (cl_beta_wing, cl_beta_fin,
  cn_beta_fin from each derivation): the wing's dihedral and wing
  position share fades over 5 deg past the stall (TP-2011 fig. 51; its
  model CR-2971 fig. 42); the separated wing rolls away from the slip on
  its own beyond a dead zone, about 0.003 per deg (CR-2971; TR 379 figs.
  28 and 29; TR 548 fig. 7), the 4 deg dead zone FITTED from the 3 to 6
  the data put it at; the fin's shares and the rudder take TP-2011's
  wake decay (fig. 55a: 0.63, 0.46, 0.38, 0.23, 0.08 at 5 to 25 deg
  past), measured on a low tail under the rudder, which the Extra's and
  the Night Timber's are (EFL115500 manual p. 5); a T-tail keeps its
  rudder to 40 deg (CR-3248) and would need its own curve. A linear
  sideslip term from TR 419's 20 deg yaw was tried and dropped: no data
  at small yaw supported it, and it killed the P-51's measured wing drop.
- **Falling flat on its side** (2026-10-12, the owner: "it cant just fall
  all the way flat"). Dropped at no airspeed banked 90 deg, the Extra and
  the CAP fell to the ground on their sides with the nose level, 93 deg
  between the nose and the path, in Manual and in AS3X, on #970 and on
  the batch after it. Three things, all in plant_wing.c:
  the fin's wake loss above took the fin's linear share off a fin already
  saturated on its plate (hi_alpha), 0.2832 x 0.92 off a fin carrying
  0.2832 x 0.31 at 90 deg of sideslip, so the fin pushed the wrong way;
  it now takes its share of the fin as it stands. The wake loss was
  judged on an "alpha" of 180 deg from a chordwise speed of 0.5 m/s with
  the flow along the span, where no wake reaches the fin; it now goes
  with the wing station the stream carries to the fin, l tan(beta) to
  windward (fin_in_wake, ESTIMATED geometry, whole inside the measured
  range). And the stability axis turn reversed the sideslip's own
  moments whenever the flow came from behind, so a fall a little tail
  first turned the nose up away from it and held the aircraft at the
  Vxz 0.5 m/s guard; those moments now turn at |cos_b|.
  `npm run flat-fall:check` drops the Extra, CAP, Slick, Cub, Timber,
  Night Timber and P-51 level and on their sides, Manual and AS3X, and
  holds each to its own one degree of freedom swing
  (tests/flatfall-thresholds.json).

- **Per table, by data presence.** Each table may give its own measured
  keep curves (ail_keep, fin_keep, at 0, 4, 10, 15, 20, 25 and 35 deg past
  its stall); without them the defaults above apply. A biplane's ailerons
  judge the stall on the wing they sit on.
- **The F-16** (docs/F16-STAGE1.md, "Past the stall"): NASA TP-1538's
  measured lateral derivatives against alpha, as ratios to their own value
  at 0 deg (hi_lat, npm run f16:derive-hilat), the strips' stall moments
  off. The first try anchored the ratios at 20 deg, where the table's
  stability axis Cl beta is half the plant's, and departed S9; anchored at
  0 it holds the mush. S9 is entered from the normal approach speed
  (FAA-H-8083-3C ch. 5); full up from 25.7 m/s overshot to 44 deg and the
  fan's precession tripped the spin check there. The inertias stay
  ESTIMATED (a parts build up gives Iz/Ix 8.9 against 5.7).
- **The Tiger Moth** (ESTIMATE, ~/Desktop/fdfpv-loop/research/TIGERMOTH-HIGH-ALPHA.md):
  its sideslip split from tigermoth-derive; the fin kept past the stall
  from the NY-1's spinning balance (NACA TR 456) and the two wings' wake
  geometry {1.0, 0.84, 0.74, 0.60, 0.31, 0.17, 0.10}; the bottom wing's
  ailerons on TR 419's curve shifted 2.5 deg; and the bottom wing
  stalling 2.5 deg later than potential flow puts it (bip_dstall), from
  NACA TN 310's 5 to 6 deg against bip_r's 3. T8b is judged on the 1938
  text's wing drop and recovery, not a held wing.
- **The CAP 580 and the Slick 580** (their own branches) match the Extra's
  measured layout, a stabiliser on the fuselage at the thrust line with
  the rudder over it and running under the fuselage (CAP580-STAGE1.md,
  IMG_7289: 0.277 m over, 0.075 under; slick-derive.js's side view: the
  stabiliser 0.01 m over the thrust line, the rudder 0.08 m under it):
  they take the defaults once their derivations print the shares.

The Extra's E11 harrier is judged on the rock the only harrier data
shows, the 3D video's Night Timber (a different airframe of the same
class) with its flap mix off: worst bank within 30 deg; AS3X must damp
it (E11b). Its period is reported, not judged: the rock is a limit cycle
through these nonlinear terms closed through the pilot, with no clean
derived period, and the video's 1.5 s is the Night Timber's.

The video's harrier speed, "a crawl, 2 to 4 m/s" (judged, not measured),
is not a target: at 40 to 45 deg to a level path the thrust's forward
share (about 16 N on the Night Timber) far exceeds the drag at 3 m/s
(about 1 N); the derivation's 9.6 m/s at 40 deg stands.

Still open, a BIG FAILURE: the Night Timber's harrier (harrier-probe.js)
rocks about twice the video's (bank sd 26 to 37 deg with the mix off)
and the elevator flaps mix does not calm it as the video's does.

## The engine at a closed throttle (BLOCKED on the Slick's gates)

The Slick lane found the plant held the DA-120 at its 1,300 rpm idle in a
26 m/s glide while the air drove the prop: 1.05 N m back through the
mount, a roll to the right of 1.3 deg/s. A real two stroke at a closed
throttle speeds up until its friction and pumping hold the prop.

**The engine's map** (FixedWingParams.engine_q, `npm run da120:derive`):
HFE's part throttle dyno (DA120 EFI data sheet fig. 3, 20 to 100 percent
throttle, 2,000 to 8,000 rpm) scaled by 0.931 to Falcon's measured full
throttle, as rows of torque against speed. HFE ran nothing at the idle
stop; that row holds the prop's load at DA's 1,300 rpm and falls with the
speed as the 20 percent row's least squares slope, 0.484 N m a 1,000 rpm
(FITTED: the nearest measured throttle), through zero at 2,010 rpm: past
it the closed throttle's friction and pumping outgrow what the idle burns
and the engine brakes. Past each part throttle row's last point HFE's
engine "could not produce torque" (its words); the row falls to nothing a
column on, then at the closed throttle's slope (FITTED).

**The rotor floats.** Where a table has the map its engine drives the
rotor by it at the speed it turns, against the air's own torque on the
prop (torque_curve, APC's), not the static load the glow method holds every
rotor to. A big prop's tips near the speed of sound add their own load,
from APC's 22x8 rows (Cp 0.0182 to 0.0313 from tip Mach 0.52 to 0.95,
CP_MACH), taken over the measured full point's. Every other table is
unchanged to the bit (extra:gates E15, nighttimber N15).

**Measured on the Slick:** standing still the speeds are the throttle
curve's (1,300, 3,557, 5,163, 6,089, 6,550 rpm at the stick's 0, 0.3, 0.5,
0.7, 1). In the 26 m/s idle glide the engine runs up to 2,885 rpm, where
its braking, 0.42 N m, holds the prop against the air: the mount gives
back 0.42 N m, where it gave 1.05.

**The ceiling.** The same physics unloads the engine at full throttle in
fast flight. On HFE's map alone, which runs on to 8,000 rpm, the prop ran
to 8,394 rpm (static 6,550) and the Slick flew 54.5 m/s. That is not the
floating balance going wrong: APC's own 22x8 tables, read at the 28 x 10's
tip speed, put the balance at 8,436 rpm and 52.5 m/s (the 22x8, pitch over
diameter 0.364, pulls to an advance ratio of 0.55, 1.5 times its pitch
over diameter, not to its geometric pitch). Desert Aircraft publishes the
DA-120's range as 1,300 to 6,900 rpm (desertaircraft.com), so the map
stops there (FixedWingParams.engine_rpm_max): past it the engine gives
only its closed throttle torque. A real engine can over-rev with its prop
unloaded in flight; no in-flight rpm for a DA-120 on a 28 x 10 is
published (Model Aviation and the control line boards report engines
running over their static rpm in the air, without a number for this one),
so the published range is the bound. Level at full throttle the Slick now
flies 44.76 m/s at 6,895 rpm; APC's tables at 6,900 rpm give 42.40, the
plant's straight line thrust law (zero thrust at J 0.60 where APC's is
0.55) the rest.

**Why this is blocked.** S4 (top speed, 38.28 to 46.79) and S7 hold. The
Slick's S1 (level at 75 percent, derived at a held 0.94 of full rpm; the
floating engine reaches the ceiling there too, 44.74 against 44.74 at
most), S12 (knife edge throttle 0.442 against 0.48 to 0.649), slick:stab's
cruise (31.9 against 22.35) and Manual quarter pull power off (3.3 deg
against 3, the idle prop turning 2,885 rpm, not 1,300, so more
precession), and stab:chop's glide (1.344 m/s sink at 25.0) were derived
on the static load and the held idle; they are the Slick lane's to
re-derive on this map.

## The prop's curves

The plant's thrust fell straight from static to nothing at the pitch
speed, T = T_s n^2 (1 - u / (V_p n)), and the torque followed one table
(APC's 11 x 7E) through the thrust's share. APC's performance files say
otherwise for every prop the fleet flies: the thrust holds up and runs on
past the geometric pitch, to zero at an advance ratio 1.15 to 1.5 times
the pitch over diameter (the 22 x 8, 0.55 at a pitch over diameter of
0.364). The line under-read the thrust at cruise by a third and over-read
it near zero thrust (the Slick's top speed, "The engine at a closed
throttle").

**What the plant does now.** Each table carries its prop's thrust and
shaft torque over their static values, axial_curve and torque_curve, at
mu = u / (V_p n), mu 0 to 2 by tenths, straight between and on along the
last two (plant_wing.c prop_curve). V_p, pitch_speed, is the prop's own
geometric pitch at its full rpm, the axis the quads' axial_curve and the
hangar's parts already use, so a swapped prop flies the stock prop's shape
on its own pitch speed. `npm run prop:curves -- wings` prints every
table's curves from APC's files (fetched, not copied), read at J = mu times
the file's pitch over diameter, at the APC speed row whose tips run as
fast as the flown prop's at full rpm; where APC makes no such prop the
nearest pitch over diameter stands in, and the WINGS list names it (the
Slick's 28 x 10 is the 22 x 8 at its tips' speed; the Bombshell's Cox 7 x
3.5 is half APC's 7 x 3 and half its 7 x 4). Past APC's last row, FITTED:
the thrust goes on at its last three rows' slope, the torque with the
thrust at theirs. The F-16's fan and the jet keep their sourced straight
lines, written out as curves.

**Measured.** Full throttle level, the plant's thrust against the curve
at the speed flown: within 1.5 percent on every table. The CAP's pitch
speed had been fitted through APC's 18 x 8E top point; on its own curve,
unfitted, it lands on APC's top speed, 32.21 against 32.18 m/s. Top speeds
on the electric and glow planes rose 18 to 37 percent (Cub 17.9 to 21.8,
Skyhunter 23.2 to 28.9, Zagi 28.9 to 35.6 m/s); the Slick, at its 6,900 rpm
ceiling, fell from 44.75 to 41.66 (APC's balance there, 42.40).

**What moved with it.** Every derivation that predicted the plant's speeds
reads the plant's curve through scripts/lib/propcurve.js, and every gate
band derived from them was re-derived in its own proportion. The tables'
own derived values moved with the derivations: the Stabilised trims
(stab:glide), the AS3X gains (as3x:derive), the 3/4 throttle trims of
the Kadet, P-51, Ugly Stik and Tiger Moth (cm_0), and the Bramor's static
thrust, the thrust that gives C-Astral's 5 m/s climb, 22.6 N on its 12 x
8E curve (APC's static row at its rpm gives about 25 N; 35 was more than
the prop makes).


## Servo blow back (2026-10-12)

A control surface's hinge moment grows with the dynamic pressure, and a
real servo stops where its stall torque, through its linkage, no longer
holds it: the air pushes the surface back short of what the stick asked.
The plant had no such limit on any aircraft. Now each table carries
`hinge_hold` (aileron or elevon, elevator, rudder) and `hinge_alpha`,
derived by `scripts/servo-derive.js` (`npm run servo:derive`) from each
aircraft's surface geometry and its servos' published torque, ESTIMATED
with a reason where a kit names none.

- The hinge moment: q b_f c_f^2 (Ch_delta shape(delta) + Ch_alpha alpha_s),
  NACA Report 721 (Ames and Sears 1941) eq. (3) and (11) for the slopes,
  NACA TN 759 fig. 13(d) for the shape past the small angles
  (`scripts/lib/hinge.js`, where each read is recorded with its plus or
  minus). alpha_s is the surface's own angle of attack: the wing's for
  the ailerons and elevons, the stabiliser's (off its zero lift angle,
  less the downwash's share) for the elevator, the sideslip for the
  rudder, each as its sine.
- The servo's torque at the hinge: its stall torque times 45 deg over the
  throw (the linkage, ESTIMATED).
- `plant_wing.c` hinge_blow: past the hold the surface stands where the
  moment equals it, at most at its travel; inside it the angle is the
  commanded one, untouched. The Extra's slewing servos are pushed back
  with their surfaces. The surface tiers carry their own servos' hold
  (`sim_wing_set_tiers` HOLD_A, HOLD_E, HOLD_R).

Measured: all 20 other aircraft's recorded flights `npm run
nighttimber:gates` pins are bit identical with the limit in; the Night
Timber's own moved (its elevator lets go at 16.9 m/s). The first version took the slope at a constant angle
of attack alone; it held the Extra's rudder to 19.7 deg at its 32.9 m/s
knife edge and its knife-edge loop crashed. The surface's own angle,
the same report's other term, carries the knife edge's sideslip against
the rudder's deflection, and the loop flies again. Not in it: the
slipstream's dynamic pressure over the tail, and the body's rates' share
of each surface's angle (docs/SURFACES-STAGE1.md, known limits).
