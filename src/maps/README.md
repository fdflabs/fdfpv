# Maps

Several worlds, one shell. `src/render/shell.js` owns everything that outlives a
map: the renderer, the canvas, the camera and the airframe. A map owns its
scene, its post chain, its colliders and its contact data, and disposes all of
it when it is swapped out. That split is what keeps only one map's render
targets alive at a time, which is what keeps P5's 120 MB budget meaningful.

`registry.js` is the only place a map is named, and its loaders are dynamic
`import()`. That is not style: a static import of the Swiss valley would
fetch its whole graph at boot for a player who only ever flies the Alps.
`tests/lib/checks.js` check 16 measures it.

The worlds are the Alps, the Swiss valley and Yellowstone. The freestyle city
(Sakura City, 59 vendored MIT files) and the airfield were retired on
2026-09-28 on the owner's ask ("leave only alps and swiss"), and Industrial
bando, Municipal baths and Bardwell's yard before them on 2026-08-30. All of
them are in the history. `retired.js` names the retired ids and where a
stored setting or a link that names one goes, so a pilot is told rather
than quietly moved.

## The contract a map module must satisfy

    export async function buildMap(shell, onProgress, options) -> MapInstance

`shell` is `{ renderer, camera, canvas, pixelRatio, quad, discs, resize }`.
`onProgress(fraction)` is optional and drives the loading screen's world stage.
`options` is optional. `options.quality` is `'low' | 'medium' | 'high'` and
selects the graphics preset in `src/render/quality.js`. The instance stamps
`graphics` with the resolved id.

A MapInstance is:

    id            'alps' | 'swiss2' | 'yellowstone'
    name          what the menu shows
    mode          'race' | 'freestyle'
    graphics      'low' | 'medium' | 'high'
    scene         THREE.Scene, with shell.quad added to it
    post          { render(), setSize(w, h) }
    colliders     a built src/game/collide.js Colliders
    gates         array, EMPTY on a freestyle map and that is a real state
    curve         the racing line, or null
    spawn         { x, z, yaw }
    spawnFor(spawn, kind, wish)   optional: the start for 'plane', 'quad'
                  or 'float' and the page's ?spawn=, given `spawn`, which
                  it hands back when it is a course's start (itaipu/spawns.js)
    attract       { path, speed, lookAhead, aimDrop } for the title camera
    height(x, z, fromY)   the contact surface
    setNextGate(sceneIndex)
    updateShadowFocus(target)
    updateWind(t, quadPos, wash)
    updateAnim(stepIndex)
    sweepSolids(fromStep, toStep)   a map with moving boxes only
    dispose()
    stats()       optional, harness only

### `height(x, z, fromY)` is three arguments, and the third one is the point

`fromY` is the height the query is made FROM. A platform is only offered if it
is within a step of it, so a quad above a roof lands on it and a quad under
the eaves sees the ground. A map with one ground surface ignores the
argument; it takes it anyway so `main.js` has one call shape.

### Roofs on alps and swiss2

Every roof a map draws is ground (`alps/roofs.js`). A roof is recorded as
its drawn upper faces: a roof shell a village frame puts, a lean-to, the
bus shelter, a gondola station's slabs, a spire, a dormer, a garden shed,
a hut, a boathouse, the lake hamlet's houses and church, the ticket hut on
the landing stage. `height(x, z, fromY)` offers the highest roof
within the same 0.55 m step of `fromY` as a deck, so the plant's own ground
contact lands, slides and bounces a craft on a pitched roof as on a
hillside, and a craft under the eaves still sees the street.

The walls under a roof stay walls: the walls up to the plate and a thin
wall under each gable, in axis aligned boxes held into the shell and never
over its upper face, with the building's old keep out box noted as its
footprint so nothing placed round it moved, and none noted for a building
that never had one. A building's other solid parts, noted by its builder
in its own frame, are walls too: the bus shelter's three walls, a
lean-to's posts, a woodshed's walls and wood, a spire's inside (its faces
are too steep to be ground a fast craft meets level), and chimneys. The
balconies are not: a box against a wall's face made an inside corner a
wreck was pushed out of into the wall. The attic is left empty; the roof shell over
it is ground the plant keeps a craft out of from above.

While a roof is the craft's ground, `cover(x, z, fromY)` lets the obstacle
sweep through that roof's solids, because the sweep's ellipsoid grows to a
wing's half span as it banks onto the slope and would reach them through
the shell. A chimney stands on the roof and stays solid. A craft within a
metre of a roof's edge, with no roof over it and not more than half a
metre under the edge's level, has what stands under that roof's eaves let
through (the walls up to the plate and the posts, not the gables): coming
in over short eaves its ellipsoid meets them before it is over the roof.

`surfaceAt(x, z, y)` takes the ground height too, so the crash physics
reads the covering where the ground is a roof. The module has no tile,
slate or shingle of its own, so each covering is the nearest surface it
has, and with the damage mode on its friction and restitution are that
surface's (docs/CRASH-STAGE1.md, section 5); with it off every ground,
roofs included, is the shell's grass, as it always was.

| Covering (bake key) | Surface | mu | e | Why |
| --- | --- | --- | --- | --- |
| larch shingle (`shingle*`) | wood | 0.50 | 0.12 | wood on wood, oak dry, sliding 0.32 across the grain to 0.48 along it, static 0.54 to 0.62 [1] |
| slate, eternit (`slate*`) | rock | 0.42 | 0.15 | wood on stone 0.2 to 0.4, nylon on steel 0.4 [1]; slate is a rock and fibre cement board its class |
| standing seam (`hangarRoof`), tin (`tin*`) | metal | 0.35 | 0.20 | polystyrene on steel 0.3 to 0.35, nylon on steel 0.4 [1] |
| clay tile (`tile`: the lake hamlet's red roofs) | rock | 0.42 | 0.15 | fired clay is a ceramic, and rock is the module's one hard mineral surface |

The lake hamlet's roofs are read off the colour they are drawn in (red is
tile, grey slate, brown shingle); the huts' off the draw that chose it.

A wheel rolls on a roof at the hard face value of R-ROLLING in
docs/CRASH-REFERENCES.md (concrete and asphalt 0.02 to 0.05 against short
grass 0.05 [2]), which `plant_wheel_roll` gives wood, rock and metal alike.

A covering of its own (a `SIM_SURF_TILE`, `SIM_SURF_SLATE`,
`SIM_SURF_SHINGLE` with their own mu, e, stiffness and blade hardness in
`src/native/crash.c`'s table and in `plant_wheel_roll`, and the names in
`configs/parts.js`) is a core change, additive to the ABI, and is not made
here.

[1] Engineering ToolBox, Friction and Friction Coefficients,
https://www.engineeringtoolbox.com/friction-coefficients-d_778.html : "Oak,
Oak (parallel grain), Clean and Dry, 0.62, 0.48"; "Oak (cross grain) 0.54,
0.32"; "Wood, Stone, Clean and Dry, 0.2 - 0.4"; "Nylon, Steel, 0.4";
"Polystyrene, Steel, 0.3 - 0.35".
[2] Marchman, Aerodynamics and Aircraft Performance, 3rd ed., Table 7.1, as
quoted under R-ROLLING.

### `updateAnim(stepIndex)` takes an integer step count, not a delta

Anything a map animates that a craft can HIT must be a pure function of the
fixed step count, or the geometry becomes a function of the frame rate and a
dropped frame changes the trajectory from the scenery side. During a run the
step count is the physics clock, so a collision is reproducible from a
recorded input stream. `alps/life.js` is the worked example: its vehicles
and its gondola are pure functions of the step count. The rule
was learned on the retired city's level crossing, whose booms were an
integrator over raw frame time.

A pure function of the step count is not enough on its own: it also has to
be read at a step. `updateAnim` runs once a drawn frame, so a moving box it
places has the pose of the last frame's end and a sweep one frame long, and
the shell's contact pass, which runs every 4 ms of sim time, met a car where
the frame boundary had left it. A map with moving boxes therefore also has
`sweepSolids(fromStep, toStep)`, which puts every moving box where it is at
`toStep`, swept from where it was at `fromStep`; the contact pass calls it
with the ends of its own stretch before it sweeps, and throws if a map with
moving boxes has none. `scripts/traffic-check.js` holds it to that: a car
striking a wreck on the Swiss valley's road, at three pacings of the frames,
gives one step trace.

### Renderer state belongs to the map

Two maps can want different shadow filtering and different clear colours, and
a map that silently inherits the other one's renderer state is a defect that
only shows up on the second map you load. Set what you need at the top of
`buildMap`.
