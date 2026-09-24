# The swiss2 photorealism loop

The owner asked for the photoreal Swiss valley (`swiss2`) to be improved
in a loop, more photographic each round, ten rounds, with a check in
every three. This file is the loop's record: the method, the rubric, and
every round's scores. A round counts only if its scores go up here; a
round that was busy and changed nothing on the sheet is not progress.

## A round

1. Render the fixed views, `SIM_GPU=1 node scripts/swiss2-views.js
   ~/Desktop/fdfpv-loop/round-N`, on the real GPU at High with a local
   board running (see scripts/posters.js for why), and build the sheet,
   `python3 tools/swiss2-loop/sheet.py ~/Desktop/fdfpv-photoref
   ~/Desktop/fdfpv-loop/round-N-sheet.png round-N round-(N-1)`: the
   reference photograph, last round and this round, side by side.
2. The lead scores every view against its reference by the rubric below
   and picks the two or three biggest remaining tells: what hurts the
   picture most, not what is easiest.
3. The fixes are built in worktrees and each opens a PR. From round 3
   on (the owner's call, 2026-09-24) a round is a parallel team: one
   agent per target, each owning named files and told which files the
   others own, so they cannot collide; the lead merges their PRs in
   turn, re-rendering after each, and scores the round on the last
   merge. Round 2 ran as two agents (2 and 2b) the same way.
4. The gate. The PR merges only if: no view scores lower and the mean
   rises; no view's draw calls or triangles grow past the budget below
   and none drops under 60 fps; the cel `alps` map is unchanged (the
   scene fingerprint and draw counts the render PR introduced); and the
   project's own checks pass. Otherwise it is closed, and the round says
   why.
5. The sheet and the scores are added here.

The views never move. A round that needs a new angle adds a view, so
the before and after of every existing one stay pictures of the same
thing. The reference photographs are Wikimedia Commons images kept in
`~/Desktop/fdfpv-photoref/` with their licences in its SOURCES.md, for
comparison only; they are not redistributed and not in any repository.

## Rubric

Each view, 1 to 10: how much the frame reads as a photograph of the
place its reference shows, judged on light and shadow, materials,
vegetation, atmosphere and distance, scale cues, and above all the one
thing that says "game". 1 is broken, 3 an old game, 5 a good flight sim,
7 a current game's best screenshot, 9 a photograph you would have to
look at twice.

## Budgets

At High on the RTX 3060 Ti, per view: at most 300 draw calls and 2.5
million triangles, and never under 60 fps (the harness's frame time is
capped at 16.7 ms by the display, so it can only show a drop). The
waterfall view breaks the triangle budget at round 0 and must come back
under it.

## Walls the loop reports rather than climbs

Shapes (buildings, cows, cars are low poly blocks: photoreal means
remodelling them), the terrain's 30 m cells (smooth ridgelines up
close), and what a browser GPU can afford. A round that runs into one
proposes it to the owner instead of spending itself on it.

## Rounds

### Round 0, the baseline (main at 3e63c23)

| View | Score | The tell |
| --- | --- | --- |
| strip | 4 | a flat, even lawn to the walls |
| vista-high | 5 | the floor is one bright green; the walls read |
| cruise | 5 | the same floor; broadleaf trees are dark blobs |
| village-20m | 3 | box houses on a golf course lawn |
| square-eye | 3 | the same, at eye level |
| meadow-eye | 1 | BROKEN: an upside down forest fills the upper frame |
| east-wall | 5 | the best view; the floor again |
| lake-shore | 1 | BROKEN: the lake's reflection is drawn above the horizon |
| lake-high | 4 | the water reads; the shore is a drawn line |
| waterfall | 3 | the fall is a stack of chips; 7.6 M triangles in view |
| into-sun | 5 | good light, bare floor |
| farm-low | 4 | the near grass is good; the rest is lawn |

Mean 3.67. Round 1 goes after the broken reflection, the even floor and
the waterfall.

### Round 1 (PR #16, main at 0b7d9f2)

The round found that round 0's two broken views were the lead's camera
heights, not a reflection: the views gave an absolute Y and the floor
there is 3 to 5 m above zero, so both cameras sat inside the hill. Their
Y was raised to 1.6 m over the ground (X, Z and the look at unchanged),
every view now fails the run if its camera is within 1 m of the ground,
and a `lake-edge` view was added. The waterfall's 7.6 M triangles were
the forest, drawn unculled behind the camera and into two shadow maps.

| View | R0 | R1 | The tell now |
| --- | --- | --- | --- |
| strip | 4 | 4 | an even lawn from the strip |
| vista-high | 5 | 5.5 | a patchwork at last, laid out with a ruler |
| cruise | 5 | 5.5 | the same |
| village-20m | 3 | 3 | box houses |
| square-eye | 3 | 3 | the same |
| meadow-eye | 1* | 4 | a plain meadow with lollipop trees |
| east-wall | 5 | 5 | one field edge reads as a seam |
| lake-shore | 1* | 4 | now a roadside view, plain |
| lake-high | 4 | 4.5 | fields reach the shore |
| waterfall | 3 | 3.5 | a better veil, still a white column and a blob |
| into-sun | 5 | 5 | the floor is still one light |
| farm-low | 4 | 4 | the near grass is good, the far is lawn |
| lake-edge | | 4 | new: jetty, reeds, the reflection the right way up |

Mean of the twelve: 3.67 to 4.25. *Round 0's two 1s were the lead's
misplaced cameras; over the ten views valid in both rounds the mean went
4.1 to 4.3. The gate held: no view lower, every view within budget
(waterfall 2.23 M triangles), alps fingerprint unchanged.

Round 2 goes after colour and atmosphere (every frame is a saturated,
evenly lit green where the references are muted, hazed blue grey with
distance and lit unevenly under cloud), the village (stuck at 3), and
the ruler straight patchwork with its lollipop trees.

### Round 2 (PRs #17 and #18, main at f730e7b)

Two agents in parallel: 2b the waterfall, the lake and the peaks; 2 the
colour and atmosphere, the village's materials, the patchwork and the
lone trees. Round 2 found the views never pinned their field of view
(the parked camera took the pilot's 100 degrees at a load dependent
moment); `__setCam` now takes the fov and the views pass 44, which
earlier rounds were shot at. Colour measured against the photographs
(tools/swiss2-loop/colour.py): saturation 0.36 to 0.32 (photos 0.32),
greens 0.42 to 0.38 (0.37), far blue shift now matching.

| View | R1 | R2 | The tell now |
| --- | --- | --- | --- |
| strip | 4 | 4.5 | the strip's own lawn |
| vista-high | 5.5 | 6 | the walls are one texture from top to floor |
| cruise | 5.5 | 6 | the same |
| village-20m | 3 | 3.5 | box houses, now weathered |
| square-eye | 3 | 3 | box houses |
| meadow-eye | 4 | 4.5 | the treeline is a single row |
| east-wall | 5 | 5.5 | the forest wall is uniform |
| lake-shore | 4 | 4 | a roadside |
| lake-high | 4.5 | 5.5 | good; streaks a little regular |
| waterfall | 3.5 | 4.5 | falls straight into a round mist |
| into-sun | 5 | 5 | the floor toward the sun is pale |
| farm-low | 4 | 4 | the floor behind the near grass |
| lake-edge | 4 | 4.5 | no reeds, a plain shore |

Mean of the thirteen: 4.23 to 4.65. Gate held: no view lower, the
most calls 289 (vista-high) and triangles 2.32 M (waterfall), alps
fingerprint unchanged (scripts/scene-fingerprint.js, committed).

Decision, the first wall (the owner is away and asked for no check ins):
the village cannot pass about 3.5 while its houses are boxes, and their
shapes are built in src/maps/alps/kit.js, which the cel alps shares.
Round 3 builds a swiss2 only building kit behind a style hook in kit.js,
with alps proven unchanged by the fingerprint.

Round 3, a parallel team with shared budget (each agent at most +3 draw
calls and +50 k triangles per view unless it frees as much elsewhere):
buildings (the kit), sky and atmosphere (low cloud in the valley and on
the walls, the pale floor into the sun, the walls' uniformity with
height), and the floor and forest detail (forest structure and edges,
hay huts, fences, bales, the stream's rocky banks, a reed bank).
