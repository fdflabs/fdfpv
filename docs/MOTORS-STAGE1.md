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
ratios closer than scaling the whole table resistance by the phase
resistances' ratio does. Since the five inch's table is itself T-Motor's
F60 Pro V 1950 kV on the T5147 (docs/STOCK-5INCH.md), the pair's stock
motor is the table:

| upgrade over F60 Pro V 1950 | T-Motor's stand | additive (used) | scaled |
| --- | --- | --- | --- |
| F60 Pro V 2020 kV | 1.018 | 1.039 | 1.052 |
| F40 Pro V 2150 kV | 1.059 | 1.092 | 1.133 |

The derivation overstates T-Motor's gain by 2 and 3 percent, inside
motors-check M4's 5 percent band. (On the table before the stock
correction it met them within a percent, 1.027 and 1.057; the corrected
table's lower resistance makes the kV ratio count for more.)

The additive rule has a consequence that is real on this plant: the
table's resistance is not all copper (the five inch's 0.1137 ohm against
a 2207's 50 to 65 mOhm), so a hotter wind, with less torque per amp
against the same fixed resistance, spools a little slower. Check 8's
measure on the F40 Pro V 2150 kV reads 23 ms against stock's 22 and the
band's 30.

## The motors

Every figure is the maker's own page or test report, read on 2026-10-01.
"Estimate" marks a phase resistance by the winding law (R goes as 1 / kV^2
on one stator) from the nearest published motor of its class: T-Motor's
F50 2207 2150 kV, 50 mOhm, for the 2207 and 2306.8, BrotherHobby's SE 2808
1350 kV, 52 mOhm, for the V2808.

| quad | motor | kV | g | phase R | maker's full throttle row, 6S | source |
| --- | --- | --- | --- | --- | --- | --- |
| 5 inch | stock T-Motor F60 Pro V 2207.5 | 1950 | 33.9 | 61 mOhm, estimate | T5147: 1990.4 g, 49.3 A, 31,401 rpm, 24.7 V | t-hobby.com; docs/STOCK-5INCH.md |
| 5 inch | T-Motor F60 Pro V 2207.5 | 2020 | 33.8 | 57 mOhm, estimate | T5147: 2025.5 g, 52.7 A, 24.6 V | t-hobby.com |
| 5 inch | T-Motor F40 Pro V 2306.8 | 2150 | 33.7 | 50 mOhm, estimate | T5147: 2108.3 g, 65.6 A, 24.2 V | t-hobby.com |
| 7 inch | stock 2806.5 | 1300 | 50 | 75 mOhm | combat-derive: 1.9 kgf at 24,000 rpm on 7 x 3.5 x 3 | combat-derive.js |
| 7 inch | BrotherHobby SE 2808 | 1350 | 58.2 | 52 mOhm | HQ 8 x 4.5 x 3: 2734 g, 69.2 A, 24 V | brotherhobbystore.com |
| 7 inch | T-Motor Velox V2808 | 1500 | 60.5 | 42 mOhm, estimate | Gemfan 7040: 2635.9 g, 66.1 A, 24.2 V | t-hobby.com |
| 10 inch | stock 3115 | 900 | 95 | 70 mOhm | combat-derive: 3.6 kgf at 14,000 rpm on 10 x 5 x 3 | combat-derive.js |
| 10 inch | T-Motor Velox V3115 | 900 | 113.1 | 38.08 mOhm | HQ 10 x 5: 4605 g, 82.99 A, 23 V | t-hobby.com |
| 10 inch | BrotherHobby Tornado T5 3115 Pro | 970 | 113 | 45 mOhm | HQ 10 x 4.5: 4431 g, 65.4 A, 25 V | brotherhobbystore.com |
| 10 inch | T-Motor Velox V3115 | 1050 | 112.7 | 33.84 mOhm | HQ 10 x 4.5: 4804 g, 83.46 A, 23 V | t-hobby.com |
| interceptor | stock T-Motor Velox V2808 | 1300 | 61.1 | 56 mOhm, estimate | GF8040-3: 3083.4 g, 61.0 A, 24.3 V; the plant's 0.131 ohm from its rows | t-hobby.com; docs/COMBAT-DRONES.md 1a |
| interceptor | T-Motor Velox V2808 | 1500 | 60.5 | 42 mOhm, estimate | Gemfan 7040: 2635.9 g, 66.1 A, 24.2 V | t-hobby.com |
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
- A 4214 on the 10 inch: iFlight builds it for 13 inch props.

## Before and after

`npm run motors:check`; the top speeds are flown at the weight the shell
flies each quad at (the five inch at 1.62 g, the combat quads at 1 g), the
rest at 1 g, standing, on a fresh pack.

| quad | motor | weight | thrust to weight | hover, static solve | top speed | pack at full throttle | hover time | full throttle time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 inch | stock F60 Pro V 1950 kV | 710 g | 9.72 | 0.247 | 54.13 m/s | 171 A, 3.77 V a cell | 14.4 min | 0.37 min |
| 5 inch | F60 Pro V 2020 kV | 710 g | 10.05 | 0.239 | 54.92 m/s | 183 A, 3.74 V | 14.3 min | 0.34 min |
| 5 inch | F40 Pro V 2150 kV | 709 g | 10.60 | 0.225 | 56.29 m/s | 205 A, 3.69 V | 14.3 min | 0.30 min |
| 7 inch | stock 2806.5 1300 kV | 979 g | 4.75 | 0.309 | 33.39 m/s | 71 A, 2.91 V | 43.4 min | 2.82 min |
| 7 inch | SE 2808 1350 kV | 1012 g | 4.77 | 0.300 | 34.07 m/s | 77 A, 2.81 V | 41.6 min | 2.62 min |
| 7 inch | Velox V2808 1500 kV | 1021 g | 4.92 | 0.272 | 34.83 m/s | 89 A, 2.60 V | 40.9 min | 2.26 min |
| 10 inch | stock 3115 900 kV | 1848 g | 4.69 | 0.276 | 33.34 m/s | 145 A, 2.75 V | 47.4 min | 2.79 min |
| 10 inch | Velox V3115 900 kV | 1920 g | 4.82 | 0.272 | 34.14 m/s | 154 A, 2.66 V | 46.3 min | 2.62 min |
| 10 inch | Tornado T5 3115 970 kV | 1920 g | 4.77 | 0.258 | 34.28 m/s | 164 A, 2.56 V | 45.4 min | 2.45 min |
| 10 inch | Velox V3115 1050 kV | 1919 g | 4.88 | 0.237 | 34.66 m/s | 182 A, 2.38 V | 45.5 min | 2.21 min |
| interceptor | stock Velox V2808 1300 kV | 880 g | 8.33 | 0.243 | 55.90 m/s | 157 A, 3.49 V | 18.8 min | 0.55 min |
| interceptor | Velox V2808 1500 kV | 878 g | 8.99 | 0.214 | 57.63 m/s | 195 A, 3.32 V | 18.5 min | 0.44 min |
| interceptor | XING2 2809 1600 kV | 875 g | 8.96 | 0.205 | 57.43 m/s | 207 A, 3.27 V | 18.2 min | 0.42 min |

The stock aircraft and their top speeds are the ones the changes this sits
on made them: the five inch on T-Motor's measured row
(docs/STOCK-5INCH.md), the interceptor built from published parts
(docs/COMBAT-DRONES.md 1a), and every prop's thrust and torque against
axial speed its own APC curve (docs/PROP-CURVES.md). The interceptor's
motors are held to APC's rpm limit for its 7 x 9E, 150,000 over its
diameter, 21,429 rpm: both upgrades turn it at about 19,350 standing.
T-Motor's own pair for the V2808, 1300 and 1500 kV on a Gemfan 8040 at 24
V, makes the same thrust (3083 and 3069 g): on that heavy 8 inch prop the
hotter wind gains nothing. It is not the interceptor's prop, so it is
recorded here, not checked against.

**The honest headline: on the same prop and the same pack, a real motor
upgrade buys a few percent.** A quad's thrust is its prop's, and its prop
is already near what the pack can turn. T-Motor's own stand says the same:
its hottest 6S five inch motor makes 6 percent more thrust than its stock
class motor on the same prop, for 33 percent more current. The plant
agrees within 3 percent. The Li-ion combat quads are pack bound: their
packs already sag under 3 V a cell at full throttle, so a hotter motor
mostly drains the pack faster, which the full throttle time shows. Where
an upgrade pulls past a published limit (every 7 and 10 inch upgrade
pulls past its Li-ion pack's rating, and both five inch upgrades past the
1300 pack's 130C), it is not capped: it sags.

## Findings outside this change

- The combat quads' stock tables disagree with the one maker table on
  their own prop. BrotherHobby's Avenger 2806.5 1300 kV on the HQ 7 x 3.5
  x 3 at 23.8 V makes 2520 g at 44.4 A and 21,691 rpm; the 7 inch's table
  on a stiff 23.8 V supply makes 2030 g at 31 A and 24,800 rpm, a prop
  lighter than the real one. The five inch's table made 1592 g at 24.7 V
  where T-Motor's T5147 makes 1990 g; its source was an unnamed stand on
  the 5 x 4.3 x 3. The five inch is corrected to T-Motor's row by its own
  change (docs/STOCK-5INCH.md), which this one sits on; the 7 inch is not
  touched here.
- `npm run hangar:check` has one failure on main before this change: "14
  planes have paint, one for each of the 15 fixed wings' families". The
  Striker has no paint.

## Checks

- `npm run motors:check` (M1 to M9 in its header), 103 rows, in
  checks.yml.
- `npm run hangar:motors`: the five inch's hangar opens on its motors; an
  upgrade previews its own readouts with stock's beside them; saved, it is
  flown (the plant's ke, R, J and mass are the block's); a My Hangar build
  keeps it; a reload keeps it; back to stock from the pause menu refits the
  craft in the air to the table; the whoop opens on its stock motor and
  says why. Local, it drives headless Chromium.
- `npm run verify`: 16 of 16, the five inch's replay hash unchanged.
