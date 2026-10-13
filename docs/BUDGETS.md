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
  section 13).

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
written: 300 calls, 2.5 M triangles (docs/ITAIPU-PLAN.md section 13)
and an 8 ms GPU floor (docs/PERF.md, proposed budgets).

| Row | Tier | Draw calls | Triangles, M | Live textures | GPU floor, ms | GPU median, ms | Frame avg / p95, ms | GPU 0 busy, host load | Over the written contract |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | low | 168 (<= 194) | 0.68 (<= 0.78) | 5 (<= 6) | 0.61 (<= 1.2) | 1.0 | 1.8 / 4.0 | 38 %, 24 | within |
| `title` | medium | 384 (<= 442) | 1.65 (<= 1.91) | 7 (<= 9) | 0.71 (<= 1.3) | 2.9 | 5.1 / 12.7 | 99 %, 27.7 | within |
| `title` | high | 397 (<= 457) | 1.65 (<= 1.91) | 18 (<= 21) | 1.39 (<= 2.1) | 3.0 | 4.7 / 9.3 | 24 %, 34.2 | 397 calls > 300 |
| `alps-low` | low | 219 (<= 252) | 1.26 (<= 1.46) | 9 (<= 11) | 1.08 (<= 1.7) | 8.1 | 49.3 / 74.4 | 100 %, 26.8 | within |
| `alps-low` | medium | 377 (<= 434) | 2.37 (<= 2.73) | 11 (<= 13) | 1.18 (<= 1.8) | 2.5 | 11.2 / 17.9 | 84 %, 26.8 | within |
| `alps-low` | high | 390 (<= 449) | 2.37 (<= 2.73) | 22 (<= 26) | 1.33 (<= 2.0) | 2.2 | 5.9 / 12.4 | 21 %, 30.8 | 390 calls > 300 |
| `swiss-low` | low | 181 (<= 209) | 1.62 (<= 1.87) | 66 (<= 76) | 3.48 (<= 5.3) | 4.8 | 9.5 / 18.2 | 51 %, 31.4 | within |
| `swiss-low` | medium | 244 (<= 281) | 2.39 (<= 2.75) | 74 (<= 86) | 5.66 (<= 8.5) | 14.4 | 27.9 / 40.5 | 95 %, 24.3 | within |
| `swiss-low` | high | 350 (<= 403) | 3.77 (<= 4.35) | 86 (<= 99) | 7.13 (<= 10.7) | 8.9 | 14.0 / 23.5 | 58 %, 36.8 | 350 calls > 300; 3.77 M tris > 2.5 M |
| `itaipu-stream` | low | 129 (<= 149) | 1.80 (<= 2.08) | 67 (<= 78) | 2.02 (<= 3.1) | 7.7 | 26.2 / 66.2 | 100 %, 31.9 | within |
| `itaipu-stream` | medium | 198 (<= 228) | 3.05 (<= 3.51) | 75 (<= 87) | 2.70 (<= 4.1) | 4.5 | 9.0 / 19.7 | 72 %, 20 | within |
| `itaipu-stream` | high | 253 (<= 291) | 5.65 (<= 6.50) | 87 (<= 101) | 3.29 (<= 5.0) | 8.7 | 14.1 / 19.2 | 76 %, 15.3 | 5.65 M tris > 2.5 M |
| `interior-ops` | low | 99 (<= 114) | 0.54 (<= 0.62) | 29 (<= 34) | 1.83 (<= 2.8) | 6.3 | 7.6 / 8.7 | 64 %, 12.1 | within |
| `interior-ops` | medium | 106 (<= 122) | 0.57 (<= 0.66) | 36 (<= 42) | 1.97 (<= 3.0) | 11.1 | 18.8 / 32.4 | 55 %, 23.4 | within |
| `interior-ops` | high | 125 (<= 144) | 0.57 (<= 0.67) | 48 (<= 56) | 2.29 (<= 3.5) | 9.1 | 16.4 / 37.5 | 67 %, 7.5 | within |
| `itaipu-war` | low | 157 (<= 181) | 1.82 (<= 2.10) | 69 (<= 80) | 1.01 (<= 1.6) | 2.6 | 5.4 / 11.6 | 60 %, 23.9 | within |
| `itaipu-war` | medium | 247 (<= 285) | 2.85 (<= 3.28) | 77 (<= 89) | 1.44 (<= 2.2) | 3.9 | 10.5 / 16.0 | 77 %, 15 | within |
| `itaipu-war` | high | 279 (<= 321) | 3.03 (<= 3.48) | 89 (<= 103) | 1.78 (<= 2.7) | 4.2 | 12.6 / 24.5 | 38 %, 12.8 | 3.03 M tris > 2.5 M |

The rows over the contract are real: at High the menu and the alps draw
390 to 397 calls, swiss2 350 calls and 3.77 M triangles, Itaipu's town
5.65 M triangles and the war 3.03 M. The ceilings above hold today's
cost from growing; they do not say today's cost is within the contract.

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
(the run-check ceiling for `perf` is 3 GB, so pass `CHECK_MEM=5G`).
