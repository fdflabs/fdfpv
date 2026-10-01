# Avionics sensors: the camera as a sensor

Agent 2's half of docs/AVIONICS-HUD.md section 5: the SensorManager, the
picture it draws and the temperatures under its thermal modes. That file is
the interface and wins where the two disagree; what this file adds to it is
marked **proposed** and waits for the lead to take it into section 5.

| Part | File |
| --- | --- |
| SensorManager, its state and the numbers a detector reads | `src/avionics/sensors.js` |
| The picture: sources, modes, zoom, stabilisation, gain, the inset | `src/render/sensorview.js` |
| Every material's apparent temperature | `src/render/thermal.js` |
| The check | `scripts/sensor-check.js` (`npm run sensor:check`) |

## 1. The shell's side

What the lead's stub interface already had is kept exactly: `SENSOR_MODES`
(`eo`, `ir_wh`, `ir_bh`, `lowlight`, `fusion`, `contrast`), `ZOOM_LEVELS`,
`thermalMode(mode)`, `createSensorManager({ renderer, scene, camera })` with
`scene` a getter, `update(tS, dtS)`, `cycleMode`, `cycleZoom`, `toggleRec`,
`state`, and `pip`, now a 320 by 200 canvas (the panel's 16:10).

**Proposed, and needed for the main view to change at all:**

1. **`sensors.render(post)` in place of `view.post.render()`** in the frame
   loop while the Avionics HUD is up (`src/main.js`, the one line that draws
   the world). It draws the main view in `state.mode` and the inset. With
   the HUD down the shell keeps calling `view.post.render()` and nothing
   changes. Without this line neither the main view nor the inset is
   drawn: both come from `render`, not from `update`.
2. **`sensors.project(losW, out, aspect)`** for the HUD's boxes, the pitch
   ladder and the lead cue: a world direction to the main view's NDC (`x`,
   `y` in -1..1, y up, or null behind), through the zoom, the
   stabilisation's crop and its smoothed camera. Projecting through the raw
   camera puts a box beside its target at 2x and 4x and wherever the
   stabilisation is holding the picture still. `state.fovRad` is already
   the field after zoom and crop.
3. `sensors.setTracks(tracks.snapshot)` once (the snapshot is written in
   place): the inset boxes tracks itself, primary in corner brackets,
   dashed under 0.6 confidence, dimmed when stale, ghosts for `lost`.
4. `update(tS, dtS, video)` with fpvfail's `{ snow, lost }` when the shell
   has it: `healthy` goes false with a lost picture and the inset turns to
   snow; snow adds to `noise`.
5. Optional: `sensors.setMotorTemp(c)` with the hottest of
   `telemetry.state.motors[].tempC`, for the own craft's motor kind.

Other setters for the keys the lead binds: `setMode(m)`, `setZoom(z)`,
`setPipMode(m | null)` (null: the other band, below), `setExposure(ev |
null)` (null is auto), `setStab(on)`. `stats()` says what the last frame
drew (sources, scene draws, insets) and `dispose()` frees the targets.

## 2. The picture

Three sources, each drawn at most once a frame and shared by the main view
and the inset:

- **composed**: the map's own post chain into its composer's buffer
  instead of the screen. EO and fusion read it, so the main view keeps the
  map's look.
- **radiance**: the scene's raw light at a sensor's width (1280 for a main
  low light or acquisition view, 480 for an inset), with mipmaps.
- **thermal**: temperatures (section 3) at a 640 pixel core's width, with
  mipmaps. The water's visible mirror is skipped for this draw.

Plain EO (1x, no stabilisation, auto exposure) is the composer straight to
the screen, as before. A thermal main view never draws the composer.

| Mode | What it is |
| --- | --- |
| `eo` | The composer's picture; manual exposure in stops; digital zoom as a crop with the camera's sharpening (an unsharp mask that rings, adds nothing) |
| `lowlight` | Raw light amplified toward a mid grey (up to 600x), shot noise growing with the gain on the sensor's own pixels, colour mostly gone to a white green phosphor, lamps blooming from the mipmaps, a tube's vignette |
| `ir_wh`, `ir_bh` | Temperature through a gain window of mean minus 2 sigma to mean plus 3 (at least 6 C wide), NETD noise and a column pattern on the core's pixels; black hot inverted |
| `fusion` | The visible picture, colour drained by half, with what is hot painted over it and its edges drawn: hot is over both the scene's mean plus 3 sigma and the air plus 25 C, so sunlit concrete in a frame of water is not a fire |
| `contrast` | Acquisition: grey, its local mean (a mipmap about 40 source pixels across) taken out and the rest stretched |

Zoom crops every source the same way: at 4x a 640 core puts 160 of its
pixels across the screen. Stabilisation is electronic: a smoothed camera
(time constant 0.12 s) held inside an 8 % crop margin; each output ray is
turned into the real camera's frame and looked up there. Gain stages (1x1,
an 8x8 grid of the source's mipmaps) move toward each frame's at a 0.6 s
time constant, so a fire blows the thermal picture's gain out and it comes
back, as a real camera's does.

**The inset** shows the other band: white hot under a visible main view
(the owner's reference), EO under a thermal one (`setPipMode` overrides).
It leaves the GPU through a pixel pack buffer and a fence and is put into
the canvas a frame or two later, so the main view never waits on it; a
frame whose two readback slots are both in flight skips the inset.

## 3. Temperatures

Every material writes an apparent temperature (C / 100, half float) when
the thermal output is on, from what it is and what the frame does to it,
never from its visible colour:

- **kind**, a define on the material (`thermalKind(mat, kind)`): `ground`
  (look/ground.js hands its land cover: forest, field, soil and rock, town,
  and its wet margins and beds), `water`, `vegetation`, `hot` (a per
  vertex `thermal` attribute, 0..1 of 110 C, on engines and motors:
  render/attackers.js, the Striker's in render/strikercraft.js), `motor`
  (the own craft, `setMotorTemp`), `warm` (a lit window's pane). Undeclared
  is a built surface: concrete, asphalt, a roof.
- **the sun on it**: the direct light it received this frame, shadows
  included, read back from three's light loop over the sun's irradiance;
- **albedo**: what it does not reflect it absorbs;
- **time of day**: `scene.userData.timeOfDay` (Itaipu's look sets it).
  Weather: air 31 C by day and 22 C at night, the reservoir 27 C both, the
  clear sky at the zenith -14 C by day and -24 C at night;
- **emissivity**: metal (its metalness) and water at a grazing look show
  the sky they reflect;
- **emission**: an emissive material is heated by it (the night's lamps),
  an unlit one brighter than white is a light source;
- **the air**: a 9 km extinction length pulls distant surfaces to the air.

Passive surfaces by kind (C at full sun on black, by day; offsets by
night, sideways and facing the sky):

| Kind | Solar gain | Night, sideways | Night, facing up |
| --- | --- | --- | --- |
| built | 30 | +3 | -3 |
| soil and rock | 26 | -1 | -5 |
| field | 15 | -2 | -6 |
| forest, vegetation | 7 | -1 to -1.5 | -2.5 to -4 |
| hot skin | 12 | -1 | -4 |

Fire is 200 C per unit of its light up to 800; smoke a little over the air
and thin (a third of its visible alpha); spray at the water's temperature,
half as thick.

**How a material gets there.** Built in materials, made anywhere at any
time, carry the output through ShaderChunk patches applied when thermal.js
is imported (sensors.js imports it, and main.js imports sensors.js before
anything draws); the uniforms are Float32Arrays shared by reference through
ShaderLib, so the mode costs no program change. A ShaderMaterial declares
its output with `thermalShader(mat, glsl, name)`, GLSL that sets `float
thT` (and optionally `float thA`, a factor on its alpha). The check fails
on any drawn ShaderMaterial without one. Parts built without a three import
(itaipu/water, itaipu/dam) get both through `ctx.mats.thermal`.

## 4. What a detector gets (`state.detect`, proposed for section 5.1)

PerceptionAI reads, every frame:

```
state.timeOfDay  'day' | 'night'
state.noise      0..1, the picture's noise (mode, time, zoom, snow)
state.detect = {
  sensor     'EO' | 'IR'     provenance for its detections (fusion is IR)
  pxPerRad   detector pixels per radian after zoom
  light      0..1, the visible light the band has (1 for thermal bands)
  contrast   0..1, how far a drone stands out of its background
  quality    0..1, min(1, 4 light) * contrast * (1 - noise), 0 unhealthy
}
```

`pxPerRad` is `min(native, 640 * zoom) / field`: a detector looks through a
640 pixel input, so zoom brings more of the sensor's own pixels onto a
target until the crop has none left (native 1920 EO, 1280 low light, 640
thermal). Zoom raises apparent size; past the native pixels it adds none.

| Mode | contrast day / night | light day / night | noise day / night |
| --- | --- | --- | --- |
| eo | 0.75 / 0.12 | 1 / 0.06 | 0.04 / 0.35 |
| contrast | 0.85 / 0.15 | 1 / 0.06 | 0.08 / 0.40 |
| lowlight | 0.60 / 0.50 | 1 | 0.12 / 0.30 |
| ir_wh, ir_bh | 0.60 / 0.95 | 1 | 0.08 |
| fusion | 0.80 / 0.95 | 1 | 0.08 / 0.10 |

Zoom adds 0.06 of noise a step. So thermal finds a hot drone at night far
better than EO (quality 0.87 against 0.02), and by day EO and fusion lead
(0.72 and 0.74 against white hot's 0.55).

## 5. Cost and the check

`SIM_GPU=1 node scripts/sensor-check.js OUT_DIR` (outside the repository)
parks the camera over Itaipu with a Striker 40 m ahead, by day and at
night, routes the frame through `render(post)` and reads each mode back
from the canvas. It fails unless: the engine is brighter than the ground
in white hot and darker in black hot; an explosion is white; low light is
noisy; 4x zoom has less detail per pixel than 1x; every drawn
ShaderMaterial has a thermal output; the inset is drawn with its red track
box; and each mode stays within section 13 at High (GPU under 12 ms, the
least of 40 frames, and at most 300 draw calls). It writes the pictures,
the inset's too, and sensor.json with every number.

Measured 2026-10-01 at 1600x900 on the shared desk GPU (other agents'
browsers running, so medians are noisy; the least frame is the comparable
number), inset on:

| Frame | GPU least, day / night | Calls, at most |
| --- | --- | --- |
| plain EO, composer only, no inset | 2.8 / 4.2 ms | 174 / 178 |
| eo + IR inset | 3.8 / 5.4 ms | 240 / 246 |
| ir_wh + EO inset | 0.6 / 3.9 ms | 222 / 228 |
| ir_bh + EO inset | 0.6 / 2.8 ms | 222 / 228 |
| lowlight + IR inset | 2.7 / 4.2 ms | 222 / 228 |
| fusion + EO inset | 5.3 / 4.9 ms | 240 / 246 |
| contrast + IR inset | 1.9 / 3.9 ms | 222 / 228 |

The inset's thermal draw adds about 60 calls: no shadow maps (the frame's
first draw made them) and no water mirror. A thermal main view is cheaper
than the photo chain it replaces.
