# Power, stage 1: packs that drain, tanks that run dry, and a choice of power system

The owner asked on 2026-09-27 for the planes' power systems to be chosen,
motor and battery or engine, and for batteries to matter: "real flight
time". Their answers: packs drain as you fly; a bigger pack flies longer
but weighs more; voltage sags and power fades as it empties; LOW BATTERY
for real; glow engines burn fuel from a tank the same way. Planes only: the
quads' plant is untouched and every quad trace is bit identical.

This file gives the model, where every number comes from, what each check
proves, and what moved. The data are in `configs/power.js`; the plant is
`src/native/plant_wing.c` (the step) and `src/native/plant.c` (seating an
option); the ABI is `sim_set_power`, `sim_power_clear` and
`sim_power_state` in `src/native/sim_abi.h`.

## The model

Every fixed wing's pack now drains, whether or not a host seats an option.

**Charge.** The charge drawn is the pack current integrated over the 1 ms
steps. The state of charge is the charge the seat voltage names on the
curve below, less the charge drawn over the capacity. `sim_set_cell_voltage`
still seats the pack: 4.2 V is full, the "Half" and "Nearly empty" choices
start lower on the same curve.

**Open circuit voltage.** A LiPo cell's resting voltage against its state
of charge, `LIPO_OCV` in plant_wing.c, 21 points, linear between them:

| SoC % | 0 | 5 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V | 3.000 | 3.562 | 3.691 | 3.732 | 3.759 | 3.792 | 3.833 | 3.887 | 3.955 | 4.041 | 4.131 | 4.200 |

The lower 86 percent is Chen and Rincon-Mora's fit to pulse discharge rest
voltages of measured polymer Li-ion cells (M. Chen, G. A. Rincon-Mora,
"Accurate electrical battery model capable of predicting runtime and I-V
performance", IEEE Trans. Energy Conversion 21(2), 2006, eq. 2,
https://rincon-mora.gatech.edu/publicat/jrnls/tec05_batt_mdl.pdf). Those
cells were charged to 4.10 V; Battery University's BU-808 table gives a
cell charged to 4.10 V rather than 4.20 V about 86 percent of the capacity
(4.20 V 100, 4.13 V 90, 4.06 V 81,
https://batteryuniversity.com/article/bu-808-how-to-prolong-lithium-based-batteries),
so the fit is laid over the lower 86 percent and the top 14 percent rises
linearly from 4.103 to 4.200 V. Empty is the paper's 3.0 V end of discharge
(its fit's own 2.65 V at 0 is an extrapolation below the tested range). No
cell maker publishes a table; the blog "LiPo voltage charts" are unsourced.

**Sag.** The loaded voltage is the open circuit voltage less the current
through the pack's internal resistance, the plant's existing r_cell. The
same paper finds the resistance flat to 30 percent and 1.6 times higher by
5 percent; that rise is not modelled.

**Power fade.** A motor's speed is its kV times the voltage it gets, so the
duty the prop turns at is the stick's times the loaded voltage now over the
loaded voltage at the seat, at last step's current. At the seat the ratio is
exactly 1.0, so a fresh pack flies exactly as the table always did; as the
pack empties the thrust (speed squared) and the pitch speed (speed) fall.

**Current.** The table's full throttle current is the static current. At a
duty the motor's current goes as the speed squared and the pack's, through
the ESC's switching, as the cube. In flight the prop unloads: the plant's
thrust law has the thrust coefficient fall as 1 - V / pitch speed, and APC's
published data give how the power coefficient goes with it (`CP_OF_CT`,
from the APC 11 x 7E at 9,000 rpm, https://www.apcprop.com/files/PER3_11x7E.dat;
the 8 x 4E, 12 x 6 and 13 x 8E agree within a few percent): flat until the
thrust has fallen by a third, a fifth of static where it is gone. The same
power off a sagged pack is more current. An earlier draft used momentum
theory, which leaves out the blades' own drag and put full throttle current
in flight at half the static; the APC shape is measured.

**The ESC.** Its soft low voltage cutoff: when the loaded cell voltage
falls under its threshold it caps the duty at the one whose current leaves
it there, and the cap holds until the pack is changed, as a hobby ESC's
does until re-armed. Thresholds: Spektrum Avian 3.4 V (Timber, the
SPMXAE1060 programming guide's default), ZTW Beatles 3.0 V soft to 70
percent (Cub, FMS's ESC manual), E-flite 30 A Pro 74 percent of the plug in
voltage, 3.11 V (Radian, EFLA1030B manual), GWS ICS-300Li 2.7 V (Slow
Stick), and for an ESC nobody names (Skyhunter, the 1000 mm wing, the
electric conversions) Hobbywing Skywalker V2's default, 3.0 V soft. The
Bramor's autopilot manages its end, so it has none. At empty the motor
stops. The ESCs' own step to 50 to 70 percent power is replaced by the cap
that holds the threshold; the Slow Stick's hard cut is modelled as soft.

**Glow.** A glow engine burns its tank at a flow linear in the rpm, from
the full throttle flow at full rpm through zero, so the idle burns the idle
fraction of it. Over the last 5 percent of the tank the mixture leans and
the rpm rises by up to 5 percent, then the engine quits: rpm, thrust and
the voice go to zero and the aircraft glides until a reset. Cox's trouble
chart names the lean burst before a dry tank stops the engine; no source
gives its size, so the 5 and 5 percent are an ESTIMATE. Fuel's mass is not
burnt off: SIG's 6 lb Kadet flying weight is taken with a full tank, and
the tank's 311 g stays aboard as it empties (11 percent of the aircraft).
The receiver pack of a glow plane is not drained.

**CG.** An option can move the balanced CG (`cgShiftM`, forward positive),
which adds -CL times the shift over the chord to the pitching moment. Every
kit manual found has the pack slid to the stated CG, so every option here
has zero.

**Mass.** An option carries the all up mass it flies at on its default
pack or tank. The plant's mass moves by the option's over the stock
option's and by the pack's over the default's. Inertia is left alone: a
pack at the CG moves it by under the model's resolution.

## The ABI

`sim_set_power(in)` seats `SIM_POWER_DOUBLES` (17) doubles, SI units:
kind (0 electric, 1 glow), all up mass, CG shift, cells, internal
resistance per cell, capacity in coulombs (mAh times 3.6), static thrust,
pitch speed, no load rpm, static full throttle current, glow idle, tank
m^3, full and idle fuel flow m^3/s, lean share and gain, ESC cutoff V per
cell. Refused on a quad and for anything out of range. A mode like the
airframe: kept across `sim_reset` and `sim_init`, cleared by a change of
airframe. Seating fills the pack and the tank, and so do `sim_reset`,
`sim_set_cell_voltage` and `sim_set_airframe`. `sim_power_clear` puts the
table's stock system back. `sim_power_state(out)` fills 10 doubles: state
of charge, charge drawn (C), open circuit volts per cell, fuel left (m^3)
and its share, running, lean, capacity, tank, and whether an option is
seated.

## The contract for the hangar screen (configs/power.js)

- `POWER[airframeId]`: the options for each fixed wing id in
  `configs/airframes.js` (and `wing1000`, which the module keeps for its
  gates). The first is the stock option, the plant's own table.
- An option: `{ id, name, kind: 'electric' | 'glow', voice, massKg,
  cgShiftM, packs, pack, source, ... }`. `name` is a string key in
  `src/strings/en.js` and `es.js` (read with `str(name)`); `voice` is the
  audio voice (`wing` electric, `glow2` two stroke, `glow4` four stroke);
  `massKg` the all up mass on its default pack; `packs` the LiPo packs
  `{ id, cells, mAh, massKg, source }` or, for glow, the tanks `{ id, cc,
  m3, massKg, source }` (a tank's mass is its fuel's); `pack` the default
  id; `source` a list of URLs. Electric options also carry `kv`, `propIn`,
  `pitchIn`, `blades`, `thrustN`, `currentA`, `lvcV`; glow ones `idle` and
  `flowFullM3s`. A pack label reads `str('power.pack', { cells, mah })`, a
  tank `str('power.tank', { cc })`.
- The choice: `settings.power[airframeId] = { option, pack }`.
  `normalizePower(stored)` validates the whole map on load (src/ui/ui.js
  does); `powerChoice(id, settings.power)` reads one airframe's with stock
  for anything unknown; `powerParams(id, option, pack)` is the block for
  `sim_set_power`, or null for stock on its stock pack (the shell then
  calls `sim_power_clear`); `powerCells` is the pack's cell count for the
  OSD; `powerBlock` always builds the block (the checks use it).
- The shell seats the choice with the airframe between runs and at a hot
  swap (`applyPower` in src/main.js), so a change in the hangar takes effect
  on the next run. Nothing else needs to be called.

## The options, per plane

Each alternative's figures and derivation are beside it in
`configs/power.js`; `scripts/power-derive.js` recomputes the derived ones.

- **Turbo Timber (and on floats).** Stock: E-flite BL10 800 kV, 11 x 7.5
  three blade, Avian 60 A, 4S 3200 (E-flite's manual and product page).
  Alternative: the same motor on 3S, which E-flite lists (thrust and static
  current by the voltage squared, speed by the voltage). Packs: 4S 2200,
  3200, 4000, 5000 and 3S 2200, 3200 (Spektrum's product pages). No other
  motor with published figures was found; the Power 32 has no table.
- **Piper Cub (and on floats).** Stock only: FMS's 3536 850 kV, 11 x 7, 40 A,
  3S 2200. FMS lists one power system and publishes no thrust. Packs: 3S
  2200 and 3200 (the 3200 is outside FMS's "approximately the same"
  guidance; flagged).
- **Skyhunter 1800.** Sold bare. Stock is Model Aviation's measured review
  build (950 kV, APC 11 x 5.5, 43 A, 4S 5000). Alternatives: the maker's
  Normal setup on a SunnySky X2820 920 kV with an APC 11 x 7 or 12 x 6 (and
  the 12 x 6 on 3S) and its Advance setup on the X2820 800 kV with a 13 x 8,
  each SunnySky's own full throttle row (sunnyskyusa.com). Packs: 4S 4000,
  5000, 6000, 16000 and 3S 5000 (CNHL). The maker's 6S "Crazy" setup has no
  published figures and is not offered.
- **Radian.** Stock only: E-flite 480 960 kV, 9.75 x 7.5 folding, 30 A.
  Packs 3S 1300, 1500, 1800, 2200 (the Night Radian's range on the same
  system). No motor alternative with figures was found.
- **Bramor C4EYE.** Stock only. C-Astral publishes no pack; 6S 22000 is
  derived so that cruise at the published 16 m/s lasts the published 3 h on
  this plant. That is 488 Wh against the 330 Wh the drag estimate needs,
  which says this plant's cruise power is high (its estimated 45 A full
  throttle current is the likeliest cause).
- **Slow Stick.** Sold without power. Stock: GWS EPS-300C D on the EP1180,
  2S 1300. Alternatives, each GWS's own full throttle row with rpm: the
  brushless 2212/13T on an EP1047 and on an EP1060 (2S 1300 or 2200), and
  the 2215/12T on an EP1060 on 3S (3S 1300 or 2200). GWS rates the EPS-300C
  for 350 to 600 mAh, so the 2S 2200 is offered only with the brushless
  motors.
- **Buzzard Bombshell.** Stock: Cox Texaco .049 with Cox's throttle
  conversion, 7 x 3.5, 8.4 cc tank; full throttle flow 1.84 cc/min (Menon's
  dyno of a Cox .049, U. Maryland PhD 2010, at 9,000 rpm). Alternatives:
  Cox's RC .049 with its own throttle (Fly RC's measured 18,000 rpm on a 5 x
  3, 6,800 idle; thrust from APC's 5 x 3); BMJR's sport electric (Himax
  HC2816-1220 on 3S 850, BMJR's 21.85 oz RTF against 19.75 oz on the
  Texaco; APC 8 x 4E, the smallest prop in Himax's range, since BMJR names
  none). Tanks: 8.4 cc and SAM's 1/2A Texaco allotment, 5.1 cc.
- **Kadet Senior.** Stock: O.S. FS-52S four stroke on a 12 x 6 at 9,500 rpm,
  SIG's 12 oz (355 cc) tank; full throttle flow 18.3 cc/min, O.S.'s own
  "around 12 minutes" on 220 cc for the FSa-56II. Alternatives: the
  FSa-56II (O.S.'s successor on the same mounts) on the 12 x 6, the FS-64V
  on a 13 x 6 (both scaled from the stock engine's measured rpm by rated
  power and APC's prop data), and SIG's own electric from its Sport ARF
  manual, the Himax HC5018-530 on 5S 5000 (APC 13 x 8E). Tanks: 355 cc and
  the manual's 8 oz (237 cc).
- **1000 mm wing.** Stock only, 4S 1300, 1800, 2200. Its motor figures are
  unverified (the doc cites no URL, and the AR Wing 900 it names ships a
  different system).

## Checks

`npm run power:check` (scripts/power-check.js, in checks.yml), per plane:
P1 the stock option through `sim_set_power` flies a trace bit identical to
the table's; P2 flight time against the maker's figure (below); P3 the
largest pack of the stock cells flies longer (at the same lift
coefficient) and is heavier; P4 at 12 percent charge the loaded voltage and
the full throttle climb are lower than fresh; P5 the OSD's own Betaflight
battery test (src/ui/fpvhud.js) fires LOW BATTERY on the frame the filtered
pack crosses 3.5 V a cell less 10 mV; P6 a glow engine leans, speeds up and
quits on a dry tank, and the aircraft glides above its stall; P7 each
alternative's top speed and climb move the way its thrust and pitch speed
say through the plant's thrust law (asserted only where the data imply a
change of more than 3 percent).

Flight times at cruise (the table's trim speed, TECS style: pitch on the
airspeed, throttle on the height) and at full throttle, to LOW BATTERY
(the Bramor to its cut, a glow engine to a dry tank), on the stock pack:

| Plane | Full throttle | Cruise | Maker | P2 holds |
| --- | --- | --- | --- | --- |
| Turbo Timber | 8.0 min | 34.6 min at 13 m/s | manual timers 4 and 7 min; Model Aviation flew 5 to 8 | timer: flat out outlasts 7 |
| Timber floats | 7.1 | 25.2 | as above | timer |
| Piper Cub | 9.4 | 22.2 at 12 | FMS "approx. 6 min" | timer |
| Cub floats | 8.2 | 15.4 | as above | timer |
| Skyhunter | 17.0 | 46.0 at 15 | Model Aviation "10 minutes and longer" | at least 10 |
| Radian | 5.9 (motor run) | 68.8 at 7.7 | "over 30 min" with limited motor run, not comparable | runs out sooner flat out |
| Bramor | 75.6 | 176.7 at 16 | C-Astral 3 h (the capacity is derived from it) | within 5 percent |
| Slow Stick | 23.3 | 38.5 at 5.5 | none | runs out sooner flat out |
| 1000 mm wing | 9.8 | 28.9 at 15 | none | runs out sooner flat out |
| Bombshell | 4.6 | 5.4 at 8 | none (Menon's flow gives 4 to 4.6 min at full throttle) | runs out sooner flat out |
| Kadet Senior | 19.4 | 32.2 at 10 | O.S. 12 min on 220 cc, 19.4 on 355 | mixed: between the two |

A maker's timer is set to land with charge to spare after sport flying,
so it cannot bound the flight from above; Model Aviation's measured 5 to 8
min Timber flights end where the model's full throttle flight does. The
Kadet's full throttle time equals the maker's by construction, since the
O.S. mixed throttle figure is used as the full throttle flow.

## What moved

The drain changes every fixed wing's recorded flight a little from the
first step (the loaded voltage and current in the state block, then the
thrust as the pack comes down), so every recorded fixed wing hash moved
and was re-recorded in its own commit, citing this decision. The five
inch's canonical hash, de0401cd4266c395, and every whoop gate are
unchanged. The gate readings that moved, all inside their bands, are
listed in the pull request; the only band a reading left was the Slow
Stick's S10 phugoid period, whose measurement was fixed rather than its
band (scripts/slowstick-gates.js says why).
