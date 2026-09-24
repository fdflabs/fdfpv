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

### Round 3 (PRs #19, #20, #21, main at 014398c): the first parallel team

Buildings (#19): swiss2's own Bernese chalets, farmhouse, barns,
Gasthof, bakery and church through a `look.buildings` hook, colliders
and the alps fingerprint identical, and the village merged from 36
meshes to 13 (up to 47 draw calls freed per view). Sky and landscape
(#20): low cloud in three layers drawn in the post pass (fly through,
casts shadow), walls banded by height (rock only on cliffs and ribs,
turf above the tree line, limestone bands with scree), the grass sheen
into the sun hidden. Floor and forest (#21): a ragged, varied forest
edge, gullies, larch groups and snags, stream banks with stones and
gravel bars, a reed bank, hay huts, fences and bales in two draws, and
about 900 k invisible rock triangles per view removed.

| View | R2 | R3 | The tell now |
| --- | --- | --- | --- |
| strip | 4.5 | 5 | a mown lawn to the hangar |
| vista-high | 6 | 6.5 | cloud edges are hard slabs |
| cruise | 6 | 6.5 | the same |
| village-20m | 3.5 | 4.5 | plain white ground floors; toy cars |
| square-eye | 3 | 3.5 | the bus fills the frame and reads as a toy |
| meadow-eye | 4.5 | 5 | good; the far meadow is even |
| east-wall | 5.5 | 5.5 | a flat cloud slab along the ridge |
| lake-shore | 4 | 4.5 | a roadside, now fenced |
| lake-high | 5.5 | 5.5 | |
| waterfall | 4.5 | 4.5 | a column straight into a round mist |
| into-sun | 5 | 5.5 | good; cloud flecks |
| farm-low | 4 | 4.5 | the far floor is lawn |
| lake-edge | 4.5 | 5 | reeds; the shore is plain |

Mean of the thirteen: 4.65 to 5.08. Gate held: no view lower; the most
calls 241, the most triangles 1.42 M (strip), every view cheaper than
round 2; alps fingerprint unchanged.

Round 4, a team: sky (soft, volumetric looking cloud without slab
edges, the east wall's ridge slab), the made things (photoreal vehicles
through a style hook, the hangar, the chalets' plain ground floors),
and nature (the waterfall's cascade, splash zone and wet rock; the far
meadow's flowers and uneven growth).

### Round 4 (PRs #22, #23, #24, main at 9ab79ec)

Nature (#22): the fall lands on a stepped apron and cascades into the
pool, moss in the spray, broadleaf trees at the foot, a mid distance
grass layer following the field types, clover on the strip, shore
boulders. Sky (#23): the bank and stratus share one cumulus shape with
worn edges and self shadowing, the mist no longer paints the walls, and
the pass is cheaper. Made things (#24): the PostAuto, cars, tractor and
motorbike through a style hook, the hangar as a steel portal shed with
its apron, and the chalets' ground floors finished.

| View | R3 | R4 | The tell now |
| --- | --- | --- | --- |
| strip | 5 | 5.5 | the hangar reads; the far floor is lawn |
| vista-high | 6.5 | 6.5 | the floor past 200 m is flat lawn tiles |
| cruise | 6.5 | 6.5 | the same |
| village-20m | 4.5 | 5 | big plain white walls from above |
| square-eye | 3.5 | 4.5 | the bus reads; it leans mustard in shade |
| meadow-eye | 5 | 5.5 | good |
| east-wall | 5.5 | 6 | the ridge lens is gone; the floor |
| lake-shore | 4.5 | 4.5 | a roadside, plain |
| lake-high | 5.5 | 5.5 | |
| waterfall | 4.5 | 5 | the cascade reads; the broadleaf trees at the foot are bright blobs |
| into-sun | 5.5 | 6 | cloud on the headwall; small puffs read as popcorn |
| farm-low | 4.5 | 4.5 | the far floor |
| lake-edge | 5 | 5 | |

Mean of the thirteen: 5.08 to 5.38. Gate held: no view lower; at most
242 calls and 1.69 M triangles; alps fingerprint and colliders
unchanged.

The biggest tell left is the same in five views: the floor past the
grass radius is flat, even lawn tiles. Round 5, a team: ground (the far
floor, and the smeared streaks on steep far walls), camera and light
(the lens that makes a render read as a photograph: exposure, flare,
vignette, grain, depth of field on low views; the fall's foot in the
baked shadow; mist in the forest), and nature (the broadleaf trees'
look, the lake-shore and farm-low foregrounds).

Queued by the owner for after round 10: a plan for complex crash
physics and its own loop. Running in parallel with the loop now: four
new aircraft (Slow Stick, powered glider, Timber Evolution, and the
Bramor C4EYE replacing the flying wing); the plane you fly stays cel in
swiss2 until they land, and a photoreal aircraft pass follows them.

### Round 5 (PRs #26, #28, #29, main at 10827a7)

Ground (#26): the far floor textured per field (mower passes, headlands,
tracks, hedge shadows, clumps, drift, soft edges, grazing sheen) and the
steep walls' smears fixed at their three causes. Camera and light
(#28): metered exposure (reset per fixed view so rounds compare), sun
glare that ridges hide, grain, edge fringing, forest mist at crown
height; depth of field and lens ghosts left out because no reference
has them. Nature (#29): foliage translucency lit by the sun each leaf
actually gets (the lime crowns), broadleaf crowns rebuilt as lit clumps,
weedy verges, delineator posts, gate, log stack, signpost, boat shed,
hedgerows, orchards, a dark stream.

| View | R4 | R5 | The tell now |
| --- | --- | --- | --- |
| strip | 5.5 | 5.5 | the near floor is even |
| vista-high | 6.5 | 7 | trees and hedgerows on the floor; reads |
| cruise | 6.5 | 7 | the same |
| village-20m | 5 | 5 | white walls from above |
| square-eye | 4.5 | 4.5 | the bus in the foreground |
| meadow-eye | 5.5 | 6 | a treeline with depth |
| east-wall | 6 | 6.5 | mist in the forest; mower bars read dashed |
| lake-shore | 4.5 | 5.5 | a real verge; the weeds read a little white |
| lake-high | 5.5 | 6 | |
| waterfall | 5 | 5.5 | no lime crowns; the wall is dark |
| into-sun | 6 | 6 | |
| farm-low | 4.5 | 5.5 | a fence leading away, an orchard |
| lake-edge | 5 | 5 | a plain shore |

Mean of the thirteen: 5.38 to 5.77. Gate held: no view lower; at most
244 calls and 1.76 M triangles; alps fingerprint unchanged.

Round 6: the village from above and at eye level (still 5 and 4.5:
large plain walls, the bus as the square-eye foreground, streets
without people or clutter), the lake edge and near strip floor, and the
aircraft in swiss2 now that the new airframes have landed (a
photoreal pass on the plane you fly).
