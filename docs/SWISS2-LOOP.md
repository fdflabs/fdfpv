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
3. One agent builds the fixes in its own worktree and opens a PR.
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
