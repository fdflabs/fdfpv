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

| Family | In the library | Built today in | Used by |
| --- | --- | --- | --- |
| Lit tree crowns (analytic ellipsoid crowns, lobes, clumps) | `crowns.js` (moving, see below) | `src/maps/interior/trees.js` | Interior |
| Broadleaf and conifer models, leaf cards | not yet | `src/maps/swiss2/vegetation/species.js`, `plantmat.js` | Swiss valley, Itaipu |
| Tree impostors (far trees) | not yet | `src/maps/swiss2/vegetation/impostor.js` | Swiss valley, Itaipu |
| Far forest canopy surface | not yet | `src/maps/itaipu/vegetation/draw.js` `canopyShell` | Itaipu |
| Grass and leaf atlas | not yet | `src/maps/swiss2/vegetation/atlas.js` | Swiss valley, Itaipu, Interior |
| Turf and near grass | not yet | `swiss2/vegetation/grass.js`, `itaipu/look/ground.js` `makeTurf`, `interior/nearfield.js` | one each |
| Ground cover materials | not yet | each map's `ground.js` / `look/ground.js` | one each |
| Water edges, streams, silt | not yet | `interior/ribbons.js`, `swiss2/water/`, `itaipu/water/`, `alps/nature.js` | one each |
| Rocks | not yet | `swiss2/vegetation/rocks.js`, `swiss2/rock/`, `alps/nature.js` | Swiss valley, Alps |
| People and postures | not yet | `src/render/interior/figures.js`, `swiss2/village/people.js`, `alps/fauna.js` | one each |
| Buildings and roofs | not yet | `alps/kit.js`, `alps/roofs.js` (shared), `interior/built.js`, `itaipu/town/` | all four |
| Fences | not yet | `alps/kit.js`, `swiss2/village/pieces.js`, `interior/yards.js` | one each |
| Vehicles | not yet | `alps/vehicles.js` (shared with the Swiss valley), `src/render/interior/vehicles.js` | three |
| Camp and props | not yet | `src/render/interior/camp.js`, `swiss2/props/`, `alps/kit.js` | one each |
| Lit materials (the sun and cloud shadow patch) | not yet | `itaipu/look/light.js` `makeLit`, `swiss2/light.js` | Itaipu, Interior; Swiss valley |

The Alps keep their cel look by decision (2026-10-07): their kit, roofs and
noise are the base the Swiss valley is built on and stay where they are
until a family that uses them moves.

## Lit tree crowns (`src/render/library/crowns.js`)

A crown is an ellipsoid, `r` across and `ry` up, drawn as a lumpy
icosahedron (or, far off, one point) and shaded in the fragment as the
ellipsoid it stands for: a pixel is kept only where the camera's ray meets
the ellipsoid less a few decimetres where its lobes and clumps go in, and
lit by that surface's normal, dark under, lit and warmer on top, broken
into big lobes and, close up, clumps of leaves, rimmed by the low sun.

- **Inputs**: per crown its middle, `r`, `ry`, a colour (the map's palette)
  and a seed in [0, 1); per tier the hand over distances.
- **Outputs**: `crownGeometry(THREE, detail, lump)` the ball,
  `fitOf(geometry)` the scale that has the ball straddle the ellipsoid,
  `crownMaterial(THREE, mode, uniforms)` the material for a tier: 0 near
  balls, 1 mid balls (hand their trees to the points), 2 one point a tree,
  3 one point a block of forest. Balls are instanced (instance matrix =
  middle and radii, instance colour), points carry `position`, `color`
  and `aShape` (r, ry, seed).
- **Shape**: nothing is drawn outside the ellipsoid, and at most 0.58 m
  inside it. `scripts/canopy-los.js` allows the drawn crowns 0.6 m from the
  crowns the Interior's line of sight (`canopyBlocks`) tests.
- **Perf**: one draw call a tier; 80 triangles a near crown, 20 a mid one,
  one point a far tree. The Interior's tiers fit its views' budget with the
  forest drawn (`npm run interior:views`, stats.json).
- **Golden**: `tests/browser/render-golden/interior-trees.js`.

## Placing an asset on a map

Import it from `src/render/library/`, turn the map's own records into its
inputs, add what it returns to the map's scene, and dispose it with the
map. Then add the map's view of it to the family's golden, and run the
map's views and gameplay checks.
