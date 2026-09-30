# Itaipu: the plan and the contract

A photoreal map of the Itaipu Dam on the Parana River, at real scale,
from real elevation, real imagery and OpenStreetMap, with the dam, the
spillway, the reservoir and the river below as things you can fly into,
land on and float on. The owner asked for "another map ... photorealistic
map made out of the Itaipu Dam ... with all of the physics", and, told
the options, said: "build it all - and rely on openstreet but then upgrade
everything like the photoreal map". So OpenStreetMap is approved for this
map (with its ODbL attribution done properly, section 15), and the
photoreal loop that took swiss2 from 3.67 to 6.88 (docs/SWISS2-LOOP.md)
runs on this map from its first round.

This is phase 0: the survey, the data and this contract. Nothing in
`src/` exists yet. Several parts are built in parallel worktrees against
the contract below, so the contract is the thing that must not drift. A
part that finds the contract wrong says so in its pull request rather
than working around it.

Everything here was checked against the tree at 42f9b42 and against the
fetched sources; `tools/itaipu/check.py` prints every number this file
quotes about the data, and section 16 says how to reproduce it.

## 1. What the brief got wrong, and what changed because of it

The brief was verified before anything was built on it. What was stale
or wrong:

1. **"Use something finer than GLO-30 if a free one exists (ALOS, IBGE/SGE)."**
   Nothing finer was found free for this area. ALOS AW3D30 is also 30 m.
   A search found no finer download for Foz do Iguacu or Hernandarias:
   Parana's IAT publishes high resolution models for other basins (the
   upper Iguacu near Curitiba), and no Paraguayan national DEM download
   turned up. This is a search result, not a proof; a finer licence-clean
   source found later drops into the hero tiles without changing any
   format here. What does exist and is
   better is not finer but cleaner: **ANADEM v1** (ANA and IPH-UFRGS,
   CC BY 4.0), a 30 m bare earth terrain model made from GLO-30 by
   removing vegetation. It is the terrain; GLO-30 supplies the water
   levels and, subtracted from ANADEM, the canopy height (section 4).
2. **"Reservoir normal level about 220 m."** Itaipu publishes 220.30 m
   (normal), 223.10 (flood), 197.00 (exceptional minimum). Both DEMs read
   the reservoir flat at **219.0 m** above EGM2008, 1.3 m lower, the
   height the shoreline was mapped at. The map puts the water at 219.0,
   so the water meets the shore the DEM drew (section 5).
3. **Tailwater.** Itaipu publishes 104.00 m normal, 92.00 minimum, 142.15
   maximum. The DEM's river is not flat: it steps down in half metres
   from 105.0 at the tailrace to 102.0 three kilometres downstream and
   stays at 102.0 to the triple frontier. The plant's water is one flat
   level per body, so the river is one body at **103.5 m** and its
   waterline is within 1.5 m of the DEM's everywhere in the hero square.
4. **"A hero area of about 10 x 10 km centred on the dam."** The shell's
   collider grid reaches only 4096 m from the origin (`GRID_HALF = 512`
   cells of 8 m, `src/game/collide.js:337`), and a collider past it is
   registered under an aliased key and never found by the craft's sweep.
   A 10 km hero square needs that raised (work package C). Centred
   exactly on the crest, half the square would be flat reservoir; the
   origin is 1.7 km south of the crest instead, which keeps 3.4 km of
   reservoir and brings in 6.8 km of the canyon and the left bank
   (section 2).
5. **"Upgrade everything like the photoreal map."** swiss2's photorealism
   is procedural: nine CC0 terrain layers splatted by masks on a 6 km
   invented valley, with no aerial imagery at all (src/maps/swiss2/assets.js).
   Its material kit is reusable; its terrain is not, because it is the
   Alps field. Itaipu's terrain comes from Yellowstone's streaming tile
   engine, which is cel-shaded and has no colliders and no plant water.
   So the map is a new combination: Yellowstone's tiles and chunks under
   swiss2's photoreal materials, driven by Sentinel-2 colour and masks.
   Neither existing map does this, and section 14 splits it so each part
   can be built and checked alone.
6. **"The tree clump capability exists."** It does (`sim_tree_add`,
   `sim_tree_clump_add`), but only as the crash world's nearest 32 trees
   within 80 m, and swiss2 gives trees colliders only within 700 m of its
   origin (3 756 trees). In the hero square 21 km2 of land stands more
   than 5 m above the bare earth (GLO-30 minus ANADEM: forest, and some
   buildings), several hundred thousand trees at the few hundred per
   hectare of Atlantic forest. Per-tree colliders do not scale to that, so
   forest is a canopy volume with per-tree colliders only near the pilot
   (section 9).
7. **The water system.** The plant already supports two water bodies at
   different heights (`sim_water_add(z0, ...)`, up to 4 bodies, 256
   vertices each). But the host ignores `sim_water_vertex`'s error, so an
   outline past 256 vertices is silently truncated (`src/main.js:1381`),
   the float spawn is `water[0]` only (`main.js:1531`), and swiss2's
   renderer has one planar mirror at one height. These are small, named
   fixes (work package C and E), not a plant change.
8. **"build-cost.js and the memory budget (lint:memory)."** `lint:memory`
   has no absolute memory budget: it checks that boot fetches no heavy
   map, that a map fetches only its own directory, and that switching
   back leaks under 15 % (`scripts/memory-check.js:214`). The only
   absolute budgets are Yellowstone's (48 MB chunk buffers, 24 MB tiles)
   and the loop's (300 draw calls, 2.5 M triangles, 60 fps). Section 13
   sets Itaipu's own.
9. **Repository policy on OpenStreetMap.** docs/YELLOWSTONE-DATA.md says
   "No OpenStreetMap data is used anywhere", because its licence is not
   public domain. That was a Yellowstone decision; the owner's approval
   above makes Itaipu the exception, and the ODbL obligations (share-alike
   on the derived database, attribution on screen) are met in section 15.
10. **Overpass.** The fetch was written against the Overpass API and every
    public endpoint answered 504 for a quarter of an hour on 2026-09-29.
    OpenStreetMap is taken from Geofabrik's Paraguay and Brazil South
    extracts instead, cut to the square and the country files deleted.
11. The dam coordinate in the brief, 25.408 S 54.589 W, is right: it is the
    middle of the main dam's crest (OpenStreetMap way 32236291). The
    spillway is on the **right bank**, the Paraguayan side (Itaipu:
    "colocado na margem direita"), not the Brazilian one.

Nothing in the brief turned out to be a bad idea outright. The one
place the data argues against it is the extent, and it argues for more,
not less: section 3.

## 2. Frame

- Projection: UTM zone 21S, EPSG:32721, metres.
- Origin: E0 = 742 500, N0 = 7 186 000, 1.7 km south of the middle of the
  main dam's crest (which projects to 742 559, 7 187 672). World
  x = E - E0 (east), world z = -(N - N0) (north is -z, the shell's
  forward), world y = height in metres above EGM2008, **no offset**. That
  is both DEMs' own datum. Yellowstone subtracts Y0 = 2200 only to fit its
  tile encoding; that encoding (decimetres from 1000 m below y 0) holds
  Itaipu's 96 to 336 m as they are, so Y0 = 0 and every height in the map
  is a height you can check against a source.
- `tools/itaipu/common.py` is this section's executable form.
- The map module converts nothing at run time: the data files are already
  in world metres.

Landmarks (world x, z in metres), projected with pyproj from
OpenStreetMap and Itaipu's figures, so every part places them the same way:

| Landmark | x | z | From |
| --- | --- | --- | --- |
| Main dam crest, middle (the brief's 25.408 S, 54.589 W) | 59 | -1 672 | projected |
| Main dam and powerhouse, centroid: 868 x 203 m, long side 12.9 degrees from +x toward +z | 58 | -1 670 | OSM way 32236291 |
| Main dam, diversion side: 907 x 244 m | -685 | -1 536 | OSM way 428443544 |
| Right lateral dam axis, 1 583 m | -355, -1 842 to -1 238, -1 072 | | OSM way 32303023 |
| Spillway, centroid: 488 x 352 m (Itaipu: 483 x 362), chute along 70.4 degrees | -900 | -798 | OSM way 262637862 |
| Spillway gates (north end of the chute), derived | -982 | -1 028 | centroid minus half the length along the chute |
| Left bank rockfill and earth dams, centroid: 4 412 x 687 m along 56.8 degrees | 1 991 | -88 | OSM way 428251279 |
| Left bank crest road, 4 185 m; its straight rockfill part 1 256 m | 901, -1 555 to 1 815, -717 | | OSM ways 262638260, 30657423 |
| Mirante da Barragem (viewpoint, Brazilian side) | 225 | -1 059 | OSM node 7029899286 |
| Mirante do Vertedouro (viewpoint) | -344 | -319 | OSM node 12272109001 |
| Itaipu right bank substation (50 Hz, 500 kV), 48 ha | -2 128 | -434 | OSM way 32302779 |
| Foz do Iguacu converter station (HVDC), 75 ha | 4 659 | 4 866 | OSM way 32300871 |
| Acaray hydro plant (Paraguay, 210 MW) | -3 464 | 4 008 | OSM way 262532170 |
| River, middle at z 400 (flat water from x -1 090 to -760) | -925 | 400 | GLO-30 |
| Friendship Bridge (ring, not hero) | -1 506 | 9 535 | OSM way 26122712 |
| Triple frontier, Iguacu mouth (ring) | -340 | 18 700 | projected |

`check.py` prints the OSM rows from the extract, so a newer extract that
moves one says so.

## 3. Extent, and why it is bigger than the brief's

Two squares, both centred on the origin:

| Square | Half width | What is in it |
| --- | --- | --- |
| Hero | 5 120 m (10.24 km across) | 10 m terrain, the dam, OSM buildings, roads and power lines as geometry and colliders, trees, water physics, every spawn and gate |
| Ring | 20 480 m (40.96 km across) | Terrain at 30 m and coarser, imagery, water surfaces. No colliders past the hero, no buildings |

The hero is the brief's 10 x 10 km, snapped to whole 2560 m hero tiles
(two each side of the origin). It holds the whole dam complex (the
mapped structures run from the right lateral dam's west end at x -1 240
to the left bank earth dam's end at x +2 860, z -1 840 to +1 960; the
right bank earth dam and the Hernandarias dike, which OSM does not map
as dams, are placed by package A west of that), 3.4 km of reservoir
north of the crest, and 6.8 km of the canyon and banks below.

**The ring is the argument for a larger extent, and the numbers make it
cheap.** From the crest, at 225 m, the horizon is 53 km away; a plane at
500 m sees 80 km. A 10 km world ends 3 to 5 km from anything worth
looking at, so every view from altitude would show the edge. The ring is
drawn terrain only, in Yellowstone's tile format, and costs:

| | Hero only | Hero + ring |
| --- | --- | --- |
| Elevation tiles | 16 hero tiles, 2.1 MB | + 36 L0, 9 L1, 4 L2, 1 L3 = 66 tiles, 8.7 MB |
| Imagery | 1024 x 1024 at 10 m, about 0.8 MB JPEG | + 1024 x 1024 at 40 m for the ring, about 0.7 MB |
| GPU textures | about 5.6 MB | about 11 MB |
| Chunk buffers (estimate; B measures) | about 12 MB | under 24 MB (Yellowstone measured 36.3 MB after flying 60 km of a 100 km world) |
| Download at 20 Mbit/s | about 1.2 s | about 4 s |

Yellowstone loads 61 MB for a 100 km world in 2.1 to 4.1 s; 40 km with
real terrain is a fifth of that, and all 66 tiles fit in memory at once,
so Itaipu needs Yellowstone's chunked level of detail but not its
streaming. The ring takes in the Friendship Bridge (z +9 500), the triple
frontier where the Iguacu joins (z +18 700), Ciudad del Este and Foz do
Iguacu as imagery, and 20 km of reservoir. Anything bigger starts to cost
real streaming and buys only flat farmland. The tile and texture sizes
are exact arithmetic (a tile is 132 098 bytes); the buffer and download
figures are estimates package B replaces with measurements.

What the ring does **not** get: buildings (Ciudad del Este and Foz do
Iguacu are two cities, most of whose buildings lie in the ring; the hero
alone has 10 581 building ways and 77 building multipolygons), colliders or trees. It is seen from the hero and
from altitude. Flying into it is allowed and is ground only.

## 4. Terrain, per zone

| Zone | Cell | Source | Notes |
| --- | --- | --- | --- |
| Hero (±5 120 m) | 10 m | ANADEM, bilinear from 30 m, plus burn-ins | Level -1 tiles, `hero/i_j.bin`, i and j 6 to 9 |
| Ring L0 to L3 | 30, 60, 120, 240 m | ANADEM | Yellowstone's (1 2 1) tent pyramid, exact on the Uint16 codes |
| Past the ring | apron | Yellowstone's apron (`src/maps/yellowstone/terrain/apron.js`), fed Itaipu's border | Tucked under, never flown to |

- **ANADEM for land, not GLO-30.** GLO-30 is a surface model: it has the
  forest canopy in it. Over the hero's land, GLO-30 minus ANADEM is 1.4 m
  at the median and 11.0 m at the 90th percentile: that is the forest and
  the buildings, which the map draws as trees and buildings. Built on
  GLO-30, every forest would be a 10 m hump with trees standing on top
  of it.
- **GLO-30 for water levels.** GLO-30 flattens each water body to one
  value (the reservoir reads exactly 219.00 at every probe). ANADEM's water
  is close but not flat (103.79 where GLO-30 reads 103.50 in the canyon).
- **Canopy height model.** GLO-30 minus ANADEM, clamped to 0 to 40 m, on
  the 30 m grid: `canopy/i_j.bin`, Uint8 whole metres, 257 by 257, the
  level 0 tiling. The vegetation package reads tree height and density
  from it (section 9).
- **The DEM cannot hold the dam.** The main dam's crest is at 225 m; the
  GLO-30 cell on it reads 145.1 m, a smear of crest, faces and canyon.
  Every structure is geometry (section 6), and the pipeline flattens the
  terrain under each structure's footprint to the foundation level the
  structure's own geometry starts from, so no smeared ramp shows through.
- **Burn-ins at 10 m, hero only**, from OSM geometry and Itaipu's figures:
  the embankment dams (rockfill, 1 984 m, up to 70 m; the earth dams, 872
  m and 2 294 m, up to 25 and 30 m; the Hernandarias dike, 175 m) are
  terrain, not solids, because an embankment is a ground slope: the
  pipeline raises the DEM along their OSM axis to crest height with
  published or measured side slopes. Their crest roads are flat ground
  records (the roofs mechanism, section 6) so the crest edge is sharp
  where 10 m cells would round it.
- **Water beds.** Inside each water outline the terrain is lowered to
  the body's level minus a bed depth (3 m in the hero, 1 m in the ring),
  so the flat water never shows terrain through it, whatever the DEM's
  stepped river says.

## 5. Water

Two plant water bodies and one visual one:

| Body | Level y | Outline | Plant | Drawn |
| --- | --- | --- | --- | --- |
| Reservoir (Lago de Itaipu) | 219.0 | OSM water polygon, clipped to the ring, simplified | yes, body 0 | planar mirror when the camera is above it |
| River (Parana below the dam, tailrace to the ring's south edge) | 103.5 | OSM riverbank polygon, clipped to the ring, simplified | yes, body 1 | environment reflection, or the mirror when it is the body under the camera |
| Spillway chute and plunge | follows the chute floor | the chute's three bays | no | flowing water, spray, white water in the plunge |

Sources: the levels are section 1's measurements; Itaipu's reservoir page
gives 220.30 normal and 104.00 normal tailwater, which the map does not
use for placement because the terrain was mapped at the DEM's levels.

What the plant's water must support, and whether it does today:

- **Two bodies at different heights: yes.** `sim_water_add(z0, ox, oy)`
  per body, up to 4 (`WATER_BODIES_MAX`, `src/native/sim_internal.h:1068`).
- **Outlines of at most 256 vertices: yes, silently.** The pipeline
  simplifies each outline to at most 240 vertices (margin for the closing
  point and rounding). Simplification is allowed to push the outline
  **outward** over land by up to 30 m but never inward over water, because
  over land the ground is above the water level and wins, while an
  outline that cuts water would drop a float plane through it. The two
  outlines must not overlap anywhere (the first declared body wins in an
  overlap, `water.c:229`); `validate.py` checks it.
- **Float planes on both bodies: yes** (airframes 9 and 10). The spawn
  must come from the body the pilot chose, not `water[0]` (C).
- **Waves: yes.** Six JONSWAP/SPM components from the wind plus one swell
  per body. Reservoir fetch: the distance across the reservoir in the
  wind's direction, up to 12 km (Itaipu: maximum width 12 km, mean 7 km);
  river fetch: 400 m, the canyon's width. No swell on either.
- **Crash into water: yes** (`SIM_EVENT_WATER`, damage mode).
- **River current: no.** The Parana below the dam runs at about 1 m/s and
  the plant's water has no current. A float plane on the river will sit
  still. Recorded as a later plant item, not phase 1.
- **The spillway is not plant water.** Its chute is a 483 m long concrete
  slope (the spillway is 43.7 m high at its gates). The chute floor is
  ground, a roof record (section 6), whose crash surface answers `water`
  while the spillway runs: a craft that touches it gets the water crash
  (spray, drag) and never floats. The plunge pool at its foot is part of
  the river body.

The spillway runs. Itaipu's aerials and the owner's likely picture of
the place have the chute white; Sentinel-2's 26 September 2026 scene
(kept, hero square only) shows it running, and the colour scene (20
December 2025) shows it shut, which is what the colour layer wants
because the chute is geometry drawn over it.

## 6. The dam as solids

### Parts and their published dimensions

Every figure is Itaipu Binacional's, from the pages fetched into
`_sources/itaipu-pages/` on 2026-09-29 (www.itaipu.gov.br/energia/...).
Crest elevation 225 m: Itaipu's powerhouse page places the intake gate
servomotors "na cota 225, na crista da barragem" and the crest gantry
rails' top at 225.

| Part | Type | Crest length | Max height | Other | Source page |
| --- | --- | --- | --- | --- | --- |
| Main dam and connecting blocks | hollow (relieved) gravity and buttress, concrete | 1 064 m | 196 m | 69 blocks | /energia/barragem |
| Diversion structure | gravity, concrete | 170 m | 162 m | 14 blocks | /energia/barragem |
| Right lateral dam (right wing) | buttress, concrete | 998 m | 64.5 m | 58 blocks | /energia/barragem |
| Spillway | chute, right bank | 483 m long, 362 m wide | 43.7 m | 14 segment gates 20 x 21.34 m, sill 199.16 m, 15 blocks, 62 200 m3/s | /energia/vertedouro |
| Powerhouse | at the toe of the main dam and in the diversion channel | 968 m | 112 m | 99 m wide, units 34 m apart, generator floor 108 m, roof 148 m | /energia/casa-de-forca |
| Penstocks | steel, exposed on the downstream face | 142.2 m developed length | | 20, 10.5 m inside diameter, 690 m3/s each | /energia/casa-de-forca |
| Intakes | on the crest | | | 20 service gates 8.2 m wide x 19.3 m, sill 177.6 m | /energia/casa-de-forca |
| Rockfill dam (left bank) | rockfill | 1 984 m | 70 m | | /energia/barragem |
| Left bank earth dam | earth | 2 294 m | 30 m | | /energia/barragem |
| Right bank earth dam | earth | 872 m | 25 m | | /energia/barragem |
| Hernandarias dike | earth | 175 m | | | /energia/barragem |
| Whole dam | | 7 919 m | 196 m | | /energia/barragem |

The crest lengths add up: 998 + 1 064 + 170 + 872 + 1 984 + 2 294 + 175
= 7 557 m, plus the spillway's 362 m width is 7 919 m, Itaipu's total.

The spillway's three chutes separated by training walls are from the
photographs (chute-dry, aerial-spill); Itaipu publishes the gate count
and the overall size, not the chute split.

### Where each part is

Axes, footprints and orientations come from OpenStreetMap (the dam ways
in section 2's table and the building and man_made areas around them),
checked against Sentinel-2 at 10 m. Heights and sections come from the
table above. Where OSM and the imagery disagree by more than 10 m, the
imagery wins and the pull request says so.

### Collision model

The shell's colliders are capsules, spheres and world-aligned boxes
(`Colliders`, `src/game/collide.js`); there is no rotated box. The dam is
not world-aligned (the main dam's axis runs 12.9 degrees off east). The
model reuses the swiss2 building standard, which already turns a rotated
building into ground and walls (`src/maps/alps/roofs.js`):

- **Tops are ground.** Every walkable or landable top is a roof record: a
  plane over a convex plan (`roofRecord`, roofs.js:196). The crest road
  (and every crest: main dam, diversion, right wing, spillway bridge),
  the powerhouse roof, the intake deck, the embankment crests and the
  spillway chute floor, which is a steep plane, not flat. `height()`
  offers the highest record within the step of the craft, as on swiss2.
- **Faces are walls.** Under each top, `standWalls` (roofs.js:558) fills
  `wall` boxes in columns stepped along the face. Columns are 0.5 m
  (swiss2's houses use 0.25 m; a dam face is kilometres long and 0.5 m of
  stair is invisible to a craft), tops held 0.02 m under the record.
- **Penstocks are capsules**: 20 inclined capsules of 5.25 m radius
  along their axes, the one shape the shell has that fits them exactly.
- **The gantry cranes on the crest, the spillway piers and the intake
  towers are boxes** (world-aligned where they are, columns where not).
- **Material** is concrete (`wall` maps to concrete in `crashworld.js:97`),
  rock for the rockfill dam's faces.
- **Crash free bodies** use `sim_obstacle_box` with its quaternion, so
  they can take the true rotated blocks; `nearestSolids` scans every
  collider linearly (crashworld.js:396), so its cost is measured (13).

Budget: the dam is static and at most 15 000 solids; everything else
near the pilot (buildings' walls, near trees) is a streamed set of at most
25 000 (sections 7 and 9); `nearestSolids` at most 0.5 ms per refresh. If
the dam alone passes 15 000, the core package adds an oriented box to
`Colliders` instead of more stairs; that decision is made on the count,
not ahead of it.

## 7. OpenStreetMap buildings, roads and power

What the extract holds (check.py, OSM data to 2026-09-28 20:23 UTC, both extracts):

| In the hero square | Count | What it means |
| --- | --- | --- |
| Buildings | 10 581 ways + 77 multipolygons | **only 35 carry `height` or `building:levels`**: 99.7 % of heights are guessed, which is why the rule below records where each height came from |
| Roads touching the hero | 1 871 ways, 542 km | residential 682, service 603, unclassified 210, tertiary 75, path 61, trunk 57, track 43, footway 34 |
| Dam and dyke ways | 8, 1 949 m of lines and 89.7 ha of areas | the dam is mapped in pieces; section 6 builds it from Itaipu's figures on OSM's axes |
| Power towers | 474 | |
| Power lines | 140 ways, 525 km inside the ring | the AC and HVDC lines (500, 600 and 750 kV as OSM tags them) leaving Itaipu's switchyards and the Foz do Iguacu converter station |
| Substations | 6 named, among them Itaipu's right bank yard (48 ha) and the Foz do Iguacu converter station (75 ha) | |
| Single trees (`natural=tree`) | 20 | almost nothing: trees come from imagery, not OSM |
| `landuse` areas | 75, mostly `grass` | too sparse for a landcover map: Sentinel-2 is the landcover, OSM only refines it |

- **Buildings**: every OSM building in the hero square. Height from
  `height`, else `building:levels` x 3.2 m + 1 m, else a default by type
  (house 4.5 m, apartments 12 m, industrial and warehouse 9 m, the rest
  6 m), recorded per building as `heightFrom` so the loop can see how
  much is guessed. Roofs: `roof:shape` when tagged, else flat for
  industrial and apartments and hipped for houses under 150 m2. Built and
  collided by the swiss2 building standard (roofs as ground, walls as
  stepped boxes), with swiss2's material kit (render, brick, concrete,
  metal, tile).
- **Building collision, and why it is streamed.** Roofs are ground for
  all 10 658 buildings: a roof record costs a grid entry, not a solid.
  Walls are the expensive part. swiss2's standard steps a turned wall in
  0.25 m columns, 40 boxes for a 10 m house; for 10 658 buildings that is
  hundreds of thousands of boxes. So a building's footprint is cut at its
  corners into runs, and a run into as many columns as keep every wall
  within 0.5 m of its box, none narrower than 1 m: a rectangle square to
  the world's axes is one box, a wall a few degrees off them a few, and a
  building turned well off them 1 m columns. Each column is a box per
  stretch of it inside the outline, so an L, a U or a courtyard is not
  filled (town/plan.js wallBoxes; the collision audit, #250 and #253,
  found the old 10 degree rule leaving walls up to 29 m outside what was
  drawn). The walls exist only for the buildings within 1 000 m of the pilot, in
  the streamed collider set package C adds, rebuilt when the pilot has
  moved 400 m. The dam, the powerhouse and every Itaipu structure are in
  the static set and never streamed.
- **Roads**: every highway way touching the hero, as a ribbon on the
  terrain with a width by class (motorway and trunk 14 m, primary 10 m,
  secondary 8 m, tertiary and residential 6 m, service and track 3.5 m,
  path 1.5 m, or `width` when tagged), draped with a 0.05 m lift and cut
  into the 10 m terrain where the road's grade demands. Bridges
  (`bridge=yes`) in the hero are decks at their layer height with rails,
  and they are roof records, so a craft can land on one. Roads are drawn,
  not collided (they are ground).
- **Ring landmarks**: the Friendship Bridge (z 9 535) is the one structure
  drawn in the ring, because it is seen from the canyon and the air and
  imagery alone would leave a gap in the river. Its deck is ground and it
  is solid (static boxes and capsules for the deck, parapets, arch ribs
  and columns), inside the collider grid's 16 384 m.
- **Power**: every tower and line. Itaipu's switchyards and the lines
  leaving them are the tallest things in the landscape after
  the dam and the most likely thing a pilot hits. Towers are `pole`
  colliders (a post per leg pair), conductors are `pole` capsules of 0.1 m
  between towers with a catenary sag of 2 % of the span. Substations are
  fenced yards with gantries as boxes.
- **Everything the extract holds outside the hero** is used only for
  masks (water, landuse) and is not built.

## 8. Imagery and ground materials

- **Colour**: Sentinel-2 L2A, 20 December 2025 (tiles 21JYM and 21JYN of
  one pass, 0.02 % cloud; 0.016 % nodata, cloud or shadow over the hero
  and 0.164 % over the ring). Bands B02, B03, B04 at 10 m, B08 for NDVI.
  The pipeline converts surface reflectance to display colour once, with
  a fixed curve stored in the manifest, so the map never guesses exposure.
- **Macro colour**: 1024 x 1024 over the hero (10 m), 1024 x 1024 over the
  ring (40 m). It tints the swiss2 detail layers; it is never the only
  thing on screen closer than about 150 m.
- **Splat masks**, hero 10 m, ring 40 m, 4 weights per texel, from
  Sentinel-2 (NDVI, SCL class) and OSM landuse: forest, pasture and crop,
  bare red soil (the terra roxa that is the region's colour), urban and
  paved. Detail comes from swiss2's CC0 Poly Haven layers plus one new red
  soil layer (CC0 only).
- **The sun is the scene's sun**: azimuth 90.1 degrees (due east),
  elevation 65.8 degrees, the Sentinel-2 pass at 10:49 local on
  20 December 2025 (the scene's `view:sun_azimuth` and
  `view:sun_elevation`). The shadows baked into the imagery then fall
  where the renderer's own shadows fall (west), instead of fighting them.
  swiss2 fixes its sun the same way (`SUN_ELEVATION_DEG`,
  src/maps/swiss2/assets.js:58). The loop does not retune it: a view
  whose photograph was taken in other light is scored on materials and
  shape, not on matching that light.
- **What the imagery must not do**: carry shadows and white water that
  the renderer then draws again. The 20 December scene has the spillway
  shut and a high sun; the pipeline replaces the dam footprint and the
  water with neutral colour so the geometry and the water shader own them.

## 9. Vegetation and trees

- **Where**: forest mask from Sentinel-2 NDVI and SCL, OSM `natural=wood`
  and `landuse=forest`; the hero's Paraguayan and Brazilian reserves along
  the reservoir are the dense Atlantic forest the photos show.
- **Height and density**: from the canopy height model (section 4), per
  30 m cell. Tree kinds from the swiss2 broadleaf kit, retinted, plus
  palms for urban and park trees (OSM `natural=tree` nodes, 20
  in the hero).
- **Drawing**: swiss2's instanced near trees and impostor forest.
- **Collision, two layers**:
  - **Near trees**: per-tree trunk and crown clump colliders
    (`addPost('tree')`, `addSphere('canopy')`), in the streamed set
    (section 7) for the 600 m around the pilot, rebuilt when the pilot
    has moved 400 m, capped at 4 000 trees (swiss2 collides 3 756 within
    700 m). The crash world's 32 nearest trees within 80 m
    (`sim_tree_add`, `sim_tree_clump_add`) come from these, as on swiss2.
  - **Forest volume**: everywhere the forest mask is dense, a craft below
    the canopy height model's top is in the canopy (`canopy` contact),
    whether or not a near tree was built there. This is new
    (`map.canopyAt(x, z)`, section 14 package C) and it is what makes
    hundreds of thousands of trees solid without a collider each.

## 10. Spawns

| Spawn | Where | World pose | Why |
| --- | --- | --- | --- |
| Land, planes | the left bank rockfill dam's crest road, facing south east | x 975, z -1 487, yaw -2.313 (along the road toward 1 815, -717) | 1 256 m straight (OSM way 30657423), flat and clear: the one runway in the hero |
| Land, quads | the Brazilian central viewpoint below the dam | x 225, z -1 059, yaw 0.265 (toward the crest) | the dam fills the view at takeoff |
| Water, floats | the reservoir, 800 m north of the crest, facing the dam | x 60, z -2 500, yaw 3.142 (south, toward the crest) | the upstream face and intakes ahead |
| Water, floats, river | the river 2 km below the dam, facing upstream | x -925, z 400, yaw 0 (north, upstream) | the powerhouse, penstocks and spillway plume ahead |
| Air | 400 m over the reservoir, 3 km north of the crest, heading south | x 1 500, z -4 200, y 619, yaw 2.623 (toward the crest) | the whole complex in view |

Yaw follows the shell's convention (`src/maps/alps.js:75`): yaw 0 faces
-z, and yaw a faces (-sin a, -cos a) in (x, z), the three.js rotation
about y. Package H confirms each pose on the running shell before it
merges.

The map declares all five; the shell picks by craft (float, plane, quad)
and by the player's choice where it offers one. `map.spawn` stays the
land spawn for the shell's default; the water spawns are the water
bodies' own (`water[i].spawn`, fixed by package C).

## 11. Gates and courses

The map hosts the builder (`build: true` in the registry), and two
courses ship as track documents on the builder's format with map id
`itaipu`:

- **Itaipu run (planes)**: from the air spawn over the reservoir, a pylon
  pair over the main dam's crest, down the downstream face past the
  penstocks, along the tailrace, up the river to the spillway plume,
  over the right wing, and back over the crest. 30 m hoops and pylon
  pairs, 4 to 6 km.
- **Powerhouse (quads)**: between the penstocks, under the switchyard
  gantries, along the powerhouse roof and through the spillway bridge's
  bays. Quad gates, 1 to 1.5 km.

Both must fly clean with the bundled aircraft in their class (the
builder's racing line warnings are zero), which is the check.

## 12. The photoreal loop, from day one

The loop runs the way docs/SWISS2-LOOP.md does, with its own record in
`docs/ITAIPU-LOOP.md`: fixed views, reference photographs, the same 1 to
10 rubric, the lead scores, never the round's agent. Round 0 is the
first build that draws every part.

Reference photographs are in `~/Desktop/fdfpv-photoref/itaipu/`, 22
Wikimedia Commons images with their licences in its SOURCES.md, for
comparison only, not redistributed and not in any repository. The views,
each with its reference; the pose is a first placement from the photo
and the landmarks, which the loop package pins in round 0 by matching the
reference and then never moves:

| View | Reference | Camera x, z, height | Looks at x, y, z | What it judges |
| --- | --- | --- | --- | --- |
| aerial-dam | aerial-dam | 1 500, -200, 700 m above ground | 59, 225, -1 672 | the whole main dam, powerhouse and reservoir from the air |
| aerial-dam-wide | aerial-dam-2 | 900, 900, 900 m | -600, 200, -1 500 | dam, spillway and the right bank together; the reservoir to the horizon |
| aerial-spill | aerial-spill | -1 300, 900, 600 m | -982, 210, -1 028 | the spillway running, its plume and the canyon |
| spill-gates-high | aerial-spill-2 | -600, -700, 250 m | -982, 215, -1 028 | the 14 gates and piers close, white water on the chute |
| leftbank-high | aerial-leftbank | 2 600, 1 600, 700 m | 59, 225, -1 672 | the left bank country, roads and the dam beyond |
| rockfill-high | aerial-rockfill | 4 300, 2 300, 450 m | 1 400, 220, -900 | the rockfill and earth dams against the reservoir |
| dam-downstream | dam-downstream | 225, -1 059, eye 1.7 m (Mirante da Barragem) | 58, 150, -1 640 | the downstream face, buttresses, penstocks, powerhouse |
| dam-downstream-2 | dam-downstream-2 | 700, -1 150, eye 1.7 m | -200, 150, -1 650 | the same across the tailrace and the rock island |
| powerhouse | powerhouse | 700, -1 350, 120 m | 0, 130, -1 600 | the powerhouse roof, penstocks and the tailrace |
| canyon | canyon | -150, -1 640, crest road + 2 m | -900, 110, 300 | the canyon below the dam from the crest |
| river-below | river-below | -1 400, 1 000, 60 m | -1 800, 104, 4 000 | the river and its forested banks |
| chute | chute-running | -980, -1 020, spillway bridge + 2 m | -800, 160, -500 | down the chute, water, training walls |
| spill-gates | spill-gates | -1 400, -1 150, eye 1.7 m | -982, 210, -1 030 | the gate piers and hoists from the Paraguayan side |
| spill-plume | spill-plume | -700, -200, 3 m | -820, 150, -560 | the plume from the river bank |
| penstocks | penstocks | 500, -1 560, eye 1.7 m | -300, 150, -1 680 | the white penstocks at their foot, scale |
| crest-road | crest-road | -100, -1 700, crest road + 1.7 m | 600, 226, -1 560 | the crest road, gantries, lamps, reservoir |
| rockfill-road | rockfill-road | 1 600, -700, eye 1.7 m | 2 100, 200, 50 | the rockfill face over the road |
| reservoir-dam | reservoir-dam | -3 500, -2 500, 2 m over the water | 59, 225, -1 700 | the dam as a line across the reservoir |
| reservoir-shore | reservoir-shore | -2 500, -3 000, 2 m | -1 500, 219, -4 500 | shore, forest and water at eye level |
| powerlines | powerlines | 900, -900, 20 m | 0, 200, -1 650 | towers and conductors against the dam |
| reservoir-forest | reservoir-forest-aerial | -2 500, -3 000, 350 m | -1 000, 219, -6 000 | forested shore and water from the air |
| craft-chase | craft (swiss2's `craft.jpg`, symlinked into the itaipu folder) | 3 m behind the land spawn | the craft | the aircraft you fly, close |

Twenty-two views, as swiss2 ended with seventeen. The judgement in round
0 is also a triage: the views whose pictures are furthest from their
photograph pick round 1's targets.

## 13. Performance budgets

At High on the RTX 3060 Ti, per view, as swiss2's loop:

- at most 300 draw calls and 2.5 M triangles, never under 60 fps;
- GPU frame time under 12 ms (High), 8 ms (Medium), 5 ms (Low), on
  `scripts/swiss2-perf.js`'s floor measure (docs/SWISS2-PERF.md);
- terrain: Yellowstone's 120 calls and 400 k triangles in view, and 5 ms
  of terrain work in a frame;
- one planar mirror, never two;
- data: at most 25 MB fetched for the whole map (section 3's table is
  about 12 MB of terrain and imagery; the rest is vectors, dam geometry
  and the detail layers shared with swiss2);
- memory: chunk buffers under 24 MB, tiles under 12 MB, and the switch
  back to another map leaking under `lint:memory`'s 15 %;
- colliders: the static set (the dam and Itaipu's structures) at most
  15 000; the streamed set (building walls within 1 000 m, near trees
  within 600 m) at most 25 000 and rebuilt in slices of at most 2 ms a
  frame; `nearestSolids` at most 0.5 ms;
- build: `MAP_BUILD_MS.itaipu` measured, not guessed, and under 4 s on
  this machine (Yellowstone's 3.2 s is the benchmark).

## 14. Work packages

Each package is one worktree, one branch, one pull request, and owns
only the files named. A file not named is not touched; a package that
needs a change in another's file asks for it in its PR. The one shared
file is `package.json`: each package may add its own `scripts` lines for
its checks and nothing else there, and the lead resolves the adjacent
line conflicts at merge.

Hosting first, because every package reads the data. The data is built
outside this repository into `~/Desktop/fdfpv-itaipu-data/` and
published to a new public repository, fdflabs/fdfpv-itaipu-data, on
GitHub Pages, exactly as Yellowstone's is: one `DATA_BASE` constant in
`src/maps/itaipu.js`, and `itaipu-data/` served from the local folder by
`scripts/serve.js` and `tests/lib/server.js` (override
`FDFPV_ITAIPU_DATA`). Creating that repository is the lead's job before
package A publishes.

### The part interface

Package B lands a skeleton first: `src/maps/itaipu.js` building terrain
and flat placeholder water, and four empty part modules with this
signature, so D, E, F and G build against a fixed seam and merge in any
order:

```js
// src/maps/itaipu/<part>/index.js
export async function buildPart(ctx) -> { group, update(stepIndex), dispose(), stats() }
// ctx = {
//   THREE, scene, quality: 'low'|'medium'|'high',
//   data,          // parsed JSON files from the data folder, by name
//   ground(x, z),  // terrain height, world metres, water beds included
//   colliders,     // the map's Colliders, not yet built
//   roofs,         // the map's roofs record (src/maps/alps/roofs.js)
//   mats,          // swiss2's material kit, shared, never disposed by a part
//   progress(f),   // 0 to 1 within the part's share of the bar
// }
```

A part adds its colliders and roof records during `buildPart` and never
after; the map calls `colliders.build()` once, when every part is in.

### Packages

| Pkg | Name | Owns (and only these) | Adds these checks | Depends on |
| --- | --- | --- | --- | --- |
| A | Data pipeline | `tools/itaipu/**`; the data repository | `uv run python validate.py` (below); `check.py` stays green | nothing |
| B | Map, terrain and look | `src/maps/itaipu.js`, `src/maps/itaipu/terrain/**`, `src/maps/itaipu/look/**`, the four stub `index.js` files until their owners replace them; `src/maps/yellowstone/terrain/frame.js` (parameterised, see below); one entry each in `src/maps/registry.js`, `src/maps/build-cost.js`, `src/strings/en.js`, `src/strings/es.js`, `scripts/memory-check.js` (`HEAVY`), `scripts/hotswap-check.js` (`ALL_MAPS`), `src/game/crashworld.js` (`MAP_GROUND`), `src/main.js` (`MAP_MODULE_COUNT` only); `scripts/serve.js`, `tests/lib/server.js` (the `itaipu-data/` route); `assets/posters/itaipu.jpg`; `scripts/itaipu-check.js` | `node scripts/itaipu-check.js`: the map builds headless with no console error, fetches only `itaipu-data/` and its own directory, `height()` at 200 random hero points equals the tiles within 0.05 m, the build time recorded; `npm run lint:memory` with itaipu in `HEAVY`; `npm run hotswap:check`; verify check 16 (dynamic import); **Yellowstone unchanged**: `node scripts/yellowstone-check.js` passes before and after the frame change | A's formats |
| C | Core: grid, streamed colliders, water host, canopy | `src/game/collide.js`; `src/game/water.js`; in `src/main.js` only `declareWater`, `mapSpawn` and the contact pass's canopy call; `scripts/grid-check.js`, `scripts/water-host-check.js`, `scripts/canopy-check.js` | `GRID_HALF` raised to 1024 (8 192 m each way); a collider outside the grid **throws** at `build()` instead of aliasing; a second, streamed collider set on `Colliders` that a map refills around the pilot while the static set stays built, swept by every query the static set answers (`hit`, `hitParts`, `gapAt`, `sweepSolids`, `nearestSolids`), refilled in slices of at most 2 ms a frame; a `sim_water_vertex` error **throws** in `declareWater`; `mapSpawn` takes the water body the pilot chose; `map.canopyAt(x, z)` optional hook (top height or -Infinity) raising a `canopy` contact. Checks: a wall at x = 6 000 is hit, one at 9 000 throws; a streamed wall is hit, and after a refill that drops it, is not; a 257 vertex outline throws; a float spawns and floats on body 1 at 103.5 with `sim_float_state` out[9] = 1; a craft 5 m under a synthetic canopy top gets a canopy contact and one 1 m over it does not; `npm run check:roof`, `check:trees`, `check:wall`, `crash:identity` unchanged; `npm run verify` | nothing |
| D | The dam | `src/maps/itaipu/dam/**`; `scripts/dam-check.js` | `npm run check:dam` (added to package.json by D): land a Timber on the main crest road, the rockfill crest road and the powerhouse roof and stop without damage; hit the upstream face at 20 m/s and wreck; fly the gap between two penstocks with no contact and hit a penstock with one; skid down the spillway chute on its floor record; 400 sampled points on each drawn face within 0.5 m of a wall column; solid count at most 15 000 for the dam; every table row in section 6 within 1 % in the built geometry | A (`dam.json`), B (skeleton), C (grid) |
| E | Water | `src/maps/itaipu/water/**`; `scripts/itaipu-water-check.js` | floats (9 and 10) start, float and taxi on the reservoir and the river; waves on the reservoir grow with the wind's fetch and the river's do not; a dive into the reservoir raises `SIM_EVENT_WATER`; the chute answers `surfaceAt` with `water`; the one mirror follows the body under the camera and costs no more than swiss2's lake mirror on `swiss2-perf.js` | A (`water.json`), B, C |
| F | Buildings, roads, power | `src/maps/itaipu/town/**`; `scripts/town-check.js` | every hero building in `buildings.json` drawn and roofed (counts equal); walls streamed within 1 000 m and the streamed set under 25 000 with G's trees at the densest point of the hero; 20 sampled roofs landable; a sampled wall hit in its streamed window; a conductor and a tower each wreck a Skyhunter; roads within 0.1 m of the ground; the Friendship Bridge drawn in the ring | A (`osm/*.json`), B, C |
| G | Vegetation | `src/maps/itaipu/vegetation/**`; `scripts/itaipu-canopy-check.js` | a Timber at 4.6 m under a near crown passes untouched (the swiss2 tree-crown regression), one into the crown is held; a craft below the canopy top in dense forest gets a canopy contact through C's hook; moving 400 m refills near trees in slices under 2 ms a frame; at most 4 000 near trees | A (`canopy/`, masks), B, C |
| H | Spawns and courses | `src/maps/itaipu/spawns.js`, `src/maps/itaipu/attract.js`; the two course documents in `docs/itaipu-courses/` | every spawn settles in 2 s with no contact damage for each craft class; the attract path stays 30 m clear of every solid; both courses load in the builder with zero racing line warnings and fly a clean lap with their class's default aircraft on the sim clock | D, E |
| I | The loop | `scripts/itaipu-views.js`, `docs/ITAIPU-LOOP.md`; renders go to `~/Desktop/fdfpv-loop/itaipu/round-N`, never the repository | every view's camera above `__heightAt` and outside every solid; `stats.json` per view within section 13's budgets; round 0's sheet (`tools/swiss2-loop/sheet.py ~/Desktop/fdfpv-photoref/itaipu ...`, unchanged) and scores in `docs/ITAIPU-LOOP.md` | everything above |

B's Yellowstone change: the terrain engine imports its constants from
`src/maps/yellowstone/terrain/frame.js` (`HALF`, `Y0`, `LEVELS`,
`tilePath`). B makes the frame a parameter of `Terrain` and `TileStore`
with Yellowstone's values as the default, so Yellowstone's code path
reads the same numbers it reads today. It is the one change in this plan
that touches a shipped map, which is why B's PR must show Yellowstone's
check before and after.

### Merge order

1. **C** (core). Small, independent, and everything after it assumes the
   bigger grid and the loud water errors.
2. **A** (data v1), published to fdflabs/fdfpv-itaipu-data. The formats
   are the contract below; a later data rebuild is a push there and
   changes nothing here.
3. **B** (skeleton, terrain, look). The map loads, flies and has water
   planes at the right levels; the parts are stubs.
4. **D, E, F, G**, in that order, each merged on its own green checks
   and re-rendered once: D first because E's chute water and F's
   collider total read D's result.
5. **H** (spawns, courses).
6. **I** (round 0 of the loop). Then the loop's rounds, as swiss2's ran.

Every PR runs the project's CI (`.github/workflows/checks.yml`) and its
package's checks, and reports real output. C, whose change is to the
shell's collision and water host, also runs `npm run verify`. D, E, F
and G run `node scripts/shots.js` on the map.

### Data formats (package A's contract)

All in world metres (section 2), all in the data folder's root unless
named:

- `manifest.json`: as Yellowstone's (frame, encoding, levels, hero set,
  sources with licences, a sha256 per file), plus `water` and `imagery`
  blocks.
- Elevation: `L/i_j.bin` (L 0 to 3) and `hero/i_j.bin`, Yellowstone's
  encoding exactly (257 by 257 Uint16 LE, round((y + 1000) * 10)), origin
  rule from x, z = -20 480.
- `canopy/i_j.bin`: canopy height, Uint8 metres, the level 0 tiling.
- `imagery/hero.jpg`, `imagery/ring.jpg`: colour, 1024 x 1024, sRGB.
- `masks/hero.png`, `masks/ring.png`: 4 splat weights (forest, field,
  red soil, urban) in RGBA, summing to 255.
- `water.json`: `[{name, y, outline: [[x, z]...] (<= 240), holes: [...],
  bedDepth, spawn: {x, z, yaw}, fetch: {dir: fetch_m...}}]`, reservoir
  first.
- `dam.json`: one entry per row of section 6's table: `{part, kind, axis:
  [[x, z]...], crestY, baseY, sections: [...], source}` with the source
  page and the figure it came from, so D builds from numbers with a
  citation.
- `osm/buildings.json`, `osm/roads.json`, `osm/power.json`,
  `osm/trees.json`, `osm/landuse.json`: hero features with their OSM ids
  (ODbL needs them traceable) and the fields section 7 names.

`validate.py` checks all of it: every file in the manifest with its
sha256, tile counts and the origin rule, water outlines at most 240
vertices and disjoint, levels as section 5, the hero tiles equal to the
level 0 tiles at every shared sample outside the burn-ins and water
beds within the encoding's 0.1 m,
`dam.json` against section 6's table, and every OSM feature inside the
square it belongs to.

## 15. Licences and attribution

The code is GPLv3 like the rest of the repository. The data is not
code and is published in its own repository (fdflabs/fdfpv-itaipu-data),
each file under its source's licence, listed in its `manifest.json` and
in a `LICENCE.md` there. Every one allows redistribution in a public
repository and use in a GPL program, with the conditions below.

| Source | Licence | What it requires | Attribution text |
| --- | --- | --- | --- |
| Copernicus DEM GLO-30 | Copernicus DEM licence (free, worldwide; use, copy, modify, redistribute) | the notice on distribution | "Copernicus DEM GLO-30: (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" |
| ANADEM v1 | CC BY 4.0 (OpenTopography dataset OTSDEM.082025.4674.1) | attribution, indicate changes | "Elevation: ANADEM v1, Laipelt et al. 2024, Remote Sensing 16(13):2321, ANA / IPH-UFRGS, CC BY 4.0, resampled and edited" |
| Sentinel-2 L2A | Copernicus Sentinel data terms (Regulation (EU) 1159/2013): free, full and open | the notice | "Contains modified Copernicus Sentinel data 2025 and 2026, processed by ESA" |
| OpenStreetMap | ODbL 1.0 | attribution where the map is shown; the derived database (`osm/*.json`) offered under ODbL, which its public repository does; the produced work (the rendered map) may be under any licence | "(c) OpenStreetMap contributors, ODbL, openstreetmap.org/copyright" |
| Itaipu Binacional's figures | facts (dimensions and levels), cited, not copied as text | citation | cited by page in section 6 and in `dam.json` |
| Reference photographs | CC BY, CC BY-SA, public domain (per file) | nothing, because they are never distributed | kept in `~/Desktop/fdfpv-photoref/itaipu/SOURCES.md` |
| Detail textures | CC0 (Poly Haven, already in `assets/swiss2`) | nothing | credited as swiss2's are |

Where it shows: package B adds the four attribution lines to the map's
credits (the same place Yellowstone's sources are credited) and a one line
"(c) OpenStreetMap contributors" on the map's loading screen, because
ODbL asks for attribution "in a manner reasonably calculated to make any
Person that uses ... the Produced Work aware" of the source. The map's
name and art use no Itaipu Binacional logo or brand (a real place, named;
not an organisation's branding).

## 16. Data: where it is and how to reproduce it

Raw sources, outside every repository, in
`~/Desktop/fdfpv-itaipu-data/_sources/` (sizes from `check.py`):

| Path | Size | What |
| --- | --- | --- |
| `dem/Copernicus_DSM_COG_10_S26_00_W055_00_DEM.tif` | 41.1 MB | GLO-30 tile S26 W055, whole (the tile covers the DEM square) |
| `dem/anadem_v1_21J_itaipu.tif` | 6.5 MB | ANADEM cut to 27.6 km each side of the origin |
| `s2/S2B_21JYM_20251220_0_L2A_{blue,green,red,nir,scl}.tif` | 75.6 MB | colour scene, south tile, cut to the fetch square |
| `s2/S2B_21JYN_20251220_0_L2A_{blue,green,red,nir,scl}.tif` | 31.9 MB | the same pass's north tile, the square's north 6.5 km |
| `s2/S2B_21JYM_20260926_0_L2A_tci.tif` | 1.8 MB | spillway running, hero square, true colour |
| `osm/itaipu.osm.json.gz` | 29.9 MB | OSM cut (207 MB uncompressed), Overpass JSON format |
| `itaipu-pages/*.html` | 11.8 MB | Itaipu Binacional's four pages the figures are cited from |
| `sources.json` | | URL, date, licence, size, sha256 of every file |
| total | 190 MB | |

Reference photographs: `~/Desktop/fdfpv-photoref/itaipu/`, 22 JPEGs at
1920 px, 13 MB, licences in its SOURCES.md.

To reproduce, from a clone:

```sh
cd tools/itaipu
~/.local/bin/uv sync
~/.local/bin/uv run python fetch.py            # dem, imagery, osm, pages; skips what is present with its sha256
~/.local/bin/uv run python check.py            # every number this file quotes about the data
```

`fetch.py` records for every file its URL, retrieval time, licence, size
and sha256 in `_sources/sources.json`. The rasters are windowed reads of
cloud optimised GeoTIFFs (Copernicus on AWS open data, ANADEM from ANA's
SNIRH, Sentinel-2 from Element 84's Earth Search catalogue), so only the
square is downloaded, not the 1.5 GB ANADEM tile or the 110 km Sentinel
scenes. OpenStreetMap is cut from the day's Geofabrik extracts, so a
later run gets later OpenStreetMap; the extracts' replication timestamps
are in `sources.json`. The OSM step downloads 580 MB of country extracts
into `_sources/osm/_country/`, cuts them in about 24 minutes at 3.3 GB
peak memory (pyosmium, one Python pass over every node), and deletes
them. The rest takes a few minutes. Scratch goes to `_tmp/` beside the data, never
`/tmp`.
