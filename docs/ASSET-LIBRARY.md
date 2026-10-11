# The asset library

The owner, 2026-10-08: "make it so like the trees you design are now our
assets that can be redeployed on other maps". This file is the catalogue
of the world's asset families: where each one is built today, which maps
use it, and the contract an asset in the library keeps. The code lives in
`src/render/library/`, one module per family, and a map places an asset by
importing it from there, never from another map's folder.

## Why a library, and why it starts small

Much of the world is already shared, but through other maps' folders:
Itaipu grows its trees with the Swiss valley's broadleaf generator and
impostors, the Interior lights its points with Itaipu's `makeLit` and
grows its near grass from the Swiss valley's atlas, and the Swiss valley is
built on the Alps' kit, roofs and noise. Moving a family into the library
makes that sharing deliberate (a contract, a golden, a perf budget) and
makes an improvement to it land on every map that uses it at once.

A family moves one PR at a time, with ZERO visual or gameplay change,
proved by:

1. a render golden of the family's output (`tests/browser/render-golden/`),
   recorded from the untouched code and committed BEFORE the move, then run
   unchanged after it (`npm run render:golden`);
2. the gameplay checks that read the family (for trees `canopy:los`,
   `interior:collide`, `people:route`; for Itaipu `itaipu:collide`; for the
   Swiss valley `check:colliders`) green in CI;
3. where pixels matter, the map's views rendered before and after and
   compared.

A family whose maps build it by different techniques is not forced into
one module. It enters the library as the technique one map does best,
which other maps can then take up, each as its own PR with before and
after pictures.

## The contract every library asset keeps

- **Inputs**: plain numbers and records (sizes, a seed or a per instance
  number in [0, 1), colours), plus `THREE`. No map state: no world, no
  canopy, no places, no imports from `src/maps/`. The map turns its own data
  into the asset's inputs.
- **Outputs**: geometry and materials (instanced or points where the asset
  is drawn many times), and nothing added to a scene: the map owns its
  scene graph, its tiers and its draw order.
- **Determinism**: the same inputs give the same buffers and the same
  shader text, every run. No `Math.random`, no clock.
- **Shape**: what the asset draws is held to the collision and line of
  sight shape the map reports for it, and the asset says how far apart the
  two may be. The map's own checks hold that.
- **Perf budget**: the asset's draw calls and triangles per tier, and the
  views budget it must fit (the views scripts' 300 calls, 2.5 M triangles
  and 12 ms GPU at High), measured on a quiet GPU (`nvidia-smi pmon -c 1`
  first).
- **Program cache keys** stay what they were when the asset moved: renaming
  one is a change, not a move.

## Catalogue

| Family | In the library (`src/render/library/`) | Built or placed in | Used by |
| --- | --- | --- | --- |
| Lit tree crowns (analytic ellipsoid crowns, lobes, clumps) | `crowns.js` | placed by `src/maps/interior/trees.js` | Interior |
| Seeded random and value noise | `noise.js` (was `alps/noise.js`), `hash.js` | everywhere | all four |
| Broadleaf and conifer models, leaf cards | `vegetation/species.js`, `vegetation/plantmat.js` | placed by `swiss2/vegetation/forest.js`, `itaipu/vegetation/draw.js` | Swiss valley, Itaipu |
| Tree impostors (far trees) | `vegetation/impostor.js` | baked and placed by the same two | Swiss valley, Itaipu |
| Far forest canopy surface | stays Itaipu's: its colour is Itaipu's satellite picture graded as Itaipu's ground (`FOREST_GRADE`, the ground's noise texture) so the forest's edge meets that ground unseen, over the hero square. No other map has one to give it; the Interior's far forest is crown points (`crowns.js`), the Swiss valley's impostors | `src/maps/itaipu/vegetation/draw.js` `canopyShell` | Itaipu |
| Grass and leaf atlas | `vegetation/atlas.js` | loaded by each map's vegetation | Swiss valley, Itaipu, Interior |
| Near grass, weeds, reeds and bushes as layers of crossed cards | `vegetation/cards.js` | placed by `interior/nearfield.js`. The Swiss valley's meadow (`swiss2/vegetation/grass.js`, its material reads the valley's ground paint) and Itaipu's turf (`itaipu/look/ground.js` `makeTurf`, a mesh the ground's textures displace) stay their own | Interior |
| Photographed ground layers and surfaces (terrain layer arrays; boards, render, stone, shingle, slate, asphalt, gravel, cobble, concrete, metal) | `surfaces.js` | layers blended by `swiss2/ground.js`; surfaces finished on by `swiss2.js`, `itaipu/look/index.js`, `interior/look.js`. The ground materials themselves stay each map's (`swiss2/ground.js` masks, Itaipu's satellite colour, the Interior's land cover): they are the map's data, not an asset | layers: Swiss valley; surfaces: all three photographic maps |
| Water surface (lake, pool, stream), wave texture, stream ribbons and gravel bars, planar mirror | `water/surface.js`, `water/waves.js`, `water/stream.js`, `water/mirror.js` | placed by `swiss2/water/` and `swiss2/props/` (bars); Itaipu's reservoir and river (`itaipu/water/index.js`) draw with the material, texture and mirror. The Interior's silty river and banks (`interior/ribbons.js`) and the Alps' cel water (`alps/nature.js`) stay their own | Swiss valley, Itaipu |
| Scanned rocks (boulders and stones: scans, material, colliders, levels) | `rocks.js` | placed by `swiss2/vegetation/rocks.js`; the Alps keep their cel boulders (`alps/nature.js`), the carved cliffs stay with the Swiss valley's terrain (`swiss2/rock/`) | Swiss valley |
| People and postures (instanced posed bodies, slot tints) | `people/figures.js`, `tint.js` | placed by `interior/life.js` and the hangar room (`src/render/hangarroomview.js`). The Swiss valley's café people (`swiss2/village/people.js`, built on its vehicle kit) and the Alps' cel animals (`alps/fauna.js`) stay their own | Interior, hangar room |
| Roofs as ground (records, solids under them) | `roofs.js` | used by `kit.js`, `interior/built.js`, `itaipu/town/`, `swiss2/buildings/` | all four |
| Cel building kit (chalet, barn, farmhouse, gasthof, shop, church, hangar, bridge, street furniture, fence) | `kit.js` | the Alps' village; the Swiss valley's buildings remake its builders photographically | Alps, Swiss valley |
| Buildings raised from footprints (cleaned footprint, rectangle, heights, hip, gable or flat roof as ground and faces, walls as faces and collider boxes) | `buildings/footprint.js` | Itaipu's town: its style (which roof, which colours, by bank and id) stays `itaipu/town/plan.js`, its meshes `itaipu/town/mesh.js`. The Interior's buildings (`interior/built.js`) are drawn from its own building list with its own sinks and skins and stay its own | Itaipu |
| Fences | `kit.js` `fence` (cel) | also `swiss2/village/pieces.js`, `interior/yards.js` | one each |
| Cel vehicles and the parts kit | `vehicles/vehicles.js`, `vehicles/parts.js` | the Alps' life, the Swiss valley's vehicles (which refinish them) | Alps, Swiss valley |
| Low instanced vehicles (motorcycles, pickup; paint tinted per instance) | `vehicles/instanced.js` | placed by `interior/life.js` | Interior |
| Insurgent camp (shelters and tarps, mast, fire and smoke, lookout, stores, clutter, the clearing's light) | `camp/camp.js`, `camp/camplight.js`, `camp/dressing.js` | placed by `interior/life.js` (Claro Viejo and Claro Nuevo). The Swiss valley's lakeside and roadside props (`swiss2/props/`) are its own scenery; the cel bench, fountain and sign are `kit.js`'s | Interior |
| Lit materials (one sun from the shadow cascades) | `lit.js` `makeLit` | Itaipu's look, the Interior's look and crowns | Itaipu, Interior |
| Lit materials with the Alps terrain shadow and cloud deck | stays the Swiss valley's: the terrain shadow and the cloud deck are the Alps field's 6 km square; `lit.js` is its library form (one sun, no field) | `swiss2/light.js` `makeLit` | Swiss valley |
| Photographic material kit (village, building groups and finishes, named and parts materials, metre uvs, finishScene) | `photolook.js` | the Swiss valley's builders, Itaipu's and the Interior's looks | Swiss valley, Itaipu, Interior |
| The sun and its shadow cascades | `sun.js` `makeSun` | `swiss2.js`, `itaipu/look/index.js` (the Interior has its own, `interior/look.js`) | Swiss valley, Itaipu |

The Alps keep their cel look by decision (2026-10-07). Their kit, roofs,
vehicles and noise, the base the Swiss valley is built on, are library
assets now; the Alps still place them exactly as before.

## Lit tree crowns (`src/render/library/crowns.js`)

A crown is sized by an ellipsoid, `r` across and `ry` up, and shaped by
seven lobes inside it (`crownshape.js`, one of twelve layouts): a core, a
top and five side heaps, with real gaps between them at the edge. It is
drawn as a lumpy icosahedron round the ellipsoid (or, far off, one point)
and cut in the fragment to the lobes, lit by the lobe's normal, dark under, lit and warmer on top, broken
into big lobes and, close up, clumps of leaves, rimmed by the low sun.

- **Inputs**: per crown its middle, `r`, `ry`, a colour (the map's palette)
  a seed in [0, 1) and its lobe layout (`aLobe`); per tier the hand over
  distances.
- **Outputs**: `crownGeometry(THREE, detail, lump)` the ball,
  `fitOf(geometry)` the scale that has the ball straddle the ellipsoid,
  `crownMaterial(THREE, mode, uniforms)` the material for a tier: 0 near
  balls, 1 mid balls (hand their trees to the points), 2 one point a tree,
  3 one point a block of forest. Balls are instanced (instance matrix =
  middle and radii, instance colour), points carry `position`, `color`
  and `aShape` (r, ry, seed).
- **Shape**: the drawn crown is the lobes, and a map's line of sight
  tests the same lobes (`lobesHit`, `lobesTop`), so a gap a pilot sees
  through is open to the game. Only the clumps' hollows close up go deeper,
  at most 0.58 m; `scripts/canopy-los.js --browser` draws the crowns and
  asks every pixel.
- **Perf**: one draw call a tier; 80 triangles a near crown, 20 a mid one,
  one point a far tree. The Interior's tiers fit its views' budget with the
  forest drawn (`npm run interior:views`, stats.json).
- **Golden**: `tests/browser/render-golden/interior-trees.js`.

## Leaf card trees (`src/render/library/vegetation/`)

The Swiss valley's trees, which Itaipu grows too: a tree is a variant
(`species.js` VARIANTS: spruce, fir, larch, beech, maple and a snag, in
eleven variants), built as leaf cards from the atlas round a bark trunk.

- **Inputs**: a variant (its kind, height, crown radii and seed) and a
  level of detail, 'near' or 'mid'; the materials take the atlas's maps, a
  distance band and the shared wind uniforms.
- **Outputs**: `buildVariant(variant, lod)` the foliage and bark
  geometries and the numbers a placer needs (height, crown radius, the
  crown's middle, the radius that holds it all); `plantMaterial` and
  `plantDepthMaterial` (alpha tested, dithered across the band, swaying);
  `bakeImpostors`, `impostorMaterial` and `impostorMesh` for the far trees,
  one camera facing quad a tree from 24 photographs of each variant;
  `loadAtlases` the leaf, twig and grass cards and the bark.
- **Determinism**: a variant's shape comes from its own seed
  (`noise.js` makeRng), never the clock.
- **Shape**: `crownClumps(variant)` are the spheres a crown is made of, and
  `CLUMP_REACH` how far a collider sphere reaches past them; the Swiss
  valley's colliders (`check:colliders`, `check:trees`) and Itaipu's
  (`itaipu:collide`, `check:itaipu-canopy`) are built from these.
- **Perf**: `triangles(geometry)`; the Swiss valley and Itaipu views'
  budget (300 calls, 2.5 M triangles at High).
- **Golden**: `tests/browser/render-golden/tree-models.js`.

## Scanned rocks (`src/render/library/rocks.js`)

The Swiss valley's boulders and stones: four CC0 photogrammetry scans,
each at two levels (900 and 160 triangles), with a banded standard
material that dissolves across its distance band.

- **Inputs**: rocks as records `{ x, y, z, q, s, sy, shape }` (foot,
  quaternion, size in metres, height factor, index into `SHAPES`); the
  near band's edge and fade; an environment map or null; a name for the
  meshes.
- **Outputs**: `loadRocks()` the scans, their vertices and maps;
  `rockColliders(rock, scans, ground)` a placed rock's colliders as the
  map's collider calls; `rockLevels(...)` the meshes (near scan, far scan,
  small stones), `update(camera)` that refills them from what the camera
  sees, and `dispose()`.
- **Shape**: a stone between 0.45 m and `STONE` (1.1 m) is one sphere; a
  boulder up to three capsules fitted to both its scans, the drawn rock
  at most 0.35 m outside them but at its knobs (the swept audit allows
  0.5 m). `check:collide-audit` holds it on the Swiss valley.
- **Perf**: nine draw calls (four near, four far, one for stones), refilled
  only when the camera moves 3 m or turns 2 degrees; stones cast no
  shadow. Program key `swiss2-rock`.
- **Golden**: `tests/browser/render-golden/rocks.js`, through the Swiss
  valley's `buildRocks` and `waterStones`, colliders included.

## Water (`src/render/library/water/`)

The Swiss valley's water, which Itaipu's reservoir and river use too:
three's standard material with the water spliced in (normals from a
tiling ripple texture, Fresnel at water's index, depth that clears to
the bed in the shallows, shore and rapids foam, a planar mirror).

- **Inputs**: `waterMaterial(options)` takes the wave texture, shared
  `time` and `wind` uniforms, the body's colours, clarity, ripple,
  roughness, and optionally a mirror, a wave field (`lakewaves.js`), a
  depth patch, a boat's wake and an inflow; `bedMaterial(options, absorb)`
  the same with the water's absorption per metre. `streamGeometry(pts,
  width, groundAt, lift)` and `gravelBarGeometry(pts, width, groundAt,
  rng)` take a line in flow order and the map's ground.
  `planarMirror(level, scale)` a water level and a resolution share.
- **Outputs**: materials (uniforms on `userData.water`), geometries with
  `aWater` (depth, distance along, position across, bed slope) and
  `aFlow`, the mirror's texture, matrix and `render(renderer, scene,
  camera, hide, bounds)`.
- **Needs**: still water reads `s2Sun`, the sun term the Swiss valley's
  lit injection (`swiss2/light.js` makeLit) declares; a map without that
  light declares it itself (Itaipu's water: `const float s2Sun = 1.0;`,
  its sun reaching the water past nothing but the shadow maps). Running
  water does not read it.
- **Shape**: `streamSurface(pts, groundAt, lift)` is the drawn stream's
  centre line, which the Swiss valley hands the plant as its river, so
  the water a craft floats on is the water drawn (`river:check`).
- **Perf**: one draw a sheet; the mirror is one more scene draw a frame
  on High and Medium, scissored to the texels the water reads
  (`perf-mirror-check.js`). Program keys `swiss2-water-*`.
- **Golden**: `tests/browser/render-golden/water.js`.

## Card layers (`src/render/library/vegetation/cards.js`)

The Interior's near field: grass, weeds and reeds from the grass atlas
and bushes from the foliage atlas, three cards crossed a clump, one
instanced mesh a layer, refilled from tiles round the camera.

- **Inputs**: `cardLayer(THREE, { atlas, regions, cap, radius, tip,
  tints, name, rough })`: the atlas, its uv rectangles, the most cards,
  the reach, how far the normals lean to the cards, the tints (linear
  multipliers), a name, the roughness. Cards are `STRIDE` floats: foot,
  yaw, height, width, region, tint.
- **Outputs**: `{ mesh, fill(tiles), uniforms, dispose() }`; `fill` takes
  the map's tiles (Float32Arrays of cards) and returns how many it drew;
  `uniforms.uNfReach` the inner and outer edge the clumps grow in and
  shrink out over.
- **Shape**: none; cards are not collided. The Interior keeps them under
  a person's chest along its routes, so they hide no one the room calls
  seen (`canopy:los`, `people:route`).
- **Perf**: one draw a layer, 6 triangles a clump; the Interior's four
  layers at High hold up to 146 000 clumps and draw only while the camera
  is under 50 m (`npm run interior:views`). Program keys
  `interior-near-<name>`.
- **Golden**: `tests/browser/render-golden/near-grass.js`, through the
  Interior's `buildNearField`.

## Photographed layers and surfaces (`src/render/library/surfaces.js`)

CC0 photographs (Poly Haven, ambientCG; `docs/SWISS2-ASSETS.md` names each
with its source) under `assets/swiss2/`.

- **Inputs**: a size and anisotropy for the terrain layers; a name from
  `SURFACES` and an anisotropy for a surface.
- **Outputs**: `loadTerrainArrays(size, anisotropy)` two texture arrays,
  `col` (sRGB albedo) and `nrh` (normal in red and green, height in
  blue), one layer each of `LAYERS` in that order; `loadSurface(name,
  anisotropy)` `{ col, nrm, arm }`, repeating, for a standard material
  whose uv is in world metres; `fetchBitmap(name)` a file decoded as data
  (no colour management, no premultiplication).
- **Perf**: nine layers in two samplers, however many a ground blends.
- **Golden**: `tests/browser/render-golden/photo-materials.js`: the
  arrays to the byte and every surface's files and settings.

## People (`src/render/library/people/figures.js`)

The Interior's people: a body of tapered limbs, chest, head and a cap or
a wide hat and pack, built once per pose and kit and drawn instanced,
each part coloured by its slot (`tint.js`): shirt, trousers, hat or
hair, with skin and boots their own. Warm in the thermal picture.

- **Inputs**: `makeFigures(THREE, { cap })`; then `set(list, ms)` with
  `{ x, y, z, heading, action, tint, seed, scale }` per person (heading
  clockwise from north, `action` one of walk, carryLong, stand, lookUp,
  sit, crouchTarp, takeDownAntenna, pushMotorcycle, ride; `seed` picks
  the kit, trousers and hat) and the clock in ms for the strides.
- **Outputs**: `{ group, meshes, set, stats(), dispose() }`; the map adds
  `group` to its scene.
- **Shape**: none drawn is collided; a person is what the room's line of
  sight looks for, and the Interior's checks (`people:route`) hold where
  they stand, not how they are drawn.
- **Perf**: one draw a pose and kit with anyone in it, plus the poles;
  a mesh nobody is in is not drawn. Program key `interior-slot-tint`.
- **Golden**: `tests/browser/render-golden/people.js`.

## Camp (`src/render/library/camp/`)

The Interior's insurgent camp, built from a layout record: four
shelters of poles and sagging tarps, a lattice mast with a dish on guy
wires that can come down, a solar panel, crates, drums, jerrycans,
sacks, a table, hammocks, the cooking fire with its smoke, the lookout's
tree platform, the trodden paths and the clearing's lamps and fill
light.

- **Inputs**: `buildCamp({ THREE, world, colliders, roofs, props,
  routes, worn, mark, name })`: `world.groundAt`; the map's collider list
  (`add`, `addPost`, `addTurnedBox`, `retire`, `restore`, `ax`) and roof
  records; the layout (`props`: middle, shelters, mast, fire, solar,
  crates, drums, hammocks, lookout, as the Interior's `CAMP_PROPS`); the
  routes people walk by id, which the clutter keeps off, and which of
  them are the camp's own loops (`worn`); the mark under a shelter's
  roof as `{ pixels, px }`.
- **Outputs**: `{ group, setCamp({ mark, tarp, mast, cold }),
  update(seconds), state(), frames, light, stats(), dispose() }`;
  `light.patch(material)` lights a map's own material (ground, people)
  by the camp's fill and lamps.
- **Shape**: solid as drawn: every pole a post, every roof a roof record,
  boxes for the solid stores; cloth, ropes and smoke are nothing a craft
  meets. The mast's solids are retired while it is down.
  `interior:collide` holds it (every drawn point within 0.3 m of a solid).
- **Perf**: a handful of draws a camp (solid, cloth, wear, mast, dish,
  fire, smoke puffs, ropes); up to eight lamps in one shader chunk.
- **Golden**: `tests/browser/render-golden/camp.js`, both camps,
  colliders and roofs included.

## Low instanced vehicles (`src/render/library/vehicles/instanced.js`)

The Interior's motorcycles and pickup: built to read from the air
through a camera ball (round wheels with dark tyres, a painted tank, a
long seat, the engine and pipe; a pickup's cab and bed), one instanced
mesh a kind, only the paint taking the instance's colour (`tint.js`),
the engine warm in the thermal picture.

- **Inputs**: `makeVehicles(THREE, { cap })`; `set(list)` with `{ kind,
  x, y, z, heading, tint }`, kind `motorcycle` or `pickup` (any other is
  skipped), heading clockwise from north.
- **Outputs**: `{ group, meshes, set, stats(), dispose() }`.
- **Shape**: none; the map collides what it needs (the Interior: none,
  they are small and moving).
- **Perf**: one draw a kind with any in it. Program key
  `interior-slot-tint`, shared with the people.
- **Golden**: `tests/browser/render-golden/interior-vehicles.js`.

## Buildings from footprints (`src/render/library/buildings/footprint.js`)

Itaipu's town raises each OpenStreetMap building from its footprint;
any map with footprint polygons can. Pure, no THREE.

- **Inputs**: a footprint `outer` ([x, z] points, closed or not) and an
  id for error messages; a ground function; a height; a style whose
  `spec` says the roof (`shape` hip, gable or flat, `slope`, `over` the
  eaves, `thick`, and the `key`, `material` and `surface` the map's
  meshes take). The map decides the style (Itaipu: `styleOf`).
- **Outputs**: `cleanRing` (wound positive, no repeated or straight
  corners), `rectOf` (the smallest rectangle), `rectRing`, `heightsOf`
  (`base` a little under the lowest corner, `plate`), `roofOf` (`rec`, a
  roofs.js record the roof is ground by, `faces` to draw, `gables`),
  `wallFaces`, `wallBoxes` (axis aligned collider boxes and the eaves'
  pieces), `triangulate` and `convexPieces` for flat roofs.
- **Shape**: every wall within 0.5 m of its box (`STRAY`), columns no
  narrower than 1 m (`COLUMN`) for a building turned off the axes; the
  roof is ground. `npm run itaipu:collide` holds it on every building of
  Itaipu's extract.
- **Golden**: `tests/browser/render-golden/footprint-buildings.js`.

## Photographic look and sun (`src/render/library/photolook.js`, `sun.js`)

The material kit every photographed map answers its builders with, and
the sun its shadows come from.

- **Inputs**: `makePhotoLook({ surfaces, marks, ground, heights })`:
  the loaded surfaces (`surfaces.js` `loadSurface`, by name), marks by
  name (the Swiss valley's lanpy; `{}` for a map with none), a ground
  material factory (or one that throws, for a map whose ground is its
  terrain's own), the heights' `{ texture, grid }` uniforms for the
  walls' weather. `makeSun(scene, q, dir, { color, irradiance })`: the
  quality tier (`shadows`, `id`, `field.shadowMap`, `field.shadowHalf`),
  the sun's direction, colour (linear) and irradiance.
- **Outputs**: the look's `material(name)`, `parts(name)`, `village()`,
  `buildingFinish(key)`, `buildingGroups({ glass, water })`; `worldUv`
  gives a geometry uvs in metres along its faces; `finishScene(scene,
  lit)` does that for every textured mesh and passes every material
  through the map's light injector. `makeSun` adds one light (two on
  High, the far one following the camera) to the scene and returns `{
  lights, update(focus, camera) }`, which snaps both to their texels.
- **Needs**: the kit's materials read `vS2World`, which a light injector
  declares: the Swiss valley's `makeLit`, or `lit.js`'s for a map with one
  sun (Itaipu, the Interior).
- **Errors**: a name nobody has said the finish of throws, naming this
  file, rather than drawing three's default white.
- **Program keys**: `s2-painted` and the rest the kit had before the
  move.
- **Golden**: `tests/browser/render-golden/photo-look.js`.

## Placing an asset on a map

Import it from `src/render/library/`, turn the map's own records into its
inputs, add what it returns to the map's scene, and dispose it with the
map. Then add the map's view of it to the family's golden, and run the
map's views and gameplay checks.

For example, a map that wants the scanned rocks decides where they lie by
its own rules and hands the library records:

```js
import { SHAPES, loadRocks, rockColliders, rockLevels } from '../../render/library/rocks.js';

const loaded = await loadRocks();
const rocks = myBoulderSites().map(({ x, z, size }, k) => ({
  x, y: groundAt(x, z) - 0.1 * size, z,
  q: new THREE.Quaternion().setFromAxisAngle(UP, k * 2.4),
  s: size, sy: 1, shape: k % SHAPES.length,
}));
for (const r of rocks) {
  for (const [kind, ...c] of rockColliders(r, loaded.scans, groundAt)) {
    if (kind === 'sphere') colliders.addSphere('rock', ...c);
    else colliders.add('rock', ...c);
  }
}
const levels = rockLevels({ loaded, rocks, nearR: 160, fade: 12, envMap, name: 'mymap' });
group.add(...levels.meshes);
// every frame: levels.update(camera); with the map: levels.dispose()
```

The map owns the sites, the ground, the collider list and the scene
graph; the library owns what a rock looks like, how it is drawn and the
shape a pilot can hit.
