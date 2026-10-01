# Motors, stage 1: real motor upgrades for the quads

The owner asked on 2026-10-01 for "much more powerful motors on all of the
quads, airplanes, etc", and of the three ways offered (a slider, real
garage upgrades, raising every default) chose GARAGE MOTOR UPGRADES: real
bigger motors per aircraft, each with its real weight and battery drain,
with the stock aircraft staying true to their hardware and to `npm run
verify`'s bands. This is the quads' half. The planes already had a power
choice (`configs/power.js`, docs/POWER-STAGE1.md); their upgrades are
stage 2, as more options on that same path.

The data are in `configs/motors.js`; the plant's side is `sim_set_motors`
in `src/native/sim_abi.h` and `plant_set_motors` in `src/native/plant.c`;
the checks are `npm run motors:check` and `npm run hangar:motors`.

## What was there, and what was not

- A quad had no power choice. `sim_set_power` refuses a quad, and every
  quad constant is compiled into `PLANT_TABLE`.
- The five inch and the whoop had no hangar at all: Customise opened only
  for a paintable plane or a combat quad.
- The quad plant never drains its pack. Its flight times here are
  estimates from the plant's own operating points, on the convention
  docs/COMBAT-DRONES.md section 5a already uses: four fifths of the pack
  over the pack's current.
- The whoop flies the five inch's plant in a room built to its scale
  (`configs/airframes.js` MICRO_SCALE). A real whoop motor's numbers have
  no plant to reach, and the five inch's motors on it would not be a
  whoop. The owner's decision: whoops fly stock. Its hangar opens on its
  one stock motor and says so.
- There is no three inch airframe.

## The mechanism

**The plant.** `sim_set_motors(in)` takes seven doubles: the all up mass,
the three inertias, the loaded torque constant `ke`, the winding plus ESC
resistance `r_motor`, and the rotor's inertia `j_rotor`. It writes them
over a copy of the quad's table entry, in the same live copy and under the
same flag a fixed wing's power option uses, so everything that already
handles a power option handles it: `sim_power_clear` takes it off, another
airframe drops it, the add-ons (a combat quad's payload) are laid over it,
`sim_reset` keeps it, and `sim_power_state` [9] reads 1 while it is on.
The prop's `kt`, `kq`, pitch and figure of merit are the table's, because
they are the prop's and the frame keeps its prop. With nothing seated the
plant reads the const table, so every existing trace is bit identical; the
stock motor seated through the block is bit identical too (M2 below).

**The choice.** `settings.power[quadId] = { option, pack: null }`, the slot
a fixed wing's power choice already has, which the hangar already saves,
My Hangar builds already carry (`src/ui/builds.js`) and the hot swap
already refits. `configs/power.js` hands a quad's choice to
`configs/motors.js` motorChoice. `src/main.js` applyPower seats
`sim_set_motors` on a quad, or clears for the stock motor.

**The hangar.** The Power tab draws a quad's motors exactly as it draws a
plane's power options: one card per motor with its stator and kV, the
maker's site under it, and the readouts with the stock motor's ghost
beside each. A quad has one pack, so no pack row. The readouts are the
weight, the thrust to weight, the top speed and two flight times, at a
hover and at full throttle.

**Rooms.** A room's profile carries the airframe, the livery and a plane's
parts; it has never carried a power choice or a loadout, and a peer is
drawn from poses, never simulated. Rotor speed on the wire tops out at
5080 rad/s, above every upgrade's full throttle speed. No server change.

## The derivation

Every upgrade is derived from the STOCK motor the table was solved for and
the published difference between the two motors, so the stock motor is
the table to the bit and an upgrade moves only by what the makers publish:

- `ke = ke_stock (kV_stock / kV)`. The loaded torque constant keeps the
  stock motor's saturation over its nameplate (the five inch's 2207 loads
  to 1.26 times its plate, the combat quads to 1.10 and 1.15; plant.c and
  scripts/combat-derive.js say why).
- `r_motor = r_stock + (R_phase - R_phase_stock)`. The table's resistance
  carries the ESC, the leads and the stock motor's copper; an upgrade
  changes the copper by the published phase resistances' difference.
- `j_rotor = j_stock + (J_bell - J_bell_stock)`, each bell taken as half
  the motor's mass in a thin ring at the stator's radius plus 2 mm. An
  ESTIMATE: no maker publishes a rotor's inertia.
- The mass moves by four times the motors' published weight difference,
  and the inertia by that mass at the four motors (parallel axes). The
  CG's move with it is under a millimetre and is left out.

Then the operating points follow from the plant's own motor model,
`configs/motors.js` motorStats, the same two equilibria
`scripts/combat-derive.js` solves: a fresh pack at 4.2 V a cell sagging
through its resistance under all four motors, shaft torque `kq w^2`, a
motor's current that over `ke`. An upgrade that pulls more than the stock
pack or ESC is rated for is not capped: the plant has no current ceiling
(plant.c says why), so it pays in sag through the pack's resistance, which
is what a real pack past its rating does, and `motors:check` M7 says where
each one passes a published limit.

The resistance rule was chosen on evidence, not to pass a check. T-Motor
ran the five inch's two upgrades and its stock class motor (F60 Pro V 1950
kV) on one stand, one prop (T5147 tri blade) and 6S. Solved on a stiff
supply at the stand's volts, the additive rule above gives the makers'
ratios; scaling the whole table resistance by the phase resistances'
ratio instead does not:

| upgrade over F60 Pro V 1950 | T-Motor's stand | additive | scaled |
| --- | --- | --- | --- |
| F60 Pro V 2020 kV | 1.018 | 1.027 | 1.050 |
| F40 Pro V 2150 kV | 1.059 | 1.057 | 1.127 |

The additive rule has a consequence that is real on this plant: the
table's resistance is mostly not copper (the five inch's 0.1825 ohm against
a 2207's 50 to 65 mOhm, plant.c says why), so a hotter wind, with less
torque per amp against the same fixed resistance, spools a little slower.
Check 8's measure on the F40 Pro V 2150 kV reads 29 ms against stock's 26
and the band's 30.

## The motors

Every figure is the maker's own page or test report, read on 2026-10-01.
"Estimate" marks a phase resistance by the winding law (R goes as 1 / kV^2
on one stator) from the nearest published motor of its class: T-Motor's
F50 2207 2150 kV, 50 mOhm, for the 2207 and 2306.8, BrotherHobby's SE 2808
1350 kV, 52 mOhm, for the V2808.

| quad | motor | kV | g | phase R | maker's full throttle row, 6S | source |
| --- | --- | --- | --- | --- | --- | --- |
| 5 inch | stock 2207 | 1900 | 33.9 | 64 mOhm, estimate | plant.c: 1.5 kgf, 33 A, 26,000 rpm on 5 x 4.3 x 3 | plant.c; weight T-Motor F60 Pro V |
| 5 inch | T-Motor F60 Pro V 2207.5 | 2020 | 33.8 | 57 mOhm, estimate | T5147: 2025.5 g, 52.7 A, 24.6 V | t-hobby.com |
| 5 inch | T-Motor F40 Pro V 2306.8 | 2150 | 33.7 | 50 mOhm, estimate | T5147: 2108.3 g, 65.6 A, 24.2 V | t-hobby.com |
| 7 inch | stock 2806.5 | 1300 | 50 | 75 mOhm | combat-derive: 1.9 kgf at 24,000 rpm on 7 x 3.5 x 3 | combat-derive.js |
| 7 inch | BrotherHobby SE 2808 | 1350 | 58.2 | 52 mOhm | HQ 8 x 4.5 x 3: 2734 g, 69.2 A, 24 V | brotherhobbystore.com |
| 7 inch | T-Motor Velox V2808 | 1500 | 60.5 | 42 mOhm, estimate | Gemfan 7040: 2635.9 g, 66.1 A, 24.2 V | t-hobby.com |
| 10 inch | stock 3115 | 900 | 95 | 70 mOhm | combat-derive: 3.6 kgf at 14,000 rpm on 10 x 5 x 3 | combat-derive.js |
| 10 inch | T-Motor Velox V3115 | 900 | 113.1 | 38.08 mOhm | HQ 10 x 5: 4605 g, 82.99 A, 23 V | t-hobby.com |
| 10 inch | BrotherHobby Tornado T5 3115 Pro | 970 | 113 | 45 mOhm | HQ 10 x 4.5: 4431 g, 65.4 A, 25 V | brotherhobbystore.com |
| 10 inch | T-Motor Velox V3115 | 1050 | 112.7 | 33.84 mOhm | HQ 10 x 4.5: 4804 g, 83.46 A, 23 V | t-hobby.com |
| interceptor | stock 2807 | 1500 | 56 | 50 mOhm | combat-derive | combat-derive.js |
| interceptor | iFlight XING2 2809 | 1600 | 59.9 | 47 mOhm | Gemfan 7040: 2496 g, 62.24 A, 23.4 V, 160 C on the motor | shop.iflight.com |

Packs: the five inch's 6S 1300 at CNHL Black Series V2's 130C, 169 A; the
7 inch's six Molicel P42A in series at 45 A (Molicel's datasheet); the 10
inch's two in parallel, 90 A; the interceptor's 6S 1800 at Tattu R-Line
5.0's 150C, 270 A. ESCs: 60 A a motor on the five inch and the 10 inch, 50
on the 7 inch, combat-derive's 65 on the interceptor.

What is NOT offered, and why:

- The whoop: see above.
- 5 inch motors over 2400 kV: none has a 6S table. The 2550 to 2650 kV
  motors are 4S motors; on 6S on a five inch prop they are past every ESC.
- The F50 2207 2200 kV and the EMAX RSIII 2207 2100 kV: no stock class
  motor on the same stand, and the F50's own 2150 and 2200 rows put the
  hotter one 2 g lower, inside its stand's noise.
- The T-Motor F90 2806.5: it is a 2806.5 like the stock 7 inch's, no
  upgrade.
- The BrotherHobby SE 2807 1300 kV on the 7 inch: 0.7 percent over the
  stock class motor on the same prop.
- The Velox V2808 1500 kV on the interceptor: the stock 2807 1500 kV's kV
  on 4.5 g more a motor; it hovers higher up the stick and gains nothing.
- A 4214 on the 10 inch: iFlight builds it for 13 inch props.

## Before and after

`npm run motors:check`; the top speeds are flown at the weight the shell
flies each quad at (the five inch at 1.62 g, the combat quads at 1 g), the
rest at 1 g, standing, on a fresh pack.

| quad | motor | weight | thrust to weight | hover | top speed | pack at full throttle | hover time | full throttle time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 inch | stock | 710 g | 8.10 | 0.266 | 41.52 m/s | 137 A, 3.86 V a cell | 13.9 min | 0.46 min |
| 5 inch | F60 Pro V 2020 | 710 g | 8.48 | 0.253 | 42.19 m/s | 152 A, 3.82 V | 13.7 min | 0.41 min |
| 5 inch | F40 Pro V 2150 | 709 g | 8.82 | 0.240 | 42.80 m/s | 168 A, 3.78 V | 13.6 min | 0.37 min |
| 7 inch | stock | 979 g | 4.75 | 0.309 | 28.31 m/s | 72 A, 2.90 V | 43.4 min | 2.82 min |
| 7 inch | SE 2808 1350 | 1012 g | 4.77 | 0.300 | 28.84 m/s | 78 A, 2.80 V | 41.6 min | 2.62 min |
| 7 inch | V2808 1500 | 1021 g | 4.92 | 0.271 | 29.31 m/s | 90 A, 2.58 V | 40.9 min | 2.26 min |
| 10 inch | stock | 1848 g | 4.69 | 0.278 | 27.66 m/s | 146 A, 2.74 V | 47.4 min | 2.79 min |
| 10 inch | V3115 900 | 1920 g | 4.82 | 0.272 | 28.40 m/s | 155 A, 2.65 V | 46.3 min | 2.62 min |
| 10 inch | Tornado 3115 970 | 1920 g | 4.77 | 0.259 | 28.35 m/s | 166 A, 2.54 V | 45.4 min | 2.45 min |
| 10 inch | V3115 1050 | 1919 g | 4.88 | 0.237 | 28.56 m/s | 184 A, 2.36 V | 45.5 min | 2.21 min |
| interceptor | stock | 849 g | 9.29 | 0.239 | 45.50 m/s | 180 A, 3.39 V | 18.6 min | 0.48 min |
| interceptor | XING2 2809 1600 | 865 g | 9.52 | 0.227 | 46.42 m/s | 200 A, 3.30 V | 18.0 min | 0.43 min |

**The honest headline: on the same prop and the same pack, a real motor
upgrade buys a few percent.** A quad's thrust is its prop's, and its prop
is already near what the pack can turn. T-Motor's own stand says the same:
its hottest 6S five inch motor makes 6 percent more thrust than its stock
class motor on the same prop, for 33 percent more current. The plant
agrees within a percent. The Li-ion combat quads are pack bound: their
packs already sag under 3 V a cell at full throttle, so a hotter motor
mostly drains the pack faster, which the full throttle time shows. Where
an upgrade pulls past a published limit (every 7 and 10 inch upgrade
pulls past its Li-ion pack's rating), it is not capped: it sags.

## Findings outside this change

- The combat quads' stock tables disagree with the one maker table on
  their own prop. BrotherHobby's Avenger 2806.5 1300 kV on the HQ 7 x 3.5
  x 3 at 23.8 V makes 2520 g at 44.4 A and 21,691 rpm; the 7 inch's table
  on a stiff 23.8 V supply makes 2030 g at 31 A and 24,800 rpm, a prop
  lighter than the real one. The five inch's table makes 1592 g at 24.7 V
  where T-Motor's T5147 makes 1990 g; its source is an unnamed stand on the
  5 x 4.3 x 3. Neither is touched here: the stock aircraft stay as they are.
- `npm run hangar:check` has one failure on main before this change: "14
  planes have paint, one for each of the 15 fixed wings' families". The
  Striker has no paint.

## Checks

- `npm run motors:check` (M1 to M9 in its header), 94 rows, in
  checks.yml.
- `npm run hangar:motors`: the five inch's hangar opens on its motors; an
  upgrade previews its own readouts with stock's beside them; saved, it is
  flown (the plant's ke, R, J and mass are the block's); a My Hangar build
  keeps it; a reload keeps it; back to stock from the pause menu refits the
  craft in the air to the table; the whoop opens on its stock motor and
  says why. Local, it drives headless Chromium.
- `npm run verify`: 16 of 16, the five inch's replay hash unchanged.

## Stage 2, the planes: what was searched for and why nothing was added

A plane's power choice already exists (`configs/power.js`, docs/
POWER-STAGE1.md). An upgrade is one more option there, derived by
`scripts/power-derive.js` from a motor's kV, Rm and Io on APC's measured
prop data, or taken from a maker's full throttle row. Either way it needs
real published figures: the motor's weight, and its constants or a row on
a named prop. Searched on 2026-10-01.

**Planes that already have a real upgrade.** The figures are from
configs/power.js and configs/power-estimates.js, at full throttle:

| plane | stock | upgrade |
| --- | --- | --- |
| Skyhunter 1800 | T/W 1.31, 23.2 m/s | SunnySky X2820 800 kV on 13 x 8: 1.33, 26.9 m/s |
| Slow Stick | T/W 0.65, 7.9 m/s | GWS 2215 on 3S: 1.35, 12.9 m/s |
| Bombshell | T/W 0.51, 9.6 m/s | Himax HC2816 electric: 1.65, 16.5 m/s |
| Kadet Senior | T/W 1.04, 18.1 m/s | O.S. FS-64: 1.28, 19.2 m/s; Himax HC5018 electric: 1.20, 21.9 m/s |
| P-51D | T/W 1.33, 19.9 m/s | 650 kV: 1.55, 23.3 m/s |

**Planes with no real upgrade, and why:**

- **Turbo Timber Evolution.** The stock E-flite BL10 800 kV on 4S is
  already the factory setup. E-flite lists no bigger motor for it. Horizon's
  BL10 page names the Spektrum Avian 4240-800Kv as its replacement, at
  125 g ([Spektrum](https://www.spektrumrc.com/product/avian-4240-800kv-outrunner-brushless-motor/SPMXAM4670.html)).
  The swap with published figures is the Turnigy Aerodrive SK3 3548-840
  ([PX4's Timber build](https://docs.px4.io/main/en/frames_plane/turbo_timber_evolution.html)):
  174 g, Rm 0.025 ohm, with HobbyKing's own static rows
  ([HobbyKing](https://hobbyking.com/turnigy-aerodrive-sk3-3548-840kv-brushless-outrunner-motor.html)).
  None of the three ways to fly it is an upgrade:
  - On the stock diameter (APC 11 x 7E, 4S) it makes 2625 g at 44 A,
    against the stock 2549 g at the same 44 A. That is 3 percent for 49 g
    more, at a slightly lower pitch speed: a sidegrade.
  - Its 12 x 6 row makes 2771 g at 50 A, but on a 6 inch pitch its pitch
    speed is 26.8 m/s against stock's 32, so it is slower.
  - PX4 flies a 13 x 4. That is a bigger diameter than the gear was derived
    for, HobbyKing publishes no 4S row on it, and PX4 also changed the ESC.
  The Spektrum Avian 4250-800 an owner fitted publishes no Rm, Io or row.
- **FMS J-3 Cub 1400.** The FMS 3541-840 that owners fit to the sister
  PA-18 is rated 3S only, and its Rm, Io and thrust are not published. No 4S
  setup is published for the J-3.
- **Radian Pro (ParkZone).** The published upgrade is Graupner 11 x 6
  folding blades on the stock 480 960 kV. APC makes no folder to measure,
  and the stock motor's Rm and Io are not published, so the stock motor
  cannot be moved to another prop on data.
- **Bramor C4EYE.** C-Astral publishes no motor, prop or cell count.
- **Zagi HP.** No maker upgrade, and only forum anecdotes on other Zagis,
  with no figures.
- **F-16 V3 70 mm.** Its 2957 2210 kV on 6S is already Freewing's top 70 mm
  set, about 2450 g static at 70 A. The published alternatives make less:
  JP Hobby's 70 mm 12 blade with a 3055 2250 kV makes 2350 g at 76.6 A on
  22.2 V.
- **Ugly Stik and Tiger Moth.** Their alternatives (the O.S. 46FX, the
  FS-91 II) are not stronger. RCM's kit takes .40 to .61 engines, so the
  stock 61FX is already the top of its range.

**What would change this.** A maker's table (kV, Rm, Io, weight) for a
motor that fits one of these mounts, or a static row on an APC prop of the
stock diameter. With either, the option is a few lines in configs/power.js
plus a `power:check --estimates` run, the same as every option there. The
stall and stab gates move only where the mass moves.
