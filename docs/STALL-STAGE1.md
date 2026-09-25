# Past the stall, stage 1: the pitch break, the wing drop and the spin

This is crash round 4's aero item (docs/CRASH-PLAN.md, "Round 4 targets"):
what every fixed wing does once its wing has stalled.

- Code: `src/native/plant_wing.c`, in `stalled_lift`, `strip_stall` and the
  step's lift and moments, plus a few numbers in each table.
- Numbers: `scripts/stall-derive.js`.
- What each aircraft does with them: `scripts/stall-probe.js`.
- What changed in each recorded flight, and the proof that nothing short of
  the stall moved: `scripts/stall-crossing.js`.

The first version of this model (#59 as first sent) made every trainer roll
past inverted into a spiral when full back stick was held. The lead sent it
back for three things: sourced severity, an unchanged ground roll, and an
account of the stored hashes. This version answers all three, and each
answer has a section below.

## What was wrong on main

The plant blends its lift and drag from the linear wing to a flat plate
through the stall: a cubic in the angle of attack, spanning `stall_blend`
either side of CLmax / CLα. Its moments stayed linear past that point. Held
full back from 1.15 V_s, every plane except the Slow Stick settled into a
steady stalled descent, with the nose 12 to 28 deg over its flight path and
the wings level to a hundredth of a degree. The wing was a single wing, so
nothing could stall one half before the other. Roll damping was the
table's constant Cl_p, so nothing could autorotate.

What a real aircraft does is described in FAA-H-8083-3C, the Airplane
Flying Handbook, ch. 5:

- A full stall is "an uncommanded nose down pitch that cannot be readily
  arrested, and may be accompanied by an uncommanded rolling motion".
- A spin needs "at least one of the airplane's wings" past the critical
  angle "with a sideslip or yaw acting on the airplane", and it turns "in
  the direction of rudder application".
- Recovery is opposite rudder, with the elevator "forward of neutral".

## The lift past the stall, from the section's measured curve

The lead's first point was that the violence of the stall has to come from
sourced data, not from the one estimated number, the asymmetry. The data
are measured lift curves, read off Selig et al., Summary of Low-Speed
Airfoil Data (UIUC, vols. 1 to 3), at each kit's Reynolds number. Each
aircraft's derivation already names a section class, and no kit publishes
its actual section. Past its peak, a low Reynolds number section does two
things:

1. It holds its lift nearly flat for a few degrees (`stall_top`).
2. It then falls to a share of that lift (`stall_k`).

| Section, figure | Reynolds number | Held past the linear CLmax | Falls to |
| --- | --- | --- | --- |
| Clark-Y (B), vol. 3 fig. 5.22 | 1e5, 2e5 | +4.4 deg, +6.7 deg | 0.93 of 1.30, 0.93 to 0.95 of 1.32 |
| SD7037 (A), vol. 1 fig. 4.134 | 6e4, 1e5 | +1.8 deg, +1.1 deg | about 1.05 of 1.21, 0.96 of 1.18 |
| NACA 2415, vol. 2 fig. 5.52 | 1e5, 2e5 | +2.9 deg, +4.2 deg | 0.73 to 0.80 of 1.18, 0.76 of 1.22 |
| MH45, vol. 1 fig. 4.61 | 1e5, 2e5, 3e5 | +2.5, +2.8, +0.6 deg | 0.80 of 1.09, 0.92 of 1.14, a trailing edge stall to 1.05 of 1.16 |

Each airframe's numbers, interpolated to its own Reynolds number:

| Airframe | Section class (its derivation's) | stall_top | stall_k |
| --- | --- | --- | --- |
| 1000 mm wing | MH45 at 1.3e5 | 2.6 deg | 0.76 |
| Skyhunter | Clark-Y at 1.4e5 | 5.3 deg | 0.72 |
| Cub, and on floats | Clark-Y at 1.1e5 (the USA 35B class) | 4.6 deg | 0.72 |
| Radian | SD7037 at 8e4 | 1.4 deg | 0.84 |
| Bramor | MH45 at 2.8e5 | 0.6 deg | 0.89 |
| Slow Stick | Clark-Y at 1e5 | 4.4 deg | 0.72 |
| Timber, and on floats | NACA 2415 at 1.6e5 ("thick semi symmetric") | 3.7 deg | 0.63 slats off, 0.84 slats on (`slat_k`, ESTIMATED) |

How the lift curve is built:

- **Up to the stall angle:** the plant's lift is exactly its own curve.
  Every gate's band was derived on that curve, and the probe on main puts
  its peak at about 0.8 of CLmax.
- **Past the stall angle:** the lift the plant has at the stall angle is
  held for `stall_top`. It then falls to `stall_k` of that lift, over the
  2 `stall_blend` the plant already takes the stall's onset over, because
  the wing's span spreads what a section does at once.
- **Past the fall:** the lift is the flat plate's plus Viterna and
  Corrigan's post stall term, A2 cos²α / sin α (NASA CP-2230, 1982). A2 is
  set so the curve continues from `stall_k`, and the term decays to nothing
  at 90 deg, where the plate alone is right.
- **Blending:** the new curve is brought in over one `stall_blend` past the
  stall angle.

The Timber's slats have no measured section. A slat keeps the leading edge
attached, which turns the stall into a trailing edge one, so `slat_k` is
the trailing edge value of the sections above (0.84). It is ESTIMATED.

## The wing in strips: where the stall starts, and the wing drop

Each half of the wing is taken as four spanwise strips, at an eighth, three
eighths, five eighths and seven eighths of the semispan.

- **Chords:** from each drawn planform (`strip_c`, stall-derive.js). The
  1000 mm wing's derivation has no planform, so it is ESTIMATED at a taper
  of 0.5.
- **Loading:** Schrenk's approximation (NACA TM 948, 1940) gives each strip
  its share of the lift: c cl / (c_mean CL) = (c + c_elliptic) / 2 c_mean.
  The most loaded strip therefore stalls where the wing's CLmax says, and
  the others later.
  - A rectangular wing (the Cub, the Timber, the Slow Stick) loads its root
    most. Its root stalls first, and its tip strip 40 percent of the stall
    angle later.
  - The Skyhunter's 0.7 taper and the Radian's drawn planform load the
    middle or root. Their tip still stalls last.
  - The Bramor's cranked, tapered wing loads five eighths of the way out,
    and the 1000 mm wing's estimated taper does something similar. Those
    are tip stalls. Their sweep, which Schrenk leaves out, moves the load
    further out still.
- **Angle of attack:** each strip's is the centreline's plus the roll
  rate's p y / V, the small angle the table's Cl_p is built on. The yaw
  rate adds sin α r y / V: a retreating strip meets the air slower along
  its chord for the same flow across it. Linear theory drops that term as
  second order, but a spin lives on it.
- **What each strip gives:** its lift is its section's curve above, and it
  gives back how far that lift falls short of its linear lift. The moments
  are scaled so the strips' linear part is exactly the table's roll
  damping, so as a strip stalls, its share of the damping goes, and where
  its lift falls, the damping reverses. That is autorotation: past the
  stall the rising wing makes more lift than the falling one (NASA TP-1589,
  1979; Bowman, NASA TN D-6575, 1971). A stalled strip's extra drag yaws
  the nose toward it.
- **Nothing short of its stall angle:** a strip takes nothing until it
  passes its own stall angle, and it is brought in over one `stall_blend`.
- **Asymmetry:** the left half stalls `stall_asym` sooner, 1 mm of trailing
  edge over the chord (0.21 to 0.31 deg). This is ESTIMATED as a kit's
  build tolerance. Without it a power off stall from wings level is exactly
  symmetric and no wing could ever drop.
- **The asymmetry picks the side, not the violence:** at 0.1 and 4 times
  its value, the probe's final bank moves by a few degrees on every
  airframe except the Timber, whose slow spiral in a held full up stall
  starts sooner with more asymmetry.
- **Sideslip is not in the strips' angles.** With the dihedral's share in,
  a stall with right rudder spun left on every plane that has more than a
  few degrees of dihedral, against the handbook ("in the direction of
  rudder application").

## The pitch break

Past the stall angle, over the same bring in:

  ΔCm = σ [ ((1 − f) arm_ac − f arm_cp) CN − arm_ac CL_lin − dw (CL_lin − CL) ]

Here f is how far through the section's fall the wing is, and CN is the
stalled wing's normal force.

- **arm_ac CL_lin** takes back the linear lift's moment, the lift the
  stalled wing does not make.
- **The normal force** is put back where it acts. While the section holds
  its lift, that is the aerodynamic centre. As the lift falls it moves to
  the centre of pressure at 0.40 of the chord (Hoerner, Fluid Dynamic
  Lift, ch. 3). UIUC's Clark-Y moment curves show the same break, about
  −0.1, at the fall.
- **dw (CL_lin − CL)** is the tail's share. The downwash at the tail
  follows the lift the wing makes, ε = 2 CL_w / (π AR) (Nelson eq. 2.22).
  As the stalled wing sheds lift the downwash goes with it, and the tail
  lifts, nose down, by dw = η V_H a_t (dε/dα) / a_w per unit of wing lift
  lost. It is zero on a flying wing.

| Airframe | arm_ac | arm_cp | dw | from |
| --- | --- | --- | --- | --- |
| 1000 mm wing | −0.0688 | 0.2188 | 0 | static margin 0.069, CG 0.181 c |
| Skyhunter | 0.0833 | 0.0667 | 0.1448 | CG c/3; a_w 5.14, a_t 4.00, V_H 0.568, dε/dα 0.364 |
| Cub, and on floats | 0.0500 | 0.1000 | 0.1352 | CG 0.30 c; a_w 4.89, a_t 3.81, V_H 0.434, dε/dα 0.444 |
| Radian | 0.0157 | 0.1343 | 0.1117 | CG 0.266 of the drawn MAC; V_H 0.496, dε/dα 0.301 |
| Bramor | −0.0881 | 0.2381 | 0 | static margin 0.088, CG 0.162 |
| Slow Stick | 0.0617 | 0.097 | 0.1313 | its own arms (docs/SLOWSTICK-STAGE1.md); DATCOM's dε/dα 0.494 |
| Timber, and on floats | 0 | 0.1500 | 0.1717 | CG c/4; V_H 0.464, dε/dα 0.460 |

## The ground roll, and why it is not a dynamic pressure fade

The lead's second point: the three point roll and the gear settling sit
past the stall angle, which moved take off heading, the Timber's T10 and
the first millisecond of every ground and water start.

**Why a fade in q cannot do this.** `node` on main's module (a scratch
measurement, the method in stall-crossing.js) shows where each take off
roll sits. Every roll is in the plant's stall blend right up to lift off,
at 1.0 to 1.27 V_s:

| Take off | Fastest on the ground in the stall |
| --- | --- |
| Cub, sticks centred | 10.27 m/s, 1.27 V_s, alpha 13.3 |
| Slow Stick | 5.08 m/s, 1.16 V_s |
| Timber, T10 and T11 | 7.10 and 7.38 m/s, 0.99 and 1.02 V_s |

A fade that is exactly zero through those rolls would switch the stall
model off at the stall speed in flight too. What is done instead has two
parts, one physical and one a modelling boundary.

- **No post stall term short of the stall angle.** The lift is the plant's
  own curve there, the pitch break is zero, and each strip takes nothing
  short of its own stall angle. This is the plant's own definition of the
  stall: the section data begin at CLmax.
- **A Reynolds number fade.** Every post stall term is scaled from nothing
  at a chord Reynolds number of 3e4 to all of it at 5e4. Below 3e4 a low
  Reynolds number section's laminar separation runs into the wake. The
  separation to reattachment distance is a Reynolds number of about 5e4,
  so a chord shorter than that cannot reattach. The critical Reynolds
  number is about 7e4 (Lissaman, Low-Reynolds-Number Airfoils, Ann. Rev.
  Fluid Mech. 15, 1983, after Carmichael, NASA CR-165803). The UIUC data
  start at 6e4, and the retained lift the model is built on is a
  reattachment effect.
  - Walking pace and the gear settling are 0.1e4 to 2e4, so they are
    exactly main's.
  - Every flight speed here is over 7e4. The Slow Stick at its stall is
    8.4e4.
  - Below the fade the plant keeps the model it had, including the Slow
    Stick's first post stall moment (`lowre_arm_*`). There is no data to
    replace it with.

The result, `npm run stall:crossing` against main 16ac766:

| Recording | Where it first differs |
| --- | --- |
| Wing | identical for all 20 s |
| Slow Stick (starts on its wheels) | identical for all 22 s |
| Cub (starts on its wheels) | 1.25 s: 2.2 m/s, Re 30k, alpha 15.7 against a stall angle of 12.5 |
| Timber (starts on its wheels) | 1.14 s: 1.9 m/s, Re 30k, alpha 20.0 with flaps against 18.4 |
| Timber on floats | 2.35 s: 11.2 m/s |
| Skyhunter | 7.68 s |
| Radian | 7.78 s |
| Bramor | 7.65 s |

Every one of these first differs past its stall angle and above Re 3e4.

The ground roll checks against main:

| Check | Main | Now | Result |
| --- | --- | --- | --- |
| Timber T10 lift off | 2.05 m at 6.78 m/s | 2.00 m at 6.71 m/s | in band, not identical |
| cub:stab take off, heading | 1.0 deg, lift off at 10.4 m and 10.3 m/s | 1.6 deg, lift off at 7.1 m and 9.2 m/s | passes (limit 5 deg), not identical |
| Slow Stick S15 | as main | identical | passes |
| wing:contact, timber:stab, slowstick:stab, whoop:gates, contact:selftest | as main | byte for byte | pass |
| crash:core | 148 of 148 | 148 of 148 | the Cub and Timber rollouts identical with damage on and off; the floats digest agrees in Node and Chrome |

- **T10:** the flapped rotation reaches the flapped stall angle.
- **cub:stab:** the Cub's three point attitude, 16 deg of angle of attack,
  is 3.4 deg past its stall angle. The section holds lift there that the
  old blend dropped to the plate, so it lifts off sooner.

Neither can be identical without switching the model off at the stall
speed. Both pass.

## What each aircraft does now, against what is published

`npm run stall:probe`: 300 m up, launched at 1.15 V_s, the stick brought
from centre to full back over 2 s and held (the handbook's entry). The
columns:

- A: power off, full back held 10 s.
- B: full back with full right rudder from 2 deg short of the stall (the
  flying wings have no rudder, so full right roll).
- C: spin recovery. B for 5 s, then full left rudder with the stick half
  forward until the rotation stops.
- D: stall recovery. A for 5 s, then the stick centred.
- E: A flown in Acro.

"Wing drop" is the largest bank between the stall and the nose's lowest
point; "10 s" is the largest bank over the whole 10 s hold.

| Airframe | A: nose drop, wing drop | A: 10 s bank, end state | B | C | D | E |
| --- | --- | --- | --- | --- | --- | --- |
| main, every plane | a settle as it slows, 0.0 | 0.0; nose 12 to 28 over the path | Radian and Bramor only | | | wings level |
| 1000 mm wing | 23 deg, 5 | 5; a mush at alpha 23 | a spiral, no rudder | 0.02 s | 0.20 s | 2 |
| Skyhunter | 8, 3 | 18; a mush at 15 | spins, 99 deg/s | 0.06 s | 0.14 s | 0.5 |
| Cub | 10, 2 | 18; a mush at 16 | spins, 67 deg/s | 0.08 s | 0.14 s | 3 |
| Cub on floats | 11, 2 | 15 | spins, 74 deg/s | 0.08 s | 0.15 s | 3 |
| Slow Stick | 13, 0 | 2; a mush at 18 | a spiral at alpha 13, no spin | 0.06 s | 0.16 s | 6 |
| Radian | 49, **66** | 66; a spiral dive | spins, 404 deg/s at alpha 29 | 0.39 s, 3.9 m | 0.10 s | 33 |
| Timber, slats on | 13, 1 | 19; a mush at 20 | yaws 59 deg/s: a spiral | 0.09 s | 0.12 s | 1 |
| Timber, slats off | 24, 14 | 47 | spins, 319 deg/s | 0.50 s, 7.1 m | 0.10 s | 4 |
| Timber on floats | 6, 1 | 18 | a spiral | 0.09 s | 0.13 s | 1 |
| Bramor | 91, **178** | a flat spin at alpha 71 | a flat spin, 420 deg/s | **none in 7 s** | **none in 7 s** | 3 |

What is published, from a search of manuals, magazine reviews and
RCGroups. No source tests a held wings level stall to a number, or a pro
spin entry.

- **Timber:** "they just sort of mush along and never drop a wing" (Greg
  Gimlick, Model Aviation, Feb 2020, slats fitted). Without slats, an
  RCGroups post: "it just drops the nose a little and starts flying again
  if you hold full up and no throttle". **The premise that the Timber
  stalls sharply without its slats found no source.** The sharp stall in
  the forums is the Timber X's. The plant with slats matches the review.
  Without them it drops 14 deg at the break and 47 over 10 s, because the
  NACA 2415 class the derivation chose falls to 0.63. That section class
  is the estimate to revisit, not the asymmetry.
- **Cub:** a HobbyZone Carbon Cub, "stalls are uneventful" (Model Aviation,
  May 2018); a HobbyKing Cub, "nice stall characteristics but it's easy to
  get into a wingtip stall" (Flite Test). The plant matches.
- **Slow Stick:** "She'll stall if pushed but only if bags of elevator is
  fed in while the model is virtually stationary" (RCM&E, 2008). The
  plant: no wing drop in the probe, but S9's abrupt full up from cruise
  drops it 21 to 27 deg (below).
- **Radian:** "stalls are extremely gentle. More of a flat mush than an
  abrupt drop of the nose" (RCGroups, an aft CG). **The plant does not
  match.** It drops 66 deg and spirals, because the SD7037 class holds its
  lift only 1.4 deg past its peak and the Radian's 24 deg of elevator holds
  it 5 deg past the stall. The Radian's section is not published; the
  class is the estimate to revisit.
- **Skyhunter:** no wings level stall report. One heavy, aft CG airframe
  stalls "toward the outside wing" in a turn (RCGroups).
- **Bramor:** its manual gives the stall speed and warnings, and no stall
  behaviour. It recovers under its autopilot or the parachute. The plant's
  tip stall and flat spin come from the tapered, cranked planform's
  outboard loading and the stalled strips' drag. Without that drag the
  Bramor drops 5 deg. Its flat spin does not recover on the elevons.

## What changed in the gates, and the stored hashes

Against main 16ac766, fresh wasm on both sides. Gates that moved and still
pass:

- The stall speeds (all in band).
- C17 to C21, the Cub's take off, landing and prop strike on the roll.
- T8, T10 to T12.
- F4c, F5c, F5t.
- G14 and G19, the Radian's thermal circle and phugoid, which reach its
  stall.
- The stab tests' full up pitch rates.

Gates that fail, for the lead (not re-recorded, no threshold moved):

- **Slow Stick S9a and S9b**, full up held for 8 s from cruise, "no wing
  drop". The limits are bank under 15 deg and yaw under 20 deg/s; the
  plant gives 21.5 and 27.0 deg of bank and 41 deg/s. An abrupt full up
  from cruise overshoots deeper than the probe's ramp, where the drop is 0.
  It was 57 deg in the first version.
- **Bramor B1**, cruise speed. levelSpeed throws every airframe at 12 m/s,
  which is under the Bramor's 13 m/s published stall. It tip stalls and
  departs into the flat spin above, and the level hold does not recover it
  (8.8 m/s, sinking 8.7). The gate measures cruise; its launch is a stall.
- **The stored hash gates** C22, G20, B13, S17, T14 and F9 fail, on the
  recordings below. The five inch's and the wing's hashes are unchanged,
  so S15 and W10 pass.

What each recording does where it crosses the stall
(`npm run stall:crossing`), before and after:

- **wing** (W, hashed by S15, C22 and others): identical, and its hash is
  unchanged (acdf88a78f9e60fc).
- **sky** (cd36bb2fa1e28654, now eb30ef2c8bd5011d): stalls 7.66 to 11.42 s
  in a rolling manoeuvre, to 20 deg at 16 m/s and more. Its lowest pitch
  goes from −67 to −73 and the largest bank stays 136 in both. It ends
  136 m and 134 deg of heading from main.
- **cub** (6b17876c611e2f16, now 0ed5c15863816664): stalls 1.25 to 2.49 s
  on the take off roll's three point attitude, at 2.2 m/s and more. It
  lifts off sooner, with the lowest pitch 5 to −1 and the bank 2 to 5.
  It ends 14 m and 31 deg of heading apart.
- **glider** (21aa64a437a83a43, now fad799e2216a527d): stalls 7.78 to
  8.96 s (to 18.6 deg, the lowest pitch −34 to −27, the bank 0 to 8) and
  54.1 to 55.7 s (to 14.9 deg, the pitch −36 to −52, the bank 33 to 60,
  a wing drop in a turn). It ends 43 m apart.
- **bramor** (b89d463766f03c1a, now c19753c25ac88422): stalls from 7.40 to
  15.21 s in the recording's manoeuvre, to 19 deg. The lowest pitch goes
  from −32 to −87: it tip stalls into a dive. It ends 115 m apart.
- **bramorChute** (deb8e145e13643a0, now 7d5a9dbe954f3fe0): differs from
  the pull because the risers moved (below). Under the canopy it hangs on
  its back as before (B11 and B12 pass), and it ends 0.28 m apart.
- **slowstick** (19f2b1074b5fcd39): identical.
- **timber** (fff2e89112b65a67, now 9c8843824d3015e1): stalls 1.14 to
  1.60 s on the take off roll, which barely moves (the pitch 5.9 to 4.5).
  Then 11.95 to 13.25 s in a chop with full rudder, to 29 deg, with the
  pitch at −43 and the bank at 92 in both. It ends 62 m apart.
- **timberf** (f6add9915fed1541, now 15a51d0ff3c11e6f, F10's): stalls three
  times on the water and in the air: at 2.35 s (the lowest pitch 8 to 18),
  22.2 s and 24.5 s (the pitch −2 to −9, 3 to 0). It ends 14 m apart.

## The Bramor's risers

The risers' point is placed where the canopy's pull balances the plant's
pitching moment hanging flat on its back. On main that moment was the
linear one at −90 deg, 0.713. With the post stall terms, fully stalled at
−90 deg, it is 0.530, so the same rule moves the point from 64 to 48 mm
ahead of the CG (scripts/bramor-derive.js).

## The crash suite

Against main 16ac766 (fresh wasm both): 9 of 60 inside every band before
and after, failing checks 134 to 135, all 60 deterministic in Node, replay
and Chrome. The stall ins:

| Scenario | peak g | rest distance, m | rest | failing now |
| --- | --- | --- | --- | --- |
| sky-stall | 65 to 108 | 3.0 to 1.2 | upright, upright | mustNotBreak, peakG, restAttitude |
| cub-stall | 37 to 22 | 4.8 to 16.9 | upright, upright | mustBreak, peakG, restAttitude, restDistM, timeToRestS (as main) |
| radian-stall | 140 to 124 | 2.3 to 1.5 | upright, upright | mustBreak, mustNotBreak, restAttitude |
| slowstick-stall | 30 to 14 | 7.8 to 9.8 | upright, upright | as main |
| timber-stall | 29 to 15 | 10.5 to 26.0 | upright, upright | as main |
| bramor-stall | 89 to 147 | 5.4 to 6.3 | upright, upright | as main |
| bramor-catapult-stall | 57 to 59 | 11.4 to 11.7 | upright, upright | restAttitude, timeToRestS |

**The Cub and Timber stalls do not come back.** The lead's note on #60
expected the sourced pitch break to fix them. It does not, and the reason
is the source. A Cub or a Timber held full back from 8 m now does what its
reviews say: the nose drops 10 to 13 deg, the wings stay within a few
degrees, and it mushes down onto its gear and rolls on, now further. The
suite's reference for these scenarios is "a wing or the nose drops and it
hits nose low", from R-C172 and R-DIG, full scale and taildragger accident
records. The kits' published behaviour and those bands disagree, and which
one the scenario should follow is the lead's call.

## What the owner should feel

- **Short of the stall:** nothing changes. Every flight that stays short of
  it, and every roll on the ground below walking pace, is the same to the
  bit.
- **At the stall, on the Cub, the Skyhunter and the Timber (slats on):** the
  nose drops 8 to 13 deg and they mush with the wings nearly level. Hold
  full back for ten seconds and they wander into a gentle 15 to 20 deg
  bank.
- **The Slow Stick:** barely does anything.
- **Centring the stick:** each flies again within 0.1 to 0.2 s.
- **Full rudder at the stall:** the Skyhunter, the Cub and the Timber
  without slats spin toward the rudder. Opposite rudder with forward stick
  stops the spin within about half a second.
- **The Radian:** drops a wing hard (the known gap above).
- **The Bramor:** tip stalls and goes into a flat spin, and the answer
  there is the chute.

What would be wrong:

- A wing drop at cruise.
- A spin against the rudder.
- A conventional aircraft that will not come out of a spin on opposite
  rudder and forward stick.
- A Cub or Timber that rolls past 30 deg the moment it stalls.

## The second return: the Radian, the Bramor, B1 and S9

The lead sent #59 back once more on four points. What was found, in order.

**B1 was the test's input.** levelSpeed threw every airframe at a shared
12 m/s, under the Bramor's published 13 m/s stall (the user manual's VST),
so its cruise gate began with a stall. It now starts at the manual's Best
Endurance Speed, VBE 16 m/s (also C-Astral's published cruise, "16 m/s"),
in its own commit, with the band unchanged: 16.62 m/s on this module and
on main's.

**S9: the dynamic pull differed because the stall took no time.** A
sudden full up from cruise overshoots the angle of attack past every
strip's fall within a few tenths of a second (it did on main too, to 26.6
deg), and the model met the whole separation at once. The RCM&E review
says it stalls "only if bags of elevator is fed in while the model is
virtually stationary". Each strip's shortfall now follows its steady value
with Leishman and Beddoes' separation time constant, T_f = 3 semichords
(J. American Helicopter Society 34(3), 1989). S9a now passes: 2.7 deg of
bank, 4.9 deg/s. The gentle probe did not move by more than a tenth of a
degree. S9b, power on, still fails, and it is a different thing: not a
drop at the pull but a slow torque turn that tightens, the bank growing
about 2.5 deg a second to 22 deg at 8 s, the inner wing retreating deeper
into its stall. No source describes a Slow Stick held full up under power.

**The Radian: the data insist, given the geometry nobody publishes.** No
source was found for the Radian's section, twist or tips (E-flite says
"efficient airfoil" and "curved polyhedral wing"; RCGroups was not
reachable). Why it drops, exactly: its strips stall at 10.5 to 12.6 deg
(the drawn planform, loaded by Schrenk), the SD7037 class holds its lift
only 1.4 deg past that, and its 24.4 deg of up elevator holds 13.9 deg,
past every strip's stall and into the roots' fall. The Cub, by contrast,
holds 16 deg against strips that stall at 12.6 to 17.7 deg and a Clark-Y
top 4.6 deg long, so its tips are still flying. Held at part stick the
Radian still drops (18 deg at 40 percent, 10 at 50, 45 at 70). What would
change it is a source for washout, a longer top (a thicker section) or
the rates the review flew on; none was found.

**The Bramor: nothing published says it is spin resistant, or twisted.**
C-Astral's manual gives the stall speed, cruise and warnings about low
airspeed, and no stall or spin behaviour; recovery is the autopilot and
the parachute. The general sources (the washout and swept wing literature,
RC flying wing practice, "2 to 6 degrees" of washout) put a swept flying
wing's spin resistance in washout or in extra reflex at the tips, and say
sweep alone promotes tip stall. The model's Bramor has neither: the drawn
cranked planform loads five eighths of the way out, so that strip stalls
first, and there is no twist because none is published. Its flat spin is
therefore what an untwisted Bramor would do, not a sourced Bramor; with
the chute the answer, as the lead said.

**A finding against the version the lead liked.** Each strip's shortfall
is taken against r times the plant's linear CL, which carries the
elevator's lift, the tail's. With full up that is about 0.1 of lift the
strip's reference lacks and its held CLmax does not, and through the stall
blend it adds roll damping, about 1.5 per rad on the Radian. That is what
kept the trainers level at the break. Taken consistently (the strip's own
wing lift against the linear wing's share; branch
crash-aero-round4-strip-ref, not on #59), a flat topped section has no
roll damping on its top, as a flat lift curve does not, and held full back
the Cub, the Timber and the Slow Stick still break gently (1 to 9 deg) but
wander into 40 to 50 deg of bank over 10 s, the Skyhunter drops 61 deg and
the Radian 75, and S9a fails again. Which one the owner flies is the
lead's call: #59 as it is flies as the reviews describe but rests on that
term; the consistent one needs a source for washout, or tip strips that
keep flying, to be as gentle.

Crash suite with the separation lag, against main 16ac766: 9 of 60 inside
every band, failing checks 134 to 138, 60 deterministic. Stall ins, peak g
and rest distance: Skyhunter 65 to 127 g and 3.0 to 13.3 m, Cub 37 to 21
g and 4.8 to 16.9 m, Radian 140 to 110 g, Slow Stick 30 to 24 g, Timber
29 to 15 g and 10.5 to 25.4 m, Bramor 89 to 144 g, catapult 57 to 58 g;
all rest upright, as on main.

## The third return: the strip fix, fitted washout, the chute, the Bombshell

The lead's decision: a model that is gentle only because of a bug does not
ship. The strip fix is on #59 (each strip's shortfall against its own wing
lift, no elevator in it), and the gap to the reviews it opens is closed by
one identified parameter per airframe, `washout`.

### Washout: FITTED, not sourced

No kit publishes its wing twist. `washout` is the tip twisted nose down
from the root, linear along the span; it moves each strip's stall later by
its share of the semispan and changes nothing short of the stall. Each
value below is the smallest, in half degree steps, that brings the
airframe's behaviour inside what its review describes, bounded at a few
degrees. The criterion read from each review is written next to it; the
reviews give no numbers, so the reading is this document's.

| Airframe | washout, FITTED | The review | Criterion read from it | Result |
| --- | --- | --- | --- | --- |
| Cub (and floats) | 1.5 deg | "Stalls are uneventful" (Greg Gimlick, Model Aviation, May 2018, HobbyZone Carbon Cub S+); "nice stall characteristics but it's easy to get into a wingtip stall" (Flite Test, HK Cub) | wing drop at the break under 10 deg, and held full back 10 s, under 30 deg of bank | drop 2.3, 10 s 24.4 (1.0 deg gives 30.4) |
| Skyhunter | 4.0 deg | none of a wings level stall: one owner's "previous grey Skyhunter never did this at any speed" (RCGroups), of a cross controlled stall on another | as the Cub's | drop 3.5, 10 s 24.5 (3.5 deg gives 30.5) |
| Timber (and floats) | 3.0 deg | slats on: "they just sort of mush along and never drop a wing" (Model Aviation, Feb 2020) | as the Cub's | drop 3.1, 10 s 29.9 |
| Timber, slats off | the same wing, 3.0 | "it just drops the nose a little and starts flying again if you hold full up and no throttle" (RCGroups post) | as the Cub's | drop 8.6, **10 s 42.1: not met by 5 deg** (26.5 at 5) |
| Slow Stick | 1.5 deg | "She'll stall if pushed but only if bags of elevator is fed in while the model is virtually stationary" (David Ashby, RCM&E, 2008) | S9a, full up from cruise: no wing drop (its gate's 15 deg and 20 deg/s) | S9a bank 10.2, yaw 17.1 |
| Bombshell | 2.0 deg | "gentle flying characteristics" (Brodak's Spirit of Yesteryear kit, docs/BOMBSHELL-STAGE1.md) | its own S9a and S9b, full up from cruise off and on: bank 15, yaw 20 deg/s | S9a bank 6.4, S9b 13.1 and 15.3 deg/s |
| Radian | **none, left 0** | "stalls are extremely gentle. More of a flat mush than an abrupt drop of the nose" (RCGroups, an aft CG) | wing drop under 10 deg | **not met within the bound**: 75 at 0, 47 at 5 deg. Stopped there, as instructed |
| Bramor | 0, by decision | nothing published | | a flat spin; the chute recovers it (below) |

The fit and the probe are the same flight (`npm run stall:probe`, A), so
this is a fit, not a prediction: it says the model can meet each review
with a twist a moulded foam or built up wing could plausibly have, and
what that twist is. The Timber without its slats and the Radian it cannot
meet within a few degrees, and those stay open.

### The chute recovers the Bramor from its flat spin

`node scripts/bramor-spin-chute.js`: from the flat spin (alpha 75 deg,
turning 485 deg/s) the chute is pulled, which cuts the motor and centres
the surfaces. The manual's minimum deployment height was not found, so
every release from the lowest the canopy can open in up to 197 m is
checked:

| Pulled at | Sink over the last 10 m (rated 4 to 6) | Turning there, at most | At the grass |
| --- | --- | --- | --- |
| 17 m | 5.11 m/s | 355 deg/s | still swinging, right way up |
| 37 m | 5.61 m/s | 167 deg/s | swinging onto its back |
| 77 m | 5.00 m/s | 50 deg/s | on its back |
| 197 m | 5.00 m/s | 14 deg/s | on its back |

It is at the canopy's rated sink from every height; the spin itself takes
until about 70 m of descent to wind down under the canopy.

### What each aircraft does now

`npm run stall:probe`, as before. B's yaw rate over its last 3 s.

| Airframe | Nose drop | Wing drop | 10 s bank | Spin (B) | Spin recovery (C) | Stall recovery (D) | Acro drop / 10 s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 mm wing | 23 | 10 | 10 | a spiral, no rudder | 0.02 s | 0.19 s | 1 / 1 |
| Skyhunter | 8 | 4 | 25 | no, 56 deg/s | 0.09 s | 0.14 s | 2 / 5 |
| Cub | 10 | 2 | 24 | yes, 61 deg/s | 0.09 s | 0.14 s | 2 / 8 |
| Cub on floats | 11 | 2 | 21 | yes, 65 deg/s | 0.09 s | 0.15 s | 2 / 7 |
| Slow Stick | 13 | 0 | 10 | no, a spiral | 0.06 s | 0.16 s | 1 / 5 |
| Radian | 58 | **75** | 75 | yes, 415 deg/s | 0.42 s | **none in 7 s** | 24 / 49 |
| Timber | 13 | 3 | 30 | no, 57 deg/s | 0.09 s | 0.12 s | 1 / 3 |
| Timber, slats off | 23 | 9 | **42** | yes, 574 deg/s | 0.76 s | 0.10 s | 2 / 4 |
| Timber on floats | 6 | 3 | 27 | no, 53 deg/s | 0.09 s | 0.13 s | 1 / 3 |
| Bombshell | 13 | 0 | 6 | yes, 144 deg/s | 0.04 s | 0.12 s | 1 / 3 |
| Bramor | 64 | **178** | a flat spin | a flat spin | **none**: the chute | **none**: the chute | 2 / 2 |

The Skyhunter and the Timber no longer spin on full rudder; with their
fitted twist the rudder yaws them into a spiral, and the Cub and the
Bombshell spin gently.

### Gates

On this branch against main d94aec4 (the Bombshell merged): identical to
main's module on wing:gates, wing:contact, wing:stab, wing:math,
timber:stab, slowstick:stab, whoop:gates, contact:selftest, waves; crash:
core 152 of 152; stall:crossing: the wing and Slow Stick recordings
identical, every other first differing past its stall angle and above Re
3e4. T10 (6.71 m/s) and cub:stab's take off heading (1.4 deg) pass.

Failing, for the lead and the owner, none loosened:

- The stored hashes: C22, G20, B13, S17, T14, F9, and the Bombshell's S17.
  Before and after, the recordings' own hashes: sky cd36bb2fa1e28654 to
  f16c250db541ab96; cub 6b17876c611e2f16 to bbfd2845f82fb011; glider
  21aa64a437a83a43 to 19df6b74849661c9; bramor b89d463766f03c1a to
  2e0b3a9386b37daf; bramor chute deb8e145e13643a0 to a0bcd4b91765333e;
  timber fff2e89112b65a67 to 0ad33a5cbdb1d760; timber on floats
  f6add9915fed1541 to 652f7ee7a0b7a712; the Bombshell's own
  0a5cc5470ecadc7e to 7f31d316db42f030; the wing, the Slow Stick and the
  five inch unchanged. What each does where it crosses the stall:
  `npm run stall:crossing`.
- Slow Stick S9b, full up held under power: bank 27.2, yaw 41.9 deg/s
  against 15 and 20. Not a drop at the pull but a torque turn that
  tightens as the inner wing sinks into its stall; washout up to 4 deg
  brings it to 15.8 and 25.7, still out. No source describes a Slow Stick
  held full up under power, so it stays failing.
- Bombshell S9a: bank 6.4 and yaw 7.8 inside, but the mush sinks 2.12 m/s
  against 2.25 to 3.75, a band derived on the flat plate past the stall
  that the section data replace (it read 3.15 on main). The section holds
  more lift in the mush; the band's derivation is the thing to revisit.
- bombshell:stab, the take off roll's heading: 6.2 deg and 0.73 m off
  against 5 deg and 0.5 m. On main it read 4.9 deg and 0.50 m, at the
  edge; the three point roll sits past the stall, where the section's lift
  now holds, and washout does not move it (5.7 to 6.3 from 0 to 4 deg).

Crash suite against main d94aec4: 9 of 60 inside every band before and
after, failing checks 134 to 136, 60 deterministic. Stall ins, peak g and
rest distance, main to this: Skyhunter 65 to 123 g, 3.0 to 13.7 m; Cub 37
to 22 g, 4.8 to 25.0 m; Radian 140 to 136 g; Slow Stick 30 to 17 g;
Timber 29 to 14 g, 10.5 to 25.9 m; Bramor 89 to 121 g; catapult 57 to 58
g; all rest upright, as on main.

## The fourth return: the sink held full back

The owner flew 37804b3: the Cub "drops like a rock with wings level".
`npm run stall:sink` (scripts/stall-sink.js) holds full back, power off,
from 1.15 V_s, 14 s, and averages the last 6 s.

**The cause.** Past the stall the wing held the lift at the stall angle,
which is the plant's blend midpoint: on the Cub 0.74, 0.64 of its CLmax
and about 0.1 under the peak the plant's own curve reaches just before
the stall. The UIUC sections hold their peak flat past the stall. The
wing now holds the peak of the plant's own curve, so the lift past the
stall never exceeds what the wing reached before it. Holding the table's
CLmax instead (tried: the Cub at 1.9 m/s) makes the lift rise past the
stall above its pre-stall peak, a mush slower than the stall speed; not
done. Drag was checked and is not the cause: at the Cub's 16 deg the
plate's 2 sin² alpha is within 0.06 of a 3D wing's Viterna CDmax at its
aspect ratio. The tail's authority was not the cause either: the Cub's
full up trims at 16 to 17 deg, not 40 (40 is the probe's spin with full
rudder, a different thing).

The washout was refitted by the same rule for the new trims: Cub 3 deg,
Skyhunter 5 (at the bound), Timber 2 (the break drop only; its 10 s bank
is 50 and not met by 5 deg), Slow Stick 2, Bombshell 3, Radian none.

Held full back, power off, mean of the last 6 s, sink in m/s (airspeed,
alpha):

| Airframe | main d94aec4 (Stabilised) | 37804b3 (Stabilised) | now, Manual | now, Stabilised | now, Acro |
| --- | --- | --- | --- | --- | --- |
| 1000 mm wing | 3.47 (7.1, 27.8) | 4.37 | 4.20 (8.5, 22.6) | 4.19 | 4.19 |
| Skyhunter | 4.67 (10.6, 24.0) | 2.63 | 3.00 (11.8, 14.5) | 2.35 (10.8, 15.5) | 2.37 |
| Cub | 4.48 (9.0, 27.3) | 2.66 | 2.70 (9.8, 16.3) | 2.36 (9.3, 16.9) | 2.39 |
| Cub on floats | 4.96 | 3.12 | 2.97 | 2.76 | 2.79 |
| Slow Stick | 2.09 (5.7, 17.9) | 1.79 | 1.72 (5.3, 18.4) | 1.72 | 1.72 |
| Radian | 3.20 (7.2, 25.2) | 2.78 | 9.49, a spiral dive | 2.27 (8.6, 16.3) | 4.20 |
| Timber | 4.50 (8.8, 28.3) | 2.73 | 3.90 (10.5, 18.7) | 2.32 (8.4, 20.7) | 2.40 |
| Timber on floats | 4.90 | 3.07 | 4.34 | 2.61 | 2.66 |
| Bramor | 4.97 (13.2, 20.0) | 5.80 | 8.21, a flat spin | 5.72 (14.4, 18.9) | 5.72 |
| Bombshell | 3.00 (8.7, 15.7) | 2.16 | 1.89 (7.7, 15.3) | 1.87 (7.6, 14.9) | 1.97 |

A Cub of this wing loading, 46 N/m², mushing at its CLmax of 1.15 with a
stalled drag coefficient about 0.2 (UIUC's Clark-Y drag jumps to 0.1 to
0.2 past its stall, and the induced drag adds 0.08) comes down at about
1.5 to 2 m/s: 2.4 is at the top of that, and the mush bobs, 0.8 to 4.5
m/s over the first 10 s after the break. The flying wings sink faster
than on main: the 1000 mm wing's peak hold trims it at 22.6 deg of alpha
where main's flat plate trimmed at 27.8, and the Bramor's reflexed wing
holds full up at 18.9 deg. The Bombshell's held back sink, 1.9 m/s, is
under the 2.25 to 3.75 its S9a band was derived for on the plate.

The table of each aircraft past the stall, `npm run stall:probe`:

| Airframe | Nose drop | Wing drop | 10 s bank | Spin (B) | Spin recovery | Stall recovery | Acro drop / 10 s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 mm wing | 25 | 18 | 18 | a spiral, no rudder | 0.02 s | 0.17 s | 1 / 1 |
| Skyhunter | 5 | 5 | 26 | no, 59 deg/s | 0.10 s | 0.16 s | 2 / 6 |
| Cub | 7 | 3 | 20 | yes, 62 deg/s | 0.10 s | 0.17 s | 2 / 7 |
| Cub on floats | 7 | 3 | 16 | yes, 64 deg/s | 0.10 s | 0.17 s | 2 / 7 |
| Slow Stick | 10 | 1 | 9 | no | 0.06 s | 0.17 s | 1 / 4 |
| Radian | 51 | 72 | 72 | yes, 409 deg/s | 0.38 s | none in 7 s | 48 / 52 |
| Timber | 16 | 7 | 51 | yes, 70 deg/s | 0.09 s | 0.14 s | 2 / 10 |
| Timber, slats off | 22 | 8 | 50 | yes, 572 deg/s | 0.75 s | 0.11 s | 3 / 6 |
| Timber on floats | 10 | 11 | 49 | yes, 68 deg/s | 0.09 s | 0.14 s | 1 / 8 |
| Bombshell | 11 | 0 | 5 | yes, 142 deg/s | 0.04 s | 0.13 s | 1 / 3 |
| Bramor | 70 | 179 | a flat spin | a flat spin | the chute | the chute | 2 / 2 |

The chute still recovers the Bramor from the flat spin at 5.0 to 5.6 m/s
from every release, 17 to 197 m (bramor-spin-chute.js).

Gates on this build, against main d94aec4: crash:core 152 of 152; T10
6.68 m/s, cub:stab heading 1.6 deg and the Slow Stick's S15 pass;
stall:crossing: the wing and the Slow Stick identical, every other
recording first differing past its stall angle and above Re 3e4.
Failing: the stored hashes (their recordings now sky 6b509cb9135b1740,
cub d71e921bcbbf0b5e, glider 9eb65aac246a3ee0, bramor e6574d76eb555a92,
bramor chute 0751523e69b3683d, timber e2997c1ee95aa05f, timber on floats
b99b736a464c870a, Bombshell d44c698cc7a6f6d1); Slow Stick S9b (bank 28.7,
yaw 44.5); Bombshell S9a (its sink, 1.91 against 2.25 to 3.75; bank 5.1
and yaw 6.5 inside); bombshell:stab's take off heading (6.6 deg, 0.80 m
against 5 and 0.5; 4.9 and 0.50 on main).

Crash suite against main d94aec4: 9 of 60 inside every band, failing
checks 134 to 133, 60 deterministic. Stall ins, peak g and rest
distance: Skyhunter 65 to 186 g, 3.0 to 21.7 m; Cub 37 to 10 g, 4.8 to
18.4 m; Radian 140 to 135 g; Slow Stick 30 to 17 g; Timber 29 to 8 g,
10.5 to 23.3 m; Bramor 89 to 129 g; catapult 57 to 58 g; all upright.

## Sign-off, re-recording, and what stays open

The owner flew the Cub's stall on b69e0df and signed it off ("works").
On that, the lead decided the stored hashes are re-recorded. With main
fa6d228 merged (#65's Stabilised pitch-down law), each gate's hashes were
re-recorded from the merged build, one commit per gate, each naming what
in its recordings crosses the stall (npm run stall:crossing):

| Recording | Before | After | Where it crosses the stall |
| --- | --- | --- | --- |
| Skyhunter | cd36bb2fa1e28654 | 6b509cb9135b1740 | 7.66 to 11.42 s, its rolling manoeuvre, to 20 deg |
| Cub | 6b17876c611e2f16 | d71e921bcbbf0b5e | its take off roll's three point attitude, 1.25 to 2.49 s |
| Radian | 21aa64a437a83a43 | 9eb65aac246a3ee0 | 7.78 to 8.96 s, and 54.1 to 55.7 s in a turn |
| Bramor | b89d463766f03c1a | e6574d76eb555a92 | 7.40 to 15.21 s, a tip stall into a dive |
| Bramor chute | deb8e145e13643a0 | 0751523e69b3683d | from the pull (the risers moved) and under the canopy |
| Timber | fff2e89112b65a67 | e2997c1ee95aa05f | its flapped take off roll, and a chop with full rudder at 12 s |
| Timber on floats | f6add9915fed1541 | b99b736a464c870a | on the step at 2.35 s, and at 22.2 and 24.5 s |

The five inch's, the wing's and the Slow Stick's recordings are
unchanged. stab:glide --check reports no drift and stab:chop holds: the
Stabilised glides are all short of the stall.

The Bombshell's S9a sink band was derived on the flat plate past the stall
(3.00 m/s), a premise the model no longer has. bombshell-derive.js now
derives its mush on the post stall model, from its own geometry: 15.3 deg,
7.7 m/s, 1.98 m/s; the band is that within 25 percent, 1.48 to 2.47, and
the plant flies it at 1.91.

Open, each left failing or unmet on purpose:

- **Slow Stick S9b**, full up held under power: bank 28.7 and yaw 44.5
  deg/s against 15 and 20. A torque turn that tightens as the inner wing
  sinks into its stall; washout up to 4 deg does not bring it inside. No
  source describes a Slow Stick held full up under power.
- **The Bombshell's take off heading** (bombshell:stab): 6.6 deg and 0.80 m
  against 5 and 0.5, where main reads 4.9 and 0.50. The three point roll
  sits past the stall, where the section's lift now holds; washout does
  not move it.
- **The Timber held full back in Manual** wanders into 50 deg of bank in
  10 s; the break is gentle (7 deg), but no washout up to 5 deg holds the
  10 s bank under 30. In Stabilised and Acro it holds wings level.
- **The Radian** drops 72 deg against a review of "extremely gentle"; no
  washout within a few degrees fits, and its section, twist and tips are
  not published.
- **The Bramor**, untwisted by decision, tip stalls into a flat spin its
  elevons do not recover; the chute recovers it at its rated sink.

## Round 5: the four open items, measured, and why none is built

Crash round 5's aero brief (docs/CRASH-PLAN.md, "Round 5") took the four
open items above. Each was measured on main 9f4c313, and again on
0eaa193 (#70's part data, which moves no flight), against what it would
take to meet it. None could be met inside the rules this model works
under: flight short of the stall byte for byte what it was, no band or
bound moved, washout FITTED only up to the 5 deg the Skyhunter's fit
stopped at. So the plant is unchanged, and what each item needs is here
for the lead and the owner. The numbers come from `npm run stall:probe`,
`node scripts/crash-suite.js` and the gates, run on scratch builds that
changed one thing each; none of those builds is committed.

The probe gained one column, F: A's flight with the stick brought full
back at once instead of over 2 s. That is the entry the crash suite's
stall ins fly (tests/crash/scenarios.js) and the Slow Stick's S9, and it
is not the handbook's: the elevator overshoots the angle of attack well
past the stall before the pitch break comes. The probe's stall time also
skips its first sample, which is read before the step and held the
previous flight's angle (the Bramor's E read "stall at 0.00 s", now 0.92
s); no other number moved.

### The Radian

**Which Radian.** The model is the Radian Pro: ailerons on the roll stick
(`FW_MIX_TAIL`), on the classic 2 m Radian's wing (docs/GLIDER-STAGE1.md,
"Which Radian, and why"). The one review ("extremely gentle. More of a
flat mush than an abrupt drop of the nose", RCGroups, an aft CG) does not
say which variant it flew, and RCGroups still does not answer a fetch.

**The geometry is already in.** The brief asked for a drawing of the
wing. The Radian's derivation already measured one: the EFL4750 manual's
top view, a constant 0.200 m chord to 0.60 m out, the leading edge
curving back to 0.110 m at 0.95 m, a rounded tip, the trailing edge
straight (`strip_c` 1.101, 1.096, 1.074, 0.775 of the mean chord).
Averaging the tip strip over the rounded tip instead of reading it at
seven eighths gives the same Schrenk load, 0.897 of the wing's. The
planform loads the root most, so the root strip stalls first, at 10.5
deg, and the tip last, at 12.6: not a tip stall. The polyhedral's
dihedral effect is in Clβ (−0.182, the drawn 2 to 14 deg curve by strip
theory) at every angle, past the stall too. One geometric effect is not
modelled: a panel with local dihedral Γ meets the air at
atan(tan α cos Γ). At the tip strip, 11.2 deg of local dihedral, that is
0.3 deg less at 16 deg of angle of attack; at five eighths, 0.1. As
geometry it is worth about 0.3 deg of washout against the 6 the fit
below needs, so it was not added.

**Washout, FITTED by the rule, is not met within the bound.** The probe's
A (the handbook's entry), D, and F (the crash suite's entry):

| washout, deg | A: wing drop, 10 s bank | D: stall recovery | F: wing drop, 10 s bank |
| --- | --- | --- | --- |
| 0 (main) | 72, 72 | none in 7 s | 67, 70 |
| 2 | 66, 66 | none in 7 s | 61, 66 |
| 4 | 54, 59 | 0.11 s | 53, 63 |
| 5 (the bound) | 43, 43 | 0.12 s | 48, 48 |
| 5.5 | 5.7, 32 | 0.15 s | 45, 45 |
| 6 | 3.5, 24 | 0.16 s | 41, 41 |
| 8 | 1.3, 11 | 0.16 s | 27, 27 |
| 10 | 1.2, 11 | 0.16 s | 5.0, 13 |

- **D was not a stall that would not recover.** Centred, the wing
  unstalls within half a second (alpha 3.6 deg at 5.5 s). The probe also
  waits for the yaw rate to fall under 20 deg/s, and the Radian, left
  banked 57 deg with its ailerons centred, flies a banked phugoid that
  does not get there in 7 s.
- **6 deg meets the handbook's entry and not the suite's.** In the crash
  suite's radian-stall, 6 deg of washout arrives sinking 5.2 m/s with
  minUpZ 0.77, against main's 7.0 m/s and 0.28, still a wing drop, and
  its peak g goes from 135 to 177. The abrupt pull takes the angle of
  attack to 22.5 deg, past the washed out tips' stall as well, and a
  washout moves the tips' fall into that overshoot. A mush on the abrupt
  entry needs 10 deg, which no foam glider is built with.
- **The section is not the lever.** A longer top, the Clark-Y class's
  3.7 or 4.6 deg instead of the SD7037 class's 1.4, drops it further
  under A (74 and 75 deg): a section on its flat top has no roll damping,
  and a longer top holds more of the wing there.

**A check that moves with any fit: glider:stab's rudder roll.** "The roll
lock holds back at least three quarters of the roll that rudder gives in
Manual" flies its Manual reference from a 14 m/s throw with the pitch
stick at neutral. The Radian's neutral elevator trims 7.7 m/s, so it
zooms, and by the end of the 1 s rudder hold it is at 3.7 m/s and 21 deg
of angle of attack: the 53.4 deg it reads on main is partly a stalled
wing's drop. Any washout of 5 deg or more takes some of that drop away
and the reference falls to 45 to 47 deg, under the 47.6 the check needs
against Acro's 11.9. Flown with the elevator Acro holds level on, so the
rudder meets the same speed, Manual rolls 37.0 deg on main, with or
without washout, and 11.9 is 32 percent of it: the check fails on main
as well once its reference does not stall. That is a question for the
Acro roll lock, not for the stall, and the check is left as it is.

### The Timber held full back

The drift is not the section's fall and not the tips. Held full back the
wing mushes at about 20 deg, where the root strip is past its top, the
middle two are on theirs and the tips are short of their stall. On a
flat top a strip has no roll damping, so the roll is left to the
dihedral (Clβ −0.047, 1.5 deg effective, ESTIMATED for a flat high wing
with drooped tips) against the yaw rate's roll, Clr = CL/4 at the mush's
lift. Seeded by the build asymmetry, the bank grows through the turn it
makes; with no asymmetry it stays level to the hundredth of a degree.

| Change, slats on unless said | 10 s bank |
| --- | --- |
| main | 50.5 (slats off 49.8) |
| no build asymmetry | 0.0 |
| washout 4, 5 (fitted 2) | 37.8, 35.1 (slats off 41.0, 33.0) |
| the slats' fall, slat_k 0.95 and 1.0 (0.84) | 50.9, 51.0 |
| the slats on their drawn span, 0.10 to 0.69 m, instead of spread over every strip | 42.8 |

The slats' span is a real correction the plant does not make: the
derivation puts them on 78 percent of the span (docs/TIMBER-STAGE1.md)
and the plant spreads their CLmax increment evenly, where by strip it is
0.47, 1, 1 and 0.68 of the full slat's. It helps and does not meet the
item, and it changes the Timber's recorded stalls, so it is left for
when the Timber's dihedral is looked at. What would meet the item is
more dihedral effect than 1.5 deg, and Clβ acts at every angle, so it
moves every Timber flight short of the stall too.

### The Slow Stick's S9b

Full up held under power: a steady turn to the left at 5.5 m/s that
tightens, 28.7 deg of bank and 44.5 deg/s at 8 s, not a spin. The
propeller terms, checked against the motor and prop (the GWS 11 x 8 at
75 percent, 2,475 rpm in the plant, 0.55 N at 5.5 m/s):

- **Torque.** The plant scales torque with thrust at the static ratio,
  0.0122 N m per N, 0.0067 N m here. By momentum theory the torque in
  flight is T (V + v_i)/Ω: v_i is 0.62 m/s, so 0.013 N m, about twice.
- **P factor.** The Cub's κ = 1 + φ/(2 α_b) at 0.75 R on this prop:
  blade angle 17.2 deg, inflow 12.7 deg, so κ is about 2.4 against the
  table's 1.6.
- **Slipstream.** Not modelled. Here it would raise the dynamic pressure
  over the wing's root and the tail by half, and take about 2 deg off the
  root strip's angle.

Both sized terms would turn it harder, not softer: with the torque
removed S9b reads 24.9 deg, with the P factor removed 24.9. So S9b is not
a propeller term that is too big. It is the Timber's drift again: the
wing on its flat top has no roll damping, and the torque and P factor
seed the turn that the yaw rate's roll then tightens. Washout 3, 4 and
5 deg (fitted 2) give 24.0, 19.2 and 15.9 deg of bank, still out at the
bound; with the strips removed, 7.7. The RCM&E review ("only if bags of
elevator is fed in while the model is virtually stationary") speaks of
the stall, not of a held powered pull.

### The Bombshell's take off heading

6.6 deg and 0.80 m off at lift off against 5 and 0.5; 4.85 deg before
#59. The propeller terms, against the Cox Texaco .049 on its 7 x 3.5:

- **P factor.** The Cub's κ on this prop: 12.0 deg of blade angle at
  0.75 R and 979 rad/s. Static, 6.8 m/s of induced velocity puts κ at
  1.50, and at 5 m/s of roll 1.75. The table's 1.6 is this prop's value
  over the roll.
- **Torque.** The ideal disc's 0.0197 N m at static full thrust, inside
  S11's band.

One thing at a time, the heading at lift off: no P factor −7.2 (it swings
right), no torque 9.1, no build asymmetry 6.8, no strips 6.8. With the
stalled wing's lift put back to the plate's (the lift before #59,
everything else as now), 4.5. That is the change: the three point
attitude sits at 13.2 deg against the 11.5 deg stall, where the section
holds its lift. The skid unloads sooner (0.06 N at 2.0 s against 0.14)
and the tail comes up at 2.5 s and 6.1 m/s instead of 3.0 s and 6.6
m/s, with less air on the fin, and the P factor and torque swing it
through that half second. The skid's friction is the gear's, ESTIMATED,
and not an aero number. Ground effect, which lowers the stall's angle
near the grass, is not modelled; it would act the other way, but it acts
short of the stall as well.

### What is left for a decision

- **The Radian:** a washout past the 5 deg bound (6 meets the handbook's
  entry, 10 the suite's), or leave it; and glider:stab's rudder roll
  reference, which stalls.
- **The Timber and S9b:** both criteria read a 10 s or 8 s wander, where
  a wing on its flat top has no roll damping. Meeting them needs the
  Timber's effective dihedral or the Slow Stick's propeller model, both
  of which act short of the stall.
- **The Bombshell:** its band was at its edge before the stall model,
  and the held lift on the three point roll is what the owner signed off.

The crash suite on main 0eaa193, which this round does not change: 60
deterministic, 11 inside every band. The stall ins, peak g, sink at the
contact and rest distance: sky-stall 186 g, 2.85 m/s, 21.7 m; cub-stall
10 g, 2.24, 18.4 (inside every band); radian-stall 135 g, 7.04, 1.2;
slowstick-stall 17 g, 1.74, 9.3; timber-stall 8 g, 2.15, 23.3 (inside
every band); bramor-stall 193 g, 6.39, 3.8; bramor-catapult-stall 58 g,
4.27, 14.0.
