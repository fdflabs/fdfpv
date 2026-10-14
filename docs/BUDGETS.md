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
  burst of ten explosions every ten seconds;
- `peers`: a full private room on the alps, the page's 7 inch on its pad
  and seven more pilots' 7 inches circling 30 to 90 m in front of it, all
  seven in the chase camera's view (the run stops if not). The seven are
  perf-play on the room's wire (hello, clock pings, a pose 30 times a
  second), not seven browsers, so the row is what drawing a room costs
  one page.

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
written: WebGL has no query for what a texture holds on the card, three
keeps no byte count, and perf-play's own `uploads` line is the bytes
handed to the card in a frame, not what stays allocated, with texStorage
counted 0, so texture megabytes stop at the count); the GPU floor (each
GPU segment's tenth percentile, summed:
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

| Row | Tier | Draw calls | Triangles, M | Live textures | GPU floor, ms | GPU median, ms | Frame avg / p95, ms | GPU 1 busy, host load | Over the written contract | Attackers alive, peers in view |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | low | 118 (<= 136) | 0.68 (<= 0.78) | 5 (<= 6) | 0.30 (<= 0.35) 2026-10-13 | 0.3 | 0.7 / 1.3 | 8 %, 2.2 | within | none |
| `title` | medium | 275 (<= 317) | 1.65 (<= 1.91) | 7 (<= 9) | 0.68 (<= 0.79) 2026-10-13 | 1.0 | 1.3 / 1.9 | 11 %, 2.4 | within | none |
| `title` | high | 288 (<= 332) | 1.65 (<= 1.91) | 18 (<= 21) | 0.80 (<= 0.92) 2026-10-13 | 1.1 | 1.4 / 2.1 | 18 %, 2.2 | within | none |
| `alps-low` | low | 167 (<= 193) | 1.26 (<= 1.46) | 9 (<= 11) | 0.69 (<= 0.80) 2026-10-13 | 0.8 | 1.8 / 3.2 | 23 %, 2.5 | within | none |
| `alps-low` | medium | 280 (<= 322) | 2.37 (<= 2.73) | 11 (<= 13) | 1.09 (<= 1.26) 2026-10-13 | 1.3 | 2.5 / 4.1 | 23 %, 2.3 | within | none |
| `alps-low` | high | 293 (<= 337) | 2.37 (<= 2.73) | 22 (<= 26) | 1.21 (<= 1.40) 2026-10-13 | 1.5 | 2.7 / 4.6 | 23 %, 2.3 | within | none |
| `swiss-low` | low | 181 (<= 209) | 1.62 (<= 1.87) | 66 (<= 76) | 3.00 (<= 3.45) 2026-10-13 | 3.3 | 4.8 / 8.2 | 37 %, 2.4 | within | none |
| `swiss-low` | medium | 244 (<= 281) | 2.39 (<= 2.75) | 74 (<= 86) | 4.72 (<= 5.43) 2026-10-13 | 5.3 | 7.1 / 11.9 | 41 %, 2.4 | within | none |
| `swiss-low` | high | 350 (<= 403) | 3.77 (<= 4.35) | 86 (<= 99) | 6.75 (<= 7.77) 2026-10-13 | 7.5 | 9.7 / 11.7 | 55 %, 2.4 | within: main view 242 calls, 2.41 M; inset 106, 1.40 M | none |
| `itaipu-stream` | low | 129 (<= 149) | 1.80 (<= 2.08) | 67 (<= 78) | 1.51 (<= 1.74) 2026-10-13 | 2.9 | 4.4 / 8.5 | 28 %, 3.8 | within | none |
| `itaipu-stream` | medium | 198 (<= 228) | 3.05 (<= 3.51) | 75 (<= 87) | 2.15 (<= 2.48) 2026-10-13 | 3.7 | 5.8 / 10.7 | 24 %, 3.8 | within | none |
| `itaipu-stream` | high | 253 (<= 291) | 5.65 (<= 6.50) | 87 (<= 101) | 3.07 (<= 3.54) 2026-10-13 | 5.1 | 7.1 / 12.0 | 30 %, 4.8 | within: main view 156 calls, 3.83 M (<= 4.0 M); inset 97, 1.87 M | none |
| `interior-ops` | low | 99 (<= 114) | 0.54 (<= 0.62) | 29 (<= 34) | 1.44 (<= 1.66) 2026-10-13 | 5.8 | 7.1 / 8.4 | 26 %, 3.8 | within | none |
| `interior-ops` | medium | 106 (<= 122) | 0.57 (<= 0.66) | 36 (<= 42) | 1.66 (<= 1.91) 2026-10-13 | 5.2 | 6.7 / 7.3 | 36 %, 1.9 | within | none |
| `interior-ops` | high | 125 (<= 144) | 0.57 (<= 0.67) | 48 (<= 56) | 1.97 (<= 2.27) 2026-10-13 | 5.9 | 7.1 / 7.7 | 34 %, 2.4 | within | none |
| `itaipu-war` | low | 157 (<= 181) | 1.82 (<= 2.10) | 69 (<= 80) | 1.14 (<= 1.31) 2026-10-14 | 2.4 | 4.1 / 8.0 | 37 %, 2.5 | within | 1 alive, stage `eyes` |
| `itaipu-war` | medium | 247 (<= 285) | 2.85 (<= 3.28) | 77 (<= 89) | 1.46 (<= 1.69) 2026-10-14 | 2.9 | 4.8 / 9.2 | 35 %, 2.9 | within | 1 alive, stage `eyes` |
| `itaipu-war` | high | 279 (<= 321) | 3.03 (<= 3.48) | 89 (<= 103) | 1.74 (<= 2.01) 2026-10-14 | 3.2 | 5.3 / 9.5 | 38 %, 2.4 | within: main view 196 calls, 2.07 M (<= 4.0 M); inset 83, 0.96 M | 1 alive, stage `eyes` |
| `peers` | low | 717 (<= 825) | 1.31 (<= 1.51) | 16 (<= 19) | 1.46 (<= 1.68) 2026-10-14 | 1.4 | 3.4 / 5.3 | 26 %, 10.7 | within | 7 peers |
| `peers` | medium | 1398 (<= 1608) | 2.43 (<= 2.80) | 18 (<= 21) | 2.99 (<= 3.44) 2026-10-14 | 5.8 | 11.5 / 20.1 | 30 %, 11.1 | within | 7 peers |
| `peers` | high | 1411 (<= 1623) | 2.43 (<= 2.80) | 29 (<= 34) | 2.90 (<= 3.34) 2026-10-14 | 4.6 | 8.5 / 10.6 | 18 %, 14.2 | over: 1411 calls, the whole frame against the main view's 300 (not split) | 7 peers |

The draw calls of `title` and `alps-low` at every tier were retaken on
2026-10-13 after the Alps' draws were merged (branch w38-perf: the
village's plain colours one palette mesh, the road, lane and stream
ribbons by material, the boulders one instanced mesh a band, the flowers
one palette instanced mesh), the same run settings, and their ceilings
moved down to them; at High the menu went from 397 to 288 and alps-low
from 390 to 293. Their triangles and textures are the first run's,
their GPU columns GPU 1's.

The `peers` rows were flown 2026-10-14 between 01:01 and 01:05 local on
GPU 1, through run-check.sh, on batch/2026-10-14 at ae46f1dc3 plus this
row's perf-play, the same run settings, each tier three times (twice,
then once more with `--budgets` beside itaipu-war, 01:06 to 01:10); the
draw calls, triangles and textures of the three were equal. The GPU
floor was not: 1.02 to 1.46 ms at Low, 1.99 to 2.99 at Medium, 1.97 to
2.90 at High, on GPU 1 at 18 to 59 % busy, and the quieter card did not
give the lower floor. A ceiling from the quietest run, as the other rows
have, failed the next run (Medium 2.99 against 2.29), so the peers
floors are written at the highest of the three and held 15 % over it;
their GPU median and frame times are the quietest run's. Held so, all
three tiers passed again at 01:14 to 01:20 with GPU 1 under 50 % busy;
two Low runs while another lane's check held GPU 1 at 100 % read 8.43
and 2.35 ms, which says what a floor on a full card is worth.

A room is the dearest row in draw calls. Each peer's 7 inch was 47
meshes and a name tag, and a per draw breakdown of the busiest frame at
Medium and at High (2026-10-14) put 1 267 calls on the seven: 48 each in
the scene, the sensor inset and the ink prepass, 37 in the shadow map
(no ink, tag or discs). Three runs that had the seven off the view drew
300 to 319.

Their draw calls were retaken 2026-10-14 between 02:41 and 03:06 local
after a peer's combat quad was built with mergeFixed (branch
w39-peers-perf: a material worn in several parts at one offset is one
mesh, 47 meshes to 40), on GPU 1 through run-check.sh, the same run
settings, each tier three times: 717 at Low, 1 398 at Medium, 1 411 at
High in every run, and their ceilings moved down to 1.15 times that.
Their other columns are the first runs'. At High a full room is still
almost five times the main view's 300 calls on its own: the rest is the
parts' own materials (one call each) and the four rotors and discs.

The ceilings above hold today's whole frame cost from growing; whether
a row is within the contract is the column "Over the written
contract", read against the contract below.

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
measurement each contract figure was checked against; the column "Over
the written contract" reads each High row against it, and its main view figures
are that table's.

The `itaipu-war` GPU floors were re-based on 2026-10-14. With the
attackers read added, Low read 1.06 ms against its 1.05 ceiling (0.91
measured 2026-10-13), and the read was tested at Low, GPU 1 at 28 to 36 %
busy, 01:25 to 01:31: without it 1.13 and 1.06 ms, with it 1.12 and
1.14, the same within the card's noise, so the read stays and the rows
take the row's own rule from runs with it in: Low 1.14 (the quieter of
those two), Medium 1.46 and High 1.74 (01:08 and 01:10, 33 and 35 %
busy), each held 15 % over. Their other columns are 2026-10-13's: calls,
triangles and textures read the same.

Attackers and peers, the last column, are written and never held: they
are the load a row was measured under, not a cost. The war's figure is
the most attackers alive in any second of its 15 s window and the stage
then (perf-play samples `__war()` once a second): 1, in mission 1's
first stage, Eyes (a Scout, and a Striker 25 to 40 s in), at every
tier on 2026-10-14, so it is not the mission's peak (First Light, stage
5); a row at that stage is a war row
of its own, flown through the room's developer skip. The peers' figure
is how many of the seven were drawn in the camera's view in every
second.

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
1600 by 900, free running, one scenario a browser.

**7 of the 18 rows; the Orin's GPU wedges under this run.** Twice, a
few seconds after a row's Chrome closed, the kernel logged the same
graphics engine hang (docs/PERF.md, The reference machine):

- 2026-10-13, batch/2026-10-14 at f0c06cbb6: five rows from 23:25 to
  23:32:33; the hang from 23:32:38, after `swiss-low` at Low; the next
  row's Chrome then failed the engine's reset, and only a reboot
  brought it back.
- 2026-10-14, after that reboot, batch/2026-10-14 at 2012053f6:
  `itaipu-stream` and `interior-ops` at Low, the second written at
  00:20:35; the hang from 00:20:38, after `interior-ops`. The script's
  check stopped the run there, before another browser opened. Not
  retried.

Every row below was written before its run's first kernel error. Not
measured: `title` at Medium; `alps-low` at Medium and High; `swiss-low`
at Medium; `itaipu-stream` and `interior-ops` at Medium and High;
`itaipu-war` at every tier.

"Holds 30 fps" here is the 95th percentile frame at most 33.3 ms in the
15 s flight, and 60 fps at most 16.7 ms; the fps the average gives is
beside it. GPU load is the nvgpu's own share as the row opened, and
ComfyUI's queue and Ollama's models were idle before and after every
Low row (the two High rows were taken before that check existed, the
queue empty when the run began).

| Row on the Orin | Tier | Frame avg / p95, ms | fps at avg / p95 | GPU median / floor, ms | Draw calls, triangles M | GPU load before | 30 fps | 60 fps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title`, Orin | low | 5.1 / 6.5 | 198 / 154 | 3.9 / 2.5 | 114, 0.67 | 0 % | holds | holds |
| `title`, Orin | high | 12.5 / 13.6 | 80 / 74 | 10.9 / 8.0 | 280, 1.78 | 0 % | holds | holds |
| `alps-low`, Orin | low | 10.1 / 14.4 | 99 / 69 | 5.5 / 3.2 | 167, 1.28 | 0 % | holds | holds |
| `swiss-low`, Orin | low | 22.1 / 39.9 | 45 / 25 | 15.0 / 10.4 | 181, 1.62 | 0 % | no | no |
| `swiss-low`, Orin | high | 34.8 / 52.4 | 29 / 19 | 27.6 / 20.8 | 348, 3.78 | 0 % | no | no |
| `itaipu-stream`, Orin | low | 17.2 / 27.4 | 58 / 36 | 11.2 / 5.1 | 129, 1.80 | 0 % | holds | no |
| `interior-ops`, Orin | low | 41.1 / 47.4 | 24 / 21 | 31.2 / 10.4 | 99, 0.54 | 0 % | no | no |

What the seven say. Draw calls and triangles are within 4 calls and
0.13 M of the 3060 Ti rows (the same scene); the time is not. The
Orin's Arm cores are as much the limit as its GPU:

- `interior-ops` at Low spends 33.3 ms of every frame in the shell's
  own frame work (input, the map, the mission, the HUD), 4.8 ms in
  three.js; every one of its 367 frames was over 33.3 ms. On the
  3060 Ti box the whole frame is 7.1 ms.
- `swiss-low` at High: 15.5 ms in three.js and 11.5 ms in the rest of
  the shell's frame, with the GPU's median at 27.6 ms (9.7 ms a frame
  on the 3060 Ti box).
- `itaipu-stream` at Low: 6.1 ms shell, 7.0 ms three.js, GPU median
  11.2 ms; 23 of 872 frames over 33.3 ms.

### The owner's decision, proposed words

Per world, the lowest tier measured, average and 95th percentile:

| World | Tier | Average | p95 | Holds 30 by average | Holds 30 by p95 |
| --- | --- | --- | --- | --- | --- |
| the menu (`title`) | low | 198 fps | 154 fps | yes | yes |
| the Alps (`alps-low`) | low | 99 fps | 69 fps | yes | yes |
| the Swiss valley (`swiss-low`) | low | 45 fps | 25 fps | yes | no |
| Itaipu (`itaipu-stream`) | low | 58 fps | 36 fps | yes | yes |
| the Interior (`interior-ops`) | low | 24 fps | 21 fps | no | no |
| the war (`itaipu-war`) | | not measured | not measured | | |

**No tier holds 30 fps in every world on this machine today.** The
Interior misses it at Low by both numbers, and on the main thread, so
no lower GPU tier would rescue it. A floor set on the Orin at MODE_50W
fails the day it is set. The decision has two parts:

1. **Which number "holds 30 fps" means.** "The 95th percentile frame of
   a 15 s perf-play flight is at most 33.3 ms" (what a pilot feels as
   stutter), or "the average frame is at most 33.3 ms" (what a frame
   counter shows). By the average, four of five measured worlds hold 30
   at Low; by the 95th percentile, three.
2. **The tier and the machine.** Proposed words: "The reference machine
   is a Jetson AGX Orin 64 GB at MODE_50W, flown headless by
   scripts/perf-jetson.sh. Every world holds 30 fps, by <the number from
   1>, at Low on it; until the Interior and the Swiss valley do, the
   floor is a target and not a release gate." Low is the only tier
   worth naming: nothing measured at High holds 30 except the menu.

**The Orin cannot serve as the reference machine until the nvgpu fault
on Chrome's shutdown is understood** (2026-10-14). Headless, the one
path that draws on its GPU is ANGLE over Vulkan, and the GPU wedged
after a Chrome closed in both runs of it (`ga10b_gr_init_wait_empty:
timeout, ctxsw busy: 1` and `gk20a_pm_runtime_suspend: failed to power
off, err=-11` every four seconds, then `nvgpu_engine_gr_reset: failed to
reset gr engine` on the next channel; docs/PERF.md, The reference
machine); desktop GL under Xvfb draws on Mesa's llvmpipe, not the Orin.
The seven rows above stand as measurements; no more are taken on it.

Two more things weigh against naming the Orin: its other work (ComfyUI,
Ollama) stops until a reboot whenever it wedges, and an Arm board with 12 cores and shared memory is not the
"2020 era laptop with integrated graphics" Medium names. A machine that
can be flown after every release without a reboot is the precondition
for a floor read on it.
