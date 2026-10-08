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
