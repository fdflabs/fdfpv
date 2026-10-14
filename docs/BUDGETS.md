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

The GPU columns (floor, median, frame average and 95th percentile, card
busy and host load) were retaken on GPU 1 on 2026-10-13 between 20:37
and 21:01 local, on batch/2026-10-14 at 53b54b250, through run-check.sh
(each run's nvidia-smi saw one card, so none fell back to GPU 0), the
same run settings, each row flown twice and the run that opened on the
quieter card kept (the lower busy share, then the lower frame average).
The two runs' floors agreed within 0.05 ms on every row. Draw calls,
triangles and live textures were read again in the same runs and did
not move past their ceilings: calls within 2 of the table, triangles
within 0.04 M (alps-low 1.28 and 2.40 M against 1.26 and 2.37,
swiss-low at High 348 calls and 3.81 M against 350 and 3.77), textures
equal, so those columns are left as they were measured.

Held, `measured (<= ceiling)`: draw calls and triangles, the most in any
frame; live textures (the renderer's own count, `renderer.info.memory`:
three counts textures, not their bytes, so no texture megabytes are
written); the GPU floor (each GPU segment's tenth percentile, summed:
the frame's own GPU cost with the least of anyone else's in it). Calls,
triangles and textures are held at the measurement plus 15 %, and so is
the GPU floor since it was taken on GPU 1, rounded up at the second
decimal, with the date of the measurement beside it. Until then the floor
was held at half again or 0.5 ms more, because GPU 0 is the owner's
desktop card; GPU 1 carries only the checks, one at a time per lane.

Written, never held: the GPU median and the frame's average and 95th
percentile, with GPU 1's busy share sampled as the run opened (8 to
55 %; this run's own previous scenario is in it) and the host's load
average beside them. The first table's frame times, taken on GPU 0 while
six lanes' headless browsers shared it at load average 7 to 37, were
contaminated (alps-low at Low read 49 ms a frame with the card 100 %
busy) and are replaced; docs/PERF.md's rule still applies: a frame time
is only a baseline taken on a quiet card, and a number from before the
switch is GPU 0's (docs/PERF.md, Comparing numbers across the GPU 1
switch).

Over the written contract is at High only, where the contract is
written: the main view's 300 calls and 2.5 M triangles (4.0 M at Itaipu)
and the inset's 110 calls and 1.9 M (The contract, below), and an 8 ms
GPU floor (docs/PERF.md, proposed budgets).

| Row | Tier | Draw calls | Triangles, M | Live textures | GPU floor, ms | GPU median, ms | Frame avg / p95, ms | GPU 1 busy, host load | Over the written contract |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | low | 118 (<= 136) | 0.68 (<= 0.78) | 5 (<= 6) | 0.30 (<= 0.35) 2026-10-13 | 0.3 | 0.7 / 1.3 | 8 %, 2.2 | within |
| `title` | medium | 275 (<= 317) | 1.65 (<= 1.91) | 7 (<= 9) | 0.68 (<= 0.79) 2026-10-13 | 1.0 | 1.3 / 1.9 | 11 %, 2.4 | within |
| `title` | high | 288 (<= 332) | 1.65 (<= 1.91) | 18 (<= 21) | 0.80 (<= 0.92) 2026-10-13 | 1.1 | 1.4 / 2.1 | 18 %, 2.2 | within |
| `alps-low` | low | 167 (<= 193) | 1.26 (<= 1.46) | 9 (<= 11) | 0.69 (<= 0.80) 2026-10-13 | 0.8 | 1.8 / 3.2 | 23 %, 2.5 | within |
| `alps-low` | medium | 280 (<= 322) | 2.37 (<= 2.73) | 11 (<= 13) | 1.09 (<= 1.26) 2026-10-13 | 1.3 | 2.5 / 4.1 | 23 %, 2.3 | within |
| `alps-low` | high | 293 (<= 337) | 2.37 (<= 2.73) | 22 (<= 26) | 1.21 (<= 1.40) 2026-10-13 | 1.5 | 2.7 / 4.6 | 23 %, 2.3 | within |
| `swiss-low` | low | 181 (<= 209) | 1.62 (<= 1.87) | 66 (<= 76) | 3.00 (<= 3.45) 2026-10-13 | 3.3 | 4.8 / 8.2 | 37 %, 2.4 | within |
| `swiss-low` | medium | 244 (<= 281) | 2.39 (<= 2.75) | 74 (<= 86) | 4.72 (<= 5.43) 2026-10-13 | 5.3 | 7.1 / 11.9 | 41 %, 2.4 | within |
| `swiss-low` | high | 350 (<= 403) | 3.77 (<= 4.35) | 86 (<= 99) | 6.75 (<= 7.77) 2026-10-13 | 7.5 | 9.7 / 11.7 | 55 %, 2.4 | within: main view 242 calls, 2.41 M; inset 106, 1.40 M |
| `itaipu-stream` | low | 129 (<= 149) | 1.80 (<= 2.08) | 67 (<= 78) | 1.51 (<= 1.74) 2026-10-13 | 2.9 | 4.4 / 8.5 | 28 %, 3.8 | within |
| `itaipu-stream` | medium | 198 (<= 228) | 3.05 (<= 3.51) | 75 (<= 87) | 2.15 (<= 2.48) 2026-10-13 | 3.7 | 5.8 / 10.7 | 24 %, 3.8 | within |
| `itaipu-stream` | high | 253 (<= 291) | 5.65 (<= 6.50) | 87 (<= 101) | 3.07 (<= 3.54) 2026-10-13 | 5.1 | 7.1 / 12.0 | 30 %, 4.8 | within: main view 156 calls, 3.83 M (<= 4.0 M); inset 97, 1.87 M |
| `interior-ops` | low | 99 (<= 114) | 0.54 (<= 0.62) | 29 (<= 34) | 1.44 (<= 1.66) 2026-10-13 | 5.8 | 7.1 / 8.4 | 26 %, 3.8 | within |
| `interior-ops` | medium | 106 (<= 122) | 0.57 (<= 0.66) | 36 (<= 42) | 1.66 (<= 1.91) 2026-10-13 | 5.2 | 6.7 / 7.3 | 36 %, 1.9 | within |
| `interior-ops` | high | 125 (<= 144) | 0.57 (<= 0.67) | 48 (<= 56) | 1.97 (<= 2.27) 2026-10-13 | 5.9 | 7.1 / 7.7 | 34 %, 2.4 | within |
| `itaipu-war` | low | 157 (<= 181) | 1.82 (<= 2.10) | 69 (<= 80) | 0.91 (<= 1.05) 2026-10-13 | 2.4 | 4.1 / 8.0 | 37 %, 2.5 | within |
| `itaipu-war` | medium | 247 (<= 285) | 2.85 (<= 3.28) | 77 (<= 89) | 1.35 (<= 1.56) 2026-10-13 | 2.9 | 4.8 / 9.2 | 35 %, 2.9 | within |
| `itaipu-war` | high | 279 (<= 321) | 3.03 (<= 3.48) | 89 (<= 103) | 1.67 (<= 1.93) 2026-10-13 | 3.2 | 5.3 / 9.5 | 38 %, 2.4 | within: main view 196 calls, 2.07 M (<= 4.0 M); inset 83, 0.96 M |

The draw calls of `title` and `alps-low` at every tier were retaken on
2026-10-13 after the Alps' draws were merged (branch w38-perf: the
village's plain colours one palette mesh, the road, lane and stream
ribbons by material, the boulders one instanced mesh a band, the flowers
one palette instanced mesh), the same run settings, and their ceilings
moved down to them; at High the menu went from 397 to 288 and alps-low
from 390 to 293. Their triangles and textures are the first run's,
their GPU columns GPU 1's.

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
with them on the same card. The GPU floor ceilings were re-based on a
GPU 1 run of all eighteen rows on 2026-10-13 (above), so a run that fell
back to GPU 0 is held to GPU 1's ceilings; read run-check's `on GPU 0`
line before reading a floor failure as a regression.

## Reference machine: Jetson AGX Orin

The machine the owner's two open decisions (COMPLETENESS 45 and 71: a
30 fps minimum and a named reference machine) would be read on: a Jetson
AGX Orin 64 GB developer kit on the LAN, JetPack 6 (L4T R36.5.2), power
mode MODE_50W (GPU up to 1300 MHz; MODE_MAXN lifts it and would move
every row), 12 Arm cores, memory shared by CPU and GPU, headless Chrome
for Testing 156.0.8078.4 on ANGLE over Vulkan:

    ANGLE (NVIDIA, Vulkan 1.3.251 (NVIDIA NVIDIA Tegra Orin (nvgpu) (0x97BA03D7)), NVIDIA)

scripts/perf-jetson.sh takes the rows (docs/PERF.md, The reference
machine), with the table's own run settings: 15 s, `--mode=quality`,
1600 by 900, free running, one scenario a browser, on batch/2026-10-14
at f0c06cbb6, 2026-10-13 between 23:25 and 23:33 local.

**5 of the 18 rows, and the run stopped.** As the fourth row
(`itaipu-stream` at Low) opened, the Orin's graphics engine wedged and
failed its reset, and only a reboot brings it back (docs/PERF.md, The
reference machine, for what the kernel logged). The five rows below were
written before the kernel's first error (the last at 23:32:33, the first
error at 23:32:38). The Interior, Itaipu streaming and the war are not
measured, so no tier is proposed here yet.

"Holds 30 fps" here is the 95th percentile frame at most 33.3 ms in the
15 s flight, and 60 fps at most 16.7 ms; the fps the average gives is
beside it. GPU load is the nvgpu's own share as the row opened, with
ComfyUI's queue and Ollama's models checked for the Low rows (all idle;
the two High rows were taken before that check existed, the queue empty
when the run began).

| Row on the Orin | Tier | Frame avg / p95, ms | fps at avg / p95 | GPU median / floor, ms | Draw calls, triangles M | GPU load before | 30 fps | 60 fps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title`, Orin | low | 5.1 / 6.5 | 198 / 154 | 3.9 / 2.5 | 114, 0.67 | 0 % | holds | holds |
| `title`, Orin | high | 12.5 / 13.6 | 80 / 74 | 10.9 / 8.0 | 280, 1.78 | 0 % | holds | holds |
| `alps-low`, Orin | low | 10.1 / 14.4 | 99 / 69 | 5.5 / 3.2 | 167, 1.28 | 0 % | holds | holds |
| `swiss-low`, Orin | low | 22.1 / 39.9 | 45 / 25 | 15.0 / 10.4 | 181, 1.62 | 0 % | no | no |
| `swiss-low`, Orin | high | 34.8 / 52.4 | 29 / 19 | 27.6 / 20.8 | 348, 3.78 | 0 % | no | no |

Not measured: `title` at Medium; `alps-low` at Medium and High;
`swiss-low` at Medium; `itaipu-stream`, `interior-ops` and `itaipu-war`
at every tier.

What the five say. Draw calls and triangles are within 4 calls and
0.13 M of the 3060 Ti rows (the same scene); the time is not. The Orin is held back on both
sides: in swiss-low at High the main thread spends 15.5 ms a frame in
three.js handing WebGL its draws and 11.5 ms in the rest of the shell's
frame (on the 3060 Ti box the whole frame is 9.7 ms), and the GPU's
median is 27.6 ms. The menu holds 60 at both tiers measured, the Alps
hold 60 at Low, and the Swiss valley holds 30 at no tier measured by
the 95th percentile: at Low its average is 45 fps but one frame in
twenty is over 39.9 ms (54 frames over 33.3 ms in 15 s).

### The owner's decision, proposed words

The floor is not proposed until the eighteen rows are in. The five
already show that the decision has two parts, and the first decides the
second:

1. **Which number "holds 30 fps" means.** Either "the 95th percentile
   frame of a 15 s perf-play flight is at most 33.3 ms" (what a pilot
   feels as stutter) or "the average frame is at most 33.3 ms" (what a
   frame counter shows). By the first, swiss-low misses 30 fps at Low
   today; by the second it holds 30 at Low (45 fps) and misses at High
   (29 fps).
2. **The tier and the machine.** Proposed words, the tier left open:
   "The reference machine is a Jetson AGX Orin 64 GB at MODE_50W,
   flown headless by scripts/perf-jetson.sh. Every world holds 30 fps,
   by <the number from 1>, at <Low | Medium | High> on it; a release
   that drops a world under it at that tier does not ship."

To finish the table: reboot the Jetson (its owner's call; the
reboot steps are in docs/PERF.md), then
`scripts/perf-jetson.sh OUT_DIR` and copy `OUT_DIR/summary.md` here.
