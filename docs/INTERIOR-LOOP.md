# The Interior photorealism loop

The owner asked for The Interior to be run through the loop
docs/SWISS2-LOOP.md ran on the Swiss valley and docs/ITAIPU-LOOP.md ran
on the dam: fixed views, a reference photograph beside each, the lead
scores, round agents improve what costs the score most. This file is the
loop's record: the method, the rubric, the views and their photographs,
the gates, and every round's scores. A round counts only if its scores go
up here.

## A round

1. Render the fixed views on the real GPU at High,
   `SIM_GPU=1 node scripts/interior-views.js ~/Desktop/fdfpv-loop/interior/round-N`,
   put each view's reference name into the round's `stats.json`
   (`python3 ~/Desktop/fdfpv-loop/interior/addref.py
   ~/Desktop/fdfpv-loop/interior/round-N`, below), and build the sheet,
   `python3 tools/swiss2-loop/sheet.py ~/Desktop/fdfpv-photoref/interior
   ~/Desktop/fdfpv-loop/interior/round-N-sheet.png
   ~/Desktop/fdfpv-loop/interior/round-N ~/Desktop/fdfpv-loop/interior/round-(N-1)`:
   the reference, last round and this round, side by side. Renders and
   sheets never go into the repository.
2. The lead scores every view against its reference by the rubric below
   and picks the round's targets: what hurts the pictures most, weighed
   against what it costs.
3. The targets are built in worktrees, one agent each, each owning named
   files and told which files the others own; the lead merges their PRs
   in turn, re-rendering after each, and scores the round on the last
   merge. Every agent verifies its brief before building on it and
   reports what was stale; "I built nothing, and here is why" is a valid
   result.
4. The gate, below. Otherwise a PR is closed and the round says why.
5. The sheet's scores are added here.

The views never move. A round that needs another angle adds a view, so
the before and after of every existing one stay pictures of the same
thing. The reference photographs are Wikimedia Commons images in
`~/Desktop/fdfpv-photoref/interior/`, their authors and licences in its
SOURCES.md, for comparison only; they are not redistributed and not in
any repository. The owner's five art direction mocks
(`~/Desktop/fdfpv-loop/interior/source/`) are the owner's own, also
reference only and never in a repository.

### What the tooling does not do yet

`scripts/interior-views.js` writes no `ref` per view into `stats.json`,
which `tools/swiss2-loop/sheet.py` needs (`scripts/itaipu-views.js` does).
Until the script does, `addref.py` (outside the repository, next to the
renders) adds each view's name from `~/Desktop/fdfpv-photoref/interior/ref-map.json`,
the table below as data. The sheet takes one reference per view; the
second reference some views have is in the folder to look at beside the
sheet.

## Rubric

Swiss2's, unchanged, so the three loops' numbers mean the same thing. Each
view, 1 to 10: how much the frame reads as a photograph of the place its
reference shows, judged on light and shadow, materials, water,
vegetation, atmosphere and distance, scale cues, and above all the one
thing that says "game". 1 is broken, 3 an old game, 5 a good flight sim,
7 a current game's best screenshot, 9 a photograph you would have to look
at twice.

What The Interior adds to how it is applied:

- **The land must read as northern Paraguay.** Subtropical lowland:
  pasture and cropland with scattered trees meeting semi deciduous
  forest, red laterite roads and soil, a broad brown river with forested
  banks, low houses with tin or tile roofs. A frame of a handsome green
  valley that could be anywhere scores on that, as swiss2's meadow views
  scored on being Alpine.
- **Places, people and names are invented.** The land is real (WORLD.md);
  the settlements, camp, roads and every name are the story's, so a
  reference photograph is judged for its look (materials, light, scale),
  never as a place to copy. No real town, person or company name goes
  into a frame or a string; `npm run lint:interior-names` holds it.
- **The camp and the figures matter at the camera ball's zooms.** The
  three `zoom-` views and `low-camp` are the game's core picture: a man
  at 400 to 600 m through an 8x lens. Tents, crates, motorcycles and
  figures that read as soft low poly blocks at 5.5 degrees score on
  that, however good the forest around them.
- **Some references are the owner's mocks, not photographs.** The camp
  has no photograph (no Commons picture shows a forest camp from the
  air); the owner's mocks are its target. A mock's HUD is not scored; its
  light, canopy, ground and props are.

## Budgets

Section 13 of docs/ITAIPU-PLAN.md as `scripts/interior-views.js` applies
it, at High on the RTX 3060 Ti, per view: at most 300 draw calls and 2.5
million triangles, and the GPU's least whole frame under 12 ms (timer
queries round every animation frame callback over 60 frames, the least
frame, the one with the least of the desktop's own drawing in it; the
median is printed too and moves with the other sessions' load). A view
over is still shot and written; the run fails naming it. A view already
over does not grow.

## The gate

A PR merges only if all of these hold:

- no view scores lower and the mean rises;
- every view within the budgets above, and none that is over grows;
- `canopy:los` parity holds: the trees drawn and `canopyBlocks` agree
  (`SIM_GPU=1 node scripts/canopy-los.js --browser`). This is a MUST: the
  canopy hides what the room says it hides, and a prettier forest that
  breaks it is a regression, not a gain;
- `people:route` and `interior:collide` pass (`node scripts/people-route.js`,
  `SIM_GPU=1 node scripts/interior-collide.js`);
- no other map changes: Swiss2, Itaipu and the rest keep their scene
  fingerprints and draw counts;
- the names lint passes (`npm run lint:interior-names`, and
  `npm run lint:nouns`), and `npm run lint:dashes`;
- the project's own checks pass.

## The views

22 views from `scripts/interior-views.js`, each through a 44 degree
vertical lens except the three `zoom-` views (5.5, 5.5 and 8 degrees, the
camera ball's 8x). Poses are written in MISSIONS.md's design grid with a
height over the ground, and the script fails the run for a camera within a
metre of the ground or 0.5 m of a solid. `?people=demo` has every route's
people out. Each view's first reference is what the sheet shows; the
second, where there is one, is to look at beside it.

| View | What it frames | Reference (sheet) | Also |
| --- | --- | --- | --- |
| survey-alpha-600 | Sector Alpha from 600 m: pasture, ranch tracks, forest and the river | farm-forest-edge | mock-survey-alpha, cattle-pasture, red-road-farmland, cattle-herd |
| survey-bridge-800 | the double bridge and the river from 800 m | river-bridge-aerial | causeway-aerial |
| survey-bravo-1000 | Sector Bravo and the colonia from 1000 m | settlement-aerial | mock-survey-sunset |
| survey-charlie-1200 | Sector Charlie's forest from 1200 m | forest-river-aerial | river-island-aerial |
| survey-wide-1800 | the whole corridor and the river from 1800 m | river-broad | mock-survey-sunset, river-island-aerial |
| survey-nadir-1800 | straight down on Bravo and Charlie from 1800 m | nadir-mosaic | |
| camp-orbit-0 to camp-orbit-315 (8 views) | Claro Viejo from 700 m out and 450 m up, every 45 degrees | mock-hideout | clearing-road-aerial |
| low-bridge | the bridge from the bank, 14 m up | bridge-wood | river-forest-bank |
| low-colonia | the colonia from a drone's 120 m | village-low-aerial | village-andes-aerial |
| low-pista | the strip at Pista Cero from a man's height | red-road-eye | red-road-farmland, road-forest-tunnel |
| low-canada | the forest's edge on the canada from 40 m | forest-creek | road-forest-tunnel, mock-pursuit |
| low-camp | the camp's clearing from 60 m over its edge | mock-encampment | forest-understory |
| zoom-camp-600 | the camp's people at 8x, 600 m out at the standoff | mock-encampment | mock-hideout |
| zoom-colonia-500 | the colonia's street at 8x, looking down from 300 m up | clearing-road-aerial | street-rural, village-low-aerial |
| zoom-motorcycle-400 | the motorcycle pair under the trees at 8x, looking down from 260 m up | causeway-aerial | road-motorcycle, mock-pursuit |

The eight orbit views share one reference: a camp seen from the air does
not change with the bearing, and the loop scores each bearing against it.
The photographs are Wikimedia Commons; where one is not Paraguay
(Pantanal, Bolivia, Rondonia) it is the same land cover, lowland
farmland meeting subtropical forest, and SOURCES.md says where each is
from. Weak matches, to be scored with that in mind: `nadir-mosaic` is an
astronaut's photograph from orbit, the only straight down view of this
land cover Commons has; `village-low-aerial` is a fishing village on the
river from above, a higher altitude than the view; `clearing-road-aerial`
is a sawmill settlement, the red road and low roofs right but not a
street of houses; `causeway-aerial` has a vehicle on a red road from
above, flooded, and no motorcycles (`road-motorcycle`, at ground level,
has them). The two `zoom-` views above the colonia and the road look
down from 260 to 300 m, so their ground level photographs are only the
second reference.

## Rounds

### Round 0, the baseline

Scored by the lead 2026-10-05. Sheet:
`~/Desktop/fdfpv-loop/interior/round-0-sheet.png`; renders in
`~/Desktop/fdfpv-loop/interior/round-0/`.

| View | Score | Calls | Tris (M) | GPU least / median (ms) | The tell |
| --- | --- | --- | --- | --- | --- |
| survey-alpha-600 | 2 | 108 | 0.35 | 1.2 / 1.6 | patchwork fields in flat colour, grey haze, no furrows or field edges |
| survey-bridge-800 | 2 | 96 | 0.29 | 1.1 / 2.4 | river barely reads, no bridge visible at range, roads thin pink lines |
| survey-bravo-1000 | 2 | 95 | 0.38 | 1.2 / 1.5 | settlement invisible at range, flat colour fields, washed haze |
| survey-charlie-1200 | 2 | 104 | 0.27 | 1.1 / 2.0 | forest a flat dark sheet, river a red line, sand-coloured clearings with hard edges |
| survey-wide-1800 | 2 | 109 | 0.28 | 1.2 / 1.2 | grey wash over everything, polygon field mosaic |
| survey-nadir-1800 | 2 | 76 | 0.14 | 0.9 / 0.9 | flat greys, no texture at all from overhead |
| camp-orbit-0 | 2 | 104 | 1.34 | 1.2 / 1.5 | uniform lollipop canopy, pink and yellow dots, forest block ends in a straight edge |
| camp-orbit-45 | 2 | 103 | 1.25 | 1.2 / 2.5 | same; straight forest edges read as a map square |
| camp-orbit-90 | 2 | 100 | 1.16 | 1.3 / 2.6 | same; flat dark canopy, holes look cut out |
| camp-orbit-135 | 2 | 93 | 1.21 | 1.3 / 2.6 | same |
| camp-orbit-180 | 2 | 97 | 1.10 | 1.3 / 2.6 | same |
| camp-orbit-225 | 2 | 95 | 1.19 | 1.3 / 2.6 | same |
| camp-orbit-270 | 2 | 94 | 1.27 | 1.2 / 2.5 | same |
| camp-orbit-315 | 2 | 98 | 1.38 | 1.2 / 1.4 | same |
| low-bridge | 1.5 | 83 | 1.28 | 1.4 / 2.7 | blob trees, flat ground, plain bridge |
| low-colonia | 1.5 | 92 | 0.41 | 1.1 / 1.4 | white boxes, flat ground |
| low-pista | 1.5 | 125 | 0.83 | 1.1 / 2.4 | flat green ground, no red earth strip |
| low-canada | 2 | 106 | 1.92 | 1.7 / 2.9 | rows of identical lollipop trees, no undergrowth, creek invisible |
| low-camp | 1.5 | 102 | 2.24 | 1.7 / 2.0 | low-poly crowns, camp props tiny and plain, tarps flat planes |
| zoom-camp-600 | 1.5 | 79 | 1.05 | 1.0 / 2.4 | faceted crowns, figures specks, tarps flat |
| zoom-colonia-500 | 1.5 | 69 | 0.22 | 0.9 / 1.0 | house boxes, road a flat pink stripe, ground a blurred smear |
| zoom-motorcycle-400 | 1.5 | 78 | 0.20 | 1.0 / 1.1 | road a flat stripe, no motorcycle readable, ground smear |

Mean of the 22 views: 1.84.

Round 1 targets (lead): (A) ground, water and atmosphere: field textures and red earth, roads with width, a brown reflective river, lighter haze; (B) the forest: varied crowns in size, shape and colour, irregular natural edges instead of the block's straight sides, quieter flowering trees, canopy:los parity kept.
