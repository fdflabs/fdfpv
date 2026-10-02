# Each prop's thrust against axial speed

The owner's decision of 2026-10-01: replace the quad plant's straight line
law for thrust against axial speed with each prop's own curve from APC's
performance files, and argue verify's check 7 and gates.config.json P5
again from published speeds. This is the first of two changes from the
drag investigation. The second, a prop's torque at a high advance ratio,
is its own.

## What was wrong

The quad step's climb branch (src/native/plant.c) took a rotor's thrust
at axial advance mu as `1 - mu`, where mu is the axial speed over the
geometric pitch speed (w k_inflow). So thrust fell in a straight line and
reached zero at the geometric pitch speed. No prop APC publishes behaves
so. Normalised the same way:

| mu | 1 - mu (was) | 5 x 4.6E | 7 x 4E | 10 x 5E | 7 x 9E |
| --- | --- | --- | --- | --- | --- |
| 0.2 | 0.80 | 0.975 | 0.916 | 0.911 | 0.992 |
| 0.4 | 0.60 | 0.882 | 0.802 | 0.795 | 0.963 |
| 0.6 | 0.40 | 0.724 | 0.653 | 0.649 | 0.834 |
| 0.8 | 0.20 | 0.498 | 0.473 | 0.474 | 0.532 |
| 1.0 | 0 | 0.237 | 0.271 | 0.281 | 0.152 |

A real prop holds most of its thrust to half its pitch speed and keeps
some past it, more so the higher its pitch over its diameter. The straight
line took about half the thrust a fast quad really has at speed.

## The change

Each quad's table entry carries `axial_curve`: its prop's thrust over its
static thrust at mu = 0, 0.1, ... 1.4, linear between. The climb branch
reads it. The descent branches (the windmill state and the vortex ring)
are untouched.

`scripts/prop-curves.js` derives every table from APC's file at the rotor
speed the machine turns at full throttle (it fetches the files; they are
APC's and are not copied here):

| airframe | its prop | APC file used | why |
| --- | --- | --- | --- |
| 5 inch | T-Motor T5147, 5.1 x 4.7 x 3 | 5 x 4.6E at 29,000 rpm | APC makes no T5147; the same pitch over diameter, 0.92 |
| 7 inch | HQ 7 x 3.5 x 3 | 7 x 4E at 19,000 rpm | APC makes no 7 x 3.5; the nearest pitch over diameter it publishes |
| 10 inch | 10 x 5 x 3 | 10 x 5E at 11,000 rpm | the same size |
| interceptor | APC 7 x 9E | its own, at 19,000 rpm | its own |
| whoop (airframe 1) | 31 mm | none | no shell airframe flies this table, its gates were fitted to `1 - mu`, and APC publishes no 31 mm prop: the old law, written out as its curve |

**APC's PER3 files are APC's own computation** (its blade element model,
https://www.apcprop.com/technical-information/performance-data/), not a
tunnel measurement. They are the only published thrust against airspeed
for these props. Two of the files are two blade props standing in for
three blade ones; the table above says where.

**The hover is untouched.** Every curve's first point is exactly 1, so at
mu = 0 the thrust is the static thrust, as before. verify's hover reads
0.2578 before and after, and whoop W14's hover fingerprint is unchanged to
the digit.

## Check 7 and P5, argued again

Check 7 (level, full throttle, 20 s plateau) was 30 to 40 m/s. P5's level
speed was 120 to 165 km/h. Both were authored at the harness's creation
from no source. **No citable level or two way top speed of a stock class
6S five inch exists.** What exists are four published peaks of unstated
direction and level:

| source | build | figure |
| --- | --- | --- |
| Oscar Liang, SpeedyBee Mario 5 review, 2024-11-11, https://oscarliang.com/speedybee-mario-5/ | Storm 2306.5 1880 kV, HQ J40 5.1 x 4.0 x 3, 6S 1100, 697 g | "up to 150 km/h" |
| Oscar Liang, GEPRC Vapor D5 review, 2025-03-11, https://oscarliang.com/geprc-vapor-d5-o4/ | SpeedX2 2207E 1960 kV, Gemfan 5136, 6S 1100, 698 g | about 165 km/h |
| r/fpv, Emax Eco II speed runs, 2021-07, https://www.reddit.com/r/fpv/comments/oowpwt/ | Eco II 2306 1900 kV, 5043, 6S 1300, 684 g, Matek GPS | 164 km/h peak |
| Bosello, Aguiari et al., "Race Against the Machine", arXiv 2311.02667v2, 2024, https://arxiv.org/html/2311.02667v2 | T-Motor F60 Pro V 2020 kV, T5147, Tattu 6S 1400, about 870 g | 179 km/h "measured outdoors" |

The owner's decision: the bands cover that spread, 150 to 179 km/h (41.7
to 49.7 m/s), with each end moved out by the old band's half width over
its centre, as check 6 was:

- **Check 7: 35.7 to 56.8 m/s.** The old band's half width over its
  centre is 5 / 35 = 14.3 percent, so 41.7 × 0.857 and 49.7 × 1.143.
- **P5: 126 to 207 km/h.** Its old band's is 22.5 / 142.5 = 15.8 percent.
  No script reads P5 today; gates.config.json carries the note.

These are peaks of unstated direction and level, so **the bands are
deliberately wide.**

**OPEN ITEM: a GPS logged, two way, level top speed run of a real F60 Pro
V / T5147 class five inch on 6S.** When one is published or logged (the
TOWA calibration page, https://jschmiedd.github.io/en/, shows a usable
method: blackbox GPS, wind stated), both bands are argued again from it.

## Before and after

`npm run verify` on the corrected five inch (docs/STOCK-5INCH.md):

| check | band | before | after |
| --- | --- | --- | --- |
| 5 hover | 0.20 to 0.30 | 0.2578 | 0.2578 |
| 6 punch-out | 76 to 117 m (now 95 to 147) | 96.4 m | 113.9 m |
| 7 terminal velocity | was 30 to 40, now 35.7 to 56.8 m/s | 37.2 m/s | 44.2 m/s |
| 8 motor step | 10 to 30 ms | 22 ms | 20 ms |
| 11 battery sag | 4 to 15 percent | 11.45 | 11.00 |
| hash | identical | 9a4c86d0dd19 | e34fb1961e08 |

16 of 16 on the thrust curve alone. The punch, 113.9 m, sat near its band's
top; with the torque curve as well it passes it, and the band is argued
again below.

Level top speed at the shell's weights (scripts/combat-gates.js):

| quad | before | after |
| --- | --- | --- |
| interceptor | 47.1 m/s, 170 km/h | 51.3 m/s, 185 km/h |
| 5 inch (1.62 g) | 46.0 m/s, 166 km/h | 50.7 m/s, 183 km/h |
| 7 inch | 28.3 m/s | 31.1 m/s |
| 10 inch | 27.7 m/s | 30.7 m/s |

The fastest quad gate holds: 51.3 against 50.7.

## What moved in the checks, and why

Each combat-gates change is argued in its own comment. The tolerances are
unchanged.

- **Static T/W.** combat-gates read the static thrust to weight from the
  highest rotor speed in a 2 s full throttle climb. That equalled the
  standing speed while thrust fell as `1 - mu`. On the prop's own curve a
  climbing prop keeps its thrust and its load and turns slower, so the row
  read 7.68 against combat-derive's 8.33. It now holds the craft still at
  full duty (sim_rest each step), as a stand does, and reads 8.33, 4.72 and
  4.65, the derive's.
- **The level pilot.** It now flies 45 s instead of 30. At the
  interceptor's new 51 m/s its slow pitch trim had not settled by 30 s
  (|vz| 0.108 against the 0.1 the row holds); at 45 s it reads 0.017, and
  the speed moves 0.02 m/s.
- **Every topSpeed restatement in configs/airframes.js** is now what the
  module flies, as the gate requires: the 5 inch and the whoop 50.7, the
  7 inch 31.1, the 10 inch 30.7, the interceptor 51.3, and its card 185
  km/h. The builder selftest's restatement follows.
- **Fingerprints.** The five inch's canonical replay hash (15 threshold
  files) and whoop W14's punch, terminal and tau are re-recorded. The hover
  is unchanged to the digit.

## The drag investigation (2026-10-01, report only, nothing in the plant)

An XLR V3 class build was flown on the corrected five inch's table: 490 g,
APC 5.2 x 6.0E from its file, 2450 kV, 6S. The record is 360.5 km/h
(Guinness 2023, https://downanddirtydrones.wordpress.com/xlr-v3/).

| variant | top speed |
| --- | --- |
| the plant as it was | 189 km/h |
| torque clamp off | 189 km/h |
| rotor H force halved | 194 km/h |
| rotor H force off | 207 km/h |
| body drag halved | 232 km/h |
| rotor H force off and body drag halved | 263 km/h |
| APC thrust curve (this change) | 213 km/h |
| APC thrust curve, H off, body drag halved | 289 km/h |

There are three places the plant differs from a fast prop. This change
is the first:

1. **Thrust against axial speed.** This change.
2. **Torque at a high advance ratio.**
   - APC's torque rises to about 1.3 times static near mu 0.6, then falls
     (0.56 at mu 1.0).
   - The plant's split, (1 - FM) kq w^2 + T (va + vi) / w, stays near
     0.9.
   - So the motor is over loaded at speed and the rotors stay near 32,000
     rpm, where a real 2450 kV would climb toward its 56,000 no load.
   - The second change, below.
3. **Rotor H force and body drag at 65 to 80 degrees of pitch.**
   - No speed quad publishes a drag figure. The five inch's plan drag is
     fitted to a props level descent, a different flow.
   - Left as it is.

The 0.90 torque clamp (`PLANT_TORQUE_QMIN`) is not what limits a fast
pass: flown with it off, both the XLR and the interceptor flew the same.

## The second change: torque at a high advance ratio

Each quad table also carries `torque_curve`, the same prop's shaft torque
over its static torque at the same mu, read from the same APC files at the
same rpm (`npm run prop:curves`). For mu >= 0 the rotor's load is kq w^2
times that curve. It was the induced and profile split, (1 - FM) kq w^2 +
T (va + vi) / w, clamped to 0.9 to 1.6 of kq w^2.

| mu | 5 x 4.6E | 7 x 4E | 10 x 5E | 7 x 9E |
| --- | --- | --- | --- | --- |
| 0.2 | 1.03 | 1.03 | 1.03 | 1.12 |
| 0.4 | 1.07 | 1.01 | 1.01 | 1.31 |
| 0.6 | 1.00 | 0.94 | 0.95 | 1.38 |
| 0.8 | 0.79 | 0.79 | 0.81 | 1.06 |
| 1.0 | 0.48 | 0.57 | 0.60 | 0.44 |

- **The hover is unchanged.** Every curve's first point is exactly 1, so
  at mu = 0 the load is kq w^2, exactly what the split gave there (the
  identity plant.c's figure of merit note rests on). verify's hover reads
  0.2578 before and after, and whoop W14's hover fingerprint is unchanged.
- **Descent keeps the split.** APC's files cover a prop moving into the
  air, not falling through its own wake: the windmill and the vortex ring
  states still unload the rotor as before.
- **Edgewise flow** is taken at the axial curve. APC's data is axial only;
  in a fast pass at 65 to 80 degrees of pitch most of the flow through the
  disc is axial.
- **The whoop table** has no published curve (all zeros), so it keeps the
  split. Its gates were fitted to it, and W1 to W13 pass.

| | thrust curve only | thrust and torque curves |
| --- | --- | --- |
| interceptor level | 51.3 m/s | **55.9 m/s, 201 km/h** |
| 5 inch level (1.62 g) | 50.7 m/s | 54.1 m/s, 195 km/h |
| 7 inch level | 31.1 m/s | 33.4 m/s |
| 10 inch level | 30.7 m/s | 33.3 m/s |
| verify hover | 0.2578 | 0.2578 |
| verify punch-out | 113.9 m | 121.0 m |
| verify check 7 | 44.2 m/s | 47.3 m/s |
| verify motor step | 20 ms | 21 ms |
| verify battery sag | 11.00 percent | 11.85 percent |

**Check 6's band moves again, and it is self referential.** The punch
climbs on exactly the laws this corrects: 96.4 m on the old straight
lines, 113.9 on the thrust curve, 121.0 on both. A search found no
published, instrumented punch-out of a 6S five inch: no altitude in a set
time from a hover, no measured full throttle climb rate. What is published
is load cell thrust to weight. Bosello et al. (arXiv 2311.02667) measure
7.5 static on an 870 g F60 Pro V 2020 kV / T5147 build, against this
plant's 9.72 at 710 g. By the owner's decision the band is centred on the
plant's own 121.0 m on the sourced laws, with the old band's 21.4 percent
either side, as check 6 was before: **95 to 147 m**. It is argued again
when an instrumented log is published.

**OPEN ITEMS**, both waiting on a published or logged run of an F60 Pro V
/ T5147 class five inch on 6S:
1. A GPS logged, two way, level top speed (check 7, P5).
2. A baro or GPS logged punch-out from a hover, altitude in 3 s
   (check 6).

## What to feel

- Every quad keeps pulling at speed instead of running out of prop, and
  its motors spin up as the prop unloads.
- Full throttle in a straight line goes about 17 percent faster: the five
  inch about 195 km/h at its weight, the interceptor 201 km/h, the owner's
  200 plus.
- A punch climbs harder at the top.
- Hover and the low stick are unchanged.
- Throttle is a touch less damped in a fast climb: the prop no longer
  loses a fifth of its thrust per fifth of pitch speed.
- Wrong would be anything different in a hover, or a quad that keeps
  accelerating past its old top speed without settling.
