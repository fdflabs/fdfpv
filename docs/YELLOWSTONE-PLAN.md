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
  about 106 by 109 km and the 100 km square leaves 3 to 5 km off each
  edge) moved a kilometre west so West Yellowstone's airport is inside.
  World x = E - E0 (east), world z = -(N - N0) (north is -z, the shell's
  forward), world y = elevation in metres above sea level minus Y0 = 2200
  (Old Faithful is about 2240 m).
- Extent: x and z in [-50000, 50000]. Everything outside is not drawn and
  not ground.
- The map module converts nothing at run time: the data files are already
  in world metres.

Landmarks, projected with pyproj from their published coordinates, so
every part places them the same way (world x, z in metres):

| Landmark | x | z |
| --- | --- | --- |
| Old Faithful | -26 325 | 17 964 |
| Grand Prismatic Spring | -27 143 | 10 790 |
| Mammoth Hot Springs | -16 630 | -39 394 |
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
  with their dates and licences, and a checksum per file.

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
`~/Desktop/fdfpv-yellowstone-data/`. The map loads it from a base URL. In
development `scripts/serve.js` serves that folder; where it is hosted for
the public site is decided when the data exists.

## Ground

The map's ground height is read on the same triangles the nearest drawn
level draws, split on the diagonal the valley heightfield uses (see the
note in src/maps/alps/terrain.js), so a craft meets what is drawn. Under
the craft the finest level is always loaded before the ground is asked.

## Ownership

| Part | Owns |
| --- | --- |
| Data pipeline | `tools/yellowstone/`, `docs/YELLOWSTONE-DATA.md`, the data folder |
| Terrain engine | `src/maps/yellowstone.js`, `src/maps/yellowstone/terrain/`, the map's registry entry |
| Thermal features | `src/maps/yellowstone/thermal/`, `src/maps/yellowstone/water/` |

The engine starts on synthetic tiles in the contract's format so it does
not wait for the data; the features part builds its landmarks against a
flat test ground and a placement function the engine exposes.
