# Budgets

What a frame of each world costs on this box, at each quality tier, and
the ceiling each number is held to (docs/redesign/COMPLETENESS.md items
46 and 71, redesign phase 29). Every number here was measured; the
ceiling is written next to the measurement it was set from.

## Frame rate targets

Two targets are written in the tree, and they differ:

- **90 frames a second**, 11.1 ms a frame: the owner's target
  (2026-10-05), which the dynamic resolution holds the GPU to
  (src/render/dynres.js `TARGET_HZ = 90`) and which scripts/perf-play.js
  counts frames over (`BUDGET_MS`).
- **60 frames a second at 1080p on a five year old mid range laptop**,
  never under 60 at High with at most 300 draw calls and 2.5 M triangles
  a view: the hardware contract (src/render/budget.js, docs/ITAIPU-PLAN.md
  section 13), since 2026-10-13 the main view's, with Itaipu's at 4.0 M
  and the thermal inset held apart (The contract, below).

No minimum is written anywhere. The pacer has no frame rate floor: what
it floors is the render scale (0.75 in Balanced, 0.5 in Performance,
dynres.js `MODES`), not frames a second. No reference machine is named;
the three tiers name eras (src/strings/en.js): Low "Steam Deck and
similar handhelds", Medium "a 2020-era laptop with integrated graphics",
High "a 2021-era PC or a strong laptop". A minimum and a named machine
are the owner's to set.

## The table

One row per perf-play scenario (scripts/perf-play.js) per tier:

- `title`: the menu, the title's attract flight over the alps;
- `alps-low`, `swiss-low`: the five inch at eight metres in each valley;
- `itaipu-stream`: Itaipu flown flat out across Hernandarias, the world
  streaming round it;
- `interior-ops`: the Interior's Mission 1 in the air, quiet HUD up;
- `itaipu-war`: the war at full load, Defend the Paraná mission 1, a
  burst of ten explosions every ten seconds.

Each was flown once for 15 s, `--mode=quality` (resolution held at the
preset's), 1600 by 900, on main's tree at b4b2d9628 plus phase 29,
2026-10-13 between 12:37 and 13:53 local. The `itaipu-stream` and
`itaipu-war` rows were taken again at 13:50 to 13:53 with Itaipu's flood
running: until then this script's WebAssembly wrapper kept the flood
from starting in every run of it (`[flood] could not start`), so the
first Itaipu numbers had no water simulation in them.

Held, `measured (<= ceiling)`: draw calls and triangles, the most in any
frame; live textures (the renderer's own count, `renderer.info.memory`:
three counts textures, not their bytes, so no texture megabytes are
written); the GPU floor (each GPU segment's tenth percentile, summed:
the frame's own GPU cost with the least of anyone else's in it). Calls,
triangles and textures are held at the measurement plus 15 %; the GPU
floor at half again or 0.5 ms more, whichever is larger, because the card
is shared.

Written, never held: the GPU median and the frame's average and 95th
percentile. **These frame times are contaminated.** Six lanes' headless
browsers shared GPU 0 while they were taken (its busy share, sampled as
each run opened, is beside them) on a host at load average 7 to 37 of 20
threads; alps-low at Low read 49 ms a frame with the card 100 % busy
where an earlier run with it 25 % busy read 6.1. docs/PERF.md's rule
applies: a frame time is only a baseline taken on a quiet card. Retake
this column on one before reading it as the game's.

Over the written contract is at High only, where the contract is
written: the main view's 300 calls and 2.5 M triangles (4.0 M at Itaipu)
and the inset's 110 calls and 1.9 M (The contract, below), and an 8 ms
GPU floor (docs/PERF.md, proposed budgets).

| Row | Tier | Draw calls | Triangles, M | Live textures | GPU floor, ms | GPU median, ms | Frame avg / p95, ms | GPU 0 busy, host load | Over the written contract |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | low | 118 (<= 136) | 0.68 (<= 0.78) | 5 (<= 6) | 0.61 (<= 1.2) | 1.0 | 1.8 / 4.0 | 38 %, 24 | within |
| `title` | medium | 275 (<= 317) | 1.65 (<= 1.91) | 7 (<= 9) | 0.71 (<= 1.3) | 2.9 | 5.1 / 12.7 | 99 %, 27.7 | within |
| `title` | high | 288 (<= 332) | 1.65 (<= 1.91) | 18 (<= 21) | 1.39 (<= 2.1) | 3.0 | 4.7 / 9.3 | 24 %, 34.2 | within |
| `alps-low` | low | 167 (<= 193) | 1.26 (<= 1.46) | 9 (<= 11) | 1.08 (<= 1.7) | 8.1 | 49.3 / 74.4 | 100 %, 26.8 | within |
| `alps-low` | medium | 280 (<= 322) | 2.37 (<= 2.73) | 11 (<= 13) | 1.18 (<= 1.8) | 2.5 | 11.2 / 17.9 | 84 %, 26.8 | within |
| `alps-low` | high | 293 (<= 337) | 2.37 (<= 2.73) | 22 (<= 26) | 1.33 (<= 2.0) | 2.2 | 5.9 / 12.4 | 21 %, 30.8 | within |
| `swiss-low` | low | 181 (<= 209) | 1.62 (<= 1.87) | 66 (<= 76) | 3.48 (<= 5.3) | 4.8 | 9.5 / 18.2 | 51 %, 31.4 | within |
| `swiss-low` | medium | 244 (<= 281) | 2.39 (<= 2.75) | 74 (<= 86) | 5.66 (<= 8.5) | 14.4 | 27.9 / 40.5 | 95 %, 24.3 | within |
| `swiss-low` | high | 350 (<= 403) | 3.77 (<= 4.35) | 86 (<= 99) | 7.13 (<= 10.7) | 8.9 | 14.0 / 23.5 | 58 %, 36.8 | within: main view 242 calls, 2.41 M; inset 106, 1.40 M |
| `itaipu-stream` | low | 129 (<= 149) | 1.80 (<= 2.08) | 67 (<= 78) | 2.02 (<= 3.1) | 7.7 | 26.2 / 66.2 | 100 %, 31.9 | within |
| `itaipu-stream` | medium | 198 (<= 228) | 3.05 (<= 3.51) | 75 (<= 87) | 2.70 (<= 4.1) | 4.5 | 9.0 / 19.7 | 72 %, 20 | within |
| `itaipu-stream` | high | 253 (<= 291) | 5.65 (<= 6.50) | 87 (<= 101) | 3.29 (<= 5.0) | 8.7 | 14.1 / 19.2 | 76 %, 15.3 | within: main view 156 calls, 3.83 M (<= 4.0 M); inset 97, 1.87 M |
| `interior-ops` | low | 99 (<= 114) | 0.54 (<= 0.62) | 29 (<= 34) | 1.83 (<= 2.8) | 6.3 | 7.6 / 8.7 | 64 %, 12.1 | within |
| `interior-ops` | medium | 106 (<= 122) | 0.57 (<= 0.66) | 36 (<= 42) | 1.97 (<= 3.0) | 11.1 | 18.8 / 32.4 | 55 %, 23.4 | within |
| `interior-ops` | high | 125 (<= 144) | 0.57 (<= 0.67) | 48 (<= 56) | 2.29 (<= 3.5) | 9.1 | 16.4 / 37.5 | 67 %, 7.5 | within |
| `itaipu-war` | low | 157 (<= 181) | 1.82 (<= 2.10) | 69 (<= 80) | 1.01 (<= 1.6) | 2.6 | 5.4 / 11.6 | 60 %, 23.9 | within |
| `itaipu-war` | medium | 247 (<= 285) | 2.85 (<= 3.28) | 77 (<= 89) | 1.44 (<= 2.2) | 3.9 | 10.5 / 16.0 | 77 %, 15 | within |
| `itaipu-war` | high | 279 (<= 321) | 3.03 (<= 3.48) | 89 (<= 103) | 1.78 (<= 2.7) | 4.2 | 12.6 / 24.5 | 38 %, 12.8 | within: main view 196 calls, 2.07 M (<= 4.0 M); inset 83, 0.96 M |

The draw calls of `title` and `alps-low` at every tier were retaken on
2026-10-13 after the Alps' draws were merged (branch w38-perf: the
village's plain colours one palette mesh, the road, lane and stream
ribbons by material, the boulders one instanced mesh a band, the flowers
one palette instanced mesh), the same run settings, and their ceilings
moved down to them; at High the menu went from 397 to 288 and alps-low
from 390 to 293. Their other columns are the first run's.

The ceilings above hold today's whole frame cost from growing; whether
a row is within the contract is the last column, read against the
contract below.

### What the flight rows count

Every flight row flies the 7 inch, a combat airframe, whose HUD is the
avionics one with the IR inset up (src/ui/settings.js hudStyleFor), and
the inset draws the scene a second time at 480 by 270
(src/render/sensorview.js, src/render/thermal.js). The renderer's
counters, which this table and the contract read, take the inset's draw
in. scripts/itaipu-views.js and scripts/interior-views.js, the checks
that hold 300 calls and 2.5 M triangles today, park a camera with no
flight HUD, so they count the main view alone: scene, ink prepass,
shadow maps, mirror and post. Split, the busiest frame of a 15 s run at
High, 2026-10-13 on w38-perf, on GPU 0 and before the flood fix above
reached perf-play (renderBufferDirect tallied by pass):

| Row, busiest frame by | Calls | Triangles, M | Sensor inset, calls / M | Main view, calls / M |
| --- | --- | --- | --- | --- |
| `alps-low`, most calls | 293 | 2.16 | 84 / 0.58 | 209 / 1.58 |
| `alps-low`, most triangles | 227 | 2.40 | 62 / 0.64 | 165 / 1.76 |
| `swiss-low`, most calls | 348 | 3.69 | 106 / 1.38 | 242 / 2.31 |
| `swiss-low`, most triangles | 344 | 3.82 | 104 / 1.40 | 240 / 2.41 |
| `itaipu-stream`, most calls | 253 | 3.48 | 97 / 1.33 | 156 / 2.15 |
| `itaipu-stream`, most triangles | 234 | 5.70 | 91 / 1.87 | 143 / 3.83 |
| `itaipu-war`, most calls | 279 | 2.62 | 83 / 0.83 | 196 / 1.80 |
| `itaipu-war`, most triangles | 270 | 3.03 | 80 / 0.96 | 190 / 2.07 |

itaipu-stream's main view is 3.83 M, of which the mid distance canopy
(it-canopy-a-mid and -b-mid, 1 700 instances) is 0.60 M in the scene
and 1.19 M in the two shadow maps: an instanced mesh is culled whole,
and the near map's 72 m square reaches past the near trees' 70 m, so
mid trees stand in both. Their shadows stay (the contract below).

### The contract, 2026-10-13

The owner's decision, logged by the lead 2026-10-13: at High,

- **the main view**, scene, ink prepass, shadow maps, mirror and post,
  as scripts/itaipu-views.js and scripts/interior-views.js count it: at
  most **300 draw calls and 2.5 M triangles** (measured today at most
  242 calls, swiss-low, and 2.41 M, swiss-low; the menu 288 calls with
  no inset);
- **Itaipu's main view**: at most 300 calls and **4.0 M triangles**
  (measured 3.83 M, itaipu-stream's busiest frame, the mid canopy's
  shadows included);
- **the thermal inset**, a line of its own: at most **110 calls and
  1.9 M triangles** (measured at worst 106 calls, swiss-low, and
  1.87 M, itaipu-stream).

perf-play --budgets still holds the whole frame, main view and inset
together, in the table above: splitting it into a main view and an
inset column is a new pair of held columns on all eighteen rows, every
row retaken to set their ceilings, which is not a cheap change, so the
whole frame ceilings are left as they are. The split above is the
measurement each contract figure was checked against; the last column
reads each High row against the contract, and its main view figures
are that table's.

Not measured: attackers and peers. The war's attackers are whatever
mission 1 sends in its first 25 s, and a second pilot is a second
browser, which this box runs one at a time (docs/PERF.md, "Not
measured").

## The check

    SIM_GPU=1 node scripts/perf-play.js OUT --scenarios=title,alps-low,swiss-low --preset=high --seconds=15 --mode=quality --budgets

or `~/.cache/run-check.sh <worktree> perf -- OUT --scenarios=... --preset=... --seconds=15 --mode=quality --budgets`.
`--budgets` reads this table and fails the run on any held column over
its ceiling, or on a scenario with no row at the preset. One run per tier
and per set of scenarios; a set of all three Itaipu and Interior
scenarios peaked at 4.3 GB at High, Itaipu's two with the flood at 3.8 GB
(the run-check ceiling for `perf` is 5 GB, ~/.cache/fdfpv-check-limits).
run-check.sh draws a SIM_GPU check on the second card, GPU 1 (PCI
85:00.0, x4), and leaves GPU 0 (02:00.0, x16, the desktop's) to the
owner, since 2026-10-13 (a bwrap that leaves only GPU 1's device, from
14:23; it falls back to GPU 0 when GPU 1 is absent or short of memory).
Numbers taken before then are GPU 0's: pass `CHECK_GPU=0` to compare
with them on the same card. Every GPU floor ceiling in the table was set
on GPU 0, a shared card, so the column is to be re-based on a GPU 1 run
of all eighteen rows before it is read as a ceiling for GPU 1.
