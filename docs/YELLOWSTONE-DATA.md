# Yellowstone data: sources, pipeline and checks

How the Yellowstone map's data folder is built. The contract it builds to
is docs/YELLOWSTONE-PLAN.md; this file says where every byte comes from,
what each file holds field by field, and how it was checked.

The folder is `~/Desktop/fdfpv-yellowstone-data/` (or `$YELLOWSTONE_DATA`).
Nothing in it is committed. The tools are in `tools/yellowstone/`.

## Running it

    cd tools/yellowstone
    ~/.local/bin/uv run python build.py

`build.py` fetches whatever sources are missing, builds every part, writes
the manifest and runs the validator. The steps can run on their own:
`fetch.py [dem hydro landcover thermal roads]`, `build_dem.py`,
`build_landcover.py`, `build_hydro.py`, `build_thermal.py`,
`build_roads.py`, `manifest.py`, `validate.py`, and
`preview.py OUT_DIR` for two PNGs to look at. The uv project brings its
own GDAL and PROJ in the rasterio and pyogrio wheels, so the host needs
none. Scratch files go to `_tmp/` beside the data, never to `/tmp`.

A full build from downloaded sources takes 97 s wall clock and peaks at
1.8 GB resident (`/usr/bin/time -v`). The first download is about 4.4 GB.

## Folder layout and sizes

| Path | What | Size |
| --- | --- | --- |
| `0/` to `5/` | elevation tiles, 196, 49, 16, 4, 1, 1 | 25 MB, 6.2 MB, 2.1 MB, 517 KB, 130 KB, 130 KB |
| `hero/` | 10 m elevation tiles, 60 | 7.6 MB |
| `landcover/0/`, `landcover/1/` | NLCD classes, 196 and 49 tiles | 16 MB |
| `hydro.json` | rivers and lakes | 2.0 MB |
| `thermal.json` | thermal features | 1.3 MB |
| `roads.json` | roads, boardwalks, paved paths | 741 KB |
| `manifest.json` | levels, hero set, sources, sha256 per file | 63 KB |
| `_sources/` | downloads, with `sources.json` | 4.4 GB |
| `_work/` | extracted NHD geodatabases, level 0 floats | 2.4 GB |

The served part is 61 MB. `_sources/`, `_work/` and `_tmp/` are build
state; anything under a name starting with `_` is not data and is not in
the manifest.

## Sources

Every download is recorded in `_sources/sources.json` with its URL, the
publisher's date, when it was fetched, its size and sha256, and the same
list goes into `manifest.json`.

| Part | Source | Date | Licence |
| --- | --- | --- | --- |
| Elevation, every level and hero | USGS 3DEP 1/3 arc second DEM, 9 one degree tiles n44 to n46, w110 to w112, found through the TNM Access API (`tnmaccess.nationalmap.gov/api/v1/products`) and downloaded from the public `prd-tnm` S3 bucket, newest dated file per tile | 2024-03-25 to 2026-08-14 | Public domain, US Government work |
| Hydrography | USGS NHDPlus High Resolution file geodatabases for HU4 1002 (Missouri headwaters: Madison, Firehole, Gibbon, Gallatin), 1007 (Upper Yellowstone), 1008 (Bighorn, the Absaroka side) and 1704 (Upper Snake: Lewis, Shoshone, Heart lakes) | 2023-12-20 | Public domain |
| Land cover | NLCD 2021 Land Cover (CONUS), a subset from the MRLC WCS (`mrlc_download__NLCD_2021_Land_Cover_L48`), native 30 m Albers pixels | 2023 | Public domain |
| Thermal inventory | The Yellowstone Research Coordination Network's feature database, full export through its "Download Results to Spreadsheet" button (`rcn.montana.edu/Features/Search.aspx`) | fetched 2026-09-24 | See below |
| Feature names | USGS GNIS domestic names, WY, MT and ID | 2026-08-28 | Public domain |
| Geyser eruption data | NPS, "Yellowstone Geysers: Eruption Data", `nps.gov/yell/planyourvisit/geyser-activity.htm`, typed into `build_thermal.py` | 2025-04-18 | Public domain |
| Feature sizes | NPS place pages for Grand Prismatic Spring and Excelsior Geyser Crater, cited in `build_thermal.py` | | Public domain |
| Roads, boardwalks | NPS Public Roads and NPS Public Trails national datasets, `UNITCODE='YELL'`, from `mapservices.nps.gov` | fetched 2026-09-24 | Public domain |
| Roads outside the park | US Census TIGER/Line 2025 roads for Park and Teton WY, Gallatin and Park MT, Fremont ID | 2025-09-22 | Public domain |

No OpenStreetMap data is used anywhere.

**The thermal inventory's licence.** The National Park Service's own
thermal inventory, the roughly 10 000 feature database the plan names, is
not published as a download: NPS IRMA DataStore has reports about it but
no geospatial release, and the one public service that looked like it
(the Wyoming State Geological Survey's YVO thermal map service) returns
names without geometry. The only public copy with positions is the RCN
database at Montana State University, which carries the park inventory's
ids (`NHSP095` and so on), positions and types, with the provider
recorded per record: 9 912 rows "Park", 125 "USGS", 130 "Participant".
The site states no licence. The positions and types are facts from a
federal survey, which are not copyrightable, and the park and USGS
records are US Government works; but the compilation is hosted by a
university without terms. That is weaker than "public domain" and the
owner should decide whether it is acceptable before the data is served
publicly. If it is not, GNIS alone still names 279 springs and geysers in
the extent, the famous ones among them, and the rest would go.

## Tile grid, as built

Contract rules, plus what the contract left open:

- Level 0 samples are at world x, z = -50000 + 30 k. 100 km is 3333.3
  cells, so x = 50000 falls between two samples; the last sample inside
  the extent is 49990.
- Tiles per axis for levels 0 to 5: 14, 7, 4, 2, 1, 1. The last row and
  column reach past 50000, to 57520 at levels 0 and 1, 72880 at 2 to 4,
  and 195760 at 5. The ground there is real 3DEP out to 74800. Past that
  only the level 5 tile has samples, and they repeat the edge.
- Level 0 also has 64 samples of real ground below -50000, so the first
  sample of every level is filtered from measured ground, not a repeated
  edge.
- Levels: a level L+1 sample sits on every other level L sample and is
  `(sum of w_i w_j v_ij + 8) // 16` over the 3 by 3 level L codes around
  it, w = (1, 2, 1). It is computed on the Uint16 codes, so it is exact.
- Hero tiles: i 6 to 11, j 18 to 27, 60 tiles, x -34640 to -19280 and
  z -3920 to 21680. That is Madison Junction in the north, Lower, Midway
  and Upper Geyser Basins, the Firehole between them, Biscuit and Black
  Sand basins, and 3.7 km south of Old Faithful. Every third hero sample
  lands on a level 0 sample.
- Encoded range: ground in the extent runs from 1562.2 m (the
  Yellowstone River below Gardiner) to 3607.7 m (Overlook Mountain in the
  Absarokas, outside the park's east edge but inside the extent), codes
  3622 to 24077.

**Why 1/3 arc second for level 0.** The plan named 1 arc second. Built
that way, the level 0 ground and the hero ground disagreed by 1.3 m on
average with a p99 of 13.8 m, far more than resampling explains, and a
least squares fit of the difference against the slope said the two were
displaced. A direct search over shifts found level 0 matched the hero
tiles best shifted by 7 m west and 10 m south, mean difference 0.72 m
there against 1.34 m unshifted. That is one 1/3 arc second pixel, 7.3 m
by 10.3 m at this latitude. To tell which product was out, both were
compared with NHD's Yellowstone Lake shoreline around West Thumb (3DEP
flattens mapped water, so the flat area is a shoreline independent of the
DEM's slopes): the 1/3 arc second lake matched NHD within 5 m, the 1 arc
second one best with NHD moved 20 m south (at 30 m pixels, so 15 m of
that is quantisation). So the 1 arc second product carries the shift.
With both levels from 1/3 arc second, hero against level 0 is 0.20 m
median, 2.1 m p99, and the best shift is zero.

A first mosaic with `rasterio.merge(bounds=...)` also moved the ground by
up to a pixel, since it starts its grid at the bounds rather than on the
source pixels. `build_dem.py` warps each source tile straight into the
destination instead, cropped 3 of its 6 overlap pixels so no sample comes
from a footprint cut by a tile edge.

## Files

### Elevation, `L/i_j.bin` and `hero/i_j.bin`

Per the contract: 257 by 257 little endian Uint16, x fastest, value
`round((elevation - 2200 + 1000) * 10)`.

### `landcover/L/i_j.bin`, L = 0, 1

257 by 257 Uint8 NLCD 2021 class codes on the same samples as elevation
level L: 11 open water, 12 ice and snow, 21 to 24 developed, 31 barren,
41 deciduous, 42 evergreen, 43 mixed forest, 52 shrub, 71 grassland, 81
pasture, 82 crops, 90 woody wetland, 95 herbaceous wetland. Level 0 takes
the pixel under each sample; level 1 the most common class in the 60 m
square around it. There is no no data code: the whole grid is covered.
Inside the extent: 47 percent shrub, 40 percent evergreen forest, 4 percent
water, 4 percent grassland.

### `hydro.json`

    {
      "frame": "...",
      "source": "...",
      "rivers": [{"name": "Firehole River" | null, "points": [[x, z], ...], "width": [m, ...]}],
      "lakes": [{"name": "Yellowstone Lake" | null, "y": 158.1, "area": m2, "samples": n,
                 "rings": [[[x, z], ...], ...]}]
    }

- Rivers: 1 646 polylines, 76 149 vertices, 279 named streams, clipped to
  the extent and simplified to 5 m. Kept: every named stream, and
  perennial streams of Strahler order 2 and up; river centrelines
  through mapped river areas and marshes; not the paths NHD draws
  through lakes. Lines of one name are merged where they join end to
  end, so a river is a few long polylines (the Yellowstone is two, above
  and below the lake, 138 km together).
- Width: NHD publishes none. Where a river is mapped as an area polygon
  the width at a vertex is twice its distance to the bank; elsewhere it
  is by Strahler order, 1.5, 3, 6, 12, 20, 35, 50, 70 m for orders 1 to
  8, an estimate. Median widths: Yellowstone 37 m, Madison 35 m, Firehole
  12 m, Gibbon 20 m, Lamar 20 m, Gardner 12 m.
- Lakes: 328, lakes and reservoirs of a hectare and more plus every named
  one, simplified to 5 m. `rings[0]` is the outline and any others are
  islands. `y` is the median level 0 ground inside the polygon. 3DEP
  flattens mapped water, and the ground inside every large lake is
  exactly `y` (checked for the six largest, p1 to p99 of ground minus y
  is 0.00 m 60 m in from the shore), so a water surface drawn at `y`
  coincides with the ground and has to be lifted or cut in.
- Surfaces against published values: Yellowstone Lake 2358.1 m (7733 ft,
  2357 m), Shoshone 2375.7 (2375), Lewis 2371.5 (2371), Heart 2272.6
  (2271).

### `thermal.json`

    {
      "kinds": ["geyser", "hot spring", "pool", "fumarole", "mudpot", "terrace"],
      "colours": {...}, "units": {...}, "eruptions": {"source": url, "date": "2025-04-18"},
      "features": [{
        "id": "NBB160", "name": "Steamboat Geyser", "kind": "geyser", "reported": true,
        "x": -16494.4, "z": -11298.2, "radius": 1.5, "source": "rcn",
        "colour": "yellow", "temp": 71.3, "ph": 4.76,
        "interval": null, "duration": [600, 600], "height": [90, 90], "note": "..."
      }]
    }

- 9 654 features: 9 534 from the inventory inside the extent (of 9 867
  records with a position) and 120 named GNIS springs within 300 m of an
  inventory feature that the inventory does not name. `id` is the
  inventory id, `RCN:<name>` for the few inventory records without one
  (Old Faithful is `RCN:Old Faithful Geyser`), or `GNIS:<feature id>`.
- `kind`: the inventory's type where it recorded one (`reported: true`,
  1 214 features); otherwise from the name (Geyser, Pool, Crater, Mud,
  Paint Pot, Fumarole, Vent, Terrace, Spring); otherwise "hot spring".
  Every spring at Mammoth Hot Springs (inventory ids MA...) is "terrace".
  Counts: hot spring 9 121, geyser 274, pool 93, terrace 85, fumarole
  53, mudpot 28. Most "hot spring" features are defaults: treat
  `reported: false` as "a thermal feature of unknown type".
- `radius`: no size is published for almost any feature, so it is 1.5 m
  for a geyser or spring, 4 m pool, 1 m fumarole, 2 m mudpot, 5 m
  terrace, except Grand Prismatic Spring 40 m (NPS: 200 to 330 ft across)
  and Excelsior Geyser Crater 38 m (NPS: 200 by 300 ft).
- `colour`, on 8 287 features: from the hottest recorded temperature and
  its pH. acid below pH 3.5; blue at 73 C and over; yellow 60 to 73;
  orange 40 to 60; brown below 40. Grand Prismatic's only record is 23 C
  (taken at its margin), so it is set blue from the NPS description.
- `temp` (C) and `ph` from that same record, where measured.
- Geysers with NPS published eruption data (22, among them Old Faithful,
  Castle, Grand, Daisy, Riverside, Great Fountain, Beehive, Steamboat):
  `interval` and `duration` as [min, max] seconds, `height` [min, max]
  metres, `note` the NPS wording. `interval` is null for geysers the NPS
  lists as irregular with no range, or dormant. Old Faithful: interval
  [3480, 6240] (94 or 68 min, plus or minus 10), duration [90, 300].
- Placement against the contract's landmarks: Old Faithful Geyser 28 m
  from its landmark, Grand Prismatic Spring 6 m.

### `roads.json`

    {"lines": [{"kind": "road" | "boardwalk" | "path", "name": ..., "class": ..., "width": m,
                "points": [[x, z], ...]}]}

2 827 lines: NPS roads (classes Primary, Secondary, Local, Service,
Private, 4WD), boardwalks (NPS trails with a wood surface, 188 lines,
16.4 km) and paved paths (asphalt or concrete trails, 13 km), and TIGER
primary, secondary and local roads outside the park (TIGER lines within
25 m of an NPS road for 80 percent of their length are dropped as the
same road, 504 of them). Widths are estimates by class: 7.5 m for the
park's Secondary roads (the Grand Loop), 6 m local, 4 m service, 2.4 m
boardwalk, 2.5 m path, 7 to 11 m for TIGER roads.

### `manifest.json`

The frame, the encoding, each level's cell, tile size and tile count, the
hero set as [i, j] pairs, the land cover levels, feature counts, every
source with URL, dates, size, sha256 and licence, and a sha256 for each of
the 575 data files.

## Checks

`validate.py` re-reads the whole folder. Its output for this build:

    ok   file set: 575 files, sizes
    ok   elevation tiles: range, shared edges
         L0 196 tiles, 364 shared edges, extent 1562.2 .. 3607.7 m
         L1 49 tiles, 84 shared edges, extent 1563.3 .. 3596.9 m
         L2 16 tiles, 24 shared edges, extent 1566.1 .. 3580.4 m
         L3 4 tiles, 4 shared edges, extent 1570.5 .. 3550.3 m
         L4 1 tiles, 0 shared edges, extent 1574.9 .. 3469.2 m
         L5 1 tiles, 0 shared edges, extent 1587.8 .. 3373.3 m
    ok   levels: L+1 is the integer tent average of L, tolerance 0 dm
         L1 vs L0: 3207681 samples, max tent error 0 dm, coincident sample moved by the filter p50 0.50 m p99 4.90 m
         L2 vs L1: 801025 samples, max tent error 0 dm, coincident sample moved by the filter p50 1.00 m p99 10.10 m
         L3 vs L2: 261121 samples, max tent error 0 dm, coincident sample moved by the filter p50 2.60 m p99 22.50 m
         L4 vs L3: 65025 samples, max tent error 0 dm, coincident sample moved by the filter p50 5.50 m p99 44.80 m
         L5 vs L4: 16129 samples, max tent error 0 dm, coincident sample moved by the filter p50 10.50 m p99 82.07 m
    ok   hero tiles: 60 tiles, 104 shared edges, 2058.6 .. 2667.3 m, vs level 0 |diff| median 0.20 m p99 2.10 m max 24.30 m
    ok   spot elevations
         Old Faithful: 2247.4 m, published 2240 m, off +7.4 m (tolerance 15)
         Mount Washburn summit: 3120.1 m, published 3122 m, off -1.9 m (tolerance 10)
         Yellowstone Lake surface: 2358.1 m, published 2357 m, off +1.1 m (tolerance 3)
         Mammoth: 1904.3 m, published 1900 m, off +4.3 m (tolerance 20)
    ok   landcover: NLCD classes, shared edges
    ok   hydro.json: 1646 rivers, 328 lakes, named rivers present, Yellowstone Lake at 2358.1 m
    ok   thermal.json: 9654 features, Old Faithful Geyser 28 m from its landmark, Grand Prismatic Spring 6 m from its landmark
    ok   roads.json: 2827 lines, kinds ['boardwalk', 'path', 'road'], boardwalks at the landmarks
    ok   manifest.json: 575 checksums match, 8 sources with dates and licences
    ALL CHECKS PASSED

- The level check has zero tolerance because the levels are defined in
  integers; flipping one bit of one level 1 tile made it fail
  ("1 of 3207681 samples differ ... worst 1 dm").
- The ground range allowed in the extent is 1500 to 3700 m. The first
  bound was 3600, set from the park's highest point, and failed on
  Overlook Mountain, which is outside the park but inside the extent.
- Hero against level 0 is held to a median of 1 m and a p99 of 10 m;
  the 24.3 m maximum is one sample on a 68 degree cliff in the Madison
  canyon west of Madison Junction, where 30 m and 10 m sampling differ.
- Spot tolerances: 15 m at Old Faithful (a sinter mound on a 10 m grid,
  and a published figure given to the nearest ten), 10 m for the highest
  ground within 100 m of Mount Washburn's GNIS summit, 3 m for the lake,
  20 m for Mammoth (a village on a slope).
- `preview.py` rendered a level 3 hillshade with the lakes and major
  rivers, and the thermal features over level 2. The lake with its
  thumbs, Shoshone, Lewis and Heart lakes, the canyon cutting north east
  from Canyon, the flat caldera floor against the Absarokas and the
  Gallatins, and the chain of basins down the Firehole were all where
  they belong. The pictures were deleted after.
