# The Alps: art direction, budgets and ownership

The valley in `src/maps/alps.js` is the wing's showcase world. The bar
is a world a player would pay for: coherent, hand placed where it
matters, procedural where it does not, and never obviously a box with a
hat on it. This page is the brief every part is built against.

## The look

The whole simulator is cel shaded: flat colour bands, a rim light, an
ink outline pass, the cloud shadow drifting over everything. The town
(`src/maps/city/`) is the reference for finish: low polygon, clean
silhouettes, small details that read at ten metres (a vending machine,
a bicycle, a road mirror) and colour that reads at three hundred (a red
roof, a white church, a yellow bus). The valley has to sit beside it
without looking like a different game.

Real reference, not invented: Lauterbrunnen and the Berner Oberland.
Chalets are Bernese: a stone or rendered ground floor, dark larch
boarding above, a low pitched roof with eaves out to a metre and a
half, carved bargeboards, a balcony the whole width of the sunny side,
shutters, geraniums, a woodpile under the eaves. Roofs are timber
shingle or dark slate, never terracotta. Barns are darker, steeper,
with a hay door in the gable. The church is white rendered with a
slate spire. Cars are what is in a Swiss village: a yellow PostAuto, a
few small hatchbacks, a tractor, a Subaru estate, a delivery van. The
strip has a hangar with a proper frame, a fuel pump, a windsock, a
parked light aircraft.

## What "worthy" means here, concretely

- Nothing floats and nothing sinks. Every foot stands on the ground it
  reads through `ctx.heightAt`, and a building on a slope has its
  foundation cut to the slope, not its roof cocked.
- Roofs cover walls. Slabs meet at a ridge; gables are closed; eaves
  overhang on all four sides; no wall shows above a roof and no slab
  hangs in the air. Look at a building from every side before shipping
  it: from above, from the street, from the air at cruise height.
- Silhouette first. A chalet, a barn, a church, a hangar and a bus are
  told apart at three hundred metres by outline and colour alone.
- Variation without noise. At least six chalet variants that differ in
  plan, height, roof and colour, placed with intent (a street, a square,
  farms out in the fields) rather than a grid. Same for trees: three
  species at least, each in several sizes.
- Detail that earns its triangles. A bench, a fountain in the square, a
  woodpile, a fence post, a cow bell, a road sign, a bridge over the
  stream. Small things that say someone lives here.
- Scale cues for a wing at twenty metres a second: fences, roads with
  markings, telegraph poles along the road, cars, the stream.
- The ink outline pass has to work on it. No coplanar faces fighting,
  no interpenetrating slabs, no back faces visible through a front.

## Budgets

The world has to run on a laptop at sixty frames a second on Low.

| What | Budget |
|---|---|
| World build stage on Low, 1600 by 900 | under 1500 ms (measured, see `src/maps/build-cost.js`) |
| Draw calls at the strip, excluding the craft | under 250 |
| Triangles in view at the strip | under 600,000 |
| Materials per baked group | one per surface colour, shared through `villageMaterials()` |
| Instances | anything repeated more than twenty times is an `InstancedMesh` |
| Textures | canvas painted, 2048 square at most, one per material, every texture keyed |

Bake, don't scatter: a building is pushed into a bake by material and
the village is drawn as one mesh per material. Trees and cattle are
instanced. Cars are the town's builders and stay separate meshes.

## Conventions

- Everything is authored at the origin on flat ground, along `+z` for
  length, and placed by the valley through `ctx`. A builder never reads
  a height; the placer does.
- Scene frame: x across the valley (west negative), y up, z along the
  valley (north negative). The strip is at the origin along z, the
  village to the west, the road to the east, the lake south at z 2150.
- `ctx` carries: `scene`, `heightAt(x, z)`, `valleyAxis(z)`, a seeded
  `rng` of the module's own, `colliders`, `mats`, `look`, `paint(fraction)`
  to let the loading bar breathe. Modules return what the title's stats
  print.
- A part never makes its own material. It asks `ctx.look.material(name,
  opts)` or `ctx.look.parts(name, opts)` (`src/maps/alps/look.js`), or
  takes one from `ctx.mats`, naming what the surface is and passing the
  cel options that are the cel look's whole answer. The same parts build
  swiss2 (`src/maps/swiss2.js`) in a photographic look that answers the
  same names with physically based materials, so a new surface needs a
  name there too, or swiss2 refuses to build.
- Colliders: `addBox('wall', ...)` per building, `addPost('tree', ...)`
  and `addSphere('canopy', ...)` for trees within seven hundred metres
  of the strip, `addPost('pole', ...)` for masts. Nothing beyond that
  radius; the hillside is the first thing a wing hits out there.
- Deterministic and seeded. The same valley on every load. No
  `Math.random`.
- No em dashes or en dashes anywhere. GPLv3 header on every file.
- The plant never reads these files. Nothing here is on the step clock
  except `updateAnim(stepMs)`, which moves things on the simulator's
  own clock so a replay sees the same world.

## Ownership

| Module | Owns | Does not touch |
|---|---|---|
| `src/maps/alps/terrain.js` | the valley's shape, its paint, its mesh, the range beyond, the lake basin | anything placed |
| `src/maps/alps/nature.js` | lake, stream and its banks, waterfalls, forests, boulders, meadow flowers, snow patches | buildings, roads, vehicles |
| `src/maps/alps/village.js` and `kit.js` | every building, the road, the street, the square, fences, poles, signs, bridges, the strip's furniture | trees, water, vehicles |
| `src/maps/alps/life.js` | cars, the PostAuto, tractor, parked aircraft, cattle, hikers, paragliders, the gondola, the windsock, anything that moves | terrain, buildings |
| `src/maps/alps.js` | the order of building, the ctx, the shell contract | the parts |

`ribbon.js` and `noise.js` are shared and change only by agreement.

## Checks every part runs before it is handed over

- `node --check` on every touched file.
- `node scripts/shots.js --airframe=wing1000 --graphics=low --url='/index.html?map=alps' ...`
  with `until:window.__map && window.__map().id === "alps" && window.__map().ready`,
  `eval:(document.getElementById("ui").style.visibility = "hidden", "")`
  and `eval:(window.__setCam(x, y, z, tx, ty, tz), "")` for every view that
  matters: from the street at eye height, from twenty metres up, from
  the air at a hundred and fifty metres and cruise. Zero console errors.
  Look at the pictures. A picture that looks wrong is a failing check.
- `npm run lint:memory` (every world lazy and freed).
- `node scripts/attract-check.js alps` (the title camera hits nothing).
- `npm run lint:copy`, `npm run lint:nouns`, `npm run strings:selftest`
  if a string was added (add it to `src/strings/en.js` and `es.js` both).
- The world stage from `window.__loading.timings.world`, three warm runs,
  written into `src/maps/build-cost.js` with the numbers.
- Draw calls and triangles read off `window.__renderStats` at the strip.

Do not run `npm run verify`: nothing here is physics.
