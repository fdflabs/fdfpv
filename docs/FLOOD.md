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
| `src/maps/itaipu/water/flood.js` | the Itaipu flood: boundaries, turbines, gates, openings, gauges |
| `src/maps/itaipu/water/live.js` | the flood in the page: `map.onOpening`, a slice a frame |
| `scripts/water-check.js` | `npm run water:check`, the known answers (CI, Node; Chrome locally) |
| `scripts/water-itaipu.js` | `npm run water:itaipu`, the prototype on the real map (local: needs the data) |

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
  about 60 % of what the same opening passes on this grid. 287 by 287 cells,
  82 369, from 150 m in front of the gates to some 850 m below the lips.
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

The spillway's layout restates `dam/index.js`'s `SPILL`, which is the DAMAGE
agent's file and does not export it.

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
| Node and Chrome | every case's hash identical | identical, all nine, at b574fcb0 (2 October); not run since the link's tail cells, the face fluxes and the room clock case, Chrome runs being held |

`npm run water:itaipu` (local, needs the data; the 2 October full run):

- the shipped bed is the one built now, byte for byte;
- the lake at rest on the real terrain, 10 min: fastest current 2.8e-14 m/s,
  levels exact, volume 1.2e-14;
- the warm up, 600 s from still water with the 14 gates 5 m open and the
  turbines (20 x 645 m3/s): the gates pass 15 528 m3/s (gate 3 1110, by hand at
  219 m 1125), the reservoir supplies it to 0.01 %, the river lets out 29 011
  against 28 428 coming in, still settling; volume to 2.9e-14; Courant 0.20;
- gate 3 notched (the DAMAGE agent's opening): 1320 m3/s gauged below the gate,
  the notch's share some 210 against 309 by hand (Cd 0.61);
- gate 3 gone: 2376 m3/s gauged, against the handbook's ogee 3862 (0.62) and the
  shallow water equations' own critical flow over the crest 3013 (0.79). The
  energy profile down the bay shows where: 1.9 m of head is lost in the one cell
  where the flow converges between the square pier fronts into the bay, the
  first order scheme's dissipation at a strong contraction (2.55 m cells gave
  the same: it is the scheme, not the grid);
- the river: a 0.14 to 0.24 m rise along the thalweg; the 5 cm front between
  stations past the plunge's near field at 22.1 and 19.0 m/s against sqrt(g h) +
  u of 21.4 and 21.6;
- volume through every opening run to 1e-14;
- cost: 2.5 to 3.0 ms a step at 34 000 wet cells of 82 369 (Node, this
  machine), 76 to 92 ns per cell per step all wet.

## Budgets

- Solver: 2.5 to 3 ms a step at 50 steps a second is 125 to 150 ms of every
  second, over the contract's "well under 2 ms a step". A 3 ms frame slice
  keeps up at 60 frames a second only while the flood is cheap.
- Memory: the solver's arrays 12 doubles a cell (7.9 MB), the host's snapshots
  4 x 3 doubles a cell (7.9 MB), the bed in JS 0.7 MB: some 17 MB.
- Data: the shipped bed 330 kB and 66 kB, fetched on the first opening.
- Rendering: none yet.

## Open: the lead's decisions

1. **Openings open to the sky**: the shallow water equations through the cut
   cells (real geometry, and the flow mutates as the hole does, but some 60 %
   of the handbook for a whole gate gone), or a second order reconstruction
   (MUSCL with the hydrostatic reconstruction, Audusse et al. 2004 section 3),
   which is the known cure for this loss at about twice the cost.
2. **The budget**: a Web Worker for the flood (CLAUDE.md keeps Stage 1 on the
   main thread), coarser cells on the river below the plunge pool (a second
   block at 10 m: a quarter of the cells and half the steps there), or both.
3. **The baseline**: the flood starts still at the origin and the spillway
   fills from it. A warmed, running state shipped like the bed (some 0.8 MB)
   would start every client on the running river; or the room could step it.
4. **The baseline flows**: 14 gates at 5 m and the turbines are 28 400 m3/s,
   which stands the river near the plunge some 5 m over its drawn 103.5 m at 6
   to 9 m/s; the turbines' 645 m3/s a unit is to be confirmed.
5. **Generated binaries in the repository**: the shipped bed (330 kB), and a
   warmed state if (3) is taken; or they go to the data repository.
6. **The spillway's layout**: an export of `dam/index.js`'s `SPILL` from the
   DAMAGE agent, so it is not restated here.
