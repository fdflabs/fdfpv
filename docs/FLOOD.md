# The flood: shallow water at Itaipu

Status (3 October): drawn in the page, for Free Flight's spill and a war's
gates and openings, end to end through the real rooms server. Open items are at
the end.

The war's damage tears openings in the dam (docs: the lead's
`DAMBREAK-CONTRACT.md`). This is the water that goes through them: a real,
deterministic solution of the shallow water (Saint-Venant) equations over the
reservoir in front of the spillway, the spillway, its chute, the plunge pool and
the Parana below, so that what an opening does is decided by physics, not by a
scripted path.

## Files

| File | What |
| --- | --- |
| `src/sim/water/flood.c` | the solver, compiled alone to `dist/flood.wasm` (`npm run build:flood`) |
| `src/sim/water/flood.js` | the module's ABI for a host, Node and browser alike |
| `src/sim/water/host.js` | stepping on the room's clock from the openings, rewinds, late joiners |
| `src/maps/itaipu/water/bed.js` | the bed, its classes and the gates' cells; packing it |
| `src/maps/itaipu/water/itaipu-flood.json`, `.bin` | the shipped bed, built in Node |
| `src/maps/itaipu/water/itaipu-flood-warm-free.bin`, `-war.bin` | the two shipped warmed states (THE TWO STARTS) |
| `src/maps/itaipu/water/flood.js` | the Itaipu flood: boundaries, turbines, gates, hoists, openings, gauges |
| `src/maps/itaipu/water/live.js` | the flood in the page: Free Flight's or a war's, `map.onOpening`, `map.setGateState`, a slice a frame |
| `src/maps/itaipu/water/surface.js` | the flood drawn: the river's sheet at the solver's surface |
| `src/maps/itaipu/water/spill.js` | the chute, the jets, the plume, the plunge pool, at the flood's state |
| `scripts/water-check.js` | `npm run water:check`, the known answers (CI, Node; Chrome locally) |
| `scripts/water-itaipu.js` | `npm run water:itaipu`, the prototype on the real map (local: needs the data); `--write` writes the shipped files |
| `scripts/water-bench.js` | `npm run water:bench`, the cost in Node and in Chrome |
| `scripts/water-page.js` | `npm run water:page`, the flood in the page: Free Flight's spill, an opening, the sound |
| `scripts/water-war.js` | `npm run water:war`, a real war's breach through the rooms server, two pages, one water |
| `scripts/itaipu-views.js --gates` | a war's spillway pictured: `shut`, or gates hoisted |

## The frame

The solver works in a plan grid with heights as the map's `y`, metres above
EGM2008. It is not the plant's frame: like the roofs and the war's floor it is
map-side data, it never meets the plant's state, and nothing in it is converted
to or from Z-up. On Itaipu the grid lies along the spillway (below), so the
solver's `x` is `u` across the chute and its `z` is `d` down it; `bed.js
gridFrame` turns world `(x, z)` into `(u, d)` and back, and every value the host
hands out (levels, currents, a flow's place) is in the world's frame.

## The scheme

First order finite volumes, explicit, at a fixed step:

- **HLL fluxes** (Harten, Lax and van Leer 1983) with Davis's wave speeds and
  Toro's dry front speeds (Toro, *Shock-Capturing Methods for Free-Surface
  Shallow Flows*, 2001).
- **Hydrostatic reconstruction** (Audusse, Bouchut, Bristeau, Klein and
  Perthame, SIAM J. Sci. Comput. 25, 2004): each side cut to the water over the
  higher bed, the pressure the cut removes given back to that side alone. Water
  at rest over any bed stays at rest, depths stay positive under the Courant
  condition, and a wall is just a cell whose bed stands over the water.
- **Manning friction**, semi implicit after the fluxes, n per cell class (Chow,
  *Open-Channel Hydraulics*, 1959, table 5-6): river bed of rock and gravel
  0.035, finished concrete 0.015, forest and brush on the banks 0.07, reservoir
  0.03.
- **Boundaries**: STAGE (a level held outside: the reservoir, the river below),
  INFLOW (a discharge brought in, shared by conveyance: the turbines), RATING
  (Manning's normal depth for a slope). Everything else is a wall.
- **Links** for water that goes through a structure rather than over the ground
  (below).

Determinism: only `+ - * /` and `f64.sqrt`, which IEEE 754 makes exact, a cube
root by Newton from an integer first guess, fixed loop orders, built with
`-fno-fast-math -ffp-contract=off`. `flood_hash` is FNV-1a 64 over `h, hu, hv`.

### The step

`DT_MS` 20. The Courant number `dt (|u| + |v| + 2 sqrt(g h)) / dx` must stay
under 0.5 for positivity; on the 5.09 m grid the fastest water (the chute, some
40 m/s, and the 38 m deep approach) gives 0.20, measured. 30 ms would still be
0.30 and would cut the cost by a third: not taken yet because the chute's
fastest water under a full breach has not been measured past five minutes.

## Openings: links, and holes open to the sky

A **link** takes its discharge from the mean level over a set of upstream cells
and the level of a tail set, removes that volume from the upstream cells (in
proportion to depth, momentum kept) and puts it into a downstream set moving at
the jet's speed. An OPENING link's discharge is the strips formula: each strip
`dz` passes `Cd w sqrt(2 g (eta1 - max(z, eta2))) dz`, integrated in closed form
over its bands. Under the opening's top it is the weir formula, over it the
large orifice, with the tailwater over the sill the drowned forms, one
continuous function. The drowning level is the TAIL's (the pool it empties
into), not the jet's own cells: water over a crest runs some two thirds of the
head deep whatever is below, and a link reading that as tailwater drowned itself
(measured: 1938 m3/s where the formula gives 3862).

Coefficients:

- a radial gate's underflow: Cd 0.61, the contraction under a lip (Henderson,
  *Open Channel Flow*, 1966, 6.2);
- a hole in a gate's leaf under the water: 0.61, a sharp edged opening;
- a gate gone to its sill, over the ogee: 0.74 (USBR, *Design of Small Dams*,
  1987, fig. 9-23, C 2.18).

A **hole open to the sky** (its top over the reservoir's level, as the DAMAGE
agent's first opening is: gate 3, 10 m wide from 212.33 m, 8.17 m high) is not a
link: the gate's own cells across its width come down to its sill and the
shallow water equations decide the flow. A link there put water behind the gate
faster than the sill and the chute could take it under the shallow water
equations' own crest control, and it piled to 223.7 m behind a gate holding
back a 219 m reservoir: energy made from nothing.

## The bed

Built once in Node from the data folder (`npm run water:itaipu -- --write`),
shipped as bytes, and checked against a rebuild. Every client loads the same
bytes, because the inputs go through `Math.hypot` (the outlines met to the
banks, the spillway's frame in the terrain's cut), which is not exact to the
bit on every engine, and because building it took over a second.

- **The grid** lies along the spillway: `u` across, `d` down, cells a fifth of
  the piers' pitch, 5.093 m, so every pier is a column, every bay four columns
  (20.37 m for the gates' 20) and the gates a row. On a grid along the map's
  axes the bays were 19.6 degrees off it, a staircase of 4 m cells that passed
  about 60 % of what the same opening passes on this grid.
- **Two blocks** (the lead's budget decision, 2 October): 288 by 160 cells of
  5.093 m from 150 m in front of the gates to some 650 m down the chute, below
  the plunge pool, then 144 by 96 of 10.187 m for the river on to some 1630 m.
  59 904 cells. The coarse cells are the mean of the fine raster's two by two,
  which keeps the volume under any level. The join is exact for mass and still
  water (water:check's join cases).
- **The ground** is the drawn ground, the hero tiles cut to the concrete
  (`terrain/conform.js`, the #336 cut), read as the terrain draws it.
- **Under the water** the data has no bed: the pipeline lowered the ground in
  every outline to 3 m under the surface. The river's bed is the water part's
  own depth rule, 3 m and 0.08 m per metre from dry ground, the depth it is
  drawn at, up to 21 m in the channel. The reservoir in front of the spillway is
  at the spillway's foundation, 181.3 m, its approach graded up to the sill.
- **The dam**: every footprint, and the whole crest road 6 m either side, stands
  at the crest, 225 m; the spillway's bays are cut back to the sill (199.16 m)
  and `chuteFloor`, with their piers, walls and dividers. The footprints do not
  meet end to end and the terrain's cut round the spillway's ends is an
  excavation the drawing needs: before the crest road sealed them, the
  reservoir ran round both ends of the spillway.
- **Still water** stands wherever it reaches under its level (a fill from each
  body), not only inside the outlines.

The spillway's layout restates `dam/index.js`'s `SPILL`. The DAMAGE agent has
exported it on its branch (9d6f2360); `bed.js` imports it once that is on main.

## The two starts

**A war's** (the lead, 2 October): the turbines' river, the spillway's gates
shut until a mission hoists them. The turbines are 20 Francis units of 715 MW
at their rated 690 m3/s each, 13 800 m3/s (Itaipu Binacional, *Hidreletrica de
Itaipu: Aspectos de Engenharia*, 2009, ISBN 978-85-61885-02-1, as the
Portuguese Wikipedia's article on the plant cites it). On it the river stands at
104.08 to 104.45 m in its first 600 m below the dam, falling to 103.52 m at the
grid's south edge, where it is held at 103.5 m. Itaipu publishes 104.00 m as
its normal tailwater (docs/ITAIPU-PLAN.md section 5).

**Free Flight's** (the lead, 3 October: the running spillway and its plume are
#345's owner approved look, and a dry chute would read as a regression): a
typical spill, all fourteen gates 2 m open, 6534 m3/s over the turbines' 13 800.
It runs all three chutes white and throws all three plumes as the look has
always drawn them (the chute and the plume are drawn whole from a quarter of the
5 m spill's water). The river then stands at 105.78 to 105.89 m by the dam,
falling to 103.75 m at the south edge: 2.3 m over its drawn 103.5 m. The
alternatives, measured:

| All 14 gates at | The gates pass | The river by the dam |
| --- | --- | --- |
| 1 m | 3 319 m3/s | 104.9 to 105.1 m |
| 2 m (chosen) | 6 534 m3/s | 105.8 to 105.9 m |
| 5 m, as the gates are drawn | 15 527 m3/s | 108.1 to 108.2 m |

2 m keeps the river nearest the drawn shores, the plant's float water (still
the flat 103.5 m) and the river level views while every chute still runs. Its
cost: the gates are still drawn at 5 m (below).

Each start warms up 2400 s from still water; from 2100 s the river lets out what
comes in to 0.04 % and every station's level is still to the millimetre. Both
are shipped (`itaipu-flood-warm-free.bin`, `-war.bin`), checked against a rerun
to the byte. Free Flight's loads with the map and is never stepped while nothing
happens; a war's loads on the war's first word.

**The solver is the truth for the tailwater** (the lead): the drawn water's
level is the lead's to route.

## A mission's gates

`map.setGateState(list)`, agreed with the mission engine through the lead (3
October): `[{ gate: 'gate-N', at: room ms, open_m }]`, each the hoist standing
gate N's lip `open_m` over its sill from `at`; `null` is no war, Free Flight's
spill again. Each entry is an event on the room's clock like an opening
(`hoist:<gate>:<at>`), applied by `flood.js setGate`, so the gates' water is the
same on every client. The map turns to a war's water on a mission's gate state
or the damage's first opening.

## Drawn

- **The river** (`surface.js`): one vertex a flood cell that can carry the
  river (not the concrete, not the reservoir's side, not ground over 118 m), at
  the water's level where it is over 0.25 m deep and a metre under its ground
  where it is not, so the sheet meets the bank where the water does. In the
  river's own material (#345: its colours, waves, reflections), its depth the
  solver's, and white water where the current runs over 8 m/s or near critical
  (Froude 0.9 to 1.6), none within six cells of the grid's edges. The river's own
  sheet is cut where this one stands; its mirror follows the water's level under
  the camera (swiss2 `planarMirror` gains `setLevel`). Past 1500 m from the
  sheet's middle it is drawn at every fourth fine cell, 20 m, a sixteenth of the
  triangles, by an index swap and no extra call.
- **The spillway** (`spill.js spillState`): each gate's jet as its lip stands,
  each bay's chute sheet as its water runs and only as far down as it has got,
  and its plume and plunge churn at its discharge, all read from the solver's
  own state (a gate's discharge across its bay 20 m below it; a bay's front
  walked down its middle gate's lane).
- **Not yet**: the gates' leaves still stand drawn at the 5 m they were built
  at (`dam/index.js`, the DAMAGE agent's, with its chunks and colliders): hoists
  rising need the gates to turn about their trunnions there. And the water
  through a hole torn in a gate's leaf has no nappe of its own: DAMAGE's first
  real breach, a 10 m notch from 216.50 m, passes 43 m3/s, a film across an
  80 m bay that the chute's sheet does not show.

## The world's sound

Each frame the shell hands every opening's gauged discharge (`map.waterFlows`)
to #362's `worldAudio.flow`, keyed by the gate's number. A running spillway's
roar is still the map's `audioBeds` ambience at the plunge pools.

## The clock

`src/sim/water/host.js`. Until the first opening the flood is its starting
water and is not stepped. The origin is the earliest opening's room time; an
opening at `at` is applied before step `ceil((at - origin) / DT_MS)`, several on
one step in the order (step, at, id). The flood runs 1 s behind the room's
clock, so an opening heard up to a second late lands on its step with nothing
redone; one heard later, or out of order, rewinds to a snapshot (every 100
steps, 4 kept) or starts again. A late joiner is handed the room's openings and
catches up a budget at a time. The water then depends only on the openings:
`water:check`'s room clock case runs five clients (on time, 3 s late, a late
joiner, reverse order, a slow one) to the same hash, against a control that
applies the later openings 3 s late and is other water.

The page steps on the map's animation clock, which in a room is the room's
(`src/main.js` `trafficMs`), 3 ms a frame.

## The checks and what they measured

`npm run water:check` (CI without Chrome; with Chrome locally):

| Case | Held to | Measured |
| --- | --- | --- |
| lake at rest, random bed, islands, 10 min | current under 1e-9 m/s, level 1e-9 m, volume 1e-12 | 5.6e-15 m/s, 0, 0 |
| closed basin: dam break, fronts, friction, a link, 2 min | volume 1e-9 | 4.2e-16 |
| Ritter dam break along x and z, 20 s | profile L1 2 %; every contour 0.1 to 5 m at Ritter's 2 sqrt(g h0) - 3 sqrt(g d), 3 % | 0.59 %; worst 2.5 % (the 5 m contour) |
| the last centimetre of the tip | reported, not held | 8.7 % slow, the first order smearing onto dry ground |
| critical flow over a broad crest | sqrt(g) (2E/3)^1.5, 2 % | 1.7 % |
| normal depth between INFLOW and RATING | Manning, 1 % | 0.005 % |
| opening as weir, orifice, drowned | the strips formula at the link's levels, 1e-12; steady flows 2 % | exact; under 1 % |
| the room clock | five clients, one hash | one hash |
| Node and Chrome | every case's hash identical | identical, all thirteen (3 October, SIM_GPU=1) |

The join, `water:check`: still water across it for 10 min under 1e-9 m/s
(4.7e-15); a dam break through it conserves the volume to 1e-12; a channel down
through it runs at Manning's normal depth on both sides (2.2270 and 2.2286 m
against 2.2259). The room clock: also a replay's clock taken back 5 s and 12 s,
and forward again, holds the water of then and of now.

`npm run water:itaipu` (local, needs the data; the 2 October full run on the
baseline):

- the shipped bed and the shipped warmed state are the ones built now, byte for
  byte;
- the lake at rest on the real terrain, 10 min: fastest current 1.9e-14 m/s,
  levels exact, volume 2.8e-15;
- the warm up, 2400 s: the river lets out 13 799 m3/s for the turbines' 13 800;
  volume to 4.4e-14; Courant 0.15;
- gate 3 notched (the DAMAGE agent's opening, 10 m from 212.33 m): 197 m3/s
  gauged below the gate, against 310 by hand (sharp edged notch, Cd 0.61) and the
  shallow water equations' critical flow over its crest 294: 0.63 and 0.67;
- gate 3 gone: 2224 m3/s against the handbook's ogee 3862 (0.58) and critical
  flow over the crest 3013 (0.74). **A known limit of v1** (the lead, 2
  October: first order stays): the energy profile down the bay shows 1.9 m of
  head lost in the one cell where the flow converges between the square pier
  fronts into the bay, the first order scheme's dissipation at a strong
  contraction; 2.55 m cells gave the same, so it is the scheme, not the grid. A
  second order reconstruction is the follow up, once the budget has room;
- the river under gate 3 gone: 0.73 m of rise where the water lands, 0.13 m at
  the grid's south edge after 5 min; the 5 cm front past the plunge's near field
  at 15.6, 16.1 and 13.1 m/s between stations against sqrt(g h) + u of 17.3,
  17.2 and 17.1 (6 to 23 % slow: the front smears as it spreads and weakens,
  and a 5 cm threshold lags it);
- volume through every opening run to 2e-14;
- cost (Node, this machine, `npm run water:bench -- --no-chrome`): 1.47 ms a
  step (worst slice 1.96) at 18 200 wet cells of 59 904, with gate 3 gone.

## Budgets

- Solver, measured in Chrome (3 October, SIM_GPU=1, `npm run water:bench`), the
  war's river with gate 3 gone: 1.17 ms a step (worst slice of 50 steps 1.24)
  at 18 206 wet cells of 59 904; Node 1.16 ms. The room needs 50 steps a second,
  59 ms of every second; live.js's 3 ms slice in each of 60 frames takes 154.
  The hash after the bench is the same in Chrome and Node. A war page keeps up
  with the room: 0 steps behind (`water:war`).
- Memory: the solver's arrays 12 doubles a cell (5.8 MB), the host's snapshots
  4 x 3 doubles a cell (5.8 MB), the bed in JS 0.5 MB, the drawn sheet's texture
  1.6 MB: some 14 MB.
- Data: 1.50 MB shipped (the bed 306 kB, Free Flight's start 682 kB, the war's
  490 kB, the wasm 21 kB); a map load fetches 1.0 MB of it, the war's start comes
  with a war.
- Drawing, `itaipu-views.js` (3 October, every day view): every view within
  section 13 but yard-west, which is over on main itself since #380 (305 calls
  and 2.63 M triangles, measured on origin/main 5621f7f5); with the flood, 306
  and 2.64 M. The flood adds one call wherever its sheet is in view and some 32 k
  triangles near, 5 k far. GPU least frame times as before (dam-downstream's
  12.1 ms in one run was the machine loaded with CI steps: 3.4 ms alone).

## The lead's decisions (2 and 3 October)

1. Open to the sky: the shallow water equations through the cut cells, first
   order, the whole gate shortfall a documented limit (above). Second order
   later, when the budget has room.
2. The budget: coarser cells below the plunge pool (done: two blocks), no
   worker; measured in Chrome; a worker is the lead's call if it is still over.
3. The warmed state: shipped, loaded with the solver on the first opening.
4. The baseline: the turbines only, the gates shut; the solver's tailwater is
   the truth (above).
5. The binaries stay in the repository, lazily loaded, under 2 MB in all.
6. `SPILL` exported by the DAMAGE agent (#380) and imported by `bed.js`; the
   clock (`at` is always room ms) and the replay of openings into a reloaded map
   are theirs and done.
7. Free Flight keeps its running spillway and plume (the typical spill above);
   the turbines alone are a war's start.
8. A mission's gates: `{ gate, at, open_m }` (above).
