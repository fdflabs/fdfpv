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

**The sensor is the inset.** As in the owner's reference, the main view is
the pilot's own picture (the map's look, 1x, untouched) and the camera
block's inset is the sensor: `state.mode` (J), `state.zoom` (K), exposure
and stabilisation all apply to it, and `state.pipMode` is `state.mode`, so
the inset's label follows the mode. `state.mainView` (added) is `'eo'` by
default; `setMainView('sensor')` puts the sensor full screen (the `I` key;
the check uses it to measure every mode at full resolution), and the inset
is not drawn while it is.
`state.fovRad` is the sensor's field after zoom and crop.

The shell (src/main.js) now:

1. calls **`sensors.render(view.post)` in place of `view.post.render()`**
   while the Avionics HUD is up. It draws the main view and the inset;
   with the HUD down nothing changes;
2. hands `sensors.setTracks(tracks.snapshot)` once (written in place): the
   inset boxes tracks itself, primary in corner brackets, dashed under 0.6
   confidence, dimmed when stale, ghosts for `lost`;
3. calls `update(tS, dtS, video)` with fpvfail's `{ snow, lost }`: a lost
   picture makes the sensor unhealthy and the inset snow;
4. calls `setMotorTemp(c)` with the hottest of
   `telemetry.state.motors[].tempC`, for the motor kind (section 3).

`sensors.project(losW, out, aspect, view)` puts a world direction in a
view's NDC (`x`, `y` in -1..1, y up, or null behind): `view` 'main' or
'pip'; a view showing the sensor goes through its zoom, crop and smoothed
camera. Other setters: `setMode(m)`, `setZoom(z)`, `setExposure(ev |
null)` (null is auto), `setStab(on)`, `setMainView(v)`. `stats()` says
what the last frame drew and `dispose()` frees the targets.

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
| `ir_wh`, `ir_bh` | A FLIR Boson or Tau class core: the temperature through plateau histogram equalisation (128 bins from the mean less 3 sigma to the mean plus 4 or the frame's most if higher, at least 6 C wide, each bin clipped at 2.5 times its even share and raised to at least a fifth of it, the curve moving at the gain's pace), 80 % of the picture, and a linear window (mean less 2 sigma to mean plus 3) for the rest; or a manual span (`setThermalSpan(lo, hi)`). NETD 50 mK of temporal noise, a fixed column and pixel pattern, a quarter of the neighbouring pixels in each (the optics' MTF), and a mild halo round anything over 20 K hotter than its surroundings. White hot in its palette (`setThermalPalette`: `whitehot`, `ironbow`, `rainbow`); black hot inverted grey |
| `fusion` | The visible picture, colour drained by half, with what is hot painted over it and its edges drawn: hot is over both the scene's mean plus 3 sigma and the air plus 25 C, so sunlit concrete in a frame of water is not a fire |
| `contrast` | Acquisition: grey, its local mean (a mipmap about 40 source pixels across) taken out and the rest stretched |

The palette and the span are the sensor view's own (`src/render/sensorview.js`
exports `setThermalPalette` and `setThermalSpan`), not yet on
a key: binding one is the SensorManager's and the shell's (src/avionics,
src/main.js). No flat field correction freeze is drawn.

Zoom crops every source the same way: at 4x a 640 core puts 160 of its
pixels across the screen. Stabilisation is electronic: a smoothed camera
(time constant 0.12 s) held inside an 8 % crop margin; each output ray is
turned into the real camera's frame and looked up there. Gain stages (1x1,
an 8x8 grid of the source's mipmaps) move toward each frame's at a 0.6 s
time constant, so a fire blows the thermal picture's gain out and it comes
back, as a real camera's does.

**The inset** shows the sensor's mode. It never crosses to the main
thread: it is blitted into a corner of the drawing buffer (the corner set
aside first and put back after), the inset's 2D canvas draws that corner
GPU to GPU, and the track boxes go on top, all in the frame that drew it.
A main thread readback (getBufferSubData, even behind a passed fence) is
a blocking round trip to Chrome's GPU process that waits for the frame
before it, 2.3 to 6.6 ms a frame (docs/PERF.md). Only when the drawing
buffer is smaller than the inset (a phone on its side with the large
inset) does it fall back to that readback, through a pixel pack buffer
and a fence, a frame or two late; a frame whose two readback slots are
both in flight then skips the inset.

## 3. Temperatures

The thermal picture is what an uncooled long wave (8 to 14 um)
microbolometer sees: each surface's own temperature times its emissivity,
plus what it reflects, mostly the cold clear sky. Every material writes an
apparent temperature (C / 100, half float) when the thermal output is on,
from a physical model, never from its visible colour or its visible
transparency. All the numbers are in two tables in `src/render/thermal.js`,
`CLIMATE` and `SURFACE`, with their sources.

**The climate.** A map names one on its scene (`scene.userData.climate`;
none is Itaipu's). Day values are the hour the map is drawn at.

| Climate | Map | Air day / night | Water day / night | Clear zenith, day / night | Zenith window transmittance |
| --- | --- | --- | --- | --- | --- |
| itaipu | Itaipu, December | 31 / 22 C | 27 / 27 C | -5 / -14 C | 0.50 (humid) |
| alpine | swiss2, summer midday | 22 / 11 C | 17 / 17 C | -24 / -33 C | 0.75 (dry, thin) |
| interior | the Interior, afternoon | 34 / 23 C | 29 / 27 C | -6 / -17 C | 0.62 |

The sky warms from the zenith toward the air's temperature at the horizon
by the path length law: the window's transmittance along a slant is the
zenith's to the power of the air mass, and what it does not pass the air
emits. Every thermal frame reads its scene's `timeOfDay` and its sun's
elevation again, so a map whose sun moves (the Interior's `setLocalTime`)
cools into its night: the sun's loading is the light each surface gets this
frame (angle and shadow included) times the direct beam's transmittance at
the sun's air mass, and the night's cooling takes over as the sun goes down.

**The surfaces**, by the kind a material declares (`thermalKind(mat,
kind)`); undeclared is built. Solar: degrees over the air for a black
surface square to a full sun (the albedo, as solar absorptance, scales
it). Night: over the night air standing sideways, and how much further it
falls facing the open sky.

| Kind | What | Solar | Night sideways / facing up | Emissivity |
| --- | --- | --- | --- | --- |
| built | concrete, asphalt, roofs | 30 | +3 / -3 | 0.93 |
| ground: town | Itaipu's built land cover | 30 | +3 / -2 | 0.93 |
| ground: soil | bare soil, rock, scree, gravel | 26 | -1 / -5 | 0.94 |
| rock | boulders, wet rock | 24 | +2 / -2 | 0.94 |
| ground: field | grass, crops, meadow | 15 | -2 / -6 | 0.97 |
| vegetation | leaves, grass blades, trunks (transpiration) | 7 | -1.5 / -4 | 0.98 |
| ground: forest | Itaipu's forest land cover | 7 | -1 / -2.5 | 0.98 |
| glass | panes: opaque, reflect the sky | 8 | +1 / -3 | 0.86, falling at a grazing look |
| water | opaque skin at the climate's water | none | none | 0.98, falling at a grazing look |
| spray | spray, a falling veil, a wet film: water less 1 K, as thin as it looks | none | none | 0.98 |
| hot | engines and motors: a per vertex heat, 110 K a unit | 12 | -1 / -4 | 0.90 |
| motor | the own craft's bells, heated by `setMotorTemp` | 12 | -1 / -4 | 0.90 |
| body | people and cattle: skin at 34 C through clothes or hide, a per vertex coupling (clothes 0.6, head 0.85) | 5 | 0 / -1.5 | 0.98 |
| fire | a camp fire's embers | 600 C | | 1 |
| warm | a lit window's pane at night: 6 K over the air | | | 0.86 |

Metal (its metalness) lowers the emissivity further and shows the sky.
Water and glass are opaque whatever their visible alpha: a lake shows its
skin, never its bed, and a window the sky it reflects, never the room. The
pass under swiss2's lake that tints the bed by the water's visible
transmittance is left out of the thermal draw altogether (`thermalHide`).
A long path pulls a surface toward the path's own temperature (a 9 km
extinction length, the path 4 K under the ground's air).

Hot things: fire 600 C, the war's piston engine 110 K and a turbojet 275 K
over the skin around them, the Interior's motorcycle cylinder 60 K over and
a pickup's bonnet 27 K, an emissive material by its emission (the night's
lamp heads), an explosion 200 C per unit of its light up to 800, added over
what is behind it. A lamp's visible glow has no halo in the long wave band:
only its fixture's housing, about 50 K over the night air. Smoke is a little
over the air and thin (a third of its visible alpha); spray at the water's
temperature, half as thick.

**How a material gets there.** Built in materials, made anywhere at any
time, carry the output through ShaderChunk patches applied when thermal.js
is imported (sensors.js imports it, and main.js imports sensors.js before
anything draws); the uniforms are Float32Arrays shared by reference through
ShaderLib, so the mode costs no program change. A ShaderMaterial declares
its output with `thermalShader(mat, glsl, name)`, GLSL that sets `float
thT` (and optionally `float thA`, a factor on its alpha). The check fails
on any drawn ShaderMaterial without one. Parts built without a three import
(itaipu/water, itaipu/dam) get both through `ctx.mats.thermal`. The output
also writes what drew each pixel (the kind, a ShaderMaterial's label, or the
clear sky) into its blue channel for `npm run thermal:physics`; nothing in
the picture reads it.

**The check.** `SIM_GPU=1 node scripts/thermal-physics-check.js OUT_DIR`
(`npm run thermal:physics`) parks the camera on Itaipu by day and night,
swiss2 by day and the Interior by day and night, reads the thermal source
back in floats and fails unless sunlit built surfaces are warmer than
vegetation and vegetation than water by day, water is warmer than the land
at night, the coldest of the sky is under the coldest of everything else,
people read 28 to 38 C, the war's engine and an explosion and the camp's
fire are hot, swiss2's lake does not change when its bed is hidden and its
skin is one temperature from above, every drawn ShaderMaterial on every
map has a thermal output, and the white hot picture through the gain is
neither flat nor clipped, ironbow and rainbow are in colour and a manual
span draws a picture.

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

Measured before thermal-true (PRs #454 and #458 have the current
numbers: a full screen ir_wh frame is now about 0.8 ms least and 100
calls). Measured 2026-10-01 at 1600x900 on the shared desk GPU (other agents'
browsers running, so medians are noisy; the least frame is the comparable
number):

| Frame | GPU least, day / night | Calls, at most |
| --- | --- | --- |
| plain EO, composer only, no inset (before the sensor) | 2.3 / 2.5 ms | 174 / 176 |
| the HUD's default: EO main, white hot inset | 3.4 / 3.1 ms | 239 / 242 |
| sensor full screen, eo (inset the same) | 3.5 / 3.3 ms | 176 / 178 |
| ir_wh | 0.7 / 0.7 ms | 97 / 98 |
| ir_bh | 0.7 / 0.7 ms | 97 / 98 |
| lowlight | 2.2 / 1.8 ms | 158 / 160 |
| fusion | 4.8 / 3.7 ms | 240 / 243 |
| contrast | 1.7 / 2.8 ms | 158 / 160 |

The inset's thermal draw adds about 65 calls and a millisecond: no shadow
maps (the frame's first draw made them) and no water mirror. A full screen
thermal view is cheaper than the photo chain it replaces.

Since the `I` key, a full screen sensor draws no inset, and the inset has
three sizes (`U`, `INSET_SIZES`: 320x200, 480x300, 640x400). Measured
2026-10-01 the same way, EO main with the white hot inset, GPU least, day
/ night: small 4.13 / 2.58 ms, medium 3.56 / 4.16 ms, large 3.18 / 3.23
ms, at most 238 / 241 calls at every size. The spread is the shared desk
GPU's noise: the inset's pixels are a small share of a frame either way.
