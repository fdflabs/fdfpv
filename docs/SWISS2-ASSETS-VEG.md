# Swiss2: vegetation and water

The second Swiss map, `swiss2`, is the alps valley (`src/maps/alps.js`,
`docs/ALPS-ART.md`) drawn to read as a photograph. This page covers the
part of it that grows and flows: the forests, the boulders, the meadow
under the camera, the lake, the stream and the waterfall. The render
pipeline (physical sky, image based light, tone mapping, terrain splat,
buildings) is built separately and calls the two builders here in place
of `src/maps/alps/nature.js`.

## What is built

| Builder | File | What |
|---|---|---|
| `buildVegetation(ctx)` | `src/maps/swiss2/vegetation/index.js` | Norway spruce, silver fir, larch, beech and sycamore at three levels of detail; scanned boulders at two; the meadow round the camera with its flowers |
| `buildWater(ctx)` | `src/maps/swiss2/water/index.js` | the lake with a planar mirror, the stream in its three runs, the headwall, the fall, its mist and spray, and the pool |

Both return `{ group, update(dtMs, camera), dispose(), stats }`. The map
adds `group` to its scene, calls `update` once a frame before it renders,
and `dispose` when the world is torn down.

Placement is nature.js's, rule for rule: the tree bands, the species
bands, the headwall and ledge, the stream's lines, the lake's shore
march and every exclusion zone. nature.js keeps those in closures inside
`buildNature`, so they are restated in `src/maps/swiss2/vegetation/zones.js`;
a change to one has to be made in the other. What nature.js built that
this does not: the jetty, the two boats, the reeds, the shore path and
the gravel track, and the old snow in the hollows. They are village and
terrain things in swiss2, and whoever owns those keeps or rebuilds them.

### Trees

- Ten variants: spruce (closed stand, young, open grown), fir (closed,
  open), larch (tall, open), beech (tall, open), sycamore. A tree in a
  closed stand is a forest grown variant with a bare lower trunk; one at
  a stand's edge or alone keeps its branches to the ground.
- Planted on a jittered grid (4.4 m on High) with the chance
  `forestDensity` gives, steepened so a stand closes where the density is
  high and its edge is sharp: 140,901 trees on High, 87,291 on Medium,
  48,853 on Low, against nature.js's 3,300.
- Near: the whole model, 900 to 3,800 triangles, foliage and bark as two
  instanced draws a variant. Mid: a third of the cards at twice the size,
  the trunk from the atlas's bark strip, one draw a variant, 140 to 350
  triangles. Far: one camera facing quad a tree, blending the four
  nearest of 24 views (8 round, 3 heights) photographed at load, with the
  crown's own normals so the far forest is lit by the same sun. The
  levels dissolve into each other over a fade band on a shared dither.
- Wind: the whole tree sways with the square of its height, gusting
  across the valley; branch tips flutter. The shadow pass runs the same
  vertex code.

### Ground cover

Three crossed cards a clump, from a grass atlas of photographed blades
with the Bernese hay meadow's flowers (buttercup, ox eye daisy, red
clover, harebell, wild carrot) painted over some. On 16 m tiles round the
camera, shrinking into the ground over the outer half of the radius, so
the terrain splat carries it beyond. Mown short on the village plateau,
knee high in the hay patches, thin under forest, short above the tree
line, none on rock, snow, water, the strip, the road, the street, the
square or the buildings.

### Water

three's standard material with the water spliced in, so the pipeline's
lights, image based light, shadows, fog and tone mapping reach it:
ripple normals from a wave texture made at load (three scales drifting
downwind on the lake, with calm patches; streaming downhill on the
stream), Fresnel at water's own index, colour and opacity from the depth
of water under each point, a foam line at the shore, white water on the
torrent, a churn at the fall's foot. The lake reflects a planar mirror of
the valley, rendered from `update()` when the lake is in view and within
two kilometres. The fall is a two layer sheet torn into streaks that
accelerate as they drop, over nature.js's headwall; mist and spray are
soft sprites cycling in the shader.

## Interface: what ctx carries

| Field | Needed | What |
|---|---|---|
| `scene` | water | the scene the lake's mirror renders |
| `renderer` | both | the WebGLRenderer: vegetation photographs its impostors with it at build, water renders the mirror with it |
| `quality` | both | `'low'`, `'medium'`, `'high'`, or a quality preset with that `id` |
| `heightAt(x, z)` | both | the alps heightfield, `buildHeightfield().height`, the triangles the terrain mesh draws |
| `envMap` | optional | the sky's image based light (PMREM or equirect texture). Without it three uses `scene.environment` |
| `rng` | optional | the vegetation's seeded rng, `makeRng(20260924)` by default |
| `colliders` | optional | a `Colliders`: trees within 700 m of the strip get a post (and beeches a canopy sphere), rocks and stones over half a metre a sphere, as nature.js does. 3,756 trees fall inside that radius on High (round 3) |
| `footprints` | optional | the buildings as `{ minX, minZ, maxX, maxZ }` boxes; the meadow keeps 2 m off each. Without them it keeps off a box round the village core |
| `gardens` | optional | the footprints that are houses, which get a garden tree or two; the rest (swiss2's hay huts) only keep the trees and the meadow off. Defaults to `footprints` |
| `margins` | optional | hand placed fence lines as `{ ax, az, bx, bz }` (swiss2's props give them); the meadow grows long, with the verge's weeds, a metre either side of each, as it does along the lines between the fields and on the road's verge |
| `grassTint` | optional | `[r, g, b]` multiplier for the meadow, to meet the terrain splat's grass where the meadow fades out |
| `windDir` | optional | `{ x, y }`, the direction the wind blows toward in the ground plane |
| `sunDir` | optional | a unit `Vector3` toward the sun. The trees are filled only where they or their shadows are in the camera's view; without it a tree behind the camera casts no shadow into the view |
| `mirrorHide` | optional | objects hidden while the lake's mirror renders (the preview hides the meadow) |
| `mistLight` | optional | a `Color`, the flat light the mist is drawn in (linear) |
| `layout` | optional | a shared `valleyLayout(heightAt, footprints)`, to work it out once for both builders |

Terrain constants (`LAKE_Y`, `TREE_LINE`, `POOL`, `valleyAxis`, `streamX`,
`forestDensity` and the rest) are imported from `src/maps/alps/terrain.js`
directly rather than passed.

What the pipeline must provide: the sun as the scene's first
`DirectionalLight` (the light through leaves and through the fall reads
`directionalLights[0]`'s direction; through leaves, the sun it adds is
what the light loop let reach the leaf, after every shadow),
`update(dtMs, camera)` on both before each render,
and shadow maps enabled if the trees should cast (every tree and rock
level casts, with depth materials that carry the wind and the alpha cut).
`ctx.sunDirection` is not read: the lights carry it.

## Budgets

Measured with `node scripts/swiss2-nature-preview.js --bench` on this box
(RTX 3060 Ti, headless Chromium on ANGLE GL), 1600 by 900, pixel ratio
one. GPU time is a timer query round the whole frame, which the box's
load cannot touch; the wall clock is printed too and is noisy, because the
box was running another session's test fleet (load average 28 on 20
cores). The preview's own frame (terrain, far range, sky and a 4096
shadow map) is 0.7 ms on its own; the numbers below are the whole frame,
counted over every pass (main, the mirror, and the shadow map, which
draws every tree and rock level again).

| Tier | Budget (whole frame in the preview) | Strip, eye height | 300 m over the forest | Lake shore | Waterfall |
|---|---|---|---|---|---|
| High | GPU under 6 ms, under 75 draws, under 4.5 M triangles | 3.9 ms, 36 draws, 1.2 M | 3.3 ms, 25, 1.0 M | 3.4 ms, 50, 2.8 M | 6.1 ms, 69, 4.2 M |
| Medium | GPU under 3.5 ms, under 65 draws, under 1.5 M | 2.9 ms, 30, 0.8 M | 2.4 ms, 25, 0.7 M | 3.0 ms, 41, 1.1 M | 3.4 ms, 61, 1.2 M |
| Low | GPU under 2.5 ms, under 50 draws, under 0.6 M | 2.2 ms, 25, 0.5 M | 2.1 ms, 21, 0.5 M | 1.7 ms, 16, 0.5 M | 2.0 ms, 45, 0.5 M |

The GPU numbers move by a third between runs on the same view (the
waterfall on High measured 4.6 ms and 6.1 ms in two runs ten minutes
apart), because other sessions' headless browsers share the GPU. Read
them as a range. The waterfall on High, in the dense forest under the
headwall with most of it in the full model band and the shadow map, is
the one view at or over its budget.

The tiers, from `TIERS` in the vegetation index and `WATER_TIERS` in the
water index:

| | High | Medium | Low |
|---|---|---|---|
| Forest grid | 4.4 m | 5.6 m | 7.5 m |
| Full model to | 70 m | 40 m | none |
| Reduced model to | 260 m | 170 m | 110 m |
| Impostor view | 128 px | 96 px | 64 px |
| Meadow radius, grid | 40 m, 0.42 m | 30 m, 0.48 m | none |
| Boulders, scanned near level to | 1,800, 160 m | 1,200, 90 m | 700, 50 m |
| Lake mirror | half resolution | a third | none, sky light only |
| Mist, spray | full | full | half, none |

GPU memory on High, from the sizes: the foliage atlas 22 MB with its
mips, the grass atlas 6 MB, the impostor atlases 45 MB plus 32 MB of
depth buffer their render targets keep, bark 3 MB, rocks 17 MB, the
headwall 11 MB, the waves 1.4 MB, the mirror 4 MB at 1600 by 900, instance
and geometry buffers about 15 MB: about 156 MB. The impostors' depth
buffers are only needed while photographing; freeing them means baking
through a small target and copying into the atlas, which is not done yet.

Build, on High in the preview: vegetation about 950 ms (atlas composition
510, models 50, impostor photographs 85, planting 250, rocks 70), water
about 200 ms. The alps world's Low budget is 1,500 ms for everything; on
Low vegetation is about 640 ms and water about 200 ms.

## Assets

All CC0 (Creative Commons Zero, public domain), from Poly Haven
(https://polyhaven.com/license). 1,623,790 bytes in all, against the
20 MB allowance.

| File | Bytes | Source | Authors | What was done |
|---|---|---|---|---|
| `assets/swiss2/vegetation/fir-twig.webp` | 215,382 | Fir Tree 01, `twig_diff` and `twig_alpha` 2k, https://polyhaven.com/a/fir_tree_01 | Rob Tuytel, Rico Cilliers | the seven twig sprays kept, the trunk strip and the bare branch masked out, cropped, 1024 square, alpha merged, colour dilated under the alpha, WebP 88 |
| `assets/swiss2/vegetation/bark-diff.webp` | 40,548 | Fir Tree 01, `bark_diff` 1k | Rob Tuytel, Rico Cilliers | 512 square, WebP 82 |
| `assets/swiss2/vegetation/bark-normal.webp` | 122,348 | Fir Tree 01, `bark_nor_gl` 1k | Rob Tuytel, Rico Cilliers | 512 square, WebP 90 |
| `assets/swiss2/vegetation/leaves.webp` | 42,412 | Island Tree 02, `leaves_diff` and `leaves_alpha` 1k, https://polyhaven.com/a/island_tree_02 | Rob Tuytel, Rico Cilliers | 512 square, alpha merged, colour dilated, WebP 88 |
| `assets/swiss2/vegetation/grass-blades.webp` | 57,610 | Grass Medium 02, `diff` and `alpha` 1k, https://polyhaven.com/a/grass_medium_02 | Rico Cilliers | 512 square, alpha merged, colour dilated, WebP 88 |
| `assets/swiss2/vegetation/rocks.glb` | 207,028 | Rock Moss Set 01, glTF 1k, https://polyhaven.com/a/rock_moss_set_01 | Kless Gyzen | in Blender 5.2: each of the six rocks centred, its base on zero, scaled to a metre across, decimated to 900 and to 160 triangles; positions, normals and uv only |
| `assets/swiss2/vegetation/rock-diff.webp` | 113,252 | Rock Moss Set 01, `diff` 1k | Kless Gyzen | WebP 84 |
| `assets/swiss2/vegetation/rock-normal.webp` | 220,844 | Rock Moss Set 01, `nor_gl` 1k | Kless Gyzen | WebP 90 |
| `assets/swiss2/vegetation/rock-arm.webp` | 74,648 | Rock Moss Set 01, `arm` 1k | Kless Gyzen | WebP 86 |
| `assets/swiss2/water/cliff-diff.webp` | 204,608 | Cliff Side, `diff` 1k, https://polyhaven.com/a/cliff_side | James Ray Cock, Jenelle van Heerden, Dario Barresi | nine tenths greyed toward its own luminance and lifted 15 per cent, toward the valley's limestone, WebP 84 |
| `assets/swiss2/water/cliff-normal.webp` | 325,110 | Cliff Side, `nor_gl` 1k | James Ray Cock, Jenelle van Heerden, Dario Barresi | WebP 90 |

Not shipped, made at load: the branch sprays, leaf clusters, grass clumps
and flowers (composed from the photographs above on a canvas,
`vegetation/atlas.js`), the impostor atlases (photographed from the
models, `vegetation/impostor.js`) and the water's wave texture
(`water/waves.js`).

The preview's sky is Alps Field, https://polyhaven.com/a/alps_field
(Andreas Mischok, CC0), the 2k HDR, fetched at run time and cached with
the CDN's files; it is not in the repository, and the pipeline chooses the
map's own.

Poly Haven's tree models themselves were not used: `fir_tree_01` is 7.8
million triangles and `pine_tree_01` 17 million, built for offline
rendering. Their twig and bark photographs are what a real time tree
needs.

## Checking it

    node scripts/swiss2-nature-preview.js [outDir] [--q=high|medium|low] [--views=a,b] [--bench] [--water=0] [--veg=0]

Renders on this machine's GPU unless `SIM_GPU=0`. Views: `forest-edge`,
`forest-300m`, `spruce-close`, `meadow-eye`, `grass-close`, `strip`,
`lake-shore`, `lake-200m`, `stream`, `torrent`, `waterfall`,
`waterfall-air`. The ground in the preview is the alps map's own painted
texture under a standard material, a stand in for the pipeline's splat,
and most of what looks wrong about it in the pictures is that.
