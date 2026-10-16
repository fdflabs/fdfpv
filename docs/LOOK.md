# Look parameters

What a world can hand the shared renderer to set its own sky, air and
grade, without touching the chain. There are two chains: the cel one
(src/render/post.js, the alps, the title and the `peers` and `alps-low`
rows) and the photographic one (src/maps/swiss2/post.js
buildPhotoComposer, which the Swiss valley, Itaipu and the Interior all
draw through). Every parameter defaults to the chain as it was before it
was a parameter: a world that hands nothing draws the same pixels.

Each change to these is judged with `npm run look:views OUT_DIR`
(scripts/look-views.js: three fixed views of each of the four worlds,
`--worlds=` and `--graphics=` to narrow it; run it through run-check.sh
so it draws on GPU 1) and measured with
`perf --scenarios=peers,itaipu-stream --mode=quality --budgets` at each
preset against docs/BUDGETS.md.

## The cel sky: `skyDome({ sun, horizon, zenith })`

src/render/scene.js. Set by the cel world's stage (src/maps/alps.js).

| Field | Default | What it is |
| --- | --- | --- |
| `sun` | (0.60, 0.50, 0.62), normalised | Unit vector toward the sun. Hand it the direction the world's light and shadows come from, or the disc and the shadows disagree. |
| `horizon` | 0xf2e3cb | The band at the horizon. Hand it the world's fog colour, so a far ridge fades into the sky behind it. |
| `zenith` | 0x6ea3d8 | The sky overhead. |

The alps hand `sun: SUN_DIR, horizon: HORIZON`. Pinned by render:golden
`scene` (sky, picSky*), which builds the dome with its defaults.

## The cel air and grade: `attachComposer(shell, map, q, look)`

src/render/post.js `CEL_AIR`. Set by the world's `compose`.

| Field | Default | What it is |
| --- | --- | --- |
| `haze` | 0xffffff | The air's colour in front of a surface. |
| `hazeDistance` | 1000 | Metres over which 63 % of `hazeAmount` is reached. |
| `hazeAmount` | 0 (no air) | The most the air veils, 0 to 1. Drawn in the ink pass from the prepass depth: Medium and High only, Low keeps the world's fog alone. Never on the sky. |
| `warm` | [1.045, 1.010, 0.965] | White balance, a multiplier per channel. |
| `exposure` | 1 | Multiplier on the light before the grade. |
| `contrast` | 0 | A print's S curve on the display values, 0 to 1; black and white stay put. |
| `vibrance` | 0.22 | Saturation added most where there is least. |
| `vignette` | 0.16 | Edge darkening. |

The alps (src/maps/alps.js `ALPS_AIR`): `haze 0x8fa9c8, hazeDistance
4000, hazeAmount 0.4, contrast 0.35`. Pinned by render:golden `post`
(chains, resize: the uniforms at their defaults). Cost: the `peers` row,
no draw calls, GPU floor within run to run spread (2026-10-15).

## The photographic print grade: `air.grade`

src/maps/swiss2/post.js. A map's air (the object it hands
buildPhotoComposer: swiss2's `AIR`, Itaipu's look/sky.js `AIR` and
`AIR_NIGHT`, the Interior's) may carry `grade`, applied after the print's
slope, before the vignette.

| Field | Default | What it is |
| --- | --- | --- |
| `saturation` | 1 | Saturation about the lightness. |
| `white` | [1, 1, 1] | White balance on the display values. |
| `lift` | [0, 0, 0] | Tints the shadows toward this, leaving white white. |

The pass compiles the grade in only when `air.grade` is set, so a world
without one pays nothing. With one: a handful of operations a pixel in a pass
already drawn, no draw call. The uniforms (`uSaturation`, `uWhite`,
`uLift` on `post.grade.material.uniforms`) can be moved at run time, as
the Interior's hour moves its own grade; that grade is today a full
screen pass of its own (src/maps/interior/look.js GRADE) and could fold
into this one. No world sets a grade yet.

The rest of a photo world's air (haze, beta, scaleHeight, mie, exposure,
meterKey, contrast, slope, spread, slopeMax, pivot) is documented where
it is defined, swiss2/post.js `AIR`.
