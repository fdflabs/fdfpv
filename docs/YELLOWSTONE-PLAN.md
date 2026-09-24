# Yellowstone: the plan and the contract

A 100 by 100 km map of Yellowstone National Park at real scale, from
public domain data: USGS 3DEP elevation, USGS NHD hydrography, the NPS
thermal feature inventory and NLCD land cover. Three parts are built in
parallel against the contract below, so the contract is the thing that
must not drift. A part that finds the contract wrong says so in its pull
request rather than working around it.

## Why this needs a new terrain system

Every map so far is one terrain mesh under a 600k triangle budget. The
Alps is 6 km of 30 m cells in a 24 km world. Yellowstone at 30 m is about
3300 by 3300 cells, eleven million heights, and a pilot at 3 km altitude
can see a hundred kilometres. So the terrain is tiled, streamed in and
out around the camera, and drawn at a detail that falls with distance.

## Frame

- Projection: UTM zone 12N, EPSG:32612, metres.
- Origin: E0 = 540000, N0 = 4941000, the centre of the park's bounding
  box (E 487 521 to 593 996, N 4 886 546 to 4 995 731, so the park is
  about 106 by 109 km and the 100 km square cuts 2.5 to 4.7 km off its
  edges) moved 759 m west and 139 m south, to the kilometre, which is what
  puts West Yellowstone's airport inside, 665 m from the west edge.
  World x = E - E0 (east), world z = -(N - N0) (north is -z, the shell's
  forward), world y = elevation in metres above sea level minus Y0 = 2200
  (Old Faithful is about 2240 m).
- Extent: x and z in [-50000, 50000]. Nothing past it comes from the
  tiles and nothing is placed there. It was "not drawn and not ground",
  which left a pale void under the horizon from altitude (from Old
  Faithful the west edge is 24 km off) and nothing under a craft that
  crossed it; the terrain now draws a coarse apron outside, grown from
  level 5's border heights into invented foothills, tucked under the
  border, and it is ground (src/maps/yellowstone/terrain/apron.js).
- The map module converts nothing at run time: the data files are already
  in world metres.

Landmarks, projected with pyproj from their published coordinates, so
every part places them the same way (world x, z in metres). Mammoth's row
was -16 630, -39 394, which has no thermal feature within 300 m of it:
the NPS inventory's Mammoth terraces (84 features, ids MA...) centre on
-17 178, -38 321, Wikipedia's coordinate projects to -17 305, -38 318, and
the row is now GNIS's Mammoth Hot Springs, inside that cluster (found by
the thermal part, 2026-09-24):

| Landmark | x | z |
| --- | --- | --- |
| Old Faithful | -26 325 | 17 964 |
| Grand Prismatic Spring | -27 143 | 10 790 |
| Mammoth Hot Springs | -17 033 | -38 420 |
| Lower Falls, Grand Canyon of the Yellowstone | -83 | -10 748 |
| Yellowstone Lake, near its centre | 11 718 | 18 939 |
| West Yellowstone airport | -49 335 | -7 343 |

## Elevation tiles

- Level 0 is 30 m cells (USGS 3DEP 1/3 arc second resampled to the UTM
  grid, bilinear). Levels 1 to 5 halve the resolution each time: 60, 120,
  240, 480, 960 m. A level L+1 sample sits on every other level L sample
  and is the (1 2 1) x (1 2 1) / 16 average of the nine level L samples
  around it, computed on the Uint16 codes and rounded half up, so it is
  exact and checkable.
- Level 0 was first to come from 3DEP 1 arc second. That product is
  registered about 12 m (7 m west, 10 m south) away from the 1/3 arc
  second one, which is the one that matches NHD's shorelines, and level 0
  and the hero tiles must agree where they meet, so both come from 1/3
  arc second (docs/YELLOWSTONE-DATA.md has the measurement).
- A tile is 256 cells square, 257 by 257 samples, sharing its edge samples
  with its neighbours. A level L tile covers 256 * 30 * 2^L metres.
- 100 km is not a whole number of tiles at any level, so the last row and
  column reach past x, z = 50000: 14, 7, 4, 2, 1 and 1 tiles per axis for
  levels 0 to 5, ending at 57520 (levels 0 and 1), 72880 (2 to 4) and
  195760 (5). That ground is real 3DEP out to 74800 and repeats its edge
  beyond, which only level 5 reaches. Nothing past 50000 is drawn.
- Tile (L, i, j) has its min corner at x = -50000 + i * size,
  z = -50000 + j * size, where size is the tile's side. Samples run x
  fastest, then z.
- Encoding: `L/i_j.bin`, little endian Uint16, value = round((y + 1000) * 10),
  so decimetres from 1000 m below Y0. 257 * 257 * 2 = 132 098 bytes.
  Tiles wholly outside the extent are not written.
- Hero areas at 10 m (3DEP 1/3 arc second) are level -1 tiles in
  `hero/i_j.bin`, same format and origin rule with 10 m cells: at least the
  Upper, Midway and Lower geyser basins. The terrain uses them in place of
  level 0 where they exist. The set is i 6 to 11, j 18 to 27 (x -34640 to
  -19280, z -3920 to 21680: Madison Junction to 3.7 km south of Old
  Faithful), 60 tiles; every third hero sample is a level 0 sample.
- `manifest.json` lists levels, tile counts, the hero tile set, sources
  with their dates and licences, and a checksum per file. The engine
  reads which tiles exist from the keys of its `files` map (path to
  checksum) and nothing else, so a tile the map does not list is never
  asked for and a region with no hero tiles is drawn at level 0 without a
  404 per frame.

## Other data, in world metres

- `hydro.json`: rivers and streams as polylines of [x, z] with a width in
  metres per vertex and a name; lakes as polygons with a surface y. A
  lake is a list of rings, the outline first and its islands after. 3DEP
  flattens mapped water, so the ground under a lake is at the lake's y
  within a decimetre: the water must sit a little above it or cut it.
- `thermal.json`: every feature of the NPS thermal inventory: id, name
  when it has one, kind (geyser, hot spring, pool, fumarole, mudpot,
  terrace), x, z, radius estimate in metres, colour class when known, and
  for geysers an interval and duration when published. The public copy of
  the inventory records a type for only one feature in eight, so each
  feature also carries `reported`: false when its kind was inferred.
  Interval and duration are [min, max] in seconds. Fields in full in
  docs/YELLOWSTONE-DATA.md. The NPS publishes no download of the
  inventory; the one public copy with positions is the Yellowstone
  Research Coordination Network's, which states no licence, so whether it
  may be served is the owner's call (docs/YELLOWSTONE-DATA.md).
- `landcover/L/i_j.bin`: NLCD class as Uint8 on the level 0 and level 1
  grids, same tiling, 257 by 257.
- `roads.json`: park roads and boardwalks as polylines from public domain
  sources (NPS, TIGER). Not OpenStreetMap: its licence is not public domain.

## Hosting

The data is built outside this repository, which is already large, into
`~/Desktop/fdfpv-yellowstone-data/`, and published to the public
repository fdflabs/fdfpv-yellowstone-data on GitHub Pages. The map reads
it from one base URL:

- The public site reads `DATA_BASE` in `src/maps/yellowstone.js`,
  `https://fdflabs.github.io/fdfpv-yellowstone-data/`, which serves
  `access-control-allow-origin: *`. That constant is the one place the
  address is written, so a rebuild of the data is a push to that
  repository and nothing here changes.
- A page served from this machine (localhost or 127.0.0.1: `npm run
  serve` and every headless check) reads `yellowstone-data/` beside the
  page instead. `scripts/serve.js` and `tests/lib/server.js` serve that
  path from the folder `FDFPV_YELLOWSTONE_DATA` names, by default the
  pipeline's output folder above. Where the real data is not, point it at
  synthetic tiles: `node src/maps/yellowstone/terrain/synth-tiles.js DIR`
  writes the whole pyramid in this format (no land cover, thermal or
  hydro files, so the map builds the terrain alone).
- `?ysdata=URL` on the page overrides both.

## Ground

`map.height(x, z)` is the terrain the current frame draws at (x, z), read
on that chunk's own two triangles, split on the diagonal from (i, j + 1)
to (i + 1, j) as the valley heightfield is (src/maps/alps/terrain.js),
and over it the higher of a lake's surface (`water.surfaceAt`) and the
Lower Falls' rock step where those are drawn. Outside the extent it is
the apron's triangles. The selection changes only between frames, so the
physics steps of one frame all read one ground.

The chunk under the craft is always split as far as the loaded data
allows, because the craft is a focus of the selection and its own chunk
is at distance nought from it; the finest tiles in a disc round the craft
(6 km of level 0, 3 km of hero) are fetched before the selection needs
them. So in flight the ground under the craft is the finest level. If
the craft outruns the fetches, or a tile fails, the ground there is the
next coarser level that is loaded, which is what is drawn there: never a
hole. Before the first frame the whole selection round the spawn is
loaded and built behind the loading bar.

`heightAt(x, z)` for the parts that build on the ground (placement below)
is a different function on purpose: the finest data loaded at (x, z),
whatever is drawn there. Near the camera the two are the same; further
out the terrain draws a coarser level and they can differ by a metre or
two.

## Terrain engine

`src/maps/yellowstone/terrain/`. A chunked quadtree of plain meshes, not
a geometry clipmap: a clipmap's triangles move with the camera, so "the
ground is what is drawn" would change whenever it snapped, and it needs a
vertex shader the cel material does not take. A quadtree node is 64 cells
of its own level (1920 m at level 0, 640 m hero, 61 km at level 5), every
sample drawn, so a chunk's triangles are its level's grid and the ground
reads them back exactly. Four level 5 roots cover the extent. A level L
node splits into the four level L - 1 nodes under it, which read one
tile; a level 0 node into the nine hero nodes under it where the hero set
has them. A node splits when a focus (the camera, the craft) is nearer
its box than SPLIT times its children's side doubled, and only once the
children's tiles are in and their meshes built, until when it is drawn
itself. Cracks between levels are closed with skirts hung below each
chunk's lowest sample by its relief, and on the extent's edge deep enough
to meet the apron. The paint is NLCD land cover from the level 1 grid
(all 49 tiles held, 3.2 MB) for every level, averaged over a coarse
cell's footprint, with rock on steep faces and snow on the high ground;
a grey grain texture tiled every 160 m in world space gives it texture
near the ground. Chunks at 120 m cells and coarser are left out of the
ink prepass.

Budgets, High, set before measuring; `node scripts/yellowstone-check.js`
asserts them (SIM_GPU=1 renders on the GPU):

| What | Budget |
| --- | --- |
| Terrain draw calls in the camera's frustum, at the ground and at 3 km | 120 |
| Terrain triangles in the camera's frustum, same views | 400 000 |
| Main thread terrain work in any frame of the flown lines | 5 ms |
| Chunk vertex buffers resident | 48 MB |
| JS heap growth over 60 km flown | 64 MB |
| Tile bytes not pinned | 24 MB |

Per preset: SPLIT 1, 0.85 and 0.7 on High, Medium and Low; chunk builds
2, 2 and 1.5 ms a frame, sliced by rows so a build never runs past its
frame's ration by more than a row; 300, 250 and 200 chunk meshes kept.

Measured 2026-09-24 on the real data, SIM_GPU=1 (RTX 3060 Ti), 1280 by
720, High, with a load average of 30 to 37 from other sessions on the
host. Terrain in view at the ground: 43 calls, 376 768 triangles; at
3 km: 36 and 309 504. Every drawn border crack free (132 301 samples
round the spawn); the ground within 2.1e-5 m of a ray cast onto the
drawn meshes at 600 points. Main thread terrain work per frame on the
flown lines: median 0.1 ms, p99 2.2 to 2.6 ms, worst 5.8 to 6.6 ms in 1
to 5 frames of about 5 000 per line, which fails the 5 ms budget; a
fixed control timed the same way every frame ran to 18 to 36 ms at
worst on the same host, so most of that is the host descheduling the
main thread, but it is left failing rather than argued away. After
60 km flown: 22.5 MB of tiles (8.3 MB pinned for the features'
regions), 36.3 MB of chunk buffers, heap lower than at the start. The
synthetic tiles pass every assertion on the same host.

With the thermal features and the water over the Upper Geyser Basin, the
whole frame as `__renderStats` counts it (ink prepass, colour, post, the
title quad when it is in view): 140 calls and 978 875 triangles at
100 m, of which the features and water are 49 and 321 724; 304 calls and
980 135 triangles at 1 km (about 160 of those calls are the title quad
flying through the view). That is over the Alps' whole frame figure of
600 000 triangles: the terrain alone is about 650 000 whole frame, half
of it the ink prepass drawing the near chunks a second time.

A region's build by the features or the water is one synchronous call of
90 to 110 ms on this host (140 to 440 ms measured by that part at a
landmark); the engine makes one a frame, and a pilot entering a new
basin sees each as a dropped frame or several. The engine cannot split
it: the fix is an incremental build in thermal/ and water/.

## Placement: what the engine gives the other parts

On the map instance as `map.placement`, and to the parts built in
`src/maps/yellowstone.js`:

- `groundAt(x, z)`: the finest data loaded there (the `heightAt` above).
- `drawnAt(x, z)`: the terrain this frame draws, the same as the ground
  under a craft.
- `anchor({ x, z, range, build(y, groundAt), unload(obj) })`: a thing
  built when the camera is within `range` metres and the finest ground
  under it is loaded, taken down past `range` times 1.1. `build` returns
  an Object3D in world coordinates; the default unload frees its
  geometries and leaves materials, which are usually shared. Builds are
  rationed per frame by time. Returns `{ object, remove() }`.
- Regions for the thermal features and the water, as their interface
  below asks: `loadRegion(region)` once some chunk inside a level 0 tile
  is drawn at the finest level there within 2.5 km of the eye, after the
  finest tiles of it and its eight neighbours are loaded; they stay pinned
  while it is loaded, so `heightAt` cannot change under what was built.
  `unloadRegion(key)` 90 frames after the last such chunk goes. At most
  one part's load runs in a frame (terrain/regions.js).

## Ownership

| Part | Owns |
| --- | --- |
| Data pipeline | `tools/yellowstone/`, `docs/YELLOWSTONE-DATA.md`, the data folder |
| Terrain engine | `src/maps/yellowstone.js`, `src/maps/yellowstone/terrain/`, the map's registry entry |
| Thermal features | `src/maps/yellowstone/thermal/`, `src/maps/yellowstone/water/` |

The engine starts on synthetic tiles in the contract's format so it does
not wait for the data; the features part builds its landmarks against a
flat test ground and a placement function the engine exposes.

## Thermal features and water: the interface

What `src/maps/yellowstone/thermal/` and `src/maps/yellowstone/water/`
need from the terrain engine and the map module, and what they give back.
Built and checked standalone against a stand in for the engine
(`tests/browser/yellowstone-standin.js`); the lead reconciles this with
the engine's own API.

**Asked of the engine.**

- `heightAt(x, z)`: the ground's world y, read on the drawn triangles
  (split (i, j + 1) to (i + 1, j)) of the finest level loaded there, and
  answering anywhere in the extent. Everything the features lay on the
  ground is built on a drape grid of 10 / k metres on the contract's
  origin with the same split, which refines every level, so a surface
  whose vertices are at `heightAt` lies exactly in the drawn ground's
  plane (measured under Node: worst gap 0.03 mm, on 10 m and 30 m ground).
  That holds only for the level `heightAt` read when the region was built.
- Regions: call `loadRegion(region)` on both parts when a level 0 tile is
  drawn at its finest (level 0, or hero where it has hero tiles), and
  `unloadRegion(key)` when it stops. `region` is
  `{ key: 'i_j', i, j, x0, z0, x1, z1 }`, the level 0 tile, exactly what
  `regionOf(x, z)` in `thermal/catalog.js` returns. A landmark reaches up
  to 2 km past its tile (the canyon walls below the Lower Falls), so
  `heightAt` should answer at the finest level over the tile's neighbours
  too; the engine's ring of loaded tiles round the camera gives that.
  Build cost on the real data, the four tiles round a landmark loaded
  together: 140 to 320 ms for the thermal features and 90 to 320 ms for
  the water, all synchronous; the engine may want to spread tiles over
  frames. The Lower Geyser Basin's tile is the heaviest, 1 442 features
  and 213 000 triangles built (a view sees its chunks, not all of it).
- The step clock: the map's `updateAnim(stepMs)` calls both parts'
  `updateAnim(stepMs)`. Eruptions are pure functions of it.
- Depth: every surface laid on the ground is lifted by polygon offset in
  layers four units apart (`LAYER` in `thermal/paint.js`; one unit apart
  still fought at 250 m). That works with the standard depth buffer. With
  `logarithmicDepthBuffer`, which writes `gl_FragDepth`, polygon offset
  does nothing and every one of them would fight the ground: say so before
  turning it on, and the overlays will take a view ray pull instead.
- Layers: particles (steam, water in the air) and the lakes are on layer 1,
  the colour pass only, so they need nothing from `promoteToPrepass`; all
  else is layer 0, drawn by the prepass whenever it is added.
- `sunDir`: the map's sun, for the steam's painted terminator.
- NLCD's barren class should paint pale in the geyser basins: the features'
  own sinter flats reach only a few tens of metres round them.

**Given back.**

- `buildThermal({ scene, heightAt, thermal, rivers, sunDir })` and
  `buildWater({ scene, heightAt, hydro, sunDir, clock, wind, warmAt,
  drawnBy })`, where `clock`, `wind` and `warmAt` come from the thermal
  part (`thermal.env.clock`, `thermal.env.wind`, `thermal.warmAt`) so the
  Firehole steams where the basins are, and `drawnBy: thermal.drawsLake`
  leaves to a landmark the NHD lakes that are its own water (NHD maps
  Excelsior Geyser Crater as a lake).
- `water.surfaceAt(x, z)`: a lake's y or null, for the map's `height()`.
- `thermal.hero('lower-falls').ground(x, z)`: the rock step built over the
  30 m ground's ramp at the brink (the 94 m drop is three cells of slope in
  the data), or null: `height()` should take the higher.
- `thermal.setDemo(true | false | seconds)`: compressed geyser intervals
  (Old Faithful every 4 minutes by default, or the seconds given).
- `thermal.hero(id).geyser.schedule`: `at(t)` and `nextStart(t)`, for a
  title camera that wants to be on an eruption.

**Open.** `roads.json` has boardwalks and nobody owns drawing it. The
landmarks build their own short boardwalks (Old Faithful's ring, Grand
Prismatic's, Morning Glory's, Fountain Paint Pot's) because the brief asked
for them; if roads.json's are drawn as well they will double there, and the
lead should say which goes.

## Thermal features and water: budgets

For the thermal features and the water alone, the whole frame (ink
prepass, colour pass, post) with them less the same frame without, as
`renderer.info` counts it, which is what the shell's `__renderStats`
reads; particles are the instances of particle meshes whose bounds are in
view. The Upper Geyser Basin is the densest ground in the park for these
parts, where they are most of the scene, so they take a quarter of the
draw calls and two thirds of the triangles the Alps allow a whole frame
(250 and 600 000); the terrain engine's own budget is set beside them.

| View | Draw calls | Triangles | Particles |
| --- | --- | --- | --- |
| Over the Upper Geyser Basin at 100 m | 60 | 400 000 | 9 000 |
| Over the Upper Geyser Basin at 1 km | 60 | 500 000 | 12 000 |

Measured by `node scripts/yellowstone-thermal-preview.js` on the real
data, 1280 by 720, SwiftShader, 2026-09-24: 43 draws, 307 236 triangles,
5 275 particles at 100 m; 53 draws, 329 364 triangles, 5 275 particles at
1 km. The draw calls are the tighter of the three. What they are made of
is `window.__ys.drawn()` in the preview page.
