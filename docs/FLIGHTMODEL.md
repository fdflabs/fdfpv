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

- The P-51's Acro roll damping, \`acro_roll_kd\`, 0.70 to 0.80: with the fin
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
table now carries its prop's and rotor's polar inertia, \`j_prop\`, so a
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
  unchanged (\`torque_arm\`, \`pfactor\`); the slipstream's swirl is PR 2's.

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

Re-recorded (\`node scripts/wing-record.js\`), every take off flown on a
prop with a new gyroscope: \`cub-baseline.rec\`, \`glider-baseline.rec\`,
\`slowstick-baseline.rec\`, \`timber-baseline.rec\`,
\`timberf-baseline.rec\`, \`bombshell-baseline.rec\`,
\`kadet-baseline.rec\`, \`f16-baseline.rec\`. The 1000 mm wing's, the
Skyhunter's and the Bramor's committed streams are kept (their recorders
no longer write the committed bytes even on origin/main) and only their
hashes are re-pinned. Unmoved, to the bit: the five inch
(9fdc42323baad668), the Bramor's chute flight (motor cut), the P-51 and
its air flight, the Ugly Stik, the Tiger Moth, the Zagi and the NRJ,
whose props already had their inertia; \`war:legacy\` and \`crash:core\`'s
digests. Regenerated: \`configs/power-estimates.js\`,
\`tools/audio/flights.json\`.

### Checks

- \`timber:gates\` T13 measured the taxi turn's heading change as the
  difference of its two end headings, which wraps past half a circle: at
  1.57 rad/s for 2 s the turn reached 179.6 deg and read as a left turn.
  It now sums the change step by step; on origin/main it reads the same.
- \`rudderHold\`, the take off pilot's feet, aims the nose back at the
  centreline, 0.3 rad per metre off it: the gyroscope's kick as the tail
  comes up put the Cub 0.55 m off the line with the heading held.
- Left loud, as in PR 2: \`slowstick:stab\` "yaw stick wins over the
  level hold, right of a quarter of its throw", -7.5 against a -7.5
  limit (passing on origin/main by hundredths): the same rudder only
  aircraft check as the Bombshell's in PR 2.

## PR 4, built: the fuselage in a crossflow

A knife edge is held by the fuselage's side force and the thrust's share
at a sideslip. The table's side force is CY beta, linear and the fin's;
the body's own crossflow, which grows with the sideways speed squared,
was missing (the removed Extra had it as \`side_cda\`). Now every aircraft
with a fuselage carries it: \`side_cda\`, eta Cdc S_side, a force against
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

Re-recorded: \`cub\`, \`glider\`, \`timber\`, \`timberf\`, \`bombshell\`,
\`kadet\`, \`f16\`, \`uglystik\`, \`tigermoth\`, \`p51\` and \`p51-air\`; the
Skyhunter's, the Bramor's and its chute's hashes re-pinned on their
committed streams. Unmoved: the five inch, the 1000 mm wing, the Slow
Stick, the Zagi, the NRJ, \`war:legacy\` and \`crash:core\`'s digests.
Regenerated: \`configs/power-estimates.js\`, \`tools/audio/flights.json\`.
No gate changed.
