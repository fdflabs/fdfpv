# The Interior: the world (track WORLD, Phase 0)

What the map, the canopy and the routes are, how they are built, what
the room and the screens call, and where the land made MISSIONS.md 1.9's
layout move. Written 2026-10-05 as Phase 0's WORLD track landed.

## 1. What is real and what is invented

- **Real:** the ground (ANADEM v1 bare earth, 30 m, CC BY 4.0) and the
  land cover (ESA WorldCover 2021, 10 m, CC BY 4.0) of a 23 km square of
  northern ranch land, cropland, gallery forest and a forest block on a
  river of about 450 to 1150 km2 of catchment. The river's line is the
  land's own (a D8 flow over the bare earth, its bed traced again on the
  30 m grid by a least cost path), and so are the streams. The square was
  picked by a scored search (tools/interior/source.py says how) and is
  turned half a turn before anything is written.
- **Invented:** every name (BIBLE.md 2.2 only), road, building, bridge,
  clearing, camp, route and person. The ground is coloured from the land
  cover classes, **never from satellite imagery**: a 10 m picture shows
  the source's real roads and farmsteads, which the owner's rule forbids
  and which would let anyone lay the map over the land.
- **Where the source is written:** `tools/interior/source.py`, and
  nowhere else. `npm run lint:interior-names` fails a real place name or
  a coordinate in any other file of the Interior's, and a name in
  places.js that is not on BIBLE.md 2.2's list.
- **Credits:** the strings `credits.in_anadem` and `credits.in_worldcover`
  (en, es) and NOTICE. `src/ui/credits.js` is track VIEW's: it needs the
  two keys added to the Itaipu card's list (one line).

## 2. Frames

- **Scene frame** (everything inside the Interior's modules, as every
  map): metres, x east, z south, y up, the origin the middle of the
  played square. `src/share/interior/frame.js`.
- **Ops frame** (what the room calls, CONTRACT-P0.md section 1):
  `src/render/frame.js`'s document frame, x east, y north, z up, the same
  origin. `src/share/interior/ops.js` turns between them with frame.js's
  own `docPosToThree` and `threePosToDoc`.
- **Design grid** (MISSIONS.md 1.9, authoring only): km east and north
  of the played square's south west corner, which is 8000 m west and
  8000 m south of the origin. In the ops frame a grid point (e, n) is
  `[e * 1000 - 8000, n * 1000 - 8000]`: mission data's `ORIGIN` is
  **[8000, 8000]** (ops.js `ORIGIN`).

## 3. The shared data (src/share/interior/)

| File | What | Size |
| --- | --- | --- |
| `height.bin` | the ground, 769 x 769 Uint16, 30 m, over [-11520, 11520], the terrain engine's encoding | 1.18 MB |
| `land.bin` | the land cover, 2304 x 2304 classes, 10 m, run length coded | 318 kB |
| `hydro.js` | Río Sereno (line, width, water level) and 57 streams, generated | 141 kB |
| `frame.js` | the frame, the grids, design grid to world | |
| `world.js` | `makeWorld({ height, land, edits })` -> `groundAt(x, z)`, `landAt(x, z)`; `fetchWorldBytes()` | |
| `node.js` | `readWorldBytes()` for the room and the checks (no fs import in a browser) | |
| `places.js` | every place, road, bridge, building, opening and land edit | |
| `canopy.js` | the trees and the line of sight | |
| `routes.js` | every route and `poseOnRoute` | |
| `clock.js` | Mission 1's hours on the room clock | |
| `ops.js` | the room's world (section 4) | |

The ground the room reads is the ground the screen draws: the terrain's
level 0 tiles are cut from `height.bin` in memory (src/maps/interior/
terrain.js) and `groundAt` reads the engine's own two triangles a cell.
No data repository was needed: the whole shared ground is under 2 MB and
the room has to read it from `src/` anyway (the Node VM deploys `src/`).

Rebuild: `cd tools/interior && uv run python fetch.py && uv run python
build.py` (58 s, 0.8 GB peak resident, measured with /usr/bin/time; data
folder `~/Desktop/fdfpv-loop/interior/data`, never committed).

## 4. Interfaces for ROOM and VIEW

**ROOM** (ops frame, pure, deterministic, Node and browser):

```js
import { readWorldBytes } from 'src/share/interior/node.js';   // room
import { makeOpsWorld, ORIGIN } from 'src/share/interior/ops.js';
const world = makeOpsWorld(readWorldBytes());   // a browser: await fetchWorldBytes()
world.canopyBlocks(from, to)     // [x, y, z] ops, metres -> boolean
world.canopyLos(from, to)        // -> 'blocked' | 'gap' | 'open' (TECH-NEEDS N2's three states)
world.poseOnRoute(routeId, ms)   // ms since the contact started the route
                                 // -> { x, y, z, heading, action } ops, or null once a 'gone' route ends
world.groundAt(x, y)             // ground height z at ops (x, y)
```

`canopyBlocks` costs about 11 us a line (scripts/canopy-los.js). Routes'
ids are the mission data's (conceal-{west,mid,east}-{a,b} and -alt-{a,b},
camp-<id>-loop, camp-tarp-move and -s1/-s2/-s3 for the mark's dial,
out-{n,e,s,w}-{a,b}, pair-out-{a,b}, bravo-moto) plus colonia-civ-1..4 and
colonia-pickup. Actions: walk, stand, lookUp, carryLong, sit, crouchTarp,
takeDownAntenna, pushMotorcycle, drive, park. Named points along the
concealment routes: routes.js `CONCEAL_POINTS` (forest-edge, gap1,
path-crossing, clearing, gap2, opening, camp-edge) and `ALT_POINTS`; the
places' positions are places.js `PLACES`, `CAMP_PROPS`.

Mission 1's clock: clock.js `M1_CLOCK = { startHour: 16.667, sunsetHour:
18.2446, rate: 2.95 }` (hours of day per hour of room: the sun sets 32
minutes into the mission), `localHour(clock, startedMs, roomMs)`,
`sunsetMs(clock)`.

**VIEW** (the map instance, scene frame):

- `map.setLocalTime(hours)` moves the sun (src/maps/interior/look.js);
  `?hour=` in the address builds the map at that hour (default 16:40).
- `map.canopyAt(x, z)` the highest crown over a point.
- `map.scene.userData.interior` = `{ terrain, look, world, canopy, trees,
  built, colliders }` for the checks.
- Figures, vehicles and camp props (`src/render/interior/`) are the
  second WORLD PR.

## 5. Where the land moved MISSIONS.md 1.9's layout

The river runs where the land runs it, so the places on it moved to it.
Positions in design grid km (1.9's, then here):

| Place | 1.9 | Here | Why |
| --- | --- | --- | --- |
| Puente Doble | 5.6, 7.0 | 5.60, 7.74 | the river crosses x 5.6 at 7.73 |
| Colonia Arroyo Manso | 7.5 to 9.5, 6.5 to 8.5 | 9.35, 6.18 (8.95 to 9.85 along its road) | 1.9's box is half river; the colonia stands on the real creek named Arroyo Manso, south of the river |
| the schoolteacher's house | 8.9, 7.9 | 9.43, 6.36 | on Arroyo Manso |
| the river crossing at the colonia | | 8.86, 6.13 | a causeway where the colonia's road crosses Arroyo Manso |
| ANOMALY_CORRIDOR | 9.6 to 10.6, 8.2 to 9.0 | 8.7 to 9.6, 7.95 to 8.95 | the open grass strip north of the river where Sector Bravo meets the forest |
| the cañada | 11.9, 9.4 to 12.1, 10.2 | the grass strip along the creek at 9.0 to 9.4, 8.0 to 10.6 | a real open drainage strip in the forest, east of the routes |
| Claro Viejo | 11.9, 10.5 | 8.58, 9.46 | 0.84 to 0.91 km of walking from the corridor (lead's decision of 5 Oct), in the forest west of the cañada |
| concealment routes | 10.8, 9.1 to 11.8, 10.4, "about 800 m" | 9.00, 8.72 to 8.59, 9.43: west 896 m, mid 833 m, east 914 m | as above |
| Sector Charlie | 9.5 to 12, 8.5 to 9.5 | the forest from the cañada west, about 8.0 to 9.4, 8.3 to 10 | it holds the corridor, the routes and the camp |

Missions 2 to 5 place their own places when they are built; Senda del
Vigía, Rincón Quemado and the rest of 1.9 should be laid out again from
Claro Viejo's new place then (Rincón Quemado is "near Claro Viejo").

## 6. The canopy

One tree at most per 8 m square, its place, crown and height hashed from
the square's indices; its land class read a few metres off its trunk so a
forest edge is ragged. Forest 93 % of squares, lone trees and palms in
pasture, palms in marsh. Crowns are ellipsoids 7 to 12 m across and 0.42
of the tree deep, the forest 9 to 23 m tall on a value noise. Openings
(places.js `OPENINGS`): the camp's clearing (30 m), each route's two gaps
(7 to 9 m) and clearing (16 to 18 m), the narrow opening, the old logging
cut (the path crossing), the camp's access path, every road. The drawn
trees are these trees: near (300 m) an 80 face crown and a trunk, mid
(1200 m) a 20 face crown, far (7.5 km) one point a 16 m square.

`npm run canopy:los` (and `-- --browser`): under the crowns blocked from
58 or more of 60 orbit poses and from every pose at 75 degrees and over;
gaps open overhead, mostly hidden at 30 degrees; clearings open at 60 and
over; the camp open at 45 and over; Node and page digests equal; the
drawn crowns agree with `canopyBlocks` on 98.4 % of 3000 lines and every
disagreement is within 0.6 m of a crown's skin.

## 7. Budget (interior:views, High, RTX 3060 Ti)

Survey views (600 to 1800 m) 37 to 68 calls, 0.12 to 0.36 M triangles;
the camp orbit at the standoff (700 m out, 450 m up) 45 to 55 calls, 1.1
to 1.4 M; low views to 87 calls and 2.2 M (over the camp at 60 m). The
budget is 300 calls and 2.5 M triangles; the GPU's least frame 1.3 to 4.5
ms (12 ms allowed).

## 8. Found while building (stale in the plan or the brief)

- The brief said `canopyBlocks` takes Z up points; the room's own
  convention became the document frame (CONTRACT-P0.md), which is Z up
  but north positive: ops.js serves it. Inside the map the frame is the
  scene's, as every map's.
- TECH-NEEDS N2 names `visible(from, point)` with three states; served as
  `canopyLos`, beside the boolean `canopyBlocks`.
- Registering a map takes an entry in `src/maps/build-cost.js` as well as
  `registry.js` (boot.js refuses an id MAP_BUILD_MS does not name).
- Itaipu's sky shows thin dark dashes at the horizon from altitude
  (seen in its own round 4 renders too): shared, not fixed here.
- Phase 0's route lengths: MISSIONS.md 1.9's "about 800 m" against grid
  points 1.6 km apart; authored at 0.83 to 0.91 km (the lead's call).
