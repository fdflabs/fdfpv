# The flood: shallow water at Itaipu

Status: prototype (one spillway gate, end to end, in Node). Not yet drawn, not
yet run in a browser. The decisions this leaves open are at the end.

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
| `src/maps/itaipu/water/itaipu-flood-warm.bin` | the shipped warmed state, the turbines' river |
| `src/maps/itaipu/water/flood.js` | the Itaipu flood: boundaries, turbines, gates, openings, gauges |
| `src/maps/itaipu/water/live.js` | the flood in the page: `map.onOpening`, a slice a frame |
| `scripts/water-check.js` | `npm run water:check`, the known answers (CI, Node; Chrome locally) |
| `scripts/water-itaipu.js` | `npm run water:itaipu`, the prototype on the real map (local: needs the data); `--write` writes the shipped files |
| `scripts/water-bench.js` | `npm run water:bench`, the cost in Node and in Chrome |

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

## The baseline: the turbines, the gates shut

The lead's decision (2 October): the river the turbines run, the spillway's
gates shut unless a mission opens them (`makeFlood`'s `gates`). The turbines are
20 Francis units of 715 MW at their rated 690 m3/s each, 13 800 m3/s (Itaipu
Binacional, *Hidreletrica de Itaipu: Aspectos de Engenharia*, 2009, ISBN
978-85-61885-02-1, as the Portuguese Wikipedia's article on the plant cites it).
The flood warms up for 2400 s from still water; from 2100 s the river lets out
what the turbines give to 0.04 % and every station's level is still to the
millimetre. That warmed state is shipped (`itaipu-flood-warm.bin`), checked
against a rerun to the byte, and loaded with the solver on the first opening.

**The tailwater it stands at** is the solver's answer, and it differs from the
drawn 103.5 m: 104.08 m where the tailrace meets the plunge pool, 104.45 m at
the pool's deep water, falling to 104.17, 103.84, 103.87 and 103.52 m down the
river to the grid's south edge, where the level is held at 103.5 m. Itaipu
publishes 104.00 m as its normal tailwater (docs/ITAIPU-PLAN.md section 5). The
drawn water is 0.6 to 0.95 m under the solver's for the first 600 m below the
dam; changing it is the lead's to route.


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
  shipped warmed river with gate 3 gone: 1.17 ms a step (worst slice of 50
  steps 1.24) at 18 206 wet cells of 59 904; Node 1.16 ms. The room needs 50
  steps a second, 59 ms of every second; live.js's 3 ms slice in each of 60
  frames takes 154. The hash after the bench is the same in Chrome and Node
  (611bfc9fa42ae0ec). Under the contract's 2 ms a step, with no worker.
- Memory: the solver's arrays 12 doubles a cell (5.8 MB), the host's snapshots
  4 x 3 doubles a cell (5.8 MB), the bed in JS 0.5 MB: some 12 MB, only once the
  dam opens.
- Data, fetched on the first opening only: the bed 240 kB and 66 kB, the warmed
  state 490 kB, the wasm 19 kB: 815 kB (the lead's ceiling: 2 MB).
- Rendering: none yet.

## The lead's decisions (2 October)

1. Open to the sky: the shallow water equations through the cut cells, first
   order, the whole gate shortfall a documented limit (above). Second order
   later, when the budget has room.
2. The budget: coarser cells below the plunge pool (done: two blocks), no
   worker; measured in Chrome; a worker is the lead's call if it is still over.
3. The warmed state: shipped, loaded with the solver on the first opening.
4. The baseline: the turbines only, the gates shut; the solver's tailwater is
   the truth (above).
5. The binaries stay in the repository, lazily loaded, under 2 MB in all.
6. `SPILL` exported by the DAMAGE agent; the clock (`at` is always room ms) and
   the replay of openings into a reloaded map are theirs and done.
