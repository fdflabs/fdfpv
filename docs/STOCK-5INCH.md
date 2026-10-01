# The stock five inch on a published stand row

The owner's decision of 2026-10-01: correct the stock five inch's motor
and prop to the published data, and argue check 6's band again from that
source. This file holds the cause, the derivation, the numbers before and
after, what moved with it, and the 7 inch and 10 inch findings that were
left alone.

## The cause

`src/native/plant.c` solved the five inch's motor (ke, r_motor) and prop
(kt, kq) against one unnamed stand row: "a 2207 1900 kV on 6S with a
5x4.3x3, about 26,000 RPM, 1.5 kgf and 33 A". That is a weak motor by any
current 6S 2207's standard. On a stiff 24.7 V supply the table made
1592 g a motor. T-Motor's F60 Pro V 1950 kV on its T5147 tri blade,
measured by T-Motor at 24.7 V, makes 1990.4 g at 31,401 rpm and 49.3 A
(https://www.t-hobby.com/products/brushless-motor-for-fpv-drones-60pro-v-2207-5).

The prop was not the problem. The table's prop is slightly more thrust per
rpm squared than the T5147 (kt 1.98e-6 against 1.805e-6). The loss was the
motor's speed. Its 0.1825 ohm is about three times a 2207's winding, and
its 1507 kV loaded constant held the full throttle speed to 25,500 rpm
where the real motor turns 31,400.

## The derivation

The same four unknowns are solved against the one measured row, with the
method plant.c already documents:

| constant | was | now | from |
| --- | --- | --- | --- |
| kt | 1.98e-6 | 1.805e-6 | 19.519 N at 3288 rad/s |
| kq | 3.04e-8 | 2.648e-8 | kt through momentum theory at the same figure of merit, 0.520, on the table's own disc |
| ke | 0.006336 (1507 kV loaded) | 0.005807 (1645 kV loaded) | the row's torque, 0.2863 N m, over its 49.3 A |
| r_motor | 0.1825 ohm | 0.1137 ohm | what is left of 24.7 V at that speed and current |
| k_inflow (pitch) | 4.3 inch | 4.7 inch | the T5147's pitch |

Notes on the derivation:

- The loaded constant is 0.84 of the 1950 kV plate. That is inside the
  saturation range plant.c already argues for a 2207.
- Q / T is 0.01467 m, against the old stand's 0.0150.
- The pack, the mass, the inertia, the drag, the rotor inertia, the vibration
  reference and the figure of merit are all unchanged.
- **The prop's radius stays the frame's 0.0635 m.** The T5147 is 5.1 inch,
  1.3 mm more blade. The disc enters the collider, the hulls, the crash part
  tables and verify's world scale check, and a 2 percent radius is not worth
  moving all of them. kt and kq are the measured row's per rpm squared, so
  the radius only sets the disc area the induced velocity is taken over. The
  kq above is derived on this same disc, so the figure of merit identity
  plant.c relies on (torque_ind is the induced share at hover) still holds
  exactly.

## Before and after

`npm run verify`, both builds of this branch's tree:

| check | band | before | after |
| --- | --- | --- | --- |
| 5 hover throttle | 0.20 to 0.30 | 0.2793 | 0.2578 |
| 6 punch-out | was 55 to 85 m, now 76 to 117 m | 80.0 m | 96.4 m |
| 7 terminal velocity | 30 to 40 m/s | 31.0 m/s | 37.2 m/s |
| 8 motor step | 10 to 30 ms | 26 ms | 22 ms |
| 11 battery sag | 4 to 15 percent | 11.18 | 11.45 |
| 2 and 3 determinism hash | identical | de0401cd4266 | 9a4c86d0dd19 |

The determinism hash moves because the five inch's constants did. It is
still identical between two runs and between Node and Chrome. Every other
check is unchanged.

Static, on a fresh pack, at 1 g:

| | before | after |
| --- | --- | --- |
| thrust to weight | 8.10 | 9.72 |
| full throttle | 25,490 rpm, 137 A, 3.86 V a cell | 29,233 rpm, 171 A, 3.77 V a cell |
| hover | 4.5 A | 4.3 A |

The full throttle current is 171 A against the stock pack's 169 A, which is
a CNHL 6S 1300 at its published 130C. That is a real race pack at its
rating. Level top speed at the shell's 1.62 g goes from 41.5 to 46.0 m/s
(scripts/combat-gates.js). STAGE1.md has always said a real 650 g 5 inch on
6S is "9 to 12 to 1"; the old table was 8.1.

## Check 6's band, argued again

55 to 85 m came from the stub harness of 2026-08-11 ("Loop A: Stage 1
verification harness, thresholds, baseline input, stub ABI"), before there
was a plant. The plant was then fitted into it: the five inch's mass went
from 0.65 to 0.71 kg partly because it "regains margin under check 6's
ceiling" (plant.c).

On the measured row the five inch climbs 96.4 m. The new band is that value
with the old band's half width over its centre, 15 / 70 = 21.4 percent,
either side: 96.4 times 0.786 and 1.214 is 75.8 to 117.0, written 76 to 117
m. No other band moved, and every other check sits inside its old band.

## What moved with it

- Every "unmoved" fingerprint of the five inch is re-recorded: the
  canonical replay hash in the planes' threshold files, whoop-gates W14 and
  combat-gates' copy of its hover. These are regression fingerprints, not
  bands; the change they trip on is this one.
- `configs/airframes.js`: the five inch's and the whoop's topSpeed (40 to
  46) and thrustToWeight (8.4 to 9.7), read by the in-sim builder's racing
  line; the five inch's blurb and facts and its carousel note; a comment in
  configs/rates.js.
- **The whoop** flies this plant in its hall, built MICRO_SCALE times life
  size. MICRO_SCALE is the ratio of the two sweep radii, and the radius did
  not move, so the hall and every gate stay where they are. The whoop
  inherits the corrected feel:
  - hover from 27.9 to 25.8 percent of stick;
  - a punch about a fifth harder;
  - top speed in the hall from 40 to 46 m/s, which is 11.7 to 13.4 m/s in
    whoop units at 3.43 times.

## The 7 inch and the 10 inch, left alone

**The 7 inch.** combat-derive's kt is from an unsourced "1.9 kgf at 24,000
rpm". BrotherHobby's Avenger 2806.5 1300 kV on the HQ 7x3.5x3 at 23.8 V
measures 2520 g at 21,691 rpm and 44.4 A
(https://www.brotherhobbystore.com/products/avenger-28065-motor), which is
a real kt 62 percent higher.

On the real Li-ion pack that gain mostly vanishes. Refit the same way
(kt 4.79e-6, kq 7.727e-8, ke 0.00898, R 0.0766), its static T/W goes from
4.75 to only 5.01, because the 18 mOhm cells sag to 2.73 V a cell under
86 A. Its top speed falls from 28.3 to 26.8 m/s, because the real prop
turns slower at the same 3.5 inch pitch. Its hover goes from 0.309 to
0.270, its punch sag is 2.73 V and its motor tau is 26 ms, all inside
combat-gates' bands. The refit is left for the owner. It makes the 7 inch
truer, not faster.

**The 10 inch.** iFlight's NIDICI 3115 900 kV on the HQ 10x4.5x3 at
23.38 V makes 4406 g at 63.3 A
(https://shop.iflight.com/NIDICI-3115-FPV-Motor-Pro2317). The table, on the
same stiff supply, makes 3827 g at 63.8 A, 13 percent under at the same
current. iFlight publishes no rpm, so prop and motor cannot be told apart.
It is left alone.

**The interceptor** was rebuilt from published parts first, in its own
change (docs/COMBAT-DRONES.md 1a): T-Motor's V2808 1300 kV on APC's
7 x 9E, 47.1 m/s level. combat-gates holds it the fastest quad in level
flight, and on this correction the five inch's 46.0 m/s sits under it.
