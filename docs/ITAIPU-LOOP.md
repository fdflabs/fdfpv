# The Itaipu photorealism loop

The owner asked for Itaipu to be "upgraded like the photoreal map": the
loop docs/SWISS2-LOOP.md ran on the Swiss valley, which took it from 3.67
to 6.88 out of 10 in ten rounds, run again on the dam
(docs/ITAIPU-PLAN.md section 12). This file is the loop's record: the
method, the rubric, the views, and every round's scores. A round counts
only if its scores go up here.

## A round

1. Render the fixed views on the real GPU at High,
   `SIM_GPU=1 node scripts/itaipu-views.js ~/Desktop/fdfpv-loop/itaipu/round-N`,
   and build the sheet,
   `python3 tools/swiss2-loop/sheet.py ~/Desktop/fdfpv-photoref/itaipu
   ~/Desktop/fdfpv-loop/itaipu/round-N-sheet.png
   ~/Desktop/fdfpv-loop/itaipu/round-N ~/Desktop/fdfpv-loop/itaipu/round-(N-1)`:
   the reference photograph, last round and this round, side by side.
   Renders and sheets never go into the repository.
2. The lead scores every view against its photograph by the rubric
   below and picks the round's targets: what hurts the pictures most,
   weighed against what it costs.
3. The targets are built in worktrees, one agent each, each owning named
   files and told which files the others own; the lead merges their PRs
   in turn, re-rendering after each, and scores the round on the last
   merge (swiss2's rounds 3 to 10).
4. The gate. A PR merges only if no view scores lower and the mean
   rises; no view's draw calls, triangles or GPU time grow past the
   budget below, and a view already over it does not grow; no other map
   changes; and the project's own checks pass. Otherwise it is closed and
   the round says why.
5. The sheet's scores are added here.

The views never move. A round that needs another angle adds a view, so
the before and after of every existing one stay pictures of the same
thing. The reference photographs are Wikimedia Commons images in
`~/Desktop/fdfpv-photoref/itaipu/`, their licences in its SOURCES.md, for
comparison only; they are not redistributed and not in any repository.

## Rubric

Swiss2's, unchanged, so the two loops' numbers mean the same thing. Each
view, 1 to 10: how much the frame reads as a photograph of the place its
reference shows, judged on light and shadow, materials, water,
vegetation, atmosphere and distance, scale cues, and above all the one
thing that says "game". 1 is broken, 3 an old game, 5 a good flight sim,
7 a current game's best screenshot, 9 a photograph you would have to look
at twice.

Two things Itaipu adds to how it is applied:

- **The structure is the subject.** Most of the photographs are of a
  concrete thing with a known shape (the buttresses, the penstocks, the
  gates, the chute). A view whose landscape reads well but whose
  structure is the wrong shape scores on the structure, as swiss2's
  village views scored on the houses.
- **Water that should be moving.** Six photographs have the spillway
  running. A still, white chute in those views is scored as the wrong
  picture, not as a missing detail.

## Budgets

Section 13 of the plan, at High on the RTX 3060 Ti, per view: at most 300
draw calls and 2.5 million triangles, never under 60 fps, and GPU time
under 12 ms. `scripts/itaipu-views.js` measures the GPU time as the whole
frame the shell draws, with timer queries round every animation frame
callback over 60 frames, and judges the least frame: the one with the
least of the desktop's own drawing in it. That is an upper bound on
scripts/swiss2-perf.js's floor measure (the sum of each pass's least), so
a view under 12 ms here is under it there. The median is printed too; on
the shared card it moves between 3 and 15 ms from run to run with the
other sessions' load, and says nothing about the view.

## The views

23 views: the 22 of the plan's section 12 table, pinned in round 0, and
`yard-west`, a performance view with no photograph (below). Every view
through a 44 degree vertical lens, as swiss2's, except `yard-west`,
which keeps the 60 degrees it was first measured with. The poses are in
`scripts/itaipu-views.js`, absolute Y, each camera checked at least a
metre above `__heightAt` and at least 0.5 m from every solid (static and
streamed, once the streamed set has refilled round the camera). The
aircraft is a Sky 1800 put down on the plane spawn on the rockfill crest
before the first view, so every view sees it in the same place.

### How round 0 pinned them

The table's poses were a first placement. Three passes rendered each
against its photograph; what moved and why:

| View | Moved | Why |
| --- | --- | --- |
| aerial-dam | camera to 900, 800, -1150, looking at -400, 150, -2300 | the table's pose showed the dam end on up the frame; the photograph has it from the bottom right corner to the left, the reservoir filling the right half |
| aerial-dam-wide | camera to 300, 800, 200 | from 900, 900 at 900 m the dam was a thin line in the middle distance |
| spill-gates-high | camera to -800, 290, -900 | closer and more oblique, as the photograph |
| leftbank-high | camera to 900, 700, 300 | 4 km out, the frame was the rockfill embankment and forest, with the dam a speck |
| rockfill-high | camera to 500, 650, -2000, looking at 1 800, 200, -700 | the table looked north west, which puts the reservoir on the right; the photograph has it on the left |
| dam-downstream | look at y 165 | more dam, less tailrace |
| dam-downstream-2 | camera to 520, -1285, on the bank over the tailrace | at 700, -1150 a grass rise hid everything under the crest |
| powerhouse | camera to 500, 215, -1300 | at 700, -1350 and 120 m up the camera was past the powerhouse's east end, looking down its roof |
| canyon | camera over the Mirante da Barragem, 225, 215, -1059, looking south west | the table put it on the crest road, whose parapet filled the frame; the crest there is at z -1796, not -1640 (below) |
| chute | camera 6 m over the spillway bridge deck at -974, -1005 | the table's -980, -1020 is over the reservoir upstream of the gates; at 2 m the bridge's parapet filled the frame |
| spill-gates | camera down the chute at -931.6, 205, -886.7, facing the gates | from -1400, -1150 the gates were a line on the horizon; from the west bank a grass slope hid them |
| crest-road | camera on the crest at -100, -1784 | the table's -100, -1700 is on the powerhouse roof |
| rockfill-road | camera at the rockfill's downstream toe, 1 370, -1 150, looking north west | the table's 1 600, -700 is in a wood; the photograph has the face on the right, which is north west along the toe |
| reservoir-dam | camera over the water at 100, -3000 | the table's -3 500, -2 500 is on land |
| reservoir-shore | camera on the shore at -4 160, -3 000 | the table's -2 500, -3 000 is open water |
| powerlines | camera 20 m up south east of the right lateral dam, -599, -1231 | the photograph is the buttress wing behind its towers; from 900, -900 the frame was the main dam 1 km off |
| reservoir-forest | camera to -2 400, 560, -2 900, looking north west | the table's look was across open water; this frames a forested peninsula |
| craft-chase | behind the plane spawn on the rockfill crest | the title's flight leaves the craft wherever it was when the camera was parked, so the views put it down there first |

### What was stale in the plan

- The crest landmark, "main dam crest, middle, 59, -1 672", is on the
  downstream face. The drawn crest road at x 59 runs z -1 764 to -1 728;
  at x -100, -1 804 to -1 764; at x -150, -1 816 to -1 776. The table's
  canyon and crest-road cameras, set from it, stood on the powerhouse
  roof at 148 m.
- The table's chute camera is over the reservoir; the bridge deck is 18
  to 30 m down the chute's axis from the gates' middle.
- reservoir-dam and reservoir-shore had water and land the wrong way
  round, rockfill-high and rockfill-road looked the wrong way along the
  embankment, and rockfill-road's point is in a wood.
- The reference folder has 23 pictures, not 22: `chute-dry` is there and
  no view uses it (chute is judged against `chute-running`).
- Section 14 row I says each view's stats are "within section 13's
  budgets". At round 0 nine views are over (below); so are
  itaipu-check's own spawn and air frames (2.68 M and 2.82 M triangles).
- The view "west of the right bank switchyard" measured 303 calls
  before the yard and 310 with it in PR #199's harness
  (tools/itaipu/war-check.js). Here, with the yard merged, the plane on
  its spawn and the streamed sets refilled round the camera, the same
  pose and lens draws 344 calls and 3.58 M triangles.

## Rounds

### Round 0, the baseline (main at d93d301, with PR for package I)

Scores are **provisional**: the loop's agent scored them, where the
lead normally does. The lead's own scores replace these and the targets
below are re-ranked if they differ. Sheet:
`~/Desktop/fdfpv-loop/itaipu/round-0-sheet.png`.

| View | Score | Calls | Tris (M) | GPU least / median (ms) | The tell |
| --- | --- | --- | --- | --- | --- |
| aerial-dam | 4 | 205 | 2.13 | 2.9 / 10.4 | the right frame at last; the reservoir is turquoise with dark blotches where the photograph is deep blue, the downstream face is a flat grey slope with white stripes for penstocks |
| aerial-dam-wide | 4 | 228 | **3.10** | 2.3 / 9.0 | the layout reads; the chutes are pure white slabs with a white disc for a plume, the ground a soft colour smear |
| aerial-spill | 4 | 227 | **2.50** | 3.5 / 6.6 | the composition of the photograph; no plume, no white water, the canyon's walls smooth green |
| spill-gates-high | 3.5 | 193 | 2.36 | 3.1 / 8.4 | piers as plain boxes, gates as flat orange panels, a dry white chute where the photograph is all white water |
| leftbank-high | 4 | 244 | **3.32** | 4.2 / 9.5 | the dam reads from the left bank; the foreground is a blurred satellite smear with scattered lollipop trees |
| rockfill-high | 5 | 265 | 2.36 | 2.5 / 5.5 | the best view: the embankment's curve, the forest, the far shore; the rockfill face is smooth and pale where the photograph's is dark rock, the water turquoise where it is brown grey |
| dam-downstream | 3 | 202 | 1.98 | 3.3 / 6.5 | a flat grey wall with white arches, no buttresses, no penstock tubes, no central building; the foreground a brown smear |
| dam-downstream-2 | 3 | 221 | 2.18 | 2.5 / 10.2 | the same wall; no rock island, no basalt cliffs, the bank a plain green slope |
| powerhouse | 3 | 214 | 2.15 | 2.0 / 14.0 | the roof a bare grey slab, the penstocks white planks; nothing of the building's front, gantries or tailrace |
| canyon | 3.5 | 250 | **2.97** | 2.3 / 14.5 | a river between smooth green banks with lollipop trees; no basalt canyon, no bridge |
| river-below | 3.5 | 201 | **3.20** | 6.8 / 11.0 | the river reads; its banks are soft green slopes where the photograph has red basalt ledges and dense forest |
| chute | 3 | 239 | **2.92** | 5.6 / 11.4 | a dry, white, finely textured floor and plain walls, where the photograph is the chute full of white water with the plume at its end |
| spill-gates | 2.5 | 169 | 1.76 | 3.1 / 3.5 | concrete boxes and orange rectangles; no radial gates, arms or hoist beams, no pier noses |
| spill-plume | 3 | 219 | 2.46 | 2.8 / 3.6 | the spillway sits dry behind a teal river; the photograph's subject, the plume, is missing |
| penstocks | 2 | 215 | 2.17 | 3.8 / 4.9 | a white plank and a grey plane; nothing reads as a row of 10.5 m steel tubes beside a building |
| crest-road | 3 | 271 | 2.42 | 5.3 / 11.1 | a bare pale road; the gantry's legs are lilac and the intake columns white pillars |
| rockfill-road | 2.5 | 197 | 1.97 | 5.2 / 12.2 | a smooth grass slope where the photograph has a wall of dark rock over a marked road; no road |
| reservoir-dam | 4 | 242 | **2.82** | 5.2 / 12.8 | the dam as a line across the water with its lamps; the water choppy and turquoise, the gantries too small to read |
| reservoir-shore | 3 | 158 | 1.49 | 4.1 / 11.7 | a flat lawn to the water; no rip rap, no beach, no trees on the far shore |
| powerlines | 3 | 176 | 1.81 | 3.2 / 12.5 | the buttress wing is a smooth grey wall; the photograph is its rhythm of buttresses and the towers before it |
| reservoir-forest | 4.5 | 157 | 1.49 | 4.6 / 12.0 | a forested peninsula that reads from the air; the ground under it soft and the water too green |
| craft-chase | 4.5 | 210 | 1.88 | 8.6 / 15.0 | the photographic plane on real asphalt; the road is clean and endless, the plane casts little contact shadow |
| yard-west | not scored | **344** | **3.58** | 7.7 / 12.4 | performance view, over both budgets |

Mean of the 22 scored views: **3.43**. Every camera clears the ground
and every solid; every view's least GPU frame is under 12 ms (worst 8.6,
craft-chase). Over section 13's budget (bold): nine views on triangles,
yard-west on calls and triangles.

Where the triangles and calls go, from hiding each top level group of
the scene in turn (each group's own draws and its shadow draws):

| View | Calls | Tris (M) | Town | Terrain | Vegetation | Shadow cascades | Dam |
| --- | --- | --- | --- | --- | --- | --- | --- |
| yard-west | 344 | 3.58 | 82 calls, 1.84 M | 100, 0.77 M | 54, 0.74 M | 46, 0.78 M | 17, 0.15 M |
| leftbank-high | 244 | 3.32 | 89, 2.15 M | 75, 0.65 M | 28, 0.32 M | 45, 0.93 M | 19, 0.16 M |
| river-below | 201 | 3.20 | 69, 1.97 M | 64, 0.50 M | 30, 0.65 M | 42, 0.95 M | 12, 0.08 M |
| crest-road | 271 | 2.42 | 58, 1.29 M | 92, 0.72 M | 19, 0.16 M | 35, 0.37 M | 24, 0.23 M |

The town is most of every over budget view's triangles, and yard-west's
calls are the town and the terrain; the yard itself is 11 calls.

### Round 1's targets

The top eight gaps, ranked by how much each costs the score (the views
it holds down and by how much) and how cheap it is to fix. One agent
each; the files named are where the work is, not a grant of ownership,
which the lead assigns.

1. **The budget: the town's triangles and yard-west's calls.** Nine
   views over 2.5 M triangles and yard-west at 344 calls mean no round
   can pass its gate, so this goes first. The town is 1.3 to 2.2 M
   triangles and 58 to 89 calls in the costly views: distance culling
   or lower detail for buildings and power line pieces past a few
   hundred metres, fewer shadow casters in the far cascade. Target: every
   view under 300 calls and 2.5 M, yard-west included, no view's picture
   worse. Cheap to medium; src/maps/itaipu/town/**.
2. **Water colour and surface.** The reservoir and river are turquoise
   with dark blotches and a choppy, busy surface in ten views; the
   photographs are deep blue from the air, brown grey under haze, and
   calm. Measure against the photographs with tools/swiss2-loop/colour.py
   as swiss2's round 2 and 7 did. Cheap, and it lifts most views by half a
   point; src/maps/itaipu/water/**.
3. **The spillway running.** Six photographs have it running: white
   water down the three chutes, the plume off the flip buckets, spray and
   mist over the canyon. Ours is dry white concrete with a white disc.
   Holds down aerial-dam-wide, aerial-spill, spill-gates-high, chute,
   spill-plume and spill-gates. Medium; water/** with the dam's
   `chuteFloor`.
4. **The main dam's downstream face and the penstocks.** The face is a
   smooth slope with white stripes; the photographs' subject is its
   hollow buttresses in relief and the 20 round penstocks, their hoods
   and the central building. Holds down aerial-dam, dam-downstream,
   dam-downstream-2, powerhouse, penstocks (the lowest view, 2) and, for
   the right wing's buttresses, powerlines. Medium to high;
   src/maps/itaipu/dam/**.
5. **The canyon's basalt.** The river below the dam runs between smooth
   green slopes; the photographs have stepped red basalt cliffs and
   ledges, the rock island, dense riverside forest. Holds down canyon,
   river-below, dam-downstream-2, aerial-spill. Medium: visual rock on
   steep cells as swiss2's round 7 and 8, the ground a craft meets
   unchanged; terrain/** and look/**.
6. **The ground from the air.** Every aerial view's ground is a soft
   smear of the 1024 px satellite colour, with red soil and field edges
   lost and lollipop trees scattered on it. Detail textures driven by the
   masks (forest, field, red soil, urban) at mid distance, as swiss2's
   round 5 far floor. Medium; look/ground.js.
7. **The spillway's gates and piers.** Plain boxes and flat orange
   panels where the photographs have pier noses, radial gates with
   their arms, the hoist beam and its gantry. Holds spill-gates at 2.5 and
   spill-gates-high. Medium; dam/**.
8. **The made things' materials.** Cheap fixes across several views: the
   rockfill face is smooth pale ground where it should be dark dumped
   basalt (rockfill-high, rockfill-road), the road along its toe is
   missing, the crest road has no markings and its gantry legs are
   lilac, the reservoir shore has no rip rap. dam/**, town/roads.js,
   terrain burn ins.

Not a target yet, and why: the craft-chase view (4.5) is the shared
craft pass swiss2 already did; the reservoir-dam view needs only the
water (target 2) and the dam's gantries at 3 km, which follow from 4.

### Round 1 (PRs #213, #215, #217, #219, #220, #221, main at b6673f6)

Dam (#213, #215): buttress relief on the main dam and the right wing,
penstock rings and flanges, longer hoods, pier noses and radial gates
with arms and hoists. Performance (#217): the canopy batched, the town's
far pieces culled; every view under budget. Look (#219): basalt shading
on the canyon's slopes, the ground from the air graded by the masks,
the shore and the rockfill faces, the sky's glow. Water (#220): calm
water in the photographs' colours, the mirror only for a body in view,
the spillway running with spray and plume (water/spill.js). Sky (#221):
the sky sphere pinned to the far plane, so the mirror no longer clips
it; `MAP_MODULE_COUNT.itaipu` 25 for spill.js.

Scores are **provisional**, the loop agent's, scored independently of
the round's PRs' own; the lead's replace them. Sheet (reference, round
0, round 1): `~/Desktop/fdfpv-loop/itaipu/round-1-sheet.png`.

| View | R0 | R1 | Calls | Tris (M) | GPU least / median (ms) | The tell now |
| --- | --- | --- | --- | --- | --- | --- |
| aerial-dam | 4 | 5 | 154 | 1.15 | 2.4 / 3.4 | deep calm blue water and the buttresses in relief; the chute is still a flat white slab and the island a soft smear |
| aerial-dam-wide | 4 | 5 | 154 | 1.18 | 2.5 / 11.1 | the spillway runs into a plume, the river dark; the ground a soft smear |
| aerial-spill | 4 | 4.5 | 162 | 1.02 | 2.3 / 7.6 | a plume at last, smaller and whiter than the photograph's; the canyon walls smooth green |
| spill-gates-high | 3.5 | 4 | 153 | 1.12 | 2.4 / 6.6 | radial gates with arms; the chute water is an even white texture, not a torrent; piers still blocks |
| leftbank-high | 4 | 4.5 | 160 | 1.25 | 3.0 / 10.2 | red soil and tracks in the foreground; lollipop trees, flat grey light |
| rockfill-high | 5 | 5.5 | 216 | 1.47 | 2.4 / 7.4 | calm water, a darker face; the photograph's brown haze is blue here |
| dam-downstream | 3 | 3.5 | 156 | 0.91 | 1.9 / 6.3 | buttresses and penstock tubes read; no central building, no tailrace jet, a brown rubble smear in front |
| dam-downstream-2 | 3 | 3.5 | 175 | 1.30 | 2.1 / 9.8 | the face reads; no rock island, a bare smeared bank |
| powerhouse | 3 | 3.5 | 170 | 1.27 | 2.8 / 9.3 | the face in relief; the roof a bare slab, a blotched ground patch before it |
| canyon | 3.5 | 4 | 166 | 1.27 | 3.0 / 7.6 | basalt on the bank, dark river, plume; the foreground a lawn with lollipop trees |
| river-below | 3.5 | 4 | 141 | 1.23 | 3.3 / 8.3 | red banks and dark water; the banks smooth slopes, no ledges |
| chute | 3 | 3.5 | 101 | 0.89 | 1.7 / 9.4 | spray at the flip buckets; the chute a static white sheet |
| spill-gates | 2.5 | 3.5 | 92 | 0.48 | 2.5 / 3.7 | radial gates and arms; the hoist deck and towers missing, the chute floor a white sheet |
| spill-plume | 3 | 3.5 | 170 | 1.17 | 3.0 / 6.6 | the plume is there but a flat white wall that hides the whole spillway |
| penstocks | 2 | 2.5 | 168 | 1.39 | 3.1 / 10.0 | a ringed tube beside the buttress; one tube in frame, a bare grey plane underfoot |
| crest-road | 3 | 3 | 217 | 1.04 | 2.3 / 10.3 | unchanged: lilac gantry legs, white pillars for intake columns, no road markings |
| rockfill-road | 2.5 | 3 | 162 | 1.21 | 3.4 / 5.4 | the face is dark rock at distance; a grass field in front, no road |
| reservoir-dam | 4 | 4.5 | 165 | 1.95 | 3.4 / 10.3 | calm blue water; the dam's gantries too small to read |
| reservoir-shore | 3 | 3.5 | 139 | 0.86 | 2.8 / 3.1 | a red strand at the water; the bank a flat lawn, no rip rap, no trees |
| powerlines | 3 | 4.5 | 93 | 0.59 | 2.6 / 3.5 | the buttress wing's rhythm reads, the towers behind; a soft green smear in front |
| reservoir-forest | 4.5 | 5 | 137 | 0.87 | 2.9 / 3.0 | blue water, sand beaches, the peninsula reads |
| craft-chase | 4.5 | 4.5 | 189 | 0.97 | 3.0 / 8.2 | unchanged |
| yard-west | | | 264 | 2.27 | 3.2 / 10.6 | performance view, now within budget |

Mean of the 22 scored views: 3.43 to **4.00**. No view lower; crest-road
and craft-chase level.

Budget: `npm run itaipu:views` PASSES for the first time, all 23 views
within section 13. The most calls 264 (yard-west, from 344), the most
triangles 2.27 M (yard-west, from 3.58 M), the worst least GPU frame
3.4 ms.

What holds every view down now is the light. The references are hard
tropical sun under a deep blue sky with cumulus; every render is flat,
grey white overcast with soft shadows. And every view with ground
within a few hundred metres of the lens has the satellite's smear
there.

### Round 2's targets

Ranked by score cost against fix cost, one agent each, with the area
each would own. Two targets are in `look/` and two in `dam/`: the
look pair split cleanly by file (named below), and the dam pair share
`dam/index.js`, so give them to one agent or merge them in turn.

1. **Sun and sky** (look/: `sky.js`, `light.js`, the post chain's
   exposure). All 22 views: a clear tropical day, deep blue sky with
   cumulus, a hard sun and dark shadows, as the photographs. Measure
   sky and shadow colour against them with tools/swiss2-loop/colour.py.
   Cheap, and worth half a point nearly everywhere.
2. **The ground at eye level** (look/: `ground.js` only). The near and
   mid ground is the satellite's 1024 px smear in dam-downstream,
   dam-downstream-2, powerhouse, powerlines, canyon, reservoir-shore,
   rockfill-road and leftbank-high: detail by mask within a few hundred
   metres (grass with red soil paths, rubble, laterite verges), as
   swiss2's round 5 far floor and round 6 near ground. Medium.
3. **Spillway water in motion** (water/). The chute is a static white
   texture, the plume at spill-plume a flat wall hiding the spillway:
   streaks and roll waves flowing down the chutes, water leaving under
   the gates (the sill, which #220 left dry), a plume that rises as a
   rooster tail and thins so the spillway shows through it. chute,
   spill-plume, spill-gates, spill-gates-high, aerial-spill. Medium.
4. **The main dam's front and the powerhouse** (dam/). The central
   building on the downstream face, the powerhouse's downstream facade
   and roof (gantry cranes, skylights, the transformer bays), the
   tailrace jet the photographs show, and the penstocks' foot at the
   road (the penstocks view's subject; only one tube is in its frame).
   dam-downstream, dam-downstream-2, powerhouse, penstocks. Medium to
   high.
5. **The crest** (dam/, with target 4's agent or after it). The intake
   gantry's legs are lilac and its crane missing, the intake columns
   are white pillars, the crest road has no markings or barrier
   detail. crest-road (level for two rounds), reservoir-dam, the aerial
   views' crest line. Cheap.
6. **Trees** (vegetation/). Lone round lollipop trees on open ground
   (canyon, leftbank-high, powerlines, rockfill-road, river-below):
   varied tropical crowns, clumps and forest edges along the
   escarpments, and trees on the reservoir shore. Medium.
7. **The rock island and the canyon's cliffs** (terrain/, a drawn
   mesh over the ground, the ground a craft meets unchanged). The 10 m
   DEM cannot carry the stepped basalt walls or the island below the
   dam (#219 shaded what it can). Visual geometry on the canyon's steep
   cells and the island, as swiss2's round 7 and 8. dam-downstream-2,
   canyon, river-below. High.
8. **The rockfill toe road** (town/: roads). The road along the
   rockfill's downstream toe, the rockfill-road photograph's subject,
   is not drawn, with its lamps and markings; the view stands in a
   field. rockfill-road, rockfill-high. Cheap if OpenStreetMap has the
   way; the face's own close up texture is target 2's.

Not a target yet: craft-chase (level; it follows from target 1's light
and needs contact shadow on asphalt), reservoir-dam's gantries (follow
from target 5).
