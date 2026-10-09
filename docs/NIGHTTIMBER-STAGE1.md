# E-flite Night Timber X 1.2m: the contract and the derivation

Owner, 2026-10-08: "ok add the night timber including it lighting up when its
night out". The aircraft is E-flite's Night Timber X 1.2m (EFL13850 BNF Basic,
EFL13875 PNP), the aircraft flown in the video study
(~/Desktop/fdfpv-loop/analysis/3D-VIDEO-LESSONS.md). It is sim id 30, string id
`nighttimber1200`. Lead decision: it opens at level 6, between the Turbo Timber
(a starter) and the Extra 300 3D (9).

This document is the contract for four stacked PRs, and the derivation of the
first. Every number below is published, measured off E-flite's own pictures,
or derived by `scripts/nighttimber-derive.js`; the estimated ones say so.

## 1. What the player sees

1. **PR 1, the flight model (this PR).** No player-facing change. A plant
   table, its crash parts, its gates (`npm run nighttimber:gates`, in CI) and
   its recorded flight. Nothing in the hangar yet.
2. **PR 2, the aircraft.** The Night Timber X in the hangar carousel: a
   drawn model faithful to the real one (a high wing STOL taildragger, the
   slat pockets, the inboard flaps and outboard ailerons, the big tundra
   tyres, E-flite's white, orange red, black and grey scheme), its paint
   regions, every control surface deflecting with the sticks, the prop blur.
   Its three modes, its power options, its props and its strings in en and
   es.
3. **PR 3, the lights.** The real aircraft's LED system, drawn as glowing
   meshes: the wings lit from inside, the stabiliser lit from inside, the
   landing light in the cowl, the red and green wingtip navigation lights,
   the strobes and the red beacon on the wing's top. They come on by
   themselves when the map is at night, and a switch in its Kit page's
   lights sets them to always on or always off.
4. **PR 4, the unlock and the shop.** It opens at level 6, its Kit slots
   per docs/KITS.md, its shop items, en and es.

## 2. The aircraft, sourced

| Figure | Value | Source |
|---|---|---|
| Span | 1200 mm | E-flite manual EFL13850-Manual-EN.pdf p. 3; product page |
| Length | 1055 mm | the same |
| Wing area | 34 dm^2 with the slats; 28.66 dm^2 clean, the flown setup | manual p. 3; clean area from the top view, below |
| Flying weight | 1613 to 1698 g, taken 1698 g on the 4S 2200 | manual p. 3 ("57-60 oz"): the 3S and the 4S 2200 are 85 g apart, so the range is the two packs. The product infographic (EFL13875_A73) says 1613 g "without battery" and 1883 g with it; Model Aviation's Timber X review weighed its flying model at 54.5 oz, and E-flite says the Night Timber X keeps "the same flying weight as the original Timber X", so the infographic's 1883 g is not taken |
| Pack | 4S 2200 30C Smart, SPMX22004S30, 270 g | manual p. 8; the infographic's difference |
| CG | 89 mm behind the root's leading edge, the carbon stabiliser joiner | manual p. 8: 89 mm +/- 3 with the carbon joiner, 102 mm +/- 3 with the steel one "for maximum 3D performance", "without slats installed". The carbon joiner's is taken: the video's pilot flew nose heavy after taking out the tail weight and a steel spar, and calls tail heavy "almost uncontrollable" (11:00) |
| Motor | 10 BL brushless outrunner 900 kV, EFLM17553 | manual p. 3 and parts list |
| ESC | Avian Smart 60 A, SPMXAE1060 | manual p. 3 |
| Prop | 13 x 4 | product listings (air-rc.com, rccorner); Model Aviation's Timber X review; the video, "rated 13x4" |
| Receiver | AR637TA, AS3X and SAFE Select | manual p. 3 |
| High rates | ailerons 45 mm, elevator 55 mm, rudder 55 mm, each way | manual p. 3, "measure in AS3X mode only" |
| Flaps | 30 mm half, 55 mm full; flap to elevator mix 14 percent at half, 20 at full | manual pp. 3 and 4, every transmitter's table |
| Full span ailerons | the flaps mixed into the ailerons at the ailerons' travel | manual pp. 4, 18 and 19 ("to expand the aerobatic capability ... the flaps can be configured to move with the ailerons for full span ailerons"); the video's pilot flies it so (02:20) |
| Slats | in the box, optional, not fitted | manual p. 17 ("optional"), and the CG is given without them |
| Airfoil | semi symmetrical | product listings |
| Lights | factory installed: internal wing and fuselage LEDs, landing light, navigation lights, strobes | product page ("integrated high-visibility LED lights throughout the airframe", "functional and factory-installed LED landing, navigation and strobe lights"); manual pp. 6 and 7 (the internal LED connectors in the wings and the stabiliser, the navigation light leads on the receiver's light port); the LED regulator EFL13854 |

Measured off E-flite's own product photographs (downloaded to
~/.cache/fdfpv-night-timber/src/img/, with their URLs in the PR):

- **Top view, EFL13875_A73**, 1200 mm over 1457 px: a constant chord wing,
  the slat 41 mm ahead of a 243 mm chord, so E-flite's 34 dm^2 is the slatted
  planform and the clean one is 34 x 0.243 / 0.288. The flaps from the
  fuselage side, 93 mm out, to 319 mm; the ailerons from there to 563 mm;
  both 38 percent of the chord. The stabiliser 495 mm across, 165 mm mean
  chord, the elevator 52 percent of it, its quarter chord 0.536 m behind the
  CG. The prop's disc 0.308 m ahead of the CG.
- **Side view, EFL13875_A02**: the spinner's cone puts the thrust line 4.5
  deg nose up of the ground the wheels stand on (its edges at 22.6 and 31.7
  deg); at that pitch both wheels touch a level ground within 2 mm, the
  check on it. The main axles 0.146 m ahead of the CG and 0.213 m under the
  thrust line, 113 mm tyres; the tailwheel 0.630 m behind and 0.192 m under,
  29 mm. The fin and rudder from 80 mm over the thrust line to 147 mm under
  it, the rudder 99 mm of its chord; the stabiliser 113 mm under it.
- **Front view, EFL13875_A04**: a flat wing (no dihedral), the main wheels
  on a 285 mm track.

## 3. The flight model

`scripts/nighttimber-derive.js` prints every figure; its forms are the Turbo
Timber's and the Extra 300 3D's (docs/TIMBER-STAGE1.md, docs/EXTRA-STAGE1.md):
Nelson's stability derivatives, Roskam's large deflection K', thin aerofoil
flap effectiveness, Raymer's flap increments for a plain flap, the plant's
momentum theory slipstream (scripts/lib/wash.js, as every tractor's), the
Extra's high angle terms (hi_alpha, tail_*, rot_k, side_cda) and its flat
plate damping in slow air.

ESTIMATED, and the biggest uncertainty: **the motor**. E-flite publishes the
BL10 900 kV, not its winding. It is E-flite's Power 10 (the same 10 size,
0.04 ohm and 2.1 A at 1100 kV, EFLM4010A) wound for 900 kV: 0.060 ohm, 1.7 A.
Against APC's 13 x 4E static data on 4S it turns 10,058 rpm, 25.9 N, 37 A,
thrust over weight 1.56. A Power 15's winding (0.03 ohm at 950 kV) would give
29.3 N and 1.76. Neither is measured; the gates hold the derivation, and a
bench figure for the stock motor and prop would replace it.

The section and drag are the Turbo Timber's (CLmax 1.15 clean, the zero lift
line 5 deg under the body, e 0.78), cd0 its 0.042 with the tundra tyres'
share grown by the smaller wing, 0.0459, ESTIMATED.

What it gives, derived, and what the plant flies (npm run nighttimber:gates):

| | Derived | Band |
|---|---|---|
| Level at 75 percent | 12.34 m/s | 10.86 to 13.82 |
| Stall, flaps up | 9.08 m/s | 8.54 to 10.35 |
| Stall, full flaps | 8.08 m/s formula; the plant 7.29 since #854 | 6.7 to 8.0, the video pilot's own figure (see below) |
| Top speed | 17.10 m/s | 15.39 to 18.81 |
| Roll, full span ailerons | pb/2V 0.301, 373 deg/s at 13 m/s | 0.226 to 0.376 |
| Hover stick | 0.8015 | 0.761 to 0.842 |
| Vertical climb, full throttle | 6.60 m/s | 5.94 to 7.26 |
| Torque roll, ailerons let go | 216 deg/s left | 162 to 270 |
| Full aileron in the wash | 151 deg/s right | 91 to 211 |
| Full elevator, rudder hanging | 40.8, 22.3 rad/s^2 | 25 percent |
| At rest | 4.5 deg, CG 0.2562 m, 21.5 percent on the tail | 4 to 5 deg, 0.251 to 0.261 m |
| Take off, half flaps | 3.91 m, 8.5 m/s | 2.35 to 6.25 m |

### Its controller

The real one's: the AR637TA flies **AS3X** out of the box (SAFE Select is
disabled by the normal bind, manual p. 4), a rate damper with no self
levelling and no rate caps, which is its default tune; **Manual** is the
receiver without the gyro; **SAFE Select** is the optional bind, the
beginner's angle limits and self levelling, which cannot hover by design.
The AS3X gains are `scripts/as3x-derive.js`'s rule (half the gain a rate loop
with the receiver's 22 ms frame can carry at the top speed), which now has a
row for it. The owner's electronics rule allows a heading hold gyro; it is
the 3D lane's to build and is not on main, so it is not offered here (the
plan file says so for that lane).

### The video's mixes

Two different mixes, kept apart:

- **The manual's flap to elevator mix** (14 and 20 percent of the elevator,
  at half and full flap) is in the table, `de_df`, as the Turbo Timber's
  is.
- **The video's "elevator flaps" and "snap flaps"**, elevator to flap, the
  3D mix that tames the harrier's wing rock, is not in the plant on main.
  The plan file sent it to the second flight model lane (2026-10-08 22:05)
  and no PR has it. So there is no harrier gate: the derivation puts a
  level harrier at 40 deg of body angle at 7.2 m/s and 0.85 throttle, but
  extra-gates' harrier pilot, flown on this aircraft with the flaps up,
  rocks its wings past 100 deg of bank and falls out of it at full
  throttle. That is what the video's pilot says it does without the mix
  ("not going to find anybody flying a harrier at this angle without it",
  12:00 to 13:20), so it is not a band to hold; the video's wing rock
  target (V4, mix off against on) waits for the mix. When
  that mix lands, this aircraft takes it with a gate of its own: the rock
  must shrink with the mix in.

### The full flap stall (N2b), re-derived to the real aircraft

The formula's 8.08 m/s (Raymer's plain flap increment) leaves out the
flap mix's down elevator and the tail's share, which the plant flies.
After #854 put CL max at the top of the curve, the plant reads 7.29 m/s
at the linear crossing (wingpilot.js stallSpeed from 11 m/s, as the
Timber's T4). The band is now the real aircraft's own figure, the video
pilot's 15 to 18 mph with full flaps, 6.7 to 8.0 m/s; the formula sits at
its top. The flight lanes may want to check that the flaps' lift is not
counted twice at the top of the curve: the Turbo Timber's T4 is 1.03 of
its formula, this one 0.90.

### The person paced hover (N17)

`scripts/hover-probe.js`'s pilot (0.2 s late, ten moves a second in fiftieths
of the stick, McRuer and Jex), over its 648 pilot grid, with the ailerons
flying the video's technique, a slow 75 deg/s torque roll rather than none
(the video study's 5b). Measured on this PR's module:

| Mode | Stop the roll | The video's way |
|---|---|---|
| Manual | 0 of 648 | 0 of 648 |
| AS3X | 145 of 648 | 132 of 648, at 76 deg/s, throttle 0.87 |

The Extra 300 3D on the same module: Manual 11 and 31, AS3X 82 and 128. The
gate holds the AS3X video cell at one pilot or more, the claim the video
makes (a person hovers it); the counts are printed every run.

### Findings for the flight lanes (not fixed here)

- **Knife edge.** The derivation finds no level knife edge: at 12 m/s the
  rudder would need 148 percent of its throw, and above 13 m/s the thrust
  runs out. The video shows knife edges and a crankshaft (08:40). The
  estimated motor, the fuselage's side force and the rudder's share in the
  wash are the suspects; no gate is set against reality, and none is set
  that reality contradicts.
- **Hover throttle.** The plant's 0.80 against the video's 55 to 65 percent
  by eye. The plant takes the static thrust as the stick squared; a real ESC
  on a lightly loaded prop turns faster per stick than that, and the radio's
  throttle curve is not known. Either the thrust estimate or that mapping is
  low.
- **Torque roll.** Hands off 216 deg/s against the video study's 60 to 120
  target (V1, a target with the nose held): the swirl's share, the 3D lane's.

## 4. The model (PR 2)

`src/render/nighttimbercraft.js`, built as `timbercraft.js` and
`extracraft.js` are: one group, Y up, drawn from the measurements above and
the photographs, standing on the plant's wheels (the settled pose N13
holds). Paint regions, as `configs/liveries.js` takes them: `wing`,
`fuselage`, `trim` (the orange red), `stripes` (black), `grey`, `cowl`
(black), and the stock scheme off E-flite's photographs. Control surfaces
as separate pivots driven by `sim_plane_surfaces` (the flaperons move with
the ailerons and the flaps), the prop blur the shared one. Its kit slots in
`configs/kits.js` and its dims in `configs/airframes.js` follow #825's
Extra in every file it touched (configs/airframes.js, registry.js TUNES
and its three `nighttimber-*.diff`, tuning.js, power.js,
power-estimates.js, prop-estimates.js, hulls.js, liveries.js,
hangar-parts.js, kits.js, src/render/craft.js, src/main.js mounts,
src/share/session.js, strings en and es, the goldens re-recorded only for
its rows).

## 5. The lights (PR 3)

**What the real one lights.** From E-flite's night photographs (EFL13875_A14
to A17) and the manual: white LEDs inside both wings along the leading
edge half, so the whole foam panel glows white from inside; white LEDs
inside the stabiliser; a white landing light in the cowl; navigation
lights at the wingtips, red left and green right; strobes; a red beacon on
the wing's top at the centre (A16); the fuselage's underside glows white
from the cabin. The lights run off the flight pack through the LED
regulator (EFL13854).

**When they are on.** The game's own night flag: `scene.userData.timeOfDay`,
which the maps already set (`src/maps/itaipu/look/index.js` from its built
time, `src/maps/interior/look.js` from the sun's height as its clock runs).
The brief offered civil twilight (sun 6 deg under) or the map's flag; the
flag is taken, so the lights agree with the sky the player sees. The
interior's own threshold is the sun 2.9 deg under the horizon
(`sunDir.y > -0.05`), not civil twilight's 6; that is the interior lane's
file and is not changed here.

**Where it is night today.** No map is at night in normal play: Itaipu's
night is built only by its Night raid mission (`release: 'development'`) or
the address option `?time=night`; the interior's clock passes dusk. The
address option is the existing time of day option, so no new one is added;
it is how the lights are proven, with a forced night check.

**The switch.** The livery entry's `lights` key (docs/KITS.md section 6)
gains `factory: 'auto' | 'on' | 'off'`, for the families that have factory
lights (this one): absent is `auto`. A new key changes stored player data,
so `LIGHTS_VERSION` goes from 1 to 2 with the migration: a v1 entry reads as
it did (no `factory`, so `auto`), a v2 entry on an older build is kept and
drawn stock, as the contract already says; a check seeds v1 settings,
account and code blobs and reads them back. The Kit page's lights show the
switch for this aircraft, en and es.

**The cost.** Emissive meshes only, fogged with the craft, no real lights,
as the kits lane's are: the wing and stabiliser glow as one mesh each
under the skin, the landing light, two nav bulbs, two strobes and the
beacon. `kits:perf` measures them inside its +0.3 ms budget for eight
aircraft, with `nvidia-smi pmon -c 1` first.

## 6. The unlock and the shop (PR 4)

`src/game/progress.js` `PLANE_LEVELS.nighttimber1200 = 6` (lead decision).
`configs/kits.js` gives it the TRAINER slots as the Timber, and the shop
follows the kits contract (two options sold, one earned by an hour on it, the
rest free; the lead's 70 token price), which keeps "fly everything once buys
the shop" under 4,050 (kits:selftest). Shop items need `ITEMS` on the server:
that PR says "needs a VM deploy".

## 7. What this does not do

- No new plant code: the table rides the existing fixed wing plant, its
  flaps, slipstream, gyro, side force and high angle terms. No other
  aircraft's recorded hash moves (N15).
- No slats option: the plant has a slat switch, the game has no control for
  it, and the aircraft flies without them as shipped.
- No steel joiner option (the 102 mm CG): one CG, the manual's first.
- No elevator to flap mix and no heading hold: not on main (section 3).
- No knife edge gate (section 3).
- No new time of day setting.

## 8. Checks

- PR 1: `npm run nighttimber:gates` (N1 to N17, CI), `as3x:derive`,
  `stab:glide`, `stab:chop`, `extra:gates` and every recorded hash unmoved,
  `crash:core`, `war:legacy`, `lint:header`, `lint:dashes`.
- PR 2: `render:golden` and the goldens re-recorded only for its rows,
  `craft:check` (span and reach), `kits:selftest`, a pictures run.
- PR 3: `kits:selftest` with the v1 to v2 seeds, a forced night browser
  check through the real Kit page (`?time=night`, real pointer), `kits:perf`
  on a quiet GPU, day and night pictures.
- PR 4: `progress:selftest`, `kits:selftest` (the shop total), `lint:copy`.
